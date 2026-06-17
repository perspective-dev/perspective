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
 * Chart-type-switch vertex-attribute bleed (pooled blit).
 *
 * In pooled blit mode many chart types share a small set of GL contexts.
 * Vertex-array state (attribute enables + divisors) is global to a
 * context's default VAO, and glyphs only ever *enable* attribute slots —
 * none disables them. So when one chart type renders and is then torn
 * down (its buffers deleted) and a *different* chart type lands on the
 * same pooled context, the slots the first type left enabled now point
 * at deleted buffers. The new type's `drawArraysInstanced` fails GL
 * validation — `INVALID_OPERATION: no buffer is bound to enabled
 * attribute` — and paints nothing; as more types cycle, more pooled
 * contexts get poisoned and rendering collapses.
 *
 * `WebGLContextManager.beginFrame` resets the shared context's
 * vertex-array state before each pooled render, which fixes this. The
 * test cycles every chart type (twice, so the K pooled contexts are each
 * reused by a different chart program) and asserts every type renders
 * after its switch — and that no attribute-bleed GL error fired.
 *
 * Requires a build with the pooling changes + the fix. `setBlitMode` is
 * the process-global static, so flipping it once puts every chart-type
 * plugin into pooled blit.
 */

import type { ConsoleMessage, Page } from "@playwright/test";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import { expect, test } from "@perspective-dev/test";
import {
    calibratePlotBaseline,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

/**
 * Glyph-dense configs spanning distinct instanced-attribute layouts
 * (points / lines / bars / heatmap), so consecutive switches produce the
 * high-attribute-count → low-attribute-count transition that leaves a
 * slot enabled across charts. Mirrors `frame-timing.spec.ts`'s set.
 */
const FIXTURES: { name: string; config: ViewerConfigUpdate }[] = [
    {
        name: "X/Y Scatter",
        config: { plugin: "X/Y Scatter", columns: ["Quantity", "Postal Code"] },
    },
    { name: "Y Line", config: { plugin: "Y Line", columns: ["Profit"] } },
    { name: "Y Area", config: { plugin: "Y Area", columns: ["Profit"] } },
    {
        name: "Y Bar",
        config: { plugin: "Y Bar", group_by: ["State"], columns: ["Profit"] },
    },
    {
        name: "X Bar",
        config: { plugin: "X Bar", group_by: ["State"], columns: ["Profit"] },
    },
    {
        name: "Heatmap",
        config: {
            plugin: "Heatmap",
            group_by: ["State"],
            split_by: ["Region"],
            columns: ["Profit"],
        },
    },
];

/**
 * The precise GL validation failure the bug raises. Best-effort: browser
 * GL warnings from the worker may or may not surface via
 * `page.on("console")`, so the per-type render assertion below is the
 * hard gate; this just adds signal when the message is captured.
 */
const ATTR_BLEED = /no buffer is bound to enabled attribute|INVALID_OPERATION/i;

function collectAttrErrors(page: Page): string[] {
    const hits: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
        if (ATTR_BLEED.test(m.text())) {
            hits.push(m.text());
        }
    });

    page.on("pageerror", (e: Error) => {
        if (ATTR_BLEED.test(String(e))) {
            hits.push(String(e));
        }
    });

    return hits;
}

test.describe("Chart-type switch (pooled blit)", () => {
    test("cycling every chart type never bleeds vertex-attribute state", async ({
        page,
    }) => {
        test.setTimeout(180_000);
        await gotoBasic(page);
        const attrErrors = collectAttrErrors(page);

        // Flip the whole renderer into pooled blit once, via the global
        // static setter (reached through the activated plugin's
        // constructor), then tear that renderer down so the cycle below
        // rebuilds it pooled.
        await restoreChart(page, FIXTURES[0].config);
        await page.evaluate(() => {
            const plugin = (
                document.querySelector("perspective-viewer") as any
            ).getPlugin();
            plugin.constructor.setBlitMode("blit");
            plugin.delete();
        });

        // Two passes over the type list. With a pool of K contexts,
        // round-robin sticky assignment means types K+1, K+2, … reuse a
        // context a different type already rendered on — the exact
        // condition that surfaces leftover-enabled attributes.
        const order = [...FIXTURES, ...FIXTURES];
        const results: { name: string; pixels: number }[] = [];
        for (const fx of order) {
            await restoreChart(page, fx.config);
            await waitOneFrame(page);
            const pixels = await calibratePlotBaseline(page);
            results.push({ name: fx.name, pixels });
        }

        // Every chart type must have rendered after its switch. A type
        // that landed on a poisoned pooled context fails
        // `drawArraysInstanced` and paints nothing — its plot-pixel
        // count collapses to ~0. This is the deterministic, capture-
        // independent signal.
        for (const r of results) {
            expect(
                r.pixels,
                `${r.name} rendered ${r.pixels} plot pixels after switch — ` +
                    `likely an attribute-bleed draw failure on a shared context`,
            ).toBeGreaterThan(0);
        }

        expect(attrErrors).toEqual([]);
    });
});
