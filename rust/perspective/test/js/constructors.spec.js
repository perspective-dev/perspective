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

import moment from "moment";
import * as arrows from "./test_arrows.js";

const data = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
];

const col_data = {
    x: [1, 2, 3, 4],
    y: ["a", "b", "c", "d"],
    z: [true, false, true, false],
};

const meta = {
    x: "integer",
    y: "string",
    z: "boolean",
};

const data_3 = [
    { w: 1.5, x: 1, y: "a", z: true },
    { w: 2.5, x: 2, y: "b", z: false },
    { w: 3.5, x: 3, y: "c", z: true },
    { w: 4.5, x: 4, y: "d", z: false },
];

const data_7 = {
    w: [1.5, 2.5, 3.5, 4.5],
    x: [1, 2, 3, 4],
    y: ["a", "b", "c", "d"],
    z: [true, false, true, false],
};

const int_in_string = [{ a: "1" }, { a: "2" }, { a: "12345" }];

const float_in_string = [{ a: "1.5" }, { a: "2.5" }, { a: "12345.56789" }];

const meta_3 = {
    w: "float",
    x: "integer",
    y: "string",
    z: "boolean",
};

const arrow_result = [
    {
        f32: 1.5,
        f64: 1.5,
        i64: 1,
        i32: 1,
        i16: 1,
        i8: 1,
        bool: true,
        char: "a",
        dict: "a",
        "datetime(ms)": +new Date("2018-01-25"),
        "datetime(us)": +new Date("2018-01-25"),
        "datetime(ns)": +new Date("2018-01-25"),
    },
    {
        f32: 2.5,
        f64: 2.5,
        i64: 2,
        i32: 2,
        i16: 2,
        i8: 2,
        bool: false,
        char: "b",
        dict: "b",
        "datetime(ms)": +new Date("2018-01-26"),
        "datetime(us)": +new Date("2018-01-26"),
        "datetime(ns)": +new Date("2018-01-26"),
    },
    {
        f32: 3.5,
        f64: 3.5,
        i64: 3,
        i32: 3,
        i16: 3,
        i8: 3,
        bool: true,
        char: "c",
        dict: "c",
        "datetime(ms)": +new Date("2018-01-27"),
        "datetime(us)": +new Date("2018-01-27"),
        "datetime(ns)": +new Date("2018-01-27"),
    },
    {
        f32: 4.5,
        f64: 4.5,
        i64: 4,
        i32: 4,
        i16: 4,
        i8: 4,
        bool: false,
        char: "",
        dict: "",
        "datetime(ms)": +new Date("2018-01-28"),
        "datetime(us)": +new Date("2018-01-28"),
        "datetime(ns)": +new Date("2018-01-28"),
    },
    {
        f32: null,
        f64: null,
        i64: null,
        i32: null,
        i16: null,
        i8: null,
        bool: null,
        char: null,
        dict: null,
        "datetime(ms)": null,
        "datetime(us)": null,
        "datetime(ns)": null,
    },
];

let arrow_date_data = {
    "jan-2019": [
        "2019-01-01",
        "2019-01-02",
        "2019-01-03",
        "2019-01-04",
        "2019-01-05",
        "2019-01-06",
        "2019-01-07",
        "2019-01-08",
        "2019-01-09",
        "2019-01-10",
        "2019-01-11",
        "2019-01-12",
        "2019-01-13",
        "2019-01-14",
        "2019-01-15",
        "2019-01-16",
        "2019-01-17",
        "2019-01-18",
        "2019-01-19",
        "2019-01-20",
        "2019-01-21",
        "2019-01-22",
        "2019-01-23",
        "2019-01-24",
        "2019-01-25",
        "2019-01-26",
        "2019-01-27",
        "2019-01-28",
        "2019-01-29",
        "2019-01-30",
        "2019-01-31",
    ],
    "feb-2020": [
        "2020-02-01",
        "2020-02-02",
        "2020-02-03",
        "2020-02-04",
        "2020-02-05",
        "2020-02-06",
        "2020-02-07",
        "2020-02-08",
        "2020-02-09",
        "2020-02-10",
        "2020-02-11",
        "2020-02-12",
        "2020-02-13",
        "2020-02-14",
        "2020-02-15",
        "2020-02-16",
        "2020-02-17",
        "2020-02-18",
        "2020-02-19",
        "2020-02-20",
        "2020-02-21",
        "2020-02-22",
        "2020-02-23",
        "2020-02-24",
        "2020-02-25",
        "2020-02-26",
        "2020-02-27",
        "2020-02-28",
        "2020-02-29",
        null,
        null,
    ],
    "mar-2019": [
        "2019-03-01",
        "2019-03-02",
        "2019-03-03",
        "2019-03-04",
        "2019-03-05",
        "2019-03-06",
        "2019-03-07",
        "2019-03-08",
        "2019-03-09",
        "2019-03-10",
        "2019-03-11",
        "2019-03-12",
        "2019-03-13",
        "2019-03-14",
        "2019-03-15",
        "2019-03-16",
        "2019-03-17",
        "2019-03-18",
        "2019-03-19",
        "2019-03-20",
        "2019-03-21",
        "2019-03-22",
        "2019-03-23",
        "2019-03-24",
        "2019-03-25",
        "2019-03-26",
        "2019-03-27",
        "2019-03-28",
        "2019-03-29",
        "2019-03-30",
        "2019-03-31",
    ],
    "apr-2020": [
        "2020-04-01",
        "2020-04-02",
        "2020-04-03",
        "2020-04-04",
        "2020-04-05",
        "2020-04-06",
        "2020-04-07",
        "2020-04-08",
        "2020-04-09",
        "2020-04-10",
        "2020-04-11",
        "2020-04-12",
        "2020-04-13",
        "2020-04-14",
        "2020-04-15",
        "2020-04-16",
        "2020-04-17",
        "2020-04-18",
        "2020-04-19",
        "2020-04-20",
        "2020-04-21",
        "2020-04-22",
        "2020-04-23",
        "2020-04-24",
        "2020-04-25",
        "2020-04-26",
        "2020-04-27",
        "2020-04-28",
        "2020-04-29",
        "2020-04-30",
        null,
    ],
};

// transform arrow strings into timestamps
for (const k in arrow_date_data) {
    arrow_date_data[k] = arrow_date_data[k].map((d) =>
        d ? new Date(d).getTime() : null
    );
}

const dt = () => {
    let dt = new Date();
    dt.setHours(4);
    dt.setMinutes(12);
    return dt;
};

const data_4 = [{ v: dt() }];

const data_5 = [{ v: "11-09-2017" }];

const meta_4 = { v: "datetime" };

const csv = "x,y,z\n1,a,true\n2,b,false\n3,c,true\n4,d,false";

const data_6 = [{ x: "š" }];

const int_float_data = [
    { int: 1, float: 2.25 },
    { int: 2, float: 3.5 },
    { int: 3, float: 4.75 },
    { int: 4, float: 5.25 },
];
const int_float_string_data = [
    { int: 1, float: 2.25, string: "a" },
    { int: 2, float: 3.5, string: "b" },
    { int: 3, float: 4.75, string: "c" },
    { int: 4, float: 5.25, string: "d" },
];

// out of order to make sure we can read out of perspective in insertion
// order, not pkey order.
const all_types_data = [
    {
        int: 4,
        float: 5.25,
        string: "d",
        date: new Date(2020, 3, 15),
        datetime: new Date(2020, 0, 15, 23, 30),
        boolean: true,
    },
    {
        int: 3,
        float: 4.75,
        string: "c",
        date: new Date(2020, 2, 15),
        datetime: new Date(2020, 0, 15, 18, 30),
        boolean: false,
    },
    {
        int: 2,
        float: 3.5,
        string: "b",
        date: new Date(2020, 1, 15),
        datetime: new Date(2020, 0, 15, 12, 30),
        boolean: true,
    },
    {
        int: 1,
        float: 2.25,
        string: "a",
        date: new Date(2020, 0, 15),
        datetime: new Date(2020, 0, 15, 6, 30),
        boolean: false,
    },
    // values above should be replaced with these values below, due to
    // indexing
    {
        int: 4,
        float: 5.25,
        string: "d",
        date: new Date(2020, 3, 15),
        datetime: new Date(2020, 0, 15, 23, 30),
        boolean: true,
    },
    {
        int: 3,
        float: 4.75,
        string: "c",
        date: new Date(2020, 2, 15),
        datetime: new Date(2020, 0, 15, 18, 30),
        boolean: false,
    },
    {
        int: 2,
        float: 3.5,
        string: "b",
        date: new Date(2020, 1, 15),
        datetime: new Date(2020, 0, 15, 12, 30),
        boolean: true,
    },
    {
        int: 1,
        float: 2.25,
        string: "a",
        date: new Date(2020, 0, 15),
        datetime: new Date(2020, 0, 15, 6, 30),
        boolean: false,
    },
];

const datetime_data = [
    { datetime: new Date(), int: 1 },
    { datetime: new Date(), int: 1 },
    { datetime: new Date(), int: 2 },
    { datetime: new Date(), int: 2 },
];

// utility for checking typed arrays
function validate_typed_array(typed_array, column_data) {
    let is_valid = true;
    for (let i = 0; i < typed_array.length; i++) {
        if (column_data[i] !== null) {
            if (typed_array[i] !== column_data[i]) {
                is_valid = false;
                break;
            }
        }
    }
    return is_valid;
}

((perspective) => {
    // test.describe("Execute", function () {
    //     test.skip("serialized functions in a worker", async function () {
    //         var table = await perspective.table({
    //             x: "integer",
    //             y: "string",
    //             z: "boolean",
    //         });
    //         table.execute((t) => {
    //             t.update([
    //                 { x: 1, y: "a", z: true },
    //                 { x: 2, y: "b", z: false },
    //                 { x: 3, y: "c", z: true },
    //                 { x: 4, y: "d", z: false },
    //             ]);
    //         });
    //         let view = await table.view({});
    //         let js = await view.to_json();
    //         expect(js).toEqual([
    //             { x: 1, y: "a", z: true },
    //             { x: 2, y: "b", z: false },
    //             { x: 3, y: "c", z: true },
    //             { x: 4, y: "d", z: false },
    //         ]);
    //         view.delete();
    //         table.delete();
    //     });
    // });

    test.describe("Destructors", function () {
        test("calls delete() on table with no views", async function () {
            let table = await perspective.table(data);
            await table.delete();
            expect(true).toEqual(true);
        });

        test("calls delete on a view, then a table", async function () {
            var table = await perspective.table(data);
            var view = await table.view();
            await view.delete();
            await table.delete();
            expect(true).toEqual(true);
        });

        test("calls delete on multiple views, then a table", async function () {
            var table = await perspective.table(data);
            var view1 = await table.view();
            var view2 = await table.view();
            await view1.delete();
            await view2.delete();
            await table.delete();
            expect(true).toEqual(true);
        });
    });

    test.describe("Schema", function () {
        test("0-sided view", async function () {
            const table = await perspective.table(int_float_string_data);
            const view = await table.view();
            const schema = await view.schema();
            expect(schema).toEqual({
                int: "integer",
                float: "float",
                string: "string",
            });
            view.delete();
            table.delete();
        });

        test("0-sided view with columns selection", async function () {
            const table = await perspective.table(int_float_string_data);
            const view = await table.view({ columns: ["float", "string"] });
            const schema = await view.schema();
            expect(schema).toEqual({ float: "float", string: "string" });
            view.delete();
            table.delete();
        });
    });

    test.describe.skip("Typed Arrays", function () {
        test("Respects start/end rows", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view();
            const result = await view.col_to_js_typed_array("int", {
                start_row: 1,
                end_row: 2,
            });
            expect(result[0].byteLength).toEqual(4);
            view.delete();
            table.delete();
        });

        test("Int, 0-sided view", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view();
            const result = await view.col_to_js_typed_array("int");
            expect(result[0].byteLength).toEqual(16);
            view.delete();
            table.delete();
        });

        test("Float, 0-sided view", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view();
            const result = await view.col_to_js_typed_array("float");
            expect(result[0].byteLength).toEqual(32);
            view.delete();
            table.delete();
        });

        test("Datetime, 0-sided view", async function () {
            var table = await perspective.table(datetime_data);
            var view = await table.view();
            var schema = await view.schema();
            expect(schema).toEqual({ datetime: "datetime", int: "integer" });
            const result = await view.col_to_js_typed_array("datetime");
            expect(result[0].byteLength).toEqual(32);
            view.delete();
            table.delete();
        });

        test("Int, 1-sided view", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view({
                group_by: ["int"],
                columns: ["int", "float"],
            });
            const result = await view.col_to_js_typed_array("int");
            // should include aggregate row
            expect(result[0].byteLength).toEqual(20);
            view.delete();
            table.delete();
        });

        test("Float, 1-sided view", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view({
                group_by: ["int"],
                columns: ["int", "float"],
            });
            const result = await view.col_to_js_typed_array("float");
            expect(result[0].byteLength).toEqual(40);
            view.delete();
            table.delete();
        });

        test("Datetime, 1-sided view", async function () {
            var table = await perspective.table(datetime_data);
            var view = await table.view({
                group_by: ["int"],
                columns: ["datetime"],
                aggregates: { datetime: "high" },
            });
            const result = await view.col_to_js_typed_array("datetime");
            expect(result[0].byteLength).toEqual(24);
            view.delete();
            table.delete();
        });

        test("Int, 2-sided view with group by", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view({
                split_by: ["float"],
                group_by: ["int"],
                columns: ["int", "float"],
            });
            const result = await view.col_to_js_typed_array("3.5|int");
            expect(result[0].byteLength).toEqual(20);
            view.delete();
            table.delete();
        });

        test("Float, 2-sided view with group by", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view({
                split_by: ["float"],
                group_by: ["int"],
                columns: ["int", "float"],
            });
            const result = await view.col_to_js_typed_array("3.5|float");
            expect(result[0].byteLength).toEqual(40);
            view.delete();
            table.delete();
        });

        test("Int, 2-sided view, no group by", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view({ split_by: ["float"] });
            const result = await view.col_to_js_typed_array("3.5|int");
            // bytelength should not include the aggregate row
            expect(result[0].byteLength).toEqual(16);
            view.delete();
            table.delete();
        });

        test("Float, 2-sided view, no group by", async function () {
            var table = await perspective.table(int_float_data);
            var view = await table.view({ split_by: ["float"] });
            const result = await view.col_to_js_typed_array("3.5|float");
            expect(result[0].byteLength).toEqual(32);
            view.delete();
            table.delete();
        });

        test("Symmetric output with to_columns, 0-sided", async function () {
            let table = await perspective.table(int_float_data);
            let view = await table.view();
            let cols = await view.to_columns();

            for (let col in cols) {
                let ta = await view.col_to_js_typed_array(col);
                let column = cols[col];
                if (ta !== undefined && column !== undefined) {
                    expect(ta[0].length).toEqual(cols[col].length);
                    expect(validate_typed_array(ta[0], cols[col])).toEqual(
                        true
                    );
                }
            }
            view.delete();
            table.delete();
        });

        test("Symmetric output with to_columns, 1-sided", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["int"],
                columns: ["int", "float"],
            });
            let cols = await view.to_columns();

            for (let col in cols) {
                let ta = await view.col_to_js_typed_array(col);
                let column = cols[col];
                if (ta !== undefined && column !== undefined) {
                    expect(ta[0].length).toEqual(cols[col].length);
                    expect(validate_typed_array(ta[0], cols[col])).toEqual(
                        true
                    );
                }
            }
            view.delete();
            table.delete();
        });
    });

    test.describe("Other `View`s", function () {
        test("Construct a table from another view", async function () {
            const table = await perspective.table(int_float_string_data);
            const view = await table.view();
            const table2 = await perspective.table(view);
            const view2 = await table2.view();
            const data = await view2.to_json();
            expect(data).toEqual(int_float_string_data);
            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });
    });

    test.describe("Errors", function () {
        test("Table constructor should throw an exception and reject promise", async function () {
            expect.assertions(1);
            perspective.table([1, 2, 3]).catch((error) => {
                expect(error.message).toContain(
                    "Abort(): Cannot determine data types without column names!\n"
                );
            });
        });

        test("View constructor should throw an exception and reject promise", async function () {
            expect.assertions(1);
            const table = await perspective.table(int_float_string_data);
            table
                .view({
                    group_by: ["abcd"],
                })
                .catch((error) => {
                    expect(error.message).toContain(
                        "Abort(): Invalid column 'abcd' found in View group_by.\n"
                    );
                    table.delete();
                });
        });

        test("Table constructor should throw an exception on await", async function () {
            expect.assertions(1);

            try {
                await perspective.table([1, 2, 3]);
            } catch (error) {
                expect(error.message).toContain(
                    "Abort(): Cannot determine data types without column names!\n"
                );
            }
        });

        test("View constructor should throw an exception on await", async function () {
            expect.assertions(1);
            const table = await perspective.table(int_float_string_data);

            try {
                await table.view({
                    group_by: ["abcd"],
                });
            } catch (error) {
                expect(error.message).toContain(
                    "Abort(): Invalid column 'abcd' found in View group_by.\n"
                );
                table.delete();
            }
        });
    });

    test.describe("Formatters", function () {
        test("Serializes a simple view to CSV", async function () {
            var table = await perspective.table(data);
            var view = await table.view({});
            var answer = `"x","y","z"\n1,"a",true\n2,"b",false\n3,"c",true\n4,"d",false\n`;
            let result = await view.to_csv();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("Serializes 1 sided view to CSV", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                columns: ["x"],
            });
            var answer = `"z (Group by 1)","x"\n,10\nfalse,6\ntrue,4\n`;
            let result = await view.to_csv();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("Serializes a 2 sided view to CSV", async function () {
            var table = await perspective.table(data);
            var view = await table.view({
                group_by: ["z"],
                split_by: ["y"],
                columns: ["x"],
            });
            var answer = `"z (Group by 1)","a|x","b|x","c|x","d|x"\n,1,2,3,4\nfalse,,2,,4\ntrue,1,,3,\n`;
            let result = await view.to_csv();
            expect(result).toEqual(answer);
            view.delete();
            table.delete();
        });

        test("Serializes a simple view to column-oriented JSON", async function () {
            var table = await perspective.table(data_3);
            var view = await table.view({});
            let result = await view.to_columns();
            expect(result).toEqual(data_7);
            view.delete();
            table.delete();
        });
    });

    test.describe("CSV parsing", function () {
        test("Does not lose leading 0's when a CSV column is declared as a string", async function () {
            let table = await perspective.table({ x: "string", y: "integer" });
            table.update("x,y\n000123,000123");
            let view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([{ x: "000123", y: 123 }]);
            view.delete();
            table.delete();
        });

        // Added
        test("Does not lose leading 0's when a CSV column is declared as a string (async)", async function () {
            let table = await perspective.table({ x: "string", y: "integer" });
            await table.update("x,y\n000123,000123");
            let view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([{ x: "000123", y: 123 }]);
            view.delete();
            table.delete();
        });

        test("Handles strings with quotation characters and commas", async function () {
            let table = await perspective.table({ x: "string", y: "integer" });
            table.update([
                { x: "Test, hello!", y: 1 },
                { x: 'Test2"', y: 2 },
                { x: 'Test3, Hello!"', y: 3 },
            ]);
            let view = await table.view();
            let result = await view.to_csv();
            expect(result).toEqual(
                `"x","y"\n"Test, hello!",1\n"Test2""",2\n"Test3, Hello!""",3\n`
            );
            view.delete();
            table.delete();
        });

        // Added
        test("Handles strings with quotation characters and commas (async)", async function () {
            let table = await perspective.table({ x: "string", y: "integer" });
            await table.update([
                { x: "Test, hello!", y: 1 },
                { x: 'Test2"', y: 2 },
                { x: 'Test3, Hello!"', y: 3 },
            ]);
            let view = await table.view();
            let result = await view.to_csv();
            expect(result).toEqual(
                `"x","y"\n"Test, hello!",1\n"Test2""",2\n"Test3, Hello!""",3\n`
            );
            view.delete();
            table.delete();
        });

        test("Transitively loads a CSV created from `to_csv()` on a table with a datetime column", async function () {
            // Assert that the CSV parser can handle POSIX timestamps.
            let table = await perspective.table(arrow_date_data);
            let view = await table.view();
            let schema = await table.schema();
            let csv = await view.to_csv();
            let table2 = await perspective.table(csv);
            let schema2 = await table2.schema();
            let view2 = await table2.view();
            let csv2 = await view2.to_csv();
            expect(schema2).toEqual(schema);
            expect(csv2).toEqual(csv);
            view2.delete();
            table2.delete();
            view.delete();
            table.delete();
        });
    });

    test.describe("Constructors", function () {
        test("JSON constructor", async function () {
            var table = await perspective.table(data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("JSON column oriented constructor", async function () {
            var table = await perspective.table(col_data);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data);
            view.delete();
            table.delete();
        });

        test("Arrow constructor", async function () {
            var table = await perspective.table(arrows.test_null_arrow.slice());
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(arrow_result);
            view.delete();
            table.delete();
        });

        test.skip("Arrow (chunked format) constructor", async function () {
            var table = await perspective.table(arrows.chunked_arrow.slice());
            var view = await table.view();
            let result = await view.to_json();
            expect(result.length).toEqual(10);
            view.delete();
            table.delete();
        });

        test("Arrow date32 constructor", async function () {
            const table = await perspective.table(arrows.date32_arrow.slice());
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual(arrow_date_data);
            view.delete();
            table.delete();
        });

        test("Arrow date64 constructor", async function () {
            const table = await perspective.table(arrows.date64_arrow.slice());
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual(arrow_date_data);
            view.delete();
            table.delete();
        });

        test("Arrow dictionary constructor", async function () {
            const table = await perspective.table(arrows.dict_arrow.slice());
            const view = await table.view();
            const result = await view.to_columns();
            expect(result).toEqual({
                a: ["abc", "def", "def", null, "abc"],
                b: ["klm", "hij", null, "hij", "klm"],
            });
            view.delete();
            table.delete();
        });

        test("CSV constructor with null columns", async function () {
            const table = await perspective.table("x,y\n1,");
            const view = await table.view();
            expect(await table.schema()).toEqual({
                x: "integer",
                y: "string",
            });
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [1],
                y: [null],
            });
            await view.delete();
            await table.delete();
        });

        test("CSV constructor indexed, with null columns, and update", async function () {
            const table = await perspective.table("x,y\n1,", { index: "x" });
            const view = await table.view();
            expect(await table.schema()).toEqual({
                x: "integer",
                y: "string",
            });
            const result = await view.to_columns();
            expect(result).toEqual({
                x: [1],
                y: [null],
            });
            table.update("x,y\n1,abc\n2,123");
            const result2 = await view.to_columns();
            expect(result2).toEqual({
                x: [1, 2],
                y: ["abc", "123"],
            });
            await view.delete();
            await table.delete();
        });

        test("Meta constructor", async function () {
            var table = await perspective.table(meta);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([]);
            view.delete();
            table.delete();
        });

        test("Handles floats", async function () {
            var table = await perspective.table(data_3);
            var view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual(data_3);
            view.delete();
            table.delete();
        });

        test("Infers ints wrapped in strings", async function () {
            var table = await perspective.table(int_in_string);
            var view = await table.view();
            let result = await view.schema();
            expect(result).toEqual({ a: "integer" });
            view.delete();
            table.delete();
        });

        test("Infers floats wrapped in strings", async function () {
            var table = await perspective.table(float_in_string);
            var view = await table.view();
            let result = await view.schema();
            expect(result).toEqual({ a: "float" });
            view.delete();
            table.delete();
        });

        test("Infers correct type for empty string columns", async function () {
            var table = await perspective.table([
                { x: "", y: 1 },
                { x: "", y: 2 },
                { x: "", y: 3 },
                { x: "", y: 4 },
            ]);
            var view = await table.view();
            let result = await view.schema();
            expect(result).toEqual({ x: "string", y: "integer" });
            view.delete();
            table.delete();
        });

        test("Returns the correct number of rows for column-only views", async function () {
            var table = await perspective.table(data);
            var view = await table.view();
            var num_rows = await view.num_rows();
            var view2 = await table.view({
                split_by: ["x"],
            });
            var num_rows_col_only = await view2.num_rows();
            expect(num_rows_col_only).toEqual(num_rows);
            view.delete();
            view2.delete();
            table.delete();
        });

        test.skip("Handles inconsistent rows with same width", async function () {
            const int_to_float = [
                { x: 1, y: 2 },
                { y: 2, z: 3 },
            ];
            var table = await perspective.table(int_to_float);
            var view = await table.view();
            var json = await view.to_json();
            expect(json).toEqual([
                { x: 1, y: 2, z: null },
                { x: null, y: 2, z: 3 },
            ]);
            view.delete();
            table.delete();
        });

        test.skip("Handles inconsistent rows", async function () {
            const int_to_float = [{ x: 1 }, { y: 2, z: 3 }];
            var table = await perspective.table(int_to_float);
            var schema = await table.schema();
            expect(schema).toEqual({
                x: "integer",
                y: "integer",
                z: "integer",
            });
            var view = await table.view();
            var json = await view.to_json();
            expect(json).toEqual([
                { x: 1, y: null, z: null },
                { x: null, y: 2, z: 3 },
            ]);
            view.delete();
            table.delete();
        });

        test("Upgrades integer columns to strings", async function () {
            const int_to_float = {
                a: [1, 2, 3, "x", "y"],
            };

            var table = await perspective.table(int_to_float);
            var schema_1 = await table.schema();
            expect(schema_1["a"]).toEqual("string");
            var view = await table.view();
            var json = await view.to_json();
            expect(json).toEqual([
                { a: "1" },
                { a: "2" },
                { a: "3" },
                { a: "x" },
                { a: "y" },
            ]);
            view.delete();
            table.delete();
        });

        test("Upgrades integer columns with values beyond max/min_int to float", async function () {
            const int_to_float = {
                a: [1, 2, 3, 2147483667, 5],
            };

            var table = await perspective.table(int_to_float);
            var view = await table.view();
            var json = await view.to_columns();
            expect(json).toEqual(int_to_float);
            var schema_2 = await table.schema();
            expect(schema_2["a"]).toEqual("float");
            view.delete();
            table.delete();
        });

        // This currently won't work, and I'm unclear we want it to - upgrading
        // ths column in place is easy, but once the gnode and potentially
        // contexts have been created, this becomes much more difficult.
        test.skip("Upgrades integer columns with values beyond max/min_int to float old", async function () {
            const schema = {
                a: "integer",
            };

            const int_to_float = {
                a: [1, 2, 3, 2147483667, 5],
            };

            var table = await perspective.table(schema);
            var schema_1 = await table.schema();
            expect(schema_1["a"]).toEqual("integer");

            table.update(int_to_float);

            var schema_2 = await table.schema();
            expect(schema_2["a"]).toEqual("float");
            table.delete();
        });

        test("Does not infer float column as integers", async function () {
            const int_to_float = [];
            for (let x = 0; x < 200; x++) {
                int_to_float.push({ a: 1 });
            }
            int_to_float.push({ a: 2147483667 });

            var table = await perspective.table(int_to_float);
            var schema_1 = await table.schema();
            expect(schema_1["a"]).toEqual("float");
            let view = await table.view();
            var data = await view.to_json();
            expect(data).toEqual(int_to_float);

            view.delete();
            table.delete();
        });

        test("has correct size", async function () {
            var table = await perspective.table(data);
            let result = await table.size();
            expect(result).toEqual(4);
            table.delete();
        });

        test("has a schema", async function () {
            var table = await perspective.table(data);
            let result = await table.schema();
            expect(result).toEqual(meta);
            table.delete();
        });

        test("has columns", async function () {
            var table = await perspective.table(data);
            let result = await table.columns();
            expect(result).toEqual(["x", "y", "z"]);
            table.delete();
        });

        test("Handles floats schemas", async function () {
            var table = await perspective.table(data_3);
            let result = await table.schema();
            expect(result).toEqual(meta_3);
            table.delete();
        });

        test("Generates correct date schemas", async function () {
            var table = await perspective.table(data_4);
            let result = await table.schema();
            expect(result).toEqual(meta_4);
            table.delete();
        });

        test("Handles date updates when constructed from a schema", async function () {
            var table = await perspective.table(meta_4);
            table.update(data_4);
            let view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([{ v: +data_4[0]["v"] }]);
            view.delete();
            table.delete();
        });

        test("Handles datetime values", async function () {
            var table = await perspective.table(data_4);
            let view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([{ v: +data_4[0]["v"] }]);
            view.delete();
            table.delete();
        });

        test("Handles datetime strings", async function () {
            var table = await perspective.table(data_5);
            let view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([
                { v: +moment(data_5[0]["v"], "MM-DD-YYYY") },
            ]);
            view.delete();
            table.delete();
        });

        test("Handles datetime strings in US locale string old", async function () {
            // FIXME: 1/1/2020, 12:30:45 PM = 1/1/2020, 7:30:45 AM UTC, but
            // because C++ strptime in Emscripten parses the time as 12:30:45AM,
            // the output is 12/31/2019 19:30:45 PM UTC. This is clearly wrong.
            const data = {
                x: [
                    "1/1/2020, 12:30:45 PM",
                    "1/1/2020, 12:30:45 AM",
                    "03/15/2020, 11:30:45 AM",
                    "06/30/2020, 01:30:45 AM",
                    "06/30/2020, 01:30:45 PM",
                    "12/31/2020, 11:59:59 PM",
                ],
            };
            const table = await perspective.table(data);
            const schema = await table.schema();

            expect(schema).toEqual({
                x: "datetime",
            });

            const view = await table.view();
            const result = await view.to_columns();

            const expected = {
                x: [
                    "1/1/2020, 12:30:45 PM",
                    "1/1/2020, 12:30:45 AM",
                    "03/15/2020, 11:30:45 AM",
                    "06/30/2020, 01:30:45 AM",
                    "06/30/2020, 01:30:45 PM",
                    "12/31/2020, 11:59:59 PM",
                ].map((v) => new Date(v).getTime()),
            };

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Handles datetime strings in US locale string", async function () {
            const data = {
                x: [
                    "1/1/2020, 05:30:45 AM",
                    "03/15/2020, 11:30:45 AM",
                    "06/30/2020, 01:30:45 AM",
                    "12/31/2020, 11:59:59 PM",
                ],
            };
            const table = await perspective.table(data);
            const schema = await table.schema();

            expect(schema).toEqual({
                x: "datetime",
            });

            const view = await table.view();
            const result = await view.to_columns();

            const expected = {
                x: [
                    "1/1/2020, 05:30:45 AM",
                    "03/15/2020, 11:30:45 AM",
                    "06/30/2020, 01:30:45 AM",
                    "12/31/2020, 11:59:59 PM",
                ].map((v) => new Date(v).getTime()),
            };

            expect(result).toEqual(expected);
            view.delete();
            table.delete();
        });

        test("Handles datetime values with mixed formats", async function () {
            var table = await perspective.table({ datetime: "datetime" });
            table.update([
                { datetime: new Date(1549257586108) },
                { datetime: "2019-01-30" },
                { datetime: 11 },
            ]);
            let view = await table.view();
            let result = await view.to_json();
            expect(result).toEqual([
                { datetime: 1549257586108 },
                { datetime: 1548806400000 },
                { datetime: 11 },
            ]);
            view.delete();
            table.delete();
        });

        test("Handles date values", async function () {
            var table = await perspective.table({ v: "date" });
            table.update(data_4);
            let view = await table.view();
            let result = await view.to_json();
            let d = new Date(data_4[0]["v"]);
            d.setHours(0);
            d.setMinutes(0);
            d.setSeconds(0);
            d.setMilliseconds(0);
            expect(result).toEqual([{ v: +d }]);
            view.delete();
            table.delete();
        });

        test("Handles utf16 column names", async function () {
            var table = await perspective.table({ š: [1, 2, 3] });
            let view = await table.view({});
            let result = await view.schema();
            expect(result).toEqual({ š: "integer" });
            view.delete();
            table.delete();
        });

        test("Handles utf16", async function () {
            var table = await perspective.table(data_6);
            let view = await table.view({});
            let result = await view.to_json();
            expect(result).toEqual(data_6);
            view.delete();
            table.delete();
        });

        test.describe("Datetime constructors", function () {
            test("Correctly parses an ISO-8601 formatted string", async function () {
                let table = await perspective.table({
                    d: ["2011-10-05T14:48:00"],
                });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("datetime");
                await view.delete();
                await table.delete();
            });

            test("Correctly parses an ISO-8601 formatted string 2", async function () {
                let table = await perspective.table({
                    d: ["2011-10-05T14:48:00.000"],
                });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("datetime");
                await view.delete();
                await table.delete();
            });

            test("Correctly parses an ISO-8601 formatted string 3", async function () {
                let table = await perspective.table({
                    d: ["2011-10-05T14:48:00Z"],
                });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("datetime");
                await view.delete();
                await table.delete();
            });

            test("Correctly parses an ISO-8601 formatted string 4", async function () {
                let table = await perspective.table({
                    d: ["2011-10-05T14:48:00.000Z"],
                });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("datetime");
                await view.delete();
                await table.delete();
            });

            test("Correctly parses an ISO-8601 formatted string with timezone", async function () {
                let table = await perspective.table({
                    d: ["2008-09-15T15:53:00+05:00"],
                });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("datetime");
                await view.delete();
                await table.delete();
            });

            test.skip("Correctly parses an RFC 2822 formatted string", async function () {
                let table = await perspective.table({
                    d: ["Wed, 05 Oct 2011 22:26:12 -0400"],
                });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("datetime");
                await view.delete();
                await table.delete();
            });

            // Not all formats covered by JS parser, test intended for C++ parser
            test.skip("Correctly parses all m-d-y formatted strings", async function () {
                let datestrings = [
                    "08-15-2009",
                    "08/15/2009",
                    "08-15-2009",
                    "02 28 2009",
                    "08/15/10",
                    "31 08 2009",
                ];
                for (let str of datestrings) {
                    let table = await perspective.table({ d: [str] });
                    let view = await table.view({});
                    let result = await view.schema();
                    expect(result["d"]).toEqual("datetime");
                    await view.delete();
                    await table.delete();
                }
            });

            // Only implemented in the C++ date parser - skip
            test.skip("Correctly parses a 'dd mm yyyy' formatted string", async function () {
                let table = await perspective.table({ d: ["15 08 08"] });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("datetime");
                await view.delete();
                await table.delete();
            });

            test("Does not (for now) parse a date string in non-US formatting", async function () {
                let table = await perspective.table({ d: ["2018/07/30"] });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("string");
                await view.delete();
                await table.delete();
            });

            test("Does not mistakenly parse a date-like string", async function () {
                let table = await perspective.table({ d: ["Jan 14, 14"] });
                let view = await table.view({});
                let result = await view.schema();
                expect(result["d"]).toEqual("string");
                await view.delete();
                await table.delete();
            });
        });

        test("allocates a large tables", async function () {
            function makeid() {
                var text = "";
                var possible = Array.from(Array(26).keys()).map((x) =>
                    String.fromCharCode(x + 65)
                );
                for (var i = 0; i < 15; i++)
                    text +=
                        possible[Math.floor(Math.random() * possible.length)];
                return text;
            }
            let data = [];
            for (let i = 0; i < 35000; i++) {
                data.push({
                    a: makeid(),
                    b: makeid(),
                    c: makeid(),
                    d: makeid(),
                    w: i + 0.5,
                    x: i,
                    y: makeid(),
                });
            }
            let table = await perspective.table(data);
            let view = await table.view();
            let result = await view.to_json();
            expect(result.length).toEqual(35000);
            view.delete();
            table.delete();
        }, 3000);

        test.describe("get_index/get_limit", function () {
            test("get_index() on unindexed table", async function () {
                const table = await perspective.table(data);
                expect(await table.get_index()).toBeUndefined();
                await table.delete();
            });

            test("get_index() on an indexed table", async function () {
                const table = await perspective.table(data, { index: "x" });
                expect(await table.get_index()).toEqual("x");
                await table.delete();
            });

            test("get_limit() on table without limit", async function () {
                const table = await perspective.table(data);
                expect(await table.get_limit()).toBeUndefined();
                await table.delete();
            });

            test("get_limit() on table with limit", async function () {
                const table = await perspective.table(data, { limit: 2 });
                expect(await table.get_limit()).toEqual(2);
                await table.delete();
            });
        });

        test.describe("Limit table constructors", function () {
            // This is a better version of the OG but still questionable.
            // IMO we should not allow this without an explicit `__INDEX__`.
            test("Should not apply partial updates on limit tables when index wraps", async function () {
                const table = await perspective.table(
                    { a: "float", b: "float" },
                    {
                        limit: 3,
                    }
                );

                table.update([
                    { a: 10, b: 1 },
                    { a: 20, b: 2 },
                ]);

                await table.update([{ a: 30 }, { a: 40 }]);
                const view = await table.view();
                const records = await view.to_json();
                await view.delete();
                await table.delete();
                expect(records).toEqual([
                    { a: 40, b: null },
                    { a: 20, b: 2 },
                    { a: 30, b: null },
                ]);
            });

            // We don' tsupport mixed-partial updates anymore!
            test.skip("OG - Should not apply partial updates on limit tables when index wraps", async function () {
                const table = await perspective.table(
                    { a: "float", b: "float" },
                    {
                        limit: 3,
                    }
                );

                table.update([
                    { a: 10 },
                    { b: 1 },
                    { a: 20 },
                    { a: null, b: 2 },
                ]);
                const view = await table.view();
                const records = await view.to_json();
                await view.delete();
                await table.delete();

                const table2 = await perspective.table(
                    { a: "float", b: "float" },
                    {
                        limit: 3,
                    }
                );

                table2.update([{ a: 10 }, { b: 1 }, { a: 20 }, { b: 2 }]);
                const view2 = await table2.view();
                const records2 = await view2.to_json();
                await view2.delete();
                await table2.delete();

                expect(records).toEqual(records2);
            });
        });

        test.describe("Indexed table constructors", function () {
            test("Should index on an integer column", async function () {
                const table = await perspective.table(all_types_data, {
                    index: "int",
                });
                const view = await table.view();
                expect(await table.size()).toEqual(4);
                expect(await view.to_json()).toEqual([
                    {
                        int: 1,
                        float: 2.25,
                        string: "a",
                        date: 1579046400000,
                        datetime: 1579069800000,
                        boolean: false,
                    },
                    {
                        int: 2,
                        float: 3.5,
                        string: "b",
                        date: 1581724800000,
                        datetime: 1579091400000,
                        boolean: true,
                    },
                    {
                        int: 3,
                        float: 4.75,
                        string: "c",
                        date: 1584230400000,
                        datetime: 1579113000000,
                        boolean: false,
                    },
                    {
                        int: 4,
                        float: 5.25,
                        string: "d",
                        date: 1586908800000,
                        datetime: 1579131000000,
                        boolean: true,
                    },
                ]);
                await view.delete();
                await table.delete();
            });

            test("Should index on a float column", async function () {
                const table = await perspective.table(all_types_data, {
                    index: "float",
                });
                const view = await table.view();
                expect(await table.size()).toEqual(4);
                expect(await view.to_json()).toEqual([
                    {
                        int: 1,
                        float: 2.25,
                        string: "a",
                        date: 1579046400000,
                        datetime: 1579069800000,
                        boolean: false,
                    },
                    {
                        int: 2,
                        float: 3.5,
                        string: "b",
                        date: 1581724800000,
                        datetime: 1579091400000,
                        boolean: true,
                    },
                    {
                        int: 3,
                        float: 4.75,
                        string: "c",
                        date: 1584230400000,
                        datetime: 1579113000000,
                        boolean: false,
                    },
                    {
                        int: 4,
                        float: 5.25,
                        string: "d",
                        date: 1586908800000,
                        datetime: 1579131000000,
                        boolean: true,
                    },
                ]);
                await view.delete();
                await table.delete();
            });

            test("Should index on a string column", async function () {
                const table = await perspective.table(all_types_data, {
                    index: "string",
                });
                const view = await table.view();
                expect(await table.size()).toEqual(4);
                expect(await view.to_json()).toEqual([
                    {
                        int: 1,
                        float: 2.25,
                        string: "a",
                        date: 1579046400000,
                        datetime: 1579069800000,
                        boolean: false,
                    },
                    {
                        int: 2,
                        float: 3.5,
                        string: "b",
                        date: 1581724800000,
                        datetime: 1579091400000,
                        boolean: true,
                    },
                    {
                        int: 3,
                        float: 4.75,
                        string: "c",
                        date: 1584230400000,
                        datetime: 1579113000000,
                        boolean: false,
                    },
                    {
                        int: 4,
                        float: 5.25,
                        string: "d",
                        date: 1586908800000,
                        datetime: 1579131000000,
                        boolean: true,
                    },
                ]);
                await view.delete();
                await table.delete();
            });

            test("Should index on a date column", async function () {
                const table = await perspective.table(all_types_data, {
                    index: "date",
                });
                const view = await table.view();
                expect(await table.size()).toEqual(4);
                expect(await view.to_json()).toEqual([
                    {
                        int: 1,
                        float: 2.25,
                        string: "a",
                        date: 1579046400000,
                        datetime: 1579069800000,
                        boolean: false,
                    },
                    {
                        int: 2,
                        float: 3.5,
                        string: "b",
                        date: 1581724800000,
                        datetime: 1579091400000,
                        boolean: true,
                    },
                    {
                        int: 3,
                        float: 4.75,
                        string: "c",
                        date: 1584230400000,
                        datetime: 1579113000000,
                        boolean: false,
                    },
                    {
                        int: 4,
                        float: 5.25,
                        string: "d",
                        date: 1586908800000,
                        datetime: 1579131000000,
                        boolean: true,
                    },
                ]);
                await view.delete();
                await table.delete();
            });

            test("Should index on a datetime column", async function () {
                const table = await perspective.table(all_types_data, {
                    index: "datetime",
                });
                const view = await table.view();
                expect(await table.size()).toEqual(4);
                expect(await view.to_json()).toEqual([
                    {
                        int: 1,
                        float: 2.25,
                        string: "a",
                        date: 1579046400000,
                        datetime: 1579069800000,
                        boolean: false,
                    },
                    {
                        int: 2,
                        float: 3.5,
                        string: "b",
                        date: 1581724800000,
                        datetime: 1579091400000,
                        boolean: true,
                    },
                    {
                        int: 3,
                        float: 4.75,
                        string: "c",
                        date: 1584230400000,
                        datetime: 1579113000000,
                        boolean: false,
                    },
                    {
                        int: 4,
                        float: 5.25,
                        string: "d",
                        date: 1586908800000,
                        datetime: 1579131000000,
                        boolean: true,
                    },
                ]);
                await view.delete();
                await table.delete();
            });
        });
    });
})(perspective);
