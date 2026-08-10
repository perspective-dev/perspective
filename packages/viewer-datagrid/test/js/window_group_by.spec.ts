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

// A window column used in the `group_by` position appears in no schema the
// client can query (the pivoted `View`'s `schema()` covers visible columns
// only), which historically made `format_cell` fall back to the raw value
// and crash `cell_style_row_header` mid-draw with `.trim is not a
// function`. The model now synthesizes `_window_schema` from the window
// specs, and `format_cell` coerces its fallback to a string.

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

test.describe("window column in group_by", () => {
    test("draws without error and formats row headers", async ({ page }) => {
        await await_ready(page);
        const errors: string[] = [];
        page.on("console", (msg) => {
            if (msg.type() === "error" || msg.type() === "warning") {
                errors.push(msg.text());
            }
        });
        page.on("pageerror", (err) => errors.push(err.message));

        const out = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({
                plugin: "Datagrid",
                plugin_config: { edit_mode: "EDIT" },
                group_by: ["New Column 1"],
                group_rollup_mode: "rollup",
                windows: {
                    "New Column 1": { column: "Sales", aggregate: "sum" },
                },
                columns: ["Sales"],
                settings: true,
            });
            await viewer.flush();

            const datagrid = viewer.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const tree_labels = Array.from(
                datagrid.shadowRoot.querySelectorAll(
                    "regular-table tbody th.psp-tree-label, regular-table tbody th.psp-tree-leaf",
                ),
            ).map((x: any) => x.textContent.trim());
            return { tree_labels };
        });

        expect(
            errors.filter((x) => x.includes("is not a function")),
        ).toStrictEqual([]);

        // Row headers rendered, with float-formatted (not raw) values -
        // the harness superstore Sales sums always format with decimals.
        expect(out.tree_labels.length).toBeGreaterThan(0);
        expect(
            out.tree_labels
                .filter((x: string) => x !== "" && x !== "TOTAL")
                .every((x: string) => /\d/.test(x)),
        ).toBe(true);
    });
});
