// Curve sampling, Bishop (rotation-minimizing) frame, tube sweep, strip unfolding, layout.
window.FTM = window.FTM || {};
(function () {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a); return l > 1e-300 ? mul(a, 1 / l) : [0, 0, 0]; };
  FTM.vec = { sub, add, mul, dot, cross, len, norm };

  // fx,fy,fz: functions of t.  Returns {ts, P, T} with n+1 samples.
  FTM.sampleCurve = function (fx, fy, fz, t0, t1, n) {
    const ev = t => [fx(t), fy(t), fz(t)];
    const h = (t1 - t0) * 1e-5 || 1e-6;
    const ts = [], P = [], T = [];
    let prevT = null;
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n;
      const p = ev(t);
      if (!p.every(Number.isFinite)) throw new Error(`curve not finite at t=${t.toPrecision(4)}`);
      let d = sub(ev(t + h), ev(t - h));
      if (!d.every(Number.isFinite) || len(d) < 1e-12) d = prevT || [1, 0, 0];
      const tg = norm(d);
      ts.push(t); P.push(p); T.push(tg); prevT = tg;
    }
    return { ts, P, T };
  };

  // Double-reflection rotation-minimizing frame (Wang et al. 2008). U,V span the normal plane, T x U = V.
  FTM.bishopFrame = function (P, T, twistRad) {
    const n = P.length;
    const t0 = T[0];
    const ax = [Math.abs(t0[0]), Math.abs(t0[1]), Math.abs(t0[2])];
    const k = ax[0] <= ax[1] && ax[0] <= ax[2] ? 0 : ax[1] <= ax[2] ? 1 : 2;
    const e = [0, 0, 0]; e[k] = 1;
    let u = norm(sub(e, mul(t0, dot(e, t0))));
    let v = cross(t0, u);
    const c = Math.cos(twistRad), s = Math.sin(twistRad);
    u = add(mul(u, c), mul(v, s)); v = cross(t0, u);
    const U = [u], V = [v];
    for (let i = 0; i < n - 1; i++) {
      const v1 = sub(P[i + 1], P[i]), c1 = dot(v1, v1);
      let r = U[i], tt = T[i];
      if (c1 > 1e-24) {
        r = sub(r, mul(v1, 2 / c1 * dot(v1, r)));
        tt = sub(tt, mul(v1, 2 / c1 * dot(v1, tt)));
      }
      const v2 = sub(T[i + 1], tt), c2 = dot(v2, v2);
      if (c2 > 1e-24) r = sub(r, mul(v2, 2 / c2 * dot(v2, r)));
      // re-orthonormalize against the tangent to stop drift
      r = norm(sub(r, mul(T[i + 1], dot(r, T[i + 1]))));
      U.push(r); V.push(cross(T[i + 1], r));
    }
    return { U, V };
  };

  // Jacobian of (t,u,v) -> P + uU + vV is d + a u + b v (d = P'.T, a = U'.T, b = V'.T). Returns, per sample, the
  // half-plane {a u + b v + c < 0} of cross-section points where the tube has negative volume sign (past the centre
  // of curvature), oriented so that the sample's own sign convention is positive at the origin.
  FTM.negVolume = function (P, U, V) {
    const n = P.length, d = (A, i) => { const a = A[Math.max(0, i - 1)], b = A[Math.min(n - 1, i + 1)]; return mul(sub(b, a), 1 / (Math.min(n - 1, i + 1) - Math.max(0, i - 1) || 1)); };
    const raw = [];
    for (let i = 0; i < n; i++) {
      const N = cross(U[i], V[i]);
      raw.push({ c: dot(d(P, i), N), a: dot(d(U, i), N), b: dot(d(V, i), N) });
    }
    const cs = raw.map(r => r.c).sort((x, y) => x - y), sg = cs[cs.length >> 1] >= 0 ? 1 : -1;
    return raw.map(r => ({ a: r.a * sg, b: r.b * sg, c: r.c * sg }));
  };

  // Q[k][i] = P_i + x_k U_i + y_k V_i
  FTM.sweep = function (poly, P, U, V) {
    return poly.map(([x, y]) => P.map((p, i) => [
      p[0] + x * U[i][0] + y * V[i][0],
      p[1] + x * U[i][1] + y * V[i][1],
      p[2] + x * U[i][2] + y * V[i][2]]));
  };

  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // third vertex R of a triangle with |RP|=dP, |RQ|=dQ, on the left (side=+1) or right of P->Q
  function place(P, Q, dP, dQ, side) {
    const d = d2(P, Q);
    if (d < 1e-12) return [P[0] + dP, P[1]];
    const ux = (Q[0] - P[0]) / d, uy = (Q[1] - P[1]) / d;
    const a = (dP * dP - dQ * dQ + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, dP * dP - a * a));
    return [P[0] + a * ux - side * h * uy, P[1] + a * uy + side * h * ux];
  }

  // Unfold the ruled strip between rails a[], b[] (3D polylines) triangle by triangle.
  // side = +1/-1 chooses the mirror so the piece is seen from outside.
  FTM.unfoldStrip = function (a, b, side) {
    const n = a.length;
    const A = [[0, 0]], B = [[len(sub(b[0], a[0])), 0]];
    let maxErr = 0;
    for (let i = 0; i < n - 1; i++) {
      const a1 = place(A[i], B[i], len(sub(a[i + 1], a[i])), len(sub(a[i + 1], b[i])), side);
      const b1 = place(B[i], a1, len(sub(b[i + 1], b[i])), len(sub(b[i + 1], a[i + 1])), -side);
      A.push(a1); B.push(b1);
      // the other diagonal was not used for the unfolding: compare to measure non-flatness
      const l3 = len(sub(a[i], b[i + 1]));
      if (l3 > 1e-12) maxErr = Math.max(maxErr, Math.abs(d2(A[i], b1) - l3) / l3);
    }
    return { A, B, maxErr };
  };

  function polyArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; }
    return s / 2;
  }
  FTM.polyArea = polyArea;


  // If a closed polygon crosses itself, return the outline of the union of its positive-winding regions
  // (largest outer loop; dominant orientation counts as positive). Otherwise returns the input unchanged.
  FTM.resolvePolygon = function (input) {
    const n0 = input.length;
    if (n0 < 4) return input;
    const bb = FTM.bbox(input), size = Math.max(bb.w, bb.h, 1e-9);
    let pts = input.map(p => p.slice());
    if (polyArea(pts) < 0) pts.reverse();
    const n = pts.length;
    const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    // split every edge at proper crossings
    const split = pts.map(() => []);
    let any = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const a = pts[i], b = pts[(i + 1) % n], c = pts[j], d = pts[(j + 1) % n];
      const d1 = cr(a, b, c), d2 = cr(a, b, d), d3 = cr(c, d, a), d4 = cr(c, d, b);
      if (d1 * d2 < 0 && d3 * d4 < 0) {
        const t = d3 / (d3 - d4), u = d1 / (d1 - d2);
        const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        split[i].push([t, p]); split[j].push([u, p]); any = true;
      }
    }
    if (!any) return input;
    const key = p => Math.round(p[0] / size * 1e8) + ',' + Math.round(p[1] / size * 1e8);
    const verts = new Map(), P = [];
    const vid = p => { const k = key(p); if (!verts.has(k)) { verts.set(k, P.length); P.push(p); } return verts.get(k); };
    const edges = [];
    for (let i = 0; i < n; i++) {
      const seq = [pts[i], ...split[i].sort((x, y) => x[0] - y[0]).map(x => x[1]), pts[(i + 1) % n]];
      for (let k = 0; k < seq.length - 1; k++) {
        const u = vid(seq[k]), v = vid(seq[k + 1]);
        if (u !== v) edges.push([u, v]);
      }
    }
    const winding = q => { // nonzero winding number of the oriented input polygon about q
      let w = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if (a[1] <= q[1]) { if (b[1] > q[1] && cr(a, b, q) > 0) w++; }
        else if (b[1] <= q[1] && cr(a, b, q) < 0) w--;
      }
      return w;
    };
    const out = new Map();
    for (const [u, v] of edges) {
      const a = P[u], b = P[v], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const eps = Math.min(1e-6 * size, 0.05 * L), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const wl = winding([m[0] + eps * nx, m[1] + eps * ny]), wr = winding([m[0] - eps * nx, m[1] - eps * ny]);
      if (wl > 0 && wr <= 0) { if (!out.has(u)) out.set(u, []); out.get(u).push(v); }
    }
    // chain kept edges into loops, turning as far right as possible at shared vertices
    const loops = [];
    for (const [s0, list0] of out) {
      while (list0.length) {
        const loop = [s0]; let prev = s0, cur = list0.pop();
        for (let guard = 0; cur !== s0 && guard < 100000; guard++) {
          loop.push(cur);
          const nxt = out.get(cur);
          if (!nxt || !nxt.length) break;
          const ang = v => { const ax = P[cur][0] - P[prev][0], ay = P[cur][1] - P[prev][1], bx = P[v][0] - P[cur][0], by = P[v][1] - P[cur][1]; return Math.atan2(ax * by - ay * bx, ax * bx + ay * by); };
          let best = 0; nxt.forEach((v, i) => { if (ang(v) < ang(nxt[best])) best = i; });
          prev = cur; cur = nxt.splice(best, 1)[0];
        }
        if (cur === s0 && loop.length >= 3) loops.push(loop.map(i => P[i]));
      }
    }
    if (!loops.length) return input;
    loops.sort((x, y) => Math.abs(polyArea(y)) - Math.abs(polyArea(x)));
    return loops[0].map(p => [p[0], p[1]]);
  };

  function railLength3(r) { let s = 0; for (let i = 0; i < r.length - 1; i++) s += len(sub(r[i + 1], r[i])); return s; }

  function cumLen(r) { const S = [0]; for (let i = 0; i < r.length - 1; i++) S.push(S[i] + len(sub(r[i + 1], r[i]))); return S; }

  // Unfold one strip per polygon edge. Strips carry everything the later (joint / split / layout) stage needs.
  // Returns [{ edge, N, A, B, SA, SB, nA, nB, seams, flatErr }] with A,B = unfolded 2D rails, S* = 3D arclengths,
  // n* = outward unit normals of each rail in the flat.
  FTM.buildStrips = function (poly, closed, Q, U, V) {
    const m = poly.length;
    const nEdges = closed ? m : m - 1;
    const orient = polyArea(poly) >= 0 ? 1 : -1;
    const strips = [];
    for (let j = 0; j < nEdges; j++) {
      const k2 = (j + 1) % m;
      const a = Q[j], b = Q[k2];
      const dx = poly[k2][0] - poly[j][0], dy = poly[k2][1] - poly[j][1];
      const o2 = [orient * dy, -orient * dx]; // outward normal in the polygon plane
      const out3 = add(mul(U[0], o2[0]), mul(V[0], o2[1]));
      const n3 = cross(sub(b[0], a[0]), sub(a[1], a[0]));
      const side = dot(n3, out3) >= 0 ? 1 : -1;
      const un = FTM.unfoldStrip(a, b, side);
      const n = a.length;
      const m0 = [(un.A[0][0] + un.B[0][0]) / 2, (un.A[0][1] + un.B[0][1]) / 2];
      const m1 = [(un.A[n - 1][0] + un.B[n - 1][0]) / 2, (un.A[n - 1][1] + un.B[n - 1][1]) / 2];
      const ang = -Math.atan2(m1[1] - m0[1], m1[0] - m0[0]);
      const c = Math.cos(ang), s = Math.sin(ang);
      const rot = p => [c * p[0] - s * p[1], s * p[0] + c * p[1]];
      const A = un.A.map(rot), B = un.B.map(rot);
      strips.push({
        edge: j, N: n - 1, A, B, SA: cumLen(a), SB: cumLen(b),
        nA: FTM.joints.railNormals(A, B), nB: FTM.joints.railNormals(B, A),
        flatErr: un.maxErr,
        seams: [
          { rail: 'A', vertex: j, mate: closed || j > 0 ? (j - 1 + nEdges) % nEdges : null },
          { rail: 'B', vertex: k2, mate: closed || j < nEdges - 1 ? (j + 1) % nEdges : null },
        ],
      });
    }
    return strips;
  };

  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  FTM.bbox = bbox;
})();
