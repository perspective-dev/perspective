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

interface TableFixture {
    name: string;
    data: Record<string, unknown[]>;
    index: string[];
}

const COMPOSITE: TableFixture = {
    name: "composite",
    data: {
        name: ["AAPL", "AAPL", "MSFT"],
        sector: ["Tech", "Hardware", "Tech"],
        price: [1, 3, 2],
    },
    index: ["name", "sector"],
};

async function setup(
    page: Page,
    config: Record<string, unknown>,
    table?: TableFixture,
) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(
        async ({ config, table }) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            if (table) {
                await (window as any).__TEST_WORKER__.table(table.data, {
                    name: table.name,
                    index: table.index,
                });
            }

            await viewer.restore({
                plugin: "Datagrid",
                ...(table ? { table: table.name } : {}),
                ...config,
            });

            await viewer.flush();
            (window as any).__CONTEXTS__ = [];
            await viewer.setCommandSchema((context) => {
                (window as any).__CONTEXTS__.push(context);
                return { commands: [] };
            });
        },
        { config, table },
    );
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
        expect(hit.y).toBe(0);
        expect(hit.x).toBe(0);
        expect(Array.isArray(hit.id)).toBe(true);
        expect(hit).not.toHaveProperty("row");
        expect(hit.row_path).toEqual([]);
        expect(hit.column_path).toEqual([]);
        expect(hit.config).toEqual({ filter: [["Row ID", "==", hit.id[0]]] });
    });

    test("a grouped row header reports its group path", async ({ page }) => {
        await setup(page, { group_by: ["Region"], columns: ["Sales"] });
        const header = page
            .locator(`${GRID} tbody tr`)
            .nth(1)
            .locator("th:not(.psp-tree-spacer)");

        const { hit } = await rightClick(page, header.first());
        expect(hit.kind).toBe("row");
        expect(hit.y).toBe(1);
        expect(hit.row_path).toEqual(["Central"]);
        expect(hit.id).toEqual(["Central"]);
        expect(hit.column_names).toEqual([]);
        expect(hit).not.toHaveProperty("value");
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
        expect(typeof hit.value).toBe("number");
        expect(hit.config).toEqual({ filter: [["Region", "==", "Central"]] });
    });

    test("a split column cell reports its split path", async ({ page }) => {
        await setup(page, { split_by: ["Region"], columns: ["Sales"] });
        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.kind).toBe("cell");
        expect(hit.column_path).toEqual(["Central"]);
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit.id).toEqual([1]);
        expect(hit.config).toEqual({
            filter: [
                ["Row ID", "==", 1],
                ["Region", "==", "Central"],
            ],
        });
    });

    test("a column header reports its column without a row", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] });
        const header = page.locator(`${GRID} thead th`, { hasText: "Sales" });
        const { hit } = await rightClick(page, header.first());
        expect(hit.kind).toBe("column");
        expect(hit.x).toBe(1);
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit).not.toHaveProperty("y");
        expect(hit.row_path).toEqual([]);
        expect(hit.column_path).toEqual([]);
    });

    test("a split group header reports its first column's split path", async ({
        page,
    }) => {
        await setup(page, { split_by: ["Region"], columns: ["Sales"] });
        const header = page
            .locator(`${GRID} thead tr`)
            .first()
            .locator("th", { hasText: "Central" });

        const { hit } = await rightClick(page, header.first());
        expect(hit.kind).toBe("column");
        expect(hit.column_path).toEqual(["Central"]);
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit.config).toEqual({ filter: [["Region", "==", "Central"]] });
    });

    test("a right-click resolves its hit with no engine call", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] });
        await page.evaluate(async () => {
            const plugin = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const view = plugin.model._view;
            (window as any).__CALLS__ = 0;
            for (const name of [
                "to_json",
                "to_columns_string",
                "column_paths",
            ]) {
                const original = view[name].bind(view);
                view[name] = (...args: unknown[]) => {
                    (window as any).__CALLS__ += 1;
                    return original(...args);
                };
            }
        });

        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.kind).toBe("cell");
        expect(await page.evaluate(() => (window as any).__CALLS__)).toBe(0);
    });

    test("the view filter is carried into the hit config", async ({ page }) => {
        await setup(page, {
            columns: ["State", "Sales"],
            filter: [["Region", "==", "West"]],
        });

        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.config).toEqual({
            filter: [
                ["Region", "==", "West"],
                ["Row ID", "==", hit.id[0]],
            ],
        });
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

    test("a composite-indexed cell reports its key tuple and selects by it", async ({
        page,
    }) => {
        await setup(page, { columns: ["name", "sector", "price"] }, COMPOSITE);
        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.kind).toBe("cell");
        expect(hit.value).toBe("AAPL");
        expect(hit.id).toEqual(["AAPL", "Hardware"]);
        expect(hit.config).toEqual({
            filter: [
                ["name", "==", "AAPL"],
                ["sector", "==", "Hardware"],
            ],
        });
    });

    test("a split_by-only composite-indexed row reports its key tuple", async ({
        page,
    }) => {
        await setup(
            page,
            { columns: ["price"], split_by: ["sector"] },
            COMPOSITE,
        );

        const cell = page.locator(`${GRID} tbody tr`).first().locator("td");
        const { hit } = await rightClick(page, cell.first());
        expect(hit.kind).toBe("cell");
        expect(hit.id).toHaveLength(2);
        expect(hit.config.filter.slice(0, 2)).toEqual([
            ["name", "==", hit.id[0]],
            ["sector", "==", hit.id[1]],
        ]);
    });
});
