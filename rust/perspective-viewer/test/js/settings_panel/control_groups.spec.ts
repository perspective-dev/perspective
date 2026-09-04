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

import { test, expect, PageView } from "../helpers.ts";
import type { Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-debug.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

function pluginTab(view: PageView): Locator {
    return view.container.locator("#plugin-tab");
}

async function openPluginTab(view: PageView) {
    await view.container.locator("#plugin_tabbar_tab").click();
    await pluginTab(view).waitFor({ state: "visible" });
}

async function openStyleTab(view: PageView, column: string) {
    const col = await view.settingsPanel.activeColumns.getColumnByName(column);
    await view.assureColumnSettingsOpen(col);
    await view.columnSettingsSidebar.container.waitFor({ state: "visible" });
}

test.describe("Plugin tab control groups", () => {
    test("group renders as a default-open collapsible section", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, plugin: "Debug Styled" });
        await openPluginTab(view);

        const group = pluginTab(view).locator("details.control-group");
        await expect(group).toHaveCount(1);
        await expect(group).toHaveJSProperty("open", true);
        await expect(group.locator("summary #legend-group-label")).toHaveCount(
            1,
        );

        await expect(group.locator("#legend_on-label")).toHaveCount(1);
        await expect(group.locator("#legend_width-label")).toHaveCount(1);
        await expect(
            pluginTab(view).locator("details.control-group #edit_mode-label"),
        ).toHaveCount(0);
        await expect(pluginTab(view).locator("#edit_mode-label")).toHaveCount(
            1,
        );
    });

    test("collapse survives a config-change re-render", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, plugin: "Debug Styled" });
        await openPluginTab(view);

        const group = pluginTab(view).locator("details.control-group");
        await group.locator("summary").click();
        await expect(group).toHaveJSProperty("open", false);

        await view.restore({ plugin_config: { edit_mode: "EDIT" } });
        await expect(group).toHaveJSProperty("open", false);
        await expect(group).toHaveCount(1);
    });

    test("editing a grouped field serializes flat", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, plugin: "Debug Styled" });
        await openPluginTab(view);

        await pluginTab(view).locator("input#legend_on-checkbox").click();
        const config = (await view.save()) as any;
        expect(config.plugin_config).toEqual({ legend_on: true });
    });

    test("restore round-trip populates grouped controls", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            plugin_config: { legend_on: true, legend_width: 200 },
        });

        await openPluginTab(view);
        const group = pluginTab(view).locator("details.control-group");
        await expect(group.locator("input#legend_on-checkbox")).toBeChecked();

        const config = (await view.save()) as any;
        expect(config.plugin_config).toEqual({
            legend_on: true,
            legend_width: 200,
        });
    });
});

test.describe("Column Style tab control groups", () => {
    test("numeric column renders the `fg` group and serializes flat", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const sidebar = view.columnSettingsSidebar.container;

        await expect(sidebar.locator("details.control-group")).toHaveCount(3);
        await expect(
            sidebar.locator(
                "details.control-group summary #format-group-label",
            ),
        ).toHaveCount(1);

        const fg = sidebar.locator("details.control-group", {
            has: page.locator("#fg-group-label"),
        });

        await expect(fg).toHaveJSProperty("open", true);
        await expect(fg.locator("summary #fg-group-label")).toHaveCount(1);
        await expect(fg.locator("#fg_flag-label")).toHaveCount(1);
        await expect(fg.locator("#fg_color-label")).toHaveCount(1);

        await fg.locator("input#fg_flag-checkbox").click();
        const config = (await view.save()) as any;
        expect(config.columns_config).toEqual({ Sales: { fg_flag: true } });
    });

    test("collapse survives the Style tab's revision re-render", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const sidebar = view.columnSettingsSidebar.container;
        const fg = sidebar.locator("details.control-group", {
            has: page.locator("#fg-group-label"),
        });

        await fg.locator("summary").click();
        await expect(fg).toHaveJSProperty("open", false);

        await view.restore({
            columns_config: { Sales: { fg_flag: true } },
        });

        await expect(fg).toHaveJSProperty("open", false);
        await expect(fg).toHaveCount(1);
    });

    test("shift+click applies the toggle to every section", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const sidebar = view.columnSettingsSidebar.container;
        const fg = sidebar.locator("details.control-group", {
            has: page.locator("#fg-group-label"),
        });

        const bg = sidebar.locator("details.control-group", {
            has: page.locator("#bg-group-label"),
        });

        await bg.locator("summary").click();
        await expect(bg).toHaveJSProperty("open", false);
        await expect(fg).toHaveJSProperty("open", true);

        await fg.locator("summary").click({ modifiers: ["Shift"] });
        await expect(fg).toHaveJSProperty("open", false);
        await expect(bg).toHaveJSProperty("open", false);

        await fg.locator("summary").click({ modifiers: ["Shift"] });
        await expect(fg).toHaveJSProperty("open", true);
        await expect(bg).toHaveJSProperty("open", true);
    });

    test("chevron advertises the shift alternate action", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const sidebar = view.columnSettingsSidebar.container;
        await expect(
            sidebar.locator(
                "details.control-group summary span.control-group-chevron.shift-alt-icon",
            ),
        ).toHaveCount(3);

        await page.keyboard.down("Shift");
        await expect(view.container).toHaveClass(/shift-active/);
        await page.keyboard.up("Shift");
        await expect(view.container).not.toHaveClass(/shift-active/);
    });
});

test.describe("Control group collapse persistence", () => {
    test("collapse survives a column switch and drawer re-open", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales", "Profit"],
        });

        await openStyleTab(view, "Sales");
        const sidebar = view.columnSettingsSidebar.container;
        const fg = sidebar.locator("details.control-group", {
            has: page.locator("#fg-group-label"),
        });

        const bg = sidebar.locator("details.control-group", {
            has: page.locator("#bg-group-label"),
        });

        await fg.locator("summary").click();
        await expect(fg).toHaveJSProperty("open", false);

        await openStyleTab(view, "Profit");
        await expect(fg).toHaveJSProperty("open", false);
        await expect(bg).toHaveJSProperty("open", true);

        await view.columnSettingsSidebar.closeBtn.click();
        await sidebar.waitFor({ state: "hidden" });
        await openStyleTab(view, "Sales");
        await expect(fg).toHaveJSProperty("open", false);
        await expect(bg).toHaveJSProperty("open", true);
    });

    test("plugin tab collapse survives a settings-panel toggle", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, plugin: "Debug Styled" });
        await openPluginTab(view);

        const group = pluginTab(view).locator("details.control-group");
        await group.locator("summary").click();
        await expect(group).toHaveJSProperty("open", false);

        await view.restore({ settings: false });
        await view.restore({ settings: true });
        await openPluginTab(view);
        await expect(group).toHaveJSProperty("open", false);
    });

    test("group state does not serialize into save()", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, plugin: "Debug Styled" });
        await openPluginTab(view);

        const group = pluginTab(view).locator("details.control-group");
        await group.locator("summary").click();
        await expect(group).toHaveJSProperty("open", false);

        const config = (await view.save()) as any;
        expect(config.plugin_config).toEqual({});
        expect(config.legend).toBeUndefined();
    });
});
