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

// `Order Date` is parsed as `date` in the superstore CSV. To exercise
// the `datetime` axis path (distinct schema type, same numeric code
// path) we materialize a synthetic datetime column via expression.
const DATETIME_EXPR = {
    "Order DT": 'datetime("Quantity" * 86400000)',
};

test.describe("Heatmap", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("basic", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category"],
        });

        await page.pause();
    });

    test("nested group_by rows", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
            split_by: ["Ship Mode"],
        });
    });

    test("diverging data with Profit", async ({ page }) => {
        // Profit crosses zero — the sign-aware gradient should center
        // value=0 on the gradient midpoint.
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Profit"],
            group_by: ["Region"],
            split_by: ["Category"],
        });
    });

    test("multi-faceted", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales", "Profit"],
            group_by: ["Region"],
            split_by: ["Category"],
        });

        await page.pause();
    });

    test("hierarchial X axis", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region", "State"],
            split_by: ["Category"],
        });

        await page.pause();
    });

    test("hierarchial Y axis", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category", "Sub-Category"],
        });

        await page.pause();
    });
});

// Numeric-axis coverage for the heatmap. The X axis sources from
// `__ROW_PATH_0__` (group_by).
test.describe("Heatmap numeric axes", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("integer X axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Quantity"],
            split_by: ["Category"],
        });
    });

    test("datetime X axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Order DT"],
            split_by: ["Category"],
            expressions: DATETIME_EXPR,
        });
    });

    test("integer Y axis as sole split_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Quantity"],
        });
    });

    test("datetime Y axis as sole split_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Order DT"],
            expressions: DATETIME_EXPR,
        });
    });

    test("integer X falls back to categorical with extra group_by level", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region", "Quantity"],
            split_by: ["Category"],
        });
    });

    test("integer Y falls back to categorical with extra split_by level", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Region"],
            split_by: ["Category", "Quantity"],
        });
    });
});
