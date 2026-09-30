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
import { expect_tree_parity } from "./oracle.ts";
import { make_source, rows } from "./fixtures.ts";

const NUMERIC = [
    "sum",
    "mul",
    "avg",
    "mean",
    "count",
    "distinct count",
    "unique",
    "any",
    "q1",
    "q3",
    "median",
    "dominant",
    "first",
    "last",
    "first by index",
    "last by index",
    "last minus first",
    "max",
    "min",
    "high",
    "low",
    "high minus low",
    "sum abs",
    "abs sum",
    "sum or zero",
    "pct sum parent",
    "pct sum grand total",
    "var",
    "stddev",
    ["weighted mean", ["w"]],
    ["max by", ["y"]],
    ["min by", ["y"]],
];

const STRING = [
    "count",
    "distinct count",
    "unique",
    "any",
    "dominant",
    "first",
    "last",
    "join",
];

async function check(column: string, aggregate: any, split: boolean) {
    const source = await make_source();
    const config: any = {
        group_by: ["g", "h"],
        columns: [column],
        aggregates: { [column]: aggregate },
    };

    if (split) {
        config.split_by = ["s"];
    }

    const view = await source.view(config);
    const derived = await perspective.table(view);
    await expect_tree_parity(source, config, derived, view);
    await source.update(rows(9, 20));
    await expect_tree_parity(source, config, derived, view);
    await source.remove([0, 1, 2, 3, 25]);
    await expect_tree_parity(source, config, derived, view);
    await derived.delete();
    await view.delete();
    await source.delete();
}

test.describe("Derived table aggregate parity", function () {
    for (const aggregate of NUMERIC) {
        test(`numeric ${JSON.stringify(aggregate)}`, async function () {
            await check("x", aggregate, false);
        });

        test(`numeric ${JSON.stringify(aggregate)} with split_by`, async function () {
            await check("x", aggregate, true);
        });
    }

    for (const aggregate of STRING) {
        test(`string ${JSON.stringify(aggregate)}`, async function () {
            await check("h", aggregate, false);
        });

        test(`string ${JSON.stringify(aggregate)} with split_by`, async function () {
            await check("h", aggregate, true);
        });
    }
});
