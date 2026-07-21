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
    test,
    expect,
    compareContentsToSnapshot,
    getShadowContents,
} from "../helpers.ts";

const get_contents = getShadowContents;

test.describe("Viewer Load", () => {
    test("load > resolves with valid Table promise", async ({ page }) => {
        await page.goto("/rust/perspective-viewer/test/html/blank.html");
        await page.waitForFunction(() => "WORKER" in window);

        const viewer = page.locator("perspective-viewer");
        await viewer.evaluate(async (viewer) => {
            const goodTable = (await window.WORKER).table("a,b,c\n1,2,3");
            return viewer.load(goodTable);
        });
        await expect(viewer).toHaveText(/"a","b","c"/); // column titles
    });

    test("load > rejects with failed Table promise", async ({ page }) => {
        await page.goto("/rust/perspective-viewer/test/html/blank.html");
        await page.waitForFunction(() => "WORKER" in window);

        const viewer = page.locator("perspective-viewer");
        await expect(
            viewer.evaluate((viewer) => {
                const errorTable = Promise.reject(new Error("blimpy"));
                return viewer.load(errorTable);
            }),
        ).rejects.toThrow("blimpy");
    });

    test("load > recovers after a rejected Table promise", async ({ page }) => {
        await page.goto("/rust/perspective-viewer/test/html/blank.html");
        await page.waitForFunction(() => "WORKER" in window);

        const viewer = page.locator("perspective-viewer");
        const didError = await viewer.evaluate(async (viewer) => {
            const errorTable = Promise.reject(new Error("blimpy"));
            const worker = await window.WORKER;
            let didError = false;
            try {
                await viewer.load(errorTable);
            } catch (e) {
                if (e.message.includes("blimpy")) {
                    didError = true;
                }
            }

            const goodTable = worker.table("a,b,c\n1,2,3");
            await viewer.load(goodTable);
            return didError;
        });
        expect(didError).toBe(true);
    });

    test("load > is inert when called twice with the same Table", async ({
        page,
    }) => {
        await page.goto("/rust/perspective-viewer/test/html/superstore.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer").restore({
                plugin: "Debug",
            });
        });

        const contents = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({ settings: true });
            const table = await viewer.getTable();
            await viewer.load(table);
            return viewer.shadowRoot.innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("load > does not throw when restore is called during a failed load", async ({
        page,
        consoleLogs,
    }) => {
        const errors = [];
        page.on("pageerror", async (msg) => {
            errors.push(`${msg.name}::${msg.message}`);
        });

        await page.goto("/rust/perspective-viewer/test/html/blank.html", {
            waitUntil: "networkidle",
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            viewer.load(
                new Promise((_, reject) => reject("Intentional Load Error")),
            );
            try {
                await viewer.restore({
                    settings: true,
                    plugin: "Debug",
                });
            } catch (e) {
                // We need to catch this error else the `evaluate()` fails.
                // We need to await the call because we want it to fail
                // before continuing the test.
                console.error("Caught error:", e);
            }

            await new Promise((x) => setTimeout(x, 1000));
        });

        const contents = await get_contents(page);
        expect(errors).toEqual([
            'Error::Failed to construct table from JsValue("Intentional Load Error")',
        ]);
        consoleLogs.expectedLogs.push("error", /Intentional Load Error/);
    });

    test("load is well-ordered when unawaited preceding a restore", async ({
        page,
    }) => {
        await page.goto("/rust/perspective-viewer/test/html/superstore.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const contents = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const table = await viewer!.getTable();
            await viewer?.delete();
            document.body.removeChild(viewer!);
            const viewer2 = document.createElement("perspective-viewer");
            document.body.appendChild(viewer2);

            // Don't await
            viewer2.load(table);

            await viewer2.restore({ group_by: ["State"] });
            return await viewer2.save();
        });

        expect(contents).toEqual({
            aggregates: {},
            columns: [
                "Row ID",
                "Order ID",
                "Order Date",
                "Ship Date",
                "Ship Mode",
                "Customer ID",
                "Segment",
                "Country",
                "City",
                "State",
                "Postal Code",
                "Region",
                "Product ID",
                "Category",
                "Sub-Category",
                "Sales",
                "Quantity",
                "Discount",
                "Profit",
            ],
            columns_config: {},
            expressions: {},
            filter: [],
            group_by: ["State"],
            group_rollup_mode: "rollup",
            plugin: "Debug",
            plugin_config: {},
            settings: false,
            sort: [],
            split_by: [],
            table: "load-viewer-csv",
            theme: "Pro Light",
            title: null,
            version: "4.5.2",
        });
    });
});
