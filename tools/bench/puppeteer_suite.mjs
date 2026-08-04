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

import * as all_benchmarks from "./cross_platform_suite.mjs";
import * as perspective_bench from "./src/js/benchmark.mjs";
import * as puppeteer from "puppeteer";

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as process from "node:process";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

/**
 * We use the `dependencies` of this package for the benchmark candidate
 * module list, so that we only need specify the dependencies and benchmark
 * candidates in one place.
 */
const VERSIONS = [
    "@perspective-dev/client",
    "perspective-3-0-0",
    "perspective-2-10-0",
];

perspective_bench.suite(
    [...VERSIONS],
    path.join(__dirname, "dist/benchmark-js.arrow"),
    async function (path, version_idx) {
        let client, metadata;
        console.log(path);
        const browser = await puppeteer.launch({
            headless: true,
            protocolTimeout: 100_000_000,
        });
        const page = await browser.newPage();

        await page.goto("http://localhost:8081/empty.html");

        async function test_suite(suite) {
            const items = await page.evaluate(
                async ([version, suite, version_idx]) => {
                    const { default: perspective } = await import(
                        `/tools/bench/node_modules/${version}/dist/esm/perspective.inline.js`
                    );
                    const benchmarks = await import(
                        "/tools/bench/cross_platform_suite.mjs"
                    );

                    const metadata = {
                        version,
                        version_idx,
                    };
                    const total = [];
                    window.__SEND__ = (x) => {
                        total.push(x);
                    };

                    const client = await perspective.worker();
                    await benchmarks[suite](client, metadata);
                    return total;
                },
                [path, suite, version_idx],
            );

            for (const { obs_records, stats } of items) {
                process.send({ obs_records, stats });
            }
        }

        await test_suite("table_suite");
        await test_suite("view_suite");
        await test_suite("to_data_suite");
        await test_suite("join_suite");
        await test_suite("window_suite");
    },
);
