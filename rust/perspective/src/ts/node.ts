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
import perspective_cpp_wasm from "../../dist/pkg/node/perspective-server.wasm";
import perspective_cpp from "../../dist/pkg/node/perspective-server.js";
import perspective_client_wasm from "../../dist/pkg/perspective.wasm";
import * as perspective_client from "../../dist/pkg/perspective.js";
import { load_wasm_stage_0 } from "./decompress.js";
export { WebSocketServer } from "./server.js";
import { WebSocketServer } from "./server.js";

const wasmBinary = await load_wasm_stage_0(perspective_cpp_wasm);
const core = await perspective_cpp({ wasmBinary });
await core.init();

const proto_server = new core.ProtoServer();

const uncompressed_client_wasm = await load_wasm_stage_0(
    perspective_client_wasm
);

await perspective_client.default(uncompressed_client_wasm);
await perspective_client.init();
const SYNC_CLIENT = perspective_client.worker((req) => {
    if (req instanceof Uint8Array) {
        for (const resp of proto_server.handle_message(req)) {
            SYNC_CLIENT._receive(resp);
        }

        setTimeout(() => {
            for (const resp of proto_server.poll()) {
                SYNC_CLIENT._receive(resp);
            }
        });
    }
});

SYNC_CLIENT._init();

export function table(x, y) {
    return SYNC_CLIENT.table(x, y);
}

export default {
    table(x, y) {
        return SYNC_CLIENT.table(x, y);
    },

    WebSocketServer,
};
