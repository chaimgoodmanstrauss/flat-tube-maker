// Output panel: unfolded pieces in the plane. Tools: Move (drag piece / pan background), Split (click a piece to cut it
// across at the nearest ruling, with a dovetail joint), Join (click a cut to merge again). Pieces rotate with [ and ].
window.FTM = window.FTM || {};
(function () {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function inPoly(p, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
  }

  // cb: { split(piece, sampleIdx), join(edge, sampleIdx), changed() }
  FTM.FlatView = function (canvas, cb) {
    const v = { cx: 0, cy: 0, s: 10 };
    const opt = { rulings: false, labels: false };
    let space = false;
    let pieces = [], mode = 'move', sel = null, op = null;

    const toScr = (p, W, H) => [W / 2 + (p[0] - v.cx) * v.s, H / 2 - (p[1] - v.cy) * v.s];
    const toWorld = (x, y) => { const r = canvas.getBoundingClientRect(); return [v.cx + (x - r.width / 2) / v.s, v.cy - (y - r.height / 2) / v.s]; };
    const mouse = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    function fit() {
      const r = canvas.getBoundingClientRect();
      if (!pieces.length) return;
      const all = [];
      pieces.forEach(pc => all.push([pc.bbox.x0, pc.bbox.y0], [pc.bbox.x1, pc.bbox.y1]));
      const b = FTM.bbox(all);
      v.cx = (b.x0 + b.x1) / 2; v.cy = (b.y0 + b.y1) / 2;
      v.s = 0.92 * Math.min(r.width / Math.max(b.w, 1e-9), r.height / Math.max(b.h, 1e-9));
      draw();
    }
    function setPieces(p, refit) { pieces = p; if (sel && !p.some(q => q.key === sel)) sel = null; if (refit) fit(); else draw(); }
    const pieceAt = w => { for (let i = pieces.length - 1; i >= 0; i--) if (inPoly(w, pieces[i].paths[0].pts)) return pieces[i]; return null; };

    function draw() {
      const { ctx, w: W, h: H } = FTM.fitCanvas(canvas);
      ctx.fillStyle = css('--panel'); ctx.fillRect(0, 0, W, H);
      ctx.font = '11px system-ui';
      pieces.forEach(pc => {
        const isSel = pc.key === sel;
        for (const path of pc.paths) {
          ctx.beginPath();
          path.pts.forEach((p, i) => { const s = toScr(p, W, H); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
          if (path.closed) ctx.closePath();
          if (path.layer === 'CUT') { ctx.fillStyle = FTM.pieceColor(pc.edge, 0.88); ctx.fill(); }
          ctx.strokeStyle = path.layer === 'CUT' ? FTM.pieceColor(pc.edge, 0.3) : '#06f'; ctx.lineWidth = isSel ? 2.6 : 1.3; ctx.stroke();
        }
        if (opt.rulings) {
          const n = pc.rails.A.length, step = Math.max(1, Math.round((n - 1) / 70));
          ctx.strokeStyle = FTM.pieceColor(pc.edge, 0.55); ctx.lineWidth = 0.6; ctx.beginPath();
          for (let i = 0; i < n; i += step) {
            const a = toScr(pc.rails.A[i], W, H), b = toScr(pc.rails.B[i], W, H);
            ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          }
          ctx.stroke();
        }
        if (opt.labels) {
          const a = toScr(pc.rails.A[0], W, H), b = toScr(pc.rails.B[0], W, H);
          ctx.fillStyle = css('--text');
          const flat = pc.flatErr < 1e-3 ? '' : `  (flatness err ${(pc.flatErr * 100).toPrecision(2)}%)`;
          ctx.fillText(`${pc.label}  len ${pc.length.A.toFixed(2)}/${pc.length.B.toFixed(2)}${flat}`, Math.min(a[0], b[0]), Math.min(a[1], b[1]) - 6);
          const mid = pc.rails.A.length >> 1;
          [['A', pc.seams[0]], ['B', pc.seams[1]]].forEach(([r, sm]) => {
            if (sm.mate === null) return;
            const p = toScr(pc.rails[r][mid], W, H);
            ctx.fillStyle = css('--muted'); ctx.fillText('seam ' + (sm.vertex + 1), p[0] + (r === 'A' ? -34 : 4), p[1] + (r === 'A' ? -3 : 11));
          });
        }
      });
      const target = 80 / v.s, e = Math.pow(10, Math.floor(Math.log10(target))), f = target / e;
      const bar = (f < 2 ? 1 : f < 5 ? 2 : 5) * e;
      ctx.strokeStyle = css('--text'); ctx.fillStyle = css('--text'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, H - 14); ctx.lineTo(12 + bar * v.s, H - 14); ctx.stroke();
      ctx.fillText(String(+bar.toPrecision(2)) + ' units', 12, H - 20);
    }

    canvas.addEventListener('pointerdown', e => {
      const [x, y] = mouse(e), w = toWorld(x, y), pc = pieceAt(w);
      if (space) { op = { type: 'pan', last: [e.clientX, e.clientY] }; canvas.setPointerCapture(e.pointerId); return; }
      if (mode === 'move') {
        if (pc) { sel = pc.key; op = { type: 'drag', pc, last: w }; } else { sel = null; op = { type: 'pan', last: [e.clientX, e.clientY] }; }
        draw();
      } else if (mode === 'split') {
        api.setMode('move'); // one-shot: the next click either splits a piece or just deselects the tool
        if (!pc) return;
        const l = pc.toLocal(w), A = pc.local.A, B = pc.local.B;
        let best = -1, bd = Infinity;
        for (let k = 1; k < A.length - 1; k++) { const d = segDist(l, A[k], B[k]); if (d < bd) { bd = d; best = k; } }
        if (best > 0) cb.split(pc, pc.i0 + best);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!op) return;
      if (op.type === 'pan') { v.cx -= (e.clientX - op.last[0]) / v.s; v.cy += (e.clientY - op.last[1]) / v.s; op.last = [e.clientX, e.clientY]; }
      else { const w = toWorld(...mouse(e)); op.pc.xf.x += w[0] - op.last[0]; op.pc.xf.y += w[1] - op.last[1]; op.last = w; op.pc.apply(); op.moved = true; }
      draw();
    });
    const up = () => { if (op && op.type === 'drag' && op.moved) { op.pc.moved = true; cb.placed(op.pc); } op = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = mouse(e), r = canvas.getBoundingClientRect();
      const wx = v.cx + (x - r.width / 2) / v.s, wy = v.cy - (y - r.height / 2) / v.s;
      v.s = Math.max(1e-4, v.s * Math.exp(-e.deltaY * 0.0015));
      v.cx = wx - (x - r.width / 2) / v.s; v.cy = wy + (y - r.height / 2) / v.s;
      draw();
    }, { passive: false });

    function rotateSel(deg) {
      const pc = pieces.find(p => p.key === sel); if (!pc) return;
      pc.xf.rot += deg * Math.PI / 180; pc.apply(); cb.placed(pc); draw();
    }
    document.addEventListener('keydown', e => {
      if (/input|textarea|select/i.test(document.activeElement.tagName)) return;
      if (e.key === ' ') { space = true; canvas.style.cursor = 'grab'; e.preventDefault(); return; }
      if (e.key === '[') rotateSel(e.shiftKey ? 45 : 5); else if (e.key === ']') rotateSel(e.shiftKey ? -45 : -5);
    });

    document.addEventListener('keyup', e => { if (e.key === ' ') { space = false; canvas.style.cursor = ''; } });
    window.addEventListener('blur', () => { space = false; canvas.style.cursor = ''; });

    const api = {
      draw, setPieces, fit, opt, rotateSel,
      setMode(m) { mode = m; document.querySelectorAll('[data-fmode]').forEach(b => b.classList.toggle('on', b.dataset.fmode === m)); canvas.dataset.mode = m; },
    };
    return api;
  };
})();
