# Testing and validation

The numerical suite checks the APD/AD engine against independent formulas. Distribution tests check the offline package and Python launcher. Browser rendering and interaction have a separate manual checklist.

## Run automatic checks

From the repository root, with Node.js and Python 3 available:

```sh
node tests/validate-apd.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Both suites use standard libraries and need no package installation. A failed check returns a nonzero exit status. The Node suite writes `tests/validation-report.json`; this generated report is excluded from version control. The Python checks live in `tests/test_distribution.py`.

The [GitHub Actions workflow](../.github/workflows/ci.yml) runs these automatic checks. Consult its actual run result for the status of a particular commit. It does not replace browser inspection of curves, WebGL surfaces, or exported images.

## Numerical coverage

The initial validation on 30 September 2026 recorded **36 groups and 5,447 assertions**. This is a dated baseline; the current run prints its own totals.

The suite covers:

- Exact affine models in one and two input dimensions, and ordinary tangents for smooth examples.
- Absolute values, nested and narrow switches, smooth operations after switches, and products of propagated models.
- Analytic elemental derivatives, reference interpolation, finite-difference comparisons, and local second-order remainder checks.
- AD conventions for `abs`, ReLU, min, and max at switching points.
- Operator precedence, supported syntax, invalid domains, and explicit complexity limits.
- All six two-input examples, with independently derived APD formulas.
- Surface vertex and triangle heights, orientation, rectangle coverage, and reproducible probes for gaps or overlaps.

The assertions provide regression evidence for the cases tested. They do not certify all expressions, floating-point scales, or plotted domains. See [Method and numerical limits](METHOD.md).

## Manual browser checklist

Start the local app with `python3 start.py`. After changes to the interface or plotting, check the following in a browser with WebGL enabled:

1. Load all six one-input and all six two-input examples. Confirm finite reference values and inspect the curves or surfaces.
2. For `abs(x) + 0.25*x^2`, set the reference to zero. APD should be `abs(x)`; AD should be zero for the default convention and have slope +1 or −1 when selected.
3. Toggle each model layer. In side-by-side view, confirm hidden models also lose their panels, and visible panels use matching axes and synchronized cameras.
4. Inspect surface overlay, side-by-side comparison, angled cross-sections, and both error maps. Move the reference using controls and supported plot clicks.
5. Enter invalid syntax and an invalid reference such as `sqrt(x)` at zero. Confirm readable feedback, then recover with a valid expression or preset.
6. Use the keyboard for dimensions, views, switches, and function submission. Check a narrow viewport for overflow and readable controls.
7. Export a curve and a surface. Inspect the PNG previews and save/open the downloaded files. In comparison view, check every visible model export.
8. Open `dist/index.html` directly and the generated offline HTML. Confirm both load without external assets. Inspect the browser console for unexpected errors.

When recording a run, include the commit, date, browser/version, operating system, and checks performed. Keep observed results distinct from untested behavior.

## Historical browser validation

Manual checks on 30 September 2026 used a local HTTP copy in the Codex in-app browser. They covered all twelve presets, the four two-input views, model visibility, reference and kink controls, error recovery, keyboard interaction, a 390-pixel viewport, PNG preview generation, and the structured browser model controls. The Python launcher selected a loopback port and served the app successfully.

Two checks remained unverified in that environment: saving an exported image into the user's Downloads directory, and opening the app through a `file:` URL. The embedded offline assets were inspected separately. These observations are historical evidence, not an automated browser test or a claim about every browser.
