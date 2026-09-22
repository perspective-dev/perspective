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
import perspective from "../perspective_client.ts";
import { expect_child_parity } from "./oracle.ts";
import { make_source, rows, ROLLUPS } from "./fixtures.ts";

test.describe("Views on a derived table", function () {
    test("the default view shows members only", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g", "h"],
            columns: ["x"],
            group_rollup_mode: "flat",
        });

        const derived = await perspective.table(view);
        const child = await derived.view();
        expect(await child.num_rows()).toEqual(6);
        expect((await child.to_json()).length).toEqual(6);
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    for (const group_rollup_mode of ROLLUPS) {
        test(`re-aggregating a ${group_rollup_mode} parent matches a snapshot`, async function () {
            const source = await make_source();
            const config = {
                group_by: ["g", "h"],
                columns: ["x", "y"],
                aggregates: { x: "sum", y: "mean" },
                group_rollup_mode,
            };

            const child_config = {
                group_by: ["g (Group by 1)"],
                columns: ["x", "y"],
                aggregates: { x: "sum", y: "mean" },
            };

            const view = await source.view(config);
            const derived = await perspective.table(view);
            const live = await derived.view(child_config);
            await expect_child_parity(
                source,
                config,
                derived,
                child_config,
                view,
            );
            for (let i = 0; i < 10; i++) {
                await source.update(rows(3, i * 5));
                await source.update([{ id: i, x: i * 11, g: "b" }]);
                await source.remove([i + 12]);
                await expect_child_parity(
                    source,
                    config,
                    derived,
                    child_config,
                    view,
                    live,
                );
            }

            await live.delete();
            await derived.delete();
            await view.delete();
            await source.delete();
        });
    }

    test("a flat parent re-aggregates to the direct aggregation", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g", "h"],
            columns: ["x"],
            aggregates: { x: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await perspective.table(view);
        const child = await derived.view({
            group_by: ["g (Group by 1)"],
            columns: ["x"],
            aggregates: { x: "sum" },
        });

        const direct = await source.view({
            group_by: ["g"],
            columns: ["x"],
            aggregates: { x: "sum" },
        });

        await source.update(rows(10, 20));
        await source.remove([1, 2]);
        const a = await child.to_columns();
        const b = await direct.to_columns();
        expect(a.x).toEqual(b.x);
        expect(a.__ROW_PATH__).toEqual(b.__ROW_PATH__);
        await direct.delete();
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("filtering on an aggregate", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g", "h"],
            columns: ["x"],
            aggregates: { x: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await perspective.table(view);
        const child = await derived.view({ filter: [["x", ">", 60]] });
        const all = await derived.view();
        const expected = (await all.to_json()).filter((r) => r.x > 60);
        expect(await child.to_json()).toEqual(expected);
        await source.update([{ id: 0, x: 1000 }]);
        const expected2 = (await all.to_json()).filter((r) => r.x > 60);
        expect(await child.to_json()).toEqual(expected2);
        await all.delete();
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("an expression over two split columns", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g"],
            split_by: ["s"],
            columns: ["x"],
            aggregates: { x: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await perspective.table(view);
        const child = await derived.view({
            columns: ["Mon|x", "Tue|x", "chg"],
            expressions: { chg: '"Tue|x" - "Mon|x"' },
        });

        await source.update([{ id: 0, x: 500 }]);
        const json = await child.to_json();
        for (const row of json) {
            expect(row.chg).toBeCloseTo(row["Tue|x"] - row["Mon|x"]);
        }

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a diff window across days on a group_by promotion", async function () {
        const source = await perspective.table(
            [
                { id: 1, p: "A", d: 1, pnl: 110 },
                { id: 2, p: "A", d: 2, pnl: 130 },
                { id: 3, p: "A", d: 3, pnl: 150 },
                { id: 4, p: "B", d: 1, pnl: 50 },
                { id: 5, p: "B", d: 2, pnl: 70 },
                { id: 6, p: "B", d: 3, pnl: 65 },
            ],
            { index: "id" },
        );

        const view = await source.view({
            group_by: ["p", "d"],
            columns: ["pnl"],
            aggregates: { pnl: "avg" },
            group_rollup_mode: "flat",
        });

        const derived = await perspective.table(view);
        const child = await derived.view({
            group_by: ["p (Group by 1)"],
            split_by: ["d (Group by 2)"],
            columns: ["chg"],
            aggregates: { chg: "sum" },
            group_rollup_mode: "flat",
            windows: {
                chg: {
                    column: "pnl",
                    aggregate: "diff",
                    partition_by: ["p (Group by 1)"],
                    order_by: ["d (Group by 2)", "asc"],
                },
            },
        });

        const before = await child.to_columns();
        expect(before["2|chg"]).toEqual([20, 20]);
        expect(before["3|chg"]).toEqual([20, -5]);
        await source.update([{ id: 5, pnl: 90 }]);
        const after = await child.to_columns();
        expect(after["2|chg"]).toEqual([20, 40]);
        expect(after["3|chg"]).toEqual([20, -25]);
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("on_update fires once per parent update with a row delta", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g"],
            columns: ["x"],
            aggregates: { x: "sum" },
            group_rollup_mode: "flat",
        });

        const derived = await perspective.table(view);
        const child = await derived.view();
        const deltas: any[] = [];
        await child.on_update(
            async (updated: any) => {
                const t = await perspective.table(updated.delta);
                const v = await t.view();
                deltas.push(await v.to_json());
                await v.delete();
                await t.delete();
            },
            { mode: "row" },
        );

        await source.update([{ id: 0, x: 1000 }]);
        await expect.poll(() => deltas.length).toEqual(1);
        expect(deltas[0]).toHaveLength(1);
        expect(deltas[0][0]["g (Group by 1)"]).toEqual("a");
        await source.update([{ id: 1, x: 2000 }]);
        await expect.poll(() => deltas.length).toEqual(2);
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });

    test("a read straight after a source update is fresh", async function () {
        const source = await make_source();
        const view = await source.view({
            group_by: ["g"],
            columns: ["x"],
            aggregates: { x: "sum" },
            group_rollup_mode: "total",
        });

        const derived = await perspective.table(view);
        const child = await derived.view();
        const before = (await child.to_json())[0].x;
        await source.update([{ id: 1000, g: "a", x: 5 }]);
        expect((await child.to_json())[0].x).toBeCloseTo(before + 5);
        expect(await derived.size()).toEqual(1);
        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
