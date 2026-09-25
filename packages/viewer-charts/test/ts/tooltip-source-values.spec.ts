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

import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import { expect, test } from "@perspective-dev/test";
import {
    gotoBasic,
    restoreChart,
    sweepPinnedTooltips,
    tooltipValue,
    viewYearRange,
} from "./helpers";

const DATETIME_X: ViewerConfigUpdate = {
    columns: ["Order Date", "Sales"],
    group_by: [],
    split_by: ["Region"],
    sort: [["Order Date", "asc"]],
} as ViewerConfigUpdate;

const YEAR = /\b(\d{4})\b/;

test.describe("Tooltip source values", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    for (const plugin of ["X/Y Scatter", "X/Y Line"]) {
        test(`${plugin} pins dates and values from the source row`, async ({
            page,
        }) => {
            await restoreChart(page, {
                ...DATETIME_X,
                plugin,
            } as ViewerConfigUpdate);

            const [minYear, maxYear] = await viewYearRange(page, "Order Date");
            expect(minYear).toBeGreaterThan(1970);

            const tooltips = await sweepPinnedTooltips(page);
            expect(tooltips.length).toBeGreaterThan(4);

            for (const cells of tooltips) {
                const date = tooltipValue(cells, "Order Date");
                const sales = tooltipValue(cells, "Sales");
                expect(date).toBeDefined();
                expect(sales).toBeDefined();

                const year = Number(YEAR.exec(date!)?.[1]);
                expect(year).toBeGreaterThanOrEqual(minYear - 1);
                expect(year).toBeLessThanOrEqual(maxYear + 1);
                expect(sales!.startsWith("-")).toBe(false);
            }
        });
    }
});
