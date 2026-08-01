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

import type * as perspective from "../../dist/wasm/perspective-js.js";

/**
 * VirtualServer API for implementing custom data sources in JavaScript/WASM.
 *
 * The VirtualServer pattern allows you to create custom data sources that
 * integrate with Perspective's protocol. This is useful for:
 * - Connecting to external databases (DuckDB, PostgreSQL, etc.)
 * - Streaming data from APIs or message queues
 * - Implementing custom aggregation or transformation logic
 * - Creating data adapters without copying data into Perspective tables
 *
 * The `VirtualServerHandler` interface and `Features` struct are declared
 * in Rust alongside the bridge that invokes them (`perspective-js`'s
 * `virtual_server.rs` and `perspective-client`'s `features.rs`
 * respectively) and re-exported here. `ServerFeatures` is a legacy alias
 * for `Features`.
 *
 * @module virtual_server
 */

// `Features` must re-export from the wasm `.d.ts` (NOT "./ts-rs/Features.ts")
// - `perspective.browser.ts` star-exports both this module and the wasm
// `.d.ts`, and star exports of the same name only merge when they resolve to
// the same declaration.
export type {
    VirtualServerHandler,
    VirtualHostedTable,
    Features,
    Features as ServerFeatures,
} from "../../dist/wasm/perspective-js.js";

export function createMessageHandler(
    mod: typeof perspective,
    handler: perspective.VirtualServerHandler,
) {
    let virtualServer: perspective.VirtualServer;
    async function postMessage(port: MessagePort, msg: MessageEvent) {
        if (msg.data.cmd === "init") {
            try {
                virtualServer = new mod.VirtualServer(handler);
                if (msg.data.id !== undefined) {
                    port.postMessage({ id: msg.data.id });
                } else {
                    port.postMessage(null);
                }
            } catch (error) {
                console.error("Error initializing worker:", error);
                throw error;
            }
        } else {
            try {
                const requestBytes = new Uint8Array(msg.data);
                const responseBytes =
                    await virtualServer.handleRequest(requestBytes);
                const buffer = responseBytes.slice().buffer;
                port.postMessage(buffer, { transfer: [buffer] });
            } catch (error) {
                console.error("Error handling request in worker:", error);
                throw error;
            }
        }
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = (message) => {
        postMessage(channel.port1, message);
    };

    return channel.port2;
}
