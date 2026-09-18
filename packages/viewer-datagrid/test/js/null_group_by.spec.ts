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

const TABLE = "null-group-by";

async function load_null_table(
    page: Page,
    config: Record<string, unknown>,
): Promise<void> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(
        async ({ name, config }) => {
            const worker = (window as any).__TEST_WORKER__;
            await worker.table(
                {
                    g: ["a", null, "a", null, "b"],
                    h: ["x", "y", null, "x", "z"],
                    v: [1, 2, 3, 4, 5],
                },
                { name },
            );

            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({
                table: name,
                plugin: "Datagrid",
                columns: ["v"],
                ...config,
            });

            await viewer.flush();
        },
        { name: TABLE, config },
    );
}

async function read_row_headers(page: Page) {
    return await page.evaluate(() => {
        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        )! as any;

        const table = datagrid.shadowRoot.querySelector("regular-table");
        const rows = Array.from(
            table.querySelectorAll("tbody tr"),
        ) as HTMLElement[];

        return rows.map((tr) =>
            (Array.from(tr.querySelectorAll("th")) as HTMLElement[]).map(
                (th) => {
                    const style = getComputedStyle(th);
                    return {
                        text: th.textContent!.trim(),
                        x: table.getMeta(th)?.row_header_x as number,
                        classes: Array.from(th.classList).filter(
                            (x) =>
                                x.startsWith("psp-tree-") || x === "psp-null",
                        ),
                        min_width: style.minWidth,
                        max_width: style.maxWidth,
                        pointer_events: style.pointerEvents,
                        background_image: style.backgroundImage,
                        border_top_width: style.borderTopWidth,
                        after: getComputedStyle(th, "::after").content,
                    };
                },
            ),
        );
    });
}

type HeaderCell = Awaited<ReturnType<typeof read_row_headers>>[0][0];

function visual(cell: HeaderCell) {
    return {
        min_width: cell.min_width,
        max_width: cell.max_width,
        pointer_events: cell.pointer_events,
        background_image: cell.background_image,
        border_top_width: cell.border_top_width,
    };
}

test.describe("null group_by values", () => {
    test("tree mode labels a null key like any other key", async ({ page }) => {
        await load_null_table(page, { group_by: ["g", "h"] });
        const rows = await read_row_headers(page);
        const cells = rows.flat();

        const null_labels = cells.filter((x) => x.classes.includes("psp-null"));
        expect(null_labels.length).toBe(2);
        for (const cell of null_labels) {
            expect(cell.classes).not.toContain("psp-tree-spacer");
            expect(cell.after).toBe('"-"');
        }

        const null_parent = null_labels.find((x) =>
            x.classes.includes("psp-tree-label"),
        )!;
        const parent = cells.find(
            (x) => x.text === "a" && x.classes.includes("psp-tree-label"),
        )!;

        expect(null_parent.classes).toContain("psp-tree-label-collapse");
        expect(visual(null_parent)).toEqual(visual(parent));

        const null_leaf = null_labels.find((x) =>
            x.classes.includes("psp-tree-leaf"),
        )!;
        const leaf = cells.find(
            (x) => x.text === "z" && x.classes.includes("psp-tree-leaf"),
        )!;

        expect(visual(null_leaf)).toEqual(visual(leaf));
    });

    test("tree mode spacers are exactly the indent fillers", async ({
        page,
    }) => {
        await load_null_table(page, { group_by: ["g", "h"] });
        const rows = await read_row_headers(page);
        for (const row of rows) {
            const labels = row.filter(
                (x) =>
                    x.classes.includes("psp-tree-label") ||
                    x.classes.includes("psp-tree-leaf"),
            );

            expect(labels.length).toBe(1);
            expect(row[row.length - 1]).toBe(labels[0]);
            for (const cell of row.slice(0, -1)) {
                expect(cell.classes).toEqual(["psp-tree-spacer"]);
            }
        }
    });

    test("a null key can be collapsed", async ({ page }) => {
        await load_null_table(page, { group_by: ["g", "h"] });
        const before = (await read_row_headers(page)).length;
        const label = page.locator(
            "perspective-viewer-datagrid regular-table tbody th.psp-null.psp-tree-label-collapse",
        );

        await label.click({ position: { x: 8, y: 8 } });
        await page.evaluate(async () => {
            await (document.querySelector("perspective-viewer") as any).flush();
        });

        await expect(
            page.locator(
                "perspective-viewer-datagrid regular-table tbody th.psp-null.psp-tree-label-expand",
            ),
        ).toHaveCount(1);

        expect((await read_row_headers(page)).length).toBe(before - 2);
    });

    test("flat mode labels a null key like any other key", async ({ page }) => {
        await load_null_table(page, {
            group_by: ["g", "h"],
            group_rollup_mode: "flat",
        });

        const cells = (await read_row_headers(page)).flat();
        expect(
            cells.filter((x) => x.classes.includes("psp-tree-spacer")),
        ).toEqual([]);

        const null_cells = cells.filter((x) => x.classes.includes("psp-null"));
        expect(new Set(null_cells.map((x) => x.x))).toEqual(new Set([0, 1]));
        for (const cell of null_cells) {
            const label = cells.find(
                (x) => x.x === cell.x && !x.classes.includes("psp-null"),
            )!;

            expect(cell.classes).toContain("psp-tree-label");
            expect(cell.after).toBe('"-"');
            expect(visual(cell)).toEqual(visual(label));
        }
    });
});
