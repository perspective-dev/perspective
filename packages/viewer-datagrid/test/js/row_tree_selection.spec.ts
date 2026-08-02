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

interface CellState {
    tag: string;
    rowspan: number;
    text: string;
    sel: boolean;
    sub: boolean;
}

async function await_ready(page: Page): Promise<void> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

async function click_row(page: Page, row_index: number): Promise<void> {
    const { x, y } = await page.evaluate(async (row_index) => {
        const viewer = document.querySelector("perspective-viewer")!;
        const datagrid = viewer.querySelector(
            "perspective-viewer-datagrid",
        ) as any;
        const rows = datagrid.shadowRoot.querySelectorAll(
            "regular-table tbody tr",
        );

        const td = rows[row_index].querySelector("td");
        const rect = td.getBoundingClientRect();
        return {
            x: Math.floor(rect.left + rect.width / 2),
            y: Math.floor(rect.top + rect.height / 2),
        };
    }, row_index);

    await page.mouse.click(x, y);
    await page.evaluate(async () => {
        await document.querySelector("perspective-viewer")!.flush();
    });
}

async function wait_for_selection_class(
    page: Page,
    class_name: string,
): Promise<void> {
    await page.waitForFunction((class_name) => {
        const datagrid = document
            .querySelector("perspective-viewer")
            ?.querySelector("perspective-viewer-datagrid") as any;
        return !!datagrid?.shadowRoot?.querySelector(
            `regular-table tbody .${class_name}`,
        );
    }, class_name);
}

async function read_rows(page: Page, limit: number): Promise<CellState[][]> {
    return await page.evaluate(async (limit) => {
        const viewer = document.querySelector("perspective-viewer")!;
        const datagrid = viewer.querySelector(
            "perspective-viewer-datagrid",
        ) as any;
        const rows = Array.from(
            datagrid.shadowRoot.querySelectorAll("regular-table tbody tr"),
        ).slice(0, limit);

        return rows.map((tr: any) =>
            Array.from(tr.children).map((cell: any) => ({
                tag: cell.tagName,
                rowspan: cell.rowSpan,
                text: cell.textContent.trim(),
                sel: cell.classList.contains("psp-select-region"),
                sub: cell.classList.contains("psp-select-region-inactive"),
            })),
        );
    }, limit);
}

test.describe("SELECT_ROW_TREE selection styling", () => {
    // Regression: the row-header "inert th" guard compared the path
    // _value_ at the th's level truthily, so a falsy group key (the
    // `Discount` value 0) routed the merged rowspan'd group header into
    // the styling branch. Selecting the first row of its span (the first
    // row in the sub group) lit the whole inert header in the selection
    // color.
    test("falsy group key does not style the inert rowspan th", async ({
        page,
    }) => {
        await await_ready(page);
        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                plugin: "Datagrid",
                group_by: ["Category", "Discount"],
                columns: ["Sales", "Profit"],
                plugin_config: { edit_mode: "SELECT_ROW_TREE" },
            });
        });

        await click_row(page, 2);
        await wait_for_selection_class(page, "psp-select-region");
        const rows = await read_rows(page, 4);

        const [inert_th, content_th, ...tds] = rows[2];
        expect(inert_th.tag).toEqual("TH");
        expect(inert_th.rowspan).toBeGreaterThan(1);
        expect(inert_th.text).toEqual("");
        expect(inert_th.sel).toEqual(false);
        expect(inert_th.sub).toEqual(false);

        expect(content_th.sel).toEqual(true);
        for (const td of tds) {
            expect(td.sel).toEqual(true);
        }

        for (const cell of rows[3]) {
            expect(cell.sel).toEqual(false);
            expect(cell.sub).toEqual(false);
        }
    });

    test("group selection styles descendants with the secondary class", async ({
        page,
    }) => {
        await await_ready(page);
        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                plugin: "Datagrid",
                group_by: ["Category", "Sub-Category"],
                columns: ["Sales", "Profit"],
                plugin_config: { edit_mode: "SELECT_ROW_TREE" },
            });
        });

        await click_row(page, 1);
        await wait_for_selection_class(page, "psp-select-region-inactive");
        const rows = await read_rows(page, 6);
        const furniture = rows[1].find((c) => c.text === "Furniture")!;
        expect(furniture.sel).toEqual(true);
        for (const row of rows.slice(2, 6)) {
            const content = row.filter((c) => c.text !== "");
            expect(content.length).toBeGreaterThan(0);
            for (const cell of content) {
                expect(cell.sub).toEqual(true);
                expect(cell.sel).toEqual(false);
            }
        }
    });

    test("flat rollup mode downgrades SELECT_ROW_TREE to SELECT_ROW", async ({
        page,
    }) => {
        await await_ready(page);
        const edit_mode = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                group_by: ["Category", "Sub-Category"],
                group_rollup_mode: "flat",
                columns: ["Sales", "Profit"],
                plugin_config: { edit_mode: "SELECT_ROW_TREE" },
            });

            await viewer.flush();
            const datagrid = viewer.querySelector(
                "perspective-viewer-datagrid",
            ) as any;
            return datagrid.model._edit_mode;
        });

        expect(edit_mode).toEqual("SELECT_ROW");
    });
});
