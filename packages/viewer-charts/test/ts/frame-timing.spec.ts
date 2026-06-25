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
 * Frame-timing invariants — the chart's plot region must never go
 * blank between gestures. Every test follows the same shape:
 *
 *   1. Restore a chart with data.
 *   2. Calibrate a quiescent-state pixel baseline.
 *   3. Drive an interaction (pan / zoom / resize / concurrent draws)
 *      while `captureFrames` samples the visible canvas every RAF.
 *   4. Assert every captured frame's plot region was non-blank.
 */

import type { Page } from "@playwright/test";
import { test } from "@perspective-dev/test";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import {
    assertPlotNeverBlank,
    calibratePlotBaseline,
    captureFrames,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

const PLOT_CX = 640;
const PLOT_CY = 360;

const BLANK_THRESHOLD_FRACTION = 0;

const RENDER_MODES = ["blit", "direct"] as const;
type RenderMode = (typeof RENDER_MODES)[number];

interface ChartFixture {
    name: string;
    config: ViewerConfigUpdate;
}

const FIXTURES: ChartFixture[] = [
    {
        name: "X/Y Scatter",
        config: {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Postal Code"],
        },
    },
    {
        name: "Y Line",
        config: {
            plugin: "Y Line",
            columns: ["Profit"],
        },
    },
    {
        name: "Y Area",
        config: {
            plugin: "Y Area",
            columns: ["Profit"],
        },
    },
    {
        name: "Y Bar",
        config: {
            plugin: "Y Bar",
            group_by: ["State"],
            columns: ["Profit"],
        },
    },
    {
        name: "X Bar",
        config: {
            plugin: "X Bar",
            group_by: ["State"],
            columns: ["Profit"],
        },
    },
    {
        name: "Heatmap",
        config: {
            plugin: "Heatmap",
            group_by: ["State"],
            split_by: ["Region"],
            columns: ["Profit"],
        },
    },
];

async function setupChart(
    page: Page,
    fixture: ChartFixture,
    mode: RenderMode,
): Promise<{ baseline: number; threshold: number }> {
    await restoreChart(page, fixture.config);

    await page.evaluate(
        ({ mode }) => {
            const viewer = document.querySelector(
                "perspective-viewer",
            ) as unknown as { getPlugin(): unknown };
            const plugin = viewer.getPlugin() as {
                constructor: { setBlitMode(mode: "blit" | "direct"): void };
                delete(): void;
            };
            plugin.constructor.setBlitMode(mode);
            plugin.delete();
        },
        { mode },
    );

    await restoreChart(page, fixture.config);
    await waitOneFrame(page);
    await waitOneFrame(page);
    const baseline = await calibratePlotBaseline(page);
    const threshold = Math.max(
        1,
        Math.floor(baseline * BLANK_THRESHOLD_FRACTION),
    );
    return { baseline, threshold };
}

/**
 * Drive a drag-pan from `(PLOT_CX, PLOT_CY)` to `(PLOT_CX + dx,
 * PLOT_CY + dy)` in `steps` increments.
 */
async function dragPan(
    page: Page,
    dx: number,
    dy: number,
    steps = 20,
): Promise<void> {
    await page.mouse.move(PLOT_CX, PLOT_CY);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        const fx = (i * dx) / steps;
        const fy = (i * dy) / steps;
        await page.mouse.move(PLOT_CX + fx, PLOT_CY + fy);
    }

    await page.mouse.up();
}

/**
 * Drive a wheel zoom — many small wheel deltas. `deltaY < 0` is
 * zoom-in; `> 0` is zoom-out.
 */
async function wheelZoom(
    page: Page,
    deltaY: number,
    steps = 12,
): Promise<void> {
    await page.mouse.move(PLOT_CX, PLOT_CY);
    const stepDelta = deltaY / steps;
    for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, stepDelta);
    }
}

/**
 * Single update row used by the streaming-update tests. Hoisted to
 * a helper so A3/A4's `page.evaluate` bodies don't duplicate the
 * literal six times.
 */
function makeUpdateRow(rowId: number): Record<string, unknown> {
    return {
        "Product Name": "Fake Prod",
        "Ship Date": +new Date(),
        City: "Fake Town",
        "Row ID": rowId,
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
    };
}

test.describe("Frame timing — blank-plot invariant", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    for (const mode of RENDER_MODES) {
        test.describe(`render mode: ${mode}`, () => {
            for (const fixture of FIXTURES) {
                test.describe(fixture.name, () => {
                    test("pan does not blank the plot", async ({ page }) => {
                        const { threshold } = await setupChart(
                            page,
                            fixture,
                            mode,
                        );
                        const frames = await captureFrames(page, async () => {
                            await dragPan(page, -160, -80);
                        });

                        assertPlotNeverBlank(frames, threshold);
                    });

                    test("zoom does not blank the plot", async ({ page }) => {
                        const { threshold } = await setupChart(
                            page,
                            fixture,
                            mode,
                        );
                        const frames = await captureFrames(page, async () => {
                            await wheelZoom(page, -600);
                        });

                        assertPlotNeverBlank(frames, threshold);
                    });

                    test("resize does not blank", async ({ page }) => {
                        const { threshold } = await setupChart(
                            page,
                            fixture,
                            mode,
                        );
                        const frames = await captureFrames(page, async () => {
                            await page.evaluate(async () => {
                                const viewer = document.querySelector(
                                    "perspective-viewer",
                                ) as HTMLElement;
                                const widths = [
                                    "100%",
                                    "85%",
                                    "100%",
                                    "92%",
                                    "100%",
                                ];
                                for (const w of widths) {
                                    viewer.style.width = w;
                                    await new Promise<void>((resolve) =>
                                        requestAnimationFrame(() => resolve()),
                                    );
                                }
                            });

                            await page.evaluate(() => {
                                const viewer = document.querySelector(
                                    "perspective-viewer",
                                ) as HTMLElement;
                                viewer.style.width = "";
                            });
                        });

                        assertPlotNeverBlank(frames, threshold);
                    });

                    test("A3 — pan + concurrent draws does not blank", async ({
                        page,
                    }) => {
                        const { threshold } = await setupChart(
                            page,
                            fixture,
                            mode,
                        );
                        const frames = await captureFrames(page, async () => {
                            const drawLoop = page.evaluate(async () => {
                                const viewer =
                                    document.querySelector(
                                        "perspective-viewer",
                                    )!;
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

                            await dragPan(page, -160, -80, 30);
                            await page.evaluate(async () => {
                                // @ts-ignore
                                window["__is_running"] = false;
                            });

                            await drawLoop;
                        });

                        assertPlotNeverBlank(frames, threshold);
                    });

                    test("A4 — zoom + concurrent draws does not blank", async ({
                        page,
                    }) => {
                        const { threshold } = await setupChart(
                            page,
                            fixture,
                            mode,
                        );
                        const frames = await captureFrames(page, async () => {
                            const drawLoop = page.evaluate(async () => {
                                const viewer =
                                    document.querySelector(
                                        "perspective-viewer",
                                    )!;
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

                            await wheelZoom(page, -600, 20);
                            await page.evaluate(async () => {
                                // @ts-ignore
                                window["__is_running"] = false;
                            });

                            await drawLoop;
                        });

                        assertPlotNeverBlank(frames, threshold);
                    });
                });
            }
        });
    }
});

// Suppress an unused-helper hint when the inline `update` row
// literals haven't been migrated to use it. Kept around so future
// streaming tests can avoid duplicating the row body.
void makeUpdateRow;
