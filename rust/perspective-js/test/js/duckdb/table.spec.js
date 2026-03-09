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

import { test, expect } from "@perspective-dev/test";
import { describeDuckDB } from "./setup.js";

describeDuckDB("table", (getClient) => {
    test("schema()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const schema = await table.schema();
        expect(schema).toEqual({
            "Product Name": "string",
            "Ship Date": "date",
            City: "string",
            "Row ID": "integer",
            "Customer Name": "string",
            Quantity: "integer",
            Discount: "float",
            "Sub-Category": "string",
            Segment: "string",
            Category: "string",
            "Order Date": "date",
            "Order ID": "string",
            Sales: "float",
            State: "string",
            "Postal Code": "float",
            Country: "string",
            "Customer ID": "string",
            "Ship Mode": "string",
            Region: "string",
            Profit: "float",
            "Product ID": "string",
        });
    });

    test("columns()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const columns = await table.columns();
        expect(columns).toEqual([
            "Row ID",
            "Order ID",
            "Order Date",
            "Ship Date",
            "Ship Mode",
            "Customer ID",
            "Customer Name",
            "Segment",
            "Country",
            "City",
            "State",
            "Postal Code",
            "Region",
            "Product ID",
            "Category",
            "Sub-Category",
            "Product Name",
            "Sales",
            "Quantity",
            "Discount",
            "Profit",
        ]);
    });

    test("size()", async function () {
        const table = await getClient().open_table("memory.superstore");
        const size = await table.size();
        expect(size).toBe(9994);
    });
});
