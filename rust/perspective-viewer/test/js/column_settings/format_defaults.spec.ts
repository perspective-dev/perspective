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

async function openStyleTab(view: PageView, column: string) {
    const col = await view.settingsPanel.activeColumns.getColumnByName(column);
    await view.assureColumnSettingsOpen(col);
    await view.columnSettingsSidebar.container.waitFor({ state: "visible" });
}

function field(view: PageView, label: string): Locator {
    return view.columnSettingsSidebar.container.locator(
        `#${label}-label + div`,
    );
}

test.describe("Number format defaults", () => {
    test("editor shows built-in defaults without an override", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const frac = field(view, "fractional-digits");
        await expect(frac.locator("input.parameter-min")).toHaveValue("2");
        await expect(frac.locator("input.parameter-max")).toHaveValue("2");

        const sig = field(view, "significant-digits");
        await expect(sig.locator("input.parameter-min")).toHaveValue("1");
        await expect(sig.locator("input.parameter-max")).toHaveValue("21");

        const notation = field(view, "notation");
        await expect(notation.locator("select")).toHaveValue("Standard");
    });

    test("editor shows the plugin's declared default override", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Format",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const frac = field(view, "fractional-digits");
        await expect(frac.locator("input.parameter-min")).toHaveValue("0");
        await expect(frac.locator("input.parameter-max")).toHaveValue("1");

        const notation = field(view, "notation");
        await expect(notation.locator("select")).toHaveValue("Compact");

        const compact = field(view, "compact-display");
        await expect(compact.locator("select")).toHaveValue("Short");
    });

    test("max significant digits round-trips", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const sig = field(view, "significant-digits");
        await sig.locator("input.parameter-max").fill("5");
        await expect(sig.locator("input.parameter-max")).toHaveValue("5");

        const config = (await view.save()) as any;
        expect(config.columns_config).toEqual({
            Sales: {
                number_format: {
                    minimumSignificantDigits: 1,
                    maximumSignificantDigits: 5,
                },
            },
        });

        await expect(sig.locator("input.parameter-max")).toHaveValue("5");
    });

    test("unrelated edits serialize sparsely under an override", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Format",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const digits = field(view, "minimum-integer-digits");
        await digits.locator("input.parameter").fill("2");

        const config = (await view.save()) as any;
        expect(config.columns_config).toEqual({
            Sales: { number_format: { minimumIntegerDigits: 2 } },
        });
    });

    test("built-in values serialize explicitly under an override", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Format",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const frac = field(view, "fractional-digits");
        await frac.locator("input.parameter-max").fill("2");
        await frac.locator("input.parameter-min").fill("2");

        const config = (await view.save()) as any;
        expect(config.columns_config).toEqual({
            Sales: {
                number_format: {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                },
            },
        });
    });

    test("choosing standard notation under a compact override serializes", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Format",
            columns: ["Sales"],
        });

        await openStyleTab(view, "Sales");
        const notation = field(view, "notation");
        await notation.locator("select").selectOption("Standard");

        const config = (await view.save()) as any;
        expect(config.columns_config).toEqual({
            Sales: { number_format: { notation: "standard" } },
        });
    });
});

test.describe("Datetime format defaults", () => {
    test("editor shows built-in preset without an override", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Order Date"],
        });

        await openStyleTab(view, "Order Date");
        const dateStyle = field(view, "date-style");
        await expect(dateStyle.locator("select")).toHaveValue("short");

        await dateStyle.locator("select").selectOption("medium");
        const config = (await view.save()) as any;
        expect(config.columns_config["Order Date"].date_format).toEqual({
            dateStyle: "medium",
        });
    });

    test("editor shows the plugin's declared preset override", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Format",
            columns: ["Order Date"],
        });

        await openStyleTab(view, "Order Date");
        const dateStyle = field(view, "date-style");
        await expect(dateStyle.locator("select")).toHaveValue("medium");
    });

    test("legacy preset serializes under an override", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Format",
            columns: ["Order Date"],
        });

        await openStyleTab(view, "Order Date");
        const dateStyle = field(view, "date-style");
        await dateStyle.locator("select").selectOption("short");

        const config = (await view.save()) as any;
        expect(config.columns_config["Order Date"].date_format).toEqual({
            timeStyle: "disabled",
        });
    });
});
