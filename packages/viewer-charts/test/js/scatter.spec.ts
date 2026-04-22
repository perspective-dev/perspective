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

test.describe("X/Y Scatter", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("basic x/y", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "X/Y Scatter",
                columns: ["Quantity", "Profit"],
            },
            "basic.png",
        );
    });

    test("with numeric color", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "X/Y Scatter",
                columns: ["Quantity", "Profit", "Sales"],
            },
            "color-numeric.png",
        );
    });

    test("with string color", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "X/Y Scatter",
                columns: ["Quantity", "Profit", "Category"],
            },
            "color-string.png",
        );
    });

    test("with size column", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "X/Y Scatter",
                columns: ["Quantity", "Profit", null, "Sales"],
            },
            "size.png",
        );
    });

    test("split_by produces distinct series", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "X/Y Scatter",
                columns: ["Quantity", "Profit"],
                split_by: ["Category"],
            },
            "split_by.png",
        );
    });

    test("group_by aggregates points", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "X/Y Scatter",
                columns: ["Quantity", "Profit"],
                group_by: ["State"],
            },
            "group_by.png",
        );
    });

    test("date X axis", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "X/Y Scatter",
                columns: ["Order Date", "Profit"],
            },
            "date-x-axis.png",
        );
    });
});
