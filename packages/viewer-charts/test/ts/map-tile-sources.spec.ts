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
import { expect, test } from "@perspective-dev/test";
import { calibratePlotBaseline, gotoBasic, restoreChart } from "./helpers";
import {
    CENTER,
    MAP_CONFIG,
    isBlue,
    isRed,
    pollMeanColor,
    registerColorSources,
    savedPluginConfig,
} from "./map-helpers";

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
            const flat: any[] = [];
            const walk = (fields: any[]) =>
                fields.forEach((f) =>
                    f.kind === "Group" ? walk(f.fields) : flat.push(f),
                );
            walk(schema.fields);
            const field = flat.find((f) => f.key === "map_tile_provider");
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
            const flat: any[] = [];
            const walk = (fields: any[]) =>
                fields.forEach((f) =>
                    f.kind === "Group" ? walk(f.fields) : flat.push(f),
                );
            walk(el.plugin_config_schema().fields);
            const field = flat.find((f) => f.key === "map_tile_provider");
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

    test("re-registering an id with a new template applies on the next config change", async ({
        page,
    }) => {
        await registerColorSources(page, [{ id: "test-live", color: "#f00" }]);
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { map_tile_provider: "test-live" },
        } as any);

        const red = await pollMeanColor(page, CENTER, isRed);
        expect(isRed(red)).toBe(true);

        await registerColorSources(page, [
            { id: "test-live", color: "#0000ff" },
        ]);
        await restoreChart(page, {
            plugin_config: {
                map_tile_provider: "test-live",
                map_tile_alpha: 0.99,
            },
        } as any);

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
