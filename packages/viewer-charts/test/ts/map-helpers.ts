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
 * Shared fixtures for the map-chart suites (map-tile-sources,
 * map-numeric-axes). The core trick: register solid-color `data:` URL
 * tile sources so basemap COVERAGE is directly measurable as pixel
 * color, with no live tile-CDN traffic and no dependence on Playwright
 * request interception (which cannot see dedicated-worker fetches).
 */

import type { Page } from "@playwright/test";
import type { PlotRegionFrac } from "./helpers";

/**
 * Superstore has no lon/lat columns; `Discount` (0–0.8) and `Quantity`
 * (1–14) are numeric and inside the Mercator lon/lat domain, which is
 * all the projection needs.
 */
export const MAP_CONFIG = {
    plugin: "Map Scatter",
    columns: ["Discount", "Quantity"],
};

/** Central plot sub-region, clear of axes, legend, and attribution. */
export const CENTER: PlotRegionFrac = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };

export interface MeanColor {
    r: number;
    g: number;
    b: number;
    opaque: number;
}

export async function savedPluginConfig(
    page: Page,
): Promise<Record<string, any>> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        const config = await viewer.save();
        return config.plugin_config ?? {};
    });
}

/**
 * Register solid-color data-URL tile sources in the page realm via the
 * plugin element class's static `registerTileSource`. The `#{z}/{x}/{y}`
 * suffix satisfies template validation and is inert at fetch time (URL
 * fragments never leave the client).
 */
export async function registerColorSources(
    page: Page,
    entries: ReadonlyArray<{ id: string; color: string }>,
): Promise<void> {
    await page.evaluate(
        (entries) => {
            const cls = customElements.get(
                "perspective-viewer-charts-map-scatter",
            ) as any;
            for (const { id, color } of entries) {
                const canvas = document.createElement("canvas");
                canvas.width = 4;
                canvas.height = 4;
                const ctx = canvas.getContext("2d")!;
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 4, 4);
                cls.registerTileSource({
                    id,
                    label: `Test ${id}`,
                    template: canvas.toDataURL("image/png") + "#{z}/{x}/{y}",
                    attribution: "test fixture",
                });
            }
        },
        entries as Array<{ id: string; color: string }>,
    );
}

/**
 * Mean RGB over the opaque pixels of `region` on the visible
 * `.webgl-canvas` composite. Routed through a 2D sampler canvas for
 * the same context-mode reasons as `captureFrames` in helpers.ts.
 */
export async function regionMeanColor(
    page: Page,
    region: PlotRegionFrac,
): Promise<MeanColor> {
    return await page.evaluate((region) => {
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
            return { r: 0, g: 0, b: 0, opaque: 0 };
        }

        const x0 = Math.round(region.x * canvas.width);
        const y0 = Math.round(region.y * canvas.height);
        const rw = Math.max(1, Math.round(region.w * canvas.width));
        const rh = Math.max(1, Math.round(region.h * canvas.height));
        const sampler = document.createElement("canvas");
        sampler.width = rw;
        sampler.height = rh;
        const ctx = sampler.getContext("2d", { willReadFrequently: true })!;
        try {
            ctx.drawImage(canvas, x0, y0, rw, rh, 0, 0, rw, rh);
        } catch {
            return { r: 0, g: 0, b: 0, opaque: 0 };
        }

        const data = ctx.getImageData(0, 0, rw, rh).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let opaque = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 200) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                opaque++;
            }
        }

        if (opaque === 0) {
            return { r: 0, g: 0, b: 0, opaque: 0 };
        }

        return {
            r: r / opaque,
            g: g / opaque,
            b: b / opaque,
            opaque,
        };
    }, region);
}

/**
 * Poll `regionMeanColor` until `pred` passes or the timeout lapses —
 * tile fetch + decode + rebind is async even for data-URL tiles.
 * Returns the last sample so a timeout produces a readable failure.
 */
export async function pollMeanColor(
    page: Page,
    region: PlotRegionFrac,
    pred: (c: MeanColor) => boolean,
    timeoutMs = 8000,
): Promise<MeanColor> {
    const start = Date.now();
    for (;;) {
        const c = await regionMeanColor(page, region);
        if (pred(c) || Date.now() - start > timeoutMs) {
            return c;
        }

        await new Promise((x) => setTimeout(x, 100));
    }
}

export const isRed = (c: MeanColor) =>
    c.opaque > 0 && c.r > 150 && c.r > c.g + 80 && c.r > c.b + 80;

export const isBlue = (c: MeanColor) =>
    c.opaque > 0 && c.b > 150 && c.b > c.r + 80 && c.b > c.g + 80;
