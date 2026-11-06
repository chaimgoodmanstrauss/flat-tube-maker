// Left panel: polygon editor (add / move / delete vertex), fixed origin at panel centre.
window.FTM = window.FTM || {};
(function () {
  FTM.fitCanvas = function (canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function segInter(p, q, r, s) {
    const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = o(p, q, r), d2 = o(p, q, s), d3 = o(r, s, p), d4 = o(r, s, q);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  FTM.selfIntersects = function (pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segInter(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
    return false;
  };

  FTM.PolyEditor = function (canvas, state, onChange) {
    const view = { s: 160 };     // pixels per unit; origin is always the panel centre
    let neg = [], mode = 'add', hover = -1, drag = -1, xform = null, xs = null;
    const undo = [];
    const poly = () => state.polygon;
    const toScr = (p, W, H) => [W / 2 + p[0] * view.s, H / 2 - p[1] * view.s];
    const toWorld = (x, y, W, H) => [(x - W / 2) / view.s, -(y - H / 2) / view.s];

    function size() { const r = canvas.getBoundingClientRect(); return [r.width, r.height]; }
    function mouse(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function hit(x, y) {
      const [W, H] = size(); const pts = poly().pts;
      for (let i = pts.length - 1; i >= 0; i--) { const s = toScr(pts[i], W, H); if (Math.hypot(s[0] - x, s[1] - y) < 11) return i; }
      return -1;
    }
    function nearestEdge(x, y) {
      const [W, H] = size(); const { pts } = poly(); const n = pts.length;
      let best = null;
      for (let j = 0; j < n; j++) {
        const a = toScr(pts[j], W, H), b = toScr(pts[(j + 1) % n], W, H);
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const d = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
        if (d < 9 && (!best || d < best.d)) best = { j, d };
      }
      return best;
    }
    function pushUndo() { undo.push(JSON.stringify(poly())); if (undo.length > 100) undo.shift(); }
    function remove(i) {
      if (poly().pts.length <= 2) return;
      pushUndo(); poly().pts.splice(i, 1); hover = -1; onChange();
    }

    canvas.addEventListener('contextmenu', e => { e.preventDefault(); const [x, y] = mouse(e); const i = hit(x, y); if (i >= 0) remove(i); });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const [x, y] = mouse(e), [W, H] = size(), P = poly();
      if (xform) {
        const w = toWorld(x, y, W, H), r = Math.hypot(w[0], w[1]);
        if (r < 1e-6) return;
        pushUndo(); xs = { a: Math.atan2(w[1], w[0]), r, pts: P.pts.map(p => p.slice()) };
        canvas.setPointerCapture(e.pointerId); return;
      }
      const i = hit(x, y);
      if (mode === 'delete') { if (i >= 0) remove(i); return; }
      if (mode === 'move' && i < 0) return;
      pushUndo();
      if (i >= 0) drag = i;
      else { // add
        const w = toWorld(x, y, W, H), np = w;
        const ed = nearestEdge(x, y);
        if (ed) { P.pts.splice(ed.j + 1, 0, np); drag = ed.j + 1; }
        else { P.pts.push(np); drag = P.pts.length - 1; }
        onChange();
      }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const [x, y] = mouse(e), [W, H] = size();
      if (xs) {
        const w = toWorld(x, y, W, H), r = Math.hypot(w[0], w[1]), da = xform === 'scale' ? 0 : Math.atan2(w[1], w[0]) - xs.a;
        const k = xform === 'rotate' ? 1 : Math.max(0.02, r / xs.r), c = Math.cos(da) * k, s = Math.sin(da) * k;
        poly().pts = xs.pts.map(p => [c * p[0] - s * p[1], s * p[0] + c * p[1]]);
        onChange();
      } else if (drag >= 0) {
        const w = toWorld(x, y, W, H);
        poly().pts[drag] = w;
        onChange();
      } else {
        const h = hit(x, y);
        if (h !== hover) { hover = h; draw(); }
      }
    });
    const end = () => { drag = -1; if (xs) { xs = null; api.setXform(null); } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { hover = -1; draw(); });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      view.s = Math.max(8, Math.min(5000, view.s * Math.exp(-e.deltaY * 0.0015)));
      draw();
    }, { passive: false });

    document.addEventListener('keydown', e => {
      if (/input|textarea|select/i.test(document.activeElement.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { api.undo(); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (hover >= 0) remove(hover); }
      else if (e.key === 'a') api.setMode('add'); else if (e.key === 'm') api.setMode('move'); else if (e.key === 'd') api.setMode('delete');
    });

    function draw() {
      const { ctx, w: W, h: H } = FTM.fitCanvas(canvas);
      ctx.fillStyle = css('--panel'); ctx.fillRect(0, 0, W, H);
      const ox = W / 2, oy = H / 2;
      // negative-volume region: cross-section points past the centre of curvature at some sample
      if (neg.length) {
        const R = Math.hypot(W, H) / 2 / view.s, hp = neg.filter(q => q.c < R * Math.hypot(q.a, q.b));
        if (hp.length) {
          const st = 3; ctx.fillStyle = 'rgba(220,60,60,.28)';
          for (let y = 0; y < H; y += st) {
            const v = -(y + st / 2 - H / 2) / view.s;
            for (let x = 0, run = -1; x <= W; x += st) {
              let bad = false;
              if (x < W) { const u = (x + st / 2 - W / 2) / view.s; for (const q of hp) if (q.a * u + q.b * v + q.c < 0) { bad = true; break; } }
              if (bad && run < 0) run = x; else if (!bad && run >= 0) { ctx.fillRect(run, y, x - run, st); run = -1; }
            }
          }
        }
      }
      // origin
      ctx.fillStyle = css('--axis'); ctx.beginPath(); ctx.arc(ox, oy, 4, 0, 7); ctx.fill();
      // unit scale bar (1, 2, 5 x 10^k units)
      const raw = 80 / view.s, e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
      const bar = (f < 2 ? 1 : f < 5 ? 2 : 5) * e;
      ctx.strokeStyle = css('--axis'); ctx.fillStyle = css('--axis'); ctx.lineWidth = 1.5; ctx.font = '11px system-ui';
      ctx.beginPath(); ctx.moveTo(12, H - 14); ctx.lineTo(12 + bar * view.s, H - 14);
      ctx.moveTo(12, H - 18); ctx.lineTo(12, H - 10); ctx.moveTo(12 + bar * view.s, H - 18); ctx.lineTo(12 + bar * view.s, H - 10); ctx.stroke();
      ctx.fillText(String(+bar.toPrecision(2)), 12, H - 22);
      // polygon: edges and vertices only
      const { pts } = poly(), n = pts.length;
      const bad = FTM.selfIntersects(pts);
      if (n) {
        const sp = pts.map(p => toScr(p, W, H));
        ctx.beginPath(); sp.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath();
        ctx.strokeStyle = bad ? '#d33' : css('--poly'); ctx.lineWidth = 1.5; ctx.stroke();
        sp.forEach((p, i) => {
          ctx.beginPath(); ctx.arc(p[0], p[1], i === hover || i === drag ? 6 : 4, 0, 7);
          ctx.fillStyle = css('--vertex'); ctx.fill();
        });
      }
      const warn = document.getElementById('polywarn');
      if (warn) warn.textContent = bad ? '\u26a0 polygon self-intersects' : '';
    }

    const api = {
      draw,
      setMode(m) { mode = m; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); canvas.dataset.mode = m; },
      setNeg(h) { neg = h; },
      setXform(m) { xform = m; document.querySelectorAll('[data-xf]').forEach(b => b.classList.toggle('on', b.dataset.xf === m)); },
      setPolygon(np, noUndo) { if (!noUndo) pushUndo(); state.polygon = np; onChange(); api.fit(); },
      undo() { const s = undo.pop(); if (s) { state.polygon = JSON.parse(s); onChange(); } },
      fit() {
        const [W, H] = size(); let mx = 0.25, my = 0.25;
        for (const p of poly().pts) { mx = Math.max(mx, Math.abs(p[0])); my = Math.max(my, Math.abs(p[1])); }
        view.s = 0.8 * Math.min(W / 2 / mx, H / 2 / my); draw();
      },
    };
    api.setMode('add');
    return api;
  };

  FTM.pieceColor = function (j, light) {
    const hue = (j * 137.5 + 20) % 360;
    return `hsl(${hue}, 60%, ${Math.round((light === undefined ? 0.6 : light) * 100)}%)`;
  };
})();
