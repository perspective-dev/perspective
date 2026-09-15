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

import { PageView as PspViewer, expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

async function restore_error(
    page: Page,
    config: Record<string, unknown>,
): Promise<string | null> {
    return page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")!;
        try {
            await viewer.restore(config as any);
            return null;
        } catch (e: any) {
            return String(e?.message ?? e);
        }
    }, config);
}

async function saved_columns_config(
    page: Page,
): Promise<Record<string, Record<string, unknown>>> {
    return page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        await viewer.flush();
        return ((await viewer.save()) as any).columns_config ?? {};
    });
}

async function select_mode(
    page: Page,
    view: PspViewer,
    nth: number,
    key: "fg_mode" | "bg_mode",
    value: string,
) {
    await view.openSettingsPanel();
    await view.dataGrid.regularTable.editBtnRow
        .locator("th.psp-menu-enabled span")
        .nth(nth)
        .click();

    const sidebar = view.columnSettingsSidebar.container;
    await sidebar.waitFor();
    await sidebar
        .locator("div.row", { has: page.locator(`label#${key}-label`) })
        .locator("select")
        .selectOption(value);
}

test.describe("Datagrid column config validation", function () {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    test("rejects a string-only foreground mode on a numeric column", async ({
        page,
    }) => {
        const error = await restore_error(page, {
            plugin: "Datagrid",
            columns: ["Sales"],
            columns_config: { Sales: { fg_mode: "series" } },
        });

        expect(error).toContain('columns_config["Sales"].fg_mode');
        expect(error).toContain("float column");
        expect(error).toContain("series");
    });

    test("rejects a numeric-only foreground mode on a string column", async ({
        page,
    }) => {
        const error = await restore_error(page, {
            plugin: "Datagrid",
            columns: ["Category"],
            columns_config: { Category: { fg_mode: "bar" } },
        });

        expect(error).toContain('columns_config["Category"].fg_mode');
        expect(error).toContain("string column");
    });

    test("rejects a numeric-only background mode on a datetime column", async ({
        page,
    }) => {
        const error = await restore_error(page, {
            plugin: "Datagrid",
            columns: ["Order Date"],
            columns_config: { "Order Date": { bg_mode: "gradient" } },
        });

        expect(error).toContain('columns_config["Order Date"].bg_mode');
        expect(error).toContain("gradient");
    });

    test("rejects a bare color where a numeric column reads a gradient", async ({
        page,
    }) => {
        const error = await restore_error(page, {
            plugin: "Datagrid",
            columns: ["Sales"],
            columns_config: {
                Sales: { fg_mode: "color", fg_color: "#ff0000" },
            },
        });

        expect(error).toContain('columns_config["Sales"].fg_color');
    });

    test("rejects an unknown edit mode", async ({ page }) => {
        const error = await restore_error(page, {
            plugin: "Datagrid",
            plugin_config: { edit_mode: "bogus" },
        });

        expect(error).toContain("plugin_config.edit_mode");
    });

    test("accepts every advertised mode and round-trips it", async ({
        page,
    }) => {
        const columns_config = {
            Sales: {
                fg_mode: "label-bar",
                fg_color: "linear-gradient(to right, #ff0000 0%, #0000ff 100%)",
                bg_mode: "gradient",
                bg_color:
                    "linear-gradient(to right, #ff0000 0%, #ffffff 50%, #0000ff 100%)",
            },
            Category: {
                fg_mode: "series",
                fg_color: "linear-gradient(to right, #ff0000, #00ff00)",
                bg_mode: "color",
                bg_color: "#123456",
            },
            "Order Date": {
                fg_mode: "color",
                fg_color: "#00ff00",
                bg_mode: "color",
                bg_color: "#0000ff",
            },
        };

        const error = await restore_error(page, {
            plugin: "Datagrid",
            columns: ["Sales", "Category", "Order Date"],
            columns_config,
        });

        expect(error).toBeNull();
        const saved = await saved_columns_config(page);
        expect(saved.Category).toEqual(columns_config.Category);
        expect(saved["Order Date"]).toEqual(columns_config["Order Date"]);
        expect(saved.Sales.fg_mode).toEqual("label-bar");
        expect(saved.Sales.fg_color).toEqual(columns_config.Sales.fg_color);
        expect(saved.Sales.bg_mode).toEqual("gradient");
        expect(saved.Sales.bg_color).toEqual(columns_config.Sales.bg_color);
    });

    test("switching a string column from color to series drops the color and stays restorable", async ({
        page,
    }) => {
        const view = new PspViewer(page);
        const error = await restore_error(page, {
            plugin: "Datagrid",
            columns: ["Category", "Sales"],
            columns_config: {
                Category: { fg_mode: "color", fg_color: "#ff0000" },
            },
        });

        expect(error).toBeNull();
        await select_mode(page, view, 0, "fg_mode", "series");
        const saved = await saved_columns_config(page);
        expect(saved.Category).toEqual({ fg_mode: "series" });
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            return await viewer.save();
        });

        expect(await restore_error(page, config as any)).toBeNull();
    });

    test("switching a numeric column from color to bar keeps its gradient", async ({
        page,
    }) => {
        const view = new PspViewer(page);
        const fg_color = "linear-gradient(to right, #ff0000 0%, #0000ff 100%)";
        const error = await restore_error(page, {
            plugin: "Datagrid",
            columns: ["Sales", "Category"],
            columns_config: { Sales: { fg_color } },
        });

        expect(error).toBeNull();
        await select_mode(page, view, 0, "fg_mode", "bar");
        const saved = await saved_columns_config(page);
        expect(saved.Sales.fg_mode).toEqual("bar");
        expect(saved.Sales.fg_color).toEqual(fg_color);
    });
});
