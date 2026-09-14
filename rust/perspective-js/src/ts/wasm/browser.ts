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

import type * as psp from "../../../dist/wasm/perspective-js.d.ts";

import * as psp_websocket from "../websocket.ts";

function invert_promise<T>(): [
    (t: T) => void,
    Promise<T>,
    (e: string) => void,
] {
    let sender, reject;
    let receiver: Promise<T> = new Promise((x, y) => {
        sender = x;
        reject = y;
    });

    return [
        sender as unknown as (t: T) => void,
        receiver,
        reject as unknown as (e: string) => void,
    ];
}

async function _init(
    ws: MessagePort | Worker,
    wasm: WebAssembly.Module | undefined,
) {
    const [sender, receiver] = invert_promise();
    ws.addEventListener("message", function listener(resp) {
        ws.removeEventListener("message", listener);
        sender(null);
    });

    ws.onmessage = function listener(resp) {
        ws.onmessage = function () {};
        sender(null);
    };

    ws.onmessageerror = console.error;
    ws.postMessage(
        { cmd: "init", args: [wasm] },
        {
            transfer:
                wasm === undefined || wasm instanceof WebAssembly.Module
                    ? []
                    : [wasm],
        },
    );

    await receiver;
}

/**
 * Create a new client connected exclusively to a new Web Worker instance of
 * the Perspective engine.
 * @param module
 * @returns
 */
export async function worker(
    module: Promise<typeof psp>,
    server_wasm: Promise<WebAssembly.Module> | undefined,
    perspective_wasm_worker: Promise<SharedWorker | Worker | MessagePort>,
) {
    const [wasm, webworker]: [
        WebAssembly.Module | undefined,
        SharedWorker | Worker | MessagePort,
    ] = await Promise.all([server_wasm, perspective_wasm_worker]);

    const { Client } = await module;
    let port: MessagePort | Worker;
    let close: () => void;
    if (
        typeof SharedWorker !== "undefined" &&
        webworker instanceof SharedWorker
    ) {
        const shared_port = webworker.port;
        port = shared_port;
        close = () => shared_port.close();
    } else if (typeof Worker !== "undefined" && webworker instanceof Worker) {
        port = webworker;
        close = () => webworker.terminate();
    } else if (webworker instanceof MessagePort) {
        port = webworker;
        close = () => webworker.close();
    } else {
        throw new Error("Unsupported worker type");
    }

    const client = new Client(
        async (proto: Uint8Array) => {
            const f = proto.slice().buffer;
            port.postMessage(f, { transfer: [f] });
        },
        async () => {
            console.debug("Closing WebWorker");
            close();
        },
    );

    await _init(port, wasm);
    port.onmessage = (json: MessageEvent<Uint8Array>) => {
        client.handle_response(json.data);
    };

    return client;
}

/**
 * Create a new client connected via WebSocket to a server implemnting the
 * Perspective Protocol.
 * @param module
 * @param url
 * @returns
 */
export async function websocket(
    module: Promise<typeof psp>,
    url: string | URL,
) {
    const { Client } = await module;
    return await psp_websocket.websocket(WebSocket, Client, url);
}

export default { websocket, worker };
