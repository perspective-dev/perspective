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

import type { ColumnType, Scalar } from "@perspective-dev/client";
import { plugin_utils } from "./plugin_utils.ts";
import type {
    Breakdown,
    BreakdownPoint,
    ResolvedColumnsConfig,
    Schema,
    Tile,
} from "./types.ts";

export const NULL_TEXT = "-";
const LABEL_SEPARATOR = " · ";

export interface TileSource {
    /** Row 0 of the view, as `View.to_columns` keys it. */
    columns: Record<string, unknown[]>;

    /** `View.column_paths` for the same columns, absent without `split_by`. */
    area: (Scalar | null | undefined)[][] | undefined;
    schema: Schema;
    split_by: string[];
    split_types: ColumnType[];
    rollup: boolean;
    styles: ResolvedColumnsConfig;
    breakdown: Breakdown;
}

interface Entry {
    key: string;
    name: string;
    split: (Scalar | null)[];
    value: unknown;
}

function is_numeric(type: ColumnType): boolean {
    return type === "integer" || type === "float";
}

function is_ordered(type: ColumnType | undefined): boolean {
    return (
        type === "date" ||
        type === "datetime" ||
        type === "integer" ||
        type === "float"
    );
}

function format_value(
    source: TileSource,
    column: string,
    type: ColumnType,
    value: unknown,
): string {
    if (value === null || value === undefined) {
        return NULL_TEXT;
    }

    const formatter = plugin_utils().format.format_raw(
        type,
        source.styles[column] ?? {},
    );

    return formatter ? formatter.format(value as number) : String(value);
}

function format_split(
    source: TileSource,
    level: number,
    value: Scalar,
): string {
    return format_value(
        source,
        source.split_by[level],
        source.split_types[level] ?? "string",
        value,
    );
}

function entries(source: TileSource): Entry[] {
    const { isMetaColumn } = plugin_utils().column_style;
    const keys = Object.keys(source.columns).filter((x) => !isMetaColumn(x));
    const area = source.area;
    const depth = area?.length ?? 1;
    return keys.map((key, index) => ({
        key,
        name: area ? String(area[depth - 1]?.[index] ?? key) : key,
        split: area
            ? area.slice(0, depth - 1).map((level) => level[index] ?? null)
            : [],
        value: source.columns[key]?.[0] ?? null,
    }));
}

function flat_tile(source: TileSource, entry: Entry): Tile {
    const type = source.schema[entry.name] ?? "string";
    const path = entry.split.flatMap((value, level) =>
        value === null ? [] : [format_split(source, level, value)],
    );

    return {
        key: entry.key,
        name: entry.name,
        split: entry.split,
        type,
        value: entry.value,
        text: format_value(source, entry.name, type, entry.value),
        label: [...path, entry.name].join(LABEL_SEPARATOR),
    };
}

function is_total(entry: Entry): boolean {
    return entry.split.every((x) => x === null);
}

function is_first_level(entry: Entry): boolean {
    return (
        entry.split[0] !== null && entry.split.slice(1).every((x) => x === null)
    );
}

function breakdown_points(
    source: TileSource,
    type: ColumnType,
    children: Entry[],
): BreakdownPoint[] {
    return children.map((child) => ({
        label: format_split(source, 0, child.split[0]!),
        text: format_value(source, child.name, type, child.value),
        value: typeof child.value === "number" ? child.value : null,
        raw: child.split[0],
    }));
}

function rollup_tiles(source: TileSource, all: Entry[]): Tile[] | undefined {
    const by_name = new Map<string, Entry[]>();
    for (const entry of all) {
        if (!by_name.has(entry.name)) {
            by_name.set(entry.name, []);
        }

        by_name.get(entry.name)!.push(entry);
    }

    const single_level = source.split_by.length === 1;
    const tiles: Tile[] = [];
    for (const group of by_name.values()) {
        const total = group.find(is_total);
        if (total === undefined) {
            return undefined;
        }

        const tile = flat_tile(source, total);
        const children = group.filter(
            (x) => x !== total && (single_level || is_first_level(x)),
        );

        if (
            source.breakdown !== "none" &&
            is_numeric(tile.type) &&
            children.length > 0
        ) {
            tile.points = breakdown_points(source, tile.type, children);
            tile.kind =
                source.breakdown === "auto"
                    ? is_ordered(source.split_types[0])
                        ? "line"
                        : "bar"
                    : source.breakdown;
        }

        tiles.push(tile);
    }

    return tiles;
}

/**
 * The tiles of one view row: one per column, or under `split_by` one per
 * split column, or one per source column with a breakdown when the view
 * carries rollup total columns.
 */
export function build_tiles(source: TileSource): Tile[] {
    const all = entries(source);
    if (source.rollup && source.split_by.length > 0) {
        const tiles = rollup_tiles(source, all);
        if (tiles !== undefined) {
            return tiles;
        }
    }

    return all.map((entry) => flat_tile(source, entry));
}
