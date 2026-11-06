// Exporters: SVG, DXF (R12 ASCII), EPS. Input: pieces (with .paths in model units), settings {scale, unit, labels}.
// Output y axis points up (as in the on-screen panel); SVG flips it.
window.FTM = window.FTM || {};
(function () {
  const UNIT_PT = { mm: 72 / 25.4, in: 72, px: 1 };
  const f = x => (+x.toFixed(4)).toString();

  const CORNER = { mm: 0.2, in: 0.008, px: 0.75 }; // fillet radius in output units

  // drop repeated points (and the closing duplicate of a closed path)
  function clean(pts, closed, eps) {
    const out = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > eps);
    while (closed && out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
    return out;
  }
  // round every corner slightly: replace it by a quadratic arc of radius ~r, never using more than 45% of either side
  function round(pts, closed, r) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (!closed && (i === 0 || i === n - 1)) { out.push(p); continue; }
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ua = [(p[0] - a[0]) / la, (p[1] - a[1]) / la], ub = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
      const turn = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])));
      const c = Math.min(r * Math.tan(turn / 2), 0.45 * la, 0.45 * lb);
      if (c < 1e-3 * r) { out.push(p); continue; } // effectively straight
      const p0 = [p[0] - ua[0] * c, p[1] - ua[1] * c], p1 = [p[0] + ub[0] * c, p[1] + ub[1] * c];
      const m = Math.max(2, Math.ceil(turn / (Math.PI / 12)));
      for (let j = 0; j <= m; j++) {
        const u = j / m, v = 1 - u;
        out.push([v * v * p0[0] + 2 * u * v * p[0] + u * u * p1[0], v * v * p0[1] + 2 * u * v * p[1] + u * u * p1[1]]);
      }
    }
    return out;
  }
  // chain open strokes of one layer that meet end to end into single paths
  function chain(list, eps) {
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= eps, out = [];
    const left = list.map(p => p.pts.slice());
    while (left.length) {
      let cur = left.shift(), grown = true;
      while (grown) {
        grown = false;
        for (let i = 0; i < left.length; i++) {
          const q = left[i], h = cur[0], t = cur[cur.length - 1];
          if (near(t, q[0])) cur = cur.concat(q.slice(1));
          else if (near(t, q[q.length - 1])) cur = cur.concat(q.slice(0, -1).reverse());
          else if (near(h, q[q.length - 1])) cur = q.slice(0, -1).concat(cur);
          else if (near(h, q[0])) cur = q.slice(1).reverse().concat(cur);
          else continue;
          left.splice(i, 1); grown = true; break;
        }
      }
      const closed = cur.length > 2 && near(cur[0], cur[cur.length - 1]);
      out.push({ closed, pts: closed ? cur.slice(0, -1) : cur });
    }
    return out;
  }

  // Paths in output units: cuts (CUT outline and LABEL strokes) connected, de-duplicated and with corners rounded.
  function collect(pieces, cfg) {
    const k = cfg.scale, r = (CORNER[cfg.unit] || 0.75), paths = [];
    for (const pc of pieces) {
      const sc = pc.paths.map(p => ({ layer: p.layer, closed: p.closed, pts: p.pts.map(q => [q[0] * k, q[1] * k]) }));
      const bb = FTM.bbox(sc[0].pts), eps = 1e-7 * Math.max(bb.w, bb.h, 1e-9);
      const cut = sc.filter(p => p.layer === 'CUT'), lab = chain(sc.filter(p => p.layer === 'LABEL').map(p => ({ pts: clean(p.pts, false, eps) })), eps * 10);
      for (const p of cut) paths.push({ piece: pc.label, layer: 'CUT', closed: true, pts: round(clean(p.pts, true, eps), true, r) });
      for (const p of lab) paths.push({ piece: pc.label, layer: 'LABEL', closed: p.closed, pts: round(clean(p.pts, p.closed, eps), p.closed, r) });
      for (const p of sc) if (p.layer !== 'CUT' && p.layer !== 'LABEL') paths.push({ piece: pc.label, layer: p.layer, closed: p.closed, pts: p.pts });
    }
    const all = paths.filter(p => p.layer !== 'CENTER').flatMap(p => p.pts);
    const b = FTM.bbox(all.length ? all : [[0, 0]]);
    const pad = 0.02 * Math.max(b.w, b.h, 1);
    return { paths, b: { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad } };
  }

  FTM.toSVG = function (pieces, cfg) {
    const { paths, b } = collect(pieces, cfg), w = b.x1 - b.x0, h = b.y1 - b.y0;
    const u = cfg.unit === 'px' ? '' : cfg.unit;
    const sw = cfg.unit === 'in' ? 0.004 : cfg.unit === 'mm' ? 0.1 : 0.5;
    let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}${u}" height="${f(h)}${u}" viewBox="${f(b.x0)} ${f(-b.y1)} ${f(w)} ${f(h)}">\n`;
    s += `<g id="CUT" fill="none" stroke="#ff0000" stroke-width="${sw}" stroke-linejoin="round">\n`;
    for (const p of paths) {
      if (p.layer === 'CENTER') { s += `<path data-layer="CENTER" data-piece="${p.piece}" fill="none" stroke="none" stroke-width="0" d="${p.pts.map((q, i) => (i ? 'L' : 'M') + f(q[0]) + ' ' + f(-q[1])).join(' ')}"/>\n`; continue; }
      const d = p.pts.map((q, i) => (i ? 'L' : 'M') + f(q[0]) + ' ' + f(-q[1])).join(' ') + (p.closed ? ' Z' : '');
      s += `<path data-layer="${p.layer}"${p.layer === 'OVERLAP' ? ' stroke="#ff6600"' : p.layer !== 'CUT' ? ' stroke="#0000ff"' : ''} d="${d}"/>\n`;
    }
    s += '</g>\n';
    return s + '</svg>\n';
  };

  FTM.toDXF = function (pieces, cfg) {
    const paths = collect(pieces, cfg).paths.filter(p => p.layer !== 'CENTER');
    const g = (code, val) => `${code}\n${val}\n`;
    const layers = [...new Set(paths.map(p => p.layer))];
    let s = g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$ACADVER') + g(1, 'AC1009') + g(9, '$INSUNITS') + g(70, cfg.unit === 'mm' ? 4 : cfg.unit === 'in' ? 1 : 0) + g(0, 'ENDSEC');
    s += g(0, 'SECTION') + g(2, 'TABLES') + g(0, 'TABLE') + g(2, 'LAYER') + g(70, layers.length);
    layers.forEach((l, i) => { s += g(0, 'LAYER') + g(2, l) + g(70, 0) + g(62, l === 'CUT' ? 1 : l === 'OVERLAP' ? 30 : 5) + g(6, 'CONTINUOUS'); });
    s += g(0, 'ENDTAB') + g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES');
    for (const p of paths) {
      s += g(0, 'POLYLINE') + g(8, p.layer) + g(66, 1) + g(10, 0) + g(20, 0) + g(30, 0) + g(70, p.closed ? 1 : 0);
      for (const q of p.pts) s += g(0, 'VERTEX') + g(8, p.layer) + g(10, f(q[0])) + g(20, f(q[1])) + g(30, 0);
      s += g(0, 'SEQEND') + g(8, p.layer);
    }
    return s + g(0, 'ENDSEC') + g(0, 'EOF');
  };

  FTM.toEPS = function (pieces, cfg) {
    const { b } = collect(pieces, cfg), k = UNIT_PT[cfg.unit] || 1;
    const bb = [b.x0 * k, b.y0 * k, b.x1 * k, b.y1 * k];
    let s = `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: ${Math.floor(bb[0])} ${Math.floor(bb[1])} ${Math.ceil(bb[2])} ${Math.ceil(bb[3])}\n%%HiResBoundingBox: ${f(bb[0])} ${f(bb[1])} ${f(bb[2])} ${f(bb[3])}\n%%Creator: Flat Tube Maker\n%%EndComments\n`;
    s += `${f(k)} ${f(k)} scale\n1 0 0 setrgbcolor ${f(cfg.unit === 'in' ? 0.004 : cfg.unit === 'mm' ? 0.1 : 0.5)} setlinewidth 1 setlinejoin\n`;
    for (const p of collect(pieces, cfg).paths.filter(p => p.layer !== 'CENTER')) {
      s += (p.layer === 'CUT' ? '1 0 0' : p.layer === 'OVERLAP' ? '1 0.4 0' : '0 0 1') + ' setrgbcolor\nnewpath\n' + p.pts.map((q, i) => `${f(q[0])} ${f(q[1])} ${i ? 'lineto' : 'moveto'}`).join('\n') + (p.closed ? '\nclosepath' : '') + '\nstroke\n';
    }
    return s + 'showpage\n%%EOF\n';
  };

  FTM.download = function (name, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();
