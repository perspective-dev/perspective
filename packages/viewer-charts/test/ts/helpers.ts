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

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";

/**
 * Default pixel tolerance for chart screenshots. SwiftShader is
 * deterministic on a given machine, but a handful of sub-pixel AA
 * decisions still wiggle across Chromium versions.
 */
// @ts-ignore
const DEFAULT_MAX_DIFF_PIXEL_RATIO = process.env.CI ? 0.01 : 0;
const DEFAULT_THRESHOLD = 0;

/**
 * Load the shared `basic-test.html` shell and block until the test
 * harness signals that perspective is ready. All specs start here.
 */
export async function gotoBasic(page: Page): Promise<void> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

/**
 * Restore the viewer with `config`, then wait one animation frame so
 * the chart's scheduled render (`requestRender` → scheduler RAF →
 * `_fullRender`) has fired. By the time this returns, WebGL draw
 * commands have been issued to the GL context and `page.screenshot()`
 * will capture them.
 */
export async function restoreChart(
    page: Page,
    config: ViewerConfigUpdate,
): Promise<void> {
    await page.evaluate(
        async (c) => {
            const viewer = document.querySelector("perspective-viewer")!;
            await (viewer as any).restore(c);
        },
        config as unknown as Record<string, unknown>,
    );
    await waitOneFrame(page);
}

/** Await a single RAF in the page context. */
export async function waitOneFrame(page: Page): Promise<void> {
    await page.evaluate(
        () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
            ),
    );
}

/**
 * Take a screenshot of the viewer element (not the whole page) and
 * compare to `name`'s baseline. Cropping to the viewer excludes page
 * scrollbars / viewport chrome that would add pixel noise.
 */
export async function expectViewerScreenshot(
    page: Page,
    options: { maxDiffPixelRatio?: number } = {},
): Promise<void> {
    const viewer = page.locator("perspective-viewer");
    const snapshotName =
        test
            .info()
            .titlePath.slice(1)
            .map((s) =>
                s
                    .trim()
                    .replace(/[^a-z0-9]+/gi, "-")
                    .toLowerCase(),
            )
            .join("-") + ".png";

    await expect(viewer).toHaveScreenshot(snapshotName, {
        threshold: DEFAULT_THRESHOLD,
        maxDiffPixelRatio:
            options.maxDiffPixelRatio ?? DEFAULT_MAX_DIFF_PIXEL_RATIO,
    });
}

/**
 * Full-flow convenience: go to the test page, restore the chart with
 * `config`, wait for the render, and screenshot. The snapshot filename
 * is derived from the describe path and test title.
 */
export async function renderAndCapture(
    page: Page,
    config: ViewerConfigUpdate,
    options?: { maxDiffPixelRatio?: number },
): Promise<void> {
    await restoreChart(page, config);
    await expectViewerScreenshot(page, options);
}

/**
 * One per-frame measurement, captured during the action passed to
 * `captureFrames`. `plotPixels` counts non-background pixels inside
 * `plotRegionFrac` (default = central 80% of the visible canvas).
 */
export interface FrameSample {
    timestampMs: number;
    plotPixels: number;
    canvasWidth: number;
    canvasHeight: number;
}

/**
 * The sub-region of the visible canvas, expressed as fractions of
 * canvas width/height, that the capture loop counts pixels in.
 */
export interface PlotRegionFrac {
    x: number;
    y: number;
    w: number;
    h: number;
}

const DEFAULT_PLOT_REGION: PlotRegionFrac = {
    x: 0.1,
    y: 0.1,
    w: 0.8,
    h: 0.8,
};

/**
 * Pixel-color match threshold for "is this pixel part of the chart
 * background?"
 */
const DEFAULT_BG_TOLERANCE = 30;

/**
 * Run `action` while a per-frame capture loop reads the visible
 * canvas's plot region. Returns one `FrameSample` per browser RAF
 * that fired between `start` and `stop`. The capture loop is
 * installed and torn down inside this helper — no global state
 * leaks between tests.
 */
export async function captureFrames(
    page: Page,
    action: () => Promise<void>,
    options: { plotRegionFrac?: PlotRegionFrac; bgTolerance?: number } = {},
): Promise<FrameSample[]> {
    const region = options.plotRegionFrac ?? DEFAULT_PLOT_REGION;
    const tolerance = options.bgTolerance ?? DEFAULT_BG_TOLERANCE;
    await page.evaluate(
        ({ region, tolerance }) => {
            type Sample = {
                timestampMs: number;
                plotPixels: number;
                canvasWidth: number;
                canvasHeight: number;
            };

            const w = window as unknown as {
                __captureFrames?: Sample[];
                __captureRunning?: boolean;
                __captureRAF?: number;
            };

            w.__captureFrames = [];
            w.__captureRunning = true;
            const findCanvas = (): HTMLCanvasElement | null => {
                const visit = (
                    root: Document | ShadowRoot,
                ): HTMLCanvasElement | null => {
                    const direct = root.querySelector(
                        ".webgl-canvas",
                    ) as HTMLCanvasElement | null;
                    if (direct) {
                        return direct;
                    }

                    const all = root.querySelectorAll("*");
                    for (const el of Array.from(all)) {
                        const sr = (el as Element & { shadowRoot?: ShadowRoot })
                            .shadowRoot;
                        if (sr) {
                            const found = visit(sr);
                            if (found) {
                                return found;
                            }
                        }
                    }

                    return null;
                };

                return visit(document);
            };

            // Cache the canvas reference across ticks.
            let cachedCanvas: HTMLCanvasElement | null = null;

            // Sampler canvas: the visible `.webgl-canvas` may have
            // any of three context modes:
            //
            //   - blit mode: 2D context (host blits worker bitmaps
            //     onto it). `getImageData` works directly.
            //   - direct mode: `transferControlToOffscreen` —
            //     placeholder for the worker's WebGL OffscreenCanvas.
            //     Host has *no* context on this canvas;
            //     `getImageData` impossible.
            //   - in-process mode: WebGL context owned by main
            //     thread. `getContext("2d")` returns null.
            //
            // The unifying invariant: in all three modes the canvas
            // is a valid image source for `drawImage`. Routing the
            // sample through a 2D sampler canvas — `drawImage` copy
            // followed by `getImageData` on the sampler — reads
            // pixels in every mode without any production code
            // change. The sampler is sized to the requested region,
            // resized lazily as the source canvas dimensions change.
            const sampler = document.createElement("canvas");
            const samplerCtx = sampler.getContext("2d");
            if (!samplerCtx) {
                throw new Error(
                    "captureFrames: sampler canvas 2D context unavailable",
                );
            }

            const tick = () => {
                if (!w.__captureRunning) {
                    return;
                }

                if (!cachedCanvas || !cachedCanvas.isConnected) {
                    cachedCanvas = findCanvas();
                }

                const canvas = cachedCanvas;
                if (canvas && canvas.width > 0 && canvas.height > 0) {
                    const x0 = Math.max(0, Math.round(region.x * canvas.width));

                    const y0 = Math.max(
                        0,
                        Math.round(region.y * canvas.height),
                    );

                    const rw = Math.max(
                        1,
                        Math.min(
                            canvas.width - x0,
                            Math.round(region.w * canvas.width),
                        ),
                    );

                    const rh = Math.max(
                        1,
                        Math.min(
                            canvas.height - y0,
                            Math.round(region.h * canvas.height),
                        ),
                    );

                    if (sampler.width !== rw) {
                        sampler.width = rw;
                    }

                    if (sampler.height !== rh) {
                        sampler.height = rh;
                    }

                    samplerCtx.clearRect(0, 0, rw, rh);
                    try {
                        samplerCtx.drawImage(
                            canvas,
                            x0,
                            y0,
                            rw,
                            rh,
                            0,
                            0,
                            rw,
                            rh,
                        );
                    } catch {
                        // `drawImage` can throw on transient zero-
                        // size sources during plugin reconnect;
                        // skip this frame and try again next RAF.
                        w.__captureRAF = requestAnimationFrame(tick);
                        return;
                    }

                    const data = samplerCtx.getImageData(0, 0, rw, rh).data;
                    let nonBg = 0;

                    // The GL canvas is cleared with
                    // `clearColor(0,0,0,0)` and glyphs paint with
                    // `a > 0`; in blit mode the host blits with
                    // `globalCompositeOperation = "copy"`, so post-
                    // blit pixels are either glyph (`a > 0`) or
                    // fully transparent (`a == 0`). In direct/in-
                    // process modes the WebGL canvas itself follows
                    // the same alpha convention. So a simple alpha
                    // test is the correct invariant for "glyph
                    // fragment landed here" in every mode.
                    void tolerance;
                    for (let i = 3; i < data.length; i += 4) {
                        if (data[i] > 0) {
                            nonBg++;
                        }
                    }

                    w.__captureFrames!.push({
                        timestampMs: performance.now(),
                        plotPixels: nonBg,
                        canvasWidth: canvas.width,
                        canvasHeight: canvas.height,
                    });
                }

                w.__captureRAF = requestAnimationFrame(tick);
            };

            w.__captureRAF = requestAnimationFrame(tick);
        },
        { region, tolerance },
    );

    try {
        await action();
        // One trailing RAF so the final post-action paint is captured.
        await waitOneFrame(page);
    } finally {
        await page.evaluate(() => {
            const w = window as unknown as {
                __captureRunning?: boolean;
                __captureRAF?: number;
            };
            w.__captureRunning = false;
            if (w.__captureRAF !== undefined) {
                cancelAnimationFrame(w.__captureRAF);
                w.__captureRAF = undefined;
            }
        });
    }

    const frames = await page.evaluate(() => {
        const w = window as unknown as { __captureFrames?: FrameSample[] };
        const out = w.__captureFrames ?? [];
        w.__captureFrames = undefined;
        return out;
    });

    return frames;
}

/**
 * Take one quiescent-state pixel sample of the chart's plot region
 * to use as the calibration baseline for `assertPlotNeverBlank`.
 */
export async function calibratePlotBaseline(
    page: Page,
    options: { plotRegionFrac?: PlotRegionFrac; bgTolerance?: number } = {},
): Promise<number> {
    const samples = await captureFrames(
        page,
        async () => {
            await waitOneFrame(page);
            await waitOneFrame(page);
        },
        options,
    );

    // The first frame can lag the prior render; pick the median of
    // the captured frames as a stable baseline.
    if (samples.length === 0) {
        throw new Error("calibratePlotBaseline: no frames captured");
    }

    const sorted = samples.map((s) => s.plotPixels).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Primary invariant assertion. For every frame in `frames`,
 * `plotPixels` must be ≥ `minPixels`.
 */
export function assertPlotNeverBlank(
    frames: FrameSample[],
    minPixels: number,
): void {
    if (frames.length === 0) {
        throw new Error("assertPlotNeverBlank: no frames captured");
    }

    for (let i = 0; i < frames.length; i++) {
        if (frames[i].plotPixels < minPixels) {
            const ctxStart = Math.max(0, i - 3);
            const ctxEnd = Math.min(frames.length, i + 4);
            const ctxLines = frames
                .slice(ctxStart, ctxEnd)
                .map((f, j) => {
                    const idx = ctxStart + j;
                    const marker = idx === i ? " ← BLANK" : "";
                    return `  [${idx}] plotPixels=${f.plotPixels}${marker}`;
                })
                .join("\n");
            throw new Error(
                `assertPlotNeverBlank: frame ${i} of ${frames.length} ` +
                    `had ${frames[i].plotPixels} non-background pixels ` +
                    `(threshold ${minPixels}). Surrounding frames:\n${ctxLines}`,
            );
        }
    }
}

//                        ╭──────────────╮
//                        │              │
//   Multi-viewer helpers │              │
//                        ╰──────────────╯
//
// Variants of the single-viewer helpers above scoped to a specific
// `<perspective-viewer>` index, plus a parallel-capture entry point
// that returns one `FrameSample[]` per viewer in DOM order. Used by
// `multi-chart.spec.ts` to verify cross-chart isolation: pan on
// viewer A must not blank viewer B; both panning concurrently must
// leave each chart's invariant intact; streaming-update on the
// shared table must surface as live data on both without blanking.
//
// All multi-viewer helpers walk the document for *all*
// `<perspective-viewer>` elements (not the single one
// `gotoBasic` assumes). The order is `document.querySelectorAll`
// tree order, which matches the order viewers are placed in
// `two-chart-test.html`.

/**
 * Two-viewer page entry. Same shape as `gotoBasic` but loads the
 * two-chart fixture and waits for both viewers to be bound to the
 * shared table.
 */
export async function gotoTwoChart(page: Page): Promise<void> {
    await page.goto("/tools/test/src/html/two-chart-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

/**
 * Restore a specific viewer (by 0-based DOM-order index). Mirrors
 * `restoreChart` for the multi-viewer fixture. Awaits one RAF so
 * the chart's first paint has fired by the time this returns.
 */
export async function restoreChartAt(
    page: Page,
    viewerIndex: number,
    config: ViewerConfigUpdate,
): Promise<void> {
    await page.evaluate(
        async ({ viewerIndex, c }) => {
            const viewers = document.querySelectorAll("perspective-viewer");
            const viewer = viewers[viewerIndex];
            if (!viewer) {
                throw new Error(
                    `restoreChartAt: no viewer at index ${viewerIndex} (` +
                        `found ${viewers.length})`,
                );
            }

            await (viewer as any).restore(c);
        },
        { viewerIndex, c: config as unknown as Record<string, unknown> },
    );
    await waitOneFrame(page);
}

/**
 * Run `action` while sampling every viewer's plot region every RAF.
 * Returns one `FrameSample[]` per viewer in DOM order.
 *
 * Implementation parallels `captureFrames` but walks every shadow
 * root for *all* `.webgl-canvas` elements, samples each one's plot
 * region per tick, and tracks per-canvas logs in arrays indexed by
 * the canvas's discovery order. Cached canvas list is invalidated
 * if any cached canvas becomes detached (plugin reconnect during
 * capture); the rebuild is O(n) over reachable elements but only
 * runs when the cache is stale.
 */
export async function captureFramesAllViewers(
    page: Page,
    action: () => Promise<void>,
    options: { plotRegionFrac?: PlotRegionFrac } = {},
): Promise<FrameSample[][]> {
    const region = options.plotRegionFrac ?? DEFAULT_PLOT_REGION;

    await page.evaluate(
        ({ region }) => {
            type Sample = {
                timestampMs: number;
                plotPixels: number;
                canvasWidth: number;
                canvasHeight: number;
            };

            const w = window as unknown as {
                __captureMultiFrames?: Sample[][];
                __captureRunning?: boolean;
                __captureRAF?: number;
            };

            w.__captureMultiFrames = [];
            w.__captureRunning = true;

            const findAllCanvases = (): HTMLCanvasElement[] => {
                const out: HTMLCanvasElement[] = [];
                const visit = (root: Document | ShadowRoot): void => {
                    const direct = root.querySelectorAll(".webgl-canvas");
                    for (const c of Array.from(direct)) {
                        out.push(c as HTMLCanvasElement);
                    }

                    const all = root.querySelectorAll("*");
                    for (const el of Array.from(all)) {
                        const sr = (el as Element & { shadowRoot?: ShadowRoot })
                            .shadowRoot;
                        if (sr) {
                            visit(sr);
                        }
                    }
                };

                visit(document);
                return out;
            };

            let cachedCanvases: HTMLCanvasElement[] = [];

            const cacheStale = (): boolean => {
                if (cachedCanvases.length === 0) {
                    return true;
                }

                for (const c of cachedCanvases) {
                    if (!c.isConnected) {
                        return true;
                    }
                }

                return false;
            };

            // Single shared sampler canvas — resized per-viewer
            // inside the loop. Same rationale as in `captureFrames`:
            // routing the read through a 2D sampler via `drawImage`
            // works whether the source canvas is in blit mode (2D
            // context), direct mode (`transferControlToOffscreen`
            // placeholder), or in-process mode (WebGL on main
            // thread). `getImageData` directly on the source canvas
            // would fail in two of those three modes.
            const sampler = document.createElement("canvas");
            const samplerCtx = sampler.getContext("2d");
            if (!samplerCtx) {
                throw new Error(
                    "captureFramesAllViewers: sampler canvas 2D context unavailable",
                );
            }

            const tick = () => {
                if (!w.__captureRunning) {
                    return;
                }

                if (cacheStale()) {
                    cachedCanvases = findAllCanvases();
                    // Make sure the per-viewer logs array has slots
                    // for every discovered canvas; preserve any
                    // existing prefix for viewers that survived the
                    // rebuild.
                    while (
                        w.__captureMultiFrames!.length < cachedCanvases.length
                    ) {
                        w.__captureMultiFrames!.push([]);
                    }
                }

                const tMs = performance.now();
                for (let vi = 0; vi < cachedCanvases.length; vi++) {
                    const canvas = cachedCanvases[vi];
                    if (!canvas || canvas.width === 0 || canvas.height === 0) {
                        continue;
                    }

                    const x0 = Math.max(0, Math.round(region.x * canvas.width));
                    const y0 = Math.max(
                        0,
                        Math.round(region.y * canvas.height),
                    );
                    const rw = Math.max(
                        1,
                        Math.min(
                            canvas.width - x0,
                            Math.round(region.w * canvas.width),
                        ),
                    );
                    const rh = Math.max(
                        1,
                        Math.min(
                            canvas.height - y0,
                            Math.round(region.h * canvas.height),
                        ),
                    );

                    if (sampler.width !== rw) {
                        sampler.width = rw;
                    }

                    if (sampler.height !== rh) {
                        sampler.height = rh;
                    }

                    samplerCtx.clearRect(0, 0, rw, rh);
                    try {
                        samplerCtx.drawImage(
                            canvas,
                            x0,
                            y0,
                            rw,
                            rh,
                            0,
                            0,
                            rw,
                            rh,
                        );
                    } catch {
                        continue;
                    }

                    const data = samplerCtx.getImageData(0, 0, rw, rh).data;
                    let nonBg = 0;
                    for (let i = 3; i < data.length; i += 4) {
                        if (data[i] > 0) {
                            nonBg++;
                        }
                    }

                    w.__captureMultiFrames![vi].push({
                        timestampMs: tMs,
                        plotPixels: nonBg,
                        canvasWidth: canvas.width,
                        canvasHeight: canvas.height,
                    });
                }

                w.__captureRAF = requestAnimationFrame(tick);
            };

            w.__captureRAF = requestAnimationFrame(tick);
        },
        { region },
    );

    try {
        await action();
        await waitOneFrame(page);
    } finally {
        await page.evaluate(() => {
            const w = window as unknown as {
                __captureRunning?: boolean;
                __captureRAF?: number;
            };
            w.__captureRunning = false;
            if (w.__captureRAF !== undefined) {
                cancelAnimationFrame(w.__captureRAF);
                w.__captureRAF = undefined;
            }
        });
    }

    const frames = await page.evaluate(() => {
        const w = window as unknown as {
            __captureMultiFrames?: FrameSample[][];
        };
        const out = w.__captureMultiFrames ?? [];
        w.__captureMultiFrames = undefined;
        return out;
    });

    return frames;
}

/**
 * Quiescent baselines for every viewer. One median value per
 * viewer, in DOM order. Used by `multi-chart.spec.ts` to set
 * per-viewer blank thresholds before driving the action.
 */
export async function calibrateAllBaselines(
    page: Page,
    options: { plotRegionFrac?: PlotRegionFrac } = {},
): Promise<number[]> {
    const samples = await captureFramesAllViewers(
        page,
        async () => {
            await waitOneFrame(page);
            await waitOneFrame(page);
        },
        options,
    );

    if (samples.length === 0) {
        throw new Error("calibrateAllBaselines: no viewers found");
    }

    return samples.map((perViewer, idx) => {
        if (perViewer.length === 0) {
            throw new Error(
                `calibrateAllBaselines: viewer ${idx} captured no frames`,
            );
        }

        const sorted = perViewer.map((s) => s.plotPixels).sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    });
}

/**
 * Cross-chart isolation invariant: viewer at `viewerIndex` should
 * have stayed quiescent across `frames` (no rendered changes from
 * actions targeting other viewers). Allows ±`tolerance` pixels
 * around the median to absorb anti-aliasing noise from the host's
 * compositor; rejects on a single frame whose `plotPixels` deviates
 * by more than that.
 *
 * Use when the test drives an interaction on a different viewer and
 * needs to verify the un-interacted viewer was not collateral
 * damage.
 */
export function assertViewerQuiescent(
    frames: FrameSample[],
    tolerance: number,
): void {
    if (frames.length === 0) {
        throw new Error("assertViewerQuiescent: no frames captured");
    }

    const counts = frames.map((f) => f.plotPixels);
    const sorted = [...counts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    for (let i = 0; i < counts.length; i++) {
        if (Math.abs(counts[i] - median) > tolerance) {
            const ctxStart = Math.max(0, i - 3);
            const ctxEnd = Math.min(counts.length, i + 4);
            const ctxLines = counts
                .slice(ctxStart, ctxEnd)
                .map((c, j) => {
                    const idx = ctxStart + j;
                    const marker = idx === i ? " ← DEVIANT" : "";
                    return `  [${idx}] plotPixels=${c}${marker}`;
                })
                .join("\n");
            throw new Error(
                `assertViewerQuiescent: frame ${i} of ${counts.length} ` +
                    `had ${counts[i]} non-background pixels, median=${median}, ` +
                    `tolerance=±${tolerance}. Surrounding frames:\n${ctxLines}`,
            );
        }
    }
}
