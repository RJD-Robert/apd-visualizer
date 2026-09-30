/* Tangent-mode automatic piecewise differentiation. No eval or generated code. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.APD = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FUNCTIONS = {
    sin: 1,
    cos: 1,
    tan: 1,
    exp: 1,
    log: 1,
    ln: 1,
    sqrt: 1,
    sinh: 1,
    cosh: 1,
    tanh: 1,
    atan: 1,
    asin: 1,
    acos: 1,
    abs: 1,
    relu: 1,
    min: 2,
    max: 2,
    pow: 2,
  };
  const fmt = (x) => (Object.is(x, -0) ? '0' : Number(x.toPrecision(7)).toString());
  function parse(source, dimension = 1) {
    if (typeof source !== 'string' || !source.trim()) throw Error('Enter a function first.');
    if (source.length > 1500) throw Error('Keep the expression under 1,500 characters.');
    let s = source.replace(/π/g, 'pi').replace(/−/g, '-').replace(/\*\*/g, '^'),
      tokens = [],
      i = 0;
    while (i < s.length) {
      if (/\s/.test(s[i])) {
        i++;
        continue;
      }
      let m = s.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (m) {
        tokens.push({ kind: 'num', value: Number(m[0]) });
        i += m[0].length;
        continue;
      }
      m = s.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
      if (m) {
        tokens.push({ kind: 'name', value: m[0].toLowerCase() });
        i += m[0].length;
        continue;
      }
      if ('+-*/^(),'.includes(s[i])) {
        tokens.push({ kind: s[i], value: s[i++] });
        continue;
      }
      throw Error(
        `Unexpected character “${s[i]}”. Use abs(x) for absolute value and * for multiplication.`
      );
    }
    tokens.push({ kind: 'end' });
    let p = 0,
      count = 0;
    const node = (op, args = [], value) => {
      if (++count > 250) throw Error('Use an expression with fewer than 250 operations.');
      return { op, args, value, depends: op === 'x' || op === 'y' || args.some((a) => a.depends) };
    };
    const take = (kind) => {
      if (tokens[p].kind !== kind)
        throw Error(`Expected “${kind}”, found “${tokens[p].value ?? 'end of expression'}”.`);
      return tokens[p++];
    };
    function expr(min = 0, depth = 0) {
      if (depth > 70) throw Error('Expression nesting is too deep.');
      let t = tokens[p++],
        left;
      if (t.kind === 'num') {
        if (!Number.isFinite(t.value)) throw Error('Constants must be finite.');
        left = node('const', [], t.value);
      } else if (t.kind === '+' || t.kind === '-') {
        let a = expr(25, depth + 1);
        left = t.kind === '-' ? node('neg', [a]) : a;
      } else if (t.kind === '(') {
        left = expr(0, depth + 1);
        take(')');
      } else if (t.kind === 'name') {
        if (t.value === 'pi' || t.value === 'e')
          left = node('const', [], t.value === 'pi' ? Math.PI : Math.E);
        else if (t.value === 'x' || t.value === 'y') {
          if (t.value === 'y' && dimension === 1) throw Error('Switch to two inputs to use y.');
          left = node(t.value);
        } else if (Object.hasOwn(FUNCTIONS, t.value)) {
          take('(');
          let args = [expr(0, depth + 1)];
          while (tokens[p].kind === ',') {
            p++;
            args.push(expr(0, depth + 1));
          }
          take(')');
          if (args.length !== FUNCTIONS[t.value])
            throw Error(`${t.value} expects ${FUNCTIONS[t.value]} argument(s).`);
          left = node(t.value === 'pow' ? '^' : t.value === 'ln' ? 'log' : t.value, args);
        } else
          throw Error(
            `Unknown name “${t.value}”. Use x${dimension === 2 ? ' and y' : ''}, pi, e, or a supported function.`
          );
      } else
        throw Error(
          `Expected a number, variable, or function; found “${t.value ?? 'end of expression'}”.`
        );
      while (true) {
        let op = tokens[p].kind,
          bp = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 }[op];
        if (bp === undefined || bp < min) break;
        p++;
        left = node(op, [left, expr(op === '^' ? bp : bp + 1, depth + 1)]);
      }
      return left;
    }
    const ast = expr();
    if (tokens[p].kind !== 'end')
      throw Error(
        `Unexpected “${tokens[p].value}”. Write multiplication explicitly, for example 2*x.`
      );
    return ast;
  }
  function scalar(op, a, b) {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return b === 0 ? NaN : a / b;
      case '^':
        return a === 0 && b < 0 ? NaN : Math.pow(a, b);
      case 'neg':
        return -a;
      case 'abs':
        return Math.abs(a);
      case 'relu':
        return Math.max(0, a);
      case 'min':
        return Math.min(a, b);
      case 'max':
        return Math.max(a, b);
      case 'log':
        return a > 0 ? Math.log(a) : NaN;
      case 'sqrt':
        return a >= 0 ? Math.sqrt(a) : NaN;
      case 'tan':
        return Math.abs(Math.cos(a)) < 1e-14 ? NaN : Math.tan(a);
      default:
        return Math[op](a);
    }
  }
  function partials(op, a, b, constantExponent) {
    switch (op) {
      case '+':
        return [1, 1];
      case '-':
        return [1, -1];
      case 'neg':
        return [-1];
      case '*':
        return [b, a];
      case '/':
        return [1 / b, -(a / b) / b];
      case '^': {
        if (constantExponent) {
          if (a === 0 && !Number.isInteger(b))
            throw Error(
              'A fractional power at zero has no open smooth real neighborhood. Move the reference away from zero.'
            );
          if (b === 0) return [0, 0];
          if (b === 1) return [1, 0];
          return [b * Math.pow(a, b - 1), 0];
        }
        if (a <= 0)
          throw Error('A variable exponent requires a positive base at the reference point.');
        return [b * Math.pow(a, b - 1), Math.pow(a, b) * Math.log(a)];
      }
      case 'sin':
        return [Math.cos(a)];
      case 'cos':
        return [-Math.sin(a)];
      case 'tan':
        return [1 / Math.cos(a) ** 2];
      case 'exp':
        return [Math.exp(a)];
      case 'log':
        return [1 / a];
      case 'sqrt':
        return [0.5 / Math.sqrt(a)];
      case 'sinh':
        return [Math.cosh(a)];
      case 'cosh':
        return [Math.sinh(a)];
      case 'tanh': {
        const q = Math.exp(-2 * Math.abs(a));
        return [(4 * q) / (1 + q) ** 2];
      }
      case 'atan': {
        if (Math.abs(a) <= 1) return [1 / (1 + a * a)];
        const t = 1 / a;
        return [(t * t) / (1 + t * t)];
      }
      case 'asin':
        return [1 / Math.sqrt(1 - a * a)];
      case 'acos':
        return [-1 / Math.sqrt(1 - a * a)];
      default:
        throw Error(`Unsupported operation ${op}`);
    }
  }
  function compile(source, dimension = 1, reference = [0], kinkSlope = 0) {
    if (dimension !== 1 && dimension !== 2) throw Error('Choose one or two input variables.');
    if (
      reference.length < dimension ||
      reference.slice(0, dimension).some((v) => !Number.isFinite(v))
    )
      throw Error('Reference coordinates must be finite numbers.');
    if (![-1, 0, 1].includes(kinkSlope)) throw Error('The abs slope at zero must be -1, 0, or 1.');
    const ast = parse(source, dimension),
      nodes = [],
      kinks = [];
    function visit(n) {
      n.args.forEach(visit);
      n.id = nodes.length;
      nodes.push(n);
      n.grad = Array(dimension).fill(0);
      if (n.op === 'const') {
        n.base = n.value;
        n.c = [];
        return;
      }
      if (n.op === 'x' || n.op === 'y') {
        let j = n.op === 'x' ? 0 : 1;
        n.base = reference[j];
        n.grad[j] = 1;
        n.c = [];
        return;
      }
      const a = n.args[0].base,
        b = n.args[1]?.base;
      n.base = scalar(n.op, a, b);
      if (!Number.isFinite(n.base))
        throw Error(
          `“${n.op}” is undefined or overflows at this reference point. Move the reference or change the function.`
        );
      if (!n.depends) {
        n.c = n.args.map(() => 0);
        return;
      }
      if (n.op === 'abs' || n.op === 'relu') {
        if (a === 0) kinks.push({ id: n.id, op: n.op });
        let sign = a === 0 ? kinkSlope : Math.sign(a);
        n.c = [n.op === 'abs' ? sign : (1 + sign) / 2];
      } else if (n.op === 'max' || n.op === 'min') {
        const d = a - b;
        if (d === 0) kinks.push({ id: n.id, op: n.op });
        let sign = d === 0 ? kinkSlope : Math.sign(d);
        if (n.op === 'min') sign = -sign;
        n.c = [(1 + sign) / 2, (1 - sign) / 2];
      } else n.c = partials(n.op, a, b, n.op === '^' && !n.args[1].depends);
      n.c = n.c.map((v, k) => (n.args[k].depends ? v : 0));
      if (n.c.some((v) => !Number.isFinite(v)))
        throw Error(
          `“${n.op}” has no finite smooth derivative at this reference point. APD needs smooth elemental operations; use abs(x) for a cusp such as sqrt(x^2).`
        );
      n.grad = n.grad.map((_, j) => n.args.reduce((sum, arg, k) => sum + n.c[k] * arg.grad[j], 0));
      if (n.grad.some((v) => !Number.isFinite(v)))
        throw Error(
          'The derivative overflows at this reference. Choose a better scaled function or point.'
        );
    }
    visit(ast);
    const ref = reference.slice(0, dimension);
    function denominatorSignature(n, vals, sig) {
      sig.push(Math.sign(vals[n.id]));
      if (n.op === '*' || n.op === '/' || n.op === 'abs' || n.op === 'neg' || n.op === 'sqrt')
        n.args.forEach((a) => denominatorSignature(a, vals, sig));
      else if (n.op === '^' && !n.args[1].depends) denominatorSignature(n.args[0], vals, sig);
    }
    function evaluate(point, model = false, signature = false) {
      let vals = new Float64Array(nodes.length),
        sig = [];
      for (const n of nodes) {
        let v;
        if (n.op === 'const') v = n.base;
        else if (n.op === 'x' || n.op === 'y') v = point[n.op === 'x' ? 0 : 1];
        else {
          const a = vals[n.args[0].id],
            b = n.args[1] ? vals[n.args[1].id] : undefined;
          if (model) {
            if (!n.depends) v = n.base;
            else if (['abs', 'relu', 'max', 'min'].includes(n.op)) v = scalar(n.op, a, b);
            else
              v =
                n.base +
                n.args.reduce((sum, arg, k) => sum + n.c[k] * (vals[arg.id] - arg.base), 0);
          } else {
            v = scalar(n.op, a, b);
            if (signature) {
              if (n.op === '/') denominatorSignature(n.args[1], vals, sig);
              if (n.op === 'tan') sig.push(Math.floor((a + Math.PI / 2) / Math.PI));
              if (n.op === '^' && !n.args[1].depends && n.args[1].base < 0) sig.push(Math.sign(a));
            }
          }
        }
        if (!Number.isFinite(v)) return signature ? { value: NaN, signature: 'invalid' } : NaN;
        vals[n.id] = v;
      }
      return signature ? { value: vals[ast.id], signature: sig.join(',') } : vals[ast.id];
    }
    // Exact breakpoints of the frozen APD graph along a finite line segment.
    function lineModel(start, end) {
      const pieces = [];
      const MAX = 12000;
      for (const n of nodes) {
        if (!n.depends) {
          pieces[n.id] = [{ lo: 0, hi: 1, m: 0, b: n.base }];
          continue;
        }
        if (n.op === 'x' || n.op === 'y') {
          let j = n.op === 'x' ? 0 : 1;
          pieces[n.id] = [{ lo: 0, hi: 1, m: end[j] - start[j], b: start[j] }];
          continue;
        }
        const lists = n.args.map((a) => pieces[a.id]),
          cuts = [...new Set([0, 1, ...lists.flatMap((a) => a.flatMap((p) => [p.lo, p.hi]))])].sort(
            (a, b) => a - b
          ),
          out = [],
          idx = lists.map(() => 0);
        function add(lo, hi, m, b) {
          if (!(hi > lo)) return;
          const last = out[out.length - 1];
          if (last && last.hi === lo && last.m === m && last.b === b) last.hi = hi;
          else out.push({ lo, hi, m, b });
          if (out.length > MAX)
            throw Error(
              'This model has too many pieces to draw. Reduce the domain or simplify the expression.'
            );
        }
        for (let i = 0; i < cuts.length - 1; i++) {
          const lo = cuts[i],
            hi = cuts[i + 1],
            mid = (lo + hi) / 2,
            ps = lists.map((list, j) => {
              while (idx[j] < list.length - 1 && list[idx[j]].hi <= lo) idx[j]++;
              return list[idx[j]];
            });
          if (['abs', 'relu', 'min', 'max'].includes(n.op)) {
            const a = ps[0],
              b = ps[1] || { m: 0, b: 0 };
            let m = a.m - b.m,
              q = a.b - b.b,
              root = m === 0 ? NaN : -q / m,
              sub = [lo];
            if (root > lo && root < hi) sub.push(root);
            sub.push(hi);
            for (let j = 0; j < sub.length - 1; j++) {
              const left = sub[j],
                right = sub[j + 1],
                positive = m * (left + (right - left) / 2) + q >= 0;
              if (n.op === 'abs') add(left, right, positive ? a.m : -a.m, positive ? a.b : -a.b);
              else if (n.op === 'relu') add(left, right, positive ? a.m : 0, positive ? a.b : 0);
              else {
                const chosen = (n.op === 'max' ? positive : !positive) ? a : b;
                add(left, right, chosen.m, chosen.b);
              }
            }
          } else {
            const m = ps.reduce((v, p, k) => v + n.c[k] * p.m, 0),
              b = n.base + ps.reduce((v, p, k) => v + n.c[k] * (p.b - n.args[k].base), 0);
            add(lo, hi, m, b);
          }
        }
        pieces[n.id] = out;
      }
      const out = pieces[ast.id],
        ts = [out[0].lo, ...out.map((p) => p.hi)];
      return ts.map((t) => ({
        t,
        value: evaluate(
          start.map((v, j) => v + (end[j] - v) * t),
          true
        ),
      }));
    }
    // Split the input rectangle along every affine switching line; triangulate
    // each resulting convex polygon. No triangle crosses an APD crease.
    function meshModel(bounds) {
      if (dimension !== 2) throw Error('Surface meshes require two inputs.');
      const [xmin, xmax, ymin, ymax] = bounds;
      if (!bounds.every(Number.isFinite) || !(xmin < xmax && ymin < ymax))
        throw Error('Invalid mesh bounds.');
      let regions = [
        {
          poly: [
            [xmin, ymin],
            [xmax, ymin],
            [xmax, ymax],
            [xmin, ymax],
          ],
          values: [],
        },
      ];
      const at = (a, p) => a[0] * p[0] + a[1] * p[1] + a[2];
      function clip(poly, a, positive) {
        let out = [];
        for (let j = 0; j < poly.length; j++) {
          let p = poly[j],
            q = poly[(j + 1) % poly.length],
            fp = at(a, p),
            fq = at(a, q),
            ip = positive ? fp >= 0 : fp <= 0,
            iq = positive ? fq >= 0 : fq <= 0;
          if (ip) out.push(p);
          if (ip !== iq) {
            let t = fp / (fp - fq);
            out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
          }
        }
        return out.filter((p, j) => j === 0 || p[0] !== out[j - 1][0] || p[1] !== out[j - 1][1]);
      }
      for (const n of nodes) {
        const next = [];
        for (const r of regions) {
          if (!n.depends) {
            r.values[n.id] = [0, 0, n.base];
            next.push(r);
            continue;
          }
          if (n.op === 'x' || n.op === 'y') {
            r.values[n.id] = n.op === 'x' ? [1, 0, 0] : [0, 1, 0];
            next.push(r);
            continue;
          }
          const args = n.args.map((a) => r.values[a.id]);
          if (['abs', 'relu', 'min', 'max'].includes(n.op)) {
            const a = args[0],
              b = args[1] || [0, 0, 0],
              diff = a.map((v, j) => v - b[j]),
              vals = r.poly.map((p) => at(diff, p));
            const hasPos = vals.some((v) => v > 0),
              hasNeg = vals.some((v) => v < 0),
              signs = hasPos && hasNeg ? [true, false] : [!hasNeg];
            for (const positive of signs) {
              const poly = signs.length === 2 ? clip(r.poly, diff, positive) : r.poly;
              if (poly.length < 3) continue;
              let value;
              if (n.op === 'abs') value = a.map((v) => (positive ? v : -v));
              else if (n.op === 'relu') value = positive ? a : [0, 0, 0];
              else value = (n.op === 'max' ? positive : !positive) ? a : b;
              const values = r.values.slice();
              values[n.id] = value;
              next.push({ poly, values });
            }
          } else {
            const value = [0, 0, n.base];
            for (let k = 0; k < args.length; k++) {
              value[0] += n.c[k] * args[k][0];
              value[1] += n.c[k] * args[k][1];
              value[2] += n.c[k] * (args[k][2] - n.args[k].base);
            }
            r.values[n.id] = value;
            next.push(r);
          }
        }
        if (next.length > 6000)
          throw Error(
            'This model has too many surface regions to draw. Reduce the domain or simplify the expression.'
          );
        regions = next;
      }
      const mesh = {
        x: [],
        y: [],
        z: [],
        i: [],
        j: [],
        k: [],
        edges: { x: [], y: [], z: [] },
        regions: regions.length,
      };
      for (const r of regions) {
        const offset = mesh.x.length;
        for (const p of r.poly) {
          mesh.x.push(p[0]);
          mesh.y.push(p[1]);
          mesh.z.push(evaluate(p, true));
        }
        for (let j = 1; j < r.poly.length - 1; j++) {
          mesh.i.push(offset);
          mesh.j.push(offset + j);
          mesh.k.push(offset + j + 1);
        }
        for (const p of [...r.poly, r.poly[0]]) {
          mesh.edges.x.push(p[0]);
          mesh.edges.y.push(p[1]);
          mesh.edges.z.push(evaluate(p, true));
        }
        for (const key of ['x', 'y', 'z']) mesh.edges[key].push(null);
      }
      return mesh;
    }
    const ad = (point) =>
      ast.base + ast.grad.reduce((sum, g, j) => sum + g * (point[j] - ref[j]), 0);
    const expressions = [];
    for (const n of nodes) {
      let e;
      if (n.op === 'const') e = fmt(n.base);
      else if (n.op === 'x' || n.op === 'y') e = n.op;
      else {
        const a = n.args.map((arg) => 'v' + arg.id);
        if (!n.depends) e = fmt(n.base);
        else if (['abs', 'relu', 'max', 'min'].includes(n.op)) e = `${n.op}(${a.join(', ')})`;
        else
          e =
            fmt(n.base) +
            n.args
              .map((arg, k) =>
                n.c[k] === 0
                  ? ''
                  : ` ${n.c[k] < 0 ? '−' : '+'} ${fmt(Math.abs(n.c[k]))}·(${a[k]} − (${fmt(arg.base)}))`
              )
              .join('');
      }
      expressions.push(e);
    }
    return {
      source,
      dimension,
      reference: ref,
      referenceValue: ast.base,
      gradient: ast.grad.slice(),
      kinks,
      lineModel,
      meshModel,
      nodes: nodes.map((n) => ({
        id: n.id,
        op: n.op,
        base: n.base,
        gradient: n.grad.slice(),
        args: n.args.map((a) => a.id),
        formula: expressions[n.id],
      })),
      value: (p) => evaluate(p),
      model: (p) => evaluate(p, true),
      ad,
      sample: (p) => evaluate(p, false, true),
      kinkSlope,
    };
  }
  return { parse, compile, format: fmt };
});
