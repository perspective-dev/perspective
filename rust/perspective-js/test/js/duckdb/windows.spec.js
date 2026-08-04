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

// Fetch the raw columns once and brute-force the expected window outputs in
// JS - "Row ID" is unique, so the ordering is tie-free and deterministic on
// both sides.
async function raw_rows(client) {
    const table = await client.open_table("memory.superstore");
    const view = await table.view({
        columns: ["Row ID", "Region", "Sales"],
        sort: [["Row ID", "asc"]],
    });
    const cols = await view.to_columns();
    await view.delete();
    const rows = cols["Row ID"].map((id, i) => ({
        id,
        region: cols["Region"][i],
        sales: cols["Sales"][i],
    }));
    return rows;
}

describeDuckDB("windows", (getClient) => {
    test("cumulative sum partitioned by Region", async function () {
        const rows = await raw_rows(getClient());
        const running = {};
        const expected = rows.map((r) => {
            running[r.region] = (running[r.region] ?? 0) + r.sales;
            return running[r.region];
        });

        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Row ID", "cumsum"],
            sort: [["Row ID", "asc"]],
            windows: {
                cumsum: {
                    column: "Sales",
                    aggregate: "sum",
                    order_by: ["Row ID", "asc"],
                    partition_by: ["Region"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_columns();
        expect(result["cumsum"].length).toBe(expected.length);
        for (let i = 0; i < expected.length; i++) {
            expect(result["cumsum"][i]).toBeCloseTo(expected[i], 6);
        }
        await view.delete();
    });

    test("lag copies the previous partition row exactly", async function () {
        const rows = await raw_rows(getClient());
        const prev = {};
        const expected = rows.map((r) => {
            const out = prev[r.region] ?? null;
            prev[r.region] = r.sales;
            return out;
        });

        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Row ID", "lg"],
            sort: [["Row ID", "asc"]],
            windows: {
                lg: {
                    column: "Sales",
                    aggregate: "lag",
                    order_by: ["Row ID", "asc"],
                    partition_by: ["Region"],
                },
            },
        });

        const result = await view.to_columns();
        expect(result["lg"]).toEqual(expected);
        await view.delete();
    });

    test("descending cumulative sum matches the reversed running sum", async function () {
        const rows = await raw_rows(getClient());
        const running = {};
        const expected = rows.map(() => 0);
        for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            running[r.region] = (running[r.region] ?? 0) + r.sales;
            expected[i] = running[r.region];
        }

        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["Row ID", "cumsum"],
            sort: [["Row ID", "asc"]],
            windows: {
                cumsum: {
                    column: "Sales",
                    aggregate: "sum",
                    order_by: ["Row ID", "desc"],
                    partition_by: ["Region"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_columns();
        expect(result["cumsum"].length).toBe(expected.length);
        for (let i = 0; i < expected.length; i++) {
            expect(result["cumsum"][i]).toBeCloseTo(expected[i], 6);
        }
        await view.delete();
    });

    test("omitted order_by uses natural (rowid) order", async function () {
        // Natural order for the SQL model is `rowid` - the same identity
        // an unsorted view's results are already ordered by, so the
        // expected values are the running sums over an UNSORTED fetch.
        const table = await getClient().open_table("memory.superstore");
        const raw_view = await table.view({
            columns: ["Row ID", "Region", "Sales"],
        });
        const raw = await raw_view.to_columns();
        await raw_view.delete();

        const running = {};
        const expected_by_id = {};
        for (let i = 0; i < raw["Row ID"].length; i++) {
            const region = raw["Region"][i];
            running[region] = (running[region] ?? 0) + raw["Sales"][i];
            expected_by_id[raw["Row ID"][i]] = running[region];
        }

        const view = await table.view({
            columns: ["Row ID", "cumsum"],
            sort: [["Row ID", "asc"]],
            windows: {
                cumsum: {
                    column: "Sales",
                    aggregate: "sum",
                    partition_by: ["Region"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_columns();
        for (let i = 0; i < result["Row ID"].length; i++) {
            expect(result["cumsum"][i]).toBeCloseTo(
                expected_by_id[result["Row ID"][i]],
                6,
            );
        }
        await view.delete();
    });

    test("window column as group_by aggregate input", async function () {
        const rows = await raw_rows(getClient());
        const running = {};
        for (const r of rows) {
            running[r.region] = (running[r.region] ?? 0) + r.sales;
        }

        const table = await getClient().open_table("memory.superstore");
        const view = await table.view({
            columns: ["cumsum"],
            group_by: ["Region"],
            aggregates: { cumsum: "max" },
            windows: {
                cumsum: {
                    column: "Sales",
                    aggregate: "sum",
                    order_by: ["Row ID", "asc"],
                    partition_by: ["Region"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_json();
        for (const row of result) {
            const path = row["__ROW_PATH__"];
            if (path.length === 1) {
                expect(row["cumsum"]).toBeCloseTo(running[path[0]], 6);
            }
        }
        await view.delete();
    });
});
