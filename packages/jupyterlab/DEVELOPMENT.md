## Build

This package builds the **JupyterLab labextension (file renderers)**.

Registers `Perspective` as a viewer for `.csv`, `.json`, and `.arrow` files in
the JupyterLab file browser. Pure JupyterLab plugin — no ipywidgets, no
`PerspectiveWidget`.

1. esbuild produces a bundle in `dist/esm/perspective-jupyterlab.js` from
   `src/js/index.js`.
2. `jupyter labextension build` packages that bundle (read from `main` in
   `package.json`) into `dist/cjs/`.
3. `dist/cjs/` is copied to the `perspective-python` wheel data dir at
   `perspective_python-*.data/data/share/jupyter/labextensions/@perspective-dev/jupyterlab/`.

This means running `jupyter labextension build` or `watch` out-of-band from
`build.mjs` won't rebuild on its own; it reads the esbuild output.

The renderer lazy-loads the Perspective runtime from `@perspective-dev/anywidget`
on first file-open (custom-element registration is idempotent, so it coexists
with a `PerspectiveWidget` on the same page).

## `PerspectiveWidget` (the AnyWidget bundle)

The widget itself is **no longer built here** — it lives in the
`@perspective-dev/anywidget` package, which builds a single wasm-inlined ESM
bundle to `rust/perspective-python/perspective/widget/static/perspective-anywidget.{js,css}`
and is shipped in the `perspective-python` wheel (loaded by anywidget at widget
instantiation). See `packages/anywidget/`.

## Jupyter integration tests

`test/jupyter/widget.spec.mjs` drives a real JupyterLab instance in Chromium
via playwright. `test/config/jupyter/` boots the server (port 6538); each test
generates its own notebook from `test/jupyter/notebook_template.json` into
`dist/esm`, which doubles as the JupyterLab root directory. Most of the suite
is currently `test_jupyter.skip`-gated pending the port to the anywidget
implementation — see `JUPYTER_TEST_PLAN.md` (repo root) for the checklist.

Prerequisites — the notebook kernel runs in whatever Python environment
`jupyter` resolves to, so that environment needs:

1. `pip install -r rust/perspective-python/requirements.txt` (jupyterlab,
   anywidget, ipywidgets, pandas, ...).
2. `import perspective.widget` must work, which requires both the compiled
   module and the anywidget bundle in
   `perspective/widget/static/perspective-anywidget.{js,css}`. In-repo:
   `PACKAGE=anywidget,jupyterlab,python pnpm run build`, and if the build is
   in-tree (not installed into the venv), export
   `PYTHONPATH=$PWD/rust/perspective-python`.
3. Playwright browsers (`npx playwright install chromium`).

Run from the repo root:

```bash
PACKAGE=jupyterlab pnpm run test --jupyter
```

This rebuilds the labextension (`test:jupyter:build`) and then runs playwright
with `PSP_JUPYTERLAB_TESTS=1`, which swaps the config over to the jupyter
project + JupyterLab global setup. Alternatively `pnpm run test:jupyter` from
this package skips the rebuild. `PSP_HEADED=1` to watch the browser, and note
the jupyter suite always runs with `workers: 1`.
