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
import { gotoBasic, restoreChart, waitOneFrame } from "./helpers";

const SETTLE_MS = 500;

const FIXTURE = {
    plugin: "Y Bar",
    group_by: ["Category"],
    expressions: { b100: "100", l50: "50" },
    aggregates: { b100: "avg", l50: "avg" },
    columns_config: {
        b100: { chart_type: "bar" },
        l50: { chart_type: "line" },
    },
};

/**
 * Dominant-color share of the widest fully-opaque row of the visible
 * `.webgl-canvas` (colors quantized >>3 per channel to absorb AA).
 */
async function lineRowModeFraction(page: Page): Promise<number> {
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
            throw new Error("glyph-z-order: no .webgl-canvas found");
        }

        const sampler = document.createElement("canvas");
        sampler.width = canvas.width;
        sampler.height = canvas.height;
        const ctx = sampler.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(canvas, 0, 0);
        const { data } = ctx.getImageData(0, 0, sampler.width, sampler.height);

        const W = sampler.width;
        const H = sampler.height;

        // Row with the most opaque pixels = the line's center row: the
        // line crosses the entire plot width while bars cover only the
        // band fraction, and the line's AA edge rows aren't opaque.
        let bestY = -1;
        let bestCount = 0;
        for (let y = 0; y < H; y++) {
            let count = 0;
            for (let x = 0; x < W; x++) {
                if (data[(y * W + x) * 4 + 3] > 200) {
                    count++;
                }
            }

            if (count > bestCount) {
                bestCount = count;
                bestY = y;
            }
        }

        if (bestY < 0 || bestCount < W * 0.3) {
            throw new Error(
                `glyph-z-order: no line row found (best ${bestCount}/${W})`,
            );
        }

        const histogram = new Map<number, number>();
        for (let x = 0; x < W; x++) {
            const i = (bestY * W + x) * 4;
            if (data[i + 3] <= 200) {
                continue;
            }

            const key =
                ((data[i] >> 3) << 10) |
                ((data[i + 1] >> 3) << 5) |
                (data[i + 2] >> 3);
            histogram.set(key, (histogram.get(key) ?? 0) + 1);
        }

        let mode = 0;
        for (const count of histogram.values()) {
            mode = Math.max(mode, count);
        }

        return mode / bestCount;
    });
}

async function renderAndMeasure(
    page: Page,
    columns: string[],
): Promise<number> {
    await gotoBasic(page);
    await restoreChart(page, { ...FIXTURE, columns } as never);
    await page.waitForTimeout(SETTLE_MS);
    await waitOneFrame(page);
    return await lineRowModeFraction(page);
}

test.describe("Mixed-glyph Z-order follows columns order", () => {
    test("bar declared after line occludes it", async ({ page }) => {
        const share = await renderAndMeasure(page, ["l50", "b100"]);
        expect(share).toBeLessThan(0.85);
    });

    test("line declared after bar stays on top", async ({ page }) => {
        const share = await renderAndMeasure(page, ["b100", "l50"]);
        expect(share).toBeGreaterThan(0.9);
    });
});
