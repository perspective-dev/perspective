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
    ResolvedColumnsConfig,
    Schema,
    Tile,
    TileGroup,
} from "./types.ts";

export const NULL_TEXT = "-";

export interface TileSource {
    /** Row 0 of the view, as `View.to_columns` keys it. */
    columns: Record<string, unknown[]>;

    /** `View.column_paths` for the same columns, absent without `split_by`. */
    area: (Scalar | null | undefined)[][] | undefined;
    schema: Schema;
    split_by: string[];
    split_types: ColumnType[];
    styles: ResolvedColumnsConfig;

    /** Whether tiles nest in groups, which then carry their split values. */
    hierarchy: boolean;
}

interface Entry {
    key: string;
    name: string;
    split: (Scalar | null)[];
    value: unknown;
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

function tile(source: TileSource, entry: Entry): Tile {
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
        path,
        label: source.hierarchy ? entry.name : [...path, entry.name].join("\n"),
    };
}

/**
 * The tiles of one view row, one per column, a `split_by` column labelled
 * with its split values above its column name unless they nest in groups.
 */
export function build_tiles(source: TileSource): Tile[] {
    return entries(source).map((entry) => tile(source, entry));
}

/** The split values of `tile` down to its first `null`, the rollup levels. */
function prefix(tile: Tile): (Scalar | null)[] {
    const end = tile.split.indexOf(null);
    return end === -1 ? tile.split : tile.split.slice(0, end);
}

/**
 * `tiles` nested in a group per split value, level by level, the tiles of a
 * group that also has groups moved into a first group with no header and its
 * groups into a second.
 */
export function build_tree(tiles: Tile[]): TileGroup {
    const root: TileGroup = {
        key: "",
        label: undefined,
        tiles: [],
        groups: [],
    };
    const index = new Map<string, TileGroup>();
    tiles.forEach((tile, i) => {
        let node = root;
        const levels = prefix(tile);
        levels.forEach((_, depth) => {
            const key = JSON.stringify(levels.slice(0, depth + 1));
            let child = index.get(key);
            if (child === undefined) {
                child = { key, label: tile.path[depth], tiles: [], groups: [] };
                index.set(key, child);
                node.groups.push(child);
            }

            node = child;
        });

        node.tiles.push(i);
    });

    const split_totals = (node: TileGroup) => {
        node.groups.forEach(split_totals);
        if (node.tiles.length > 0 && node.groups.length > 0) {
            node.groups = [
                {
                    key: `${node.key}#totals`,
                    label: undefined,
                    tiles: node.tiles,
                    groups: [],
                },
                {
                    key: `${node.key}#groups`,
                    label: undefined,
                    tiles: [],
                    groups: node.groups,
                },
            ];

            node.tiles = [];
            node.rollup = true;
        }
    };

    split_totals(root);
    return root;
}
