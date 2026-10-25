// Wiring: state, recompute pipeline, save/load, export.
(function () {
  const $ = id => document.getElementById(id);
  const DEFAULT = () => ({
    v: 1,
    polygon: { closed: true, pts: [0, 1, 2, 3, 4, 5].map(k => [+(0.5 * Math.cos(k * Math.PI / 3)).toFixed(3), +(0.5 * Math.sin(k * Math.PI / 3)).toFixed(3)]) },
    curve: { x: 't cos t', y: 't sin t', z: 'sin 3t', t0: '2', t1: '4pi', n: 300 },
    twist: 0,
    out: { scale: 1, unit: 'mm', labels: false },
    joint: FTM.joints.defaults(),
    splits: {},
    layout: {},
  });
  let state = DEFAULT();
  try { const a = localStorage.getItem('ftm.auto'); if (a) state = Object.assign(DEFAULT(), JSON.parse(a)); } catch (e) {}

  const view3d = FTM.View3D($('c3d'));
  let strips = [];
  const flat = FTM.FlatView($('cflat'), {
    split(pc, c) { (state.splits[pc.edge] = state.splits[pc.edge] || []).push(c); state.layout = pruneLayout(); scheduleB(); },
    join(edge, c) { state.splits[edge] = (state.splits[edge] || []).filter(x => x !== c); scheduleB(); },
    placed(pc) { state.layout[pc.key] = Object.assign({}, pc.xf); autosave(); },
  });
  flat.setMode('move');
  function pruneLayout() { return state.layout; }
  const editor = FTM.PolyEditor($('cpoly'), state, () => { schedule(); });
  const jedit = FTM.JointEditor($('cjoint'), state, () => { scheduleB(); jedit.draw(); });
  editor.setCoordEl($('coords'));
  let pending = false, refit = true, model = null, pieces = [];

  let dirtyA = true, polyNote = '', nSamples = 0;
  function schedule() { dirtyA = true; scheduleB(); }
  function scheduleB() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; recompute(); }); } }
  function autosave() { try { localStorage.setItem('ftm.auto', JSON.stringify(snapshot())); } catch (e) {} }

  function setStatus(msg, bad) { const el = $('status'); el.textContent = msg; el.className = bad ? 'bad' : ''; }

  function stageA() { // curve + polygon -> 3D model and unfolded strips
    const c = state.curve;
    ['x', 'y', 'z', 't0', 't1'].forEach(k => $('in_' + k).classList.remove('err'));
    const fn = {};
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
    strips = FTM.buildStrips(poly, closed, Q, fr.U, fr.V);
    nSamples = n;
    polyNote = poly !== drawn ? ` \u2014 self-intersecting polygon: using its ${poly.length}-vertex outline` : '';
  }

  function recompute() {
    try {
      if (dirtyA) { dirtyA = false; stageA(); view3d.setModel(model); }
      const jt = state.joint;
      jt.w = Math.max(0.01, +jt.w || 1); jt.margin = Math.max(0, +jt.margin || 0);
      pieces = FTM.joints.makePieces(strips, { splits: state.splits, joint: jt, layout: state.layout });
      const err = Math.max(0, ...pieces.map(p => p.flatErr));
      setStatus(`${pieces.length} pieces (${strips.length} edges), ${nSamples} segments; max unfolding error ${(err * 100).toPrecision(2)}%` + polyNote, false);
    } catch (e) {
      model = null; pieces = []; strips = []; dirtyA = true;
      view3d.setModel(null);
      setStatus(e.message, true);
    }
    flat.setPieces(pieces, refit); refit = false;
    editor.draw(); jedit.draw();
    autosave();
  }

  function snapshot() { return Object.assign({}, state, { cam: view3d.getCam() }); }

  // ---- inputs ----
  const fields = ['x', 'y', 'z', 't0', 't1', 'n'];
  function syncInputs() {
    fields.forEach(k => $('in_' + k).value = state.curve[k]);
    $('closed').checked = state.polygon.closed;
    $('twist').value = state.twist;
    $('jon').checked = state.joint.on; $('jw').value = state.joint.w; $('jm').value = state.joint.margin;
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

  // ---- tabs, joint, flat tools ----
  function showTab(t) {
    $('v_poly').hidden = t !== 'poly'; $('v_joint').hidden = t !== 'joint';
    $('tab_poly').classList.toggle('on', t === 'poly'); $('tab_joint').classList.toggle('on', t === 'joint');
    editor.draw(); jedit.draw();
  }
  $('tab_poly').addEventListener('click', () => showTab('poly'));
  $('tab_joint').addEventListener('click', () => { showTab('joint'); jedit.fit(); });
  function mobileTab(m) {
    document.body.dataset.m = m;
    document.querySelectorAll('#mtabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'poly' || m === 'joint') { showTab(m); if (m === 'joint') jedit.fit(); }
    requestAnimationFrame(() => { view3d.draw(); flat.draw(); editor.draw(); jedit.draw(); });
  }
  document.querySelectorAll('#mtabs button').forEach(b => b.addEventListener('click', () => mobileTab(b.dataset.m)));
  document.querySelectorAll('[data-jmode]').forEach(b => b.addEventListener('click', () => jedit.setMode(b.dataset.jmode)));
  $('jsnap').addEventListener('change', e => jedit.setSnap(e.target.checked));
  $('jundo').addEventListener('click', () => jedit.undo());
  $('jon').addEventListener('change', e => { state.joint.on = e.target.checked; scheduleB(); });
  $('jw').addEventListener('input', e => { state.joint.w = +e.target.value || state.joint.w; scheduleB(); jedit.fit(); });
  $('jm').addEventListener('input', e => { state.joint.margin = Math.max(0, +e.target.value || 0); scheduleB(); });
  document.querySelectorAll('[data-fmode]').forEach(b => b.addEventListener('click', () => flat.setMode(b.dataset.fmode)));
  $('rotl').addEventListener('click', () => flat.rotateSel(5)); $('rotr').addEventListener('click', () => flat.rotateSel(-5));
  $('relayout').addEventListener('click', () => { state.layout = {}; scheduleB(); });

  // ---- save / load ----
  function adopt(s) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, DEFAULT(), s);
    view3d.setCam(s.cam);
    syncInputs(); refit = true; schedule(); jedit.fit();
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

  const redrawAll = () => { view3d.draw(); flat.draw(); editor.draw(); jedit.draw(); };
  new ResizeObserver(redrawAll).observe(document.body);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);

  view3d.setCam(state.cam);
  syncInputs();
  editor.fit();
  recompute();
})();
