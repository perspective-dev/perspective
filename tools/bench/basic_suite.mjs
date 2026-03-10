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

import * as fs from "node:fs";
import * as path from "node:path";
import * as all_benchmarks from "./cross_platform_suite.mjs";
import * as perspective_bench from "./src/js/benchmark.mjs";

import { createRequire } from "node:module";
import * as url from "node:url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

const _require = createRequire(import.meta.url);

/**
 * We use the `dependencies` of this package for the benchmark candidate
 * module list, so that we only need specify the dependencies and benchmark
 * candidates in one place.
 */
const VERSIONS = Object.keys(
    JSON.parse(fs.readFileSync(_require.resolve(`./package.json`)))
        .dependencies,
);

fs.mkdirSync(path.join(__dirname, "./dist"), { recursive: true });
perspective_bench.suite(
    // "ws://localhost:8082/websocket",
    ["@perspective-dev/client", ...VERSIONS],
    path.join(__dirname, "dist/benchmark-js.arrow"),
    async function (path, version_idx) {
        let client, metadata;
        if (path.startsWith("ws://")) {
            console.log(path);
            const { default: perspective } = await import(
                "@perspective-dev/client"
            );
            client = await perspective.websocket(path);
            metadata = {
                version: "4.3.0",
                version_idx,
            };
        } else {
            const perspective = await import(path);
            const pkg_json = JSON.parse(
                fs.readFileSync(_require.resolve(`${path}/package.json`)),
            );

            let version = pkg_json.version;
            console.log(`${path} (${pkg_json.name}@${version})`);
            if (version === "@perspective-dev/client") {
                version = `${version} (master)`;
            }

            client = perspective.default || perspective;
            metadata = { version, version_idx };
        }

        globalThis.__SEND__ = (x) => process.send(x);

        await all_benchmarks.table_suite(client, metadata);
        await all_benchmarks.view_suite(client, metadata);
        await all_benchmarks.to_data_suite(client, metadata);
    },
);
