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

export type * from "../../dist/wasm/perspective-js.d.ts";
export type * from "./virtual_server.ts";

import WebSocket, { WebSocketServer as HttpWebSocketServer } from "ws";
import stoppable from "stoppable";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { webcrypto } from "node:crypto";
import type * as net from "node:net";
import * as url from "node:url";
import { createRequire } from "node:module";

import * as perspective_client from "../../dist/wasm/perspective-js.js";
import { load_wasm_stage_0 } from "./wasm/decompress.js";
import * as engine from "./wasm/engine.ts";
import { compile_perspective } from "./wasm/emscripten_api.ts";
import * as psp_websocket from "./websocket.ts";
import * as api from "./wasm/browser.ts";

import * as virtual_server from "./virtual_server.ts";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const { resolve } = createRequire(import.meta.url);

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto as Crypto;
}

const uncompressed_client_wasm = await fs
    .readFile(path.join(__dirname, "../../dist/wasm/perspective-js.wasm"))
    .then((buffer) => load_wasm_stage_0(buffer.buffer as ArrayBuffer));

await perspective_client.default({ module_or_path: uncompressed_client_wasm });
const SYNC_MODULE = await fs
    .readFile(
        resolve("@perspective-dev/server/dist/wasm/perspective-server.wasm"),
    )
    .then((buffer) => load_wasm_stage_0(buffer.buffer as ArrayBuffer))
    .then((buffer) => compile_perspective(buffer.buffer as ArrayBuffer));

let SYNC_CLIENT: perspective_client.Client;

const SYNC_SERVER = new engine.PerspectiveServer(SYNC_MODULE);

// const SYNC_SERVER = new engine.PerspectiveServer(SYNC_MODULE, {
//     on_poll_request: () => SYNC_POLL_HANDLE.on_poll_request(),
// });

// const SYNC_POLL_HANDLE: engine.PerspectivePollThread =
//     new engine.PerspectivePollThread(SYNC_SERVER);

const SYNC_SESSION = SYNC_SERVER.make_session(
    async (resp) => await SYNC_CLIENT.handle_response(resp),
);

SYNC_CLIENT = new perspective_client.Client(async (req: Uint8Array) => {
    await SYNC_SESSION.handle_request(req);
});

export class PerspectiveServer extends engine.PerspectiveServer {
    constructor(options?: engine.PerspectiveServerOptions) {
        super(SYNC_MODULE, options);
    }
}

export const make_session = async (
    send_response: (buffer: Uint8Array) => Promise<void>,
) => SYNC_SERVER.make_session(send_response);

// Helper function to create client emitter/receiver pairs
export function make_client(
    send_request: (buffer: Uint8Array) => Promise<void>,
    close?: Function,
) {
    return new perspective_client.Client(send_request, close);
}

const CONTENT_TYPES: Record<string, string> = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".arrow": "arraybuffer",
    ".feather": "arraybuffer",
    ".wasm": "application/wasm",
};

/**
 * Host a Perspective server that hosts data, code files, etc.
 * Strip version numbers from the URL so we can handle CDN-like requests
 * of the form @[^~]major.minor.patch when testing local versions of
 * Perspective against Voila.
 */
export async function cwd_static_file_handler(
    request: http.IncomingMessage,
    response: http.ServerResponse<http.IncomingMessage>,
    assets = ["./"],
    { debug = true } = {},
) {
    let url =
        request.url
            ?.split(/[\?\#]/)[0]
            .replace(/@[\^~]?\d+.[\d\*]*.[\d\*]*/, "") || "/";

    if (url === "/") {
        url = "/index.html";
    }

    let extname = path.extname(url);
    let contentType = CONTENT_TYPES[extname] || "text/html";
    try {
        for (const root of assets) {
            let filePath = root + url;
            try {
                let content = await fs.readFile(filePath);
                if (typeof content !== "undefined") {
                    if (debug) {
                        console.log(`200 ${url}`);
                    }
                    response.writeHead(200, {
                        "Content-Type": contentType,
                        "Access-Control-Allow-Origin": "*",
                    });
                    if (extname === ".arrow" || extname === ".feather") {
                        response.end(content, "utf-8");
                    } else {
                        response.end(content);
                    }

                    return;
                }
            } catch (e) {}
        }

        if (debug) {
            console.error(`404 ${url}`);
        }

        response.writeHead(404);
        response.end("", "utf-8");
    } catch (error) {
        if (debug) {
            console.error(`500 ${url} ${error}`);
        }

        response.writeHead(500);
        response.end("", "utf-8");
    }
}

function buffer_to_arraybuffer(
    buffer: string | Buffer | ArrayBuffer | Buffer[] | Uint8Array,
): Uint8Array {
    if (typeof buffer === "string") {
        throw new Error("Unknown websocket message: " + buffer);
    } else if (buffer instanceof ArrayBuffer) {
        return new Uint8Array(buffer);
    } else if (buffer instanceof Array) {
        throw new Error("Unknown websocket message: " + buffer);
    } else {
        return new Uint8Array(
            buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.length,
            ),
        );
    }
}

export class WebSocketServer {
    _server: http.Server | any; // stoppable has no type ...
    _wss: HttpWebSocketServer;
    constructor({ port = 8080, assets = ["./"], server = undefined } = {}) {
        const perspective_server =
            typeof server === "undefined" ? SYNC_SERVER : server;

        port = typeof port === "undefined" ? 8080 : port;
        this._server = stoppable(
            http.createServer((x, y) => cwd_static_file_handler(x, y, assets)),
        );

        this._wss = new HttpWebSocketServer({
            noServer: true,
            perMessageDeflate: true,
        });

        this._wss.on("connection", (ws) => {
            console.log("... Connecting websocket");
            const session = perspective_server.make_session(
                async (proto: Uint8Array) => {
                    ws.send(buffer_to_arraybuffer(proto));
                },
            );

            ws.on("message", (proto) => {
                session.handle_request(buffer_to_arraybuffer(proto));
            });

            ws.on("close", () => {
                session.close();
            });
        });

        this._server.on(
            "upgrade",
            (
                request: http.IncomingMessage,
                socket: net.Socket,
                head: Buffer,
            ) => {
                console.log("200 Websocket upgrade");
                this._wss.handleUpgrade(
                    request,
                    socket as net.Socket,
                    head,
                    (sock) => this._wss.emit("connection", sock, request),
                );
            },
        );

        this._server.listen(port, () => {
            console.log(`Listening on ${this._server.address().port}`);
        });
    }

    async close() {
        await new Promise((x) => this._server.stop(x));
    }
}

export function get_hosted_table_names() {
    return SYNC_CLIENT.get_hosted_table_names();
}

export function on_hosted_tables_update(cb: () => void) {
    return SYNC_CLIENT.on_hosted_tables_update(cb);
}

export function remove_hosted_tables_update(id: number) {
    return SYNC_CLIENT.remove_hosted_tables_update(id);
}

export function system_info() {
    return SYNC_CLIENT.system_info();
}

export function on_error(callback: Function) {
    return SYNC_CLIENT.on_error(callback);
}

/**
 * Create a table from the global Perspective instance.
 * @param init_data
 * @param options
 * @returns
 */
export function table(
    init_data:
        | string
        | ArrayBuffer
        | Record<string, any>
        | Record<string, unknown>[],
    options?: perspective_client.TableInitOptions,
) {
    return SYNC_CLIENT.table(init_data, options);
}

/**
 * Create a new client connected via WebSocket to a server implemnting the
 * Perspective Protocol.
 * @param module
 * @param url
 * @returns
 */
export async function websocket(
    url: string,
): Promise<perspective_client.Client> {
    return await psp_websocket.websocket(
        WebSocket as unknown as typeof window.WebSocket,
        perspective_client.Client,
        url,
    );
}

export async function worker(worker: Promise<MessagePort>) {
    const port = await worker;
    const client = new perspective_client.Client(
        async (proto: Uint8Array) => {
            const f = proto.slice().buffer;
            port.postMessage(f, { transfer: [f] });
        },
        async () => {
            console.debug("Closing WebWorker");
            port.close();
        },
    );

    const { promise, resolve, reject } = Promise.withResolvers();
    port.onmessage = function listener(resp) {
        port.onmessage = null;
        resolve(null);
    };

    port.onmessageerror = function (...args) {
        port.onmessage = null;
        console.error(...args);
        reject(args);
    };

    port.postMessage({ cmd: "init", args: [] });
    await promise;
    port.addEventListener("message", (json: MessageEvent<Uint8Array>) => {
        client.handle_response(json.data);
    });

    console.log(client);
    return client;
}

export function createMessageHandler(
    handler: virtual_server.VirtualServerHandler,
) {
    return virtual_server.createMessageHandler(perspective_client, handler);
}

/**
 * The initialized WASM module. Use this when you need to pass the module
 * to components that require it, such as `DuckDBHandler`.
 */
export { perspective_client as wasmModule };

export default {
    table,
    websocket,
    worker,
    get_hosted_table_names,
    on_hosted_tables_update,
    remove_hosted_tables_update,
    on_error,
    system_info,
    WebSocketServer,
};
