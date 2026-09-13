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

async function column(view: PageView, name: string): Promise<Locator> {
    const col = await view.settingsPanel.activeColumns.getColumnByName(name);
    return col.container;
}

async function openStyleTab(view: PageView, name: string) {
    const col = await view.settingsPanel.activeColumns.getColumnByName(name);
    await view.assureColumnSettingsOpen(col);
    await view.columnSettingsSidebar.container.waitFor({ state: "visible" });
}

function field(view: PageView, label: string): Locator {
    return view.columnSettingsSidebar.container.locator(
        `#${label}-label + div`,
    );
}

test.describe("Active column modified indicator", () => {
    test("restored columns_config marks only the overridden column", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales", "Profit"],
            columns_config: {
                Sales: { number_format: { maximumSignificantDigits: 5 } },
            },
        });

        await expect(await column(view, "Sales")).toHaveClass(/is-modified/);
        await expect(await column(view, "Profit")).not.toHaveClass(
            /is-modified/,
        );

        await view.restore({ columns_config: { Sales: {} } });
        await expect(await column(view, "Sales")).not.toHaveClass(
            /is-modified/,
        );
    });

    test("sidebar edits mark the column and its reset clears it", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
        });

        await expect(await column(view, "Sales")).not.toHaveClass(
            /is-modified/,
        );

        await openStyleTab(view, "Sales");
        const sig = field(view, "significant-digits");
        await sig.locator("input.parameter-max").fill("5");
        await expect(await column(view, "Sales")).toHaveClass(/is-modified/);

        await sig.locator("span.reset-default-style").click();
        await expect(await column(view, "Sales")).not.toHaveClass(
            /is-modified/,
        );
    });

    test("reset clears the indicator", async ({ page }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Debug Styled",
            columns: ["Sales"],
            columns_config: {
                Sales: { number_format: { maximumSignificantDigits: 5 } },
            },
        });

        await expect(await column(view, "Sales")).toHaveClass(/is-modified/);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer!.reset(true);
        });

        await expect(await column(view, "Sales")).not.toHaveClass(
            /is-modified/,
        );
    });
});
