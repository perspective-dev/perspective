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
import type { Locator, Page } from "@playwright/test";

const GRID = "perspective-viewer-datagrid regular-table";

async function setup(page: Page, config: Record<string, unknown>) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore({ plugin: "Datagrid", ...config });
        await viewer.flush();
        (window as any).__CONTEXTS__ = [];
        viewer.setCommandSchema((context) => {
            (window as any).__CONTEXTS__.push(context);
            return { commands: [] };
        });
    }, config);
}

async function rightClick(
    page: Page,
    target: Locator,
    position?: { x: number; y: number },
) {
    await target.click({ button: "right", position });
    await page.locator("perspective-context-menu").waitFor();
    return await page.evaluate(() => (window as any).__CONTEXTS__.at(-1));
}

test.describe("Datagrid hit_test", () => {
    test("a flat cell reports its value, column and row", async ({ page }) => {
        await setup(page, { columns: ["State", "Sales"] });
        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const text = (await cell.first().innerText()).trim();
        const { hit } = await rightClick(page, cell.first());
        expect(hit.kind).toBe("cell");
        expect(hit.column_names).toEqual(["State"]);
        expect(hit.value).toBe(text);
        expect(hit.row.State).toBe(text);
        expect(typeof hit.row.Sales).toBe("number");
        expect(hit.row_path).toEqual([]);
        expect(hit.column_path).toEqual([]);
        expect(hit.config).toEqual({ filter: [] });
    });

    test("a grouped row header reports its group path", async ({ page }) => {
        await setup(page, { group_by: ["Region"], columns: ["Sales"] });
        const header = page.locator(`${GRID} tbody tr`).nth(1).locator("th");
        const { hit } = await rightClick(page, header.first());
        expect(hit.kind).toBe("row_header");
        expect(hit.row_path).toEqual(["Central"]);
        expect(hit.column_names).toEqual([]);
        expect(hit.config).toEqual({ filter: [["Region", "==", "Central"]] });
    });

    test("a grouped cell reports its group path and aggregate", async ({
        page,
    }) => {
        await setup(page, { group_by: ["Region"], columns: ["Sales"] });
        const cell = page.locator(`${GRID} tbody tr`).nth(1).locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.kind).toBe("cell");
        expect(hit.row_path).toEqual(["Central"]);
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit.value).toBe(hit.row.Sales);
        expect(hit.config).toEqual({ filter: [["Region", "==", "Central"]] });
    });

    test("a split column cell reports its split path", async ({ page }) => {
        await setup(page, { split_by: ["Region"], columns: ["Sales"] });
        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.kind).toBe("cell");
        expect(hit.column_path).toEqual(["Central"]);
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit.config).toEqual({ filter: [["Region", "==", "Central"]] });
    });

    test("a column header reports its column without a row", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] });
        const header = page.locator(`${GRID} thead th`, { hasText: "Sales" });
        const { hit } = await rightClick(page, header.first());
        expect(hit.kind).toBe("column_header");
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit.row).toEqual({});
        expect(hit.row_path).toEqual([]);
        expect(hit.column_path).toEqual([]);
    });

    test("a split group header reports its split path without a column", async ({
        page,
    }) => {
        await setup(page, { split_by: ["Region"], columns: ["Sales"] });
        const header = page
            .locator(`${GRID} thead tr`)
            .first()
            .locator("th", { hasText: "Central" });

        const { hit } = await rightClick(page, header.first());
        expect(hit.kind).toBe("column_header");
        expect(hit.column_path).toEqual(["Central"]);
        expect(hit.column_names).toEqual([]);
        expect(hit.config).toEqual({ filter: [["Region", "==", "Central"]] });
    });

    test("the view filter is carried into the hit config", async ({ page }) => {
        await setup(page, {
            columns: ["State", "Sales"],
            filter: [["Region", "==", "West"]],
        });

        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.config).toEqual({ filter: [["Region", "==", "West"]] });
    });

    test("empty space beside the grid reports no hit", async ({ page }) => {
        await setup(page, { columns: ["State"] });
        const plugin = page.locator("perspective-viewer-datagrid");
        const box = (await plugin.boundingBox())!;
        const context = await rightClick(page, plugin, {
            x: box.width - 60,
            y: box.height / 2,
        });

        expect("hit" in context).toBe(false);
    });
});
