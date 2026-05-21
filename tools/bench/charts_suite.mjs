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
import * as url from "node:url";
import * as process from "node:process";

import { chromium } from "@playwright/test";

import * as perspective_bench from "./src/js/benchmark.mjs";
import { CASES } from "./charts_cases.mjs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);
const PAGE_HARNESS = fs.readFileSync(
    path.join(__dirname, "charts_page_harness.js"),
    "utf8",
);

// Match the SwiftShader / DPR=1 launch flags from
// `tools/test/playwright.config.ts` so frame timings come from the
// deterministic software GL path, not whatever GPU the host has.
const LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    '--proxy-server="direct://"',
    "--proxy-bypass-list=*",
    "--js-flags=--expose-gc",
    "--enable-precise-memory-info",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    // "--use-gl=swiftshader",
    // "--use-angle=swiftshader",
];

fs.mkdirSync(path.join(__dirname, "./dist"), { recursive: true });

// Single-version run — the workspace build. The `suite()` harness still
// expects an array; we only need one entry.
const VERSIONS = ["@perspective-dev/viewer-charts"];

perspective_bench.suite(
    VERSIONS,
    path.join(__dirname, "dist/benchmark-charts.arrow"),
    async function run_charts_bench(_path, version_idx) {
        const version = "workspace";
        const browser = await chromium.launch({
            headless: false,
            args: LAUNCH_ARGS,
        });

        try {
            const context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1,
            });
            const page = await context.newPage();

            page.on("pageerror", (err) =>
                console.error("page error:", err.message),
            );
            page.on("console", (msg) => {
                if (msg.type() === "error") {
                    console.error("page console.error:", msg.text());
                }
            });

            // The bench WebSocketServer (port 8081) mounts
            // `["src/html/", "../.."]` relative to cwd. Our cwd is
            // `tools/bench`, so `src/html/charts-bench.html` is served at
            // `/charts-bench.html` and `/node_modules/...` resolves through
            // the workspace root.
            await page.goto("http://localhost:8081/charts-bench.html");

            await page.waitForFunction(
                () => window["__TEST_PERSPECTIVE_READY__"] === true,
                null,
                { timeout: 60_000 },
            );

            await page.addScriptTag({ content: PAGE_HARNESS });
            for (const c of CASES) {
                // Run one `benchmark()` per case in the page context. The
                // bench harness's browser branch uses `performance.now()`
                // around our `test()`, and `__SEND__` collects observations
                // we forward to the parent over IPC.
                const items = await page.evaluate(
                    async ({ caseSpec, version, version_idx }) => {
                        const { benchmark } = await import(
                            "/tools/bench/src/js/benchmark.mjs"
                        );

                        const total = [];
                        window.__SEND__ = (x) => total.push(x);
                        await window.__BENCH_RESTORE__(caseSpec.config);
                        await benchmark({
                            name: `${caseSpec.name}`,
                            metadata: { version, version_idx },
                            async after() {
                                await new Promise((x) =>
                                    requestAnimationFrame(x),
                                );
                            },
                            async test() {
                                await window.__BENCH_DRAW__();
                            },
                        });

                        return total;
                    },
                    { caseSpec: c, version, version_idx },
                );

                for (const item of items) {
                    process.send(item);
                }

                // await page.pause();
            }
        } finally {
            await browser.close();
        }
    },
);
