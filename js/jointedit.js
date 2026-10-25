// Joint profile editor: draws one joint cell in the frame of a seam (x along the seam, y across it).
// Paper lies below the line; up = outward from the piece. Ends are fixed. Neighbouring cells are plain translated copies.
window.FTM = window.FTM || {};
(function () {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  FTM.JointEditor = function (canvas, state, onChange) {
    const view = { s: 0 };
    let mode = 'add', hover = -1, drag = -1, snapOn = false;
    const undo = [];
    const J = () => state.joint;
    const base = () => { const r = canvas.getBoundingClientRect(); return { W: r.width, H: r.height }; };
    if (!view.s) view.s = 1;
    const autoScale = () => { const { W } = base(); view.s = W / (3.3 * J().w); };
    // cell origin (x=0) in screen space
    const org = () => { const { W, H } = base(); return [W / 2 - 0.5 * J().w * view.s, H / 2]; };
    const toScr = p => { const o = org(); return [o[0] + p[0] * J().w * view.s, o[1] - p[1] * view.s]; };
    const toWorld = (x, y) => { const o = org(); return [(x - o[0]) / (J().w * view.s), -(y - o[1]) / view.s]; };
    const snapStep = () => J().w / 20;
    const snapX = v => snapOn ? Math.round(v * 20) / 20 : v;
    const snapY = v => snapOn ? Math.round(v / snapStep()) * snapStep() : v;
    const mouse = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const hit = (x, y) => { const p = J().pts; for (let i = p.length - 2; i >= 1; i--) { const s = toScr(p[i]); if (Math.hypot(s[0] - x, s[1] - y) < 11) return i; } return -1; };
    const pushUndo = () => { undo.push(JSON.stringify(J().pts)); if (undo.length > 100) undo.shift(); };

    function nearestSeg(x, y) {
      const p = J().pts; let best = null;
      for (let i = 0; i < p.length - 1; i++) {
        const a = toScr(p[i]), b = toScr(p[i + 1]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const d = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
        if (d < 10 && (!best || d < best.d)) best = { i, d };
      }
      return best;
    }

    canvas.addEventListener('contextmenu', e => { e.preventDefault(); const [x, y] = mouse(e), i = hit(x, y); if (i > 0) { pushUndo(); J().pts.splice(i, 1); onChange(); } });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const [x, y] = mouse(e), i = hit(x, y);
      if (mode === 'delete') { if (i > 0) { pushUndo(); J().pts.splice(i, 1); onChange(); } return; }
      if (mode === 'move' && i < 0) return;
      pushUndo();
      if (i > 0) drag = i;
      else {
        const w = toWorld(x, y), np = [snapX(w[0]), snapY(w[1])], sg = nearestSeg(x, y);
        const at = sg ? sg.i + 1 : J().pts.length - 1;
        J().pts.splice(at, 0, np); drag = at; onChange();
      }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const [x, y] = mouse(e);
      if (drag > 0) { const w = toWorld(x, y); J().pts[drag] = [snapX(w[0]), snapY(w[1])]; onChange(); }
      else { const h = hit(x, y); if (h !== hover) { hover = h; draw(); } }
    });
    const end = () => { drag = -1; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { hover = -1; draw(); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); view.s = Math.max(1, Math.min(1e5, view.s * Math.exp(-e.deltaY * 0.0015))); draw(); }, { passive: false });
    document.addEventListener('keydown', e => {
      if (!canvas.offsetParent || /input|textarea|select/i.test(document.activeElement.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { api.undo(); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (hover > 0) { pushUndo(); J().pts.splice(hover, 1); hover = -1; onChange(); } }
      else if (e.key === 'a') api.setMode('add'); else if (e.key === 'm') api.setMode('move'); else if (e.key === 'd') api.setMode('delete');
    });

    function draw() {
      const { ctx, w: W, h: H } = FTM.fitCanvas(canvas);
      if (!view.s || view.s === 1) autoScale();
      ctx.fillStyle = css('--panel'); ctx.fillRect(0, 0, W, H);
      const pts = J().pts, o = org();
      const row = [];
      [[pts, -1], [pts, 0], [pts, 1]].forEach(([c, sh]) => c.forEach((p, i) => { if (row.length && !i) return; row.push([p[0] + sh, p[1]]); }));
      const sr = row.map(toScr);
      const poly = () => { ctx.beginPath(); sr.forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.lineTo(sr[sr.length - 1][0], H); ctx.lineTo(sr[0][0], H); ctx.closePath(); };
      // paper: light gray below the line (and under the curve), lighter inside the tabs above it
      poly(); ctx.fillStyle = css('--paper'); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, o[1]); ctx.clip(); poly(); ctx.fillStyle = css('--paper2'); ctx.fill(); ctx.restore();
      ctx.lineWidth = 1; ctx.strokeStyle = css('--grid2'); ctx.beginPath(); ctx.moveTo(0, o[1] + 0.5); ctx.lineTo(W, o[1] + 0.5); ctx.stroke();
      const path = (list, col, lw) => { ctx.beginPath(); list.forEach((p, i) => { const s = toScr(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); };
      path(row, css('--grid2'), 1.5);
      path(pts, css('--poly'), 1.8);
      pts.forEach((p, i) => {
        const s = toScr(p); ctx.beginPath(); ctx.arc(s[0], s[1], i === 0 || i === pts.length - 1 ? 3 : (i === hover || i === drag ? 6 : 4), 0, 7);
        ctx.fillStyle = i === 0 || i === pts.length - 1 ? css('--axis') : css('--vertex'); ctx.fill();
      });
      ctx.font = '11px system-ui';
      // scale bar
      const raw = 60 / view.s, e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e, bar = (f < 2 ? 1 : f < 5 ? 2 : 5) * e;
      ctx.strokeStyle = css('--axis'); ctx.fillStyle = css('--axis'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W - 12 - bar * view.s, H - 14); ctx.lineTo(W - 12, H - 14); ctx.stroke();
      ctx.fillText(String(+bar.toPrecision(2)), W - 12 - bar * view.s, H - 20);
    }

    const api = {
      draw,
      setMode(m) { mode = m; document.querySelectorAll('[data-jmode]').forEach(b => b.classList.toggle('on', b.dataset.jmode === m)); },
      setPts(p) { pushUndo(); J().pts = p; onChange(); },
      undo() { const s = undo.pop(); if (s) { J().pts = JSON.parse(s); onChange(); } },
      fit() { autoScale(); draw(); },
    };
    api.setMode('add');
    return api;
  };
})();
