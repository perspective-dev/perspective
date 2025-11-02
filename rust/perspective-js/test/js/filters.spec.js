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
import * as arrows from "./test_arrows.js";

var yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

var now = new Date();

var data = [
    { w: now, x: 1, y: "a", z: true },
    { w: now, x: 2, y: "b", z: false },
    { w: now, x: 3, y: "c", z: true },
    { w: yesterday, x: 4, y: "d", z: false },
];

var rdata = [
    { w: +now, x: 1, y: "a", z: true },
    { w: +now, x: 2, y: "b", z: false },
    { w: +now, x: 3, y: "c", z: true },
    { w: +yesterday, x: 4, y: "d", z: false },
];

// starting from 09/01/2018 to 12/01/2018
var date_range_data = [
    { w: new Date(1535778060000), x: 1, y: "a", z: true }, // Sat Sep 01 2018 01:01:00 GMT-0400
    { w: new Date(1538370060000), x: 2, y: "b", z: false }, // Mon Oct 01 2018 01:01:00 GMT-0400
    { w: new Date(1541048460000), x: 3, y: "c", z: true }, // Thu Nov 01 2018 01:01:00 GMT-0400
    { w: new Date(1543644060000), x: 4, y: "d", z: false }, // Sat Dec 01 2018 01:01:00 GMT-0500
];

var r_date_range_data = [
    { w: +new Date(1535778060000), x: 1, y: "a", z: true },
    { w: +new Date(1538370060000), x: 2, y: "b", z: false },
    { w: +new Date(1541048460000), x: 3, y: "c", z: true },
    { w: +new Date(1543644060000), x: 4, y: "d", z: false },
];

const datetime_data = [
    { x: new Date(2019, 1, 28, 23, 59, 59) }, // 2019/02/28 23:59:59 GMT-0500
    { x: new Date(2020, 1, 29, 0, 0, 1) }, // 2020/02/29 00:00:01 GMT-0500
    { x: new Date(2020, 2, 8, 1, 59, 59) }, // 2020/03/8 01:59:59 GMT-0400
    { x: new Date(2020, 2, 8, 2, 0, 1) }, // 2020/03/8 02:00:01 GMT-0500
    { x: new Date(2020, 9, 1, 15, 11, 55) }, // 2020/10/01 15:30:55 GMT-0400
    { x: new Date(2020, 10, 1, 19, 29, 55) }, // 2020/11/01 19:30:55 GMT-0400
    { x: new Date(2020, 11, 31, 7, 42, 55) }, // 2020/12/31 07:30:55 GMT-0500
];

const datetime_data_local = [
    { x: new Date(2019, 1, 28, 23, 59, 59).toLocaleString() }, // 2019/02/28 23:59:59 GMT-0500
    { x: new Date(2020, 1, 29, 0, 0, 1).toLocaleString() }, // 2020/02/29 00:00:01 GMT-0500
    { x: new Date(2020, 2, 8, 1, 59, 59).toLocaleString() }, // 2020/03/8 01:59:59 GMT-0400
    { x: new Date(2020, 2, 8, 2, 0, 1).toLocaleString() }, // 2020/03/8 02:00:01 GMT-0500
    { x: new Date(2020, 9, 1, 15, 11, 55).toLocaleString() }, // 2020/10/01 15:30:55 GMT-0400
    { x: new Date(2020, 10, 1, 19, 29, 55).toLocaleString() }, // 2020/11/01 19:30:55 GMT-0400
    { x: new Date(2020, 11, 31, 7, 42, 55).toLocaleString() }, // 2020/12/31 07:30:55 GMT-0500
];

((perspective) => {
    test.describe("Filters", function () {
        test.describe("GT & LT", function () {
            test("filters on long strings", async function () {
                var table = await perspective.table([
                    { x: 1, y: "123456789012a", z: true },
                    { x: 2, y: "123456789012a", z: false },
                    { x: 3, y: "123456789012b", z: true },
                    { x: 4, y: "123456789012b", z: false },
                ]);
                var view = await table.view({
                    filter: [["y", "contains", "123456789012a"]],
                });
                let json = await view.to_json();
                expect(json.length).toEqual(2);
                view.delete();
                table.delete();
            });

            test("x > 2", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["x", ">", 2.0]],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(2));
                view.delete();
                table.delete();
            });

            test("x < 3", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["x", "<", 3.0]],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(0, 2));
                view.delete();
                table.delete();
            });

            test("x > 4", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["x", ">", 4]],
                });
                let json = await view.to_json();
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });

            test("x < 0", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["x", ">", 4]],
                });
                let json = await view.to_json();
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });

            test("w > datetime as string", async function () {
                var table = await perspective.table(date_range_data);
                var view = await table.view({
                    filter: [["w", ">", "10/01/2018"]],
                });
                let json = await view.to_json();
                expect(json).toEqual(r_date_range_data.slice(1, 4));
                view.delete();
                table.delete();
            });

            test("w < datetime as string", async function () {
                var table = await perspective.table(date_range_data);
                var view = await table.view({
                    filter: [["w", "<", "10/01/2018"]],
                });
                let json = await view.to_json();
                expect(json).toEqual([r_date_range_data[0]]);
                view.delete();
                table.delete();
            });

            test.describe("filtering on date column", function () {
                const schema = {
                    w: "date",
                };

                const date_results = [
                    { w: +new Date(1535760000000) }, // Fri Aug 31 2018 20:00:00 GMT-0400
                    { w: +new Date(1538352000000) }, // Sun Sep 30 2018 20:00:00 GMT-0400
                    { w: +new Date(1541030400000) }, // Wed Oct 31 2018 20:00:00 GMT-0400
                    { w: +new Date(1543622400000) }, // Fri Nov 30 2018 19:00:00 GMT-0500
                ];

                test("w > date as string", async function () {
                    var table = await perspective.table(schema);
                    await table.update(date_results);
                    var view = await table.view({
                        filter: [["w", ">", "10/02/2018"]],
                    });
                    let json = await view.to_json();
                    expect(json).toEqual(date_results.slice(2, 4));
                    view.delete();
                    table.delete();
                });

                test("w > date as number", async function () {
                    var table = await perspective.table(schema);
                    await table.update(date_results);
                    var view = await table.view({
                        filter: [["w", ">", 1538352000000]],
                    });
                    let json = await view.to_json();
                    expect(json).toEqual(date_results.slice(2, 4));
                    view.delete();
                    table.delete();
                });

                test("w < date as string", async function () {
                    var table = await perspective.table(schema);
                    await table.update(date_results);
                    var view = await table.view({
                        filter: [["w", "<", "10/02/2018"]],
                    });
                    let json = await view.to_json();
                    expect(json).toEqual(date_results.slice(0, 2));
                    view.delete();
                    table.delete();
                });
            });
        });

        test.describe("EQ", function () {
            test("x == 1", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["x", "==", 1]],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(0, 1));
                view.delete();
                table.delete();
            });

            test("empty, pivoted", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    group_by: ["y"],
                    filter: [["x", "==", 100]],
                });
                let json = await view.to_json();
                expect(json).toEqual([
                    // empty sum
                    { __ROW_PATH__: [], w: 0, x: null, y: 0, z: 0 },
                ]);
                view.delete();
                table.delete();
            });

            test("x == 1, rolling updates", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    columns: ["x"],
                    filter: [["x", "==", 1]],
                });
                let json = await view.to_json();
                expect(json).toEqual([{ x: 1 }]);

                for (let i = 0; i < 5; i++) {
                    await table.update([{ x: 1 }]);
                }

                expect(await view.to_columns()).toEqual({
                    x: [1, 1, 1, 1, 1, 1],
                });

                await table.update([{ x: 2 }]);

                expect(await view.to_columns()).toEqual({
                    x: [1, 1, 1, 1, 1, 1],
                });

                view.delete();
                table.delete();
            });

            test.skip("x == 1 pivoted, rolling updates", async function () {
                var table = await perspective.table(
                    {
                        a: [1, 2, 3, 4],
                        b: ["a", "b", "c", "d"],
                        c: ["A", "B", "C", "D"],
                    },
                    {
                        index: "c",
                    },
                );
                var view = await table.view({
                    group_by: ["a"],
                    columns: ["b", "c"],
                });

                let out = await view.to_columns();
                expect(out["__ROW_PATH__"]).toEqual([[], [1], [2], [3], [4]]);

                for (let i = 0; i < 5; i++) {
                    await table.update([{ x: 1 }]);
                }

                expect(await view.to_columns()).toEqual({
                    x: [1, 1, 1, 1, 1, 1],
                });

                await table.update([{ x: 2 }]);

                expect(await view.to_columns()).toEqual({
                    x: [1, 1, 1, 1, 1, 1],
                });

                view.delete();
                table.delete();
            });

            test("x == 5", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["x", "==", 5]],
                });
                let json = await view.to_json();
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });

            test("y == 'a'", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["y", "==", "a"]],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(0, 1));
                view.delete();
                table.delete();
            });

            test("y == 'e'", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["y", "==", "e"]],
                });
                let json = await view.to_json();
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });

            test("y == 'abcdefghijklmnopqrstuvwxyz' (interned)", async function () {
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

                const table = await perspective.table(data);
                const view = await table.view({
                    filter: [["y", "==", "abcdefghijklmnopqrstuvwxyz"]],
                });

                const json = await view.to_json();
                expect(json).toEqual([data[3]]);
                view.delete();
                table.delete();
            });

            test("z == true", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["z", "==", true]],
                });
                let json = await view.to_json();
                expect(json).toEqual([rdata[0], rdata[2]]);
                view.delete();
                table.delete();
            });

            test("z == false", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["z", "==", false]],
                });
                let json = await view.to_json();
                expect(json).toEqual([rdata[1], rdata[3]]);
                view.delete();
                table.delete();
            });

            test("w == yesterday", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["w", "==", yesterday]],
                });
                let json = await view.to_json();
                expect(json).toEqual([rdata[3]]);
                view.delete();
                table.delete();
            });

            test("w != yesterday", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["w", "!=", yesterday]],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(0, 3));
                view.delete();
                table.delete();
            });

            test("w == datetime as Date() object", async function () {
                const table = await perspective.table({ x: "datetime" });
                await table.update(datetime_data);
                expect(await table.schema()).toEqual({
                    x: "datetime",
                });
                const view = await table.view({
                    filter: [["x", "==", datetime_data[0]["x"]]],
                });
                expect(await view.num_rows()).toBe(1);
                let data = await view.to_json();
                data = data.map((d) => {
                    d.x = new Date(d.x);
                    return d;
                });
                expect(data).toEqual(datetime_data.slice(0, 1));
                await view.delete();
                await table.delete();
            });

            test("w == datetime as Number", async function () {
                const table = await perspective.table({ x: "datetime" });
                await table.update(datetime_data);
                expect(await table.schema()).toEqual({
                    x: "datetime",
                });

                const view = await table.view({
                    filter: [["x", "==", +datetime_data[0]["x"]]],
                });

                expect(await view.num_rows()).toBe(1);
                let data = await view.to_json();
                data = data.map((d) => {
                    d.x = new Date(d.x);
                    return d;
                });

                expect(data).toEqual(datetime_data.slice(0, 1));
                await view.delete();
                await table.delete();
            });

            test("w == datetime as US locale string", async function () {
                const table = await perspective.table({ x: "datetime" });
                await table.update(datetime_data);

                expect(await table.schema()).toEqual({
                    x: "datetime",
                });
                const view = await table.view({
                    filter: [["x", "==", datetime_data_local[0]["x"]]],
                });
                expect(await view.num_rows()).toBe(1);
                let data = await view.to_json();
                data = data.map((d) => {
                    d.x = new Date(d.x);
                    return d;
                });
                expect(data).toEqual(datetime_data.slice(0, 1));
                await view.delete();
                await table.delete();
            });
        });

        test.describe("in", function () {
            test("y in ['a', 'b']", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["y", "in", ["a", "b"]]],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(0, 2));
                view.delete();
                table.delete();
            });
        });

        test.describe("not in", function () {
            test("y not in ['d']", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["y", "not in", ["d"]]],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(0, 3));
                view.delete();
                table.delete();
            });
        });

        test.describe("contains", function () {
            test("y contains 'a'", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [["y", "contains", "a"]],
                });
                let json = await view.to_json();
                expect(rdata.slice(0, 1)).toEqual(json);
                view.delete();
                table.delete();
            });
        });

        test.describe("Arrow types", function () {
            // https://github.com/perspective-dev/perspective/issues/2881
            test("Arrow float32 filters", async function () {
                const table = await perspective.table(
                    arrows.float32_arrow.slice(),
                );

                const view = await table.view({ filter: [["score", "<", 93]] });
                const result = await view.to_columns();
                expect(result).toEqual({
                    id: [1, 2],
                    name: ["Alice", "Bob"],
                    score: [92.5, 87.30000305175781],
                });

                const cfg = await view.get_config();
                expect(cfg).toEqual({
                    aggregates: {},
                    columns: ["id", "name", "score"],
                    expressions: {},
                    filter: [["score", "<", 93]],
                    group_by: [],
                    sort: [],
                    split_by: [],
                });

                view.delete();
                table.delete();
            });
        });

        test.describe("multiple", function () {
            test("x > 1 & x < 4", async function () {
                var table = await perspective.table(data);
                var view = await table.view({
                    filter: [
                        ["x", ">", 1],
                        ["x", "<", 4],
                    ],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(1, 3));
                view.delete();
                table.delete();
            });

            test("y contains 'a' OR y contains 'b'", async function () {
                var table = await perspective.table(data);
                // when `filter_op` is provided, perspective returns data differently. In this case, returned data should satisfy either/or of the filter conditions.
                var view = await table.view({
                    filter_op: "or",
                    filter: [
                        ["y", "contains", "a"],
                        ["y", "contains", "b"],
                    ],
                });
                let json = await view.to_json();
                expect(json).toEqual(rdata.slice(0, 2));
                view.delete();
                table.delete();
            });
        });

        test.describe("long strings", function () {
            test("", async function () {
                const data = [
                    {
                        field: 100,
                        index: "1",
                        title: "s15",
                        ts: "2024-11-30T06:50:10.214Z",
                    },
                    {
                        field: 100,
                        index: "2",
                        title: "sys_c_c 15min",
                        ts: "2024-11-30T07:06:00.763Z",
                    },
                    {
                        field: 100,
                        index: "3",
                        title: "s15",
                        ts: "2024-12-01T06:50:15.596Z",
                    },
                    {
                        field: 100,
                        index: "4",
                        title: "sys_c_c 15min",
                        ts: "2024-12-01T07:06:04.909Z",
                    },
                    {
                        field: 100,
                        index: "5",
                        title: "s15",
                        ts: "2024-12-02T06:50:24.712Z",
                    },
                    {
                        field: 100,
                        index: "6",
                        title: "sys_c_c 15min",
                        ts: "2024-12-02T07:06:15.339Z",
                    },
                    {
                        field: 100,
                        index: "7",
                        title: "s15",
                        ts: "2024-12-03T06:50:22.144Z",
                    },
                    {
                        field: 100,
                        index: "8",
                        title: "sys_c_c 15min",
                        ts: "2024-12-03T07:06:20.146Z",
                    },
                ];

                const config = {
                    group_by: ["ts"],
                    split_by: [],
                    columns: ["field"],
                    filter: [
                        ["title", "in", ["sys_c_c 15min"]],
                        ["ts", ">=", "2024-12-01T00:00:00.000Z"],
                        ["ts", "<=", "2024-12-02T23:59:59.999Z"],
                    ],
                    expressions: {},
                    aggregates: {},
                };

                const table = await perspective.table(
                    {
                        title: "string",
                        field: "float",
                        ts: "datetime",
                        index: "string",
                    },
                    { index: "index" },
                );

                let x, y;
                let xx = new Promise((xxx) => {
                    x = xxx;
                });
                let yy = new Promise((yyy) => {
                    y = yyy;
                });

                await table.view(config).then((view) => {
                    view.on_update(() => view.to_json().then(x));
                });

                await table.view(config).then((view) => {
                    view.on_update(() => view.to_json().then(y));
                });

                await table.update(data);
                const [xxx, yyy] = await Promise.all([xx, yy]);
                expect(xxx).toEqual(yyy);
            });
        });

        test.describe("is null", function () {
            test("returns the correct null cells for string column", async function () {
                const table = await perspective.table([
                    { x: 1, y: null },
                    { x: 2, y: null },
                    { x: 3, y: "x" },
                    { x: 4, y: "x" },
                    { x: 1, y: "y" },
                    { x: 2, y: "x" },
                    { x: 3, y: "y" },
                ]);
                const view = await table.view({
                    filter: [["y", "is null"]],
                });
                const answer = [
                    { x: 1, y: null },
                    { x: 2, y: null },
                ];
                const result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("returns the correct null cells for integer column", async function () {
                const table = await perspective.table([
                    { x: 1, y: null },
                    { x: 2, y: null },
                    { x: 3, y: 1 },
                    { x: 4, y: 2 },
                    { x: 1, y: 3 },
                    { x: 2, y: 4 },
                    { x: 3, y: 5 },
                ]);
                const view = await table.view({
                    filter: [["y", "is null"]],
                });
                const answer = [
                    { x: 1, y: null },
                    { x: 2, y: null },
                ];
                const result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("returns the correct null cells for datetime column", async function () {
                const table = await perspective.table([
                    { x: 1, y: null },
                    { x: 2, y: null },
                    { x: 3, y: "1/1/2019" },
                    { x: 4, y: "1/1/2019" },
                    { x: 1, y: "1/1/2019" },
                    { x: 2, y: "1/1/2019" },
                    { x: 3, y: "1/1/2019" },
                ]);
                const view = await table.view({
                    filter: [["y", "is null"]],
                });
                const answer = [
                    { x: 1, y: null },
                    { x: 2, y: null },
                ];
                const result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });
        });

        test.describe("nulls", function () {
            test("x > 2", async function () {
                var table = await perspective.table([
                    { x: 3, y: 1 },
                    { x: 2, y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: 4, y: 2 },
                    { x: null, y: 2 },
                ]);
                var view = await table.view({
                    filter: [["x", ">", 2]],
                });
                var answer = [
                    { x: 3, y: 1 },
                    { x: 4, y: 2 },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("x < 3", async function () {
                var table = await perspective.table([
                    { x: 3, y: 1 },
                    { x: 2, y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: 4, y: 2 },
                    { x: null, y: 2 },
                ]);
                var view = await table.view({
                    filter: [["x", "<", 3]],
                });
                var answer = [{ x: 2, y: 1 }];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("x > 2.5", async function () {
                var table = await perspective.table({
                    x: "float",
                    y: "integer",
                });
                await table.update([
                    { x: 3.5, y: 1 },
                    { x: 2.5, y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: 4.5, y: 2 },
                    { x: null, y: 2 },
                ]);
                var view = await table.view({
                    filter: [["x", ">", 2.5]],
                });
                var answer = [
                    { x: 3.5, y: 1 },
                    { x: 4.5, y: 2 },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test.skip("x > null should be an invalid filter", async function () {
                var table = await perspective.table({
                    x: "float",
                    y: "integer",
                });
                const dataSet = [
                    { x: 3.5, y: 1 },
                    { x: 2.5, y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: 4.5, y: 2 },
                    { x: null, y: 2 },
                ];
                await table.update(dataSet);
                var view = await table.view({
                    filter: [["x", ">", null]],
                });
                var answer = dataSet;
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("x == 'a'", async function () {
                var table = await perspective.table([
                    { x: "b", y: 1 },
                    { x: "a", y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: "a", y: 2 },
                    { x: "b", y: 2 },
                    { x: null, y: 2 },
                ]);
                var view = await table.view({
                    filter: [["x", "==", "a"]],
                });
                var answer = [
                    { x: "a", y: 1 },
                    { x: "a", y: 2 },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("x != 'a'", async function () {
                var table = await perspective.table([
                    { x: "b", y: 1 },
                    { x: "a", y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: "a", y: 2 },
                    { x: "b", y: 2 },
                    { x: null, y: 2 },
                ]);
                var view = await table.view({
                    filter: [["x", "!=", "a"]],
                });
                var answer = [
                    { x: "b", y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: "b", y: 2 },
                    { x: null, y: 2 },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });

            test("x == 'b'", async function () {
                var table = await perspective.table([
                    { x: "b", y: 1 },
                    { x: "a", y: 1 },
                    { x: null, y: 1 },
                    { x: null, y: 1 },
                    { x: "a", y: 2 },
                    { x: "b", y: 2 },
                    { x: null, y: 2 },
                ]);
                var view = await table.view({
                    filter: [["x", "==", "b"]],
                });
                var answer = [
                    { x: "b", y: 1 },
                    { x: "b", y: 2 },
                ];
                let result = await view.to_json();
                expect(result).toEqual(answer);
                view.delete();
                table.delete();
            });
        });

        // TODO `is_valid_filter` is not currently used and is soon to be replaced by `validate()`
        test.describe.skip("is_valid_filter", function () {
            test("x == 2", async function () {
                let table = await perspective.table(data);
                let isValid = await table.is_valid_filter(["x", "==", 2]);
                expect(isValid).toBeTruthy();
                table.delete();
            });
            test("x < null", async function () {
                let table = await perspective.table(data);
                let isValid = await table.is_valid_filter(["x", "<", null]);
                expect(isValid).toBeFalsy();
                table.delete();
            });
            test("x > undefined", async function () {
                let table = await perspective.table(data);
                let isValid = await table.is_valid_filter([
                    "x",
                    ">",
                    undefined,
                ]);
                expect(isValid).toBeFalsy();
                table.delete();
            });
            test('x == ""', async function () {
                let table = await perspective.table(data);
                let isValid = await table.is_valid_filter(["x", "==", ""]);
                expect(isValid).toBeTruthy();
                table.delete();
            });
            test("valid date", async function () {
                const schema = {
                    x: "string",
                    y: "date",
                };
                let table = await perspective.table(schema);
                let isValid = await table.is_valid_filter([
                    "y",
                    "==",
                    "01-01-1970",
                ]);
                expect(isValid).toBeTruthy();
                table.delete();
            });
            test("invalid date", async function () {
                const schema = {
                    x: "string",
                    y: "date",
                };
                let table = await perspective.table(schema);
                let isValid = await table.is_valid_filter(["y", "<", "1234"]);
                expect(isValid).toBeFalsy();
                table.delete();
            });
            test("valid datetime", async function () {
                const schema = {
                    x: "string",
                    y: "datetime",
                };
                let table = await perspective.table(schema);
                let isValid = await table.is_valid_filter([
                    "y",
                    "==",
                    "2019-11-02 11:11:11.111",
                ]);
                expect(isValid).toBeTruthy();
                table.delete();
            });
            test("invalid datetime", async function () {
                const schema = {
                    x: "string",
                    y: "datetime",
                };
                let table = await perspective.table(schema);
                let isValid = await table.is_valid_filter([
                    "y",
                    ">",
                    "2019-11-02 11:11:11:111",
                ]);
                expect(isValid).toBeFalsy();
                table.delete();
            });
            test("ignores schema check if column is not in schema", async function () {
                let table = await perspective.table(data);
                let isValid = await table.is_valid_filter([
                    "not a valid column",
                    "==",
                    2,
                ]);
                expect(isValid).toBeTruthy();
                table.delete();
            });
        });
    });
})(perspective);
