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
        await gotoBasic(page);
        await restoreChart(page, BASE_CONFIG as never);
        await page.waitForTimeout(SETTLE_MS);
        await restoreChart(page, { columns_config: ALT_ON_SALES } as never);
        await page.waitForTimeout(SETTLE_MS);
        expectNearReference(await calibratePlotBaseline(page), reference);
    });

    test("same-partition restore keeps the render stable", async ({ page }) => {
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
