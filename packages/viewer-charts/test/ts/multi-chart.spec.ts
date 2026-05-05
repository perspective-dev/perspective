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

/**
 * Multi-chart shared-renderer invariants.
 *
 * Two `<perspective-viewer>`s loaded from a single shared table
 * (`load-viewer-two-csv.js`). Each tests a different cross-chart
 * isolation property:
 */

import type { Page } from "@playwright/test";
import { test } from "@perspective-dev/test";
import {
    assertPlotNeverBlank,
    assertViewerQuiescent,
    calibrateAllBaselines,
    captureFramesAllViewers,
    gotoTwoChart,
    restoreChartAt,
    waitOneFrame,
} from "./helpers";

const LEFT_VIEWER_CX = 320;
const LEFT_VIEWER_CY = 360;
const RIGHT_VIEWER_OFFSET_X = 640;

const BLANK_THRESHOLD_FRACTION = 0;

/**
 * Tolerance (in pixels) for the "viewer B was unaffected" check.
 */
const QUIESCENT_TOLERANCE_PIXELS = 50;

/**
 * Drag-pan a specific viewer. Same shape as the single-viewer
 * helper in `frame-timing.spec.ts`, parameterized by a center
 * point so we can target either viewer.
 */
async function dragPanAt(
    page: Page,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    steps = 20,
): Promise<void> {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        const fx = (i * dx) / steps;
        const fy = (i * dy) / steps;
        await page.mouse.move(cx + fx, cy + fy);
    }

    await page.mouse.up();
}

/**
 * Set up both viewers with a chart that has enough glyph density
 * for blank-detection. Returns per-viewer blank-frame thresholds
 * derived from each viewer's quiescent baseline.
 */
async function setupBoth(page: Page): Promise<{ thresholds: number[] }> {
    await restoreChartAt(page, 0, {
        plugin: "X/Y Scatter",
        columns: ["Quantity", "Postal Code"],
    });
    await restoreChartAt(page, 1, {
        plugin: "X/Y Scatter",
        columns: ["Quantity", "Postal Code"],
    });

    // Two extra RAFs so paint settles before baseline.
    await waitOneFrame(page);
    await waitOneFrame(page);

    const baselines = await calibrateAllBaselines(page);
    const thresholds = baselines.map((b) =>
        Math.max(1, Math.floor(b * BLANK_THRESHOLD_FRACTION)),
    );
    return { thresholds };
}

test.describe("Multi-chart shared renderer", () => {
    test.beforeEach(async ({ page }) => {
        await gotoTwoChart(page);
    });

    test("pan on viewer A leaves viewer B quiescent", async ({ page }) => {
        const { thresholds } = await setupBoth(page);
        const allFrames = await captureFramesAllViewers(page, async () => {
            await dragPanAt(page, LEFT_VIEWER_CX, LEFT_VIEWER_CY, -120, -60);
        });

        // Viewer A (the panned one) must satisfy the standard
        // blank-frame invariant.
        assertPlotNeverBlank(allFrames[0], thresholds[0]);

        // Viewer B (the un-interacted one) must have stayed
        // quiescent — its plot pixel count should not deviate from
        // its own baseline by more than the AA tolerance.
        assertViewerQuiescent(allFrames[1], QUIESCENT_TOLERANCE_PIXELS);
    });

    test("both viewers panning concurrently stay non-blank", async ({
        page,
    }) => {
        const { thresholds } = await setupBoth(page);
        const allFrames = await captureFramesAllViewers(page, async () => {
            // Run viewer A's pan and viewer B's pan in parallel by
            // interleaving sub-step mouse events through both
            // viewers' centers.
            const leftSteps = 12;
            const rightSteps = 12;
            for (let i = 0; i < Math.max(leftSteps, rightSteps); i++) {
                if (i < leftSteps) {
                    await page.mouse.move(LEFT_VIEWER_CX, LEFT_VIEWER_CY);
                    await page.mouse.down();
                    await page.mouse.move(
                        LEFT_VIEWER_CX - (i + 1) * 6,
                        LEFT_VIEWER_CY - (i + 1) * 3,
                    );
                    await page.mouse.up();
                }

                if (i < rightSteps) {
                    const rcx = LEFT_VIEWER_CX + RIGHT_VIEWER_OFFSET_X;
                    await page.mouse.move(rcx, LEFT_VIEWER_CY);
                    await page.mouse.down();
                    await page.mouse.move(
                        rcx - (i + 1) * 6,
                        LEFT_VIEWER_CY - (i + 1) * 3,
                    );
                    await page.mouse.up();
                }
            }
        });

        assertPlotNeverBlank(allFrames[0], thresholds[0]);
        assertPlotNeverBlank(allFrames[1], thresholds[1]);
    });

    test("pan on viewer A + streaming updates does not blank either chart", async ({
        page,
    }) => {
        const { thresholds } = await setupBoth(page);
        const allFrames = await captureFramesAllViewers(page, async () => {
            // Streaming `table.update` runs as a background loop
            // gated by `__is_running`.
            const drawLoop = page.evaluate(async () => {
                const viewer = document.querySelector(
                    "perspective-viewer",
                ) as any;

                const table = await viewer.getTable();

                // @ts-ignore
                window["__is_running"] = true;
                // @ts-ignore
                for (let i = 0; window["__is_running"]; i++) {
                    await table.update([
                        {
                            "Product Name": "Fake Prod",
                            "Ship Date": +new Date(),
                            City: "Fake Town",
                            "Row ID": 9995 + i,
                            "Customer Name": "Fakey Fakerton",
                            Quantity: 13,
                            Discount: 0.25,
                            "Sub-Category": "Chairs",
                            Segment: "Office Supplies",
                            Category: "Furniture",
                            "Order Date": +new Date(),
                            "Order ID": "ABC123",
                            Sales: 123.456,
                            State: "New York",
                            "Postal Code": 10001,
                            Country: "US",
                            "Customer ID": "XYZ321",
                            "Ship Mode": "First Class",
                            Region: "Easr",
                            Profit: 12.34,
                            "Product ID": "ABC123",
                        },
                    ]);
                }
            });

            await dragPanAt(
                page,
                LEFT_VIEWER_CX,
                LEFT_VIEWER_CY,
                -160,
                -80,
                30,
            );
            await page.evaluate(() => {
                // @ts-ignore
                window["__is_running"] = false;
            });

            await drawLoop;
        });

        assertPlotNeverBlank(allFrames[0], thresholds[0]);
        assertPlotNeverBlank(allFrames[1], thresholds[1]);
    });
});
