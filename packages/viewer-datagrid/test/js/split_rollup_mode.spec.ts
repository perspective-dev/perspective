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

async function await_ready(page: Page): Promise<void> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

async function restore_and_read_headers(
    page: Page,
    config: Record<string, unknown>,
): Promise<{
    header_rows: string[][];
    total_cells: string[];
    border_classes: string[][][];
    corner_cells: boolean[][];
}> {
    return await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        await viewer.restore(config);
        await viewer.flush();
        const datagrid = viewer.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const thead = datagrid.shadowRoot.querySelector("regular-table thead");
        const header_rows = Array.from(thead.querySelectorAll("tr")).map(
            (tr: any) =>
                Array.from(tr.children).map((th: any) =>
                    th.textContent.replace(/\u200b/g, "").trim(),
                ),
        ) as string[][];
        const total_cells = Array.from(
            datagrid.shadowRoot.querySelectorAll(
                "regular-table .psp-split-total, regular-table .psp-split-subtotal",
            ),
        ).map((x: any) =>
            x.textContent.replace(/\u200b/g, "").trim(),
        ) as string[];
        const border_classes = Array.from(thead.querySelectorAll("tr")).map(
            (tr: any) =>
                Array.from(tr.children).map((th: any) =>
                    Array.from(th.classList as DOMTokenList)
                        .filter((x: any) => (x as string).startsWith("psp-b-"))
                        .sort(),
                ),
        ) as string[][][];
        const corner_cells = Array.from(thead.querySelectorAll("tr")).map(
            (tr: any) =>
                Array.from(tr.children).map((th: any) =>
                    th.classList.contains("psp-header-group-corner"),
                ),
        ) as boolean[][];
        return { header_rows, total_cells, border_classes, corner_cells };
    }, config);
}

test.describe("split_rollup_mode datagrid rendering", () => {
    test("rollup mode renders a leading Total column group", async ({
        page,
    }) => {
        await await_ready(page);
        const { header_rows, total_cells } = await restore_and_read_headers(
            page,
            {
                plugin: "Datagrid",
                columns: ["Sales"],
                group_by: ["Region"],
                split_by: ["Category"],
                split_rollup_mode: "rollup",
                settings: false,
            },
        );

        expect(header_rows.length).toBeGreaterThanOrEqual(2);
        const group_row = header_rows[0];
        expect(group_row.filter((x) => x !== "")[0]).toEqual("Furniture");
        expect(total_cells.length).toBeGreaterThan(0);
    });

    test("flat mode (default) renders no Total group and no rollup classes", async ({
        page,
    }) => {
        await await_ready(page);
        const { total_cells } = await restore_and_read_headers(page, {
            plugin: "Datagrid",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category"],
            settings: false,
        });

        expect(total_cells).toStrictEqual([]);
    });

    test("2-level split pads subtotal headers to the column-name row", async ({
        page,
    }) => {
        await await_ready(page);
        const { header_rows } = await restore_and_read_headers(page, {
            plugin: "Datagrid",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category", "Ship Mode"],
            split_rollup_mode: "rollup",
            settings: false,
        });

        // 2 split-level rows + 1 column-name row; the column-name row
        // contains "Sales" for every group, subtotals included.
        expect(header_rows.length).toBeGreaterThanOrEqual(3);
        const name_row = header_rows[header_rows.length - 1];
        expect(
            name_row.filter((x) => x !== "").every((x) => x === "Sales"),
        ).toBe(true);
    });

    test("mitered border classes follow boundary depth", async ({ page }) => {
        await await_ready(page);
        const { header_rows, border_classes, corner_cells } =
            await restore_and_read_headers(page, {
                plugin: "Datagrid",
                columns: ["Sales"],
                group_by: ["Region"],
                split_by: ["Category", "Ship Mode"],
                split_rollup_mode: "rollup",
                settings: false,
            });

        const total_x = header_rows[0].findIndex(
            (text, i) => text === "" && !corner_cells[0][i],
        );
        expect(total_x).toBeGreaterThanOrEqual(0);
        expect(border_classes[0][total_x]).toContain("psp-b-r-mt");
        expect(border_classes[0][total_x]).not.toContain("psp-b-b-mlr");

        const pad_x = header_rows[1].findIndex(
            (text, i) =>
                text === "" &&
                !corner_cells[1][i] &&
                border_classes[1][i].includes("psp-b-r"),
        );

        expect(pad_x).toBeGreaterThanOrEqual(0);
        expect(border_classes[1][pad_x]).not.toContain("psp-b-b-mlr");
        expect(border_classes[1].some((x) => x.includes("psp-b-r-mt"))).toBe(
            true,
        );

        const name_y = border_classes.length - 1;
        expect(
            border_classes[name_y].some((x) => x.includes("psp-b-r-mb")),
        ).toBe(true);
    });

    test("single header row draws no mitered borders", async ({ page }) => {
        await await_ready(page);
        const { border_classes } = await restore_and_read_headers(page, {
            plugin: "Datagrid",
            columns: ["Sales", "Profit"],
            group_by: [],
            split_by: [],
            settings: false,
        });

        expect(border_classes.length).toEqual(1);
        expect(border_classes[0].every((x) => x.length === 0)).toBe(true);
    });
});
