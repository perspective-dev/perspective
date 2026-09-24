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

### Memory64 (wasm64)

`@perspective-dev/server` also ships a WebAssembly Memory64 build of the engine,
`dist/wasm/perspective-server.memory64.wasm`, which raises the engine's heap
ceiling from 4GB to 16GB (at some engine performance cost). `init_server`
accepts both binaries at once — register each as a _thunk_ and only the selected
binary is ever downloaded. The wasm64 binary is used whenever the browser
supports Memory64; registering only the wasm32 binary (as above) opts out.

```javascript
perspective.init_server({
    wasm32: () => fetch(SERVER_WASM),
    wasm64: () => fetch(SERVER_WASM64),
});
```

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

<span class="warning">Perspective no longer publishes prebuilt _inline_ bundles.
The `@perspective-dev/client/inline` and `@perspective-dev/viewer/inline` entry
points, and the `dist/esm/*.inline.js` files behind them, have been removed.
Produce an equivalent build with your bundler's asset inlining, as below.</span>

An _inline_ build embeds the WebAssembly binaries in the `.js` bundle as base64
instead of emitting them as separate assets, so nothing needs to be served
alongside the bundle. It costs bundle size and boot time — base64 is 33% larger
than the binary it encodes, and the browser must decode it before compiling — so
prefer the ESM builds above where you control asset hosting.

Only the bundler's `.wasm` loader changes; the bootstrapping code is identical
to the ESM builds.

### ESBuild

Use the `binary` loader in place of `file`. The imported value is a
`Uint8Array`, which `init_server()` and `init_client()` accept directly.

```javascript
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

await Promise.all([
    perspective.init_server(SERVER_WASM),
    perspective_viewer.init_client(CLIENT_WASM),
]);
```

ESBuild config JSON to encode this asset as `binary`:

```javascript
{
    // ...
    "loader": {
        // ...
        ".wasm": "binary"
    }
}
```

### Webpack

Use `asset/inline` in place of `asset/resource`. The imported value is a `data:`
URL rather than a path, so read it into an `ArrayBuffer` first.

```javascript
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

const buffer = async (url) => await (await fetch(url)).arrayBuffer();

await Promise.all([
    perspective.init_server(await buffer(SERVER_WASM)),
    perspective_viewer.init_client(await buffer(CLIENT_WASM)),
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
                type: "asset/inline"
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

### Vite

Vite inlines assets below `build.assetsInlineLimit` as `data:` URLs. Raising the
limit past the size of the `.wasm` binaries inlines them, and the `?url`
bootstrapping from the ESM section applies unchanged. This threshold is a
build-wide setting and its interaction with `?url` imports has changed between
Vite major versions, so check the emitted bundle rather than assuming.

```javascript
import { defineConfig } from "vite";
export default defineConfig({
    build: {
        target: "esnext",
        assetsInlineLimit: 16 * 1024 * 1024,
    },
});
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
