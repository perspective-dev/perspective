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

import { test, expect } from "@finos/perspective-test";
import perspective from "@finos/perspective";

const data = {
    w: [
        1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, -1.5, -3.5, -1.5, -4.5, -9.5,
        -5.5, -8.5, -7.5,
    ],
    x: [1, 2, 3, 4, 4, 3, 2, 1, 3, 4, 2, 1, 4, 3, 1, 2],
    y: [
        "a",
        "b",
        "c",
        "d",
        "a",
        "b",
        "c",
        "d",
        "a",
        "b",
        "c",
        "d",
        "a",
        "b",
        "c",
        "d",
    ],
    z: [
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        true,
        true,
        true,
        false,
        false,
        false,
        false,
    ],
};

test.describe("get_min_max", function () {
    test.describe("0 sided", function () {
        test("float column", async function () {
            var table = await perspective.table(data);
            var view = await table.view({});
            const range = await view.get_min_max("w");
            expect(range).toEqual([-9.5, 8.5]);
            view.delete();
            table.delete();
        });

        test("int column", async function () {
            var table = await perspective.table(data);
            var view = await table.view({});
            const range = await view.get_min_max("x");
            expect(range).toEqual([1, 4]);
            view.delete();
            table.delete();
        });

        test("string column", async function () {
            var table = await perspective.table(data);
            var view = await table.view({});
            const range = await view.get_min_max("y");
            expect(range).toEqual(["a", "d"]);
            view.delete();
            table.delete();
        });
    });

    test.describe("1 sided", function () {
        test("float col", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["y"],
            });
            const cols = await view.get_min_max("w");
            expect(cols).toEqual([-4, 1]);
            view.delete();
            table.delete();
        });

        test("int col", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["y"],
            });
            const cols = await view.get_min_max("x");
            expect(cols).toEqual([8, 12]);
            view.delete();
            table.delete();
        });

        test("string col", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["y"],
            });
            const cols = await view.get_min_max("y");
            expect(cols).toEqual([4, 4]);
            view.delete();
            table.delete();
        });
    });

    test.describe("2 sided", function () {
        test("float col", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["y"],
                split_by: ["z"],
            });
            const cols = await view.get_min_max("w");
            expect(cols).toEqual([-9.5, 9.5]);
            view.delete();
            table.delete();
        });

        test("int column", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["y"],
                split_by: ["z"],
            });
            const cols = await view.get_min_max("x");
            expect(cols).toEqual([1, 8]);
            view.delete();
            table.delete();
        });

        test("string column", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["y"],
                split_by: ["z"],
            });
            const cols = await view.get_min_max("y");
            expect(cols).toEqual([1, 3]);
            view.delete();
            table.delete();
        });
    });

    test.describe("column only", function () {
        test("float col", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["z"],
            });
            const cols = await view.get_min_max("w");
            expect(cols).toEqual([-9.5, 8.5]);
            view.delete();
            table.delete();
        });

        test("int col", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["z"],
            });
            const cols = await view.get_min_max("x");
            expect(cols).toEqual([1, 4]);
            view.delete();
            table.delete();
        });

        test("string col", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                split_by: ["z"],
            });
            const cols = await view.get_min_max("y");
            expect(cols).toEqual(["a", "d"]);
            view.delete();
            table.delete();
        });
    });
});
