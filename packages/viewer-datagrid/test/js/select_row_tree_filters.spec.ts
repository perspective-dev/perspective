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
import type { Page } from "@playwright/test";

const TABLE = "select-row-tree-filters";

interface SelectEvent {
    selected: boolean;
    insertFilters: unknown[];
    column_names: unknown[];
}

async function setup(page: Page, group_by: string[]): Promise<void> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(
        async ({ name, group_by }) => {
            const worker = (window as any).__TEST_WORKER__;
            const table = await worker.table(
                { n: "integer", s: "string", v: "float" },
                { name },
            );

            await table.update({
                n: [0, 0, null, null, 1, 2],
                s: ["", "a", "a", "b", "a", "b"],
                v: [1, 2, 3, 4, 5, 6],
            });

            (window as any).__SELECT_EVENTS__ = [];
            const viewer = document.querySelector("perspective-viewer")! as any;
            viewer.addEventListener(
                "perspective-global-filter",
                (event: CustomEvent) => {
                    (window as any).__SELECT_EVENTS__.push({
                        selected: event.detail.selected,
                        insertFilters: event.detail.insertFilters,
                        column_names: event.detail.column_names,
                    });
                },
            );

            await viewer.restore({
                table: name,
                plugin: "Datagrid",
                group_by,
                columns: ["v"],
                plugin_config: { edit_mode: "SELECT_ROW_TREE" },
            });

            await viewer.flush();
        },
        { name: TABLE, group_by },
    );
}

async function select_row_path(
    page: Page,
    row_path: unknown[],
): Promise<SelectEvent> {
    const { x, y } = await page.evaluate(async (row_path) => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        const view = await viewer.getView();
        const rows = await view.to_json();
        const index = rows.findIndex(
            (row: any) =>
                JSON.stringify(row.__ROW_PATH__) === JSON.stringify(row_path),
        );

        if (index < 0) {
            throw new Error(`No row ${JSON.stringify(row_path)}`);
        }

        const datagrid = viewer.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const td = datagrid.shadowRoot
            .querySelectorAll("regular-table tbody tr")
            [index].querySelector("td");

        const rect = td.getBoundingClientRect();
        return {
            x: Math.floor(rect.left + rect.width / 2),
            y: Math.floor(rect.top + rect.height / 2),
        };
    }, row_path);

    const count = await page.evaluate(
        () => (window as any).__SELECT_EVENTS__.length,
    );

    await page.mouse.click(x, y);
    await page.waitForFunction(
        (count) => (window as any).__SELECT_EVENTS__.length > count,
        count,
    );

    return await page.evaluate(
        () => (window as any).__SELECT_EVENTS__.at(-1) as SelectEvent,
    );
}

async function count_matching(page: Page, filter: unknown[]): Promise<number> {
    return await page.evaluate(
        async ({ name, filter }) => {
            const worker = (window as any).__TEST_WORKER__;
            const table = await worker.open_table(name);
            const view = await table.view({ filter });
            const rows = await view.num_rows();
            await view.delete();
            return rows;
        },
        { name: TABLE, filter },
    );
}

test.describe("SELECT_ROW_TREE broadcast filters", () => {
    test("a 0 group key filters on == 0", async ({ page }) => {
        await setup(page, ["n"]);
        const event = await select_row_path(page, [0]);
        expect(event.selected).toBe(true);
        expect(event.insertFilters).toEqual([["n", "==", 0]]);
        expect(await count_matching(page, event.insertFilters)).toBe(2);
    });

    test("a null group key filters on is null", async ({ page }) => {
        await setup(page, ["n"]);
        const event = await select_row_path(page, [null]);
        expect(event.selected).toBe(true);
        expect(event.insertFilters).toEqual([["n", "is null", null]]);
        expect(await count_matching(page, event.insertFilters)).toBe(2);
    });

    test("falsy keys are kept at every depth", async ({ page }) => {
        await setup(page, ["n", "s"]);
        const empty = await select_row_path(page, [0, ""]);
        expect(empty.insertFilters).toEqual([
            ["n", "==", 0],
            ["s", "==", ""],
        ]);

        expect(await count_matching(page, empty.insertFilters)).toBe(1);

        const nested_null = await select_row_path(page, [null, "b"]);
        expect(nested_null.insertFilters).toEqual([
            ["n", "is null", null],
            ["s", "==", "b"],
        ]);

        expect(await count_matching(page, nested_null.insertFilters)).toBe(1);
    });

    test("a grouped row names no column; TOTAL derives no filter", async ({
        page,
    }) => {
        await setup(page, ["n"]);
        const zero = await select_row_path(page, [0]);
        expect(zero.column_names).toEqual([]);

        const total = await select_row_path(page, []);
        expect(total.selected).toBe(true);
        expect(total.insertFilters).toEqual([]);
        expect(total.column_names).toEqual([]);
    });
});
