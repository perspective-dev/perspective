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
import {
    expectViewerScreenshot,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "../helpers";

// Plot center is well inside the layout's plotRect for the default
// 1280×720 viewport — the layout leaves ~80px of gutter on every side.
const PLOT_CX = 640;
const PLOT_CY = 360;

test.describe("Zoom", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("wheel zooms in on scatter", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
        });

        await page.mouse.move(PLOT_CX, PLOT_CY);
        await page.mouse.wheel(0, -500);
        await waitOneFrame(page);
        await expectViewerScreenshot(page);
    });

    test("wheel zooms in on line with date axis", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Line",
            columns: ["Order Date", "Profit"],
            group_by: ["Order Date"],
        });

        await page.mouse.move(PLOT_CX, PLOT_CY);
        await page.mouse.wheel(0, -500);
        await waitOneFrame(page);
        await expectViewerScreenshot(page);
    });

    test("wheel zooms in on Y Bar", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["State"],
        });

        await page.mouse.move(PLOT_CX, PLOT_CY);
        await page.mouse.wheel(0, -500);
        await waitOneFrame(page);
        await expectViewerScreenshot(page);
    });

    test("wheel zooms in on Candlestick", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Candlestick",
            columns: ["Sales"],
            group_by: ["Order Date"],
        });

        await page.mouse.move(PLOT_CX, PLOT_CY);
        await page.mouse.wheel(0, -500);
        await waitOneFrame(page);
        await expectViewerScreenshot(page);
    });

    // Datetime-axis dynamic-zoom refit. With a numeric category axis
    // (single `date` / `datetime` / `integer` / `float` group_by), the
    // zoom controller's visible domain is in *absolute data units*
    // (e.g. ~1.7e12 for a datetime). The auto-fit lookup needs to map
    // that back to catIdx via `_categoryPositions` — without that map,
    // the value-axis refit silently no-ops and `"dynamic"` looks
    // identical to `"fixed"` on every datetime-axis chart.
    test.describe("datetime x axis", () => {
        test("Y Line wheel zoom refits value axis (dynamic)", async ({
            page,
        }) => {
            await restoreChart(page, {
                plugin: "Y Line",
                columns: ["Profit"],
                group_by: ["Order Date"],
                plugin_config: { series_zoom_mode: "dynamic" },
            });

            await page.mouse.move(PLOT_CX, PLOT_CY);
            await page.mouse.wheel(0, -500);
            await waitOneFrame(page);
            await expectViewerScreenshot(page);
        });

        test("Y Line wheel zoom keeps value axis pinned (fixed)", async ({
            page,
        }) => {
            await restoreChart(page, {
                plugin: "Y Line",
                columns: ["Profit"],
                group_by: ["Order Date"],
                plugin_config: { series_zoom_mode: "fixed" },
            });

            await page.mouse.move(PLOT_CX, PLOT_CY);
            await page.mouse.wheel(0, -500);
            await waitOneFrame(page);
            await expectViewerScreenshot(page);
        });

        test("Y Bar wheel zoom refits value axis (dynamic)", async ({
            page,
        }) => {
            await restoreChart(page, {
                plugin: "Y Bar",
                columns: ["Sales"],
                group_by: ["Order Date"],
                plugin_config: { series_zoom_mode: "dynamic" },
            });

            await page.mouse.move(PLOT_CX, PLOT_CY);
            await page.mouse.wheel(0, -500);
            await waitOneFrame(page);
            await expectViewerScreenshot(page);
        });
    });
});
