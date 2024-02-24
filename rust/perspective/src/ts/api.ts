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

// @ts-ignore
import perspective_wasm from "../../dist/pkg/web/perspective-server.wasm";
import perspective_wasm_worker from "./perspective-server.worker.js";

export async function worker(module) {
    const { worker } = await module;
    const [wasm, webworker] = await Promise.all([
        perspective_wasm().then((x) => x.arrayBuffer()),
        perspective_wasm_worker(),
    ]);

    const api = worker((proto) => {
        webworker.postMessage(proto);
    });

    webworker.addEventListener("message", (json) => {
        api._receive(json.data);
    });

    await api._init(wasm);
    return api;
}

function invert_promise() {
    let sender;
    let receiver = new Promise((x) => {
        sender = x;
    });

    return [sender, receiver];
}

export async function websocket(module, url) {
    const { worker } = await module;
    const ws = new WebSocket(url);
    let [sender, receiver] = invert_promise();
    ws.onopen = sender;
    ws.binaryType = "arraybuffer";
    await receiver;
    const api = worker((x, y) => {
        if (y.length === 0) {
            ws.send(JSON.stringify(x));
        } else {
            x.args[0] = {};
            ws.send(JSON.stringify(x));
            ws.send(y[0]);
        }
    });

    ws.onmessage = (msg) => {
        if (msg.data instanceof ArrayBuffer) {
            api._receive(msg.data);
        } else {
            api._receive(JSON.parse(msg.data));
        }
    };

    await api._init();
    return api;
}

export default { websocket, worker };
