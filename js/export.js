// Exporters: SVG, DXF (R12 ASCII), EPS. Input: pieces (with .paths in model units), settings {scale, unit, labels}.
// Output y axis points up (as in the on-screen panel); SVG flips it.
window.FTM = window.FTM || {};
(function () {
  const UNIT_PT = { mm: 72 / 25.4, in: 72, px: 1 };
  const f = x => (+x.toFixed(4)).toString();

  function collect(pieces, cfg) {
    const k = cfg.scale;
    const paths = [];
    for (const pc of pieces) {
      for (const p of pc.paths) paths.push({ layer: p.layer, closed: p.closed, pts: p.pts.map(q => [q[0] * k, q[1] * k]) });
    }
    const all = paths.flatMap(p => p.pts);
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
      const d = p.pts.map((q, i) => (i ? 'L' : 'M') + f(q[0]) + ' ' + f(-q[1])).join(' ') + (p.closed ? ' Z' : '');
      s += `<path data-layer="${p.layer}"${p.layer !== 'CUT' ? ' stroke="#0000ff"' : ''} d="${d}"/>\n`;
    }
    s += '</g>\n';
    return s + '</svg>\n';
  };

  FTM.toDXF = function (pieces, cfg) {
    const { paths } = collect(pieces, cfg);
    const g = (code, val) => `${code}\n${val}\n`;
    const layers = [...new Set(paths.map(p => p.layer))];
    let s = g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$ACADVER') + g(1, 'AC1009') + g(9, '$INSUNITS') + g(70, cfg.unit === 'mm' ? 4 : cfg.unit === 'in' ? 1 : 0) + g(0, 'ENDSEC');
    s += g(0, 'SECTION') + g(2, 'TABLES') + g(0, 'TABLE') + g(2, 'LAYER') + g(70, layers.length);
    layers.forEach((l, i) => { s += g(0, 'LAYER') + g(2, l) + g(70, 0) + g(62, l === 'CUT' ? 1 : 5) + g(6, 'CONTINUOUS'); });
    s += g(0, 'ENDTAB') + g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES');
    for (const p of paths) {
      s += g(0, 'POLYLINE') + g(8, p.layer) + g(66, 1) + g(10, 0) + g(20, 0) + g(30, 0) + g(70, p.closed ? 1 : 0);
      for (const q of p.pts) s += g(0, 'VERTEX') + g(8, p.layer) + g(10, f(q[0])) + g(20, f(q[1])) + g(30, 0);
      s += g(0, 'SEQEND') + g(8, p.layer);
    }
    return s + g(0, 'ENDSEC') + g(0, 'EOF');
  };

  FTM.toEPS = function (pieces, cfg) {
    const { paths, b } = collect(pieces, cfg), k = UNIT_PT[cfg.unit] || 1;
    const bb = [b.x0 * k, b.y0 * k, b.x1 * k, b.y1 * k];
    let s = `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: ${Math.floor(bb[0])} ${Math.floor(bb[1])} ${Math.ceil(bb[2])} ${Math.ceil(bb[3])}\n%%HiResBoundingBox: ${f(bb[0])} ${f(bb[1])} ${f(bb[2])} ${f(bb[3])}\n%%Creator: Flat Tube Maker\n%%EndComments\n`;
    s += `${f(k)} ${f(k)} scale\n1 0 0 setrgbcolor ${f(cfg.unit === 'in' ? 0.004 : cfg.unit === 'mm' ? 0.1 : 0.5)} setlinewidth 1 setlinejoin\n`;
    for (const p of paths) {
      s += (p.layer === 'CUT' ? '1 0 0' : '0 0 1') + ' setrgbcolor\nnewpath\n' + p.pts.map((q, i) => `${f(q[0])} ${f(q[1])} ${i ? 'lineto' : 'moveto'}`).join('\n') + (p.closed ? '\nclosepath' : '') + '\nstroke\n';
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
