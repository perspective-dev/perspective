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

import { test, expect } from "@perspective-dev/test";
import {
    PageView,
    compareContentsToSnapshot,
    shadow_click,
    shadow_type,
} from "@perspective-dev/test";

async function checkSaveDisabled(page, expr) {
    let view = new PageView(page);
    let settingsPanel = await view.openSettingsPanel();
    await settingsPanel.createNewExpression("", expr, false);
}

test.beforeEach(async ({ page }) => {
    await page.goto(
        "/node_modules/@perspective-dev/viewer/test/html/superstore.html",
    );

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
});

const RESULT = {
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
    group_by: [],
    plugin: "Debug",
    plugin_config: {},
    settings: false,
    sort: [],
    split_by: [],
    table: "load-viewer-csv",
    theme: "Pro Light",
    title: null,
    group_rollup_mode: "rollup",
};

test.describe("DOM API", () => {
    test.describe("Calling restore() with a table name immediately sets default plugin and columns", () => {
        test("Proper await order", async ({ page }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer");
                old.parentElement.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load(window.__TEST_WORKER__);
                await viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });

        test("Missing await on load()", async ({ page }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer");
                old.parentElement.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                viewer.load(window.__TEST_WORKER__);
                await viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });

        test("Missing await on restore()", async ({ page }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer");
                old.parentElement.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load(window.__TEST_WORKER__);
                viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });

        test("Missing await on both", async ({ page }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer");
                old.parentElement.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                viewer.load(window.__TEST_WORKER__);
                viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });
    });

    test.describe("Calling load() and restore() before appending to the DOM", () => {
        test("Proper await order", async ({ page }) => {
            const contents = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer");
                old.parentElement.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load(window.__TEST_WORKER__);
                await viewer.restore({ table: "load-viewer-csv" });
                document.body.appendChild(viewer);
                await viewer.flush();
                return document.body.innerHTML;
            });

            await compareContentsToSnapshot(contents, [
                "load-restore-before-append.txt",
            ]);
        });

        test("Missing await on restore()", async ({ page }) => {
            const contents = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer");
                old.parentElement.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load(window.__TEST_WORKER__);
                viewer.restore({ table: "load-viewer-csv" });
                document.body.appendChild(viewer);
                await viewer.flush();
                return document.body.innerHTML;
            });

            await compareContentsToSnapshot(contents, [
                "load-restore-before-append.txt",
            ]);
        });
    });
});
