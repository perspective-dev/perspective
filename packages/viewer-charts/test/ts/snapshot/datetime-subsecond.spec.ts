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

// Sub-second datetime regression coverage. The numeric category axis
// path narrows positions to f32 for GPU upload; with absolute epoch
// timestamps (~1.7e12) and a sub-second window, naive narrowing
// collapses every distinct point onto one of ~5 representable values
// (~262144 ms apart at this magnitude) and the chart renders a single
// stripe — or nothing at all when the projection's `tx` term blows up
// the shader's clip-space cancellation. The fix is twofold:
//
//   1. WASM emits datetime columns as Float64 regardless of the
//      `float32` flag, preserving millisecond precision into JS.
//   2. Each chart subtracts an origin (data min) before f32 narrowing
//      and threads the same origin into `buildProjectionMatrix`, so
//      `tx ≈ 0` and the shader sees rebased values that fit cleanly
//      in f32.
//
// The expression below pins timestamps near 2025-01-01 UTC, scaling
// `Quantity` (1–14) by 200ms to produce 14 distinct buckets across a
// ~2.8s window — well inside the f32 collapse zone for absolute
// epoch-ms.

import { test } from "@perspective-dev/test";
import { gotoBasic, renderAndCapture } from "../helpers";

const SUBSECOND_DATETIME_EXPR = {
    "Order DT Subsecond": 'datetime(1735689600000 + "Quantity" * 200)',
};

test.describe("Sub-second datetime numeric axis", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("Y Bar renders distinct bars across a 2.8s window", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Order DT Subsecond"],
            expressions: SUBSECOND_DATETIME_EXPR,
        });
    });

    test("Y Line traces all sub-second points", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Line",
            columns: ["Sales"],
            group_by: ["Order DT Subsecond"],
            expressions: SUBSECOND_DATETIME_EXPR,
        });
    });

    test("Heatmap fills cells across a sub-second X domain", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Heatmap",
            columns: ["Sales"],
            group_by: ["Order DT Subsecond"],
            split_by: ["Category"],
            expressions: SUBSECOND_DATETIME_EXPR,
        });
    });
});
