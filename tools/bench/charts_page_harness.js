// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

// Installed into the page once via `page.addScriptTag`. Exposes:
//   __BENCH_RESTORE__(config)  - restore the viewer with `config`, drain RAFs,
//                                cache the active plugin and a fresh View.
//   __BENCH_DRAW__()           - drive one full plugin.draw(view) and return
//                                its wall-clock duration (ms).
//
// Important: `viewer.getView()` returns the *session-owned* View, not a clone.
// We never call `.delete()` on it — the viewer destroys it on the next
// `restore()`. See viewer.rs::getView docs.

(() => {
    let _view = null;
    let _plugin = null;

    async function waitFrames(n) {
        for (let i = 0; i < n; i++) {
            await new Promise((r) => requestAnimationFrame(r));
        }
    }

    window.__BENCH_RESTORE__ = async function (config) {
        const viewer = document.querySelector("perspective-viewer");
        await viewer.reset();
        await viewer.restore(config);
        // Drain the viewer's own scheduled render so the GL context is sized
        // and warm before we start timing.
        await viewer.flush();
        await waitFrames(2);

        _plugin = viewer.getPlugin();
        _view = await viewer.getView();
    };

    window.__BENCH_DRAW__ = async function () {
        if (!_plugin || !_view) {
            throw new Error("__BENCH_DRAW__: call __BENCH_RESTORE__ first");
        }

        // `plugin.draw(view)` performs the full upload + GL submit. The
        // returned promise resolves once `viewToColumnDataMap` has streamed
        // every chunk through `_renderChunkData`. That is the unit we want.
        const t0 = performance.now();
        await _plugin.draw(_view);
        const t1 = performance.now();
        return t1 - t0;
    };
})();
