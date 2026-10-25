// Tiny expression compiler: "t cos t", "sin 3t", "2^t", "atan2(t,1)" ... -> function(t).
// Supports implicit multiplication and function application without parentheses
// ("sin 3t" = sin(3t); "sin t cos t" = sin(t)*cos(t)).
window.FTM = window.FTM || {};
(function () {
  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10,
    sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    atan2: Math.atan2, min: Math.min, max: Math.max, pow: Math.pow,
    mod: (a, b) => a - b * Math.floor(a / b),
  };
  const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
  const NAMES = [...Object.keys(FUNCS), ...Object.keys(CONSTS), 't'].sort((a, b) => b.length - a.length);

  function tokenize(src) {
    const s = src.replace(/π/g, 'pi').replace(/[×·]/g, '*').replace(/−/g, '-').replace(/\*\*/g, '^');
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const rest = s.slice(i);
      let m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
      if (m) { toks.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ('+-*/^(),'.includes(c)) { toks.push({ k: c }); i++; continue; }
      const low = rest.toLowerCase();
      const name = NAMES.find(n => low.startsWith(n));
      if (!name) throw new Error(`unexpected "${rest.slice(0, 6)}"`);
      toks.push({ k: 'name', v: name });
      i += name.length;
    }
    return toks;
  }

  function compile(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const startsAtom = tk => tk && (tk.k === 'num' || tk.k === '(' || tk.k === 'name');
    const isFunc = tk => tk && tk.k === 'name' && FUNCS[tk.v];

    function expr() {
      let l = term();
      while (peek() && (peek().k === '+' || peek().k === '-')) {
        const op = toks[p++].k, r = term(), a = l;
        l = op === '+' ? t => a(t) + r(t) : t => a(t) - r(t);
      }
      return l;
    }
    function term() {
      let l = unary();
      for (;;) {
        const tk = peek();
        let op = null;
        if (tk && (tk.k === '*' || tk.k === '/')) { op = tk.k; p++; }
        else if (!startsAtom(tk)) break;
        const r = unary(), a = l;
        l = op === '/' ? t => a(t) / r(t) : t => a(t) * r(t);
      }
      return l;
    }
    function unary() {
      const tk = peek();
      if (tk && tk.k === '-') { p++; const a = unary(); return t => -a(t); }
      if (tk && tk.k === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      const b = atom();
      if (peek() && peek().k === '^') { p++; const e = unary(); return t => Math.pow(b(t), e(t)); }
      return b;
    }
    function juxt() { // argument of a function written without parentheses
      let l = power();
      while (startsAtom(peek()) && !isFunc(peek())) { const r = power(), a = l; l = t => a(t) * r(t); }
      return l;
    }
    function atom() {
      const tk = toks[p++];
      if (!tk) throw new Error('unexpected end');
      if (tk.k === 'num') { const v = tk.v; return () => v; }
      if (tk.k === '(') {
        const e = expr();
        if (!peek() || peek().k !== ')') throw new Error('missing )');
        p++; return e;
      }
      if (tk.k === 'name') {
        if (tk.v === 't') return t => t;
        if (tk.v in CONSTS) { const v = CONSTS[tk.v]; return () => v; }
        const f = FUNCS[tk.v];
        if (peek() && peek().k === '(') {
          p++;
          const args = [expr()];
          while (peek() && peek().k === ',') { p++; args.push(expr()); }
          if (!peek() || peek().k !== ')') throw new Error('missing )');
          p++;
          return args.length === 1 ? t => f(args[0](t)) : t => f(...args.map(a => a(t)));
        }
        const a = juxt();
        return t => f(a(t));
      }
      throw new Error(`unexpected "${tk.k}"`);
    }

    if (!toks.length) throw new Error('empty');
    const f = expr();
    if (p < toks.length) throw new Error(`unexpected "${toks[p].k === 'name' ? toks[p].v : toks[p].k}"`);
    return f;
  }

  FTM.compileExpr = compile;
})();
