'use strict';
const $ = (id) => document.getElementById(id),
  C = { f: '#128985', apd: '#d76529', ad: '#7962bd', ref: '#193b4b' },
  F = APD.format;
const presets = {
  1: [
    {
      name: 'Absolute value + curvature',
      expression: 'abs(x) + 0.25*x^2',
      ref: [0.6],
      domain: [-3, 3],
      note: 'A preserved kink and a linearized quadratic.',
      title: 'A smooth curve. A sharp corner.',
    },
    {
      name: 'Nested absolute values',
      expression: 'abs(abs(x^2 - 0.5) - 0.2)',
      ref: [1],
      domain: [-1.5, 1.5],
      note: 'The model moves the switching points of a nonlinear argument.',
      title: 'Follow the nested switching points.',
    },
    {
      name: 'Smooth sine',
      expression: 'sin(x)',
      ref: [0.7],
      domain: [-4, 4],
      note: 'Without switching operations, APD and AD coincide.',
      title: 'One smooth function, one tangent.',
    },
    {
      name: 'ReLU with a smooth argument',
      expression: 'relu(sin(x)) + 0.15*x^2',
      ref: [0.5],
      domain: [-4, 4],
      note: 'ReLU is preserved; its sine argument is linearized.',
      title: 'Keep the switch. Linearize the sine.',
    },
    {
      name: 'An exactly piecewise affine function',
      expression: 'abs(x + 1) - 2*abs(x) + 0.5*abs(x - 1)',
      ref: [0.3],
      domain: [-3, 3],
      note: 'APD reproduces this entire function exactly.',
      title: 'When the model is the function.',
    },
    {
      name: 'Two competing smooth branches',
      expression: 'max(sin(x), 0.25*x^2 - 0.5)',
      ref: [0.5],
      domain: [-3, 3],
      note: 'APD linearizes both smooth branches before taking their maximum.',
      title: 'Two branches, preserved competition.',
    },
  ],
  2: [
    {
      name: 'A curved surface with a ridge',
      expression: 'abs(x - y) + 0.2*(x^2 + y^2)',
      ref: [0.6, -0.3],
      domain: [-2.5, 2.5],
      note: 'A diagonal ridge with smooth quadratic curvature.',
      title: 'Explore a ridge in two dimensions.',
    },
    {
      name: 'Maximum of two quadratics',
      expression: 'max(x^2, y^2)',
      ref: [1, 0.5],
      domain: [-2, 2],
      note: 'The APD model is the maximum of two affine planes.',
      title: 'Two planes and their switching line.',
    },
    {
      name: 'Product of absolute values',
      expression: 'abs(x)*abs(y)',
      ref: [1, 0.8],
      domain: [-2.5, 2.5],
      note: 'The product is linearized; both absolute values are preserved.',
      title: 'A product becomes a faceted model.',
    },
    {
      name: 'A nonlinear switching boundary',
      expression: 'abs(sin(x) + y^2 - 0.5)',
      ref: [0.4, 0.6],
      domain: [-2, 2],
      note: 'A curved switching boundary becomes a straight model crease.',
      title: 'From a curved boundary to a crease.',
    },
    {
      name: 'Smooth wave',
      expression: 'sin(x)*cos(y)',
      ref: [0.5, 0.4],
      domain: [-3, 3],
      note: 'Both methods produce the same tangent plane.',
      title: 'A smooth surface and its tangent plane.',
    },
    {
      name: 'Nested piecewise affine surface',
      expression: 'abs(abs(x) - abs(y)) + 0.3*max(x + y, 0)',
      ref: [0.6, 0.3],
      domain: [-2, 2],
      note: 'Every facet is retained by APD.',
      title: 'See every switching surface.',
    },
  ],
};
const S = {
  dim: 1,
  view: 'overlay',
  expression: presets[1][0].expression,
  ref: [0.6, -0.3],
  bounds: [-3, 3, -3, 3],
  angle: 0,
  kink: 0,
  visible: { f: true, apd: true, ad: true },
  compiled: null,
  camera: null,
  revision: 0,
  plotReady: false,
};
const config = {
  responsive: true,
  displaylogo: false,
  scrollZoom: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
  toImageButtonOptions: { format: 'png', filename: 'apd-visualizer', scale: 2 },
};
const grid = {
  gridcolor: '#e9eeee',
  zerolinecolor: '#c5d1d3',
  tickfont: { size: 10, color: '#73858d' },
  title: { font: { size: 11, color: '#596e79' } },
  showline: false,
  automargin: true,
};
function baseLayout() {
  return {
    paper_bgcolor: '#fff',
    plot_bgcolor: '#fff',
    font: {
      family: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      color: '#3e5967',
      size: 11,
    },
    margin: { l: 64, r: 28, t: 23, b: 47 },
    showlegend: false,
    hovermode: 'closest',
    uirevision: S.revision,
  };
}
function formatPoint(p) {
  return '(' + p.map(F).join(', ') + ')';
}
function linspace(a, b, n) {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
function finite(v) {
  return Number.isFinite(v) ? v : null;
}
function uniqueSorted(a) {
  return [...new Set(a)].sort((x, y) => x - y);
}
function lineSpec() {
  if (S.dim === 1)
    return {
      start: [S.bounds[0]],
      end: [S.bounds[1]],
      lo: S.bounds[0],
      hi: S.bounds[1],
      point: (t) => [t],
      axis: 'x',
    };
  const theta = (S.angle * Math.PI) / 180,
    d = [Math.cos(theta), Math.sin(theta)];
  let lo = -Infinity,
    hi = Infinity;
  for (let j = 0; j < 2; j++) {
    if (Math.abs(d[j]) < 1e-12) continue;
    let ends = [(S.bounds[j * 2] - S.ref[j]) / d[j], (S.bounds[j * 2 + 1] - S.ref[j]) / d[j]].sort(
      (a, b) => a - b
    );
    lo = Math.max(lo, ends[0]);
    hi = Math.min(hi, ends[1]);
  }
  // A reference on a corner may point outside both directions. Keep the slice meaningful.
  if (!(hi > lo)) {
    lo = 0;
    hi = 0;
  }
  const point = (t) => S.ref.slice(0, 2).map((r, j) => r + t * d[j]);
  return { start: point(lo), end: point(hi), lo, hi, point, axis: 't · distance from reference' };
}
function lineData(spec) {
  let xs = linspace(spec.lo, spec.hi, 701),
    refT = S.dim === 1 ? S.ref[0] : 0;
  xs.push(refT);
  if (S.compiled.lineModel) {
    const exact = S.compiled.lineModel(spec.start, spec.end);
    xs.push(...exact.map((p) => spec.lo + (spec.hi - spec.lo) * p.t));
  }
  xs = uniqueSorted(xs);
  let rows = [],
    omitted = 0,
    prev = null;
  // Sample midpoints as well; domain-component changes become explicit gaps.
  for (const x of xs) {
    const point = spec.point(x),
      f = S.compiled.sample(point),
      p = S.compiled.model(point),
      a = S.compiled.ad(point);
    let broken = false;
    if (prev) {
      const mid = S.compiled.sample(spec.point((prev.x + x) / 2));
      broken = f.signature !== prev.signature || !Number.isFinite(mid.value);
    }
    if (!Number.isFinite(f.value)) omitted++;
    if (broken) {
      const midX = (prev.x + x) / 2,
        midPoint = spec.point(midX);
      rows.push({
        x: midX,
        f: null,
        apd: finite(S.compiled.model(midPoint)),
        ad: finite(S.compiled.ad(midPoint)),
      });
    }
    rows.push({ x, f: finite(f.value), apd: finite(p), ad: finite(a) });
    prev = { x, signature: f.signature };
  }
  return { rows, omitted };
}
function lineTraces(rows, error = false) {
  const traces = [];
  for (const key of ['f', 'apd', 'ad']) {
    if (!S.visible[key] || (error && key === 'f')) continue;
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: rows.map((r) => r.x),
      y: rows.map((r) =>
        error ? (r.f !== null && r[key] !== null ? Math.abs(r.f - r[key]) : null) : r[key]
      ),
      name: { f: 'Original f', apd: 'APD model P', ad: 'AD approximation A' }[key],
      connectgaps: false,
      line: {
        color: C[key],
        width: key === 'f' ? 3 : 2.5,
        dash: key === 'ad' ? 'dash' : key === 'apd' ? 'dot' : 'solid',
        simplify: false,
      },
      hovertemplate:
        (error ? '|f − model|' : 'value') +
        ' = %{y:.7g}<br>coordinate = %{x:.6g}<extra>%{fullData.name}</extra>',
    });
  }
  return traces;
}
function refTrace(three = false) {
  const t = {
    type: three ? 'scatter3d' : 'scatter',
    mode: 'markers',
    x: [S.ref[0]],
    y: [three ? S.ref[1] : S.compiled.referenceValue],
    name: 'Reference point',
    marker: {
      color: C.ref,
      size: three ? 5.5 : 9,
      symbol: three ? 'diamond' : 'diamond',
      line: { color: 'white', width: 2 },
    },
    hovertemplate:
      'Reference ' +
      formatPoint(S.ref.slice(0, S.dim)) +
      '<br>f = ' +
      F(S.compiled.referenceValue) +
      '<extra></extra>',
    showlegend: false,
  };
  if (three) t.z = [S.compiled.referenceValue];
  return t;
}
function lineLayout(spec, error = false) {
  let l = baseLayout();
  l.xaxis = { ...grid, title: { text: spec.axis }, range: [spec.lo, spec.hi] };
  l.yaxis = {
    ...grid,
    title: { text: error ? 'absolute error' : 'output' },
    rangemode: error ? 'tozero' : 'normal',
  };
  l.hovermode = 'x unified';
  l.dragmode = 'pan';
  let refT = S.dim === 1 ? S.ref[0] : 0;
  l.shapes = [
    {
      type: 'line',
      xref: 'x',
      x0: refT,
      x1: refT,
      yref: 'paper',
      y0: 0,
      y1: 1,
      line: { color: '#a4b5bb', width: 1, dash: 'dot' },
    },
  ];
  if (!error)
    l.annotations = [
      {
        x: refT,
        xref: 'x',
        y: 1,
        yref: 'paper',
        text: S.dim === 1 ? 'x₀' : 'reference',
        showarrow: false,
        xanchor: 'left',
        yanchor: 'bottom',
        font: { size: 10, color: '#6c818b' },
        xshift: 6,
      },
    ];
  return l;
}
function surfaceData() {
  const xs = uniqueSorted([...linspace(S.bounds[0], S.bounds[1], 77), S.ref[0]]),
    ys = uniqueSorted([...linspace(S.bounds[2], S.bounds[3], 77), S.ref[1]]),
    f = [],
    apd = [],
    ad = [],
    sig = [];
  let omitted = 0;
  for (const y of ys) {
    let fr = [],
      pr = [],
      ar = [],
      sr = [];
    for (const x of xs) {
      const p = [x, y],
        sample = S.compiled.sample(p);
      fr.push(finite(sample.value));
      pr.push(finite(S.compiled.model(p)));
      ar.push(finite(S.compiled.ad(p)));
      sr.push(sample.signature);
      if (!Number.isFinite(sample.value)) omitted++;
    }
    f.push(fr);
    apd.push(pr);
    ad.push(ar);
    sig.push(sr);
  }
  // Remove cells adjacent to a known change of domain component, avoiding bridges across poles.
  const masked = f.map((r, j) =>
    r.map((v, i) => {
      if (i > 0 && sig[j][i] !== sig[j][i - 1]) return null;
      if (j > 0 && sig[j][i] !== sig[j - 1][i]) return null;
      return v;
    })
  );
  let values = [S.compiled.referenceValue];
  for (const key of ['f', 'apd', 'ad'])
    if (S.visible[key] || S.view === 'compare')
      for (const row of { f: masked, apd, ad }[key])
        for (const v of row) if (v !== null) values.push(v);
  const mesh = S.compiled.meshModel(S.bounds);
  if (S.visible.apd || S.view === 'compare') values.push(...mesh.z);
  let zmin = Math.min(...values),
    zmax = Math.max(...values),
    pad = (zmax - zmin) * 0.06 || 1;
  return { xs, ys, f: masked, apd, ad, range: [zmin - pad, zmax + pad], omitted, mesh };
}
function sceneLayout(data) {
  const l = baseLayout();
  l.margin = { l: 2, r: 2, t: 10, b: 0 };
  const ax = (name) => ({
    ...grid,
    title: { text: name, font: { size: 12, color: '#506673' } },
    backgroundcolor: '#fafcfb',
    showbackground: true,
    gridcolor: '#dfe7e6',
    zerolinecolor: '#b7c8ca',
    showspikes: false,
  });
  l.scene = {
    xaxis: { ...ax('x'), range: S.bounds.slice(0, 2) },
    yaxis: { ...ax('y'), range: S.bounds.slice(2, 4) },
    zaxis: { ...ax('output'), range: data.range },
    aspectmode: 'manual',
    aspectratio: { x: 1, y: 1, z: 0.7 },
    camera: S.camera || { eye: { x: 1.5, y: 1.6, z: 1.1 } },
    dragmode: 'orbit',
    uirevision: S.revision,
  };
  return l;
}
function surfaceTrace(data, key, opaque = false) {
  if (key === 'apd') {
    const m = data.mesh;
    return {
      type: 'mesh3d',
      x: m.x,
      y: m.y,
      z: m.z,
      i: m.i,
      j: m.j,
      k: m.k,
      name: 'APD model',
      color: C.apd,
      opacity: opaque ? 1 : 0.65,
      flatshading: true,
      lighting: { ambient: 0.7, diffuse: 0.9, specular: 0.1, roughness: 0.9 },
      lightposition: { x: 150, y: 200, z: 400 },
      hovertemplate: 'x = %{x:.5g}<br>y = %{y:.5g}<br>value = %{z:.7g}<extra>APD model</extra>',
    };
  }
  return {
    type: 'surface',
    x: data.xs,
    y: data.ys,
    z: data[key],
    name: { f: 'Original', apd: 'APD model', ad: 'AD approximation' }[key],
    colorscale: [
      [0, C[key]],
      [1, C[key]],
    ],
    showscale: false,
    opacity: opaque ? 1 : key === 'f' ? 0.68 : key === 'apd' ? 0.62 : 0.35,
    connectgaps: false,
    contours: {
      x: { show: !opaque, color: C[key], width: 1, highlight: false },
      y: { show: !opaque, color: C[key], width: 1, highlight: false },
      z: { show: false },
    },
    lighting: { ambient: 0.75, diffuse: 0.8, specular: 0.1, roughness: 0.9, fresnel: 0.1 },
    lightposition: { x: 150, y: 200, z: 400 },
    hovertemplate:
      'x = %{x:.5g}<br>y = %{y:.5g}<br>value = %{z:.7g}<extra>%{fullData.name}</extra>',
  };
}
function wireTrace(data, key) {
  if (key === 'apd')
    return {
      type: 'scatter3d',
      mode: 'lines',
      ...data.mesh.edges,
      line: { color: '#a6491c', width: 4 },
      hoverinfo: 'skip',
      showlegend: false,
    };
  let x = [],
    y = [],
    z = [];
  const add = (i, j) => {
    x.push(data.xs[i]);
    y.push(data.ys[j]);
    z.push(data[key][j][i]);
  };
  for (let j = 0; j < data.ys.length; j += 6) {
    for (let i = 0; i < data.xs.length; i++) add(i, j);
    x.push(null);
    y.push(null);
    z.push(null);
  }
  for (let i = 0; i < data.xs.length; i += 6) {
    for (let j = 0; j < data.ys.length; j++) add(i, j);
    x.push(null);
    y.push(null);
    z.push(null);
  }
  return {
    type: 'scatter3d',
    mode: 'lines',
    x,
    y,
    z,
    line: { color: C[key], width: 2.5 },
    hoverinfo: 'skip',
    showlegend: false,
  };
}
function attachPlotEvents() {
  if (S.plotReady) return;
  S.plotReady = true;
  $('plot').on('plotly_click', (event) => {
    const p = event.points?.[0];
    if (!p) return;
    if (S.dim === 1 && Number.isFinite(p.x)) {
      $('refx').value = F(p.x);
      readAndRender();
    } else if (S.dim === 2 && S.view === 'error' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      $('refx').value = F(p.x);
      $('refy').value = F(p.y);
      readAndRender();
    }
  });
  $('plot').on('plotly_relayout', (e) => {
    if (e['scene.camera']) S.camera = e['scene.camera'];
  });
}
let renderVersion = 0;
async function render() {
  const version = ++renderVersion,
    c = S.compiled;
  if (!c) return;
  $('ref-value').textContent = F(c.referenceValue);
  $('gradient').textContent = S.dim === 1 ? F(c.gradient[0]) : formatPoint(c.gradient);
  $('grad-label').textContent = S.dim === 1 ? 'AD slope' : 'AD gradient';
  $('interpolation').textContent = 'Models agree';
  $('kink-state').textContent = c.kinks.length
    ? `${c.kinks.length} switching node${c.kinks.length === 1 ? '' : 's'} at a tie · AD convention applies`
    : 'Away from switching points';
  $('kink-state').classList.toggle('at-kink', !!c.kinks.length);
  const term = c.gradient
    .map((g, j) => `${g < 0 ? '−' : '+'} ${F(Math.abs(g))}·(${j ? 'y' : 'x'} − (${F(S.ref[j])}))`)
    .join(' ');
  $('ad-formula').textContent = `A(${S.dim === 1 ? 'x' : 'x, y'}) = ${F(c.referenceValue)} ${term}`;
  $('node-table').replaceChildren(
    ...c.nodes.map((n) => {
      const tr = document.createElement('tr');
      for (const text of ['v' + n.id, n.op, F(n.base), n.formula]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      return tr;
    })
  );
  $('model-output').textContent = 'Final APD model: P = v' + c.nodes[c.nodes.length - 1].id + '.';
  $('kink-explain').textContent =
    S.kink === 0
      ? 'At a tie, ReLU has slope ½ and min/max average the two gradients.'
      : S.kink === -1
        ? 'At a tie, ReLU has slope 0; max selects the second operand and min the first.'
        : 'At a tie, ReLU has slope 1; max selects the first operand and min the second.';
  const spec = lineSpec(),
    line = lineData(spec);
  let traces = lineTraces(line.rows),
    lower = lineTraces(line.rows, true),
    omit = line.omitted;
  $('plot').hidden = S.dim === 2 && S.view === 'compare';
  $('compare-plots').hidden = !(S.dim === 2 && S.view === 'compare');
  $('error-choice').hidden = !(S.dim === 2 && S.view === 'error');
  $('lower-title').textContent =
    S.dim === 1 || S.view === 'slice'
      ? 'Absolute approximation error'
      : 'Cross-section through the reference';
  $('error-summary').textContent =
    S.dim === 1 || S.view === 'slice'
      ? 'Errors at sampled points'
      : 'Move the angle slider to inspect another direction';
  if (S.dim === 1 || S.view === 'slice') {
    const ref = refTrace();
    ref.x = [S.dim === 1 ? S.ref[0] : 0];
    traces.push(ref);
    await Plotly.react('plot', traces, lineLayout(spec), config);
    if (version !== renderVersion) return;
    await Plotly.react('lower-plot', lower, lineLayout(spec, true), config);
    $('plot-caption').textContent =
      S.dim === 1
        ? 'Original function and the two models'
        : 'Slice: (x, y) = (x₀, y₀) + t·(cos θ, sin θ)';
    $('plot-gesture').textContent =
      S.dim === 1 ? 'Click a curve to move x₀ · scroll to zoom' : 'Scroll to zoom · drag to pan';
  } else {
    const data = surfaceData();
    omit += data.omitted;
    if (S.view === 'compare') {
      $('plot-caption').textContent = 'Same domain, same vertical scale, synchronized cameras';
      $('plot-gesture').textContent = 'Drag any surface to rotate all three';
      $('compare-plots').style.setProperty(
        '--comparison-count',
        Math.max(1, Object.values(S.visible).filter(Boolean).length)
      );
      for (const key of ['f', 'apd', 'ad']) {
        const id = 'compare-' + key;
        $(id).parentElement.hidden = !S.visible[key];
        if (!S.visible[key]) continue;
        await Plotly.react(
          id,
          [
            surfaceTrace(data, key, true),
            ...(key === 'apd' ? [wireTrace(data, key)] : []),
            refTrace(true),
          ],
          sceneLayout(data),
          config
        );
        if (version !== renderVersion) return;
        if (!$(id)._apdCameraBound) {
          $(id)._apdCameraBound = true;
          $(id).on('plotly_relayout', (e) => {
            if (!e['scene.camera'] || S.syncing) return;
            S.camera = e['scene.camera'];
            S.syncing = true;
            Promise.all(
              ['f', 'apd', 'ad']
                .filter((k) => k !== key && S.visible[k] && $('compare-' + k).data)
                .map((k) => Plotly.relayout('compare-' + k, { 'scene.camera': S.camera }))
            ).finally(() => {
              S.syncing = false;
            });
          });
        }
      }
    } else if (S.view === 'error') {
      const key = $('error-model').value,
        z = data.f.map((row, j) =>
          row.map((v, i) =>
            v !== null && data[key][j][i] !== null ? Math.abs(v - data[key][j][i]) : null
          )
        );
      let l = baseLayout();
      l.xaxis = { ...grid, title: { text: 'x' }, range: S.bounds.slice(0, 2) };
      l.yaxis = {
        ...grid,
        title: { text: 'y' },
        range: S.bounds.slice(2, 4),
        scaleanchor: 'x',
        scaleratio: 1,
      };
      await Plotly.react(
        'plot',
        [
          {
            type: 'heatmap',
            x: data.xs,
            y: data.ys,
            z,
            zsmooth: false,
            colorscale: [
              [0, '#f7f8ed'],
              [0.25, '#f3d38c'],
              [0.55, '#e59648'],
              [1, '#983d26'],
            ],
            zmin: 0,
            colorbar: {
              title: { text: '|f − ' + (key === 'apd' ? 'P' : 'A') + '|' },
              thickness: 13,
              len: 0.8,
            },
            hovertemplate: 'x = %{x:.5g}<br>y = %{y:.5g}<br>error = %{z:.6g}<extra></extra>',
          },
          {
            type: 'scatter',
            mode: 'markers',
            x: [S.ref[0]],
            y: [S.ref[1]],
            marker: {
              color: C.ref,
              size: 10,
              symbol: 'diamond',
              line: { color: '#fff', width: 1.5 },
            },
            hoverinfo: 'skip',
          },
        ],
        l,
        config
      );
      $('plot-caption').textContent =
        'Absolute error of the ' + (key === 'apd' ? 'APD model' : 'AD approximation');
      $('plot-gesture').textContent = 'Click the map to move the reference';
    } else {
      const selected = ['f', 'apd', 'ad'].filter((k) => S.visible[k]),
        ts = [];
      for (const key of selected) {
        ts.push(surfaceTrace(data, key, selected.length === 1));
        if (key !== 'f') ts.push(wireTrace(data, key));
      }
      ts.push(refTrace(true));
      await Plotly.react('plot', ts, sceneLayout(data), config);
      $('plot-caption').textContent = 'Original surface, piecewise affine APD, affine AD';
      $('plot-gesture').textContent = 'Drag to rotate · scroll to zoom · toggle models to isolate';
    }
    if (version !== renderVersion) return;
    const ref = refTrace();
    ref.x = [0];
    traces.push(ref);
    await Plotly.react('lower-plot', traces, lineLayout(spec), config);
  }
  if (version !== renderVersion) return;
  $('domain-note').hidden = omit === 0;
  $('domain-note').textContent =
    `${omit} sampled original-function values are outside the real domain or overflow. Gaps are left in the original; the models can extend outside that domain.`;
  const hasSwitch = c.nodes.some((n) => ['abs', 'relu', 'max', 'min'].includes(n.op));
  $('insight').textContent = !hasSwitch
    ? 'This expression has no switching operations: APD and AD give the same affine model. Turn either overlay off to see the other.'
    : c.kinks.length
      ? 'The reference lies on a switching node. APD retains the piecewise structure; the AD slope follows your selected convention.'
      : 'APD preserves the switching operations and linearizes the smooth nodes. AD follows the chosen branches at the reference with a single affine approximation.';
  attachPlotEvents();
  if (!Object.values(S.visible).some(Boolean))
    $('insight').textContent =
      'All function layers are hidden. Enable an original or model layer in Compare models.';
  document.dispatchEvent(new CustomEvent('apd-rendered'));
  return { referenceValue: c.referenceValue, gradient: c.gradient, kinks: c.kinks.length };
}
function readState() {
  const val = (id) => {
    const raw = $(id).value;
    if (raw.trim() === '') throw Error('Fill in all reference and domain coordinates.');
    const n = Number(raw);
    if (!Number.isFinite(n)) throw Error('Coordinates must be finite numbers.');
    return n;
  };
  const bounds = ['xmin', 'xmax', 'ymin', 'ymax'].map(val),
    ref = [val('refx'), val('refy')];
  for (let j = 0; j < S.dim; j++) {
    if (!(bounds[j * 2] < bounds[j * 2 + 1]))
      throw Error('Each domain minimum must be smaller than its maximum.');
    if (ref[j] < bounds[j * 2] || ref[j] > bounds[j * 2 + 1])
      throw Error(
        'Keep the reference point inside the visible domain, or expand the domain first.'
      );
    if (!Number.isFinite(bounds[j * 2 + 1] - bounds[j * 2]))
      throw Error('The visible domain is too large. Use finite, reasonably scaled bounds.');
  }
  return { bounds, ref, expression: $('expression').value, kink: Number($('kink').value) };
}
let timer;
function readAndRender() {
  clearTimeout(timer);
  try {
    const next = readState(),
      c = APD.compile(next.expression, S.dim, next.ref.slice(0, S.dim), next.kink);
    Object.assign(S, next, { compiled: c });
    document.body.classList.remove('invalid');
    $('error').hidden = true;
    for (const [j, axis] of ['x', 'y'].entries()) {
      $('slider' + axis).min = S.bounds[j * 2];
      $('slider' + axis).max = S.bounds[j * 2 + 1];
      $('slider' + axis).step = (S.bounds[j * 2 + 1] - S.bounds[j * 2]) / 800;
      $('slider' + axis).value = S.ref[j];
    }
    return render().catch(showError);
  } catch (e) {
    showError(e);
    return Promise.resolve(null);
  }
}
function showError(e) {
  $('error').textContent = e.message + ' The faded plots show the last valid model.';
  $('error').hidden = false;
  document.body.classList.add('invalid');
}
function setDimension(dim) {
  S.dim = dim;
  S.camera = null;
  S.revision++;
  S.view = 'overlay';
  for (const d of [1, 2]) {
    $('dim' + d).classList.toggle('active', d === dim);
    $('dim' + d).setAttribute('aria-pressed', String(d === dim));
  }
  document.querySelectorAll('.two-only').forEach((el) => (el.hidden = dim !== 2));
  $('function-label').textContent = dim === 1 ? 'f(x)' : 'f(x, y)';
  $('move-hint').textContent =
    dim === 1
      ? 'Move the slider or click the function curve.'
      : 'Move either slider. In Error map, click to choose both coordinates.';
  $('preset').replaceChildren(...presets[dim].map((p, i) => new Option(p.name, String(i))));
  updateViewButtons();
  return loadPreset(0);
}
function loadPreset(i) {
  const p = presets[S.dim][i];
  $('expression').value = p.expression;
  $('refx').value = p.ref[0];
  $('refy').value = p.ref[1] ?? 0;
  for (const axis of ['x', 'y']) {
    $(axis + 'min').value = p.domain[0];
    $(axis + 'max').value = p.domain[1];
  }
  $('example-note').textContent = p.note;
  $('plot-heading').textContent = p.title;
  S.revision++;
  S.camera = null;
  return readAndRender();
}
function updateViewButtons() {
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === S.view);
    b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
  });
}
$('dim1').onclick = () => setDimension(1);
$('dim2').onclick = () => setDimension(2);
$('preset').onchange = () => loadPreset(Number($('preset').value));
$('function-form').onsubmit = (e) => {
  e.preventDefault();
  $('plot-heading').textContent =
    S.dim === 1 ? 'Explore your local models.' : 'Explore your surface and local models.';
  $('example-note').textContent = 'Custom expression. Move the reference to rebuild both models.';
  S.revision++;
  readAndRender();
};
$('expression').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('function-form').requestSubmit();
  }
};
for (const id of ['refx', 'refy', 'xmin', 'xmax', 'ymin', 'ymax', 'kink'])
  $(id).onchange = () => {
    if (id.endsWith('min') || id.endsWith('max')) S.revision++;
    readAndRender();
  };
for (const axis of ['x', 'y'])
  $('slider' + axis).oninput = () => {
    $('ref' + axis).value = Number($('slider' + axis).value).toPrecision(8);
    clearTimeout(timer);
    timer = setTimeout(readAndRender, 70);
  };
$('origin').onclick = () => {
  $('refx').value = 0;
  $('refy').value = 0;
  for (const axis of ['x', 'y']) {
    if (Number($(axis + 'min').value) > 0) $(axis + 'min').value = -1;
    if (Number($(axis + 'max').value) < 0) $(axis + 'max').value = 1;
  }
  readAndRender();
};
for (const key of ['f', 'apd', 'ad'])
  $('show-' + key).onchange = () => {
    S.visible[key] = $('show-' + key).checked;
    render().catch(showError);
  };
document.querySelectorAll('[data-view]').forEach(
  (b) =>
    (b.onclick = () => {
      S.view = b.dataset.view;
      S.revision++;
      updateViewButtons();
      render().catch(showError);
    })
);
$('error-model').onchange = () => render().catch(showError);
$('slice-angle').oninput = () => {
  S.angle = Number($('slice-angle').value);
  $('angle-label').textContent =
    S.angle +
    '°' +
    (S.angle === 0 || S.angle === 180 ? ' · along x' : S.angle === 90 ? ' · along y' : '');
  clearTimeout(timer);
  timer = setTimeout(() => render().catch(showError), 70);
};
$('reset-view').onclick = () => {
  S.camera = null;
  S.revision++;
  render().catch(showError);
};
$('export-plot').onclick = async () => {
  const dialog = $('export-dialog'),
    gallery = $('export-gallery');
  gallery.replaceChildren();
  $('export-status').textContent = 'Preparing your plot…';
  dialog.showModal();
  try {
    const ids =
      S.dim === 2 && S.view === 'compare'
        ? ['f', 'apd', 'ad'].filter((k) => S.visible[k]).map((k) => ['compare-' + k, 'apd-' + k])
        : [['plot', 'apd-visualizer']];
    if (!ids.length) throw Error('Enable a model layer first.');
    for (const [id, name] of ids) {
      const url = await Plotly.toImage(id, { format: 'png', scale: 2 }),
        figure = document.createElement('figure'),
        img = document.createElement('img'),
        link = document.createElement('a');
      img.src = url;
      img.alt = name + ' exported plot';
      link.href = url;
      link.download = name + '.png';
      link.textContent = 'Download ' + name + '.png';
      figure.append(img, link);
      gallery.append(figure);
    }
    $('export-status').textContent =
      'Your plot is ready. Download it below, or right-click the image to save it.';
  } catch (error) {
    $('export-status').textContent = 'Could not export: ' + error.message;
  }
};
$('close-export').onclick = () => $('export-dialog').close();
$('help-button').onclick = () => {
  $('math-details').open = true;
  $('math-details').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
window.apdVisualizer = { state: S, setDimension, readAndRender };
setDimension(1);

// A structured interface to the same controls, where the browser supports WebMCP.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = (tool) =>
    Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(
      () => {}
    );
  register({
    name: 'read_apd_model',
    title: 'Read the APD model',
    description:
      'Read the function, reference point, AD convention and model values currently displayed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: () => ({
      expression: S.expression,
      dimension: S.dim,
      reference: S.ref.slice(0, S.dim),
      bounds: S.bounds.slice(0, 2 * S.dim),
      absSlopeAtZero: S.kink,
      referenceValue: S.compiled.referenceValue,
      adGradient: S.compiled.gradient,
      view: S.view,
    }),
  });
  register({
    name: 'configure_apd_model',
    title: 'Explore a function',
    description:
      'Set a scalar function of one or two inputs and its reference point, then update both visible local models.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string' },
        dimension: { type: 'integer', enum: [1, 2] },
        reference: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 2 },
      },
      required: ['expression', 'dimension', 'reference'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      if (
        !input ||
        Object.keys(input).some((k) => !['expression', 'dimension', 'reference'].includes(k)) ||
        typeof input.expression !== 'string' ||
        ![1, 2].includes(input.dimension) ||
        !Array.isArray(input.reference) ||
        input.reference.length !== input.dimension ||
        input.reference.some((v) => !Number.isFinite(v))
      )
        throw Error(
          'Provide expression, dimension (1 or 2), and one finite reference coordinate per input.'
        );
      APD.compile(input.expression, input.dimension, input.reference, S.kink);
      if (S.dim !== input.dimension) await setDimension(input.dimension);
      $('expression').value = input.expression;
      $('refx').value = input.reference[0];
      $('refy').value = input.reference[1] ?? 0;
      for (let j = 0; j < input.dimension; j++) {
        const axis = j ? 'y' : 'x',
          r = input.reference[j];
        $(axis + 'min').value = Math.min(-3, r - 1);
        $(axis + 'max').value = Math.max(3, r + 1);
      }
      $('plot-heading').textContent = 'Explore your local models.';
      $('example-note').textContent = 'Custom expression.';
      S.revision++;
      const result = await readAndRender();
      if (!result) throw Error($('error').textContent);
      return result;
    },
  });
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
