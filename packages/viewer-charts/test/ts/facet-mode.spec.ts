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
 * Regression tests for `plugin_config.facet_mode` across chart
 * families.
 *
 * The series family (X Bar / Y Bar / Y Line / Y Scatter / Y Area)
 * defaults to `"overlay"` — the band pipeline's historical split_by
 * rendering — and implements `"grid"` as opt-in small multiples (one
 * facet per split group, per-split stack baselines, shared value
 * axis). The cartesian family defaults to `"grid"` with `"overlay"`
 * opt-in. Treemap / Sunburst do not advertise the field at all.
 *
 * Two failure modes are covered:
 *   1. Reachability — the host schema-filters `plugin_config` on
 *      every write path, so a value only round-trips
 *      `save()`/`restore()` when the chart type advertises the key
 *      AND the value differs from the schema-declared default.
 *   2. Effect — SwiftShader is deterministic, so "config had no
 *      effect" reproduces as byte-equal frames; a real layout change
 *      always shifts the non-background pixel count.
 */

import { expect, test } from "@perspective-dev/test";
import {
    calibratePlotBaseline,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

async function schemaFields(
    page: import("@playwright/test").Page,
): Promise<{ key: string; default?: unknown }[]> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        const plugin = await (viewer as any).getPlugin();
        const schema = plugin.plugin_config_schema?.() ?? { fields: [] };
        return schema.fields.map((f: { key: string; default?: unknown }) => ({
            key: f.key,
            default: f.default,
        }));
    });
}

async function savedPluginConfig(page: import("@playwright/test").Page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        const config = await (viewer as any).save();
        return config.plugin_config ?? {};
    });
}

async function setFacetMode(
    page: import("@playwright/test").Page,
    facet_mode: string,
) {
    await restoreChart(page, { plugin_config: { facet_mode } } as never);
    await waitOneFrame(page);
    await waitOneFrame(page);
}

test.describe("facet_mode", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("Y Line defaults to overlay; grid renders small multiples and round-trips", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Line",
            columns: ["Profit"],
            group_by: ["Order Date"],
            split_by: ["Category"],
        } as never);
        await waitOneFrame(page);

        const facetField = (await schemaFields(page)).find(
            (f) => f.key === "facet_mode",
        );
        expect(facetField).toBeDefined();
        expect(facetField!.default).toEqual("overlay");

        const overlayPixels = await calibratePlotBaseline(page);

        await setFacetMode(page, "grid");
        expect(await savedPluginConfig(page)).toEqual({ facet_mode: "grid" });
        const gridPixels = await calibratePlotBaseline(page);
        expect(gridPixels).not.toEqual(overlayPixels);

        // Explicit default resets the key (empty ⇒ reads-default) and
        // restores the overlay rendering.
        await setFacetMode(page, "overlay");
        expect(await savedPluginConfig(page)).toEqual({});
        expect(await calibratePlotBaseline(page)).toEqual(overlayPixels);
    });

    test("Y Bar grid mode unstacks splits into facets", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category"],
        } as never);
        await waitOneFrame(page);

        const overlayPixels = await calibratePlotBaseline(page);

        await setFacetMode(page, "grid");
        expect(await savedPluginConfig(page)).toEqual({ facet_mode: "grid" });
        expect(await calibratePlotBaseline(page)).not.toEqual(overlayPixels);
    });

    test("X Bar grid mode facets horizontally", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X Bar",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category"],
        } as never);
        await waitOneFrame(page);

        const overlayPixels = await calibratePlotBaseline(page);

        await setFacetMode(page, "grid");
        expect(await savedPluginConfig(page)).toEqual({ facet_mode: "grid" });
        expect(await calibratePlotBaseline(page)).not.toEqual(overlayPixels);
    });

    test("X/Y Scatter defaults to grid; overlay round-trips and re-renders", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Sales", "Profit"],
            split_by: ["Category"],
        } as never);
        await waitOneFrame(page);

        const facetField = (await schemaFields(page)).find(
            (f) => f.key === "facet_mode",
        );
        expect(facetField).toBeDefined();
        expect(facetField!.default).toEqual("grid");

        const gridPixels = await calibratePlotBaseline(page);

        await setFacetMode(page, "overlay");
        expect(await savedPluginConfig(page)).toEqual({
            facet_mode: "overlay",
        });
        expect(await calibratePlotBaseline(page)).not.toEqual(gridPixels);
    });

    test("Treemap and Sunburst do not advertise facet_mode", async ({
        page,
    }) => {
        for (const plugin of ["Treemap", "Sunburst"]) {
            await restoreChart(page, {
                plugin,
                columns: ["Sales"],
                group_by: ["Region"],
                split_by: ["Category"],
            } as never);
            const keys = (await schemaFields(page)).map((f) => f.key);
            expect(keys).not.toContain("facet_mode");
        }
    });
});
