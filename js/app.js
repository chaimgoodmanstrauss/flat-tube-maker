// Wiring: state, recompute pipeline, save/load, export.
(function () {
  const $ = id => document.getElementById(id);
  const DEFAULT = () => ({
    v: 1,
    polygon: { closed: true, pts: [0, 1, 2, 3, 4, 5].map(k => [+(0.5 * Math.cos(k * Math.PI / 3)).toFixed(3), +(0.5 * Math.sin(k * Math.PI / 3)).toFixed(3)]) },
    curve: { x: 't cos t', y: 't sin t', z: 'sin 3t', t0: '2', t1: '4pi', n: 300 },
    twist: 0,
    out: { scale: 1, unit: 'mm', labels: false },
  });
  let state = DEFAULT();
  try { const a = localStorage.getItem('ftm.auto'); if (a) state = Object.assign(DEFAULT(), JSON.parse(a)); } catch (e) {}

  const view3d = FTM.View3D($('c3d'));
  const flat = FTM.FlatView($('cflat'));
  const editor = FTM.PolyEditor($('cpoly'), state, () => { schedule(); });
  editor.setCoordEl($('coords'));
  let pending = false, refit = true, model = null, pieces = [];

  function schedule() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; recompute(); }); } }

  function setStatus(msg, bad) { const el = $('status'); el.textContent = msg; el.className = bad ? 'bad' : ''; }

  function recompute() {
    state.polygon = state.polygon; // editor may have replaced it (undo)
    const c = state.curve;
    ['x', 'y', 'z', 't0', 't1'].forEach(k => $('in_' + k).classList.remove('err'));
    let fn = {};
    try {
      for (const k of ['x', 'y', 'z', 't0', 't1']) {
        try { fn[k] = FTM.compileExpr(c[k]); } catch (e) { $('in_' + k).classList.add('err'); throw new Error(`${k}: ${e.message}`); }
      }
      const t0 = fn.t0(0), t1 = fn.t1(0), n = Math.max(2, Math.min(3000, Math.round(+c.n) || 300));
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 === t1) { $('in_t1').classList.add('err'); throw new Error('bad t range'); }
      const cur = FTM.sampleCurve(fn.x, fn.y, fn.z, t0, t1, n);
      const fr = FTM.bishopFrame(cur.P, cur.T, (+state.twist || 0) * Math.PI / 180);
      const closed = state.polygon.closed;
      const drawn = state.polygon.pts, poly = closed ? FTM.resolvePolygon(drawn) : drawn;
      const Q = FTM.sweep(poly, cur.P, fr.U, fr.V);
      model = { P: cur.P, T: cur.T, U: fr.U, V: fr.V, Q, closed };
      pieces = FTM.buildPieces(poly, closed, Q, fr.U, fr.V);
      pieces = FTM.slots.apply(pieces, { frames: fr, curve: cur }) || pieces;
      const err = Math.max(0, ...pieces.map(p => p.flatErr));
      setStatus(`${pieces.length} pieces, ${n} segments each; max unfolding error ${(err * 100).toPrecision(2)}%` + (poly !== drawn ? ` — self-intersecting polygon: using its ${poly.length}-vertex outline` : ''), false);
    } catch (e) {
      model = null; pieces = [];
      setStatus(e.message, true);
    }
    view3d.setModel(model);
    flat.setPieces(pieces, refit); refit = false;
    editor.draw();
    try { localStorage.setItem('ftm.auto', JSON.stringify(snapshot())); } catch (e) {}
  }

  function snapshot() { return Object.assign({}, state, { cam: view3d.getCam() }); }

  // ---- inputs ----
  const fields = ['x', 'y', 'z', 't0', 't1', 'n'];
  function syncInputs() {
    fields.forEach(k => $('in_' + k).value = state.curve[k]);
    $('closed').checked = state.polygon.closed;
    $('twist').value = state.twist;
    $('scale').value = state.out.scale; $('unit').value = state.out.unit; $('exlabels').checked = state.out.labels;
  }
  fields.forEach(k => $('in_' + k).addEventListener('input', e => { state.curve[k] = e.target.value; refit = true; schedule(); }));
  $('twist').addEventListener('input', e => { state.twist = +e.target.value || 0; schedule(); });
  $('closed').addEventListener('change', e => {
    const P = state.polygon; if (!e.target.checked && P.pts.length < 2) return;
    P.closed = e.target.checked; refit = true; schedule();
  });
  $('scale').addEventListener('input', e => { state.out.scale = +e.target.value || 1; schedule(); });
  $('unit').addEventListener('change', e => { state.out.unit = e.target.value; schedule(); });
  $('exlabels').addEventListener('change', e => { state.out.labels = e.target.checked; schedule(); });
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => editor.setMode(b.dataset.mode)));
  $('snap').addEventListener('change', e => editor.setSnap(e.target.checked));
  $('undo').addEventListener('click', () => editor.undo());
  $('fitpoly').addEventListener('click', () => editor.fit());
  $('fitflat').addEventListener('click', () => flat.fit());
  $('reset3d').addEventListener('click', () => view3d.reset());
  [['tube', 'o_tube'], ['wire', 'o_wire'], ['frames', 'o_frames']].forEach(([k, id]) => { $(id).checked = view3d.opt[k]; $(id).addEventListener('change', e => { view3d.opt[k] = e.target.checked; view3d.draw(); }); });
  [['rulings', 'o_rul'], ['labels', 'o_lab']].forEach(([k, id]) => { $(id).checked = flat.opt[k]; $(id).addEventListener('change', e => { flat.opt[k] = e.target.checked; flat.draw(); }); });
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.preset.split('|'); Object.assign(state.curve, { x: p[0], y: p[1], z: p[2], t0: p[3], t1: p[4] });
    syncInputs(); refit = true; schedule();
  }));

  // ---- save / load ----
  function adopt(s) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, DEFAULT(), s);
    view3d.setCam(s.cam);
    syncInputs(); refit = true; schedule();
  }
  $('save').addEventListener('click', () => { try { localStorage.setItem('ftm.saved', JSON.stringify(snapshot())); setStatus('saved in this browser', false); } catch (e) { setStatus('save failed: ' + e.message, true); } });
  $('load').addEventListener('click', () => { try { const s = localStorage.getItem('ftm.saved'); if (!s) return setStatus('nothing saved yet', true); adopt(JSON.parse(s)); } catch (e) { setStatus('load failed: ' + e.message, true); } });
  $('dl').addEventListener('click', () => FTM.download('flat-tube.json', JSON.stringify(snapshot(), null, 1), 'application/json'));
  $('open').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => adopt(JSON.parse(t))).catch(err => setStatus('open failed: ' + err.message, true));
    e.target.value = '';
  });
  $('reset').addEventListener('click', () => { if (confirm('Reset to defaults?')) adopt(DEFAULT()); });

  // ---- export ----
  const ex = (kind, ext, mime) => $('ex_' + kind).addEventListener('click', () => {
    if (!pieces.length) return setStatus('nothing to export', true);
    FTM.download('flat-tube.' + ext, FTM['to' + kind.toUpperCase()](pieces, state.out), mime);
  });
  ex('svg', 'svg', 'image/svg+xml'); ex('dxf', 'dxf', 'application/dxf'); ex('eps', 'eps', 'application/postscript');

  window.addEventListener('resize', () => { view3d.draw(); flat.draw(); editor.draw(); });
  new ResizeObserver(() => { view3d.draw(); flat.draw(); editor.draw(); }).observe(document.body);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { view3d.draw(); flat.draw(); editor.draw(); });

  view3d.setCam(state.cam);
  syncInputs();
  editor.fit();
  recompute();
})();
