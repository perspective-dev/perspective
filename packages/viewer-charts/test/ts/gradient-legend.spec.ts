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
 * Regression: single-sign numeric color domains rendered with the FULL
 * diverging gradient in the GL glyph shaders (plain linear
 * normalization) while the gradient legend — and every other CPU
 * consumer of `colorValueToT` — halved the gradient at the sign pivot,
 * so an all-positive color column plotted brown/orange "negative"
 * colors its legend never showed. Fixed by shipping the sign-pivot
 * `u_color_range` (`colorRangePivot`) for numeric columns, making the
 * shaders' linear branch reproduce `colorValueToT` exactly.
 *
 * Probe: count "warm" pixels — red channel dominant over blue — across
 * the visible composite canvas. The default theme's diverging gradient
 * keeps its negative half in browns / oranges / yellows and its
 * positive half in neutral → green → blue, so warm ink implies
 * negative-side colors. The zero-crossing control test proves the
 * probe's sensitivity: raw superstore `Profit` HAS negatives, so warm
 * ink must appear.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import { gotoBasic, restoreChart, waitOneFrame } from "./helpers";

/**
 * Count pixels whose red channel dominates blue — the negative
 * (brown / orange / yellow) half of the default diverging gradient.
 * Excludes the positive half (`#f0f0f0` neutral pivot, greens with
 * `r ≈ b + ~20`, blue-dominant blues) and grayscale chrome. The
 * darkest browns (`r < 140`) are deliberately missed; the mid-orange
 * band is more than enough signal for both directions of assertion.
 */
async function countWarmPixels(page: Page): Promise<number> {
    return await page.evaluate(() => {
        const visit = (
            root: Document | ShadowRoot,
        ): HTMLCanvasElement | null => {
            const direct = root.querySelector(
                ".webgl-canvas",
            ) as HTMLCanvasElement | null;
            if (direct) {
                return direct;
            }

            for (const el of Array.from(root.querySelectorAll("*"))) {
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

        const canvas = visit(document);
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            throw new Error("countWarmPixels: no .webgl-canvas found");
        }

        const sampler = document.createElement("canvas");
        sampler.width = canvas.width;
        sampler.height = canvas.height;
        const ctx = sampler.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
            throw new Error("countWarmPixels: sampler 2D context unavailable");
        }

        ctx.drawImage(canvas, 0, 0);
        const data = ctx.getImageData(0, 0, sampler.width, sampler.height).data;
        let warm = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const b = data[i + 2];
            if (r > 140 && r > b + 48) {
                warm += 1;
            }
        }

        return warm;
    });
}

/** Columns are `[X Axis, Y Axis, Color]` for the X/Y families. */
const ALL_POSITIVE_COLOR = ["Sales", "Profit", "Quantity"];
const CROSSING_COLOR = ["Sales", "Quantity", "Profit"];

test.describe("gradient color mapping (regression)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    for (const plugin of ["X/Y Scatter", "X/Y Line"] as const) {
        test(`${plugin} keeps an all-positive color column on the positive gradient half`, async ({
            page,
        }) => {
            await restoreChart(page, {
                plugin,
                columns: ALL_POSITIVE_COLOR,
            });
            await waitOneFrame(page);
            await waitOneFrame(page);
            const warm = await countWarmPixels(page);

            // AA slack only — pre-fix this counted thousands of
            // orange/brown pixels for `Quantity` ∈ [1, 14].
            expect(warm).toBeLessThan(50);
        });

        test(`${plugin} zero-crossing color column spans both halves (probe control)`, async ({
            page,
        }) => {
            await restoreChart(page, {
                plugin,
                columns: CROSSING_COLOR,
            });
            await waitOneFrame(page);
            await waitOneFrame(page);
            const warm = await countWarmPixels(page);

            // Raw superstore `Profit` has negative rows, so both the
            // plot AND the legend bar must show warm negative-side
            // ink. A probe regression (theme change, warm-threshold
            // rot) fails HERE first, not in the assertion above.
            expect(warm).toBeGreaterThan(500);
        });
    }
});
