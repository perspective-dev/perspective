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
 * `legend_mode` / legend scroll / legend resize+move suite.
 *
 * Assertions are config round-trips (`viewer.save()`) and pixel-region
 * invariants — no screenshot goldens, so the suite runs without a
 * snapshot publish. The pixel probes read the visible `.webgl-canvas`,
 * which in the default blit mode carries the full composite (gridlines
 * + GL plot + chrome legend), so legend ink is visible to them.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import {
    calibratePlotBaseline,
    captureFrames,
    gotoBasic,
    restoreChart,
    waitOneFrame,
    assertViewerQuiescent,
    type PlotRegionFrac,
} from "./helpers";

/** Multi-series chart with a sidebar legend (4 `Ship Mode` entries). */
const SPLIT_CONFIG = {
    plugin: "Y Line",
    columns: ["Profit"],
    group_by: ["Order Date"],
    split_by: ["Ship Mode"],
};

/** Enough series (~49 `State`s ≈ 880px of rows) to overflow any box. */
const OVERFLOW_CONFIG = {
    plugin: "Y Line",
    columns: ["Profit"],
    group_by: ["Order Date"],
    split_by: ["State"],
};

async function savedPluginConfig(page: Page): Promise<Record<string, any>> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        const config = await viewer.save();
        return config.plugin_config ?? {};
    });
}

/**
 * Poll `viewer.save()`'s `plugin_config` until `pred` passes or the
 * timeout lapses — the drag→persist round-trip is async (worker post →
 * `viewer.restore` → host bucket). Returns the last observed value so
 * a timeout still produces a readable assertion failure.
 */
async function pollPluginConfig(
    page: Page,
    pred: (cfg: Record<string, any>) => boolean,
    timeoutMs = 5000,
): Promise<Record<string, any>> {
    const start = Date.now();
    for (;;) {
        const cfg = await savedPluginConfig(page);
        if (pred(cfg) || Date.now() - start > timeoutMs) {
            return cfg;
        }

        await new Promise((x) => setTimeout(x, 100));
    }
}

async function chartBox(
    page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await page.locator(".webgl-canvas").boundingBox();
    if (!box) {
        throw new Error("legend-mode.spec: .webgl-canvas has no box");
    }

    return box;
}

/** Median composite pixel count over `region` at quiescence. */
async function medianRegionPixels(
    page: Page,
    region: PlotRegionFrac,
): Promise<{ pixels: number; regionArea: number }> {
    const frames = await captureFrames(
        page,
        async () => {
            await waitOneFrame(page);
            await waitOneFrame(page);
        },
        { plotRegionFrac: region },
    );
    if (frames.length === 0) {
        throw new Error("medianRegionPixels: no frames captured");
    }

    const sorted = frames.map((f) => f.plotPixels).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const { canvasWidth, canvasHeight } = frames[frames.length - 1];
    return {
        pixels: median,
        regionArea:
            Math.round(region.w * canvasWidth) *
            Math.round(region.h * canvasHeight),
    };
}

test.describe("legend_mode", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("legend fields round-trip plugin_config and defaults are stripped", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await restoreChart(page, {
            plugin_config: { legend_mode: "floating", legend_width_px: 200 },
        } as any);

        let cfg = await savedPluginConfig(page);
        expect(cfg.legend_mode).toBe("floating");
        expect(cfg.legend_width_px).toBe(200);

        // Restoring the defaults clears the bucket entries entirely
        // (schema-default stripping) rather than storing them literally.
        await restoreChart(page, {
            plugin_config: { legend_mode: "sidebar", legend_width_px: 0 },
        } as any);
        cfg = await savedPluginConfig(page);
        expect(cfg.legend_mode).toBeUndefined();
        expect(cfg.legend_width_px).toBeUndefined();
    });

    test("floating legend paints an opaque panel at its configured anchor", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);

        const region: PlotRegionFrac = { x: 0, y: 0.65, w: 0.25, h: 0.35 };

        await restoreChart(page, {
            plugin_config: {
                legend_mode: "floating",
                legend_anchor: "bottom-left",
                legend_x: 0,
                legend_y: 0,
                legend_width_px: 160,
                legend_height_px: 160,
            },
        } as any);
        const floating = await medianRegionPixels(page, region);

        await restoreChart(page, {
            plugin_config: { legend_mode: "none" },
        } as any);
        const none = await medianRegionPixels(page, region);

        // The panel's opaque background must dominate the probe region
        // relative to the legend-less frame.
        expect(floating.pixels - none.pixels).toBeGreaterThan(
            0.1 * floating.regionArea,
        );
    });

    test("overflowing sidebar legend never paints past its box", async ({
        page,
    }) => {
        await restoreChart(page, OVERFLOW_CONFIG);
        await waitOneFrame(page);

        // The bottom slice of the right-hand gutter sits BELOW the
        // legend box (which ends at the plot bottom). The pre-scroll
        // renderer painted all ~49 entries straight through it; the
        // windowed painter must leave it empty.
        const region: PlotRegionFrac = { x: 0.88, y: 0.96, w: 0.12, h: 0.04 };
        const below = await medianRegionPixels(page, region);
        expect(below.pixels).toBeLessThan(500);
    });

    test("wheel over the sidebar legend scrolls it, not the plot", async ({
        page,
    }) => {
        await restoreChart(page, OVERFLOW_CONFIG);
        await waitOneFrame(page);
        const baseline = await calibratePlotBaseline(page);
        const box = await chartBox(page);

        // Park the cursor in the legend gutter and wheel. The plot
        // region (central 80%) must stay quiescent — a zoom would
        // rescale every glyph.
        await page.mouse.move(box.x + box.width - 40, box.y + 120);
        const frames = await captureFrames(page, async () => {
            await page.mouse.wheel(0, 240);
            await waitOneFrame(page);
            await page.mouse.wheel(0, 240);
            await waitOneFrame(page);
            await waitOneFrame(page);
        });

        assertViewerQuiescent(frames, Math.max(500, baseline * 0.05));
    });

    test("dragging the sidebar legend edge persists legend_width_px", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await waitOneFrame(page);
        const box = await chartBox(page);

        // Default sidebar gutter is 80px; the grab zone straddles the
        // legend's left edge at (width - 80 + 12). Drag it 80px left →
        // the persisted gutter should land near 160.
        const startX = box.x + box.width - 74;
        const y = box.y + 100;
        await page.mouse.move(startX, y);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
            await page.mouse.move(startX - i * 10, y);
        }

        await page.mouse.up();

        const cfg = await pollPluginConfig(
            page,
            (c) => typeof c.legend_width_px === "number",
        );
        expect(cfg.legend_width_px).toBeGreaterThan(130);
        expect(cfg.legend_width_px).toBeLessThan(190);
    });

    test("double-click on the sidebar divider resets legend_width_px", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await restoreChart(page, {
            plugin_config: { legend_width_px: 200 },
        } as any);
        await waitOneFrame(page);
        let cfg = await savedPluginConfig(page);
        expect(cfg.legend_width_px).toBe(200);
        const box = await chartBox(page);
        await page.mouse.dblclick(box.x + box.width - 194, box.y + 100);

        cfg = await pollPluginConfig(
            page,
            (c) => c.legend_width_px === undefined,
        );
        expect(cfg.legend_width_px).toBeUndefined();
    });

    test("double-click on the floating corner resets width and height", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await restoreChart(page, {
            plugin_config: {
                legend_mode: "floating",
                legend_width_px: 220,
                legend_height_px: 300,
            },
        } as any);
        await waitOneFrame(page);
        const box = await chartBox(page);
        await page.mouse.dblclick(box.x + box.width - 2, box.y + 298);

        const cfg = await pollPluginConfig(
            page,
            (c) =>
                c.legend_width_px === undefined &&
                c.legend_height_px === undefined,
        );
        expect(cfg.legend_width_px).toBeUndefined();
        expect(cfg.legend_height_px).toBeUndefined();
        expect(cfg.legend_mode).toBe("floating");
    });

    test("dragging the floating legend persists legend_x / legend_y", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await restoreChart(page, {
            plugin_config: { legend_mode: "floating" },
        } as any);
        await waitOneFrame(page);
        const box = await chartBox(page);

        const startX = box.x + box.width - 80;
        const startY = box.y + 9;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
            await page.mouse.move(startX - i * 15, startY + i * 12);
        }

        await page.mouse.up();

        const cfg = await pollPluginConfig(
            page,
            (c) =>
                typeof c.legend_x === "number" &&
                typeof c.legend_y === "number",
        );
        expect(cfg.legend_x).toBeGreaterThan(0.05);
        expect(cfg.legend_y).toBeGreaterThan(0.05);
    });

    test("form-driven legend geometry survives a save/restore round-trip", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await restoreChart(page, {
            plugin_config: {
                legend_mode: "floating",
                legend_width_px: 220,
                legend_height_px: 300,
                legend_anchor: "bottom-right",
                legend_x: 0.25,
                legend_y: 0.75,
                legend_opacity: 0.5,
            },
        } as any);

        const cfg = await savedPluginConfig(page);
        const roundTripped = await page.evaluate(async (c) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ plugin_config: { legend_mode: "none" } });
            await viewer.restore({ plugin_config: c });
            const after = await viewer.save();
            return after.plugin_config ?? {};
        }, cfg);

        expect(roundTripped.legend_mode).toBe("floating");
        expect(roundTripped.legend_width_px).toBe(220);
        expect(roundTripped.legend_height_px).toBe(300);
        expect(roundTripped.legend_anchor).toBe("bottom-right");
        expect(roundTripped.legend_x).toBe(0.25);
        expect(roundTripped.legend_y).toBe(0.75);
        expect(roundTripped.legend_opacity).toBe(0.5);
    });
});
