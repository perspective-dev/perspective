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

const int_float_string_data = [
    { int: 1, float: 2.25, string: "a", datetime: new Date() },
    { int: 2, float: 3.5, string: "b", datetime: new Date() },
    { int: 3, float: 4.75, string: "c", datetime: new Date() },
    { int: 4, float: 5.25, string: "d", datetime: new Date() },
];

const pivoted_output = [
    {
        __ROW_PATH__: [],
        int: 10,
        float: 15.75,
        string: 4,
        datetime: 4,
        __INDEX__: [3, 2, 1, 0],
    },
    {
        __ROW_PATH__: [1],
        int: 1,
        float: 2.25,
        string: 1,
        datetime: 1,
        __INDEX__: [0],
    },
    {
        __ROW_PATH__: [2],
        int: 2,
        float: 3.5,
        string: 1,
        datetime: 1,
        __INDEX__: [1],
    },
    {
        __ROW_PATH__: [3],
        int: 3,
        float: 4.75,
        string: 1,
        datetime: 1,
        __INDEX__: [2],
    },
    {
        __ROW_PATH__: [4],
        int: 4,
        float: 5.25,
        string: 1,
        datetime: 1,
        __INDEX__: [3],
    },
];

((perspective) => {
    test.describe("data slice", function () {
        test("should filter out invalid start rows", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_row: 5,
            });
            expect(json).toEqual([]);
            view.delete();
            table.delete();
        });

        test("should filter out invalid start columns", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_col: 5,
            });
            expect(json).toEqual([]);
            view.delete();
            table.delete();
        });

        test("should filter out invalid start rows & columns", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_row: 5,
                start_col: 5,
            });
            expect(json).toEqual([]);
            view.delete();
            table.delete();
        });

        test("should filter out invalid start rows based on view", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                filter: [["float", ">", 3.5]],
            });

            // valid on view() but not this filtered view
            let json = await view.to_json({
                start_row: 3,
            });

            expect(json).toEqual([]);

            view.delete();
            table.delete();
        });

        test("should filter out invalid start columns based on view", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                columns: ["float", "int"],
            });

            let json = await view.to_json({
                start_col: 2,
            });

            expect(json).toEqual([]);
            view.delete();
            table.delete();
        });

        test("should filter out invalid start rows & columns based on view", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                columns: ["float", "int"],
                filter: [["float", ">", 3.5]],
            });
            let json = await view.to_json({
                start_row: 5,
                start_col: 5,
            });
            expect(json).toEqual([]);
            view.delete();
            table.delete();
        });

        test("should respect start/end rows", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_row: 2,
                end_row: 3,
            });
            let comparator = int_float_string_data[2];
            comparator.datetime = +comparator.datetime;
            expect(json[0]).toEqual(comparator);
            view.delete();
            table.delete();
        });

        test("should respect end rows when larger than data size", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_row: 2,
                end_row: 6,
            });
            expect(json).toEqual(
                int_float_string_data.slice(2).map((x) => {
                    x.datetime = +x.datetime;
                    return x;
                })
            );
            view.delete();
            table.delete();
        });

        test("should respect start/end columns", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_columns({
                start_col: 2,
                end_col: 3,
            });
            let comparator = {
                string: int_float_string_data.map((d) => d.string),
            };
            expect(json).toEqual(comparator);
            view.delete();
            table.delete();
        });

        test("should floor float start rows", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_row: 1.5,
            });
            expect(json).toEqual(
                int_float_string_data.slice(1).map((x) => {
                    x.datetime = +x.datetime;
                    return x;
                })
            );
            view.delete();
            table.delete();
        });

        test("should ceil float end rows", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                end_row: 1.5,
            });
            expect(json).toEqual(
                // deep copy
                JSON.parse(JSON.stringify(int_float_string_data))
                    .slice(0, 2)
                    .map((x) => {
                        x.datetime = +new Date(x.datetime);
                        return x;
                    })
            );
            view.delete();
            table.delete();
        });

        test("should floor/ceil float start/end rows", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_row: 2.9,
                end_row: 2.4,
            });
            let comparator = int_float_string_data[2];
            comparator.datetime = +comparator.datetime;
            expect(json[0]).toEqual(comparator);
            view.delete();
            table.delete();
        });

        test("should ceil float end rows when larger than data size", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_json({
                start_row: 2,
                end_row: 5.5,
            });
            expect(json).toEqual(
                int_float_string_data.slice(2).map((x) => {
                    x.datetime = +x.datetime;
                    return x;
                })
            );
            view.delete();
            table.delete();
        });

        test("should floor/ceil float start/end columns", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let json = await view.to_columns({
                start_col: 2.6,
                end_col: 2.4,
            });
            let comparator = {
                string: int_float_string_data.map((d) => d.string),
            };
            expect(json).toEqual(comparator);
            view.delete();
            table.delete();
        });

        test("one-sided views should have row paths", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
            });
            let json = await view.to_json();
            for (let d of json) {
                expect(d.__ROW_PATH__).toBeDefined();
            }
            view.delete();
            table.delete();
        });

        test("one-sided views with start_col > 0 should have row paths", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
            });
            let json = await view.to_json({ start_col: 1 });
            for (let d of json) {
                expect(d.__ROW_PATH__).toBeDefined();
            }
            view.delete();
            table.delete();
        });

        test("one-sided column-only views should not have row paths", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                split_by: ["int"],
            });
            let json = await view.to_json();
            for (let d of json) {
                expect(d.__ROW_PATH__).toBeUndefined();
            }
            view.delete();
            table.delete();
        });

        test("column-only views should not have header rows", async function () {
            let table = await perspective.table([
                { x: 1, y: "a" },
                { x: 2, y: "b" },
            ]);
            let view = await table.view({
                split_by: ["x"],
            });
            let json = await view.to_json();
            expect(json).toEqual([
                { "1|x": 1, "1|y": "a", "2|x": null, "2|y": null },
                { "1|x": null, "1|y": null, "2|x": 2, "2|y": "b" },
            ]);
            view.delete();
            table.delete();
        });

        test("column-only views should return correct windows of data", async function () {
            let table = await perspective.table([
                { x: 1, y: "a" },
                { x: 2, y: "b" },
            ]);
            let view = await table.view({
                split_by: ["x"],
            });
            let json = await view.to_json({
                start_row: 1,
            });
            expect(json).toEqual([
                { "1|x": null, "1|y": null, "2|x": 2, "2|y": "b" },
            ]);
            view.delete();
            table.delete();
        });

        test("two-sided views should have row paths", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
                split_by: ["string"],
            });
            let json = await view.to_json();
            for (let d of json) {
                expect(d.__ROW_PATH__).toBeDefined();
            }
            view.delete();
            table.delete();
        });

        test("two-sided views with start_col > 0 should have row paths", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
                split_by: ["string"],
            });
            let json = await view.to_json({ start_col: 1 });
            for (let d of json) {
                expect(d.__ROW_PATH__).toBeDefined();
            }
            view.delete();
            table.delete();
        });

        test("two-sided sorted views with start_col > 0 should have row paths", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
                split_by: ["string"],
                sort: [["string", "desc"]],
            });
            let json = await view.to_json({ start_col: 1 });
            for (let d of json) {
                expect(d.__ROW_PATH__).toBeDefined();
            }
            view.delete();
            table.delete();
        });
    });

    test.describe("to_json", function () {
        test("should emit same number of column names as number of pivots", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
                split_by: ["float", "string"],
                sort: [["int", "asc"]],
            });
            let json = await view.to_json();
            // Get the first emitted column name that is not __ROW_PATH__
            let name = Object.keys(json[0])[1];
            // make sure that number of separators = num of split by
            expect((name.match(/\|/g) || []).length).toEqual(2);
            view.delete();
            table.delete();
        });

        test("should return dates in native form by default", async function () {
            let table = await perspective.table([
                { datetime: new Date("2016-06-13") },
                { datetime: new Date("2016-06-14") },
            ]);
            let view = await table.view();
            let json = await view.to_json();
            expect(json).toEqual([
                { datetime: 1465776000000 },
                { datetime: 1465862400000 },
            ]);
            view.delete();
            table.delete();
        });

        test("should return dates in readable format on passing string in options", async function () {
            let table = await perspective.table([
                { datetime: new Date("2016-06-13") },
                { datetime: new Date("2016-06-14") },
            ]);
            let view = await table.view();
            let json = await view.to_json({ formatted: true });
            expect(json).toEqual([
                { datetime: "2016-06-13" },
                { datetime: "2016-06-14" },
            ]);
            view.delete();
            table.delete();
        });

        test("should return datetimes in readable format on passing string in options", async function () {
            let table = await perspective.table([
                { datetime: new Date(2016, 0, 1, 0, 30) },
                { datetime: new Date(2016, 5, 15, 19, 20) },
            ]);
            let view = await table.view();
            let json = await view.to_json({ formatted: true });
            expect(json).toEqual([
                { datetime: "2016-01-01 00:30:00.000" },
                { datetime: "2016-06-15 19:20:00.000" },
            ]);
            view.delete();
            table.delete();
        });
    });

    test.describe("leaves_only flag", function () {
        test("only emits leaves when leaves_only is set", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
            });
            let json = await view.to_json({ leaves_only: true });
            expect(json).toEqual([
                {
                    __ROW_PATH__: [1],
                    datetime: 1,
                    float: 2.25,
                    int: 1,
                    string: 1,
                },
                {
                    __ROW_PATH__: [2],
                    datetime: 1,
                    float: 3.5,
                    int: 2,
                    string: 1,
                },
                {
                    __ROW_PATH__: [3],
                    datetime: 1,
                    float: 4.75,
                    int: 3,
                    string: 1,
                },
                {
                    __ROW_PATH__: [4],
                    datetime: 1,
                    float: 5.25,
                    int: 4,
                    string: 1,
                },
            ]);
            view.delete();
            table.delete();
        });
    });

    test.describe("to_arrow()", function () {
        test("serializes boolean arrays correctly", async function () {
            // prevent regression in boolean parsing
            let table = await perspective.table({
                bool: [true, false, true, false, true, false, false],
            });
            let view = await table.view();
            let arrow = await view.to_arrow();
            let json = await view.to_json();

            expect(json).toEqual([
                { bool: true },
                { bool: false },
                { bool: true },
                { bool: false },
                { bool: true },
                { bool: false },
                { bool: false },
            ]);

            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();
            expect(json2).toEqual(json);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("does not break when booleans are undefined", async function () {
            let table = await perspective.table([
                { int: 1, bool: true },
                { int: 2, bool: false },
                { int: 3, bool: true },
                { int: 4, bool: undefined },
            ]);
            let view = await table.view();
            let arrow = await view.to_arrow();
            let json = await view.to_json();

            expect(json).toEqual([
                { int: 1, bool: true },
                { int: 2, bool: false },
                { int: 3, bool: true },
                { int: 4, bool: null },
            ]);

            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();
            expect(json2).toEqual(json);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("arrow output respects start/end rows", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let arrow = await view.to_arrow({
                start_row: 1,
                end_row: 2,
            });
            let json2 = await view.to_json();
            //expect(arrow.byteLength).toEqual(1010);

            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json = await view2.to_json();
            expect(json).toEqual(json2.slice(1, 2));

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 0-sided", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let arrow = await view.to_arrow();
            let json2 = await view.to_json();
            //expect(arrow.byteLength).toEqual(1010);

            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json = await view2.to_json();
            expect(json).toEqual(json2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 0-sided hidden sort", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                columns: ["float"],
                sort: [["string", "desc"]],
            });
            let arrow = await view.to_arrow();
            let json2 = await view.to_json();
            //expect(arrow.byteLength).toEqual(1010);

            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json = await view2.to_json();
            expect(json).toEqual(json2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 0-sided, with row range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let arrow = await view.to_arrow({ start_row: 1, end_row: 3 });
            let json2 = await view.to_json({ start_row: 1, end_row: 3 });
            // expect(arrow.byteLength).toEqual(908);

            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json = await view2.to_json();
            expect(json).toEqual(json2);
            expect(json.length).toEqual(2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 0-sided, with col range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view();
            let arrow = await view.to_arrow({ start_col: 1, end_col: 3 });
            let json2 = await view.to_json({ start_col: 1, end_col: 3 });
            // expect(arrow.byteLength).toEqual(908);

            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json = await view2.to_json();
            expect(json).toEqual(json2);
            expect(json.length).toEqual(4);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 1-sided", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({ group_by: ["string"] });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Arrow output 1-sided mean", async function () {
            let table = await perspective.table({
                float: [1.25, 2.25, 3.25, 4.25],
                string: ["a", "a", "b", "b"],
            });
            let view = await table.view({
                group_by: ["string"],
                aggregates: { float: "mean" },
            });
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let result = await view2.to_columns();

            expect(result).toEqual({
                "string (Group by 1)": [null, "a", "b"],
                float: [2.75, 1.75, 3.75],
                string: [4, 2, 2],
            });

            await view2.delete();
            await table2.delete();
            await view.delete();
            await table.delete();
        });

        test("Transitive arrow output 1-sided mean", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                aggregates: { float: "mean" },
            });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 1-sided sorted mean", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                aggregates: { float: "mean" },
                sort: [["string", "desc"]],
            });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });
        test("Transitive arrow output 1-sided hidden sort mean", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                aggregates: { float: "mean" },
                columns: ["float", "int"],
                sort: [["string", "desc"]],
            });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 1-sided with row range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({ group_by: ["string"] });
            let json = await view.to_json({ start_row: 1, end_row: 3 });
            let arrow = await view.to_arrow({ start_row: 1, end_row: 3 });
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 1-sided with col range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({ group_by: ["string"] });
            let json = await view.to_json({ start_col: 1, end_col: 3 });
            let arrow = await view.to_arrow({ start_col: 1, end_col: 3 });
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                split_by: ["int"],
            });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided sorted", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                split_by: ["int"],
                sort: [["int", "desc"]],
            });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided with row range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                split_by: ["int"],
            });
            let json = await view.to_json({ start_row: 1, end_row: 3 });
            let arrow = await view.to_arrow({ start_row: 1, end_row: 3 });
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided with col range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                split_by: ["int"],
            });
            let json = await view.to_json({ start_col: 1, end_col: 3 });
            let arrow = await view.to_arrow({ start_col: 1, end_col: 3 });
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(
                json2.map((x) => {
                    x.__ROW_PATH__ = [x["string (Group by 1)"]].filter(
                        (x) => x
                    );
                    delete x["string (Group by 1)"];
                    return x;
                })
            );

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided column only", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({ split_by: ["string"] });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(json2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided column only hidden sort", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                split_by: ["string"],
                columns: ["float"],
                sort: [["int", "desc"]],
            });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(json2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided column only sorted", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                split_by: ["string"],
                sort: [["int", "desc"]],
            });
            let json = await view.to_json();
            let arrow = await view.to_arrow();
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(json2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided column only row range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({ split_by: ["string"] });
            let json = await view.to_json({ start_row: 1, end_row: 3 });
            let arrow = await view.to_arrow({ start_row: 1, end_row: 3 });
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(json2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test("Transitive arrow output 2-sided column only col range", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({ split_by: ["string"] });
            let json = await view.to_json({ start_col: 1, end_col: 3 });
            let arrow = await view.to_arrow({ start_col: 1, end_col: 3 });
            let table2 = await perspective.table(arrow);
            let view2 = await table2.view();
            let json2 = await view2.to_json();

            expect(json).toEqual(json2);

            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });

        test.describe("to_format with index", function () {
            test.describe("0-sided", function () {
                test("should return correct pkey for unindexed table", async function () {
                    let table = await perspective.table(int_float_string_data);
                    let view = await table.view();
                    let json = await view.to_json({
                        start_row: 0,
                        end_row: 1,
                        start_col: 1,
                        end_col: 2,
                        index: true,
                    });
                    expect(json).toEqual([{ float: 2.25, __INDEX__: [0] }]);
                    view.delete();
                    table.delete();
                });

                test("should return correct pkey for float indexed table", async function () {
                    let table = await perspective.table(int_float_string_data, {
                        index: "float",
                    });
                    let view = await table.view();
                    let json = await view.to_json({
                        start_row: 0,
                        end_row: 1,
                        start_col: 1,
                        end_col: 2,
                        index: true,
                    });
                    expect(json).toEqual([{ float: 2.25, __INDEX__: [2.25] }]);
                    view.delete();
                    table.delete();
                });

                test("should return correct pkey for string indexed table", async function () {
                    let table = await perspective.table(int_float_string_data, {
                        index: "string",
                    });
                    let view = await table.view();
                    let json = await view.to_json({
                        start_row: 0,
                        end_row: 1,
                        start_col: 1,
                        end_col: 2,
                        index: true,
                    });
                    expect(json).toEqual([{ float: 2.25, __INDEX__: ["a"] }]);
                    view.delete();
                    table.delete();
                });

                test("should return correct pkey for date indexed table", async function () {
                    // default data generates the same datetime for each row, thus pkeys get collapsed
                    const data = [
                        { int: 1, datetime: new Date() },
                        { int: 2, datetime: new Date() },
                    ];
                    data[1].datetime.setDate(data[1].datetime.getDate() + 1);
                    let table = await perspective.table(data, {
                        index: "datetime",
                    });
                    let view = await table.view();
                    let json = await view.to_json({
                        start_row: 1,
                        end_row: 2,
                        index: true,
                    });
                    expect(json).toEqual([
                        {
                            int: 2,
                            datetime: data[1].datetime.getTime(),
                            __INDEX__: [data[1].datetime.getTime()],
                        },
                    ]);
                    view.delete();
                    table.delete();
                });

                test("should return correct pkey for all rows + columns on an unindexed table", async function () {
                    let table = await perspective.table(int_float_string_data);
                    let view = await table.view();
                    let json = await view.to_json({
                        index: true,
                    });

                    for (let i = 0; i < json.length; i++) {
                        expect(json[i].__INDEX__).toEqual([i]);
                    }
                    view.delete();
                    table.delete();
                });

                test("should return correct pkey for all rows + columns on an indexed table", async function () {
                    let table = await perspective.table(int_float_string_data, {
                        index: "string",
                    });
                    let view = await table.view();
                    let json = await view.to_json({
                        index: true,
                    });

                    let pkeys = ["a", "b", "c", "d"];
                    for (let i = 0; i < json.length; i++) {
                        expect(json[i].__INDEX__).toEqual([pkeys[i]]);
                    }
                    view.delete();
                    table.delete();
                });
            });
        });

        test.describe("0-sided column subset", function () {
            test("should return correct pkey for unindexed table", async function () {
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    columns: ["int", "datetime"],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([
                    {
                        datetime:
                            int_float_string_data[0]["datetime"].getTime(),
                        __INDEX__: [0],
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for float indexed table", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "float",
                });
                let view = await table.view({
                    columns: ["float", "int"],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([{ int: 1, __INDEX__: [2.25] }]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for string indexed table", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "string",
                });
                let view = await table.view({
                    columns: ["string", "datetime"],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([
                    {
                        datetime:
                            int_float_string_data[0]["datetime"].getTime(),
                        __INDEX__: ["a"],
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for date indexed table", async function () {
                // default data generates the same datetime for each row, thus pkeys get collapsed
                const data = [
                    { int: 1, datetime: new Date() },
                    { int: 2, datetime: new Date() },
                ];
                data[1].datetime.setDate(data[1].datetime.getDate() + 1);
                let table = await perspective.table(data, {
                    index: "datetime",
                });
                let view = await table.view({
                    columns: ["int"],
                });
                let json = await view.to_json({
                    start_row: 1,
                    end_row: 2,
                    index: true,
                });
                expect(json).toEqual([
                    { int: 2, __INDEX__: [data[1].datetime.getTime()] },
                ]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for all rows + columns on an unindexed table", async function () {
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    columns: ["int"],
                });
                let json = await view.to_json({
                    index: true,
                });

                for (let i = 0; i < json.length; i++) {
                    expect(json[i].__INDEX__).toEqual([i]);
                }
                view.delete();
                table.delete();
            });

            test("should return correct pkey for all rows + columns on an indexed table", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "string",
                });
                let view = await table.view();
                let json = await view.to_json({
                    index: true,
                });

                let pkeys = ["a", "b", "c", "d"];
                for (let i = 0; i < json.length; i++) {
                    expect(json[i].__INDEX__).toEqual([pkeys[i]]);
                }
                view.delete();
                table.delete();
            });
        });

        test.describe("0-sided column subset invalid bounds", function () {
            test("should return correct pkey for unindexed table, invalid column", async function () {
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    columns: ["int"],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([{ __INDEX__: [0] }]);
                view.delete();
                table.delete();
            });

            test("should not return pkey for unindexed table, invalid row", async function () {
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    columns: ["int"],
                });
                let json = await view.to_json({
                    start_row: 10,
                    end_row: 15,
                    index: true,
                });
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for float indexed table, invalid column", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "float",
                });
                let view = await table.view({
                    columns: ["float"],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([{ __INDEX__: [2.25] }]);
                view.delete();
                table.delete();
            });

            test("should not return pkey for float indexed table, invalid row", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "float",
                });
                let view = await table.view({
                    columns: ["float"],
                });
                let json = await view.to_json({
                    start_row: 10,
                    end_row: 15,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for string indexed table, invalid column", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "string",
                });
                let view = await table.view({
                    columns: ["string"],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([{ __INDEX__: ["a"] }]);
                view.delete();
                table.delete();
            });

            test("should not return pkey for string indexed table, invalid row", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "string",
                });
                let view = await table.view({
                    columns: ["string"],
                });
                let json = await view.to_json({
                    start_row: 10,
                    end_row: 11,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for date indexed table, invalid column", async function () {
                // default data generates the same datetime for each row, thus pkeys get collapsed
                const data = [
                    { int: 1, datetime: new Date() },
                    { int: 2, datetime: new Date() },
                ];
                data[1].datetime.setDate(data[1].datetime.getDate() + 1);
                let table = await perspective.table(data, {
                    index: "datetime",
                });
                let view = await table.view({
                    columns: ["int"],
                });
                let json = await view.to_json({
                    start_col: 1,
                    start_col: 2,
                    index: true,
                });
                expect(json).toEqual([
                    {
                        __INDEX__: [data[0].datetime.getTime()],
                    },
                    {
                        __INDEX__: [data[1].datetime.getTime()],
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("should not return pkey for date indexed table, invalid row", async function () {
                // default data generates the same datetime for each row, thus pkeys get collapsed
                const data = [
                    { int: 1, datetime: new Date() },
                    { int: 2, datetime: new Date() },
                ];
                data[1].datetime.setDate(data[1].datetime.getDate() + 1);
                let table = await perspective.table(data, {
                    index: "datetime",
                });
                let view = await table.view({
                    columns: ["int"],
                });
                let json = await view.to_json({
                    start_row: 11,
                    start_row: 12,
                    index: true,
                });
                expect(json).toEqual([]);
                view.delete();
                table.delete();
            });
        });

        test.describe("0-sided sorted", function () {
            test("should return correct pkey for unindexed table", async function () {
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    sort: [["float", "desc"]],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([{ float: 5.25, __INDEX__: [3] }]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for float indexed table", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "float",
                });
                let view = await table.view({
                    sort: [["float", "desc"]],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([{ float: 5.25, __INDEX__: [5.25] }]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for string indexed table", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "string",
                });
                let view = await table.view({
                    sort: [["float", "desc"]],
                });
                let json = await view.to_json({
                    start_row: 0,
                    end_row: 1,
                    start_col: 1,
                    end_col: 2,
                    index: true,
                });
                expect(json).toEqual([{ float: 5.25, __INDEX__: ["d"] }]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for date indexed table", async function () {
                // default data generates the same datetime for each row,
                // thus pkeys get collapsed
                const data = [
                    { int: 200, datetime: new Date() },
                    { int: 100, datetime: new Date() },
                ];
                data[1].datetime.setDate(data[1].datetime.getDate() + 1);
                let table = await perspective.table(data, {
                    index: "datetime",
                });
                let view = await table.view({
                    sort: [["int", "desc"]],
                });
                let json = await view.to_json({
                    index: true,
                });
                expect(json).toEqual([
                    {
                        int: 200,
                        datetime: data[0].datetime.getTime(),
                        __INDEX__: [data[0].datetime.getTime()],
                    },
                    {
                        int: 100,
                        datetime: data[1].datetime.getTime(),
                        __INDEX__: [data[1].datetime.getTime()],
                    },
                ]);
                view.delete();
                table.delete();
            });

            test("should return correct pkey for all rows + columns on an unindexed table", async function () {
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    sort: [["float", "asc"]],
                });
                let json = await view.to_json({
                    index: true,
                });

                for (let i = 0; i < json.length; i++) {
                    expect(json[i].__INDEX__).toEqual([i]);
                }
                view.delete();
                table.delete();
            });

            test("should return correct pkey for all rows + columns on an indexed table", async function () {
                let table = await perspective.table(int_float_string_data, {
                    index: "string",
                });
                let view = await table.view({
                    sort: [["float", "desc"]],
                });
                let json = await view.to_json({
                    index: true,
                });

                let pkeys = ["d", "c", "b", "a"];
                for (let i = 0; i < json.length; i++) {
                    expect(json[i].__INDEX__).toEqual([pkeys[i]]);
                }
                view.delete();
                table.delete();
            });
        });

        test.describe("1-sided", function () {
            test("should generate pkeys of aggregated rows for 1-sided", async function () {
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    group_by: ["int"],
                });
                let json = await view.to_json({
                    index: true,
                });

                // total row contains all pkeys for underlying rows; each aggregated row should have pkeys for the rows that belong to it
                expect(json).toEqual(pivoted_output);
                view.delete();
                table.delete();
            });
        });

        test.describe("2-sided", function () {
            test.skip("should generate pkey for 2-sided", async function () {
                // 2-sided implicit pkeys do not work
                let table = await perspective.table(int_float_string_data);
                let view = await table.view({
                    group_by: ["int"],
                    split_by: ["float"],
                });
                let json = await view.to_json({
                    index: true,
                });

                expect(json[0]["__INDEX__"]).toEqual([0, 1]); // total row should have indices for every row inside it

                let idx = 0;
                for (let item of json.slice(1)) {
                    expect(item["__INDEX__"]).toEqual([idx]);
                    idx++;
                }
            });
        });
    });
})(perspective);
