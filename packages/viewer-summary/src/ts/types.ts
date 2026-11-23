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
import type {
    Align,
    ColumnStyleConfig,
    Resolved,
} from "@perspective-dev/viewer";

/** Where a tile's column label sits relative to its value. */
export type LabelPosition =
    | "auto"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "none";

/** Whether every tile shares one value text size or each fits its own. */
export type ValueFit = "uniform" | "independent";

/** Whether `split_by` tiles form one grid or nest in a group per split value. */
export type LayoutMode = "flat" | "hierarchy";

export const LABEL_POSITIONS = [
    "auto",
    "top",
    "bottom",
    "left",
    "right",
    "none",
] as const satisfies readonly LabelPosition[];

export const VALUE_FITS = [
    "uniform",
    "independent",
] as const satisfies readonly ValueFit[];

export const LAYOUT_MODES = [
    "flat",
    "hierarchy",
] as const satisfies readonly LayoutMode[];

/**
 * Summary per-column style configuration - one value of the `columns_config`
 * map of a `ViewerConfigUpdate` when the Summary plugin is active, with the
 * color and format keys of {@link ColumnStyleConfig}.
 */
export interface ColumnConfig extends ColumnStyleConfig {
    /** Font family of this column's value, overriding `plugin_config.font_family`. */
    font_family?: string;

    /** Bold value text, overriding `plugin_config.bold`. */
    bold?: boolean;

    /** Italic value text, overriding `plugin_config.italic`. */
    italic?: boolean;

    /** Placement of this tile's content, overriding `plugin_config.align`. */
    align?: Align;

    /** Where this tile's label sits, overriding `plugin_config.label_position`. */
    label_position?: LabelPosition;
}

export type ColumnsConfig = Record<string, ColumnConfig>;

/** Each column's {@link ColumnConfig} with its color strings parsed at `restore()`. */
export type ResolvedColumnsConfig = Record<string, Resolved<ColumnConfig>>;

export type Schema = Record<string, ColumnType>;

/**
 * Summary plugin-level configuration - the `plugin_config` slot of a
 * `ViewerConfigUpdate` when the Summary plugin is active.
 */
export interface SummaryPluginConfig {
    /**
     * Where each tile's column label sits: `"auto"` (default) picks `"top"`
     * or `"left"`, whichever leaves the larger value text.
     */
    label_position?: LabelPosition;

    /**
     * `"uniform"` (default) sizes every value to the tightest tile's fit;
     * `"independent"` fits each tile's value to its own text.
     */
    value_fit?: ValueFit;

    /**
     * `"flat"` (default) draws every `split_by` column as one grid of tiles;
     * `"hierarchy"` nests them in a labelled group per split value, level
     * by level, with any rollup totals first in each group.
     */
    layout_mode?: LayoutMode;

    /**
     * The number of tile columns, or `0` (default) to fit them to the
     * panel; under `"hierarchy"`, of the tiles in each innermost group.
     */
    grid_columns?: number;

    /**
     * The number of tile rows in view, or `0` (default) to fit them to the
     * panel; under `"hierarchy"`, of the tiles in each innermost group.
     */
    grid_rows?: number;

    /** Font family of every value, `"inherit"` by default. */
    font_family?: string;

    /** Bold values unless a column's own `bold` overrides it. */
    bold?: boolean;

    /** Italic values unless a column's own `italic` overrides it. */
    italic?: boolean;

    /**
     * Placement of each tile's content, by default `"right"` for numbers and
     * `"left"` otherwise.
     */
    align?: Align;
}

/** A {@link SummaryPluginConfig} with every enum defaulted. */
export interface ResolvedPluginConfig {
    label_position: LabelPosition;
    value_fit: ValueFit;
    layout_mode: LayoutMode;
    grid_columns: number | undefined;
    grid_rows: number | undefined;
    font_family: string | undefined;
    bold: boolean;
    italic: boolean;
    align: Align | undefined;
}

/** One tile: a column's value in the total row, formatted. */
export interface Tile {
    key: string;
    name: string;
    split: (Scalar | null)[];
    type: ColumnType;
    value: unknown;
    text: string;

    /** The tile's formatted split values, outermost first, without nulls. */
    path: string[];

    /** The tile's column name, under `"flat"` after its split values, one per line. */
    label: string;
}

/** A group of tiles under one split value, or the root of every group. */
export interface TileGroup {
    key: string;

    /** The group's split value, or `undefined` for a group with no header. */
    label: string | undefined;

    /** Indices of the tiles directly in this group, when it has no groups. */
    tiles: number[];
    groups: TileGroup[];

    /** Whether `groups` is this group's rollup totals then its other groups. */
    rollup?: boolean;
}
