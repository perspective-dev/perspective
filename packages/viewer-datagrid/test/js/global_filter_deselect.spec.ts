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

// Removing a global filter from the `GlobalFilterBar` (chip × / "Clear")
// must also clear the ORIGINATING master panel's selection state — the
// datagrid's row-tree highlight otherwise outlives the filter it produced,
// implying a cross-filter that no longer exists. The host routes this
// through the plugin's optional `deselect()` method, which is SILENT (no
// selection events), so the removal cannot echo back into the filter set.

import { expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

const TABLE = "load-viewer-csv";

/// Selection state of the master datagrid, read off its internal model.
async function master_selection(page: Page) {
    return await page.evaluate(() => {
        const plugin = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;
        return {
            areas: plugin.model._selection_state.selected_areas.length,
            tree_id: plugin.model._tree_selection_id ?? null,
        };
    });
}

function wait_deselected(page: Page) {
    return page.waitForFunction(() => {
        const plugin = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;
        return (
            plugin.model._selection_state.selected_areas.length === 0 &&
            plugin.model._tree_selection_id === undefined
        );
    });
}

/// Two datagrid panels — the seed (grouped, the master candidate) and a
/// flat detail — with the seed toggled to master via the context menu.
async function setup(page: Page) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(
        async ({ table }) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                plugin: "Datagrid",
                group_by: ["State"],
                columns: ["Sales"],
            });
            await viewer.addPanel({
                plugin: "Datagrid",
                table,
                columns: ["State", "Sales"],
            });
            // The `GlobalFilterBar` chips live in the status bar, whose
            // whole body renders only while the settings panel is open.
            await viewer.toggleConfig(true);
            await viewer.flush();
        },
        { table: TABLE },
    );

    // Toggle the (pivoted) seed panel to master via its context menu.
    const master = page.locator("perspective-viewer-datagrid").first();
    await master.click({ button: "right" });
    const menu = page.locator("perspective-context-menu");
    await menu.waitFor();
    await menu.locator(".context-menu-item", { hasText: "Master" }).click();

    // `set_edit_mode` lands via an async plugin-config restore.
    await page.waitForFunction(() => {
        const plugin = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;
        return plugin.model?._edit_mode === "SELECT_ROW_TREE";
    });
}

/// Select a row-tree row on the master (row 0 is the group-by TOTAL row,
/// whose empty row path contributes no filter — click a real group row),
/// and wait for its clause to land in the filter bar.
async function select_master_row(page: Page) {
    await page
        .locator("perspective-viewer-datagrid")
        .first()
        .locator("tbody tr:nth-child(2) td")
        .first()
        .click();

    const chips = page.locator(
        "perspective-viewer #global_filter_bar .global-filter-chip",
    );
    await expect(chips).toHaveCount(1);
    return chips;
}

test.describe("Global filter bar clears the originating selection", () => {
    test("chip × deselects the originating master; re-select works after", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await setup(page);
        const chips = await select_master_row(page);
        expect((await master_selection(page)).areas).toBe(1);

        // Remove the clause from the bar: the chip goes, the detail
        // un-filters, and the master's row highlight is cleared — without
        // any selection-event echo re-adding the filter.
        await page
            .locator(
                "perspective-viewer #global_filter_bar .global-filter-chip-remove",
            )
            .click();

        await expect(chips).toHaveCount(0);
        await wait_deselected(page);

        // The bar stays empty (no `perspective-global-filter` echo).
        await page.waitForTimeout(100);
        await expect(chips).toHaveCount(0);

        // A subsequent selection still works and REPLACES cleanly (the
        // plugin's remove-set memory is retained through `deselect()`).
        await page
            .locator("perspective-viewer-datagrid")
            .first()
            .locator("tbody tr:nth-child(3) td")
            .first()
            .click();

        await expect(chips).toHaveCount(1);
        expect((await master_selection(page)).areas).toBe(1);
    });

    test("bar 'Clear' deselects the originating master", async ({ page }) => {
        test.setTimeout(120_000);
        await setup(page);
        await select_master_row(page);
        expect((await master_selection(page)).areas).toBe(1);

        await page
            .locator(
                "perspective-viewer #global_filter_bar .global-filter-bar-clear",
            )
            .click();

        // The bar unmounts entirely when the set empties.
        await expect(
            page.locator("perspective-viewer #global_filter_bar"),
        ).toHaveCount(0);

        await wait_deselected(page);
    });
});
