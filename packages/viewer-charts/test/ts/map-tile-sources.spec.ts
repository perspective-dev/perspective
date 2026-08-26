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
 * Metadata-driven tile-source suite: bundled tile-sources.json listing,
 * dynamic `map_tile_provider` enum, `registerTileSource` runtime
 * registration, and end-to-end basemap rendering of registered sources.
 *
 * No goldens and NO live tile-CDN traffic: Playwright cannot intercept
 * fetches made from dedicated workers, so registered test sources use
 * `data:` URL templates (solid-color PNGs with the `{z}/{x}/{y}`
 * placeholders riding in the URL fragment, which `fetch` ignores) and
 * assertions read basemap pixels off the visible composite canvas.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import {
    calibratePlotBaseline,
    gotoBasic,
    restoreChart,
    type PlotRegionFrac,
} from "./helpers";

/**
 * The bundled metadata, read from the SOURCE json so expectations track
 * the file verbatim: entry order defines the enum order AND the
 * default/`sourceFor`-fallback provider (first entry) — reordering the
 * file is a behavior change this suite must follow, not fight. Read
 * via `fs` (not an import): the test tsconfig's `rootDir: "."`
 * excludes cross-tree module imports.
 */
function bundledSpecs(): Array<{ id: string; label: string }> {
    const path = join(
        dirname(test.info().file),
        "../../src/ts/map/tile-sources.json",
    );
    return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Superstore has no lon/lat columns; `Discount` (0–0.8) and `Quantity`
 * (1–14) are numeric and inside the Mercator lon/lat domain, which is
 * all the projection needs.
 */
const MAP_CONFIG = {
    plugin: "Map Scatter",
    columns: ["Discount", "Quantity"],
};

/** Central plot sub-region, clear of axes, legend, and attribution. */
const CENTER: PlotRegionFrac = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };

async function savedPluginConfig(page: Page): Promise<Record<string, any>> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        const config = await viewer.save();
        return config.plugin_config ?? {};
    });
}

/**
 * Register solid-color data-URL tile sources in the page realm via the
 * plugin element class's static `registerTileSource`. Returns the ids
 * registered. The `#{z}/{x}/{y}` suffix satisfies template validation
 * and is inert at fetch time (URL fragments never leave the client).
 */
async function registerColorSources(
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
async function regionMeanColor(
    page: Page,
    region: PlotRegionFrac,
): Promise<{ r: number; g: number; b: number; opaque: number }> {
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
async function pollMeanColor(
    page: Page,
    region: PlotRegionFrac,
    pred: (c: { r: number; g: number; b: number; opaque: number }) => boolean,
    timeoutMs = 8000,
): Promise<{ r: number; g: number; b: number; opaque: number }> {
    const start = Date.now();
    for (;;) {
        const c = await regionMeanColor(page, region);
        if (pred(c) || Date.now() - start > timeoutMs) {
            return c;
        }

        await new Promise((x) => setTimeout(x, 100));
    }
}

const isRed = (c: { r: number; g: number; b: number; opaque: number }) =>
    c.opaque > 0 && c.r > 150 && c.r > c.g + 80 && c.r > c.b + 80;

const isBlue = (c: { r: number; g: number; b: number; opaque: number }) =>
    c.opaque > 0 && c.b > 150 && c.b > c.r + 80 && c.b > c.g + 80;

test.describe("map tile sources", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("bundled providers list in JSON order and drive the schema enum", async ({
        page,
    }) => {
        const { ids, variants, dflt } = await page.evaluate(() => {
            const cls = customElements.get(
                "perspective-viewer-charts-map-scatter",
            ) as any;
            const el = document.createElement(
                "perspective-viewer-charts-map-scatter",
            ) as any;
            const schema = el.plugin_config_schema();
            const field = schema.fields.find(
                (f: any) => f.key === "map_tile_provider",
            );
            return {
                ids: cls.tileSources().map((s: any) => s.id),
                variants: field?.variants ?? [],
                dflt: field?.default,
            };
        });

        const bundled = bundledSpecs();
        expect(ids).toEqual(bundled.map((s) => s.id));
        expect(variants).toEqual(
            bundled.map((s) => ({ value: s.id, label: s.label })),
        );

        // The default provider is the JSON's first entry.
        expect(dflt).toBe(bundled[0].id);
    });

    test("registered sources render and switch end-to-end", async ({
        page,
    }) => {
        await registerColorSources(page, [
            { id: "test-red", color: "#ff0000" },
            { id: "test-blue", color: "#0000ff" },
        ]);

        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { map_tile_provider: "test-red" },
        } as any);

        const red = await pollMeanColor(page, CENTER, isRed);
        expect(isRed(red)).toBe(true);

        await restoreChart(page, {
            plugin_config: { map_tile_provider: "test-blue" },
        } as any);

        const blue = await pollMeanColor(page, CENTER, isBlue);
        expect(isBlue(blue)).toBe(true);
    });

    test("registered sources join the schema enum and round-trip save()", async ({
        page,
    }) => {
        await registerColorSources(page, [{ id: "test-red", color: "#f00" }]);

        const variants = await page.evaluate(() => {
            const el = document.createElement(
                "perspective-viewer-charts-map-scatter",
            ) as any;
            const field = el
                .plugin_config_schema()
                .fields.find((f: any) => f.key === "map_tile_provider");
            return field.variants.map((v: any) => v.value);
        });
        expect(variants).toContain("test-red");

        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { map_tile_provider: "test-red" },
        } as any);

        let cfg = await savedPluginConfig(page);
        expect(cfg.map_tile_provider).toBe("test-red");

        // Restoring the schema default (the JSON's first entry) clears
        // the bucket entry rather than storing it literally.
        await restoreChart(page, {
            plugin_config: { map_tile_provider: bundledSpecs()[0].id },
        } as any);
        cfg = await savedPluginConfig(page);
        expect(cfg.map_tile_provider).toBeUndefined();
    });

    test("re-registering an id with a new template refreshes a live chart", async ({
        page,
    }) => {
        await registerColorSources(page, [{ id: "test-live", color: "#f00" }]);
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { map_tile_provider: "test-live" },
        } as any);

        const red = await pollMeanColor(page, CENTER, isRed);
        expect(isRed(red)).toBe(true);

        // Same id, different template — NO restore afterward. The
        // broadcast + worker-side config replay + content-derived cache
        // identity must repaint on their own.
        await registerColorSources(page, [
            { id: "test-live", color: "#0000ff" },
        ]);

        const blue = await pollMeanColor(page, CENTER, isBlue);
        expect(isBlue(blue)).toBe(true);
    });

    test("unknown provider id degrades to the default basemap without blanking", async ({
        page,
    }) => {
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { map_tile_provider: "no-such-provider" },
        } as any);

        // The chart still renders its glyph layer (the fallback
        // basemap may or may not resolve tiles in a sandboxed test
        // environment — only the id resolution must not throw)…
        const baseline = await calibratePlotBaseline(page, {
            plotRegionFrac: CENTER,
        });
        expect(baseline).toBeGreaterThan(0);

        // …and the unrecognized id is persisted verbatim, so a config
        // restored before its `registerTileSource` call self-heals
        // once registration arrives.
        const cfg = await savedPluginConfig(page);
        expect(cfg.map_tile_provider).toBe("no-such-provider");
    });

    test("malformed specs are rejected with TypeError", async ({ page }) => {
        const results = await page.evaluate(() => {
            const cls = customElements.get(
                "perspective-viewer-charts-map-scatter",
            ) as any;
            const attempt = (spec: unknown): string | null => {
                try {
                    cls.registerTileSource(spec);
                    return null;
                } catch (e) {
                    return e instanceof TypeError
                        ? e.message
                        : `not-a-TypeError: ${e}`;
                }
            };

            return [
                attempt({
                    id: "bad-template",
                    label: "Bad",
                    template: "https://example.com/tiles/x/y.png",
                    attribution: "test",
                }),
                attempt({
                    label: "No Id",
                    template: "https://example.com/{z}/{x}/{y}.png",
                    attribution: "test",
                }),
                attempt({
                    id: "bad-subdomains",
                    label: "Bad",
                    template: "https://{s}.example.com/{z}/{x}/{y}.png",
                    attribution: "test",
                }),
            ];
        });

        expect(results[0]).toContain("{z}");
        expect(results[1]).toContain("id");
        expect(results[2]).toContain("subdomains");
    });
});
