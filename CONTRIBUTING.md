# Development

APD Visualizer is maintained as a small static browser application. No package installation is needed to run it.

The repository currently has no open-source license for its original code. Please contact the maintainer before proposing code contributions or reusing the project; third-party components keep their own license terms.

## Work locally

1. Run `python3 start.py`, or open `dist/index.html` in a browser.
2. Edit the files in `dist/`. Despite its name, this directory contains editable source, not generated output.
3. Refresh the browser after each change.
4. Run the checks below before submitting a change.

```sh
node --check dist/engine.js
node --check dist/app.js
node tests/validate-apd.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

For consistent JavaScript, HTML, CSS, Markdown, and YAML formatting, the initial repository uses Prettier 3.9.9 with `.prettierrc.json`. Formatting is optional tooling; it is not a runtime dependency. Exclude the vendored Plotly bundle and generated files.

## Numerical changes

For changes to APD propagation or geometry, add a test against an independently derived formula or geometric invariant. Avoid deriving the expected result with the same code path being tested. Preserve the distinction between the APD model, the chosen AD convention, and finite plotting samples.

For interface changes, also check the affected one-input and two-input views in a browser. CI does not replace that visual check. Use the checklist in [docs/TESTING.md](docs/TESTING.md).

## Reporting a problem

Include the exact expression, reference point, visible domain, selected AD convention, browser, and the expected result. For a plotting issue, include a screenshot and say whether the problem appears in the surface, cross-section, error map, or exported image.

## Offline distribution

```sh
python3 build_offline.py --output APD-Visualizer.html
```

The output contains the application, Plotly, and its license. It is a generated release asset and is excluded from source control.
