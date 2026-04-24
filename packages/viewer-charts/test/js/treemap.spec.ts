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

test.describe("Treemap", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("basic hierarchy", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Treemap",
            columns: ["Sales"],
            group_by: ["Region", "Category"],
        });
    });

    test("no color slot → single-palette series mode", async ({ page }) => {
        // Regression: when Color is empty, _colorMode is "empty",
        // every leaf gets palette[0], and the legend is suppressed.
        await renderAndCapture(page, {
            plugin: "Treemap",
            columns: ["Sales"],
            group_by: ["Region"],
        });
    });

    test("numeric color → gradient + gradient legend", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Treemap",
            columns: ["Sales", "Profit"],
            group_by: ["Region", "Category"],
        });
    });

    test("string color → series palette + categorical legend", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Treemap",
            columns: ["Sales", "Ship Mode"],
            group_by: ["Region", "Category"],
        });
    });

    test("three-level group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Treemap",
            columns: ["Sales"],
            group_by: ["Region", "Category", "Sub-Category"],
        });
    });
});
