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

/**
 * Rollup-mode coercion across `restore({plugin})` swaps.
 *
 * A `ViewConfigUpdate` with an absent `group_rollup_mode` /
 * `split_rollup_mode` KEEPS the committed mode (`ViewConfig::apply_update`
 * merge semantics). The plugin-advised coercion
 * (`set_update_rollup_defaults`) must therefore judge acceptance against
 * the mode that will actually be in effect — the committed one — not a
 * hardcoded default. Judging against the default let a plugin swap retain
 * a mode the new plugin excludes: Datagrid declares `split_rollup_modes:
 * ["flat", "rollup"]` while every chart declares `["flat"]`, so
 * committing `split_rollup_mode: "rollup"` under Datagrid and then
 * `restore({plugin: "Y Bar"})` (no rollup field) left `"rollup"` in the
 * saved config and built the view with subtotal column groups the chart
 * cannot render.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import { gotoBasic, restoreChart } from "./helpers";

async function save(page: Page): Promise<Record<string, unknown>> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        return (await viewer.save()) as unknown as Record<string, unknown>;
    });
}

test.describe("Rollup-mode coercion on plugin restore", () => {
    test("plugin swap to a flat-only chart coerces a retained split_rollup_mode", async ({
        page,
    }) => {
        await gotoBasic(page);
        await restoreChart(page, {
            plugin: "Datagrid",
            group_by: ["Region"],
            split_by: ["Category"],
            columns: ["Sales"],
            split_rollup_mode: "rollup",
        });

        expect((await save(page)).split_rollup_mode).toBe("rollup");
        await restoreChart(page, { plugin: "Y Bar" });
        const config = await save(page);
        expect(config.plugin).toBe("Y Bar");
        expect(config.split_rollup_mode).toBe("flat");
    });

    test("plugin swap to a flat-only chart coerces a retained group_rollup_mode", async ({
        page,
    }) => {
        await gotoBasic(page);
        await restoreChart(page, {
            plugin: "Datagrid",
            group_by: ["Region"],
            columns: ["Sales"],
            group_rollup_mode: "rollup",
        });

        expect((await save(page)).group_rollup_mode).toBe("rollup");
        await restoreChart(page, { plugin: "Y Bar" });
        const config = await save(page);
        expect(config.plugin).toBe("Y Bar");
        expect(config.group_rollup_mode).toBe("flat");
    });

    test("same-plugin partial restore preserves a supported split_rollup_mode", async ({
        page,
    }) => {
        await gotoBasic(page);
        await restoreChart(page, {
            plugin: "Datagrid",
            group_by: ["Region"],
            split_by: ["Category"],
            columns: ["Sales"],
            split_rollup_mode: "rollup",
        });

        await restoreChart(page, { columns: ["Profit"] });
        const config = await save(page);
        expect(config.plugin).toBe("Datagrid");
        expect(config.split_rollup_mode).toBe("rollup");
    });

    test("explicitly restoring an unsupported split_rollup_mode with the swap is coerced", async ({
        page,
    }) => {
        await gotoBasic(page);
        await restoreChart(page, {
            plugin: "Y Bar",
            group_by: ["Region"],
            split_by: ["Category"],
            columns: ["Sales"],
            split_rollup_mode: "rollup",
        });

        const config = await save(page);
        expect(config.plugin).toBe("Y Bar");
        expect(config.split_rollup_mode).toBe("flat");
    });

    test("fresh plugin-less panel keeps a configured group_rollup_mode", async ({
        page,
    }) => {
        await gotoBasic(page);
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            const table = await viewer.getTable();
            const name = await table.get_name();
            for (const id of viewer.getPanelNames()) {
                await viewer.removePanel(id);
            }

            await viewer.restoreWorkspace({
                layout: { type: "tab-layout", tabs: ["p0"], selected: 0 },
                panels: {
                    p0: {
                        table: name,
                        group_by: ["Region", "State"],
                        columns: ["Sales", "Profit"],
                        group_rollup_mode: "flat",
                    },
                },
            });

            return (await viewer.save()) as unknown as Record<string, unknown>;
        });

        expect(config.plugin).toBe("Datagrid");
        expect(config.group_rollup_mode).toBe("flat");
    });
});
