// Wiring: state, recompute pipeline, save/load, export.
(function () {
  const $ = id => document.getElementById(id);
  const DEFAULT = () => ({
    v: 2,
    polygon: { pts: [0, 1, 2, 3, 4, 5].map(k => [+(0.5 * Math.cos(k * Math.PI / 3)).toFixed(3), +(0.5 * Math.sin(k * Math.PI / 3)).toFixed(3)]) },
    curve: { x: '.25t cos t', y: '.25t sin t', z: '.25t', t0: '2', t1: '4pi', n: 300 },
    out: { scale: 1, unit: 'mm', cutLabels: true },
    tooth: FTM.teeth.defaults(),
    view: { teeth3d: false },
    splits: {}, // edge -> [m]: cut across the strip at s = m * toothwidth / 2
    layout: {},
  });
  // states saved before v2 had "joint" (cell x in [0,1]) and splits/layout keyed by curve sample index
  function migrate(s) {
    if ((s.v || 1) < 2) {
      if (s.joint) s.tooth = Object.assign(FTM.teeth.defaults(), { on: s.joint.on !== false, pts: s.joint.pts.map(([x, y]) => [x - 0.5, y]) });
      delete s.joint; delete s.twist; s.splits = {}; s.layout = {}; s.v = 2;
    }
    if (s.polygon) delete s.polygon.closed;
    return s;
  }
  let state = DEFAULT();
  try { const a = localStorage.getItem('ftm.auto'); if (a) state = Object.assign(DEFAULT(), migrate(JSON.parse(a))); } catch (e) {}
  const view3d = FTM.View3D($('c3d'));
  let strips = [];
  const flat = FTM.FlatView($('cflat'), {
    split(pc, s) { // snap to the nearest multiple of toothwidth/2 strictly inside the piece
      const h = state.tooth.w / 2, m = Math.round(s / h);
      if (m * h <= pc.s0 + 1e-9 || m * h >= pc.s1 - 1e-9) return;
      (state.splits[pc.edge] = state.splits[pc.edge] || []).push(m); scheduleB();
    },
    placed(pc) { state.layout[pc.key] = Object.assign({}, pc.xf); autosave(); },
  });
  flat.setMode('move');
  const editor = FTM.PolyEditor($('cpoly'), state, () => { schedule(); });
  const tedit = FTM.ToothEditor($('ctooth'), state, () => { syncTooth(); scheduleB(); tedit.draw(); });
  let pending = false, refit = true, model = null, pieces = [];

  let dirtyA = true, polyNote = '';
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
    const fr = FTM.bishopFrame(cur.P, cur.T);
    const drawn = state.polygon.pts, res = FTM.resolvePolygon(drawn);
    // counter-clockwise, no repeated vertices: then n = ds x dt is outward on every strip
    let poly = res.filter((p, i) => { const q = res[(i + 1) % res.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9; });
    if (FTM.polyArea(poly) < 0) poly = poly.slice().reverse();
    if (poly.length < 2) throw new Error('polygon needs at least two distinct vertices');
    const Q = FTM.sweep(poly, cur.P, fr.U, fr.V);
    editor.setNeg(FTM.negVolume(cur.P, fr.U, fr.V));
    model = { P: cur.P, T: cur.T, U: fr.U, V: fr.V, Q };
    strips = FTM.buildStrips(poly, cur.P, cur.T, fr.U, fr.V);
    polyNote = res !== drawn ? `Self-intersecting polygon: using its ${poly.length}-edge outline` : '';
  }

  function recompute() {
    try {
      if (dirtyA) { dirtyA = false; stageA(); view3d.setModel(model); }
      pieces = FTM.teeth.makePieces(strips, { splits: state.splits, tooth: state.tooth, layout: state.layout, labels: state.out.cutLabels });
      const step = state.tooth.w / 24;
      view3d.setTeeth(pieces.flatMap(pc => pc.teeth.map(t => ({ edge: pc.edge, pts: FTM.teeth.space(strips[pc.edge], t, true, step) }))));
      setStatus(polyNote, false);
    } catch (e) {
      model = null; pieces = []; strips = []; dirtyA = true;
      view3d.setModel(null);
      setStatus(e.message, true);
    }
    flat.setPieces(pieces, refit); refit = false;
    editor.draw(); tedit.draw();
    autosave();
  }

  function snapshot() { return Object.assign({}, state, { cam: view3d.getCam() }); }

  // ---- inputs ----
  const fields = ['x', 'y', 'z', 't0', 't1', 'n'];
  function syncTooth() {
    $('ton').checked = state.tooth.on;
    document.querySelectorAll('[data-tmap]').forEach(b => b.classList.toggle('on', b.dataset.tmap === state.tooth.mode));
  }
  function syncInputs() {
    fields.forEach(k => $('in_' + k).value = state.curve[k]);
    syncTooth();
    $('t3d').checked = view3d.opt.teeth = state.view.teeth3d;
    $('scale').value = state.out.scale; $('unit').value = state.out.unit; $('exlabels').checked = state.out.cutLabels;
  }
  fields.forEach(k => $('in_' + k).addEventListener('input', e => { state.curve[k] = e.target.value; refit = true; schedule(); }));
  $('scale').addEventListener('input', e => { state.out.scale = +e.target.value || 1; schedule(); });
  $('unit').addEventListener('change', e => { state.out.unit = e.target.value; schedule(); });
  $('exlabels').addEventListener('change', e => { state.out.cutLabels = e.target.checked; schedule(); });
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => editor.setMode(b.dataset.mode)));
  $('undo').addEventListener('click', () => editor.undo());
  document.querySelectorAll('[data-xf]').forEach(b => b.addEventListener('click', () => editor.setXform(b.classList.contains('on') ? null : b.dataset.xf)));
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.preset.split('|'); Object.assign(state.curve, { x: p[0], y: p[1], z: p[2], t0: p[3], t1: p[4] });
    syncInputs(); refit = true; schedule();
  }));

  // ---- formula dialog, polygon shapes ----
  $('formula').addEventListener('click', () => { $('fdlg').hidden = !$('fdlg').hidden; });
  $('fclose').addEventListener('click', () => { $('fdlg').hidden = true; });
  let shape = null;
  let shapeUndo = false;
  const openShape = s => {
    shape = s; shapeUndo = false;
    $('sdtitle').textContent = s === 'regular' ? 'Regular polygon' : 'Star';
    $('sd_n').parentElement.firstChild.textContent = s === 'regular' ? 'sides ' : 'points ';
    $('sd_n').value = s === 'regular' ? 6 : 5;
    $('sd_rl').hidden = s === 'regular';
    $('sdlg').hidden = false;
    applyShape();
    $('sd_n').focus(); $('sd_n').select();
  };
  const R0 = 0.5, rnd = v => +v.toFixed(4);
  function applyShape() { // the polygon is rebuilt immediately and again whenever a value changes
    const n = Math.max(shape === 'regular' ? 3 : 2, Math.min(200, Math.round(+$('sd_n').value) || 0)), pts = [];
    if (!n) return;
    if (shape === 'regular') for (let k = 0; k < n; k++) pts.push([rnd(R0 * Math.cos(2 * Math.PI * k / n)), rnd(R0 * Math.sin(2 * Math.PI * k / n))]);
    else {
      const r = Math.max(0.05, Math.min(0.95, +$('sd_r').value || 0.4));
      for (let k = 0; k < 2 * n; k++) { const rad = k % 2 ? R0 * r : R0, an = Math.PI / 2 + Math.PI * k / n; pts.push([rnd(rad * Math.cos(an)), rnd(rad * Math.sin(an))]); }
    }
    refit = true;
    editor.setPolygon({ pts }, shapeUndo); shapeUndo = true;
  }
  $('sh_reg').addEventListener('click', () => openShape('regular'));
  $('sh_star').addEventListener('click', () => openShape('star'));
  $('sh_seg').addEventListener('click', () => { $('sdlg').hidden = true; refit = true; editor.setPolygon({ pts: [[-R0, 0], [R0, 0]] }); });
  $('sd_n').addEventListener('input', applyShape); $('sd_r').addEventListener('input', applyShape);
  $('sd_ok').addEventListener('click', () => { $('sdlg').hidden = true; });
  $('sdclose').addEventListener('click', () => { $('sdlg').hidden = true; });
  $('sdlg').addEventListener('keydown', e => { if (e.key === 'Enter') $('sdlg').hidden = true; else if (e.key === 'Escape') $('sdlg').hidden = true; });

  // ---- tabs, tooth, flat tools ----
  function showTab(t) {
    $('v_poly').hidden = t !== 'poly'; $('v_tooth').hidden = t !== 'tooth';
    $('tab_poly').classList.toggle('on', t === 'poly'); $('tab_tooth').classList.toggle('on', t === 'tooth');
    editor.draw(); tedit.draw();
  }
  $('tab_poly').addEventListener('click', () => showTab('poly'));
  $('tab_tooth').addEventListener('click', () => { showTab('tooth'); tedit.fit(); });
  function mobileTab(m) {
    document.body.dataset.m = m;
    document.querySelectorAll('#mtabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'poly' || m === 'tooth') { showTab(m); if (m === 'tooth') tedit.fit(); }
    requestAnimationFrame(() => { view3d.draw(); flat.draw(); editor.draw(); tedit.draw(); });
  }
  document.querySelectorAll('#mtabs button').forEach(b => b.addEventListener('click', () => mobileTab(b.dataset.m)));
  document.querySelectorAll('[data-tmode]').forEach(b => b.addEventListener('click', () => tedit.setMode(b.dataset.tmode)));
  document.querySelectorAll('[data-tmap]').forEach(b => b.addEventListener('click', () => tedit.setMap(b.dataset.tmap)));
  $('tundo').addEventListener('click', () => tedit.undo());
  $('tdove').addEventListener('click', () => tedit.setPts(FTM.teeth.DOVETAIL.map(p => p.slice())));
  $('ton').addEventListener('change', e => { state.tooth.on = e.target.checked; scheduleB(); });
  $('t3d').addEventListener('change', e => { state.view.teeth3d = view3d.opt.teeth = e.target.checked; view3d.draw(); autosave(); });
  document.querySelectorAll('[data-fmode]').forEach(b => b.addEventListener('click', () => flat.setMode(b.dataset.fmode)));
  $('resetsplit').addEventListener('click', () => { state.splits = {}; state.layout = {}; scheduleB(); });
  $('relayout').addEventListener('click', () => { state.layout = {}; scheduleB(); });

  // ---- save / load ----
  function adopt(s) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, DEFAULT(), migrate(s));
    view3d.setCam(s.cam);
    syncInputs(); refit = true; schedule(); tedit.fit();
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

  // cmd-option-{ : copy the current state (same JSON as the download button) to the clipboard
  document.addEventListener('keydown', e => {
    if (!(e.metaKey && e.altKey && e.code === 'BracketLeft')) return;
    e.preventDefault();
    const txt = JSON.stringify(snapshot(), null, 1);
    const fallback = () => { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); setStatus(ok ? 'state copied to clipboard' : 'copy failed', !ok); };
    (navigator.clipboard ? navigator.clipboard.writeText(txt).then(() => setStatus('state copied to clipboard', false)) : Promise.reject()).catch(fallback);
  });

  // ---- export ----
  const ex = (kind, ext, mime) => $('ex_' + kind).addEventListener('click', () => {
    if (!pieces.length) return setStatus('nothing to export', true);
    FTM.download('flat-tube.' + ext, FTM['to' + kind.toUpperCase()](pieces, state.out), mime);
  });
  ex('svg', 'svg', 'image/svg+xml'); ex('dxf', 'dxf', 'application/dxf'); ex('eps', 'eps', 'application/postscript');

  const redrawAll = () => { view3d.draw(); flat.draw(); editor.draw(); tedit.draw(); };
  new ResizeObserver(redrawAll).observe(document.body);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);

  view3d.setCam(state.cam);
  syncInputs();
  editor.fit();
  recompute();
})();
