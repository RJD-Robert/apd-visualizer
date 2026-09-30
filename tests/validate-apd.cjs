#!/usr/bin/env node
/* Independent numerical checks against analytic oracles.
 * Usage: node tests/validate-apd.cjs [path/to/engine.js]
 * Every expected APD formula below is derived by hand, outside the engine.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const enginePath = path.resolve(process.argv[2] || path.join(__dirname, '../dist/engine.js'));
let APD;
try {
  APD = require(enginePath);
  if (APD.APD) APD = APD.APD;
} catch (error) {
  if (!['ERR_REQUIRE_ESM', 'ERR_REQUIRE_ASYNC_MODULE'].includes(error.code)) throw error;
  const sandbox = { console, Math, Number, Array, Object, JSON };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(enginePath, 'utf8'), sandbox, { filename: enginePath });
  APD = sandbox.APD;
}
if (!APD || typeof APD.compile !== 'function') throw new Error('Engine must expose APD.compile');

const results = [];
let assertions = 0;
function close(actual, expected, label, tolerance = 2e-11) {
  assertions++;
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(expected) ||
    Math.abs(actual - expected) > tolerance * Math.max(1, Math.abs(expected))
  ) {
    throw new Error(`${label}: got ${actual}, expected ${expected}`);
  }
}
function check(condition, label) {
  assertions++;
  if (!condition) throw new Error(label);
}
function rejects(action, label) {
  assertions++;
  let rejected = false;
  try {
    action();
  } catch (_) {
    rejected = true;
  }
  if (!rejected) throw new Error(`${label}: invalid input was accepted`);
}
function invalidNumber(action, label) {
  assertions++;
  let result;
  try {
    result = action();
  } catch (_) {
    return;
  }
  if (typeof result !== 'number' || Number.isFinite(result)) {
    throw new Error(`${label}: expected a thrown error or non-finite number, got ${result}`);
  }
}
function test(name, action) {
  const start = assertions;
  try {
    action();
    results.push({ name, ok: true, assertions: assertions - start });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({ name, ok: false, assertions: assertions - start, error: error.message });
    process.stdout.write(`FAIL ${name}: ${error.message}\n`);
  }
}
const xs = [-3, -1.3, -0.5, 0, 0.2, 0.5, 1, 1.25, 2, 3.7];
const points = [
  [-2, -1],
  [-0.6, 0.4],
  [0, 0],
  [0.3, -0.2],
  [0.5, 1],
  [1, -2],
  [2.3, 1.7],
];

test('Affine functions are exact in 1D and 2D', () => {
  const one = APD.compile('3*x-7', 1, [0.2]);
  for (const x of xs)
    for (const method of ['value', 'model', 'ad']) {
      close(one[method]([x]), 3 * x - 7, `${method} affine 1D at ${x}`);
    }
  const two = APD.compile('x-2*y+7', 2, [0.3, -0.7]);
  for (const p of points)
    for (const method of ['value', 'model', 'ad']) {
      close(two[method](p), p[0] - 2 * p[1] + 7, `${method} affine 2D at ${p}`);
    }
});

test('A smooth quadratic has the ordinary tangent model', () => {
  const f = APD.compile('x*x', 1, [2]);
  close(f.gradient[0], 4, 'quadratic derivative');
  for (const x of xs) {
    close(f.value([x]), x * x, `quadratic original at ${x}`);
    close(f.model([x]), 4 * x - 4, `quadratic APD at ${x}`);
    close(f.ad([x]), 4 * x - 4, `quadratic AD at ${x}`);
  }
});

test('An abs operation preserves its kink globally', () => {
  const f = APD.compile('abs(x)', 1, [0.5]);
  for (const x of xs) {
    close(f.model([x]), Math.abs(x), `abs APD at ${x}`);
    close(f.ad([x]), x, `abs AD at ${x}`);
  }
});

test('A nonlinear abs argument moves the tangent-model kink', () => {
  const f = APD.compile('abs(x*x-1)', 1, [0.5]);
  for (const x of xs) {
    close(f.model([x]), Math.abs(x - 1.25), `moved kink APD at ${x}`);
    close(f.ad([x]), 1.25 - x, `moved kink AD at ${x}`);
  }
  close(f.model([1.25]), 0, 'APD kink at 1.25');
  close(f.value([1.25]), 0.5625, 'original has no kink at 1.25');
});

test('A smooth operation after abs is linearized at original node values', () => {
  const f = APD.compile('(abs(x)-1)^2', 1, [2]);
  for (const x of xs) {
    close(f.model([x]), 2 * Math.abs(x) - 3, `square after abs APD at ${x}`);
    close(f.ad([x]), 2 * x - 3, `square after abs AD at ${x}`);
  }
});

test('Products of abs models are linearized, never multiplied together', () => {
  const f = APD.compile('abs(x)*abs(x-1)', 1, [0.25]);
  for (const x of xs) {
    const model = 0.75 * Math.abs(x) + 0.25 * Math.abs(x - 1) - 0.1875;
    close(f.model([x]), model, `product APD at ${x}`);
    close(f.ad([x]), 0.5 * x + 0.0625, `product AD at ${x}`);
  }
});

test('Nested abs of affine arguments is reproduced exactly', () => {
  const f = APD.compile('abs(abs(x)-1)', 1, [0.3]);
  for (const x of xs) close(f.model([x]), Math.abs(Math.abs(x) - 1), `nested APD at ${x}`);
  const g = APD.compile('abs(sin(x)+abs(x-0.2))', 1, [0]);
  for (const x of xs) {
    close(g.model([x]), Math.abs(x + Math.abs(x - 0.2)), `nested smooth APD at ${x}`);
    close(g.ad([x]), 0.2, `nested smooth AD at ${x}`);
  }
});

test('Smooth elementary functions use their analytic derivative', () => {
  const cases = [
    ['sin(x)', 0.3, Math.sin(0.3), Math.cos(0.3)],
    ['cos(x)', 0.3, Math.cos(0.3), -Math.sin(0.3)],
    ['tan(x)', 0.3, Math.tan(0.3), 1 / Math.cos(0.3) ** 2],
    ['exp(x)', 0.3, Math.exp(0.3), Math.exp(0.3)],
    ['log(x)', 2, Math.log(2), 0.5],
    ['sqrt(x)', 2, Math.sqrt(2), 1 / (2 * Math.sqrt(2))],
    ['sinh(x)', 0.3, Math.sinh(0.3), Math.cosh(0.3)],
    ['cosh(x)', 0.3, Math.cosh(0.3), Math.sinh(0.3)],
    ['tanh(x)', 0.3, Math.tanh(0.3), 1 / Math.cosh(0.3) ** 2],
    ['atan(x)', 0.3, Math.atan(0.3), 1 / 1.09],
    ['asin(x)', 0.3, Math.asin(0.3), 1 / Math.sqrt(0.91)],
    ['acos(x)', 0.3, Math.acos(0.3), -1 / Math.sqrt(0.91)],
  ];
  for (const [expr, ref, value, derivative] of cases) {
    const f = APD.compile(expr, 1, [ref]);
    close(f.referenceValue, value, `${expr} reference`);
    close(f.gradient[0], derivative, `${expr} derivative`);
    for (const x of xs) {
      close(f.model([x]), value + derivative * (x - ref), `${expr} APD at ${x}`);
      close(f.ad([x]), value + derivative * (x - ref), `${expr} AD at ${x}`);
    }
  }
});

test('An abs applied to a smooth function retains a transformed kink', () => {
  const ref = Math.PI / 6;
  const f = APD.compile('abs(sin(x))', 1, [ref]);
  for (const x of xs)
    close(f.model([x]), Math.abs(0.5 + (Math.sqrt(3) / 2) * (x - ref)), `abs sine at ${x}`);
});

test('Two-input mixed smooth and nonsmooth product matches a hand-derived model', () => {
  const f = APD.compile('sin(x)*abs(y-0.4)', 2, [0.3, -0.2]);
  for (const [x, y] of points) {
    close(f.value([x, y]), Math.sin(x) * Math.abs(y - 0.4), `mixed original at ${x},${y}`);
    close(
      f.model([x, y]),
      0.6 * Math.cos(0.3) * (x - 0.3) + Math.sin(0.3) * Math.abs(y - 0.4),
      `mixed APD at ${x},${y}`
    );
    close(
      f.ad([x, y]),
      0.6 * Math.sin(0.3) + 0.6 * Math.cos(0.3) * (x - 0.3) - Math.sin(0.3) * (y + 0.2),
      `mixed AD at ${x},${y}`
    );
  }
});

test('Division after abs is an affine combination of the child models', () => {
  const f = APD.compile('abs(x)/(2+abs(y))', 2, [0.5, -0.5]);
  for (const [x, y] of points) {
    close(
      f.model([x, y]),
      0.4 * Math.abs(x) - 0.08 * Math.abs(y) + 0.04,
      `quotient APD at ${x},${y}`
    );
    close(f.ad([x, y]), 0.2 + 0.4 * (x - 0.5) + 0.08 * (y + 0.5), `quotient AD at ${x},${y}`);
  }
});

test('Constant and variable powers use the correct partial derivatives', () => {
  for (const expression of ['x^3', 'x**3', 'pow(x,3)']) {
    const f = APD.compile(expression, 1, [-2]);
    for (const x of xs) close(f.model([x]), -8 + 12 * (x + 2), `${expression} tangent at ${x}`);
  }
  const variablePower = APD.compile('(2+abs(x))^y', 2, [1, 2]);
  for (const [x, y] of points) {
    close(
      variablePower.model([x, y]),
      9 + 6 * (Math.abs(x) - 1) + 9 * Math.log(3) * (y - 2),
      `variable power model at ${x},${y}`
    );
    close(
      variablePower.ad([x, y]),
      9 + 6 * (x - 1) + 9 * Math.log(3) * (y - 2),
      `variable power AD at ${x},${y}`
    );
  }
  rejects(() => APD.compile('x^y', 2, [-1, 2]), 'variable power needs a positive reference base');
});

test('min, max, and ReLU preserve switching between child models', () => {
  const maximum = APD.compile('max(x*x,y*y)', 2, [0.5, -1]);
  const minimum = APD.compile('min(x*x,y*y)', 2, [0.5, -1]);
  for (const [x, y] of points) {
    close(maximum.model([x, y]), Math.max(x - 0.25, -2 * y - 1), `max model at ${x},${y}`);
    close(minimum.model([x, y]), Math.min(x - 0.25, -2 * y - 1), `min model at ${x},${y}`);
    close(maximum.ad([x, y]), -2 * y - 1, `max AD at ${x},${y}`);
    close(minimum.ad([x, y]), x - 0.25, `min AD at ${x},${y}`);
  }
  const relu = APD.compile('relu(x*x-1)', 1, [0.5]);
  for (const x of xs) close(relu.model([x]), Math.max(0, x - 1.25), `ReLU model at ${x}`);
});

test('Every model interpolates its original function at the reference', () => {
  const expressions = [
    'abs(x*x-y)+sin(x*y)',
    'exp(abs(x-y))/(2+abs(y))',
    'max(sin(x),y*y)+min(x*x,abs(y))',
    'sqrt(1+x*x+y*y)+abs(abs(x)-abs(y))',
  ];
  for (const expression of expressions)
    for (const reference of points) {
      const f = APD.compile(expression, 2, reference);
      const original = f.value(reference);
      close(f.referenceValue, original, `${expression} stored reference at ${reference}`);
      close(f.model(reference), original, `${expression} APD interpolation at ${reference}`);
      close(f.ad(reference), original, `${expression} AD interpolation at ${reference}`);
    }
});

test('Ordinary AD agrees with independent central differences away from kinks', () => {
  const expressions = [
    'sin(x)*exp(y)+x*x/(2+y*y)',
    'abs(x*x-y)+cos(x+y)',
    'max(sin(x),y*y)+log(3+x*x)',
  ];
  const references = [
    [0.37, -0.81],
    [1.17, 0.43],
    [-0.63, 1.29],
  ];
  const h = 1e-5;
  for (const expression of expressions)
    for (const reference of references) {
      const f = APD.compile(expression, 2, reference);
      for (let axis = 0; axis < 2; axis++) {
        const left = reference.slice();
        left[axis] -= h;
        const right = reference.slice();
        right[axis] += h;
        const slope = (f.value(right) - f.value(left)) / (2 * h);
        close(f.gradient[axis], slope, `${expression} AD axis ${axis} at ${reference}`, 3e-9);
      }
    }
});

test('At an abs kink, the selected AD slope does not change the APD model', () => {
  for (const slope of [-1, 0, 1]) {
    const f = APD.compile('abs(x)', 1, [0], slope);
    close(f.gradient[0], slope, `abs kink derivative convention ${slope}`);
    for (const x of xs) {
      close(f.model([x]), Math.abs(x), `APD independent of convention ${slope} at ${x}`);
      close(f.ad([x]), slope * x, `AD convention ${slope} at ${x}`);
    }
  }
});

test('ReLU and max tie derivatives follow the abs slope convention', () => {
  for (const slope of [-1, 0, 1]) {
    const relu = APD.compile('relu(x)', 1, [0], slope);
    const maximum = APD.compile('max(x,0)', 1, [0], slope);
    const minimum = APD.compile('min(x,0)', 1, [0], slope);
    close(relu.gradient[0], (1 + slope) / 2, `ReLU tie slope ${slope}`);
    close(maximum.gradient[0], (1 + slope) / 2, `max tie slope ${slope}`);
    close(minimum.gradient[0], (1 - slope) / 2, `min tie slope ${slope}`);
  }
});

test('Constants do not acquire spurious undefined smooth derivatives', () => {
  for (const [expression, expected] of [
    ['sqrt(0)+x', 2],
    ['asin(1)+x', Math.PI / 2 + 2],
    ['x^0', 1],
    ['0^0+x', 3],
  ]) {
    const f = APD.compile(expression, 1, [0]);
    close(f.value([2]), expected, `${expression} original`);
    close(f.model([2]), expected, `${expression} model`);
  }
  for (const expression of ['sqrt(x)', 'sqrt(x*x)', 'asin(x)', 'acos(x)']) {
    const reference = expression.includes('asin') || expression.includes('acos') ? [1] : [0];
    rejects(
      () => APD.compile(expression, 1, reference),
      `${expression} lacks a finite smooth elemental derivative`
    );
  }
});

test('Equivalent original functions may have different APD computational graphs', () => {
  const smooth = APD.compile('x^2', 1, [1]);
  const throughAbs = APD.compile('abs(x)^2', 1, [1]);
  for (const x of xs) {
    close(smooth.value([x]), throughAbs.value([x]), `equivalent originals at ${x}`);
    close(smooth.model([x]), 2 * x - 1, `smooth graph model at ${x}`);
    close(throughAbs.model([x]), 2 * Math.abs(x) - 1, `abs graph model at ${x}`);
  }
});

test('APD local remainder is second order across a switching surface', () => {
  const f = APD.compile('abs(exp(x)-1)', 1, [0]);
  for (const sign of [-1, 1]) {
    const errors = [0.04, 0.02, 0.01].map((h) =>
      Math.abs(f.value([sign * h]) - f.model([sign * h]))
    );
    for (let i = 1; i < errors.length; i++) {
      const ratio = errors[i - 1] / errors[i];
      check(ratio > 3.9 && ratio < 4.1, `quadratic remainder on side ${sign}: ratio=${ratio}`);
    }
  }
  const g = APD.compile('abs(x*x-y)', 2, [0, 0]);
  for (const h of [0.1, 0.03, 0.01, 0.003]) {
    close(Math.abs(g.value([h, h]) - g.model([h, h])), h * h, `2D quadratic remainder at h=${h}`);
  }
});

test('Within a fixed abs region the model is affine', () => {
  const f = APD.compile('exp(abs(x-y))+abs(x*x-y)+x*y', 2, [0.4, -0.2]);
  const a = [0.6, -0.5],
    b = [1.2, -0.1];
  // On this entire segment x-y > 0 and 0.8*x-y-0.16 > 0.
  for (const t of [0.1, 0.25, 0.5, 0.9]) {
    const p = a.map((v, i) => (1 - t) * v + t * b[i]);
    close(f.model(p), (1 - t) * f.model(a) + t * f.model(b), `affine segment at t=${t}`);
  }
});

test('Parser follows mathematical unary and power precedence', () => {
  const cases = [
    ['-x^2', -4],
    ['(-x)^2', 4],
    ['2^3^2', 512],
    ['x^-2', 0.25],
    ['1e-3*x+.5', 0.502],
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['sin(pi/2)+cos(π)+ln(e)', 1],
    [' − x ^ 2 ', -4],
    ['8/4/2', 1],
    ['5-3-1', 1],
  ];
  for (const [expression, value] of cases) {
    const f = APD.compile(expression, 1, [2]);
    close(f.value([2]), value, `precedence ${expression}`);
  }
});

test('Invalid syntax and unknown identifiers are rejected', () => {
  for (const expression of [
    '',
    'x+',
    'abs()',
    'abs(x,y)',
    'max(x)',
    'x;1',
    'x=2',
    'x.foo',
    'unknown(x)',
    'z+1',
    'window.alert(1)',
    '[x]',
    'x<1',
  ]) {
    rejects(() => APD.compile(expression, 1, [0.3]), `reject ${JSON.stringify(expression)}`);
  }
  rejects(() => APD.compile('y+1', 1, [0.3]), 'reject y in 1D');
});

test('Reference-domain errors are rejected explicitly', () => {
  for (const expression of ['log(x)', 'sqrt(x)', '1/x']) {
    const reference = expression === 'sqrt(x)' ? [-1] : [0];
    rejects(() => APD.compile(expression, 1, reference), `${expression} invalid reference`);
  }
  for (const expression of ['log(-1)', 'sqrt(-1)', 'exp(1000)', '1/0', 'tan(pi/2)', '(-1)^0.5']) {
    rejects(() => APD.compile(expression, 1, [0]), `${expression} invalid constant`);
  }
  for (const reference of [[NaN], [Infinity], [], ['1']]) {
    rejects(() => APD.compile('x', 1, reference), 'invalid reference coordinate');
  }
  rejects(() => APD.compile('x+y', 2, [1]), 'missing second reference coordinate');
  rejects(() => APD.compile('x', 3, [1, 2, 3]), 'invalid dimension');
  rejects(() => APD.compile('x', 1, [0], 0.2), 'invalid kink convention');
});

test('Original-function domain failures away from reference do not corrupt the model', () => {
  const log = APD.compile('log(x)', 1, [1]);
  invalidNumber(() => log.value([-1]), 'log outside domain');
  close(log.model([-1]), -2, 'log tangent exists outside original domain');
  const sqrt = APD.compile('sqrt(x)', 1, [1]);
  invalidNumber(() => sqrt.value([-1]), 'sqrt outside domain');
  close(sqrt.model([-1]), 0, 'sqrt tangent exists outside original domain');
  const quotient = APD.compile('1/x', 1, [1]);
  invalidNumber(() => quotient.value([0]), 'division by zero');
  close(quotient.model([0]), 2, 'quotient tangent exists at original pole');
});

test('Plot sampling signatures distinguish branches across common poles', () => {
  const cases = [
    ['1/x', [-1], [1], [0]],
    ['x^-2', [-1], [1], [0]],
    ['tan(x)', [1.5], [1.7], [Math.PI / 2]],
    ['1/(x*x-1)', [0.9], [1.1], [1]],
    ['1/(x*x)', [-0.1], [0.1], [0]],
    ['1/abs(x)', [-0.1], [0.1], [0]],
    ['1/((x-1)^2)', [0.9], [1.1], [1]],
    ['1/((x-1)*(x-1))', [0.9], [1.1], [1]],
  ];
  for (const [expression, left, right, pole] of cases) {
    const f = APD.compile(expression, 1, [0.3]);
    const l = f.sample(left),
      r = f.sample(right),
      p = f.sample(pole);
    close(l.value, f.value(left), `${expression} left sample`);
    close(r.value, f.value(right), `${expression} right sample`);
    check(l.signature !== r.signature, `${expression} should split plotting across its pole`);
    check(!Number.isFinite(p.value), `${expression} should mask pole sample`);
  }
});

test('Constant operands cannot create irrelevant partial-derivative overflow', () => {
  const f = APD.compile('x/1e-200', 1, [1]);
  close(f.gradient[0], 1e200, 'scaled linear derivative');
  close(f.model([2]), 2e200, 'scaled linear model');
  const g = APD.compile('pow(1e-300,x)', 1, [-0.5]);
  close(g.gradient[0], 1e150 * Math.log(1e-300), 'constant tiny-base power derivative');
  close(g.model([-0.5]), 1e150, 'constant tiny-base power interpolation');
});

test('Small but representable tanh and atan derivatives are retained', () => {
  const tanh = APD.compile('tanh(x)', 1, [20]);
  const tanhExpected = 1 / Math.cosh(20) ** 2;
  close(tanh.gradient[0] / tanhExpected, 1, 'tanh derivative relative accuracy');
  check(tanh.gradient[0] > 0, 'tanh derivative should not round to zero prematurely');
  const atan = APD.compile('atan(x)', 1, [1e155]);
  close(atan.gradient[0] / 1e-310, 1, 'atan subnormal derivative relative accuracy', 1e-10);
  check(atan.gradient[0] > 0, 'atan derivative should not disappear through intermediate overflow');
});

test('Fractional powers at zero reject missing open real neighborhoods', () => {
  for (const expression of ['x^0.5', 'x^1.5', 'x^2.5']) {
    rejects(
      () => APD.compile(expression, 1, [0]),
      `${expression} is not a smooth real elemental at zero`
    );
  }
  const constant = APD.compile('0^1.5+x', 1, [0]);
  close(constant.model([2]), 2, 'constant fractional power at zero is allowed');
});

function checkLine(f, start, end, oracle, label, denseCount = 257, tolerance = 2e-9) {
  const samples = f.lineModel(start, end);
  check(samples.length >= 2, `${label}: endpoints present`);
  close(samples[0].t, 0, `${label}: first parameter`);
  close(samples[samples.length - 1].t, 1, `${label}: last parameter`);
  const at = (t) => start.map((v, j) => v + (end[j] - v) * t);
  for (let index = 0; index < samples.length; index++) {
    const s = samples[index];
    close(s.value, oracle(at(s.t)), `${label}: breakpoint ${index}`, tolerance);
    if (index) {
      const previous = samples[index - 1];
      check(s.t > previous.t, `${label}: strictly increasing parameters`);
      // A dense uniform grid alone can miss narrow pieces. Check every piece too.
      for (const fraction of [0.137, 0.5, 0.863]) {
        const t = previous.t + fraction * (s.t - previous.t);
        const linear = previous.value + fraction * (s.value - previous.value);
        close(linear, oracle(at(t)), `${label}: exact segment ${index} at ${fraction}`, tolerance);
      }
    }
  }
  let segment = 1;
  for (let j = 0; j <= denseCount; j++) {
    const t = j / denseCount;
    while (segment < samples.length - 1 && samples[segment].t < t) segment++;
    const left = samples[segment - 1],
      right = samples[segment];
    const ratio = (t - left.t) / (right.t - left.t);
    close(
      left.value + ratio * (right.value - left.value),
      oracle(at(t)),
      `${label}: dense interpolation at ${t}`,
      tolerance
    );
  }
  return samples;
}

test('Exact 1D line meshes include analytically known shifted and nested kinks', () => {
  const shifted = APD.compile('abs(x*x-1)', 1, [0.5]);
  const shiftedSamples = checkLine(
    shifted,
    [-2],
    [2],
    (p) => Math.abs(p[0] - 1.25),
    'shifted kink'
  );
  check(
    shiftedSamples.some((p) => Math.abs(p.t - 0.8125) < 1e-13),
    'shifted kink parameter is present'
  );
  const nested = APD.compile('abs(abs(x)-1)', 1, [0.3]);
  const nestedSamples = checkLine(
    nested,
    [-2],
    [2],
    (p) => Math.abs(Math.abs(p[0]) - 1),
    'nested kinks'
  );
  for (const t of [0.25, 0.5, 0.75])
    check(
      nestedSamples.some((p) => Math.abs(p.t - t) < 1e-13),
      `nested kink ${t} is present`
    );
  checkLine(nested, [2], [-2], (p) => Math.abs(Math.abs(p[0]) - 1), 'reversed nested kinks');
  checkLine(nested, [0.3], [0.3], (p) => Math.abs(Math.abs(p[0]) - 1), 'constant line');
});

test('Exact line meshes preserve very narrow features missed by uniform sampling', () => {
  const center = 0.1234567,
    width = 2e-9;
  const nested = APD.compile(`abs(abs(x-${center})-${width})`, 1, [0]);
  const samples = checkLine(
    nested,
    [-1],
    [1],
    (p) => Math.abs(Math.abs(p[0] - center) - width),
    'narrow nested kinks'
  );
  for (const x of [center - width, center, center + width]) {
    check(
      samples.some((p) => Math.abs(2 * p.t - 1 - x) < 2e-15),
      `narrow kink ${x} is present`
    );
  }
  const peak = APD.compile('relu(1-1e8*abs(x-0.1234567))', 1, [0]);
  // Coefficients near 1e8 amplify ordinary double-precision cancellation near the peak.
  const peakSamples = checkLine(
    peak,
    [-1],
    [1],
    (p) => Math.max(0, 1 - 1e8 * Math.abs(p[0] - center)),
    'narrow ReLU peak',
    256,
    2e-8
  );
  check(
    peakSamples.some((p) => p.value > 0.99999998),
    'narrow peak maximum is preserved'
  );
});

test('Exact line meshes match an independent APD formula on arbitrary 2D segments', () => {
  const expression = 'exp(abs(x-y))+abs(x*x-y)+x*y+max(sin(x),y*y)';
  const f = APD.compile(expression, 2, [0.4, -0.2]);
  const oracle = ([x, y]) =>
    Math.exp(0.6) * (0.4 + Math.abs(x - y)) +
    Math.abs(0.8 * x - y - 0.16) +
    0.08 -
    0.2 * x +
    0.4 * y +
    Math.max(Math.sin(0.4) + Math.cos(0.4) * (x - 0.4), -0.4 * y - 0.04);
  for (const [start, end] of [
    [
      [-2, -1],
      [2.1, 1.8],
    ],
    [
      [2, -2],
      [-1, 2],
    ],
    [
      [0, -2],
      [0, 2],
    ],
    [
      [-2, 1],
      [2, 1],
    ],
  ]) {
    checkLine(f, start, end, oracle, `2D line ${start} to ${end}`);
  }
});

function checkMesh(f, bounds, oracle, label) {
  const mesh = f.meshModel(bounds);
  const [xmin, xmax, ymin, ymax] = bounds;
  check(
    mesh.x.length === mesh.y.length && mesh.x.length === mesh.z.length,
    `${label}: vertex array lengths`
  );
  check(
    mesh.i.length === mesh.j.length && mesh.i.length === mesh.k.length,
    `${label}: triangle array lengths`
  );
  check(mesh.x.length >= 4 && mesh.i.length >= 2, `${label}: nonempty rectangle mesh`);
  check(
    Number.isInteger(mesh.regions) && mesh.regions > 0,
    `${label}: positive integer region count`
  );
  let totalArea = 0;
  const triangles = [];
  for (let v = 0; v < mesh.x.length; v++) {
    const p = [mesh.x[v], mesh.y[v]];
    check(
      p[0] >= xmin - 1e-12 && p[0] <= xmax + 1e-12 && p[1] >= ymin - 1e-12 && p[1] <= ymax + 1e-12,
      `${label}: vertex ${v} within bounds`
    );
    close(mesh.z[v], oracle(p), `${label}: vertex ${v} analytic height`, 3e-10);
  }
  for (let t = 0; t < mesh.i.length; t++) {
    const indices = [mesh.i[t], mesh.j[t], mesh.k[t]];
    for (const index of indices)
      check(
        Number.isInteger(index) && index >= 0 && index < mesh.x.length,
        `${label}: valid triangle index`
      );
    const vertices = indices.map((index) => [mesh.x[index], mesh.y[index], mesh.z[index]]);
    const [a, b, c] = vertices;
    const area = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    check(area >= -1e-13, `${label}: counterclockwise triangle ${t}`);
    totalArea += Math.abs(area);
    triangles.push({ vertices, area });
    for (const weights of [
      [1 / 3, 1 / 3, 1 / 3],
      [0.13, 0.31, 0.56],
      [0.71, 0.17, 0.12],
      [0.03, 0.88, 0.09],
    ]) {
      const p = [0, 1].map((axis) => vertices.reduce((sum, v, j) => sum + weights[j] * v[axis], 0));
      const height = vertices.reduce((sum, v, j) => sum + weights[j] * v[2], 0);
      close(height, oracle(p), `${label}: affine triangle ${t} analytic height`, 3e-10);
      close(height, f.model(p), `${label}: affine triangle ${t} model height`, 3e-10);
    }
  }
  close(
    totalArea,
    (xmax - xmin) * (ymax - ymin),
    `${label}: total triangle area covers rectangle`,
    3e-11
  );
  // Area alone could hide an overlap paired with a gap. Independently probe
  // triangle interiors with a reproducible pseudo-random point sequence.
  let seed = 123456789;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
  for (let n = 0; n < 61; n++) {
    const p = [xmin + (xmax - xmin) * random(), ymin + (ymax - ymin) * random()];
    let covering = 0;
    for (const {
      vertices: [a, b, c],
      area,
    } of triangles) {
      if (Math.abs(area) < 1e-18) continue;
      const cross = (v, w) => (w[0] - v[0]) * (p[1] - v[1]) - (w[1] - v[1]) * (p[0] - v[0]);
      if (cross(a, b) > 0 && cross(b, c) > 0 && cross(c, a) > 0) covering++;
    }
    check(covering === 1, `${label}: random point ${n} has ${covering} covering triangles`);
  }
  check(
    mesh.edges.x.length === mesh.edges.y.length && mesh.edges.x.length === mesh.edges.z.length,
    `${label}: edge coordinate arrays match`
  );
  check(
    mesh.edges.x.filter((v) => v === null).length === mesh.regions,
    `${label}: one edge separator per region`
  );
  return mesh;
}

test('Exact 2D polygon meshes match analytic models for all six surface presets', () => {
  const cases = [
    [
      'abs(x-y)+0.2*(x^2+y^2)',
      [0.6, -0.3],
      [-2.5, 2.5, -2.5, 2.5],
      ([x, y]) => Math.abs(x - y) + 0.24 * x - 0.12 * y - 0.09,
    ],
    ['max(x^2,y^2)', [1, 0.5], [-2, 2, -2, 2], ([x, y]) => Math.max(2 * x - 1, y - 0.25)],
    [
      'abs(x)*abs(y)',
      [1, 0.8],
      [-2.5, 2.5, -2.5, 2.5],
      ([x, y]) => 0.8 * Math.abs(x) + Math.abs(y) - 0.8,
    ],
    [
      'abs(sin(x)+y^2-0.5)',
      [0.4, 0.6],
      [-2, 2, -2, 2],
      ([x, y]) => Math.abs(Math.sin(0.4) + Math.cos(0.4) * (x - 0.4) + 1.2 * (y - 0.6) - 0.14),
    ],
    [
      'sin(x)*cos(y)',
      [0.5, 0.4],
      [-3, 3, -3, 3],
      ([x, y]) =>
        Math.sin(0.5) * Math.cos(0.4) +
        Math.cos(0.5) * Math.cos(0.4) * (x - 0.5) -
        Math.sin(0.5) * Math.sin(0.4) * (y - 0.4),
    ],
    [
      'abs(abs(x)-abs(y))+0.3*max(x+y,0)',
      [0.6, 0.3],
      [-2, 2, -2, 2],
      ([x, y]) => Math.abs(Math.abs(x) - Math.abs(y)) + 0.3 * Math.max(x + y, 0),
    ],
  ];
  for (const [expression, reference, bounds, oracle] of cases)
    checkMesh(APD.compile(expression, 2, reference), bounds, oracle, expression);
});

test('Exact 2D meshes retain narrow nested creases and arbitrary rectangle boundaries', () => {
  const expression = 'abs(abs(x-0.123456)-0.000001)+abs(y+0.2)';
  const oracle = ([x, y]) => Math.abs(Math.abs(x - 0.123456) - 0.000001) + Math.abs(y + 0.2);
  const mesh = checkMesh(
    APD.compile(expression, 2, [0, 0]),
    [-1, 1, -1, 1],
    oracle,
    'narrow nested surface'
  );
  for (const x of [0.123455, 0.123456, 0.123457])
    check(
      mesh.x.some((v) => Math.abs(v - x) < 2e-15),
      `mesh contains narrow crease x=${x}`
    );
  const mixed = APD.compile('exp(abs(x-y))+abs(x*x-y)+x*y+max(sin(x),y*y)', 2, [0.4, -0.2]);
  const mixedOracle = ([x, y]) =>
    Math.exp(0.6) * (0.4 + Math.abs(x - y)) +
    Math.abs(0.8 * x - y - 0.16) +
    0.08 -
    0.2 * x +
    0.4 * y +
    Math.max(Math.sin(0.4) + Math.cos(0.4) * (x - 0.4), -0.4 * y - 0.04);
  checkMesh(mixed, [-0.77, 2.31, -1.19, 0.48], mixedOracle, 'asymmetric mixed surface');
});

test('Exact meshes handle identically zero switches and creases on the boundary', () => {
  checkMesh(
    APD.compile('abs(x-x)+max(y,y)', 2, [0, 0]),
    [-1, 1, -1, 1],
    (p) => p[1],
    'zero switch'
  );
  checkMesh(
    APD.compile('abs(x)+relu(y)', 2, [0, 0]),
    [0, 1, 0, 1],
    (p) => p[0] + p[1],
    'boundary switch'
  );
  const f = APD.compile('abs(x)+abs(y)', 2, [0, 0]);
  for (const bounds of [
    [1, -1, -1, 1],
    [-1, 1, 1, -1],
    [-1, 1, 0, 0],
    [-Infinity, 1, -1, 1],
    [0, 1],
  ]) {
    rejects(() => f.meshModel(bounds), 'invalid surface bounds');
  }
  rejects(
    () => APD.compile('x', 1, [0]).meshModel([-1, 1, -1, 1]),
    'surface mesh requires two inputs'
  );
});

test('Combinatorial region limits fail explicitly rather than silently dropping pieces', () => {
  let expression = 'x';
  for (let j = 1; j <= 14; j++) expression = `abs(${expression})-${2 ** -j}`;
  const f = APD.compile(expression, 2, [0.314159, 0]);
  rejects(() => f.lineModel([-1, 0], [1, 0]), 'line mesh exceeds 12000 pieces');
  rejects(() => f.meshModel([-1, 1, -1, 1]), 'surface mesh exceeds 6000 regions');
});

const failed = results.filter((result) => !result.ok);
const summary = {
  enginePath: path.relative(path.join(__dirname, '..'), enginePath).split(path.sep).join('/'),
  tests: results.length,
  assertions,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};
const reportPath = path.join(__dirname, 'validation-report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(
  `\n${summary.passed}/${summary.tests} tests passed; ${assertions} assertions. Report: ${reportPath}\n`
);
if (failed.length) process.exitCode = 1;
