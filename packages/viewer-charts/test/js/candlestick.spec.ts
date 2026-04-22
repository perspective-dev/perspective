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

test.describe("Y Candlestick", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("open-only falls back to next-row open for close", async ({
        page,
    }) => {
        // Exercises the d3fc-inherited fallback path: close = next row's
        // open; high = max(open, close); low = min(open, close).
        await renderAndCapture(
            page,
            {
                plugin: "Candlestick",
                columns: ["Sales"],
                group_by: ["Order Date"],
            },
            "open-only.png",
        );
    });

    test("full OHLC four-column layout", async ({ page }) => {
        await renderAndCapture(
            page,
            {
                plugin: "Candlestick",
                columns: ["Sales", "Profit", "Quantity", "Discount"],
                group_by: ["Order Date"],
            },
            "full-ohlc.png",
        );
    });

    test("up/down colors sampled from gradient extremes", async ({ page }) => {
        // With Profit as Close and Sales as Open, positive Profit rows
        // (Close > Open) render at the gradient top; negative rows at
        // the bottom. Pins the bichromatic rendering.
        await renderAndCapture(
            page,
            {
                plugin: "Candlestick",
                columns: ["Sales", "Profit"],
                group_by: ["Category"],
            },
            "up-down-colors.png",
        );
    });

    test("with split_by — side-by-side candles per category", async ({
        page,
    }) => {
        await renderAndCapture(
            page,
            {
                plugin: "Candlestick",
                columns: ["Sales"],
                group_by: ["Category"],
                split_by: ["Region"],
            },
            "split_by.png",
        );
    });
});
