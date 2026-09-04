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

import { expect, test } from "@perspective-dev/test";
import { expectViewerScreenshot, gotoBasic, restoreChart } from "../helpers";
import { savedPluginConfig } from "../map-helpers";

const PLOT_CX = 640;
const PLOT_CY = 360;
const SETTLE_MS = 200;

async function hoverAndSnapshot(
    page: import("@playwright/test").Page,
    x = PLOT_CX,
    y = PLOT_CY,
    opts?: { maxDiffPixelRatio?: number },
): Promise<void> {
    await page.mouse.move(x, y);
    await page.waitForTimeout(SETTLE_MS);
    await expectViewerScreenshot(page, opts);
}

test.describe("Tooltip grid", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("scatter hover renders two-column grid", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
        });
        await hoverAndSnapshot(page);
    });

    test("y-bar hover renders category span and value columns", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Category"],
            split_by: ["Region"],
        });
        await hoverAndSnapshot(page);
    });

    test("candlestick hover renders OHLC rows right-aligned", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Candlestick",
            columns: ["Sales", "Profit", "Quantity", "Discount"],
            group_by: ["Order Date"],
        });
        await hoverAndSnapshot(page);
    });

    test("treemap hover renders path span and value rows", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Treemap",
            columns: ["Sales"],
            group_by: ["Category", "Sub-Category"],
        });
        await hoverAndSnapshot(page, undefined, undefined, {
            maxDiffPixelRatio: 0.02,
        });
    });

    test("tooltip_max_column_px truncates wide cells", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
            plugin_config: { tooltip_max_column_px: 60 },
        } as never);
        await hoverAndSnapshot(page);
    });

    test("tooltip_opacity renders translucent chrome", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
            plugin_config: { tooltip_opacity: 0.5 },
        } as never);
        await hoverAndSnapshot(page);
    });

    test("pinned tooltip renders DOM grid", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
        });
        await page.mouse.move(PLOT_CX, PLOT_CY);
        await page.waitForTimeout(SETTLE_MS);
        await page.mouse.click(PLOT_CX, PLOT_CY);
        await page.waitForTimeout(SETTLE_MS);
        await expectViewerScreenshot(page);
    });

    test("tooltip fields round-trip plugin_config and defaults strip", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
            plugin_config: {
                tooltip_max_column_px: 80,
                tooltip_opacity: 0.7,
            },
        } as never);

        let cfg = await savedPluginConfig(page);
        expect(cfg.tooltip_max_column_px).toBe(80);
        expect(cfg.tooltip_opacity).toBe(0.7);

        const defaults = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const plugin = await viewer.getPlugin();
            const flat: any[] = [];
            const walk = (fields: any[]) =>
                fields.forEach((f) =>
                    f.kind === "Group" ? walk(f.fields) : flat.push(f),
                );
            walk(plugin.plugin_config_schema().fields);
            return {
                tooltip_max_column_px: flat.find(
                    (f) => f.key === "tooltip_max_column_px",
                )?.default,
                tooltip_opacity: flat.find((f) => f.key === "tooltip_opacity")
                    ?.default,
            };
        });
        expect(typeof defaults.tooltip_max_column_px).toBe("number");
        expect(typeof defaults.tooltip_opacity).toBe("number");

        await restoreChart(page, { plugin_config: defaults } as never);
        cfg = await savedPluginConfig(page);
        expect(cfg.tooltip_max_column_px).toBeUndefined();
        expect(cfg.tooltip_opacity).toBeUndefined();
    });
});
