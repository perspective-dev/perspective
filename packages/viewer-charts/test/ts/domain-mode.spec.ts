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
import { test, expect } from "@perspective-dev/test";
import {
    calibratePlotBaseline,
    gotoBasic,
    restoreChart,
    waitOneFrame,
    type PlotRegionFrac,
} from "./helpers";

/** Canvas-fraction regions safely inside the plot rect (clear of the
 *  ~70px left gutter and bottom axis band at the 1280×720 viewport). */
const RIGHT: PlotRegionFrac = { x: 0.6, y: 0.15, w: 0.3, h: 0.6 };
const TOP: PlotRegionFrac = { x: 0.15, y: 0.03, w: 0.7, h: 0.2 };
const BOTTOM: PlotRegionFrac = { x: 0.15, y: 0.55, w: 0.7, h: 0.25 };

const EMPTY_MAX = 20;
const POPULATED_MIN = 100;

/**
 * Sample `region` until `pred(pixels)` holds (the debounced update-redraw
 * has landed) or the timeout elapses; returns the last sample either way
 * so the caller's assertion reports the real value.
 */
async function pollPixels(
    page: Page,
    region: PlotRegionFrac,
    pred: (n: number) => boolean,
    timeoutMs = 8000,
): Promise<number> {
    const start = Date.now();
    let last = -1;
    for (;;) {
        last = await calibratePlotBaseline(page, { plotRegionFrac: region });
        if (pred(last) || Date.now() - start > timeoutMs) {
            return last;
        }

        await page.waitForTimeout(100);
    }
}

/** Remove every row whose `Order Date` is later than the `keepDistinct`th
 *  distinct date — shrinks the datetime category domain to a narrow
 *  leading window. */
async function removeLaterDates(page: Page, keepDistinct: number) {
    await page.evaluate(async (keep: number) => {
        const worker = (window as any).__TEST_WORKER__;
        const table = await worker.open_table("load-viewer-csv");
        const view = await table.view({ columns: ["Row ID", "Order Date"] });
        const cols = await view.to_columns();
        await view.delete();
        const dates = Array.from(new Set(cols["Order Date"] as number[])).sort(
            (a, b) => a - b,
        );
        const cutoff = dates[Math.min(keep, dates.length - 1)];
        const remove = [];
        for (let i = 0; i < cols["Row ID"].length; i++) {
            if (cols["Order Date"][i] > cutoff) {
                remove.push(cols["Row ID"][i]);
            }
        }

        await table.remove(remove);
    }, keepDistinct);
}

/** Remove every row where `|column| > maxAbs` — collapses the value
 *  extent to a narrow band around zero. */
async function removeExtremes(page: Page, column: string, maxAbs: number) {
    await page.evaluate(
        async ({ column, maxAbs }: { column: string; maxAbs: number }) => {
            const worker = (window as any).__TEST_WORKER__;
            const table = await worker.open_table("load-viewer-csv");
            const view = await table.view({ columns: ["Row ID", column] });
            const cols = await view.to_columns();
            await view.delete();
            const remove = [];
            for (let i = 0; i < cols["Row ID"].length; i++) {
                if (Math.abs(cols[column][i]) > maxAbs) {
                    remove.push(cols["Row ID"][i]);
                }
            }

            await table.remove(remove);
        },
        { column, maxAbs },
    );
}

/**
 * Replace the fixture table's rows IN PLACE (remove all + `update`) with a
 * controlled shape. The retention scenarios sample fixed canvas bands, and
 * the shared 99-row fixture defeats them as-is: its Profit domain
 * (`[-1665, +299]`) is so asymmetric that zero sits INSIDE the top band (a
 * correctly-RETAINED axis then keeps the band populated), and its 2
 * high-`Sales` points miss the right band entirely. Reshaping — rather
 * than loading a second table — keeps the panel bound to the same table
 * and schema, so the scenario drives only the update-redraw path.
 */
async function reshapeFixture(
    page: Page,
    rows: { "Order Date": string; Profit: number; Sales: number }[],
) {
    await page.evaluate(async (rows) => {
        const worker = (window as any).__TEST_WORKER__;
        const table = await worker.open_table("load-viewer-csv");
        const view = await table.view({ columns: ["Row ID"] });
        const cols = await view.to_columns();
        await view.delete();
        await table.remove(cols["Row ID"]);
        await table.update({
            "Row ID": rows.map((_, i) => 100000 + i),
            "Order Date": rows.map((r) => r["Order Date"]),
            Profit: rows.map((r) => r.Profit),
            Sales: rows.map((r) => r.Sales),
        });
    }, rows);
}

/** `count` consecutive days from 2020-01-01, as `YYYY-MM-DD`. */
function dates(count: number): string[] {
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(2020, 0, 1 + i));
        return d.toISOString().slice(0, 10);
    });
}

test.describe("domain_mode axis scope", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("Y Line: the datetime category axis fits after rows depart", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "Y Line",
            columns: ["Profit"],
            group_by: ["Order Date"],
        } as never);
        await waitOneFrame(page);

        expect(
            await pollPixels(page, RIGHT, (n) => n > POPULATED_MIN),
        ).toBeGreaterThan(POPULATED_MIN);

        await removeLaterDates(page, 30);
        expect(
            await pollPixels(page, RIGHT, (n) => n > POPULATED_MIN),
        ).toBeGreaterThan(POPULATED_MIN);
    });

    test("Y Line: the value axis retains its extent under expand, refits under fit", async ({
        page,
    }) => {
        await reshapeFixture(
            page,
            dates(40).map((d, i) => ({
                "Order Date": d,
                Profit:
                    i === 19 ? 1000 : i === 20 ? -1000 : i % 2 === 0 ? 10 : -10,
                Sales: 1,
            })),
        );

        await restoreChart(page, {
            plugin: "Y Line",
            columns: ["Profit"],
            group_by: ["Order Date"],
        } as never);
        await waitOneFrame(page);

        expect(
            await pollPixels(page, TOP, (n) => n > EMPTY_MAX),
        ).toBeGreaterThan(EMPTY_MAX);

        await removeExtremes(page, "Profit", 20);
        expect(await pollPixels(page, TOP, (n) => n < EMPTY_MAX)).toBeLessThan(
            EMPTY_MAX,
        );

        await restoreChart(page, {
            plugin_config: { domain_mode: "fit" },
        } as never);
        expect(
            await pollPixels(page, TOP, (n) => n > EMPTY_MAX),
        ).toBeGreaterThan(EMPTY_MAX);
    });

    test("X Bar: the category axis (Y) fits after rows depart", async ({
        page,
    }) => {
        await restoreChart(page, {
            plugin: "X Bar",
            columns: ["Profit"],
            group_by: ["Order Date"],
        } as never);
        await waitOneFrame(page);

        expect(
            await pollPixels(page, BOTTOM, (n) => n > POPULATED_MIN),
        ).toBeGreaterThan(POPULATED_MIN);

        await removeLaterDates(page, 30);
        expect(
            await pollPixels(page, BOTTOM, (n) => n > POPULATED_MIN),
        ).toBeGreaterThan(POPULATED_MIN);
    });

    test("X/Y Scatter: BOTH axes retain their extent under expand", async ({
        page,
    }) => {
        await reshapeFixture(
            page,
            dates(40).map((d, i) => ({
                "Order Date": d,
                Profit: i === 2 ? 500 : i === 4 ? -500 : 0,
                Sales: i * 25,
            })),
        );

        await restoreChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Sales", "Profit"],
        } as never);
        await waitOneFrame(page);

        expect(
            await pollPixels(page, RIGHT, (n) => n > EMPTY_MAX),
        ).toBeGreaterThan(EMPTY_MAX);

        await removeExtremes(page, "Sales", 500);
        expect(
            await pollPixels(page, RIGHT, (n) => n < EMPTY_MAX),
        ).toBeLessThan(EMPTY_MAX);

        await restoreChart(page, {
            plugin_config: { domain_mode: "fit" },
        } as never);

        expect(
            await pollPixels(page, RIGHT, (n) => n > EMPTY_MAX),
        ).toBeGreaterThan(EMPTY_MAX);
    });
});
