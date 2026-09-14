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

import { test } from "@perspective-dev/test";

test.describe("worker types", () => {
    test("Worker", async ({ page }) => {
        await page.goto(
            "http://localhost:6598/node_modules/@perspective-dev/client/test/html/worker.html",
        );

        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const s = await page.evaluate(async (x) => {
            const t = await window.table;
            return await t.size();
        });

        test.expect(s).toEqual(99);
    });

    test("SharedWorker", async ({ page }) => {
        await page.goto(
            "http://localhost:6598/node_modules/@perspective-dev/client/test/html/shared_worker.html",
        );

        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const s = await page.evaluate(async (x) => {
            const t = await window.table;
            return await t.size();
        });

        test.expect(s).toEqual(99);
    });

    // Not supported https://github.com/microsoft/playwright/issues/30981
    test.skip("ServiceWorker", async ({ page }) => {
        await page.goto(
            "/node_modules/@perspective-dev/client/test/html/service_worker.html",
        );

        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const s = await page.evaluate(async (x) => {
            const t = await window.table;
            return await t.size();
        });

        test.expect(s).toEqual(99);
    });

    test("Worker terminate", async ({ page }) => {
        await page.goto(
            "http://localhost:6598/node_modules/@perspective-dev/client/test/html/test.html",
        );

        const result = await page.evaluate(async () => {
            const perspective = await import(
                "http://localhost:6598/node_modules/@perspective-dev/client/dist/esm/perspective.js"
            );

            const wasm = fetch(
                "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
            );

            const wasm2 = fetch(
                "http://localhost:6598/node_modules/@perspective-dev/server/dist/wasm/perspective-server.wasm",
            );

            perspective.init_client(wasm);
            perspective.init_server(wasm2);
            const client = await perspective.worker();
            const table = await client.table({ x: "integer" });
            await table.update([{ x: 1 }]);
            await client.terminate();
            return "terminated";
        });

        test.expect(result).toEqual("terminated");
    });

    test("No SharedWorker or ServiceWorker (embedded)", async ({ page }) => {
        await page.goto(
            "http://localhost:6598/node_modules/@perspective-dev/client/test/html/test.html",
        );

        const s = await page.evaluate(async () => {
            window.SharedWorker = undefined;
            window.ServiceWorker = undefined;
            const perspective = await import(
                "http://localhost:6598/node_modules/@perspective-dev/client/dist/esm/perspective.js"
            );

            const wasm = fetch(
                "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
            );

            const wasm2 = fetch(
                "http://localhost:6598/node_modules/@perspective-dev/server/dist/wasm/perspective-server.wasm",
            );

            perspective.init_client(wasm);
            perspective.init_server(wasm2);

            const worker = await perspective.worker(
                new Worker(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective-server.worker.js",
                ),
            );

            let resp = await fetch(
                "http://localhost:6598/node_modules/@perspective-dev/test/assets/superstore.csv",
            );

            let csv = await resp.text();
            const t = await worker.table(csv);
            return await t.size();
        });

        test.expect(s).toEqual(99);
    });
});
