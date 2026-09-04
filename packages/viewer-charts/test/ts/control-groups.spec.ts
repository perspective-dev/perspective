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

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import { gotoBasic, restoreChart } from "./helpers";

async function openPluginTab(page: Page): Promise<Locator> {
    await page.locator("perspective-viewer #plugin_tabbar_tab").click();
    const tab = page.locator("perspective-viewer #plugin-tab");
    await tab.waitFor({ state: "visible" });
    return tab;
}

test.describe("Charts plugin-config control groups", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("Y Bar partitions every field into 5 default-open groups", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Profit"],
            group_by: ["State"],
            settings: true,
        });

        const tab = await openPluginTab(page);
        const groups = tab.locator("details.control-group");
        await expect(groups).toHaveCount(5);
        for (const key of ["axes", "facets", "glyph", "legend", "tooltip"]) {
            const group = tab.locator("details.control-group", {
                has: page.locator(`#${key}-group-label`),
            });
            await expect(group).toHaveCount(1);
            await expect(group).toHaveJSProperty("open", true);
        }

        await expect(
            tab.locator("#plugin-config-container > fieldset.style-control"),
        ).toHaveCount(0);
        await expect(
            tab.locator("details.control-group #legend_mode-label"),
        ).toHaveCount(1);
        await expect(
            tab.locator("details.control-group #include_zero-label"),
        ).toHaveCount(1);
    });

    test("grouped fields serialize flat in save()", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Profit"],
            group_by: ["State"],
            settings: true,
            plugin_config: { legend_mode: "sidebar", line_width_px: 4 },
        });

        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            return (await viewer.save()) as any;
        });

        expect(config.plugin_config.legend_mode).toEqual("sidebar");
        expect(config.plugin_config.line_width_px).toEqual(4);
        for (const key of [
            "axes",
            "facets",
            "glyph",
            "density",
            "basemap",
            "legend",
        ]) {
            expect(config.plugin_config[key]).toBeUndefined();
        }
    });
});
