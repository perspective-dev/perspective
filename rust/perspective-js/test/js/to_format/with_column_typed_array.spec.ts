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

test.describe("with_typed_arrays()", () => {
    test("awaits promise returned by async callback before releasing the batch", async () => {
        // The callback returns a Promise that only resolves after a
        // microtask tick; the zero-copy views must remain valid for the
        // full awaited duration. We copy *after* the tick to prove the
        // backing WASM memory is still readable.
        const table = await perspective.table({
            x: ["a", "b", "a", "c"],
        });
        const view = await table.view();
        let resolved: string[] | null = null;
        await view.with_typed_arrays(
            {},
            async (
                _n: string[],
                vals: ArrayLike<number>[],
                _valids: any[],
                dicts: (string[] | null)[],
            ) => {
                const keys = vals[0] as Int32Array;
                const dict = dicts[0]!;
                // Yield twice to prove the Rust side is actually awaiting
                // the returned promise rather than firing a sync call and
                // dropping the batch immediately.
                await new Promise((r) => setTimeout(r, 0));
                await new Promise((r) => setTimeout(r, 0));
                resolved = Array.from(keys).map((k) => dict[k]);
            },
        );
        expect(resolved).toEqual(["a", "b", "a", "c"]);
        await view.delete();
        await table.delete();
    });

    test("rejected promise from async callback surfaces as a rejection", async () => {
        const table = await perspective.table({ x: [1, 2, 3] });
        const view = await table.view();
        let caught: unknown = null;
        try {
            await view.with_typed_arrays({}, async () => {
                throw new Error("callback boom");
            });
        } catch (e) {
            caught = e;
        }
        expect(String(caught)).toContain("callback boom");
        await view.delete();
        await table.delete();
    });

    test("returns all columns with names, values, validities, dictionaries", async () => {
        const table = await perspective.table({
            a: [1, 2, 3],
            b: [10.0, 20.0, 30.0],
        });

        const view = await table.view();
        let names: string[] = [];
        let valuesMap: Record<string, ArrayLike<number>> = {};
        await view.with_typed_arrays(
            {},
            (
                n: string[],
                vals: ArrayLike<number>[],
                _valids: (Uint8Array | null)[],
                _dicts: (string[] | null)[],
            ) => {
                names = Array.from(n);
                for (let i = 0; i < names.length; i++) {
                    valuesMap[names[i]] = vals[i];
                }
            },
        );

        expect(names).toContain("a");
        expect(names).toContain("b");
        expect(Array.from(valuesMap["b"])).toEqual([10.0, 20.0, 30.0]);
        await view.delete();
        await table.delete();
    });

    test("returns Float64Array for float column by default", async () => {
        const table = await perspective.table({ x: [1.5, 2.5, 3.5] });
        const view = await table.view();
        let result: Float64Array | null = null;
        await view.with_typed_arrays(
            {},
            (_n: string[], vals: ArrayLike<number>[]) => {
                result = new Float64Array(vals[0] as Float64Array);
            },
        );

        expect(Array.from(result!)).toEqual([1.5, 2.5, 3.5]);
        await view.delete();
        await table.delete();
    });

    test("returns Float32Array when float32 option is set", async () => {
        const table = await perspective.table({ x: [1.5, 2.5, 3.5] });
        const view = await table.view();
        let isFloat32 = false;
        await view.with_typed_arrays(
            { float32: true },
            (_n: string[], vals: any[]) => {
                isFloat32 = vals[0] instanceof Float32Array;
            },
        );

        expect(isFloat32).toBe(true);
        await view.delete();
        await table.delete();
    });

    test("returns Int32Array for integer column", async () => {
        const table = await perspective.table({ x: "integer" });
        table.update({ x: [10, 20, 30] });
        const view = await table.view();
        let result: Int32Array | null = null;
        await view.with_typed_arrays(
            {},
            (_n: string[], vals: ArrayLike<number>[]) => {
                result = new Int32Array(vals[0] as Int32Array);
            },
        );

        expect(Array.from(result!)).toEqual([10, 20, 30]);
        await view.delete();
        await table.delete();
    });

    test("passes validity bitmap for columns with nulls", async () => {
        const table = await perspective.table({ x: [1.5, null, 3.5, null] });
        const view = await table.view();
        let validity: Uint8Array | null = null;
        await view.with_typed_arrays(
            {},
            (_n: string[], _vals: any[], valids: (Uint8Array | null)[]) => {
                validity = valids[0] ? new Uint8Array(valids[0]) : null;
            },
        );

        // Bits 0 and 2 set => 0b0101 = 5
        expect(validity![0]).toEqual(0b0101);
        await view.delete();
        await table.delete();
    });

    test("validity is null when no nulls present", async () => {
        const table = await perspective.table({ x: [1.0, 2.0, 3.0] });
        const view = await table.view();
        let validityWasNull = false;
        await view.with_typed_arrays(
            {},
            (_n: string[], _vals: any[], valids: (Uint8Array | null)[]) => {
                validityWasNull = valids[0] === null;
            },
        );

        expect(validityWasNull).toBe(true);
        await view.delete();
        await table.delete();
    });

    test("returns dictionary keys and values for string column", async () => {
        const table = await perspective.table({
            x: ["apple", "banana", "apple", "cherry"],
        });
        const view = await table.view();
        let keys: Int32Array | null = null;
        let dict: string[] | null = null;
        await view.with_typed_arrays(
            {},
            (
                _n: string[],
                vals: ArrayLike<number>[],
                _valids: any[],
                dicts: (string[] | null)[],
            ) => {
                keys = new Int32Array(vals[0] as Int32Array);
                dict = dicts[0] ? Array.from(dicts[0]) : null;
            },
        );

        expect(keys!.length).toEqual(4);
        const resolved = Array.from(keys!).map((k) => dict![k]);
        expect(resolved).toEqual(["apple", "banana", "apple", "cherry"]);
        await view.delete();
        await table.delete();
    });

    test("dictionary is null for non-string columns", async () => {
        const table = await perspective.table({ x: [1.0, 2.0, 3.0] });
        const view = await table.view();
        let dictWasNull = false;
        await view.with_typed_arrays(
            {},
            (
                _n: string[],
                _vals: any[],
                _valids: any[],
                dicts: (string[] | null)[],
            ) => {
                dictWasNull = dicts[0] === null;
            },
        );

        expect(dictWasNull).toBe(true);
        await view.delete();
        await table.delete();
    });

    test("supports row windowing via start_row/end_row", async () => {
        const table = await perspective.table({ x: [10, 20, 30, 40, 50] });
        const view = await table.view();
        let result: Int32Array | null = null;
        await view.with_typed_arrays(
            { start_row: 1, end_row: 3 },
            (_n: string[], vals: ArrayLike<number>[]) => {
                result = new Int32Array(vals[0] as Int32Array);
            },
        );

        expect(Array.from(result!)).toEqual([20, 30]);
        await view.delete();
        await table.delete();
    });

    test("returns Float64Array of millis for datetime column", async () => {
        const d1 = new Date("2020-01-01T00:00:00Z");
        const d2 = new Date("2021-06-15T12:30:00Z");
        const table = await perspective.table({
            x: [d1.getTime(), d2.getTime()],
        });
        const view = await table.view();
        let result: Float64Array | null = null;
        await view.with_typed_arrays(
            {},
            (_n: string[], vals: ArrayLike<number>[]) => {
                result = new Float64Array(vals[0] as Float64Array);
            },
        );

        expect(Array.from(result!)).toEqual([d1.getTime(), d2.getTime()]);
        await view.delete();
        await table.delete();
    });

    test("returns Float64Array of millis for date column", async () => {
        const table = await perspective.table({ x: "date" });
        table.update({ x: ["2020-01-01", "2021-06-15"] });
        const view = await table.view();
        let result: Float64Array | null = null;
        await view.with_typed_arrays(
            {},
            (_n: string[], vals: ArrayLike<number>[]) => {
                result = new Float64Array(vals[0] as Float64Array);
            },
        );

        const expected = [
            new Date("2020-01-01").getTime(),
            new Date("2021-06-15").getTime(),
        ];
        expect(Array.from(result!)).toEqual(expected);
        await view.delete();
        await table.delete();
    });

    test.describe("float32 option", () => {
        test("Float64 column contents narrowed to Float32Array", async () => {
            const table = await perspective.table({ x: [1.5, 2.5, 3.5, 4.5] });
            const view = await table.view();
            let result: Float32Array | null = null;
            await view.with_typed_arrays(
                { float32: true },
                (_n: string[], vals: any[]) => {
                    result = new Float32Array(vals[0]);
                },
            );

            expect(result).toBeInstanceOf(Float32Array);
            // Values exactly representable in float32
            expect(Array.from(result!)).toEqual([1.5, 2.5, 3.5, 4.5]);
            await view.delete();
            await table.delete();
        });

        test("Int32 column is NOT affected by float32 option", async () => {
            const table = await perspective.table({ x: "integer" });
            table.update({ x: [10, 20, 30] });
            const view = await table.view();
            let isInt32 = false;
            let result: Int32Array | null = null;
            await view.with_typed_arrays(
                { float32: true },
                (_n: string[], vals: any[]) => {
                    isInt32 = vals[0] instanceof Int32Array;
                    result = new Int32Array(vals[0]);
                },
            );

            expect(isInt32).toBe(true);
            expect(Array.from(result!)).toEqual([10, 20, 30]);
            await view.delete();
            await table.delete();
        });

        test("Date column narrowed to Float32Array of millis", async () => {
            const table = await perspective.table({ x: "date" });
            table.update({ x: ["2020-01-01", "2021-06-15"] });
            const view = await table.view();
            let result: Float32Array | null = null;
            await view.with_typed_arrays(
                { float32: true },
                (_n: string[], vals: any[]) => {
                    result = new Float32Array(vals[0]);
                },
            );

            expect(result).toBeInstanceOf(Float32Array);
            // Float32 precision loss is expected for large millis values
            const expected = [
                new Date("2020-01-01").getTime(),
                new Date("2021-06-15").getTime(),
            ];
            // Narrow to f32 then back to compare (lossy conversion)
            const expectedF32 = Array.from(new Float32Array(expected));
            expect(Array.from(result!)).toEqual(expectedF32);
            await view.delete();
            await table.delete();
        });

        test("Datetime column narrowed to Float32Array of millis", async () => {
            const d1 = new Date("2020-01-01T00:00:00Z");
            const d2 = new Date("2021-06-15T12:30:00Z");
            const table = await perspective.table({
                x: [d1.getTime(), d2.getTime()],
            });
            const view = await table.view();
            let result: Float32Array | null = null;
            await view.with_typed_arrays(
                { float32: true },
                (_n: string[], vals: any[]) => {
                    result = new Float32Array(vals[0]);
                },
            );

            expect(result).toBeInstanceOf(Float32Array);
            const expectedF32 = Array.from(
                new Float32Array([d1.getTime(), d2.getTime()]),
            );
            expect(Array.from(result!)).toEqual(expectedF32);
            await view.delete();
            await table.delete();
        });

        test("Dictionary string column returns Int32Array keys (unaffected by float32)", async () => {
            const table = await perspective.table({
                x: ["a", "b", "a", "c"],
            });
            const view = await table.view();
            let isInt32 = false;
            let dict: string[] | null = null;
            await view.with_typed_arrays(
                { float32: true },
                (
                    _n: string[],
                    vals: any[],
                    _valids: any[],
                    dicts: (string[] | null)[],
                ) => {
                    isInt32 = vals[0] instanceof Int32Array;
                    dict = dicts[0] ? Array.from(dicts[0]) : null;
                },
            );

            expect(isInt32).toBe(true);
            expect(dict).not.toBeNull();
            await view.delete();
            await table.delete();
        });

        test("float32 omitted defaults to Float64Array", async () => {
            const table = await perspective.table({ x: [1.5, 2.5, 3.5] });
            const view = await table.view();
            let isFloat64 = false;
            await view.with_typed_arrays({}, (_n: string[], vals: any[]) => {
                isFloat64 = vals[0] instanceof Float64Array;
            });

            expect(isFloat64).toBe(true);
            await view.delete();
            await table.delete();
        });

        test("float32: false is equivalent to omitting it", async () => {
            const table = await perspective.table({ x: [1.5, 2.5, 3.5] });
            const view = await table.view();
            let isFloat64 = false;
            await view.with_typed_arrays(
                { float32: false },
                (_n: string[], vals: any[]) => {
                    isFloat64 = vals[0] instanceof Float64Array;
                },
            );

            expect(isFloat64).toBe(true);
            await view.delete();
            await table.delete();
        });

        test("float32 combines with row windowing", async () => {
            const table = await perspective.table({
                x: [1.5, 2.5, 3.5, 4.5, 5.5],
            });
            const view = await table.view();
            let result: Float32Array | null = null;
            await view.with_typed_arrays(
                { float32: true, start_row: 1, end_row: 4 },
                (_n: string[], vals: any[]) => {
                    result = new Float32Array(vals[0]);
                },
            );

            expect(result).toBeInstanceOf(Float32Array);
            expect(Array.from(result!)).toEqual([2.5, 3.5, 4.5]);
            await view.delete();
            await table.delete();
        });

        test("float32 on multi-column view: floats narrowed, ints unchanged", async () => {
            const table = await perspective.table({
                a: "integer",
                b: "float",
            });
            table.update({ a: [1, 2, 3], b: [1.5, 2.5, 3.5] });
            const view = await table.view();
            const typeMap: Record<string, string> = {};
            await view.with_typed_arrays(
                { float32: true },
                (n: string[], vals: any[]) => {
                    for (let i = 0; i < n.length; i++) {
                        typeMap[n[i]] = vals[i].constructor.name;
                    }
                },
            );

            expect(typeMap["a"]).toEqual("Int32Array");
            expect(typeMap["b"]).toEqual("Float32Array");
            await view.delete();
            await table.delete();
        });
    });

    test.describe("group_by", () => {
        test("emits __ROW_PATH_0__ column for single group_by", async () => {
            const table = await perspective.table({
                category: ["a", "a", "b", "b"],
                value: [1, 2, 3, 4],
            });
            const view = await table.view({
                group_by: ["category"],
                aggregates: { value: "sum" },
            });

            let names: string[] = [];
            await view.with_typed_arrays({}, (n: string[]) => {
                names = Array.from(n);
            });

            expect(names).toContain("__ROW_PATH_0__");
            // Should NOT contain the legacy "category (Group by 1)" naming
            expect(names).not.toContain("category (Group by 1)");
            await view.delete();
            await table.delete();
        });

        test("__ROW_PATH_0__ is a Dictionary column with expected values", async () => {
            const table = await perspective.table({
                category: ["a", "a", "b", "b", "c"],
                value: [1, 2, 3, 4, 5],
            });
            const view = await table.view({
                group_by: ["category"],
                aggregates: { value: "sum" },
            });

            let keys: Int32Array | null = null;
            let dict: string[] | null = null;
            await view.with_typed_arrays(
                {},
                (
                    n: string[],
                    vals: any[],
                    _valids: any[],
                    dicts: (string[] | null)[],
                ) => {
                    const idx = n.indexOf("__ROW_PATH_0__");
                    expect(idx).toBeGreaterThanOrEqual(0);
                    keys = new Int32Array(vals[idx]);
                    dict = dicts[idx] ? Array.from(dicts[idx]) : null;
                },
            );

            expect(dict).not.toBeNull();
            // Resolve keys to strings. First row is the total (empty/null),
            // remaining rows are the groups.
            const resolved = Array.from(keys!).map((k) =>
                k >= 0 ? dict![k] : null,
            );
            expect(resolved.slice(1).sort()).toEqual(["a", "b", "c"]);
            await view.delete();
            await table.delete();
        });

        test("emits __ROW_PATH_0__ and __ROW_PATH_1__ for two-level group_by", async () => {
            const table = await perspective.table({
                region: ["US", "US", "EU", "EU"],
                country: ["x", "y", "a", "b"],
                value: [1, 2, 3, 4],
            });
            const view = await table.view({
                group_by: ["region", "country"],
                aggregates: { value: "sum" },
            });

            let names: string[] = [];
            await view.with_typed_arrays({}, (n: string[]) => {
                names = Array.from(n);
            });

            expect(names).toContain("__ROW_PATH_0__");
            expect(names).toContain("__ROW_PATH_1__");
            expect(names).not.toContain("region (Group by 1)");
            expect(names).not.toContain("country (Group by 2)");
            await view.delete();
            await table.delete();
        });

        test("aggregate value column is present alongside row path", async () => {
            const table = await perspective.table({
                category: ["a", "a", "b"],
                value: [10, 20, 30],
            });
            const view = await table.view({
                group_by: ["category"],
                aggregates: { value: "sum" },
            });

            const columns: Record<string, any> = {};
            await view.with_typed_arrays(
                {},
                (
                    n: string[],
                    vals: any[],
                    _valids: any[],
                    dicts: (string[] | null)[],
                ) => {
                    for (let i = 0; i < n.length; i++) {
                        columns[n[i]] = { vals: vals[i], dict: dicts[i] };
                    }
                },
            );

            expect(columns["__ROW_PATH_0__"]).toBeDefined();
            expect(columns["value"]).toBeDefined();
            // Value column should be numeric (not Dictionary)
            expect(columns["value"].dict).toBeNull();
            await view.delete();
            await table.delete();
        });

        test("regular to_arrow still uses legacy naming by default", async () => {
            // Sanity check: `to_arrow` (not with_typed_arrays) should
            // still use legacy "colname (Group by N)" naming for backwards
            // compatibility. `with_typed_arrays` forces the new naming.
            const table = await perspective.table({
                category: ["a", "b"],
                value: [1, 2],
            });
            const view = await table.view({
                group_by: ["category"],
                aggregates: { value: "sum" },
            });

            const arrow = await view.to_arrow();
            // The Arrow IPC bytes should contain the legacy name.
            const bytes = new Uint8Array(arrow);
            const text = new TextDecoder().decode(bytes);
            expect(text.includes("(Group by 1)")).toBe(true);
            await view.delete();
            await table.delete();
        });
    });

    test.describe("group_rollup_mode: flat", () => {
        test("emits one row per distinct group (no total/aggregate rows)", async () => {
            // In flat mode, only leaf rows are emitted — no intermediate
            // rollup totals. 5 input rows with 3 distinct categories yields
            // 3 output rows (one per group).
            const table = await perspective.table({
                category: ["a", "a", "b", "b", "c"],
                value: [1, 2, 3, 4, 5],
            });
            const view = await table.view({
                group_by: ["category"],
                group_rollup_mode: "flat",
                aggregates: { value: "sum" },
            });

            let rowCount = 0;
            await view.with_typed_arrays({}, (_n: string[], vals: any[]) => {
                rowCount = vals[0].length;
            });

            expect(rowCount).toEqual(3);
            await view.delete();
            await table.delete();
        });

        test("__ROW_PATH_0__ contains one entry per distinct group", async () => {
            const table = await perspective.table({
                category: ["a", "b", "a", "c"],
                value: [10, 20, 30, 40],
            });
            const view = await table.view({
                group_by: ["category"],
                group_rollup_mode: "flat",
                aggregates: { value: "sum" },
            });

            let paths: (string | null)[] = [];
            await view.with_typed_arrays(
                {},
                (
                    n: string[],
                    vals: any[],
                    _valids: any[],
                    dicts: (string[] | null)[],
                ) => {
                    const idx = n.indexOf("__ROW_PATH_0__");
                    const keys = vals[idx] as Int32Array;
                    const dict = dicts[idx]!;
                    paths = Array.from(keys).map((k) =>
                        k >= 0 ? dict[k] : null,
                    );
                },
            );

            expect(paths.slice().sort()).toEqual(["a", "b", "c"]);
            await view.delete();
            await table.delete();
        });

        test("aggregate column contains per-group sums in flat mode", async () => {
            // Sum aggregate per group: a=10+20=30, b=30.
            const table = await perspective.table({
                category: ["a", "a", "b"],
                value: [10, 20, 30],
            });
            const view = await table.view({
                group_by: ["category"],
                group_rollup_mode: "flat",
                aggregates: { value: "sum" },
            });

            const rowMap: Record<string, number> = {};
            await view.with_typed_arrays(
                {},
                (
                    n: string[],
                    vals: any[],
                    _valids: any[],
                    dicts: (string[] | null)[],
                ) => {
                    const pathIdx = n.indexOf("__ROW_PATH_0__");
                    const valueIdx = n.indexOf("value");
                    const keys = vals[pathIdx] as Int32Array;
                    const dict = dicts[pathIdx]!;
                    const values = vals[valueIdx] as ArrayLike<number>;
                    for (let i = 0; i < keys.length; i++) {
                        rowMap[dict[keys[i]]] = values[i];
                    }
                },
            );

            expect(rowMap).toEqual({ a: 30, b: 30 });
            await view.delete();
            await table.delete();
        });

        test("flat mode with two-level group_by emits both __ROW_PATH_N__ columns", async () => {
            const table = await perspective.table({
                region: ["US", "US", "EU"],
                country: ["x", "y", "a"],
                value: [1, 2, 3],
            });
            const view = await table.view({
                group_by: ["region", "country"],
                group_rollup_mode: "flat",
                aggregates: { value: "sum" },
            });

            let names: string[] = [];
            const paths: Record<string, (string | null)[]> = {};
            await view.with_typed_arrays(
                {},
                (
                    n: string[],
                    vals: any[],
                    _valids: any[],
                    dicts: (string[] | null)[],
                ) => {
                    names = Array.from(n);
                    for (const key of ["__ROW_PATH_0__", "__ROW_PATH_1__"]) {
                        const idx = n.indexOf(key);
                        if (idx >= 0) {
                            const keys = vals[idx] as Int32Array;
                            const dict = dicts[idx]!;
                            paths[key] = Array.from(keys).map((k) =>
                                k >= 0 ? dict[k] : null,
                            );
                        }
                    }
                },
            );

            expect(names).toContain("__ROW_PATH_0__");
            expect(names).toContain("__ROW_PATH_1__");
            // 3 distinct (region, country) combinations — one row each.
            expect(paths["__ROW_PATH_0__"].length).toEqual(3);
            expect(paths["__ROW_PATH_1__"].length).toEqual(3);
            // Ensure (region, country) pairs are preserved.
            const pairs = paths["__ROW_PATH_0__"].map(
                (r, i) => `${r}|${paths["__ROW_PATH_1__"][i]}`,
            );
            expect(pairs.slice().sort()).toEqual(["EU|a", "US|x", "US|y"]);
            await view.delete();
            await table.delete();
        });

        test("flat mode: all __ROW_PATH_N__ values are non-null (no aggregate rows)", async () => {
            // In rollup mode, aggregate/total rows have null path segments.
            // In flat mode, every row is a leaf so all paths are fully
            // populated.
            const table = await perspective.table({
                region: ["US", "EU"],
                country: ["x", "y"],
                value: [1, 2],
            });
            const view = await table.view({
                group_by: ["region", "country"],
                group_rollup_mode: "flat",
                aggregates: { value: "sum" },
            });

            let hasNullPath = false;
            await view.with_typed_arrays(
                {},
                (
                    n: string[],
                    vals: any[],
                    _valids: any[],
                    dicts: (string[] | null)[],
                ) => {
                    for (let i = 0; i < n.length; i++) {
                        if (!n[i].startsWith("__ROW_PATH_")) continue;
                        const keys = vals[i] as Int32Array;
                        const dict = dicts[i];
                        for (let j = 0; j < keys.length; j++) {
                            if (keys[j] < 0 || !dict || !dict[keys[j]]) {
                                hasNullPath = true;
                                return;
                            }
                        }
                    }
                },
            );

            expect(hasNullPath).toBe(false);
            await view.delete();
            await table.delete();
        });

        test("flat mode preserves value types (Int64 aggregate not coerced)", async () => {
            // Flat-mode sum over integer input still flows through as an
            // Int64 column (from the C++ engine's aggregate type), which
            // with_typed_arrays converts to Float64Array.
            const table = await perspective.table({
                category: ["a", "b", "c"],
                value: [10, 20, 30],
            });
            const view = await table.view({
                group_by: ["category"],
                group_rollup_mode: "flat",
                aggregates: { value: "sum" },
            });

            let valueType = "";
            await view.with_typed_arrays({}, (n: string[], vals: any[]) => {
                const idx = n.indexOf("value");
                valueType = vals[idx].constructor.name;
            });

            expect(valueType).toEqual("Float64Array");
            await view.delete();
            await table.delete();
        });
    });
});
