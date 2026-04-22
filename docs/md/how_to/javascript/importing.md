# JavaScript - Importing with or without a bundler

Perspective requires the browser to have access to Perspective's `.wasm`
binaries _in addition_ to the bundled `.js` files, and as a result the build
process requires a few extra steps. Perspective's NPM releases come with
multiple prebuilt configurations.

## ESM builds with a bundler

The recommended builds for production use are packaged as ES Modules and require
a _bootstrapping_ step in order to acquire the `.wasm` binaries and initialize
Perspective's JavaScript with them. Because they have no hard-coded dependencies
on the `.wasm` paths, they are ideal for use with JavaScript bundlers such as
ESBuild, Rollup, Vite or Webpack.

ESM builds must be _bootstrapped_ with their `.wasm` binaries to initialize. The
`wasm` binaries can be found in their respective `dist/wasm` directories.

```javascript
import perspective_viewer from "@perspective-dev/viewer";
import perspective from "@perspective-dev/client";

// TODO These paths must be provided by the bundler!
const SERVER_WASM = ... // "@perspective-dev/server/dist/wasm/perspective-server.wasm"
const CLIENT_WASM = ... // "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm"

await Promise.all([
    perspective.init_server(SERVER_WASM),
    perspective_viewer.init_client(CLIENT_WASM),
]);

// Now Perspective API will work!
const worker = await perspective.worker();
const viewer = document.createElement("perspective-viewer");
```

The exact syntax will vary slightly depending on the bundler.

### Vite

```javascript
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm?url";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url";

await Promise.all([
    perspective.init_server(fetch(SERVER_WASM)),
    perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);
```

You'll also need to target `esnext` in your `vite.config.js` in order to run the
`build` step:

```javascript
import { defineConfig } from "vite";
export default defineConfig({
    build: {
        target: "esnext",
    },
});
```

### ESBuild

```javascript
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

await Promise.all([
    perspective.init_server(fetch(SERVER_WASM)),
    perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);
```

ESBuild config JSON to encode this asset as a `file`:

```javascript
{
    // ...
    "loader": {
        // ...
        ".wasm": "file"
    }
}
```

### Webpack

```javascript
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

await Promise.all([
    perspective.init_server(SERVER_WASM),
    perspective_viewer.init_client(CLIENT_WASM),
]);
```

Webpack config:

```javascript
{
    // ...
    module: {
        // ...
        rules: [
            // ...
            {
                test: /\.wasm$/,
                type: "asset/resource"
            },
        ]
    },
    experiments: {
        // ...
        asyncWebAssembly: false,
        syncWebAssembly: false,
    },
}
```

## Inline builds with a bundler

<span class="warning">Inline builds are deprecated and will be removed in a
future release.</span>

Perspective's _Inline_ Builds work by _inlining_ WebAssembly binary content as
a base64-encoded string. While inline builds work with most bundlers and _do
not_ require bootstrapping, there is an inherent file-size and boot-performance
penalty. Prefer your bundler's inlining features and Perspective ESM builds
where possible.

```javascript
import "@perspective-dev/viewer/dist/esm/perspective-viewer.inline.js";
import psp from "@perspective-dev/client/dist/esm/perspective.inline.js";
```

## CDN builds

Perspective's CDN builds are good for non-bundled scenarios, such as importing
directly from a `<script>` tag. CDN builds _do not_ require _bootstrapping_ the
WebAssembly binaries, but they also generally _do not_ work with bundlers.

CDN builds are in ES Module format, thus to include them via a CDN they must be
imported from a `<script type="module">`:

```html
<script type="module">
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
    import "https://cdn.jsdelivr.net/npm/@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js";
    import perspective from "https://cdn.jsdelivr.net/npm/@perspective-dev/client/dist/cdn/perspective.js";

    // .. Do stuff here ..
</script>
```

## Node.js builds

The Node.js runtime for the `@perspective-dev/client` module runs in-process by
default and does not implement a `child_process` interface. Hence, there is no
`worker()` method, and the module object itself directly exports the full
`perspective` API.

```javascript
const perspective = require("@perspective-dev/client");
```

In Node.js, perspective does not run in a WebWorker (as this API does not exist
in Node.js), so no need to call the `.worker()` factory function - the
`perspective` library exports the functions directly and run synchronously in
the main process.
