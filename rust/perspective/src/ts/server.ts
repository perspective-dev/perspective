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

import fs from "fs";
import stoppable from "stoppable";
import http from "http";
import WebSocket from "ws";
import process from "process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_PATH = path.join(process.cwd(), "node_modules");

const CONTENT_TYPES = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".arrow": "arraybuffer",
    ".feather": "arraybuffer",
    ".wasm": "application/wasm",
};

function read_promise(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, function (error, content) {
            if (error && error.code !== "ENOENT") {
                reject(error);
            } else {
                resolve(content);
            }
        });
    });
}

/**
 * Host a Perspective server that hosts data, code files, etc.
 */
export function perspective_assets(assets) {
    return async function (request, response) {
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Request-Method", "*");
        response.setHeader("Access-Control-Allow-Methods", "OPTIONS,GET");
        response.setHeader("Access-Control-Allow-Headers", "*");

        let url = request.url.split(/[\?\#]/)[0];

        // Strip version numbers from the URL so we can handle CDN-like requests
        // of the form @[^~]major.minor.patch when testing local versions of
        // Perspective against Voila.
        url = url.replace(/@[\^~]?\d+.[\d\*]*.[\d\*]*/, "");

        if (url === "/") {
            url = "/index.html";
        }

        let extname = path.extname(url);
        let contentType = CONTENT_TYPES[extname] || "text/html";
        try {
            for (let rootDir of assets) {
                let filePath = rootDir + url;
                let content = await read_promise(filePath);
                if (typeof content !== "undefined") {
                    console.log(`200 ${url}`);
                    response.writeHead(200, { "Content-Type": contentType });
                    response.end(
                        content,
                        extname === ".arrow" || extname === ".feather"
                            ? undefined
                            : "utf-8"
                    );
                    return;
                }
            }

            if (url.indexOf("favicon.ico") > -1) {
                response.writeHead(200);
                response.end("", "utf-8");
            } else {
                console.error(`404 ${url}`);
                response.writeHead(404);
                response.end("", "utf-8");
            }
        } catch (error) {
            if (error.code !== "ENOENT") {
                console.error(`500 ${url}`);
                response.writeHead(500);
                response.end("", "utf-8");
            }
        }
    };
}

export class WebSocketServer {
    _server: any;
    _wss: any;
    constructor({ assets = [], port = 8080, on_start = () => {} } = {}) {
        // super();
        port = typeof port === "undefined" ? 8080 : port;
        assets = assets || ["./"];

        // Serve Perspective files through HTTP
        this._server = stoppable(http.createServer(perspective_assets(assets)));

        // // Serve Worker API through WebSockets
        // this._wss = new WebSocket.Server({
        //     noServer: true,
        //     perMessageDeflate: true,
        // });

        // // When the server starts, define how to handle messages
        // this._wss.on("connection", (ws) => this.add_connection(ws));

        this._server.on("upgrade", (request, socket, head) => {
            console.log("200    *** websocket upgrade ***");
            this._wss.handleUpgrade(request, socket, head, (sock) =>
                this._wss.emit("connection", sock, request)
            );
        });

        this._server.listen(port, () => {
            console.log(`Listening on port ${this._server.address().port}`);
            on_start();
        });
    }

    async close() {
        // super.clear();
        await new Promise((x) => this._server.stop(x));
    }
}
