// Tooth editor. Tooth coordinates (x, y): |x| <= tw/2, y >= 0, uniform scale. The master tooth (k = 0, editable) sits
// on the + edge of a preview strip -D < y < 0; its copies run along that edge at x + k tw, and along the - edge as
// (+-x + (k+1/2) tw, -y - D) (glide / rotate). Drag the dashed cell sides to change tw (the path's x scales with it,
// y does not), the dashed line at the tooth's top (outside the cell) to scale its height, and the lower edge of the
// strip to change D (preview only). Ticks at x = +-tw/4, y = 0 mark where the neck should meet the edge.
window.FTM = window.FTM || {};
(function () {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  FTM.ToothEditor = function (canvas, state, onChange) {
    const view = { s: 0 };
    let mode = 'add', hover = null, drag = null;
    const undo = [];
    const T = () => state.tooth;
    const size = () => { const r = canvas.getBoundingClientRect(); return [r.width, r.height]; };
    const org = () => { const [W, H] = size(); return [W / 2, 0.42 * H]; };
    const toScr = p => { const o = org(); return [o[0] + p[0] * view.s, o[1] - p[1] * view.s]; };
    const toWorld = (x, y) => { const o = org(); return [(x - o[0]) / view.s, -(y - o[1]) / view.s]; };
    const master = () => T().pts.map(([x, y]) => [x * T().w, y]);
    const mouse = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const clampPt = w => [Math.max(-0.5, Math.min(0.5, w[0] / T().w)), Math.max(0, w[1])];
    const height = () => Math.max(0, ...T().pts.map(p => p[1]));
    function hit(x, y) {
      const m = master();
      for (let i = m.length - 2; i >= 1; i--) { const s = toScr(m[i]); if (Math.hypot(s[0] - x, s[1] - y) < 11) return { v: i }; }
      const o = org();
      for (const sg of [-1, 1]) if (Math.abs(x - (o[0] + sg * T().w / 2 * view.s)) < 6) return { tw: sg };
      if (Math.abs(y - (o[1] + T().D * view.s)) < 6) return { D: 1 };
      if (height() > 0 && Math.abs(x - o[0]) > T().w / 2 * view.s && Math.abs(y - (o[1] - height() * view.s)) < 6) return { h: 1 };
      return null;
    }
    const pushUndo = () => { undo.push(JSON.stringify(T())); if (undo.length > 100) undo.shift(); };
    const del = i => { if (i > 0 && i < T().pts.length - 1) { pushUndo(); T().pts.splice(i, 1); hover = null; onChange(); } };

    function nearestSeg(x, y) {
      const p = master(); let best = null;
      for (let i = 0; i < p.length - 1; i++) {
        const a = toScr(p[i]), b = toScr(p[i + 1]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const d = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
        if (d < 10 && (!best || d < best.d)) best = { i, d };
      }
      return best;
    }

    canvas.addEventListener('contextmenu', e => { e.preventDefault(); const h = hit(...mouse(e)); if (h && h.v) del(h.v); });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const [x, y] = mouse(e), h = hit(x, y);
      if (h && !h.v) { pushUndo(); drag = h.h ? { h: 1, h0: height(), pts: T().pts.map(p => p.slice()) } : h; canvas.setPointerCapture(e.pointerId); return; }
      if (mode === 'delete') { if (h) del(h.v); return; }
      if (mode === 'move' && !h) return;
      pushUndo();
      if (h) drag = h;
      else {
        const sg = nearestSeg(x, y), at = sg ? sg.i + 1 : T().pts.length - 1;
        T().pts.splice(at, 0, clampPt(toWorld(x, y))); drag = { v: at }; onChange();
      }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const [x, y] = mouse(e), w = toWorld(x, y);
      if (drag && drag.v) { T().pts[drag.v] = clampPt(w); onChange(); }
      else if (drag && drag.tw) { T().w = Math.max(0.02, 2 * Math.abs(w[0])); onChange(); }
      else if (drag && drag.D) { T().D = Math.max(0.02, -w[1]); onChange(); }
      else if (drag && drag.h) { const k = Math.max(0.01, w[1]) / drag.h0; T().pts = drag.pts.map(([x, y]) => [x, y * k]); onChange(); }
      else {
        const h = hit(x, y), k = JSON.stringify(h);
        canvas.style.cursor = h && h.tw ? 'ew-resize' : h && (h.D || h.h) ? 'ns-resize' : '';
        if (k !== JSON.stringify(hover)) { hover = h; draw(); }
      }
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { hover = null; draw(); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); view.s = Math.max(1, Math.min(1e5, view.s * Math.exp(-e.deltaY * 0.0015))); draw(); }, { passive: false });
    document.addEventListener('keydown', e => {
      if (!canvas.offsetParent || /input|textarea|select/i.test(document.activeElement.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { api.undo(); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (hover && hover.v) del(hover.v); }
      else if (e.key === 'a') api.setMode('add'); else if (e.key === 'm') api.setMode('move'); else if (e.key === 'd') api.setMode('delete');
    });

    function draw() {
      const { ctx, w: W, h: H } = FTM.fitCanvas(canvas);
      if (!view.s) api.fit();
      ctx.fillStyle = css('--panel'); ctx.fillRect(0, 0, W, H);
      const tw = T().w, D = T().D, o = org();
      const kMax = Math.ceil(W / 2 / view.s / tw) + 1;
      // preview strip -D < y < 0, with its teeth, filled
      const teeth = [];
      for (let k = -kMax; k <= kMax; k++) [1, -1].forEach(sd => teeth.push({ sd, k, pts: FTM.teeth.toothST(T(), D, sd, k).map(p => [p[0], p[1] - D / 2]) }));
      ctx.fillStyle = css('--paper');
      ctx.fillRect(0, o[1], W, D * view.s);
      const line = (pts, close) => { ctx.beginPath(); pts.forEach((p, i) => { const s = toScr(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); if (close) ctx.closePath(); };
      teeth.forEach(t => { line(t.pts, true); ctx.fill(); });
      ctx.strokeStyle = css('--grid2'); ctx.lineWidth = 1.5;
      teeth.forEach(t => { if (t.sd > 0 && !t.k) return; line(t.pts, false); ctx.stroke(); });
      // cell sides (tooth width) and the strip's lower edge (D): draggable
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      [-1, 1].forEach(sg => { const x = o[0] + sg * tw / 2 * view.s; ctx.strokeStyle = hover && hover.tw === sg || drag && drag.tw === sg ? css('--vertex') : css('--muted'); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); });
      ctx.strokeStyle = hover && hover.D || drag && drag.D ? css('--vertex') : css('--muted');
      ctx.beginPath(); ctx.moveTo(0, o[1] + D * view.s); ctx.lineTo(W, o[1] + D * view.s); ctx.stroke();
      const hy = o[1] - height() * view.s, xl = o[0] - tw / 2 * view.s, xr = o[0] + tw / 2 * view.s;
      ctx.strokeStyle = hover && hover.h || drag && drag.h ? css('--vertex') : css('--muted');
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(xl, hy); ctx.moveTo(xr, hy); ctx.lineTo(W, hy); ctx.stroke();
      ctx.setLineDash([]);
      // neck marks: the tooth should leave the edge at x = +-tw/4
      ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.5;
      [-1, 1].forEach(sg => { const x = o[0] + sg * tw / 4 * view.s; ctx.beginPath(); ctx.moveTo(x, o[1] - 8); ctx.lineTo(x, o[1] + 8); ctx.stroke(); });
      // master tooth
      const m = master();
      line(m, false); ctx.strokeStyle = css('--poly'); ctx.lineWidth = 1.8; ctx.stroke();
      m.forEach((p, i) => {
        const s = toScr(p), end = i === 0 || i === m.length - 1, on = hover && hover.v === i || drag && drag.v === i;
        ctx.beginPath(); ctx.arc(s[0], s[1], end ? 3 : on ? 6 : 4, 0, 7);
        ctx.fillStyle = end ? css('--axis') : css('--vertex'); ctx.fill();
      });
      // unit length
      ctx.font = '11px system-ui'; ctx.strokeStyle = ctx.fillStyle = css('--axis'); ctx.lineWidth = 1.5;
      const x0 = W - 12 - view.s;
      ctx.beginPath(); ctx.moveTo(x0, H - 14); ctx.lineTo(W - 12, H - 14); ctx.moveTo(x0, H - 18); ctx.lineTo(x0, H - 10); ctx.moveTo(W - 12, H - 18); ctx.lineTo(W - 12, H - 10); ctx.stroke();
      ctx.fillText('1', x0, H - 20);
    }

    const api = {
      draw,
      setMode(m) { mode = m; document.querySelectorAll('[data-tmode]').forEach(b => b.classList.toggle('on', b.dataset.tmode === m)); },
      setMap(m) { pushUndo(); T().mode = m; onChange(); },
      setPts(p) { pushUndo(); T().pts = p; onChange(); },
      reset() { pushUndo(); state.tooth = Object.assign(FTM.teeth.defaults(), { on: T().on }); onChange(); api.fit(); },
      undo() { const s = undo.pop(); if (s) { state.tooth = JSON.parse(s); onChange(); } },
      fit() {
        const [W, H] = size(), hy = Math.max(0.05, ...T().pts.map(p => p[1]));
        view.s = Math.max(1, Math.min(W / (3.2 * T().w), 0.8 * H / (T().D + 2.2 * hy)));
        if (canvas.offsetParent) draw();
      },
    };
    api.setMode('add');
    return api;
  };
})();
