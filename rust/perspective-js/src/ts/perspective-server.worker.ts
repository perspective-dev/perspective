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

import {
    PerspectiveSession,
    PerspectiveServer,
    PerspectivePollThread,
} from "./wasm/engine.ts";
import { compile_perspective } from "./wasm/emscripten_api.ts";

// @ts-ignore unholy black magic
self.queueMicrotask = undefined;

let GLOBAL_SERVER: PerspectiveServer;
let POLL_THREAD: PerspectivePollThread;

let SESSION: PerspectiveSession | undefined;

async function handleMessage(this: MessagePort, msg: MessageEvent) {
    if (msg.data.cmd === "init") {
        const id = msg.data.id;
        if (!GLOBAL_SERVER) {
            const module = await compile_perspective(msg.data.args[0]);

            GLOBAL_SERVER = new PerspectiveServer(module, {
                on_poll_request: () => POLL_THREAD.on_poll_request(),
            });

            POLL_THREAD = new PerspectivePollThread(GLOBAL_SERVER);
        }

        SESSION = GLOBAL_SERVER.make_session(async (resp) => {
            const f = resp.slice().buffer;
            this.postMessage(f, { transfer: [f] });
        });

        this.postMessage({ id });
    } else {
        if (SESSION) {
            await SESSION?.handle_request(new Uint8Array(msg.data));
        } else {
            throw new Error("No session");
        }
    }
}

function bindPortSharedWorker(msg: MessageEvent) {
    const port = msg.ports[0];
    port.addEventListener("message", handleMessage.bind(port));
    port.start();
}

// @ts-expect-error wrong scope
self.addEventListener("connect", bindPortSharedWorker);
self.addEventListener(
    "message",
    handleMessage.bind(self as unknown as MessagePort),
);
