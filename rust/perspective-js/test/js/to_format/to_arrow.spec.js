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
import perspective from "../perspective_client";
import { STD_DATE, int_float_string_data, pivoted_output } from "./_shared";

const unpivot = (rows) =>
    rows.map((x) => {
        x.__ROW_PATH__ = [x.string].filter((x) => x);
        delete x.string;
        for (const name of Object.keys(x)) {
            if (name.endsWith("string (count)")) {
                x[name.slice(0, -" (count)".length)] = x[name];
                delete x[name];
            }
        }

        return x;
    });

((perspective) => {
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

            expect(json).toEqual(unpivot(json2));

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
                string: [null, "a", "b"],
                float: [2.75, 1.75, 3.75],
                "string (count)": [4, 2, 2],
            });

            await view2.delete();
            await table2.delete();
            await view.delete();
            await table.delete();
        });

        test("Arrow output qualifies an aggregate of a group_by column", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["string"],
                columns: ["string", "float"],
                aggregates: { string: "distinct count", float: "sum" },
            });

            let readable = await perspective.table(await view.to_arrow());
            expect(await readable.columns()).toEqual([
                "string",
                "string (distinct count)",
                "float",
            ]);

            let machine = await perspective.table(
                await view.to_arrow({ machine_column_names: true }),
            );

            expect(await machine.columns()).toEqual([
                "__ROW_PATH_0__",
                "string",
                "float",
            ]);

            await machine.delete();
            await readable.delete();
            await view.delete();
            await table.delete();
        });

        test("Arrow output names a multi-aggregate of a group_by column", async function () {
            let table = await perspective.table(int_float_string_data);
            let view = await table.view({
                group_by: ["float"],
                columns: ["float"],
                aggregates: { float: ["weighted mean", ["int"]] },
            });

            let table2 = await perspective.table(await view.to_arrow());
            expect(await table2.columns()).toEqual([
                "float",
                "float (weighted mean by int)",
            ]);

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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

            expect(json).toEqual(unpivot(json2));

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
