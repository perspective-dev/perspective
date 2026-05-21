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

import { test } from "@perspective-dev/test";
import { gotoBasic, renderAndCapture } from "../helpers";

test.describe("Sunburst", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("basic hierarchy", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
        });
    });

    test("no color slot → single-palette series mode", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales"],
            group_by: ["Region"],
        });
    });

    test("numeric color → gradient", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales", "Profit"],
            group_by: ["Region", "Category"],
        });
    });

    test("string color → series palette", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales", "Ship Mode"],
            group_by: ["Region", "Category"],
        });
    });

    test("three-level group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales"],
            group_by: ["Region", "Category", "Sub-Category"],
        });
    });

    // `split_by` activates the facet grid: one sunburst per split value,
    // each with its own center / radius / drill root.
    test("faceted by split_by — labels per facet", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            split_by: ["Ship Mode"],
        });
    });

    test("faceted with numeric color gradient", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales", "Profit"],
            group_by: ["Region", "Category"],
            split_by: ["Ship Mode"],
        });
    });

    // Regression: with `split_by` populated but `group_by` empty,
    // `processTreeChunk` synthesizes a `[prefix, "Row N"]` path per
    // row. Before the fix at `tree-data.ts`, `effectiveGroupLen`
    // resolved to `1` against that depth-2 path, so the leaf size
    // store was silently skipped and every node ended up with size 0
    // — sunburst computed zero-width arcs and rendered an empty plot.
    test("split_by only, no group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales"],
            split_by: ["Ship Mode"],
        });
    });

    test("split_by + string color, no group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales", "Region"],
            split_by: ["Ship Mode"],
        });
    });

    test("split_by + numeric color, no group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Sunburst",
            columns: ["Sales", "Profit"],
            split_by: ["Ship Mode"],
        });
    });
});
