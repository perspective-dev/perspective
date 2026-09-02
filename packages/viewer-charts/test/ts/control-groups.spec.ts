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

// `plugin_config_schema()` partitions each chart family's flat
// `applicable_plugin_fields` through `PLUGIN_FIELD_GROUPS` into
// presentation-only `ControlSpec::Group` sections (axes / facets / glyph
// / density / basemap / legend). A group needs >= 2 applicable members;
// lone members emit flat. Grouping must never leak into `save()` output —
// `plugin_config` keys stay flat.

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

    test("Y Bar partitions every field into 4 default-open groups", async ({
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

        // Series family: axes(3) / facets(2) / glyph(4) / legend(8),
        // nothing flat.
        await expect(groups).toHaveCount(4);
        for (const key of ["axes", "facets", "glyph", "legend"]) {
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

    test("lone group members emit flat (X/Y Scatter domain_mode)", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Sales", "Profit"],
            settings: true,
        });

        const tab = await openPluginTab(page);

        // Cartesian family: facets(2) / glyph(2) / legend(8) group, but
        // `domain_mode` is the only applicable "axes" member so it
        // renders flat.
        await expect(tab.locator("details.control-group")).toHaveCount(3);
        await expect(
            tab.locator(
                "#plugin-config-container > fieldset.style-control #domain_mode-label",
            ),
        ).toHaveCount(1);
        await expect(
            tab.locator("details.control-group #domain_mode-label"),
        ).toHaveCount(0);
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

        // No group key may appear in serialized output.
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
