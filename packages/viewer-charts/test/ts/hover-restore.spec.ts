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
 * Stale-hover-across-restore regression.
 *
 * Hover state (`_hoveredBarIdx` / `_hoveredSample`) indexes into the
 * chart's `_series` / `_bars` build products. A host `restore` that
 * shrinks the series set rebuilds both, but the hover survives until
 * the next mousemove — and bar-column capacity is reused across builds,
 * so a stale bar index reads a leftover `seriesId` past the new series
 * set. The first present after the rebuild then crashes in the canvas-
 * tooltip pass (`buildBarTooltipLines` reads
 * `chart._series[b.seriesId].aggName` → "Cannot read properties of
 * undefined (reading 'aggName')", logged as "scheduler: present
 * failed") whenever the pointer is resting over an upper-stack /
 * non-first-series glyph through the restore.
 *
 * Repro shape: hover a glyph in a many-series config, then — without
 * moving the mouse — restore a single-series config. The hovered
 * position is data-dependent, so each test sweeps a coarse grid of
 * plot positions and performs the shrink-restore at every one; any
 * position that lands on a `seriesId >= 1` glyph reproduces pre-fix.
 *
 * Hard gates: the shrink `restore` must resolve (the scheduler rejects
 * the draw's present waiters on failure) and the chart must still
 * paint afterwards. The console/pageerror capture is best-effort
 * added signal — worker console messages may or may not surface via
 * `page.on("console")`.
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

/** Matches the scheduler's present-failure log and the crash itself. */
const PRESENT_FAILED = /present failed|reading 'aggName'/i;

/**
 * Hover dispatch is RAF-throttled in the worker; 200ms covers the
 * mousemove → hover-state hop reliably under swiftshader (same margin
 * as `tooltip.spec.ts`).
 */
const HOVER_SETTLE_MS = 200;

/**
 * Coarse 3×3 grid over the 1280×720 viewport. Columns straddle the
 * three `Category` band centers; rows cover upper / middle / lower
 * glyph bodies so at least one position lands on a non-first-series
 * glyph regardless of stack heights.
 */
const HOVER_XS = [320, 640, 960];
const HOVER_YS = [216, 396, 576];

function collectPresentErrors(page: Page): string[] {
    const hits: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
        if (PRESENT_FAILED.test(m.text())) {
            hits.push(m.text());
        }
    });

    page.on("pageerror", (e: Error) => {
        if (PRESENT_FAILED.test(String(e))) {
            hits.push(String(e));
        }
    });

    return hits;
}

async function sweepShrinkRestore(
    page: Page,
    manySeries: ViewerConfigUpdate,
    oneSeries: ViewerConfigUpdate,
): Promise<string[]> {
    const errors = collectPresentErrors(page);
    for (const x of HOVER_XS) {
        for (const y of HOVER_YS) {
            await restoreChart(page, manySeries);
            await waitOneFrame(page);
            await page.mouse.move(x, y);
            await page.waitForTimeout(HOVER_SETTLE_MS);

            // The shrink rebuilds `_series` / `_bars` while the pointer
            // rests on the old glyph; pre-fix the scheduler rejects the
            // present waiters and this `restore` throws.
            await restoreChart(page, oneSeries);
            await waitOneFrame(page);
        }
    }

    return errors;
}

test.describe("Hover across shrinking restore", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("stacked bar hover survives restore to fewer series", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        const errors = await sweepShrinkRestore(
            page,
            {
                plugin: "Y Bar",
                columns: ["Sales"],
                group_by: ["Category"],
                split_by: ["Region"],
            },
            {
                plugin: "Y Bar",
                columns: ["Sales"],
                group_by: ["Category"],
                split_by: [],
            },
        );

        expect(errors).toEqual([]);
        expect(await calibratePlotBaseline(page)).toBeGreaterThan(0);
    });

    test("line hover sample survives restore to fewer series", async ({
        page,
    }) => {
        test.setTimeout(120_000);

        // Lines hit-test within a point radius rather than a bar body,
        // so this sweep is best-effort at reproducing pre-fix; dense
        // `State` categories maximize the chance a grid position lands
        // within radius of a `seriesId >= 1` vertex.
        const errors = await sweepShrinkRestore(
            page,
            {
                plugin: "Y Line",
                columns: ["Sales", "Profit", "Quantity"],
                group_by: ["State"],
                split_by: [],
            },
            {
                plugin: "Y Line",
                columns: ["Sales"],
                group_by: ["State"],
                split_by: [],
            },
        );

        expect(errors).toEqual([]);
        expect(await calibratePlotBaseline(page)).toBeGreaterThan(0);
    });
});
