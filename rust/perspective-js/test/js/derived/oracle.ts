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

import { expect } from "@perspective-dev/test";
import perspective from "../perspective_client.ts";

type Columns = Record<string, any[]>;
type Row = Record<string, any>;

export function key_name(column: string): string {
    return column;
}

function aggregate_name(aggregate: any): string {
    return Array.isArray(aggregate)
        ? `${aggregate[0]} by ${aggregate[1].join(", ")}`
        : aggregate;
}

export function readable_name(
    name: string,
    config: any,
    schema: Record<string, string>,
): string {
    const split =
        (config.split_by ?? []).length > 0 ? name.lastIndexOf("|") : -1;
    const prefix = split < 0 ? "" : name.slice(0, split + 1);
    const leaf = split < 0 ? name : name.slice(split + 1);
    if (!(config.group_by ?? []).includes(leaf)) {
        return name;
    }

    const aggregate =
        config.aggregates?.[leaf] ??
        (["integer", "float"].includes(schema[leaf]) ? "sum" : "count");

    return `${prefix}${leaf} (${aggregate_name(aggregate)})`;
}

export function to_rows(columns: Columns): Row[] {
    const names = Object.keys(columns);
    const size = names.length === 0 ? 0 : columns[names[0]].length;
    const rows: Row[] = [];
    for (let i = 0; i < size; i++) {
        const row: Row = {};
        for (const name of names) {
            row[name] = columns[name][i] ?? null;
        }

        rows.push(row);
    }

    return rows;
}

function normalize(value: any): any {
    if (typeof value === "number" && !Number.isInteger(value)) {
        return Number(value.toPrecision(10));
    }

    return value ?? null;
}

export function sorted(rows: Row[], names: string[]): string[] {
    return rows
        .map((row) => JSON.stringify(names.map((n) => normalize(row[n]))))
        .sort();
}

async function unroll(
    view: any,
    config: any,
    schema: Record<string, string>,
): Promise<Row[]> {
    const columns: Columns = await view.to_columns();
    const paths: any[][] = columns.__ROW_PATH__ ?? [];
    delete columns.__ROW_PATH__;
    for (const name of Object.keys(columns)) {
        const readable = readable_name(name, config, schema);
        if (readable !== name) {
            columns[readable] = columns[name];
            delete columns[name];
        }
    }

    const rows =
        Object.keys(columns).length === 0
            ? paths.map(() => ({}))
            : to_rows(columns);
    const group_by: string[] = config.group_by ?? [];
    if (group_by.length === 0) {
        return rows;
    }

    return rows.map((row, i) => {
        const out: Row = {};
        group_by.forEach((g, d) => {
            out[key_name(g)] = paths[i][d] ?? null;
        });

        return { ...out, ...row };
    });
}

export async function tree_oracle(
    source: any,
    config: any,
    live?: any,
): Promise<Row[]> {
    const schema = await source.schema();
    if (live) {
        return await unroll(live, config, schema);
    }

    const { sort, group_by_depth, ...rest } = config;
    const view = await source.view(rest);
    const rows = await unroll(view, config, schema);
    await view.delete();
    return rows;
}

export async function derived_rows(derived: any): Promise<Row[]> {
    const view = await derived.view();
    const columns = await view.to_columns();
    await view.delete();
    return to_rows(columns);
}

export async function expect_tree_parity(
    source: any,
    config: any,
    derived: any,
    live?: any,
) {
    const expected = await tree_oracle(source, config, live);
    const actual = await derived_rows(derived);
    const names = Object.keys(await derived.schema());
    const known = new Set(expected.length > 0 ? Object.keys(expected[0]) : []);
    const shared = names.filter((n) => known.has(n));
    for (const name of names.filter((n) => !known.has(n))) {
        if (expected.length > 0) {
            expect(actual.every((row) => row[name] === null)).toBe(true);
        }
    }

    expect(sorted(actual, shared)).toEqual(sorted(expected, shared));
}

export async function expect_flat_parity(view: any, derived: any) {
    const expected = to_rows(await view.to_columns());
    const actual = await derived_rows(derived);
    const names = Object.keys(await derived.schema());
    expect(sorted(actual, names)).toEqual(sorted(expected, names));
}

async function expect_snapshot_parity(
    derived: any,
    rows: Row[],
    child_config: any,
    child?: any,
) {
    if (rows.length === 0) {
        return;
    }

    const snapshot = await perspective.table(await derived.schema());
    await snapshot.update(rows);
    const expected_view = await snapshot.view(child_config);
    const actual_view = child ?? (await derived.view(child_config));
    const expected = await expected_view.to_columns();
    const actual = await actual_view.to_columns();
    await expected_view.delete();
    if (!child) {
        await actual_view.delete();
    }

    await snapshot.delete();
    const names = Object.keys(expected).filter((n) => n !== "__ROW_PATH__");
    const with_path = (columns: Columns) =>
        to_rows(columns).map((row, i) => ({
            ...row,
            __path: JSON.stringify(columns.__ROW_PATH__?.[i] ?? null),
        }));

    expect(sorted(with_path(actual), ["__path", ...names])).toEqual(
        sorted(with_path(expected), ["__path", ...names]),
    );
}

export async function expect_child_parity(
    source: any,
    config: any,
    derived: any,
    child_config: any,
    live?: any,
    child?: any,
) {
    const rows = await tree_oracle(source, config, live);
    await expect_snapshot_parity(derived, rows, child_config, child);
}

export async function expect_flat_child_parity(
    view: any,
    derived: any,
    child_config: any,
    child?: any,
) {
    const rows = to_rows(await view.to_columns());
    await expect_snapshot_parity(derived, rows, child_config, child);
}

export async function expect_rejects(promise: Promise<any>) {
    let error;
    try {
        await promise;
    } catch (e) {
        error = e;
    }

    expect(error).toBeDefined();
}

export function mulberry32(seed: number): () => number {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
