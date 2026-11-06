// Teeth along the seams, piece splitting, and per-piece placement. Everything is built in strip coordinates (s,t)
// (see FTM.buildStrips) and only then mapped into the flat (FTM.flatPt) or into space (FTM.spacePt).
//
// Tooth (state.tooth): pts = open path [x, y], x as a fraction of the tooth width w (|x| <= 1/2), y >= 0 in model
// units, from (-1/2, 0) to (1/2, 0). With tw = tooth.w, on strip i (width w_i):
//   + edge: tooth(x,y) -> (x tw + k tw,            w_i/2 + y)
//   - edge: tooth(x,y) -> (+-x tw + (k + 1/2) tw, -w_i/2 - y)   (+ glide, - rotate)
// Only whole cells inside the piece are used: no teeth at the strip ends or across a split.
window.FTM = window.FTM || {};
(function () {
  const TT = FTM.teeth = {};

  // default: a dovetail centred on x = 0, neck +-1/4, head +-0.45, height 0.4
  TT.DOVETAIL = [[-0.5, 0], [-0.25, 0], [-0.25, 0.1], [-0.45, 0.2], [-0.45, 0.4], [0.45, 0.4], [0.45, 0.2], [0.25, 0.1], [0.25, 0], [0.5, 0]];
  TT.OVERLAP = 0.25; // arc length of the overlap flap past a split
  TT.defaults = () => ({ on: true, w: 1, D: 0.5, mode: 'glide', pts: TT.DOVETAIL.map(p => p.slice()) });

  // one tooth on side sd (+1 / -1) of a strip of width w, cell k, as (s,t) points in increasing s
  TT.toothST = function (tooth, w, sd, k) {
    const tw = tooth.w, g = sd < 0 && tooth.mode === 'rotate' ? -1 : 1, c = (sd > 0 ? k : k + 0.5) * tw;
    const pts = tooth.pts.map(([x, y]) => [c + g * x * tw, sd * (w / 2 + y)]);
    return g < 0 ? pts.reverse() : pts;
  };
  // cells k on side sd lying wholly within [s0, s1]
  TT.cells = function (tw, sd, s0, s1) {
    const off = sd > 0 ? 0 : 0.5, out = [];
    for (let k = Math.ceil(s0 / tw + 0.5 - off - 1e-9); (k + off + 0.5) * tw <= s1 + 1e-9; k++) out.push(k);
    return out;
  };

  // (s,t) polyline -> points that follow the strip: break at every curve sample and at most tw/24 apart
  function densify(st, pts, closed, step) {
    const out = [], S = st.S, m = pts.length;
    for (let j = 0; j < (closed ? m : m - 1); j++) {
      const a = pts[j], b = pts[(j + 1) % m];
      out.push(a);
      const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]), us = [];
      if (hi - lo > 1e-12) for (const s of S) if (s > lo + 1e-12 && s < hi - 1e-12) us.push((s - a[0]) / (b[0] - a[0]));
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
      for (let q = 1; q < n; q++) us.push(q / n);
      us.sort((x, y) => x - y).forEach(u => out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]));
    }
    if (!closed) out.push(pts[m - 1]);
    return out.filter((p, i) => !i || Math.abs(p[0] - out[i - 1][0]) + Math.abs(p[1] - out[i - 1][1]) > 1e-12);
  }
  TT.flat = (st, pts, closed, step) => densify(st, pts, closed, step).map(p => FTM.flatPt(st, p[0], p[1]));
  TT.space = (st, pts, closed, step) => densify(st, pts, closed, step).map(p => FTM.spacePt(st, p[0], p[1]));

  // edge of a piece on side sd over [s0, s1], in increasing s
  function edgeST(st, tooth, sd, s0, s1) {
    const t0 = sd * st.w / 2, out = [[s0, t0]];
    if (tooth.on) for (const k of TT.cells(tooth.w, sd, s0, s1)) out.push(...TT.toothST(tooth, st.w, sd, k));
    out.push([s1, t0]);
    return out;
  }

  const rotp = (p, c, s) => [c * p[0] - s * p[1], s * p[0] + c * p[1]];

  // strips -> pieces. ctx = { splits:{edge:[m]} (split at s = m tw/2), tooth, layout:{key:{x,y,rot}}, labels }
  // Each piece also lists its teeth as closed (s,t) polygons (pc.teeth), for the 3D view.
  TT.makePieces = function (strips, ctx) {
    const tooth = ctx.tooth, tw = tooth.w, step = tw / 24, pieces = [];
    strips.forEach(st => {
      const L = st.L, cuts = [...new Set(ctx.splits[st.edge] || [])].map(m => m * tw / 2).filter(s => s > 1e-9 && s < L - 1e-9).sort((a, b) => a - b);
      const bounds = [0, ...cuts, L];
      // each piece that is followed by a cut overlaps the next one: its plain (tooth-free) flap runs on past the cut
      const ov = bounds.map((b, q) => q > 0 && q < bounds.length - 1 ? Math.min(TT.OVERLAP, (bounds[q + 1] - b) / 2) : 0);
      for (let q = 0; q < bounds.length - 1; q++) {
        const s0 = bounds[q], s1 = bounds[q + 1], s1e = s1 + ov[q + 1], w2 = st.w / 2;
        const label = 'P' + (st.edge + 1) + (cuts.length ? String.fromCharCode(97 + q) : '');
        const outlineST = [...edgeST(st, tooth, 1, s0, s1), [s1e, w2], [s1e, -w2], ...edgeST(st, tooth, -1, s0, s1).reverse()];
        const teeth = [];
        [1, -1].forEach(sd => TT.cells(tw, sd, s0, s1).forEach(k => teeth.push(TT.toothST(tooth, st.w, sd, k))));
        const sv = densify(st, [[s0, 0], [s1e, 0]], false, step).map(p => p[0]);
        const A = sv.map(s => FTM.flatPt(st, s, w2)), B = sv.map(s => FTM.flatPt(st, s, -w2));
        const outline = TT.flat(st, outlineST, true, step);
        // local frame: chord along +x, centred on the bbox
        const n = sv.length, m0 = FTM.flatPt(st, s0, 0), m1 = FTM.flatPt(st, sv[n - 1], 0);
        const ang = -Math.atan2(m1[1] - m0[1], m1[0] - m0[0]), ca = Math.cos(ang), sa = Math.sin(ang);
        let lo = outline.map(p => rotp(p, ca, sa));
        const bb = FTM.bbox(lo), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
        const tf = p => { const r = rotp(p, ca, sa); return [r[0] - cx, r[1] - cy]; };
        lo = lo.map(p => [p[0] - cx, p[1] - cy]);
        const local = { outline: lo, A: A.map(tf), B: B.map(tf), w: bb.w, h: bb.h };
        local.paths = [{ layer: 'CUT', closed: true, pts: lo }];
        if (q > 0) local.paths.push({ layer: 'OVERLAP', closed: false, pts: [tf(FTM.flatPt(st, s0 + ov[q], w2)), tf(FTM.flatPt(st, s0 + ov[q], -w2))] }); // where the previous piece's flap ends
        local.paths.push({ layer: 'CENTER', closed: false, pts: sv.map(s => tf(FTM.flatPt(st, s, 0))) }); // invisible centre line, SVG only
        if (ctx.labels) local.paths.push(...FTM.labelPaths(label, local.A, local.B));
        const pc = {
          key: st.edge + ':' + Math.round(s0 / (tw / 2)), edge: st.edge, s0, s1, sv, id: pieces.length, label, teeth, local,
          xf: null, rails: {}, paths: local.paths.map(p => ({ layer: p.layer, closed: p.closed, pts: [] })), bbox: null,
        };
        pc.apply = function () {
          const { x, y, rot: r } = pc.xf, c = Math.cos(r), s = Math.sin(r);
          const tf = p => [c * p[0] - s * p[1] + x, s * p[0] + c * p[1] + y];
          pc.local.paths.forEach((p, i) => { pc.paths[i].pts = p.pts.map(tf); });
          pc.rails = { A: pc.local.A.map(tf), B: pc.local.B.map(tf) };
          pc.bbox = FTM.bbox(pc.paths[0].pts);
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
