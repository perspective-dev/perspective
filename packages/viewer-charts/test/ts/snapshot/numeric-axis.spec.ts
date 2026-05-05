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

// Coverage for the numeric-axis path on the bar family. A non-string
// single `group_by` level (date / datetime / integer / float) should
// render as a numeric axis on the categorical side; multi-level
// group_bys with a non-string leaf fall back to a stringified
// hierarchical category axis.

import { test } from "@perspective-dev/test";
import { gotoBasic, renderAndCapture } from "../helpers";

// `Order Date` is parsed as `date` in the superstore CSV. To exercise
// the `datetime` axis path (distinct schema type, same numeric code
// path) we materialize a synthetic datetime column via expression:
// `Quantity` ranges 1–14, scaled to ms-into-1970 gives a small datetime
// spread that fits cleanly on a single axis.
const DATETIME_EXPR = {
    "Order DT": 'datetime("Quantity" * 86400000)',
};

test.describe("Numeric category axis (Y Bar)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("date axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Order Date"],
        });
    });

    test("datetime axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Order DT"],
            expressions: DATETIME_EXPR,
        });
    });

    test("integer axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Quantity"],
        });
    });

    test("float axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Discount"],
        });
    });

    test("integer last but not only group_by stays categorical", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Quantity"],
        });
    });

    test("float last but not only group_by stays categorical", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Discount"],
        });
    });

    test("datetime last but not only group_by stays categorical", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "Y Bar",
            columns: ["Sales"],
            group_by: ["Region", "Order DT"],
            expressions: DATETIME_EXPR,
        });
    });
});

test.describe("Numeric category axis (X Bar)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("date axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X Bar",
            columns: ["Sales"],
            group_by: ["Order Date"],
        });
    });

    test("datetime axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X Bar",
            columns: ["Sales"],
            group_by: ["Order DT"],
            expressions: DATETIME_EXPR,
        });
    });

    test("integer axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X Bar",
            columns: ["Sales"],
            group_by: ["Quantity"],
        });
    });

    test("float axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "X Bar",
            columns: ["Sales"],
            group_by: ["Discount"],
        });
    });

    test("integer last but not only group_by stays categorical", async ({
        page,
    }) => {
        await renderAndCapture(page, {
            plugin: "X Bar",
            columns: ["Sales"],
            group_by: ["Region", "Quantity"],
        });
    });
});

test.describe("Numeric category axis (Y Line)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("date axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Line",
            columns: ["Sales"],
            group_by: ["Order Date"],
        });
    });

    test("integer axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Line",
            columns: ["Sales"],
            group_by: ["Quantity"],
        });
    });

    test("float axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Line",
            columns: ["Sales"],
            group_by: ["Discount"],
        });
    });
});

test.describe("Numeric category axis (Y Scatter)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("date axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Scatter",
            columns: ["Sales"],
            group_by: ["Order Date"],
        });
    });

    test("integer axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Scatter",
            columns: ["Sales"],
            group_by: ["Quantity"],
        });
    });

    test("float axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Scatter",
            columns: ["Sales"],
            group_by: ["Discount"],
        });
    });
});

test.describe("Numeric category axis (Y Area)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    test("date axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Area",
            columns: ["Sales"],
            group_by: ["Order Date"],
        });
    });

    test("integer axis as sole group_by", async ({ page }) => {
        await renderAndCapture(page, {
            plugin: "Y Area",
            columns: ["Sales"],
            group_by: ["Quantity"],
        });
    });
});
