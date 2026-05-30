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

test.describe("Categorical value axis", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    // X/Y Scatter with a `string` X column — the X column type triggers
    // categorical-X dispatch in `cartesian-build` / `cartesian-render`.
    // Y stays numeric.
    test("cartesian categorical X", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X/Y Scatter",
            columns: ["Category", "Profit"],
        });
    });

    // Mirror of the above with the `string` column on Y instead.
    test("cartesian categorical Y", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X/Y Scatter",
            columns: ["Profit", "Category"],
        });
    });

    // Both X and Y are `string`-typed: build pipeline writes slot
    // indices into both axes, render pass dispatches the categorical
    // painter on both sides. Per the locked decision, points stack at
    // each (catX, catY) cell center — no jitter / no aggregation.
    test("cartesian categorical X and Y", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X/Y Scatter",
            columns: ["Category", "Region"],
        });
    });

    // Y Bar with a string-typed value aggregate (`last(Category)`):
    // `_leftValueAxisMode` switches to `"category"`, bar `y0`/`y1`
    // carry dictionary slot indices, and the value-axis chrome paints
    // the categorical Y axis via the broadened `renderBarAxesChrome`.
    test("y-bar categorical value axis", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Category"],
            group_by: ["State"],
            aggregates: { Category: "last" },
        });
    });

    // X Bar mirror: categorical value axis lands on the bottom (X)
    // side and the chart uses the horizontal projection. Verifies the
    // `_isHorizontal` branch of `renderBarAxesChrome` dispatches the
    // value side correctly.
    test("x-bar categorical value axis", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X Bar",
            columns: ["Category"],
            group_by: ["State"],
            aggregates: { Category: "last" },
        });
    });
});
