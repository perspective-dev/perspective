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

import { expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

async function setup(page: Page, config: Record<string, unknown>) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore({ plugin: "Datagrid", settings: true, ...config });
        await viewer.flush();
    }, config);
}

async function saved_columns(page: Page): Promise<(string | null)[]> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.flush();
        return (await viewer.save()).columns;
    });
}

test.describe("Active column list buttons", () => {
    test("Clear keeps only the first active column", async ({ page }) => {
        await setup(page, { columns: ["Row ID", "Sales", "Profit"] });
        await page.locator("perspective-viewer #clear-columns").click();
        await expect.poll(() => saved_columns(page)).toEqual(["Row ID"]);
        await expect(
            page.locator("perspective-viewer #clear-columns"),
        ).toHaveCount(0);
    });

    test("+ All activates every inactive column", async ({ page }) => {
        await setup(page, { columns: ["Sales"] });
        const names = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const table = await viewer.getTable();
            return Object.keys(await table.schema());
        });

        await page.locator("perspective-viewer #add-all-columns").click();
        await expect
            .poll(async () => (await saved_columns(page)).length)
            .toEqual(names.length);

        const columns = await saved_columns(page);
        expect(columns[0]).toEqual("Sales");
        expect([...columns].sort()).toEqual([...names].sort());
    });
});
