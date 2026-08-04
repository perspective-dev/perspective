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
import perspective from "./perspective_client";

// Rows arrive deliberately out of `t` order to prove windows order by
// `order_by`, not insertion order.
const data = [
    { t: 3, sym: "a", price: 30 },
    { t: 1, sym: "a", price: 10 },
    { t: 2, sym: "b", price: 100 },
    { t: 4, sym: "b", price: 200 },
    { t: 2, sym: "a", price: 20 },
];

test.describe("Window columns", function () {
    test("cumulative sum over one partition", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "price", "cumsum"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_columns();
        expect(result["cumsum"]).toEqual([10, 30, 60]);
        await view.delete();
        await table.delete();
    });

    test("omitted frame defaults to cumulative for aggregating ops", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "price", "cumsum"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                },
            },
        });

        const result = await view.to_columns();
        expect(result["cumsum"]).toEqual([10, 30, 60]);
        await view.delete();
        await table.delete();
    });

    test("moving sum and avg with rows frame, partitioned", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["sym", "t", "sma"],
            sort: [
                ["sym", "asc"],
                ["t", "asc"],
            ],
            windows: {
                sma: {
                    column: "price",
                    aggregate: "avg",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    rows: 1,
                },
            },
        });

        const result = await view.to_columns();
        // frame = 1 preceding + current: per-partition trailing pairs
        expect(result["sma"]).toEqual([10, 15, 25, 100, 150]);
        await view.delete();
        await table.delete();
    });

    test("streaming append extends cumulative sum", async function () {
        const table = await perspective.table(
            { t: "integer", sym: "string", price: "float" },
            { index: "t" },
        );
        await table.update([
            { t: 1, sym: "a", price: 1 },
            { t: 2, sym: "a", price: 2 },
        ]);
        const view = await table.view({
            columns: ["t", "cumsum"],
            sort: [["t", "asc"]],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    cumulative: true,
                },
            },
        });

        expect((await view.to_columns())["cumsum"]).toEqual([1, 3]);

        await table.update([{ t: 3, sym: "a", price: 3 }]);
        expect((await view.to_columns())["cumsum"]).toEqual([1, 3, 6]);

        // A mid-history edit re-bases every later cumulative value.
        await table.update([{ t: 1, sym: "a", price: 10 }]);
        expect((await view.to_columns())["cumsum"]).toEqual([10, 12, 15]);

        await view.delete();
        await table.delete();
    });

    test("window column works as group_by aggregate input", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            group_by: ["sym"],
            columns: ["last_cumsum"],
            aggregates: { last_cumsum: "max" },
            windows: {
                last_cumsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_columns();
        // [TOTAL, a, b]: partition cumsums end at 60 (a) and 300 (b)
        expect(result["last_cumsum"]).toEqual([300, 60, 300]);
        await view.delete();
        await table.delete();
    });

    test("min/max rows frame and count cumulative", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "mn", "mx", "n"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            windows: {
                mn: {
                    column: "price",
                    aggregate: "min",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    rows: 1,
                },
                mx: {
                    column: "price",
                    aggregate: "max",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    rows: 1,
                },
                n: {
                    column: "price",
                    aggregate: "count",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_columns();
        expect(result["mn"]).toEqual([10, 10, 20]);
        expect(result["mx"]).toEqual([10, 20, 30]);
        expect(result["n"]).toEqual([1, 2, 3]);
        await view.delete();
        await table.delete();
    });

    test("row delta includes out-of-batch rows whose window outputs changed", async function () {
        const table = await perspective.table(
            { t: "integer", price: "float" },
            { index: "t" },
        );
        await table.update([
            { t: 1, price: 10 },
            { t: 2, price: 2 },
            { t: 3, price: 3 },
        ]);
        const view = await table.view({
            columns: ["t", "price", "cumsum"],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    cumulative: true,
                },
            },
        });
        // Settle the registration notify before subscribing.
        await view.to_columns();

        const delta = new Promise((resolve) => {
            view.on_update((updated) => resolve(updated.delta), {
                mode: "row",
            });
        });
        await table.update([{ t: 1, price: 100 }]);

        const delta_table = await perspective.table(await delta);
        const delta_view = await delta_table.view({ sort: [["t", "asc"]] });
        const result = await delta_view.to_columns();
        // The batch touched only t=1, but every later cumulative value
        // changed - the widening pass must surface t=2 and t=3.
        expect(result["t"]).toEqual([1, 2, 3]);
        expect(result["cumsum"]).toEqual([100, 102, 105]);
        await delta_view.delete();
        await delta_table.delete();
        await view.delete();
        await table.delete();
    });

    test("row delta suppresses widened rows whose outputs did not change", async function () {
        const table = await perspective.table(
            { t: "integer", price: "float" },
            { index: "t" },
        );
        await table.update([
            { t: 1, price: 5 },
            { t: 2, price: 10 },
            { t: 3, price: 1 },
        ]);
        const view = await table.view({
            columns: ["t", "price", "mn"],
            windows: {
                mn: {
                    column: "price",
                    aggregate: "min",
                    order_by: ["t", "asc"],
                    rows: 1,
                },
            },
        });
        await view.to_columns();

        const delta = new Promise((resolve) => {
            view.on_update((updated) => resolve(updated.delta), {
                mode: "row",
            });
        });
        // 10 -> 7 leaves both trailing-pair minimums unchanged
        // (min(5,7) == 5, min(7,1) == 1), so the widened t=3 row must be
        // suppressed by the pipeline's prev/current diff.
        await table.update([{ t: 2, price: 7 }]);

        const delta_table = await perspective.table(await delta);
        const delta_view = await delta_table.view({ sort: [["t", "asc"]] });
        const result = await delta_view.to_columns();
        expect(result["t"]).toEqual([2]);
        expect(result["mn"]).toEqual([5]);
        await delta_view.delete();
        await delta_table.delete();
        await view.delete();
        await table.delete();
    });

    test("random ops match a fresh-view oracle", async function () {
        // mulberry32: seeded so failures reproduce
        let seed = 0x9e3779b9;
        const rand = () => {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        const config = {
            columns: [
                "id",
                "sym",
                "t",
                "cumsum",
                "sma",
                "lg",
                "ld",
                "df",
                "rsum",
                "rt",
                "ema1",
                "sd",
            ],
            sort: [["id", "asc"]],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    cumulative: true,
                },
                sma: {
                    column: "price",
                    aggregate: "avg",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    rows: 2,
                },
                lg: {
                    column: "price",
                    aggregate: "lag",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                },
                ld: {
                    column: "price",
                    aggregate: "lead",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                },
                df: {
                    column: "price",
                    aggregate: "diff",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                },
                rsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    range: 3,
                },
                rt: {
                    column: "price",
                    aggregate: "rate",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    range: 5,
                },
                ema1: {
                    column: "price",
                    aggregate: "ema",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    alpha: 0.5,
                },
                sd: {
                    column: "price",
                    aggregate: "stddev",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    cumulative: true,
                },
            },
        };
        const schema = {
            id: "integer",
            sym: "string",
            t: "integer",
            price: "float",
        };

        const table = await perspective.table(schema, { index: "id" });
        const view = await table.view(config);
        const rows = new Map();
        let next_id = 0;

        for (let op_idx = 0; op_idx < 40; op_idx++) {
            const roll = rand();
            if (roll < 0.4 || rows.size === 0) {
                const row = {
                    id: next_id++,
                    sym: rand() < 0.5 ? "a" : "b",
                    t: Math.floor(rand() * 20),
                    price: Math.floor(rand() * 100),
                };
                rows.set(row.id, row);
                await table.update([row]);
            } else {
                const ids = [...rows.keys()];
                const id = ids[Math.floor(rand() * ids.length)];
                if (roll < 0.55) {
                    await table.remove([id]);
                    rows.delete(id);
                } else {
                    // mutate price, order key, or partition - the last two
                    // exercise relocation and partition migration
                    const row = { ...rows.get(id) };
                    const which = rand();
                    if (which < 0.4) {
                        row.price = Math.floor(rand() * 100);
                    } else if (which < 0.7) {
                        row.t = Math.floor(rand() * 20);
                    } else {
                        row.sym = row.sym === "a" ? "b" : "a";
                    }
                    rows.set(id, row);
                    await table.update([row]);
                }
            }

            const incremental = await view.to_columns();
            const oracle_table = await perspective.table(schema, {
                index: "id",
            });
            if (rows.size > 0) {
                await oracle_table.update([...rows.values()]);
            }
            const oracle_view = await oracle_table.view(config);
            const expected = await oracle_view.to_columns();
            await oracle_view.delete();
            await oracle_table.delete();

            expect({ op: op_idx, cols: incremental }).toEqual({
                op: op_idx,
                cols: expected,
            });
        }

        await view.delete();
        await table.delete();
    });

    test("lag, lead and diff", async function () {
        const table = await perspective.table({ t: "integer", p: "float" });
        await table.update([
            { t: 3, p: 40 },
            { t: 1, p: 10 },
            { t: 4, p: 80 },
            { t: 2, p: 20 },
        ]);
        const view = await table.view({
            columns: ["t", "lg", "ld", "df"],
            sort: [["t", "asc"]],
            windows: {
                lg: { column: "p", aggregate: "lag", order_by: ["t", "asc"] },
                ld: { column: "p", aggregate: "lead", order_by: ["t", "asc"] },
                df: { column: "p", aggregate: "diff", order_by: ["t", "asc"] },
            },
        });

        const result = await view.to_columns();
        expect(result["lg"]).toEqual([null, 10, 20, 40]);
        expect(result["ld"]).toEqual([20, 40, 80, null]);
        expect(result["df"]).toEqual([null, 10, 20, 40]);
        await view.delete();
        await table.delete();
    });

    test("ema", async function () {
        const table = await perspective.table({ t: "integer", p: "float" });
        await table.update([
            { t: 1, p: 10 },
            { t: 2, p: 20 },
            { t: 3, p: 40 },
        ]);
        const view = await table.view({
            columns: ["t", "ema"],
            sort: [["t", "asc"]],
            windows: {
                ema: {
                    column: "p",
                    aggregate: "ema",
                    order_by: ["t", "asc"],
                    alpha: 0.5,
                },
            },
        });

        const result = await view.to_columns();
        expect(result["ema"]).toEqual([10, 15, 27.5]);
        await view.delete();
        await table.delete();
    });

    test("range frame sum over sparse keys", async function () {
        const table = await perspective.table({ t: "integer", p: "float" });
        await table.update([
            { t: 5, p: 4 },
            { t: 1, p: 1 },
            { t: 6, p: 8 },
            { t: 2, p: 2 },
        ]);
        const view = await table.view({
            columns: ["t", "rsum"],
            sort: [["t", "asc"]],
            windows: {
                rsum: {
                    column: "p",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    range: 1,
                },
            },
        });

        const result = await view.to_columns();
        // frames by key interval [t - 1, t]: {1}, {1,2}, {4}, {4,8}
        expect(result["rsum"]).toEqual([1, 3, 4, 12]);
        await view.delete();
        await table.delete();
    });

    test("rate over a range frame", async function () {
        const table = await perspective.table({ t: "integer", p: "float" });
        await table.update([
            { t: 0, p: 0 },
            { t: 10, p: 5 },
            { t: 20, p: 20 },
        ]);
        const view = await table.view({
            columns: ["t", "rate"],
            sort: [["t", "asc"]],
            windows: {
                rate: {
                    column: "p",
                    aggregate: "rate",
                    order_by: ["t", "asc"],
                    range: 10,
                },
            },
        });

        const result = await view.to_columns();
        // (Δvalue / Δkey) over each 10-unit trailing window; the first row
        // has no span.
        expect(result["rate"]).toEqual([null, 0.5, 1.5]);
        await view.delete();
        await table.delete();
    });

    test("rolling sample stddev", async function () {
        const table = await perspective.table({ t: "integer", p: "float" });
        await table.update([
            { t: 1, p: 10 },
            { t: 2, p: 20 },
            { t: 3, p: 40 },
        ]);
        const view = await table.view({
            columns: ["t", "sd"],
            sort: [["t", "asc"]],
            windows: {
                sd: {
                    column: "p",
                    aggregate: "stddev",
                    order_by: ["t", "asc"],
                    rows: 2,
                },
            },
        });

        const result = await view.to_columns();
        expect(result["sd"][0]).toBeNull();
        expect(result["sd"][1]).toBeCloseTo(Math.sqrt(50), 10);
        expect(result["sd"][2]).toBeCloseTo(Math.sqrt(700 / 3), 10);
        await view.delete();
        await table.delete();
    });

    test("streaming mid-edit re-bases range and ema windows", async function () {
        const table = await perspective.table(
            { t: "integer", p: "float" },
            { index: "t" },
        );
        await table.update([
            { t: 1, p: 10 },
            { t: 2, p: 20 },
            { t: 3, p: 40 },
        ]);
        const view = await table.view({
            columns: ["t", "rsum", "ema"],
            sort: [["t", "asc"]],
            windows: {
                rsum: {
                    column: "p",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    range: 1,
                },
                ema: {
                    column: "p",
                    aggregate: "ema",
                    order_by: ["t", "asc"],
                    alpha: 0.5,
                },
            },
        });

        expect((await view.to_columns())["rsum"]).toEqual([10, 30, 60]);
        expect((await view.to_columns())["ema"]).toEqual([10, 15, 27.5]);

        // Mid-history edit: every downstream range frame containing t=2 and
        // the whole ema suffix re-base.
        await table.update([{ t: 2, p: 100 }]);
        expect((await view.to_columns())["rsum"]).toEqual([10, 110, 140]);
        expect((await view.to_columns())["ema"]).toEqual([10, 55, 47.5]);

        await view.delete();
        await table.delete();
    });

    test("sliding frames match brute force over a long series", async function () {
        // The C++ sliding-window pass (Phase 4) is exercised by both the
        // view and the property-test oracle, so pin it against an
        // independent JS brute-force instead. Integer prices keep sliding
        // add/subtract exact.
        let seed = 0xc0ffee;
        const rand = () => {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        const N = 200;
        const FRAME = 7;
        const RANGE = 5;
        const rows = [];
        for (let i = 0; i < N; i++) {
            rows.push({
                t: i * 2 + Math.floor(rand() * 2),
                p: Math.floor(rand() * 1000),
            });
        }

        const table = await perspective.table(
            { t: "integer", p: "float" },
            { index: "t" },
        );
        await table.update(rows);
        const view = await table.view({
            columns: ["t", "s", "mn", "mx", "n", "sd"],
            sort: [["t", "asc"]],
            windows: {
                s: {
                    column: "p",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    rows: FRAME,
                },
                mn: {
                    column: "p",
                    aggregate: "min",
                    order_by: ["t", "asc"],
                    rows: FRAME,
                },
                mx: {
                    column: "p",
                    aggregate: "max",
                    order_by: ["t", "asc"],
                    rows: FRAME,
                },
                n: {
                    column: "p",
                    aggregate: "count",
                    order_by: ["t", "asc"],
                    range: RANGE,
                },
                sd: {
                    column: "p",
                    aggregate: "stddev",
                    order_by: ["t", "asc"],
                    rows: FRAME,
                },
            },
        });

        const brute = (sorted) => {
            const out = { s: [], mn: [], mx: [], n: [], sd: [] };
            for (let i = 0; i < sorted.length; i++) {
                const rows_frame = sorted.slice(Math.max(0, i - FRAME), i + 1);
                const vals = rows_frame.map((r) => r.p);
                out.s.push(vals.reduce((a, b) => a + b, 0));
                out.mn.push(Math.min(...vals));
                out.mx.push(Math.max(...vals));
                const range_vals = sorted
                    .filter(
                        (r) => r.t >= sorted[i].t - RANGE && r.t <= sorted[i].t,
                    )
                    .map((r) => r.p);
                out.n.push(range_vals.length);
                if (vals.length < 2) {
                    out.sd.push(null);
                } else {
                    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
                    out.sd.push(
                        Math.sqrt(
                            vals.reduce((a, b) => a + (b - mean) ** 2, 0) /
                                (vals.length - 1),
                        ),
                    );
                }
            }
            return out;
        };

        const check = async () => {
            const sorted = [...rows].sort((a, b) => a.t - b.t);
            const expected = brute(sorted);
            const result = await view.to_columns();
            expect(result["s"]).toEqual(expected.s);
            expect(result["mn"]).toEqual(expected.mn);
            expect(result["mx"]).toEqual(expected.mx);
            expect(result["n"]).toEqual(expected.n);
            for (let i = 0; i < N; i++) {
                if (expected.sd[i] === null) {
                    expect(result["sd"][i]).toBeNull();
                } else {
                    expect(result["sd"][i]).toBeCloseTo(expected.sd[i], 8);
                }
            }
        };

        await check();

        // Mid-history edits drive the incremental sliding path over dirty
        // ranges (the initial load computed via the full-rebuild path).
        for (let e = 0; e < 5; e++) {
            const victim = rows[Math.floor(rand() * rows.length)];
            victim.p = Math.floor(rand() * 1000);
            await table.update([{ t: victim.t, p: victim.p }]);
            await check();
        }

        await view.delete();
        await table.delete();
    });

    test("window over an expression source", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "cumsum2"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            expressions: { double_price: `"price" * 2` },
            windows: {
                cumsum2: {
                    column: "double_price",
                    aggregate: "sum",
                    order_by: ["t", "asc"],
                    partition_by: ["sym"],
                    cumulative: true,
                },
            },
        });

        const result = await view.to_columns();
        expect(result["cumsum2"]).toEqual([20, 60, 120]);
        await view.delete();
        await table.delete();
    });

    test("omitted order_by uses natural (insertion) order on an unindexed table", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "cumsum"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    partition_by: ["sym"],
                    cumulative: true,
                },
            },
        });

        // An unindexed table's natural (pkey) order is INSERTION order:
        // partition "a" arrived as (t=3, 30), (t=1, 10), (t=2, 20), so the
        // running sums are 30, 40, 60 - read back in ascending t order:
        // t=1 -> 40, t=2 -> 60, t=3 -> 30.
        const result = await view.to_columns();
        expect(result["cumsum"]).toEqual([40, 60, 30]);
        await view.delete();
        await table.delete();
    });

    test("omitted order_by uses natural (index) order on an indexed table", async function () {
        const table = await perspective.table(
            { t: "integer", sym: "string", price: "float" },
            { index: "t" },
        );

        // Inserted out of t order - an indexed table's natural (pkey)
        // order is the INDEX column's order, not arrival order.
        await table.update([
            { t: 3, sym: "a", price: 3 },
            { t: 1, sym: "a", price: 1 },
            { t: 2, sym: "a", price: 2 },
        ]);
        const view = await table.view({
            columns: ["t", "cumsum"],
            sort: [["t", "asc"]],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    cumulative: true,
                },
            },
        });

        expect((await view.to_columns())["cumsum"]).toEqual([1, 3, 6]);

        // Incremental appends maintain natural order.
        await table.update([{ t: 4, sym: "a", price: 4 }]);
        expect((await view.to_columns())["cumsum"]).toEqual([1, 3, 6, 10]);

        await view.delete();
        await table.delete();
    });

    test("descending cumulative sum accumulates in reverse order", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "cumsum_desc"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            windows: {
                cumsum_desc: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "desc"],
                    partition_by: ["sym"],
                    cumulative: true,
                },
            },
        });

        // Partition "a" in desc t order is t=3,2,1 - the running sum read
        // back in asc t order is the asc column reversed over the same
        // rows: [60, 50, 30].
        const result = await view.to_columns();
        expect(result["cumsum_desc"]).toEqual([60, 50, 30]);
        await view.delete();
        await table.delete();
    });

    test("descending lag reads the next-larger order key's value", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "prev"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            windows: {
                prev: {
                    column: "price",
                    aggregate: "lag",
                    order_by: ["t", "desc"],
                    partition_by: ["sym"],
                },
            },
        });

        // Partition "a" in desc order is t=3,2,1; lag(1) reads the previous
        // row IN THAT ORDER, i.e. the next-larger t: t=3 has none, t=2 sees
        // 30, t=1 sees 20. (The partition matters: windows compute over
        // TABLE rows, so without it the view's `sym` filter would not scope
        // the lag and sym "b" rows would interleave.)
        const result = await view.to_columns();
        expect(result["prev"]).toEqual([20, 30, null]);
        await view.delete();
        await table.delete();
    });

    test("descending range frame spans the preceding interval in sort order", async function () {
        const table = await perspective.table({
            t: "integer",
            sym: "string",
            price: "float",
        });
        await table.update(data);
        const view = await table.view({
            columns: ["t", "rsum"],
            sort: [["t", "asc"]],
            filter: [["sym", "==", "a"]],
            windows: {
                rsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "desc"],
                    partition_by: ["sym"],
                    range: 1,
                },
            },
        });

        // Desc order t=3,2,1 with range 1: each frame is keys in
        // [t, t + 1] - t=3 -> {3}, t=2 -> {3,2}, t=1 -> {2,1}.
        const result = await view.to_columns();
        expect(result["rsum"]).toEqual([30, 50, 30]);
        await view.delete();
        await table.delete();
    });

    test("streaming append maintains a descending cumulative sum", async function () {
        const table = await perspective.table(
            { t: "integer", sym: "string", price: "float" },
            { index: "t" },
        );
        await table.update([
            { t: 1, sym: "a", price: 1 },
            { t: 2, sym: "a", price: 2 },
        ]);
        const view = await table.view({
            columns: ["t", "cumsum"],
            sort: [["t", "asc"]],
            windows: {
                cumsum: {
                    column: "price",
                    aggregate: "sum",
                    order_by: ["t", "desc"],
                    cumulative: true,
                },
            },
        });

        // Desc accumulation read back in asc order: t=1 sums {2,1}, t=2
        // sums {2}.
        expect((await view.to_columns())["cumsum"]).toEqual([3, 2]);

        // Incremental insert exercises sorted-index insertion under the
        // DESC comparator - a mismatch with the sort comparator corrupts
        // positions silently.
        await table.update([{ t: 3, sym: "a", price: 3 }]);
        expect((await view.to_columns())["cumsum"]).toEqual([6, 5, 3]);

        // Mid-history edit re-bases the desc-suffix (asc-prefix) rows.
        await table.update([{ t: 3, sym: "a", price: 30 }]);
        expect((await view.to_columns())["cumsum"]).toEqual([33, 32, 30]);

        await view.delete();
        await table.delete();
    });
});
