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

        // "sidebar" is a NON-default value now ("auto" is the default),
        // so it persists…
        await restoreChart(page, {
            plugin_config: { legend_mode: "sidebar" },
        } as any);
        cfg = await savedPluginConfig(page);
        expect(cfg.legend_mode).toBe("sidebar");

        // …and restoring the defaults clears the bucket entries
        // entirely (schema-default stripping) rather than storing them
        // literally.
        await restoreChart(page, {
            plugin_config: { legend_mode: "auto", legend_width_px: 0 },
        } as any);
        cfg = await savedPluginConfig(page);
        expect(cfg.legend_mode).toBeUndefined();
        expect(cfg.legend_width_px).toBeUndefined();
    });

    test("auto resolves floating for few entries and sidebar for many", async ({
        page,
    }) => {
        // 4 `Ship Mode` entries fit the default floating panel, so the
        // default ("auto") paints a floating panel at its default
        // anchor (top-right, zero offsets): the probe region carries
        // the panel's opaque background relative to `legend_mode:
        // "none"`.
        await restoreChart(page, SPLIT_CONFIG);
        const region: PlotRegionFrac = { x: 0.75, y: 0.01, w: 0.24, h: 0.2 };
        const auto = await medianRegionPixels(page, region);
        await restoreChart(page, {
            plugin_config: { legend_mode: "none" },
        } as any);
        const none = await medianRegionPixels(page, region);
        expect(auto.pixels - none.pixels).toBeGreaterThan(
            0.1 * auto.regionArea,
        );

        // ~49 `State` entries overflow the panel, so "auto" resolves
        // to sidebar: the plot narrows relative to "none" — a strip
        // just inside the sidebar gutter shows legend text ink but no
        // longer any plot ink. (The scroll/overflow tests in this
        // suite exercise the same resolution — they run OVERFLOW_CONFIG
        // at the default mode and depend on a sidebar legend.)
        await restoreChart(page, OVERFLOW_CONFIG);
        await restoreChart(page, {
            plugin_config: { legend_mode: "auto" },
        } as any);
        const gutter: PlotRegionFrac = { x: 0.94, y: 0.3, w: 0.05, h: 0.4 };
        const sidebar = await medianRegionPixels(page, gutter);
        expect(sidebar.pixels).toBeGreaterThan(0);
    });

    test("treemap defaults to sidebar; other chart types default to auto", async ({
        page,
    }) => {
        const defaults = await page.evaluate(() => {
            const modeDefault = (tag: string) => {
                const el = document.createElement(tag) as any;
                const flat: any[] = [];
                const walk = (fields: any[]) =>
                    fields.forEach((f) =>
                        f.kind === "Group" ? walk(f.fields) : flat.push(f),
                    );
                walk(el.plugin_config_schema().fields);
                return flat.find((f) => f.key === "legend_mode")?.default;
            };

            return {
                treemap: modeDefault("perspective-viewer-charts-treemap"),
                sunburst: modeDefault("perspective-viewer-charts-sunburst"),
                yLine: modeDefault("perspective-viewer-charts-y-line"),
            };
        });

        expect(defaults.treemap).toBe("sidebar");
        expect(defaults.sunburst).toBe("auto");
        expect(defaults.yLine).toBe("auto");
    });

    test("floating legend paints an opaque panel at its configured anchor", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);

        const region: PlotRegionFrac = { x: 0, y: 0.65, w: 0.25, h: 0.35 };

        await restoreChart(page, {
            plugin_config: {
                legend_mode: "floating",
                legend_size_mode: "fixed",
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
        // 4 entries resolve "auto" to floating — pin sidebar; this
        // test drives the sidebar divider.
        await restoreChart(page, {
            plugin_config: { legend_mode: "sidebar" },
        } as any);
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
            plugin_config: { legend_mode: "sidebar", legend_width_px: 200 },
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
                legend_size_mode: "fixed",
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
        // The reset also returns the panel to content sizing, so the
        // whole size bucket strips back to schema defaults.
        expect(cfg.legend_size_mode).toBeUndefined();
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
                legend_size_mode: "fixed",
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
        expect(roundTripped.legend_size_mode).toBe("fixed");
        expect(roundTripped.legend_width_px).toBe(220);
        expect(roundTripped.legend_height_px).toBe(300);
        expect(roundTripped.legend_anchor).toBe("bottom-right");
        expect(roundTripped.legend_x).toBe(0.25);
        expect(roundTripped.legend_y).toBe(0.75);
        expect(roundTripped.legend_opacity).toBe(0.5);
    });
});

/**
 * `legend_size_mode: "auto"` panel height, mirroring `floatingBox`:
 * header + frame padding + one row per entry. Asserting against the
 * formula (rather than a golden) keeps the test honest if the row
 * metrics change — both sides read the same three constants.
 */
const LEGEND_HEADER_H = 18;
const LEGEND_FRAME_H = 8;
const LEGEND_LINE_HEIGHT = 18;

function autoHeight(entries: number): number {
    return LEGEND_HEADER_H + LEGEND_FRAME_H + entries * LEGEND_LINE_HEIGHT;
}

/** Many more rows than `SPLIT_CONFIG` (14 vs 3 in the test fixture). */
const MANY_ENTRY_CONFIG = {
    plugin: "Y Line",
    columns: ["Profit"],
    group_by: ["Order Date"],
    split_by: ["Sub-Category"],
};

async function splitEntryCount(page: Page, column: string): Promise<number> {
    return await page.evaluate(async (col) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        const table = await viewer.getTable();
        const view = await table.view({ group_by: [col] });
        // `num_rows` counts the rollup root row too.
        const rows = (await view.num_rows()) - 1;
        await view.delete();
        return rows;
    }, column);
}

/**
 * Probe band over CSS rows `[y0, y1)` of the canvas, `wPx` wide and
 * flush to the right edge — where a top-right anchored floating panel
 * paints. Expressed in CSS px (converted to the fractions
 * `medianRegionPixels` wants) because the panel's auto size is in CSS
 * px, not a fraction of the canvas.
 */
async function rightBand(
    page: Page,
    y0: number,
    y1: number,
    wPx = 56,
): Promise<PlotRegionFrac> {
    const box = await chartBox(page);
    return {
        x: (box.width - wPx) / box.width,
        y: y0 / box.height,
        w: wPx / box.width,
        h: (y1 - y0) / box.height,
    };
}

/**
 * Ink the floating panel adds over `region`, isolated from the plot
 * behind it by differencing against `legend_mode: "none"` on the SAME
 * chart.
 *
 * The whole size bucket is pinned on every call, not just the fields
 * `pluginConfig` overrides: `restore({plugin_config})` MERGES, so a
 * probe that named only its own fields would inherit the previous
 * probe's overrides.
 */
async function panelInk(
    page: Page,
    region: PlotRegionFrac,
    pluginConfig: Record<string, unknown>,
): Promise<{ ink: number; regionArea: number }> {
    await restoreChart(page, {
        plugin_config: {
            legend_mode: "floating",
            legend_size_mode: "auto",
            legend_width_px: 0,
            legend_height_px: 160,
            ...pluginConfig,
        },
    } as any);
    const withLegend = await medianRegionPixels(page, region);
    await restoreChart(page, {
        plugin_config: { legend_mode: "none" },
    } as any);
    const without = await medianRegionPixels(page, region);
    return {
        ink: withLegend.pixels - without.pixels,
        regionArea: withLegend.regionArea,
    };
}

test.describe("legend_size_mode", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("defaults to auto and round-trips plugin_config", async ({ page }) => {
        await restoreChart(page, SPLIT_CONFIG);

        const schemaDefault = await page.evaluate(() => {
            const el = document.createElement(
                "perspective-viewer-charts-y-line",
            ) as any;
            const flat: any[] = [];
            const walk = (fields: any[]) =>
                fields.forEach((f) =>
                    f.kind === "Group" ? walk(f.fields) : flat.push(f),
                );
            walk(el.plugin_config_schema().fields);
            return flat.find((f) => f.key === "legend_size_mode")?.default;
        });
        expect(schemaDefault).toBe("auto");

        await restoreChart(page, {
            plugin_config: { legend_size_mode: "fixed" },
        } as any);
        expect((await savedPluginConfig(page)).legend_size_mode).toBe("fixed");

        // "auto" is the schema default, so it strips back out.
        await restoreChart(page, {
            plugin_config: { legend_size_mode: "auto" },
        } as any);
        expect(
            (await savedPluginConfig(page)).legend_size_mode,
        ).toBeUndefined();
    });

    test("auto height hugs the entry count", async ({ page }) => {
        await restoreChart(page, SPLIT_CONFIG);
        const h = autoHeight(await splitEntryCount(page, "Ship Mode"));

        const inside = await rightBand(page, h - 24, h - 6);
        const below = await rightBand(page, h + 8, h + 40);

        const insideInk = await panelInk(page, inside, {});
        expect(insideInk.ink).toBeGreaterThan(0.6 * insideInk.regionArea);

        const belowInk = await panelInk(page, below, {});
        expect(belowInk.ink).toBeLessThan(0.15 * belowInk.regionArea);
    });

    test("auto height tracks a larger entry list", async ({ page }) => {
        await restoreChart(page, SPLIT_CONFIG);
        const fewRows = await splitEntryCount(page, "Ship Mode");
        const manyRows = await splitEntryCount(page, "Sub-Category");
        const lo = autoHeight(fewRows) + 12;
        const hi = Math.min(lo + 50, autoHeight(manyRows) - 12);
        expect(hi - lo).toBeGreaterThan(10);
        const band = await rightBand(page, lo, hi);

        const few = await panelInk(page, band, {});

        await restoreChart(page, MANY_ENTRY_CONFIG);
        const many = await panelInk(page, band, {});

        expect(few.ink).toBeLessThan(0.15 * few.regionArea);
        expect(many.ink).toBeGreaterThan(0.6 * many.regionArea);
    });

    test("auto ignores legend_width_px and legend_height_px", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        const sized = { legend_width_px: 512, legend_height_px: 512 };

        // Well below a 4-entry auto panel, but inside a 512px fixed one.
        const low = await rightBand(page, 260, 320);
        const lowAuto = await panelInk(page, low, sized);
        expect(lowAuto.ink).toBeLessThan(0.15 * lowAuto.regionArea);
        const lowFixed = await panelInk(page, low, {
            ...sized,
            legend_size_mode: "fixed",
        });
        expect(lowFixed.ink).toBeGreaterThan(0.6 * lowFixed.regionArea);

        // Left of a content-sized panel, but inside a 512px-wide one
        // (clamped to half the canvas, so still well right of centre).
        const leftOfAuto: PlotRegionFrac = {
            x: 0.55,
            y: 0.02,
            w: 0.1,
            h: 0.06,
        };
        const wideAuto = await panelInk(page, leftOfAuto, sized);
        expect(wideAuto.ink).toBeLessThan(0.15 * wideAuto.regionArea);
        const wideFixed = await panelInk(page, leftOfAuto, {
            ...sized,
            legend_size_mode: "fixed",
        });
        expect(wideFixed.ink).toBeGreaterThan(0.5 * wideFixed.regionArea);
    });

    test("a sub-pixel legend_x collapses back to the default", async ({
        page,
    }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await restoreChart(page, {
            plugin_config: {
                legend_mode: "floating",
                legend_x: 0.0003,
                legend_y: 0.0003,
            },
        } as any);
        await waitOneFrame(page);
        expect((await savedPluginConfig(page)).legend_x).toBe(0.0003);
        const box = await chartBox(page);
        const grabX = box.x + box.width - 60;
        const grabY = box.y + 9;
        await page.mouse.move(grabX, grabY);
        await page.mouse.down();
        await page.mouse.move(grabX - 20, grabY);
        await page.mouse.move(grabX, grabY);
        await page.mouse.up();

        const cfg = await pollPluginConfig(
            page,
            (c) => c.legend_x === undefined && c.legend_y === undefined,
        );
        expect(cfg.legend_x).toBeUndefined();
        expect(cfg.legend_y).toBeUndefined();
    });

    test("resizing an auto panel switches it to fixed", async ({ page }) => {
        await restoreChart(page, SPLIT_CONFIG);
        await restoreChart(page, {
            plugin_config: { legend_mode: "floating" },
        } as any);
        await waitOneFrame(page);

        // Grab the SE corner of the content-sized panel and drag it out.
        const rows = await splitEntryCount(page, "Ship Mode");
        const box = await chartBox(page);
        const startX = box.x + box.width - 2;
        const startY = box.y + autoHeight(rows) - 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) {
            await page.mouse.move(startX, startY + i * 20);
        }

        await page.mouse.up();

        const cfg = await pollPluginConfig(
            page,
            (c) => c.legend_size_mode === "fixed",
        );
        expect(cfg.legend_size_mode).toBe("fixed");
        // The freeze seeds BOTH dimensions from the box on screen, so
        // the untouched width lands at the auto width rather than 0.
        expect(cfg.legend_height_px).toBeGreaterThan(autoHeight(rows));
        expect(cfg.legend_width_px).toBeGreaterThan(0);
    });
});
