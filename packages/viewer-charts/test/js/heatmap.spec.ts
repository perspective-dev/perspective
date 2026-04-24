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
import { gotoBasic, renderAndCapture } from "./helpers";

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
