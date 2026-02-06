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

/**
 * @module python_suite
 *
 * Run the Python benchmarks against hte Node.js client.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import * as python from "./src/js/servers/python.mjs";
import * as all_benchmarks from "./cross_platform_suite.mjs";
import * as perspective_bench from "./src/js/benchmark.mjs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

const CLIENT_VERSION = {
    master: "@perspective-dev/client",
    "3.6.0": "perspective-3-6-0",
    "3.5.0": "perspective-3-5-0",
    "3.4.0": "perspective-3-4-0",
    "3.3.0": "perspective-3-3-0",
    "3.2.0": "perspective-3-2-0",
    "3.1.0": "perspective-3-1-0",
    "3.0.3": "perspective-3-0-0",
    "2.10.1": "perspective-2-10-0",
    "2.9.0": "perspective-2-9-0",
    "2.8.0": "perspective-2-8-0",
    "2.7.0": "perspective-2-7-0",
    "2.6.0": "perspective-2-6-0",
    "2.5.0": "perspective-2-5-0",
    "2.4.0": "perspective-2-4-0",
    "2.3.2": "perspective-2-3-0",
    "2.3.1": "perspective-2-3-0",
};

fs.mkdirSync(path.join(__dirname, "./dist"), { recursive: true });

perspective_bench.suite(
    [...Object.keys(CLIENT_VERSION)],
    path.join(__dirname, "dist/benchmark-python.arrow"),
    async function (version, version_idx) {
        console.log(version);
        const { default: perspective } = await import(CLIENT_VERSION[version]);
        const client = await perspective.websocket(
            "ws://127.0.0.1:8082/websocket",
            { maxPayload: 1024 * 1024 * 1024 },
        );

        const metadata = { version, version_idx };
        globalThis.__SEND__ = (x) => process.send(x);
        await all_benchmarks.table_suite(client, metadata);
        await all_benchmarks.view_suite(client, metadata);
        await all_benchmarks.to_data_suite(client, metadata);
    },
    python.start,
    python.stop,
);
