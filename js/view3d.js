// Right panel: rotatable 3D view (canvas 2D, painter's algorithm). Z is up.
window.FTM = window.FTM || {};
(function () {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  FTM.View3D = function (canvas) {
    const cam = { yaw: -0.7, pitch: 0.55, zoom: 1 };
    const opt = { tube: true }; // wireframe and frames are never drawn
    let model = null, center = [0, 0, 0], R = 1;

    function setModel(m) {
      model = m;
      if (!m) { draw(); return; }
      let lo = [1e300, 1e300, 1e300], hi = [-1e300, -1e300, -1e300];
      const eat = p => { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } };
      m.P.forEach(eat); m.Q.forEach(r => r.forEach(eat));
      eat([0, 0, 0]);
      center = lo.map((v, k) => (v + hi[k]) / 2);
      R = Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
      draw();
    }

    function proj(W, H) {
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const D = 3.2 * R, k = Math.min(W, H) / (2.3 * R) * cam.zoom;
      return p => {
        const x = p[0] - center[0], y = p[1] - center[1], z = p[2] - center[2];
        const x1 = cy * x - sy * y, y1 = sy * x + cy * y;
        const depth = cp * y1 - sp * z, up = sp * y1 + cp * z;
        const f = D / Math.max(0.05 * D, D + depth);
        return [W / 2 + x1 * f * k, H / 2 - up * f * k, depth, x1, up];
      };
    }

    function draw() {
      const { ctx, w: W, h: H } = FTM.fitCanvas(canvas);
      ctx.fillStyle = css('--panel3d'); ctx.fillRect(0, 0, W, H);
      if (!model) return;
      const pr = proj(W, H);
      // world axes
      const L = R * 0.35, o = pr([0, 0, 0]);
      [[[L, 0, 0], '#d44', 'x'], [[0, L, 0], '#2a2', 'y'], [[0, 0, L], '#36d', 'z']].forEach(([e, c, n]) => {
        const q = pr(e); ctx.strokeStyle = c; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        ctx.fillStyle = c; ctx.font = '11px system-ui'; ctx.fillText(n, q[0] + 3, q[1] - 3);
      });
      const { P, Q, closed } = model, m = Q.length, N = P.length - 1;
      if (opt.tube && m) {
        const S = Q.map(r => r.map(pr));
        const faces = [];
        for (let j = 0; j < (closed ? m : m - 1); j++) {
          const a = S[j], b = S[(j + 1) % m];
          for (let i = 0; i < N; i++) {
            const p0 = a[i], p1 = b[i], p2 = b[i + 1], p3 = a[i + 1];
            faces.push([p0, p1, p2, p3, j, (p0[2] + p1[2] + p2[2] + p3[2]) / 4]);
          }
        }
        faces.sort((x, y) => y[5] - x[5]);
        for (const f of faces) {
          const [p0, p1, p2, p3] = f;
          // view-space normal's component toward the viewer approximated from screen-space winding area
          const ar = Math.abs((p2[0] - p0[0]) * (p3[1] - p1[1]) - (p2[1] - p0[1]) * (p3[0] - p1[0])) / 2;
          const e1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) + 1e-9;
          const lit = 0.38 + 0.5 * Math.min(1, ar / e1);
          ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle = FTM.pieceColor(f[4], lit);
          ctx.fill(); ctx.lineWidth = 0.6; ctx.stroke();
        }
      }
      // centre curve
      const C = P.map(pr);
      ctx.strokeStyle = '#e33'; ctx.lineWidth = 2; ctx.beginPath();
      C.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      ctx.fillStyle = '#2a8'; ctx.beginPath(); ctx.arc(C[0][0], C[0][1], 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#e33'; ctx.beginPath(); ctx.arc(C[N][0], C[N][1], 4, 0, 7); ctx.fill();
    }

    let last = null;
    canvas.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!last) return;
      cam.yaw += (e.clientX - last[0]) * 0.008;
      cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch + (e.clientY - last[1]) * 0.008));
      last = [e.clientX, e.clientY]; draw();
    });
    const up = () => { last = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => {
      e.preventDefault(); cam.zoom = Math.max(0.1, Math.min(60, cam.zoom * Math.exp(-e.deltaY * 0.0015))); draw();
    }, { passive: false });

    return {
      draw, setModel, opt,
      reset() { cam.yaw = -0.7; cam.pitch = 0.55; cam.zoom = 1; draw(); },
      getCam: () => ({ ...cam }), setCam(c) { if (c) Object.assign(cam, c); },
    };
  };
})();
