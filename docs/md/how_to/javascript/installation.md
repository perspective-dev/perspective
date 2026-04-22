# JavaScript Installation and Module Structure

Perspective is designed for flexibility, allowing developers to pick and choose
which modules they need. The main modules are:

- `@perspective-dev/client`
  The data engine library, as both a browser ES6 and Node.js module. Provides a
  WebAssembly, WebWorker (browser) and Process (node.js) runtime.

- `@perspective-dev/viewer`
  A user-configurable visualization widget, bundled as a
  [Web Component](https://www.webcomponents.org/introduction). This module
  includes the core data engine module as a dependency.

`<perspective-viewer>` by itself only implements a trivial debug renderer, which
prints the currently configured `view()` as a CSV. Plugin modules for popular
JavaScript libraries, such as [d3fc](https://d3fc.io/), are packaged separately
and must be imported individually.

- `@perspective-dev/viewer-datagrid`
  A custom high-performance data-grid component based on HTML `<table>`.

- `@perspective-dev/viewer-charts`
  A `<perspective-viewer>` plugin for the [d3fc](https://d3fc.io) charting
  library.

When imported after `@perspective-dev/viewer`, the plugin modules will register
themselves automatically, and the renderers they export will be available in the
`plugin` dropdown in the `<perspective-viewer>` UI.

## Browser

Perspective's WebAssembly data engine is available via NPM in the same package
as its Node.js counterpart, `@perspective-dev/client`. The Perspective Viewer UI
(which has no Node.js component) must be installed separately:

```bash
$ npm add @perspective-dev/client @perspective-dev/viewer
```

By itself, `@perspective-dev/viewer` does not provide any visualizations, only
the UI framework. Perspective _Plugins_ provide visualizations and must be
installed separately. All Plugins are optional - but a `<perspective-viewer>`
without Plugins would be rather boring!

```bash
$ npm add @perspective-dev/viewer-charts @perspective-dev/viewer-datagrid @perspective-dev/viewer-openlayers
```

## Node.js

To use Perspective from a Node.js server, simply install via NPM.

```bash
$ npm add @perspective-dev/client
```
