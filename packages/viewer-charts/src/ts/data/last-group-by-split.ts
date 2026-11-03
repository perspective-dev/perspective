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

import type { ColumnData, ColumnDataMap } from "./view-reader";
import { formatLevelValue } from "../charts/common/category-axis-resolver";
import type { DateFormatModifiers } from "@perspective-dev/viewer/column-format";

export interface LastGroupBySplit {
    columns: ColumnDataMap;

    numRows: number;

    groupBy: string[];

    values: string[];

    sourceRow: Int32Array;

    prefixes: Map<string, { value: number; facet: string }>;
}

type DataArray = Int32Array | Float32Array | Float64Array;

/**
 * Grow-only buffers a chart holds across builds so a streaming update
 * re-runs the transpose without allocating.
 */
export interface LastGroupBySplitScratch {
    categoryOf: Int32Array;

    valueOf: Int32Array;

    firstRowOf: Int32Array;

    sourceRow: Int32Array;

    slots: { data: DataArray; valid: Uint8Array }[];
}

export function createLastGroupBySplitScratch(): LastGroupBySplitScratch {
    return {
        categoryOf: new Int32Array(0),
        valueOf: new Int32Array(0),
        firstRowOf: new Int32Array(0),
        sourceRow: new Int32Array(0),
        slots: [],
    };
}

export function lastGroupBySplit(
    columns: ColumnDataMap,
    numRows: number,
    groupBy: string[],
    levelTypes: string[],
    dateModifiers: DateFormatModifiers | undefined,
    scratch: LastGroupBySplitScratch,
): LastGroupBySplit | null {
    const L = groupBy.length;
    if (L < 2) {
        return null;
    }

    const last = columns.get(`__ROW_PATH_${L - 1}__`);
    if (!last) {
        return null;
    }

    const leading: ColumnData[] = [];
    for (let n = 0; n < L - 1; n++) {
        const col = columns.get(`__ROW_PATH_${n}__`);
        if (!col) {
            return null;
        }

        leading.push(col);
    }

    const categoryOf = (scratch.categoryOf = ensureInt32(
        scratch.categoryOf,
        numRows,
    ));
    const firstRowOf = (scratch.firstRowOf = ensureInt32(
        scratch.firstRowOf,
        numRows,
    ));
    const keyToCategory = new Map<string, number>();
    let C = 0;
    for (let r = 0; r < numRows; r++) {
        if (r > 0 && sameLeadingPath(leading, r, r - 1)) {
            categoryOf[r] = categoryOf[r - 1];
            continue;
        }

        const key = leadingKey(leading, r);
        let c = keyToCategory.get(key);
        if (c === undefined) {
            c = C++;
            keyToCategory.set(key, c);
            firstRowOf[c] = r;
        }

        categoryOf[r] = c;
    }

    const valueOf = (scratch.valueOf = ensureInt32(scratch.valueOf, numRows));
    const seen: string[] = [];
    const seenKeys: (string | number)[] = [];
    const levelType = levelTypes[L - 1] ?? "string";
    let nullSlot = -1;
    const nullValue = () => {
        if (nullSlot === -1) {
            nullSlot = seen.length;
            seen.push("");
            seenKeys.push(
                last.type === "string" ? "" : Number.NEGATIVE_INFINITY,
            );
        }

        return nullSlot;
    };

    if (last.type === "string" && last.indices && last.dictionary) {
        const codes = last.indices;
        const dictionary = last.dictionary;
        const slotOfCode = new Int32Array(dictionary.length).fill(-1);
        for (let r = 0; r < numRows; r++) {
            if (!isValid(last, r)) {
                valueOf[r] = nullValue();
                continue;
            }

            const code = codes[r];
            let v = slotOfCode[code];
            if (v === -1) {
                v = seen.length;
                slotOfCode[code] = v;
                const label = dictionary[code] ?? "";
                seen.push(label);
                seenKeys.push(label);
            }

            valueOf[r] = v;
        }
    } else {
        const raw = last.values!;
        const slotOfRaw = new Map<number, number>();
        const slotOfLabel = new Map<string, number>();
        for (let r = 0; r < numRows; r++) {
            if (!isValid(last, r)) {
                valueOf[r] = nullValue();
                continue;
            }

            const x = raw[r];
            let v = slotOfRaw.get(x);
            if (v === undefined) {
                const label = formatLevelValue(
                    x,
                    true,
                    levelType,
                    dateModifiers,
                );
                v = slotOfLabel.get(label);
                if (v === undefined) {
                    v = seen.length;
                    slotOfLabel.set(label, v);
                    seen.push(label);
                    seenKeys.push(x);
                }

                slotOfRaw.set(x, v);
            }

            valueOf[r] = v;
        }
    }

    const order = seen
        .map((_, i) => i)
        .sort((a, b) => {
            const ka = seenKeys[a];
            const kb = seenKeys[b];
            if (typeof ka === "number" && typeof kb === "number") {
                return ka - kb;
            }

            return ka < kb ? -1 : ka > kb ? 1 : 0;
        });

    const rank = new Int32Array(order.length);
    for (let i = 0; i < order.length; i++) {
        rank[order[i]] = i;
    }

    const values = order.map((i) => seen[i]);
    const V = values.length;
    const sourceRow = (scratch.sourceRow = ensureInt32(
        scratch.sourceRow,
        C * V,
    ));
    sourceRow.fill(-1, 0, C * V);
    for (let r = 0; r < numRows; r++) {
        const v = rank[valueOf[r]];
        valueOf[r] = v;
        const idx = categoryOf[r] * V + v;
        if (sourceRow[idx] === -1) {
            sourceRow[idx] = r;
        }
    }

    const data: { name: string; col: ColumnData }[] = [];
    for (const [name, col] of columns) {
        if (!name.startsWith("__")) {
            data.push({ name, col });
        }
    }

    const out: ColumnDataMap = new Map();
    const prefixes = new Map<string, { value: number; facet: string }>();
    const validBytes = (C + 7) >> 3;
    let slot = 0;
    for (let n = 0; n < L - 1; n++) {
        const col = leading[n];
        const dst = ensureSlot(scratch, slot++, col, C);
        const src = sourceArray(col);
        for (let c = 0; c < C; c++) {
            const r = firstRowOf[c];
            dst.data[c] = src[r];
            if (isValid(col, r)) {
                dst.valid[c >> 3] |= 1 << (c & 7);
            }
        }

        out.set(`__ROW_PATH_${n}__`, view(col, dst, C, validBytes));
    }

    const base = slot;
    const dataSlots: { data: DataArray; valid: Uint8Array }[] = [];
    for (let a = 0; a < data.length; a++) {
        const { name, col } = data[a];
        const pipe = name.lastIndexOf("|");
        const splitPrefix = pipe === -1 ? "" : name.substring(0, pipe);
        const baseName = pipe === -1 ? name : name.substring(pipe + 1);
        for (let v = 0; v < V; v++) {
            const dst = ensureSlot(scratch, base + a * V + v, col, C);
            dataSlots.push(dst);
            const prefix =
                splitPrefix === "" ? values[v] : `${splitPrefix}|${values[v]}`;
            out.set(`${prefix}|${baseName}`, view(col, dst, C, validBytes));
            prefixes.set(prefix, { value: v, facet: splitPrefix });
        }
    }

    for (let a = 0; a < data.length; a++) {
        const col = data[a].col;
        const src = sourceArray(col);
        const srcValid = col.valid;
        for (let r = 0; r < numRows; r++) {
            const c = categoryOf[r];
            const v = valueOf[r];
            if (sourceRow[c * V + v] !== r) {
                continue;
            }

            const dst = dataSlots[a * V + v];
            dst.data[c] = src[r];
            if (!srcValid || (srcValid[r >> 3] >> (r & 7)) & 1) {
                dst.valid[c >> 3] |= 1 << (c & 7);
            }
        }
    }

    return {
        columns: out,
        numRows: C,
        groupBy: groupBy.slice(0, L - 1),
        values,
        sourceRow,
        prefixes,
    };
}

function isValid(col: ColumnData, r: number): boolean {
    const valid = col.valid;
    return !valid || ((valid[r >> 3] >> (r & 7)) & 1) === 1;
}

function sourceArray(col: ColumnData): DataArray {
    return col.type === "string" ? col.indices! : col.values!;
}

function sameLeadingPath(leading: ColumnData[], a: number, b: number): boolean {
    for (const col of leading) {
        const va = isValid(col, a);
        if (va !== isValid(col, b)) {
            return false;
        }

        if (va) {
            const src = sourceArray(col);
            if (src[a] !== src[b]) {
                return false;
            }
        }
    }

    return true;
}

function leadingKey(leading: ColumnData[], r: number): string {
    let key = "";
    for (const col of leading) {
        key += isValid(col, r) ? `${sourceArray(col)[r]}\u0000` : "\u0001";
    }

    return key;
}

function ensureInt32(arr: Int32Array, len: number): Int32Array {
    return arr.length >= len ? arr : new Int32Array(len);
}

function ensureSlot(
    scratch: LastGroupBySplitScratch,
    slot: number,
    col: ColumnData,
    len: number,
): { data: DataArray; valid: Uint8Array } {
    const ctor =
        col.type === "float64"
            ? Float64Array
            : col.type === "float32"
              ? Float32Array
              : Int32Array;
    let entry = scratch.slots[slot];
    if (!entry || !(entry.data instanceof ctor) || entry.data.length < len) {
        entry = {
            data: new ctor(len),
            valid: new Uint8Array((len + 7) >> 3),
        };
        scratch.slots[slot] = entry;
    } else if (entry.valid.length < (len + 7) >> 3) {
        entry.valid = new Uint8Array((len + 7) >> 3);
    }

    entry.data.fill(0, 0, len);
    entry.valid.fill(0, 0, (len + 7) >> 3);
    return entry;
}

function view(
    col: ColumnData,
    slot: { data: DataArray; valid: Uint8Array },
    len: number,
    validBytes: number,
): ColumnData {
    const valid = slot.valid.subarray(0, validBytes);
    if (col.type === "string") {
        return {
            type: "string",
            indices: slot.data.subarray(0, len) as Int32Array,
            dictionary: col.dictionary,
            valid,
        };
    }

    return { type: col.type, values: slot.data.subarray(0, len), valid };
}
