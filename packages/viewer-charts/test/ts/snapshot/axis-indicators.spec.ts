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

import { test } from "@perspective-dev/test";
import { expectViewerScreenshot, gotoBasic, restoreChart } from "../helpers";
import { MAP_CONFIG, registerColorSources } from "../map-helpers";

const PLOT_CX = 640;
const PLOT_CY = 360;
const SETTLE_MS = 200;

async function hoverAndSnapshot(
    page: import("@playwright/test").Page,
    x = PLOT_CX,
    y = PLOT_CY,
): Promise<void> {
    await page.mouse.move(x, y);
    await page.waitForTimeout(SETTLE_MS);
    await expectViewerScreenshot(page);
}

test.describe("Axis hover indicators", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("scatter paints trace lines and axis badges", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
        });
        await hoverAndSnapshot(page);
    });

    test("scatter badge uses configured number_format", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
            columns_config: {
                Profit: {
                    number_format: { style: "currency", currency: "USD" },
                },
            },
        } as never);
        await hoverAndSnapshot(page);
    });

    test("line badge uses configured date_format", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Line",
            columns: ["Order Date", "Profit"],
            group_by: ["Order Date"],
            columns_config: {
                "Order Date": {
                    date_format: { dateStyle: "full", timeStyle: "disabled" },
                },
            },
        } as never);
        await hoverAndSnapshot(page);
    });

    test("y-bar paints category and value badges", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Category"],
        });
        await hoverAndSnapshot(page);
    });

    test("alt_axis value badge lands on the right axis", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Discount", "Sales"],
            group_by: ["Category"],
            columns_config: { Sales: { alt_axis: true } },
        } as never);
        await hoverAndSnapshot(page);
    });

    test("x-bar flips indicator orientation", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X Bar",
            columns: ["Sales"],
            group_by: ["Category"],
        });
        await hoverAndSnapshot(page);
    });

    test("candlestick anchors the value badge at close", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Candlestick",
            columns: ["Sales", "Profit", "Quantity", "Discount"],
            group_by: ["Order Date"],
        });
        await hoverAndSnapshot(page);
    });

    test("heatmap snaps indicators to the cell center", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category"],
        });
        await hoverAndSnapshot(page);
    });

    test("faceted scatter badges only in the source cell", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
            split_by: ["Region"],
            plugin_config: { facet_mode: "grid" },
        } as never);
        await hoverAndSnapshot(page, 400, 250);
    });

    test("map with degree axes paints degree badges", async ({ page }) => {
        await registerColorSources(page, [{ id: "test-red", color: "#f00" }]);
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { map_tile_provider: "test-red" },
        } as never);
        await hoverAndSnapshot(page);
    });

    test("bare map keeps the crosshair without badges", async ({ page }) => {
        await registerColorSources(page, [{ id: "test-red", color: "#f00" }]);
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: {
                map_tile_provider: "test-red",
                numeric_axes: false,
            },
        } as never);
        await hoverAndSnapshot(page);
    });

    test("indicators persist while pinned", async ({ page }) => {
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
});
