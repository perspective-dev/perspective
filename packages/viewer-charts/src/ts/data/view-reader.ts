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

import type { View } from "@perspective-dev/client";

export interface ColumnData {
    type: "float32" | "int32" | "string";
    values?: Float32Array | Int32Array;
    /** Dictionary key indices for string columns. */
    indices?: Int32Array;
    /** Dictionary values for string columns. */
    dictionary?: string[];
    /** Arrow validity bitfield (1 bit per row). */
    valid?: Uint8Array;
}

export type ColumnDataMap = Map<string, ColumnData>;

export interface TypedArrayWindowOptions {
    start_row?: number;
    end_row?: number;
    start_col?: number;
    end_col?: number;
    float32?: boolean;
}

/**
 * Fetches all columns from a View using `with_typed_arrays` and
 * builds a `ColumnDataMap`. The `values` typed arrays and `valid`
 * bitmaps are zero-copy views into WASM memory and remain valid only
 * for the duration of the `render` callback — if `render` returns a
 * `Promise`, the underlying `with_typed_arrays` call awaits it before
 * releasing the backing Arrow buffer. Callers must not retain any
 * `ColumnData` reference past `render`'s resolution.
 */
export async function viewToColumnDataMap(
    view: View,
    render: (data: ColumnDataMap) => void | Promise<void>,
    options?: TypedArrayWindowOptions,
): Promise<void> {
    const result: ColumnDataMap = new Map();

    await (view as any).with_typed_arrays(
        options ?? {},
        async (
            names: string[],
            values: ArrayLike<number>[],
            validities: (Uint8Array | null)[],
            dictionaries: (string[] | null)[],
        ) => {
            for (let i = 0; i < names.length; i++) {
                const name = names[i];
                const vals = values[i];
                const valid = validities[i] ?? undefined;
                const dict = dictionaries[i];

                if (dict !== null) {
                    result.set(name, {
                        type: "string",
                        indices: vals as Int32Array,
                        dictionary: dict,
                        valid,
                    });
                } else if (vals instanceof Float32Array) {
                    result.set(name, { type: "float32", values: vals, valid });
                } else if (vals instanceof Int32Array) {
                    result.set(name, { type: "int32", values: vals, valid });
                } else if (vals instanceof Float64Array) {
                    // Float64 without float32 mode — narrow for WebGL
                    result.set(name, {
                        type: "float32",
                        values: new Float32Array(vals),
                        valid,
                    });
                } else {
                    // Fallback: treat as float32
                    // TODO: Instance check if this needs a copy?
                    result.set(name, {
                        type: "float32",
                        values: new Float32Array(vals as any),
                        valid,
                    });
                }
            }

            await render(result);
        },
    );
}
