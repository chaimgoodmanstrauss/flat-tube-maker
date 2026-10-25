// Output panel: unfolded pieces in the plane (pan: drag, zoom: wheel).
window.FTM = window.FTM || {};
(function () {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  FTM.FlatView = function (canvas) {
    const v = { cx: 0, cy: 0, s: 10 };
    const opt = { rulings: true, labels: true };
    let pieces = [];

    const toScr = (p, W, H) => [W / 2 + (p[0] - v.cx) * v.s, H / 2 - (p[1] - v.cy) * v.s];

    function fit() {
      const r = canvas.getBoundingClientRect(), W = r.width, H = r.height;
      if (!pieces.length) return;
      const all = [];
      pieces.forEach(pc => all.push([pc.bbox.x0, pc.bbox.y0], [pc.bbox.x1, pc.bbox.y1]));
      const b = FTM.bbox(all);
      v.cx = (b.x0 + b.x1) / 2; v.cy = (b.y0 + b.y1) / 2;
      v.s = 0.92 * Math.min(W / Math.max(b.w, 1e-9), H / Math.max(b.h, 1e-9));
      draw();
    }

    function setPieces(p, refit) { pieces = p; if (refit) fit(); else draw(); }

    function draw() {
      const { ctx, w: W, h: H } = FTM.fitCanvas(canvas);
      ctx.fillStyle = css('--panel'); ctx.fillRect(0, 0, W, H);
      ctx.font = '11px system-ui';
      pieces.forEach(pc => {
        for (const path of pc.paths) {
          ctx.beginPath();
          path.pts.forEach((p, i) => { const s = toScr(p, W, H); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
          if (path.closed) ctx.closePath();
          if (path.layer === 'CUT') { ctx.fillStyle = FTM.pieceColor(pc.id, 0.88); ctx.fill(); }
          ctx.strokeStyle = path.layer === 'CUT' ? FTM.pieceColor(pc.id, 0.3) : '#c60'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        if (opt.rulings) {
          const n = pc.rails.A.length, step = Math.max(1, Math.round((n - 1) / 70));
          ctx.strokeStyle = FTM.pieceColor(pc.id, 0.55); ctx.lineWidth = 0.6; ctx.beginPath();
          for (let i = 0; i < n; i += step) {
            const a = toScr(pc.rails.A[i], W, H), b = toScr(pc.rails.B[i], W, H);
            ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          }
          ctx.stroke();
        }
        if (opt.labels) {
          const n = pc.rails.A.length, mid = n >> 1;
          const a = toScr(pc.rails.A[0], W, H), b = toScr(pc.rails.B[0], W, H);
          ctx.fillStyle = css('--text');
          const flat = pc.flatErr < 1e-3 ? '' : `  (flatness err ${(pc.flatErr * 100).toPrecision(2)}%)`;
          ctx.fillText(`${pc.label}  len ${pc.length.A.toFixed(2)}/${pc.length.B.toFixed(2)}${flat}`, Math.min(a[0], b[0]), Math.min(a[1], b[1]) - 6);
          [['A', pc.seams[0]], ['B', pc.seams[1]]].forEach(([r, sm]) => {
            if (sm.mate === null) return;
            const p = toScr(pc.rails[r][mid], W, H);
            ctx.fillStyle = css('--muted'); ctx.fillText('seam ' + (sm.vertex + 1), p[0] + (r === 'A' ? -34 : 4), p[1] + (r === 'A' ? -3 : 11));
          });
        }
      });
      // scale bar
      const target = 80 / v.s, e = Math.pow(10, Math.floor(Math.log10(target))), f = target / e;
      const bar = (f < 2 ? 1 : f < 5 ? 2 : 5) * e;
      ctx.strokeStyle = css('--text'); ctx.fillStyle = css('--text'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, H - 14); ctx.lineTo(12 + bar * v.s, H - 14); ctx.stroke();
      ctx.fillText(String(+bar.toPrecision(2)) + ' units', 12, H - 20);
    }

    let last = null;
    canvas.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!last) return;
      v.cx -= (e.clientX - last[0]) / v.s; v.cy += (e.clientY - last[1]) / v.s;
      last = [e.clientX, e.clientY]; draw();
    });
    const up = () => { last = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const wx = v.cx + (x - r.width / 2) / v.s, wy = v.cy - (y - r.height / 2) / v.s;
      v.s = Math.max(1e-4, v.s * Math.exp(-e.deltaY * 0.0015));
      v.cx = wx - (x - r.width / 2) / v.s; v.cy = wy + (y - r.height / 2) / v.s;
      draw();
    }, { passive: false });

    return { draw, setPieces, fit, opt };
  };
})();
