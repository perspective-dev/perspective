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

import { test, expect, PageView } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto(
        "/rust/perspective-viewer/test/html/column-selector-modes.html",
    );
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("+ All with named columns", () => {
    test("starts at the last named column", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, columns: ["Sales", "Profit"] });

        const names = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const table = await viewer.getTable();
            return Object.keys(await table.schema());
        });

        const configUpdated = await view.getEventListener(
            "perspective-config-update",
        );

        await page.locator("perspective-viewer #add-all-columns").click();
        await configUpdated();
        const columns = (await view.save()).columns;
        expect(columns.slice(0, 4)).toEqual(["Sales", "Profit", null, null]);
        expect(columns.length).toEqual(names.length + 2);
        expect(columns.slice(4).sort()).toEqual(
            names.filter((x) => x !== "Sales" && x !== "Profit").sort(),
        );
    });

    test("fills an empty required named column", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, columns: ["Sales"] });
        const configUpdated = await view.getEventListener(
            "perspective-config-update",
        );

        await page.locator("perspective-viewer #add-all-columns").click();
        await configUpdated();
        const columns = (await view.save()).columns;
        expect(columns[0]).toEqual("Sales");
        expect(columns[1]).not.toBeNull();
        expect(columns.slice(2, 4)).toEqual([null, null]);
        expect(columns[4]).not.toBeNull();
    });
});
