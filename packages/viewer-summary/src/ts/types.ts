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

/** How a tile draws its `split_by` values beneath the total. */
export type Breakdown = "auto" | "line" | "bar" | "none";

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

export const BREAKDOWNS = [
    "auto",
    "line",
    "bar",
    "none",
] as const satisfies readonly Breakdown[];

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
     * With `split_by` in `split_rollup_mode: "rollup"`, how the first split
     * level is drawn beneath each total: `"auto"` (default) is a line for a
     * date, datetime or numeric split column and bars otherwise.
     */
    breakdown?: Breakdown;

    /** Font family of every value, `"inherit"` by default. */
    font_family?: string;

    /** Bold values unless a column's own `bold` overrides it. */
    bold?: boolean;

    /** Italic values unless a column's own `italic` overrides it. */
    italic?: boolean;

    /** Placement of each tile's content, `"center"` by default. */
    align?: Align;
}

/** A {@link SummaryPluginConfig} with every enum defaulted. */
export interface ResolvedPluginConfig {
    label_position: LabelPosition;
    value_fit: ValueFit;
    breakdown: Breakdown;
    font_family: string | undefined;
    bold: boolean;
    italic: boolean;
    align: Align | undefined;
}

/** One mark of a tile's breakdown. */
export interface BreakdownPoint {
    label: string;
    text: string;
    value: number | null;
    raw: Scalar | null;
}

/** One tile: a column's total, formatted, with its optional breakdown. */
export interface Tile {
    key: string;
    name: string;
    split: (Scalar | null)[];
    type: ColumnType;
    value: unknown;
    text: string;
    label: string;
    points?: BreakdownPoint[];
    kind?: "line" | "bar";
}
