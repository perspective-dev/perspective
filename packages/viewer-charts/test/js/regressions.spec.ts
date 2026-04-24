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
 * Pinned screenshots for every rendering regression we've shipped a fix
 * for. These exist so the bug can't silently come back without
 * snapshot diff lighting up in CI.
 */

import { test } from "@perspective-dev/test";
import { gotoBasic, renderAndCapture } from "./helpers";

test.describe("Regressions", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    // ── split_by series correctness ─────────────────────────────────────
    // Bug: the point/line glyph's draw count used
    // `numSeries * maxSeriesUploaded` which is correct only for a packed
    // buffer layout. With the slotted layout series 1..N live at
    // `s * seriesCapacity` — far beyond the draw range — so only series 0
    // rendered. Fix: draw count is `numSeries * seriesCapacity` with
    // sentinel discard in the shader.
    test("scatter split_by renders every series", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit"],
            split_by: ["Region"],
        });
    });

    test("line split_by renders every series", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X/Y Line",
            columns: ["Order Date", "Profit"],
            group_by: ["Order Date"],
            split_by: ["Region"],
        });
    });

    // ── scatter categorical colors match legend ─────────────────────────
    // Bug: the scatter vertex shader used a sign-aware color-t mapping
    // that folded non-negative domains into the top half of the
    // gradient, so split indices `0..N-1` mapped to `[0.5, 1]` while the
    // legend sampled evenly across `[0, 1]`. Fix: shader uses linear
    // mapping for single-sign domains; sign-aware only when crossing 0.
    test("scatter string color matches legend swatches", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X/Y Scatter",
            columns: ["Quantity", "Profit", "Category"],
        });
    });

    // ── Y Line shows series colors (not all-black) ──────────────────────
    // Bug: after refactoring the line shader to read color from a
    // gradient LUT + varying, bar/glyphs/draw-lines.ts was still wiring
    // up the old `u_color` uniform and never bound the LUT — every
    // fragment fetched `(0, 0, 0, 1)`. Fix: dedicated uniform-color
    // shader pair (line-uniform.vert/frag.glsl) for the bar line glyph.
    test("Y Line shows series palette colors", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Line",
            columns: ["Sales"],
            group_by: ["Category"],
            split_by: ["Region"],
        });
    });

    // ── Treemap transparent background ──────────────────────────────────
    // Bug: treemap cleared WebGL to a dimmed gridline color instead of
    // transparent, so themed hosts got an opaque backdrop under the
    // chart.
    test("Treemap background is transparent", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Treemap",
            columns: ["Sales"],
            group_by: ["Region"],
        });
    });

    // ── Treemap color-mode: date/datetime → numeric gradient ────────────
    // Bug: `_colorMode` detection read `ColumnData.type` (runtime storage
    // type "float32"/"int32"/"string") instead of the view-typed schema
    // type. Date and datetime columns were incorrectly classified as
    // "series" instead of "numeric". Fix: use `_columnTypes` (view types
    // `float`/`integer`/`date`/`datetime`) with explicit numeric list.
    test("Treemap with date Color uses gradient mode", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Treemap",
            columns: ["Sales", "Order Date"],
            group_by: ["Region", "Category"],
        });
    });
});
