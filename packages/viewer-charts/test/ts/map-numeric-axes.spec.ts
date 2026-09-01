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

import { expect, test } from "@perspective-dev/test";
import { gotoBasic, restoreChart, type PlotRegionFrac } from "./helpers";
import {
    MAP_CONFIG,
    isRed,
    pollMeanColor,
    regionMeanColor,
    registerColorSources,
    savedPluginConfig,
} from "./map-helpers";

const LEFT_EDGE: PlotRegionFrac = { x: 0, y: 0.3, w: 0.03, h: 0.4 };
const BOTTOM_EDGE: PlotRegionFrac = { x: 0.3, y: 0.97, w: 0.4, h: 0.03 };
const RIGHT_EDGE: PlotRegionFrac = { x: 0.97, y: 0.3, w: 0.03, h: 0.4 };

test.describe("map numeric_axes", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
        await registerColorSources(page, [{ id: "test-red", color: "#f00" }]);
    });

    test("numeric_axes round-trips plugin_config and the default (true) is stripped", async ({
        page,
    }) => {
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { numeric_axes: false },
        } as any);

        let cfg = await savedPluginConfig(page);
        expect(cfg.numeric_axes).toBe(false);

        await restoreChart(page, {
            plugin_config: { numeric_axes: true },
        } as any);
        cfg = await savedPluginConfig(page);
        expect(cfg.numeric_axes).toBeUndefined();
    });

    test("numeric_axes off renders the basemap full-bleed to every edge", async ({
        page,
    }) => {
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: {
                map_tile_provider: "test-red",
                numeric_axes: false,
            },
        } as any);

        for (const region of [LEFT_EDGE, BOTTOM_EDGE, RIGHT_EDGE]) {
            const c = await pollMeanColor(page, region, isRed);
            expect(isRed(c)).toBe(true);
        }
    });

    test("default (on) reserves axis gutters and paints tick labels", async ({
        page,
    }) => {
        await restoreChart(page, {
            ...MAP_CONFIG,
            plugin_config: { map_tile_provider: "test-red" },
        } as any);

        const center = await pollMeanColor(
            page,
            { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
            isRed,
        );
        expect(isRed(center)).toBe(true);
        const left = await regionMeanColor(page, LEFT_EDGE);
        expect(isRed(left)).toBe(false);
        const bottom = await regionMeanColor(page, BOTTOM_EDGE);
        expect(isRed(bottom)).toBe(false);

        const leftGutter = await regionMeanColor(page, {
            x: 0,
            y: 0.2,
            w: 0.05,
            h: 0.6,
        });
        expect(leftGutter.opaque).toBeGreaterThan(0);
        expect(isRed(leftGutter)).toBe(false);
    });

    test("full-bleed keeps the sidebar legend gutter when a legend shows", async ({
        page,
    }) => {
        // The gradient legend resolves "auto" to floating (no entry
        // list) — pin sidebar; this test asserts the sidebar gutter.
        await restoreChart(page, {
            plugin: "Map Scatter",
            columns: ["Discount", "Quantity", "Profit"],
            plugin_config: {
                map_tile_provider: "test-red",
                numeric_axes: false,
                legend_mode: "sidebar",
            },
        } as any);

        const centerOn = await pollMeanColor(
            page,
            { x: 0.3, y: 0.3, w: 0.35, h: 0.4 },
            isRed,
        );
        expect(isRed(centerOn)).toBe(true);
        const right = await regionMeanColor(page, RIGHT_EDGE);
        expect(isRed(right)).toBe(false);

        await restoreChart(page, {
            plugin_config: { legend_mode: "none" },
        } as any);
        const rightNone = await pollMeanColor(page, RIGHT_EDGE, isRed);
        expect(isRed(rightNone)).toBe(true);
    });

    test("faceted bare map cells are flush to the canvas edge", async ({
        page,
    }) => {
        await restoreChart(page, {
            ...MAP_CONFIG,
            split_by: ["Ship Mode"],
            plugin_config: {
                map_tile_provider: "test-red",
                numeric_axes: false,
            },
        } as any);
        const left = await pollMeanColor(page, LEFT_EDGE, isRed);
        expect(isRed(left)).toBe(true);
    });
});
