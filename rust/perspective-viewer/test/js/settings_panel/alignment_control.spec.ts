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
import type { Locator, Page } from "@playwright/test";

const ALL = [
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
];

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-all.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function open_group(container: Locator, page: Page, key: string) {
    const group = container.locator("details.control-group", {
        has: page.locator(`#${key}-group-label`),
    });

    await group.waitFor({ state: "visible" });
    if (!(await group.evaluate((el: HTMLDetailsElement) => el.open))) {
        await group.locator("summary").click();
    }

    return group;
}

async function open_plugin_tab(view: PageView) {
    await view.container.locator("#plugin_tabbar_tab").click();
    const tab = view.container.locator("#plugin-tab");
    await tab.waitFor({ state: "visible" });
    return tab;
}

async function open_style_tab(view: PageView, column: string) {
    const col = await view.settingsPanel.activeColumns.getColumnByName(column);
    await view.assureColumnSettingsOpen(col);
    const sidebar = view.columnSettingsSidebar.container;
    await sidebar.waitFor({ state: "visible" });
    return sidebar;
}

function grid(scope: Locator, key: string): Locator {
    return scope.locator(`#${key}-alignment`);
}

function cell(scope: Locator, key: string, align: string): Locator {
    return grid(scope, key).locator(`[data-align="${align}"]`);
}

async function checked_cells(scope: Locator, key: string): Promise<string[]> {
    return await grid(scope, key)
        .locator(`[aria-checked="true"]`)
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-align")));
}

async function disabled_cells(scope: Locator, key: string): Promise<string[]> {
    return await grid(scope, key)
        .locator(":disabled")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-align")));
}

async function reset(scope: Locator, key: string) {
    await scope.locator(`#${key}-checkbox.reset-default-style`).click();
}

test.describe("Alignment control", () => {
    test("Datagrid plugin tab renders an unset nine-cell grid", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, plugin: "Datagrid" });
        const tab = await open_plugin_tab(view);
        const font = await open_group(tab, page, "font");
        await expect(grid(font, "align").locator("button")).toHaveCount(9);
        expect(await disabled_cells(font, "align")).toEqual([]);
        expect(await checked_cells(font, "align")).toEqual([]);
        await expect(
            grid(font, "align").locator("button").nth(0),
        ).toHaveAttribute("data-align", ALL[0]);
        await expect(
            grid(font, "align").locator("button").nth(8),
        ).toHaveAttribute("data-align", ALL[8]);
        await expect(font.locator("#align-label")).toHaveCount(1);
        await expect(font.locator("#text_align-label")).toHaveCount(0);
        await expect(font.locator("#vertical_align-label")).toHaveCount(0);
    });

    test("picking a cell persists the token and reset removes it", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({ settings: true, plugin: "Datagrid" });
        const tab = await open_plugin_tab(view);
        const font = await open_group(tab, page, "font");
        await cell(font, "align", "top-left").click();
        await expect(cell(font, "align", "top-left")).toHaveAttribute(
            "aria-checked",
            "true",
        );

        expect(await checked_cells(font, "align")).toEqual(["top-left"]);
        expect(((await view.save()) as any).plugin_config).toEqual({
            align: "top-left",
        });

        await cell(font, "align", "center").click();
        await expect(cell(font, "align", "center")).toHaveAttribute(
            "aria-checked",
            "true",
        );

        expect(await checked_cells(font, "align")).toEqual(["center"]);
        expect(((await view.save()) as any).plugin_config).toEqual({
            align: "center",
        });

        await reset(font, "align");
        await expect(
            grid(font, "align").locator(`[aria-checked="true"]`),
        ).toHaveCount(0);

        expect(await checked_cells(font, "align")).toEqual([]);
        expect(((await view.save()) as any).plugin_config).toEqual({});
    });

    test("column grid ghosts the grid value and elides a matching pick", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Datagrid",
            columns: ["Sales"],
            plugin_config: { align: "top-left" },
        });

        const sidebar = await open_style_tab(view, "Sales");
        const font = await open_group(sidebar, page, "font");
        expect(await checked_cells(font, "align")).toEqual(["top-left"]);
        await expect(cell(font, "align", "top-left")).toHaveClass(/is-default/);

        await cell(font, "align", "top-left").click();
        expect(((await view.save()) as any).columns_config).toEqual({});
        await cell(font, "align", "bottom-right").click();
        await expect(cell(font, "align", "bottom-right")).not.toHaveClass(
            /is-default/,
        );

        expect(((await view.save()) as any).columns_config).toEqual({
            Sales: { align: "bottom-right" },
        });

        await reset(font, "align");
        expect(((await view.save()) as any).columns_config).toEqual({});
        expect(await checked_cells(font, "align")).toEqual(["top-left"]);
    });

    test("charts legend anchor is corners-only with a ghost default", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Y Line",
            columns: ["Sales"],
        });

        const tab = await open_plugin_tab(view);
        const legend = await open_group(tab, page, "legend");
        await expect(
            grid(legend, "legend_anchor").locator("button"),
        ).toHaveCount(9);
        expect(await disabled_cells(legend, "legend_anchor")).toEqual(
            ALL.filter((x) => !CORNERS.includes(x)),
        );

        expect(await checked_cells(legend, "legend_anchor")).toEqual([
            "top-right",
        ]);

        await expect(cell(legend, "legend_anchor", "top-right")).toHaveClass(
            /is-default/,
        );

        await cell(legend, "legend_anchor", "bottom-left").click();
        expect(
            ((await view.save()) as any).plugin_config.legend_anchor,
        ).toEqual("bottom-left");

        await cell(legend, "legend_anchor", "top-right").click();
        expect(
            ((await view.save()) as any).plugin_config.legend_anchor,
        ).toBeUndefined();
    });

    test("a restored legend anchor is reflected in the open grid", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Y Line",
            columns: ["Sales"],
            plugin_config: { legend_anchor: "bottom-right" },
        });

        const tab = await open_plugin_tab(view);
        const legend = await open_group(tab, page, "legend");
        expect(await checked_cells(legend, "legend_anchor")).toEqual([
            "bottom-right",
        ]);

        await expect(
            cell(legend, "legend_anchor", "bottom-right"),
        ).not.toHaveClass(/is-default/);

        await view.restore({ plugin_config: { legend_anchor: "top-left" } });
        expect(await checked_cells(legend, "legend_anchor")).toEqual([
            "top-left",
        ]);

        await reset(legend, "legend_anchor");
        expect(
            ((await view.save()) as any).plugin_config.legend_anchor,
        ).toBeUndefined();
        expect(await checked_cells(legend, "legend_anchor")).toEqual([
            "top-right",
        ]);
    });
});
