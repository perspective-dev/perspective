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

const data = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    {
        x: 4,
        y: "abcdefghijklmnopqrstuvwxyz",
        z: false,
    },
];

((perspective) => {
    test.describe("View config", function () {
        test("Non-interned filter strings do not create corrupted view configs", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                filter: [["y", "==", "abcdefghijklmnopqrstuvwxyz"]],
            });

            const config = await view.get_config();
            expect(config.filter).toEqual([
                ["y", "==", "abcdefghijklmnopqrstuvwxyz"],
            ]);

            view.delete();
            table.delete();
        });

        test("Non-default aggregates are provided", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x", "z"],
                aggregates: { x: "count", z: "sum" },
            });

            const config = await view.get_config();
            expect(config).toEqual({
                aggregates: { x: "count", z: "sum" },
                columns: ["x", "z"],
                expressions: {},
                filter: [],
                group_by: ["y"],
                sort: [],
                split_by: [],
                group_rollup_mode: "rollup",
            });

            view.delete();
            table.delete();
        });

        test("Compound aggregates are provided", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x"],
                aggregates: { x: ["weighted mean", ["y"]] },
            });

            const config = await view.get_config();
            expect(config).toEqual({
                aggregates: { x: ["weighted mean", ["y"]] },
                columns: ["x"],
                expressions: {},
                filter: [],
                group_by: ["y"],
                sort: [],
                split_by: [],
                group_rollup_mode: "rollup",
            });

            view.delete();
            table.delete();
        });

        test("Expression aggregates are provided", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x", "z", "new"],
                expressions: { new: `"x" + 1` },
                aggregates: { x: ["weighted mean", ["y"]] },
            });

            const config = await view.get_config();
            expect(config).toEqual({
                aggregates: {
                    new: "sum",
                    z: "count",
                    x: ["weighted mean", ["y"]],
                },
                columns: ["x", "z", "new"],
                expressions: { new: `"x" + 1` },
                filter: [],
                group_by: ["y"],
                sort: [],
                split_by: [],
                group_rollup_mode: "rollup",
            });

            view.delete();
            table.delete();
        });

        // The `aggregates` field was omitted entirely in `3.0.0` until `3.9.0`
        // (due to a bug introduced by an inebriated office drone). Prior to
        // this, columns were sleectively omitted from the result if they were
        // _non-default_ (to shorten JSON encoding). For example if a `"flaot"`
        // column was anything other than `"sum"`.
        //
        // In revisiting this broken feature, I've updated the behavior to
        // reflect a less certain view of what is "default", and output all
        // columns which need aggregates. These tests preserve the `2.x`
        // behavior.
        test.skip("Default aggregates are omitted", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x", "z"],
                aggregates: { x: "sum", z: "count" },
            });

            const config = await view.get_config();
            expect(config).toEqual({
                aggregates: {},
                columns: ["x", "z"],
                expressions: {},
                filter: [],
                group_by: ["y"],
                sort: [],
                split_by: [],
                group_rollup_mode: "rollup",
            });

            view.delete();
            table.delete();
        });

        test.skip("Mixed aggregates are provided and omitted", async function () {
            const table = await perspective.table(data);
            const view = await table.view({
                group_by: ["y"],
                columns: ["x", "z"],
                aggregates: { x: "sum", z: "mean" },
            });

            const config = await view.get_config();
            expect(config).toEqual({
                aggregates: { z: "mean" },
                columns: ["x", "z"],
                expressions: {},
                filter: [],
                group_by: ["y"],
                sort: [],
                split_by: [],
                group_rollup_mode: "rollup",
            });

            view.delete();
            table.delete();
        });
    });
})(perspective);
