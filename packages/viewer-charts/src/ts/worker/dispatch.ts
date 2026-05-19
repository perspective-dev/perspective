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

import type { ControlMsg } from "../transport/protocol";
import type { WorkerRenderer } from "./renderer.worker";

/**
 * Stateless control-message dispatcher. The renderer instance is
 * supplied by the caller so worker mode (one global instance) and
 * in-process mode (one instance per host element) share the same
 * routing logic.
 */
export function dispatch(r: WorkerRenderer, msg: ControlMsg): void {
    switch (msg.kind) {
        case "setViewByName":
            r.setViewByName(msg.name);
            break;
        case "setColumnsConfig":
            r.chartImpl.setColumnsConfig?.(msg.cfg);
            break;
        case "setPluginConfig":
            r.chartImpl.setPluginConfig?.(msg.cfg);
            r.redraw();
            break;
        case "setBufferMaxCapacity":
            r.glManager.bufferPool.maxCapacity = msg.n;
            break;
        case "loadAndRender":
            r.loadAndRender(msg);
            break;
        case "redraw":
            r.redraw();
            break;
        case "resize":
            console.log("resize");
            r.resize(msg.cssWidth, msg.cssHeight, msg.dpr);
            r.redraw();
            break;
        case "clear":
            r.clear();
            break;
        case "invalidateTheme":
            r.chartImpl.setTheme?.(msg.themeVars);
            r.chartImpl.invalidateTheme?.();
            r.resize(r.cssWidth, r.cssHeight, r.dpr);
            break;
        case "restoreZoom":
            r.restoreZoom(msg.state);
            break;
        case "resetAllZooms":
            r.resetAllZooms();
            r.redraw();
            r.post({
                kind: "zoomChanged",
                isDefault: r.allZoomsDefault(),
            });
            break;
        case "resetExpandedDomain":
            r.resetExpandedDomain();
            break;
        case "interaction":
            r.onInteraction(msg.event);
            break;
        case "saveZoom":
            r.post({
                kind: "saveZoomReply",
                requestId: msg.requestId,
                state: r.saveZoom(),
            });
            break;
        case "destroy":
            r.destroy();
            break;
        case "init":
            // Re-init not supported; ignore to keep the renderer alive
            // for the host's `delete()` cleanup path.
            break;
        case "snapshotPng": {
            const requestId = msg.requestId;
            r.snapshotPng()
                .then((blob) => {
                    r.post({ kind: "snapshotPngReply", requestId, blob });
                })
                .catch((err) => {
                    r.post({ kind: "error", message: String(err) });
                });
            break;
        }
    }
}
