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

import { test } from "@perspective-dev/test";
import perspective from "../perspective_client.ts";
import {
    expect_child_parity,
    expect_flat_child_parity,
    expect_flat_parity,
    expect_tree_parity,
    mulberry32,
} from "./oracle.ts";
import { SCHEMA, ROLLUPS, SPLIT_ROLLUPS } from "./fixtures.ts";

const G = ["a", "b", "c", "d"];
const H = ["p", "q"];
const S = ["Mon", "Tue", "Wed"];
const KEYS = 30;
const TICKS = 300;

function pick<T>(rand: () => number, xs: T[]): T {
    return xs[Math.floor(rand() * xs.length)];
}

async function tick(
    rand: () => number,
    source: any,
    live: Set<number>,
    null_keys = true,
) {
    const op = rand();
    if (op < 0.2 && live.size > 0) {
        const ids = [...live].filter(() => rand() < 0.15);
        ids.forEach((id) => live.delete(id));
        if (ids.length > 0) {
            await source.remove(ids);
        }

        return;
    }

    const n = 1 + Math.floor(rand() * 4);
    const batch = [];
    for (let i = 0; i < n; i++) {
        const id = Math.floor(rand() * KEYS);
        const row: any = { id };
        if (!live.has(id) || rand() < 0.3) {
            const is_null = rand() < 0.05 && null_keys;
            row.g = is_null ? null : pick(rand, G);
            row.h = pick(rand, H);
            row.s = pick(rand, S);
        }

        if (!live.has(id) || rand() < 0.8) {
            row.x = Math.round(rand() * 1000) / 4;
            row.y = Math.floor(rand() * 12);
            row.w = 1 + Math.floor(rand() * 4);
        }

        live.add(id);
        batch.push(row);
    }

    await source.update(batch);
}

async function soak_tree(config: any, child_config: any) {
    const rand = mulberry32(1234);
    const live = new Set<number>();
    const source = await perspective.table(SCHEMA, { index: "id" });
    await source.update(
        S.map((s, i) => ({ id: 1000 + i, g: "a", h: "p", s, x: i, y: i })),
    );

    const view = await source.view(config);
    const derived = await perspective.table(view);
    const child = await derived.view(child_config);
    for (let i = 0; i < TICKS; i++) {
        await tick(rand, source, live);
        await expect_tree_parity(source, config, derived, view);
        await expect_child_parity(
            source,
            config,
            derived,
            child_config,
            view,
            child,
        );
    }

    await child.delete();
    await derived.delete();
    await view.delete();
    await source.delete();
}

const AGGS = { x: "sum", y: "mean" };

test.describe("Derived table soak", function () {
    for (const group_rollup_mode of ROLLUPS) {
        test(`group_by parent, ${group_rollup_mode}`, async function () {
            await soak_tree(
                {
                    group_by: ["g", "h"],
                    columns: ["x", "y"],
                    aggregates: AGGS,
                    group_rollup_mode,
                },
                {
                    group_by: ["h"],
                    columns: ["x", "y"],
                    aggregates: AGGS,
                },
            );
        });

        for (const split_rollup_mode of SPLIT_ROLLUPS) {
            test(`split_by parent, ${group_rollup_mode} rows, ${split_rollup_mode} columns`, async function () {
                await soak_tree(
                    {
                        group_by: ["g", "h"],
                        split_by: ["s"],
                        columns: ["x"],
                        aggregates: { x: "sum" },
                        group_rollup_mode,
                        split_rollup_mode,
                    },
                    {
                        group_by: ["g"],
                        columns: ["Mon|x", "Wed|x"],
                        aggregates: { "Mon|x": "sum", "Wed|x": "mean" },
                    },
                );
            });
        }
    }

    test("filtered flat parent", async function () {
        const rand = mulberry32(99);
        const live = new Set<number>();
        const source = await perspective.table(SCHEMA, { index: "id" });
        const view = await source.view({
            expressions: { big: '"x" * 2' },
            filter: [
                ["big", ">", 100],
                ["y", "<", 9],
            ],
        });

        const derived = await perspective.table(view);
        const child_config = {
            group_by: ["g"],
            columns: ["x", "y"],
            aggregates: AGGS,
        };

        const child = await derived.view(child_config);
        for (let i = 0; i < TICKS; i++) {
            await tick(rand, source, live, false);
            await expect_flat_parity(view, derived);
            await expect_flat_child_parity(view, derived, child_config, child);
        }

        await child.delete();
        await derived.delete();
        await view.delete();
        await source.delete();
    });
});
