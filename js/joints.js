// Dovetail "stitching" along seams and cut lines, piece splitting, and per-piece placement.
//
// Joint profile (J.pts): open path in a cell frame, x normalised to [0,1] (scaled by J.w), y in model units, first
// point (0,0), last point (1,0). It is applied to every piece edge in that piece's own frame: paper below the line,
// y > 0 = outward from the piece. The cell is repeated by translation; a cell symmetric under 180deg rotation (tab + socket) makes mating edges interlock.
window.FTM = window.FTM || {};
(function () {
  const J = FTM.joints = {};

  // default cell: a simple dovetail tab above the edge (paper below the line)
// unit cell x in [-.5,.5] shown as [0,1]: neck at +-.25, head at +-.45, height .4
J.DOVETAIL = [[0, 0], [0.25, 0], [0.25, 0.1], [0.05, 0.2], [0.05, 0.4], [0.95, 0.4], [0.95, 0.2], [0.75, 0.1], [0.75, 0], [1, 0]];
J.defaults = () => ({ on: true, w: 1, margin: 0.5, pts: J.DOVETAIL.map(p => p.slice()) });
// earlier defaults, migrated to the current one when found in saved state
J.OLD_DEFAULTS = [JSON.stringify([[0, 0], [0.35, 0], [0.25, 0.3], [0.75, 0.3], [0.65, 0], [1, 0]]), JSON.stringify([[0, 0], [0.2, 0], [0.15, 0.3], [0.35, 0.3], [0.3, 0], [0.7, 0], [0.65, -0.3], [0.85, -0.3], [0.8, 0], [1, 0]])];

  // outward unit normals of rail R (the piece interior lies toward rail O)
  J.railNormals = function (R, O) {
    const n = R.length, N = [];
    const tan = i => { const a = R[Math.max(0, i - 1)], b = R[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    let sg = 1; const mid = n >> 1;
    for (let k = 0; k < n; k++) {
      const i = mid + (k % 2 ? -1 : 1) * ((k + 1) >> 1);
      if (i < 0 || i >= n) continue;
      const dx = R[i][0] - O[i][0], dy = R[i][1] - O[i][1];
      if (Math.hypot(dx, dy) > 1e-9) { const p = tan(i); sg = (p[0] * dx + p[1] * dy) >= 0 ? 1 : -1; break; }
    }
    for (let i = 0; i < n; i++) { const p = tan(i); N.push([p[0] * sg, p[1] * sg]); }
    N.sg = sg; // +1: outward normal = rotate travel direction by +90deg (profile x runs along the rail), -1: profile x runs against it
    return N;
  };

  // Features along an edge of length L, in the piece's own frame (x right, y = outward), as [{s, y, follow}].
  // The cell is simply translated along the edge (same orientation every time). A cell that is symmetric under a
  // 180deg rotation (e.g. tab + socket) interlocks with the same rule applied to the neighbouring piece.
  // follow = the segment from the previous feature runs along the rail.
  J.layoutFeatures = function (L, jt) {
    const m = Math.min(jt.margin, 0.25 * L), avail = L - 2 * m;
    if (!jt.on || avail <= 0.5 * jt.w) return [{ s: L, y: 0, follow: true }];
    const nC = Math.max(1, Math.round(avail / jt.w));
    const w = avail / nC, sc = w / jt.w;
    const out = [{ s: m, y: 0, follow: true }];
    let prevY = 0;
    for (let c = 0; c < nC; c++) for (let k = 1; k < jt.pts.length; k++) {
      const y = jt.pts[k][1] * sc;
      out.push({ s: m + (c + jt.pts[k][0]) * w, y, follow: Math.abs(y) < 1e-12 && Math.abs(prevY) < 1e-12 });
      prevY = y;
    }
    out.push({ s: L, y: 0, follow: true });
    return out;
  };
  // same features for an edge whose profile x runs against the travel direction (s measured from the far end)
  function oriented(L, jt, reversed) {
    const f = J.layoutFeatures(L, jt);
    if (!reversed) return f;
    const n = f.length;
    return f.map((_, j) => ({ s: L - f[n - 1 - j].s, y: f[n - 1 - j].y, follow: j === 0 ? true : f[n - j].follow }));
  }

  function frameAt(R, N, S, s) {
    let lo = 0, hi = S.length - 1;
    if (s <= S[0]) return { p: R[0], n: N[0] };
    if (s >= S[hi]) return { p: R[hi], n: N[hi] };
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; }
    const u = (s - S[lo]) / ((S[hi] - S[lo]) || 1);
    const nx = N[lo][0] * (1 - u) + N[hi][0] * u, ny = N[lo][1] * (1 - u) + N[hi][1] * u, l = Math.hypot(nx, ny) || 1;
    return { p: [R[lo][0] * (1 - u) + R[hi][0] * u, R[lo][1] * (1 - u) + R[hi][1] * u], n: [nx / l, ny / l] };
  }

  // boundary of rail samples i0..i1 with the joint profile applied (sign +1 tab side / -1 socket side)
  function segmentPath(R, N, S, i0, i1, jt) {
    const L = S[i1] - S[i0];
    if (!jt.on || L < 1e-9) return R.slice(i0, i1 + 1);
    const s0 = S[i0], out = [R[i0]];
    let idx = i0 + 1, prevS = s0, prevY = 0;
    const h = L / Math.max(1, i1 - i0); // rail sample spacing
    for (const f of oriented(L, jt, N.sg < 0)) {
      const sA = s0 + f.s;
      if (f.s <= 1e-9 && f.y === 0) continue;
      if (!f.follow) { // resample the joint edge so it tracks the local normal of the rail
        const n = Math.min(200, Math.ceil((sA - prevS) / h - 1e-9));
        for (let k = 1; k < n; k++) {
          const u = k / n, fr = frameAt(R, N, S, prevS + (sA - prevS) * u), y = prevY + (f.y - prevY) * u;
          out.push([fr.p[0] + y * fr.n[0], fr.p[1] + y * fr.n[1]]);
        }
      }
      if (f.follow) while (idx <= i1 && S[idx] < sA - 1e-9) { if (S[idx] > prevS + 1e-9) out.push(R[idx]); idx++; }
      while (idx <= i1 && S[idx] <= sA + 1e-9) idx++;
      if (f.s >= L - 1e-9) out.push(R[i1]);
      else { const fr = frameAt(R, N, S, sA); out.push(f.y === 0 ? fr.p : [fr.p[0] + f.y * fr.n[0], fr.p[1] + f.y * fr.n[1]]); }
      prevS = sA; prevY = f.y;
    }
    return out;
  }

  // points on the straight cut A->B (inclusive); `out` = this piece's outward direction across the cut
  function cutPath(A, B, out, jt) {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-9) return [A, B];
    const rev = (-(B[1] - A[1]) * out[0] + (B[0] - A[0]) * out[1]) < 0;
    const pts = [A];
    for (const f of oriented(L, jt, rev)) {
      const u = f.s / L;
      if (f.s <= 1e-9 && f.y === 0) continue;
      pts.push([A[0] + (B[0] - A[0]) * u + out[0] * f.y, A[1] + (B[1] - A[1]) * u + out[1] * f.y]);
    }
    pts[pts.length - 1] = B;
    return pts;
  }

  const rotp = (p, c, s) => [c * p[0] - s * p[1], s * p[0] + c * p[1]];

  // strips -> pieces. ctx = { splits:{edge:[sampleIdx]}, joint, layout:{key:{x,y,rot}} }
  J.makePieces = function (strips, ctx) {
    const jt = ctx.joint, pieces = [];
    const cutsOf = j => { const st = strips[j]; return [...new Set((ctx.splits[j] || []).filter(c => c > 0 && c < st.N))].sort((a, b) => a - b); };
    const railPath = (st, which, i0, i1) => {
      const R = which === 'A' ? st.A : st.B, N = which === 'A' ? st.nA : st.nB, S = which === 'A' ? st.SA : st.SB;
      const mate = st.seams[which === 'A' ? 0 : 1].mate;
      if (mate === null || !jt.on) return R.slice(i0, i1 + 1);
      const bp = [...new Set([0, st.N, ...cutsOf(st.edge), ...cutsOf(mate)])].filter(i => i >= i0 && i <= i1).sort((a, b) => a - b);
      let out = [];
      for (let k = 0; k < bp.length - 1; k++) { const seg = segmentPath(R, N, S, bp[k], bp[k + 1], jt); out = out.concat(out.length ? seg.slice(1) : seg); }
      return out;
    };
    const fwdAt = (st, c) => {
      const a = st.A[c], b = st.B[c], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const p = [-dy / l, dx / l], c0 = Math.max(0, c - 1), c1 = Math.min(st.N, c + 1);
      const mx = st.A[c1][0] + st.B[c1][0] - st.A[c0][0] - st.B[c0][0], my = st.A[c1][1] + st.B[c1][1] - st.A[c0][1] - st.B[c0][1];
      const sg = p[0] * mx + p[1] * my >= 0 ? 1 : -1;
      return [p[0] * sg, p[1] * sg];
    };
    strips.forEach(st => {
      const cuts = cutsOf(st.edge), bounds = [0, ...cuts, st.N];
      for (let q = 0; q < bounds.length - 1; q++) {
        const i0 = bounds[q], i1 = bounds[q + 1];
        const label = 'P' + (st.edge + 1) + (cuts.length ? String.fromCharCode(97 + q) : '');
        const pA = railPath(st, 'A', i0, i1), pB = railPath(st, 'B', i0, i1);
        let outline = pA.slice();
        if (i1 < st.N) outline = outline.concat(cutPath(st.A[i1], st.B[i1], fwdAt(st, i1), jt).slice(1, -1));
        outline = outline.concat(pB.slice().reverse());
        if (i0 > 0) outline = outline.concat(cutPath(st.A[i0], st.B[i0], fwdAt(st, i0).map(v => -v), jt).slice(1, -1).reverse());
        const A = st.A.slice(i0, i1 + 1), B = st.B.slice(i0, i1 + 1);
        // local frame: chord along +x, centred on the bbox
        const n = A.length;
        const m0 = [(A[0][0] + B[0][0]) / 2, (A[0][1] + B[0][1]) / 2], m1 = [(A[n - 1][0] + B[n - 1][0]) / 2, (A[n - 1][1] + B[n - 1][1]) / 2];
        const ang = -Math.atan2(m1[1] - m0[1], m1[0] - m0[0]), ca = Math.cos(ang), sa = Math.sin(ang);
        const rot = p => rotp(p, ca, sa);
        let lo = outline.map(rot);
        const bb = FTM.bbox(lo), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
        const sh = p => [p[0] - cx, p[1] - cy];
        lo = lo.map(sh);
        const local = { outline: lo, A: A.map(rot).map(sh), B: B.map(rot).map(sh), w: bb.w, h: bb.h };
        local.paths = [{ layer: 'CUT', closed: true, pts: lo }];
        if (ctx.labels) local.paths.push(...FTM.labelPaths(label, local.A, local.B));
        const arc = (S) => S[i1] - S[i0];
        const pc = {
          key: st.edge + ':' + i0, edge: st.edge, i0, i1, N: st.N, id: pieces.length,
          label,
          flatErr: st.flatErr, length: { A: arc(st.SA), B: arc(st.SB) }, seams: st.seams, local,
          xf: null, rails: {}, paths: local.paths.map(p => ({ layer: p.layer, closed: p.closed, pts: [] })), bbox: null,
        };
        pc.apply = function () {
          const { x, y, rot: r } = pc.xf, c = Math.cos(r), s = Math.sin(r);
          const tf = p => [c * p[0] - s * p[1] + x, s * p[0] + c * p[1] + y];
          pc.local.paths.forEach((p, i) => { pc.paths[i].pts = p.pts.map(tf); });
          pc.rails = { A: pc.local.A.map(tf), B: pc.local.B.map(tf) };
          const b = FTM.bbox(pc.paths[0].pts);
          pc.bbox = b;
        };
        pc.toLocal = function (p) {
          const { x, y, rot: r } = pc.xf, c = Math.cos(-r), s = Math.sin(-r);
          return rotp([p[0] - x, p[1] - y], c, s);
        };
        pieces.push(pc);
      }
    });
    // default placement: stack, then apply any user placements
    const gap = pieces.length ? 0.3 * (pieces.reduce((s, p) => s + p.local.h, 0) / pieces.length) + 0.05 * Math.max(...pieces.map(p => p.local.w)) : 0;
    let yc = 0;
    for (const pc of pieces) {
      const def = { x: pc.local.w / 2, y: yc + pc.local.h / 2, rot: 0 };
      yc += pc.local.h + gap;
      pc.xf = Object.assign(def, ctx.layout[pc.key] || {});
      pc.apply();
    }
    return pieces;
  };
})();
