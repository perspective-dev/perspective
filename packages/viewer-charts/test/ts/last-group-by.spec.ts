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
import {
    calibratePlotBaseline,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

type Page = import("@playwright/test").Page;

async function schemaField(page: Page, key: string) {
    return await page.evaluate(async (key) => {
        const viewer = document.querySelector("perspective-viewer")!;
        const plugin = await (viewer as any).getPlugin();
        const schema = plugin.plugin_config_schema?.({}) ?? { fields: [] };
        const flat: any[] = [];
        const walk = (fields: any[]) => {
            for (const f of fields) {
                if (f.kind === "Group") {
                    walk(f.fields);
                } else {
                    flat.push(f);
                }
            }
        };

        walk(schema.fields);
        return flat.find((f) => f.key === key) ?? null;
    }, key);
}

async function savedPluginConfig(page: Page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        return ((await (viewer as any).save()) as any).plugin_config ?? {};
    });
}

async function restoreError(page: Page, config: Record<string, unknown>) {
    return await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")!;
        try {
            await (viewer as any).restore(config);
            return null;
        } catch (e: any) {
            return e.message ?? String(e);
        }
    }, config);
}

async function settle(page: Page) {
    await waitOneFrame(page);
    await waitOneFrame(page);
}

test.describe("facet_mode last_group_by", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    for (const plugin of ["Y Bar", "X Bar", "Y Line", "Y Area"]) {
        test(`${plugin}: last_group_by_overlay matches the split_by rendering`, async ({
            page,
        }) => {
            await restoreChart(page, {
                plugin,
                columns: ["Sales"],
                group_by: ["Region"],
                split_by: ["Category"],
            } as never);
            await settle(page);
            const reference = await calibratePlotBaseline(page);

            await restoreChart(page, {
                plugin,
                columns: ["Sales"],
                group_by: ["Region", "Category"],
                split_by: [],
                plugin_config: { facet_mode: "last_group_by_overlay" },
            } as never);
            await settle(page);

            expect(await calibratePlotBaseline(page)).toEqual(reference);
        });
    }

    test("last_group_by_overlay with split_by matches a two-column split_by overlay", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Segment", "Category"],
            plugin_config: { facet_mode: "overlay" },
        } as never);
        await settle(page);
        const reference = await calibratePlotBaseline(page);

        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            split_by: ["Segment"],
            plugin_config: { facet_mode: "last_group_by_overlay" },
        } as never);
        await settle(page);

        expect(await calibratePlotBaseline(page)).toEqual(reference);
    });

    test("last_group_by_grid with split_by facets by split_by", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            split_by: ["Segment"],
            plugin_config: { facet_mode: "grid" },
        } as never);
        await settle(page);
        const nestedFacets = await calibratePlotBaseline(page);

        await restoreChart(page, {
            plugin_config: { facet_mode: "last_group_by_grid" },
        } as never);
        await settle(page);
        const regrouped = await calibratePlotBaseline(page);
        expect(regrouped).toBeGreaterThan(0);
        expect(regrouped).not.toEqual(nestedFacets);

        await restoreChart(page, {
            plugin_config: { facet_mode: "last_group_by_overlay" },
        } as never);
        await settle(page);
        expect(await calibratePlotBaseline(page)).not.toEqual(regrouped);
    });

    test("last_group_by_grid matches the split_by grid rendering", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category"],
            plugin_config: { facet_mode: "grid" },
        } as never);
        await settle(page);
        const reference = await calibratePlotBaseline(page);

        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            split_by: [],
            plugin_config: { facet_mode: "last_group_by_grid" },
        } as never);
        await settle(page);

        expect(await calibratePlotBaseline(page)).toEqual(reference);
    });

    test("without split_by the grid variant facets by the last level", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            plugin_config: { facet_mode: "last_group_by_overlay" },
        } as never);
        await settle(page);
        const overlay = await calibratePlotBaseline(page);

        await restoreChart(page, {
            plugin_config: { facet_mode: "last_group_by_grid" },
        } as never);
        await settle(page);

        expect(await calibratePlotBaseline(page)).not.toEqual(overlay);
    });

    test("resetting facet_mode restores the nested group_by rendering", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
        } as never);
        await settle(page);
        const nested = await calibratePlotBaseline(page);

        await restoreChart(page, {
            plugin_config: { facet_mode: "last_group_by_overlay" },
        } as never);
        await settle(page);
        expect(await savedPluginConfig(page)).toEqual({
            facet_mode: "last_group_by_overlay",
        });

        expect(await calibratePlotBaseline(page)).not.toEqual(nested);

        await restoreChart(page, {
            plugin_config: { facet_mode: "overlay" },
        } as never);
        await settle(page);
        expect(await savedPluginConfig(page)).toEqual({});
        expect(await calibratePlotBaseline(page)).toEqual(nested);
    });

    test("a single group_by level renders as the plain chart", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region"],
        } as never);
        await settle(page);
        const plain = await calibratePlotBaseline(page);

        await restoreChart(page, {
            plugin_config: { facet_mode: "last_group_by_overlay" },
        } as never);
        await settle(page);

        expect(await calibratePlotBaseline(page)).toEqual(plain);
    });

    test("series charts offer the last_group_by variants", async ({ page }) => {
        await restoreChart(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
        } as never);
        await settle(page);

        const facet = await schemaField(page, "facet_mode");
        expect(facet.default).toEqual("overlay");
        expect(facet.variants.map((v: any) => v.value)).toEqual([
            "grid",
            "overlay",
            "last_group_by_grid",
            "last_group_by_overlay",
        ]);
    });

    test("cartesian charts offer only grid and overlay", async ({ page }) => {
        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Sales", "Profit"],
        } as never);
        await settle(page);

        const facet = await schemaField(page, "facet_mode");
        expect(facet.default).toEqual("grid");
        expect(facet.variants.map((v: any) => v.value)).toEqual([
            "grid",
            "overlay",
        ]);

        const error = await restoreError(page, {
            plugin_config: { facet_mode: "last_group_by_grid" },
        });

        expect(error).toContain("Invalid `plugin_config.facet_mode`");
    });
});
