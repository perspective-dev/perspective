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
 * `alt_axis` primary-domain regressions (.plan/ALT_AXIS_DOMAIN_PLAN.md).
 *
 * Two independent bugs share one symptom fixture — a tiny column
 * (`Discount`, sums to single digits per Category) next to a huge one
 * (`Sales`, sums to ~10K) with `Sales` pinned to the alt axis:
 *
 *  A. `domain_mode` defaults to `"expand"`, and its accumulators were
 *     keyed by axis SIDE only. A `columns_config`-only change arrives
 *     as `plugin.update()` (no `resetExpandedDomain`), so after pinning
 *     `Sales` to alt the primary accumulator retained Sales's extent —
 *     the primary axis never excluded the departed column and the
 *     Discount bars rendered invisibly small. Fixed by the per-aggregate
 *     axis-partition signature on the accumulators.
 *
 *  B. A one-shot `restore` (`columns` + `columns_config` together)
 *     dropped `columns_config` entirely: the host calls
 *     `plugin.restore` before the first draw builds the renderer, and
 *     the old forwarding was `this._renderer?.setColumnsConfig(...)` —
 *     a silent no-op pre-renderer. Fixed by storing `_columnsConfig`
 *     on the element and shipping it in the `InitMsg` handshake.
 *
 * Assertions are reference-normalized plot-pixel counts: the two-step
 * `domain_mode: "fit"` flow renders this fixture CORRECTLY on both
 * sides of the fixes (verified by screenshot 2026-08-01), so each test
 * demands its variant paint approximately as many plot pixels as that
 * reference. Both bugs cut the visible glyph area roughly in half
 * (Discount bars collapse to invisibility), far outside the tolerance.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import { calibratePlotBaseline, gotoBasic, restoreChart } from "./helpers";

const ALT_ON_SALES = { Sales: { alt_axis: true } };

const BASE_CONFIG = {
    plugin: "Y Bar",
    columns: ["Discount", "Sales"],
    group_by: ["Category"],
};

/** Settle a restore's async draw before sampling pixels. */
const SETTLE_MS = 500;

/**
 * The known-good render of the fixture: draw WITHOUT alt, flip
 * `alt_axis` via a second restore, under `domain_mode: "fit"` so no
 * accumulator is involved. Returns its plot-pixel count.
 */
async function referencePixels(page: Page): Promise<number> {
    await gotoBasic(page);
    await restoreChart(page, {
        ...BASE_CONFIG,
        plugin_config: { domain_mode: "fit" },
    } as never);
    await page.waitForTimeout(SETTLE_MS);
    await restoreChart(page, { columns_config: ALT_ON_SALES } as never);
    await page.waitForTimeout(SETTLE_MS);
    return await calibratePlotBaseline(page);
}

function expectNearReference(actual: number, reference: number): void {
    expect(actual).toBeGreaterThan(reference * 0.7);
    expect(actual).toBeLessThan(reference * 1.3);
}

test.describe("alt_axis primary-domain exclusion", () => {
    test("one-shot restore honors columns_config alt_axis", async ({
        page,
    }) => {
        const reference = await referencePixels(page);

        // Fresh page: single restore carrying columns + columns_config
        // together, exactly as a saved workspace loads. Pre-fix B the
        // per-column config never reached the worker — no alt axis,
        // Discount invisible under Sales's unioned domain.
        await gotoBasic(page);
        await restoreChart(page, {
            ...BASE_CONFIG,
            columns_config: ALT_ON_SALES,
        } as never);
        await page.waitForTimeout(SETTLE_MS);

        expectNearReference(await calibratePlotBaseline(page), reference);
    });

    test("alt_axis flip refits primary under default domain_mode", async ({
        page,
    }) => {
        const reference = await referencePixels(page);

        // Fresh page: same two-step flow as the reference but under the
        // DEFAULT `domain_mode: "expand"`. Pre-fix A the primary
        // accumulator retained Sales's pre-flip extent, so Discount
        // stayed invisible even though the alt axis was correct.
        await gotoBasic(page);
        await restoreChart(page, BASE_CONFIG as never);
        await page.waitForTimeout(SETTLE_MS);
        await restoreChart(page, { columns_config: ALT_ON_SALES } as never);
        await page.waitForTimeout(SETTLE_MS);

        expectNearReference(await calibratePlotBaseline(page), reference);
    });

    test("same-partition restore keeps the render stable", async ({ page }) => {
        // Guard against an over-eager signature: re-sending an
        // IDENTICAL columns_config must not perturb the render (the
        // signature matches, the accumulators survive, domains are
        // unchanged).
        const reference = await referencePixels(page);

        await gotoBasic(page);
        await restoreChart(page, BASE_CONFIG as never);
        await page.waitForTimeout(SETTLE_MS);
        await restoreChart(page, { columns_config: ALT_ON_SALES } as never);
        await page.waitForTimeout(SETTLE_MS);
        const before = await calibratePlotBaseline(page);

        await restoreChart(page, { columns_config: ALT_ON_SALES } as never);
        await page.waitForTimeout(SETTLE_MS);
        const after = await calibratePlotBaseline(page);

        expect(after).toBeGreaterThan(before * 0.95);
        expect(after).toBeLessThan(before * 1.05);
        expectNearReference(after, reference);
    });
});
