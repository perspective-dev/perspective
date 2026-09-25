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

import type {
    View,
    Table,
    ViewConfig,
    ColumnType,
    SortDir,
    ViewWindow,
    ViewConfigUpdate,
} from "@perspective-dev/client";

import type {
    DateFormatConfig,
    HTMLPerspectiveViewerElement,
    NumberFormatConfig,
    ViewerConfig,
} from "@perspective-dev/viewer";

import type { RegularTableElement } from "regular-table";
import type { CellMetadata, DataResponse } from "regular-table/dist/esm/types";
import type { GradientStopRgb } from "./color_utils.js";

// Re-export types from regular-table for use throughout the codebase
export type { RegularTableElement as RegularTable };

export function get_psp_type(
    model: DatagridModel,
    metadata: CellMetadata,
): ColumnType {
    if (
        metadata.type === "body" ||
        metadata.type === "column_header" ||
        metadata.type === "corner"
    ) {
        return model._column_types[metadata.x];
    } else {
        return model._row_header_types[(metadata.row_header_x ?? 0) - 1];
    }
}

// Edit mode for the datagrid

/**
 * Datagrid cell interaction mode (`plugin_config.edit_mode`):
 * `"READ_ONLY"` (default), `"EDIT"` (cells editable, writing back to the
 * `Table` - requires an editable table), or the `"SELECT_*"` modes which
 * emit selection events instead of editing.
 */
export type EditMode =
    | "READ_ONLY"
    | "EDIT"
    | "SELECT_COLUMN"
    | "SELECT_ROW"
    | "SELECT_REGION"
    | "SELECT_ROW_TREE";

// Color record for styling - tuple returned by make_color_record
export type ColorRecord = [
    string, // hex color
    number, // red
    number, // green
    number, // blue
    string, // gradient
    string, // rgba solid
    string, // rgba transparent
];

export type SortTerm = [string, SortDir];

// Selection state for mouse-based region selection
export interface SelectionArea {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

export interface SelectionState {
    selected_areas: SelectionArea[];
    dirty: boolean;
    CURRENT_MOUSEDOWN_COORDINATES?: { x?: number; y?: number };
    old_selected_areas?: SelectionArea[];
    potential_selection?: SelectionArea;
}

// Position tracking for cell focus
export interface SelectedPosition {
    x: number;
    y: number;
    content?: string;
}

/**
 * A cell of the 3×3 alignment grid: corners `"top-left"` etc., edges
 * `"top"`/`"left"`/`"right"`/`"bottom"`, or `"center"`.
 */
export type Align =
    | "top-left"
    | "top"
    | "top-right"
    | "left"
    | "center"
    | "right"
    | "bottom-left"
    | "bottom"
    | "bottom-right";

/** Foreground treatments of an integer / float column. */
export const NUMBER_FG_MODES = [
    "disabled",
    "color",
    "bar",
    "label-bar",
] as const;

/** Background treatments of an integer / float column. */
export const NUMBER_BG_MODES = [
    "disabled",
    "color",
    "gradient",
    "pulse",
] as const;

/** Foreground and background treatments of a string column. */
export const STRING_MODES = ["disabled", "color", "series"] as const;

/** Foreground and background treatments of a date / datetime column. */
export const DATETIME_MODES = ["disabled", "color"] as const;

export type NumberFgMode = (typeof NUMBER_FG_MODES)[number];
export type NumberBgMode = (typeof NUMBER_BG_MODES)[number];
export type StringMode = (typeof STRING_MODES)[number];
export type DatetimeMode = (typeof DATETIME_MODES)[number];

/**
 * Every foreground treatment some column type accepts. The subset a given
 * column accepts is `fg_modes_for(type)`; `column_config_schema()`
 * advertises exactly that subset, and the viewer rejects any other value.
 */
export type FgMode = NumberFgMode | StringMode | DatetimeMode;

/** Every background treatment some column type accepts, as {@link FgMode}. */
export type BgMode = NumberBgMode | StringMode | DatetimeMode;

/** The `fg_mode` values a column of `type` accepts, empty for boolean. */
export function fg_modes_for(type: ColumnType): readonly FgMode[] {
    switch (type) {
        case "integer":
        case "float":
            return NUMBER_FG_MODES;
        case "string":
            return STRING_MODES;
        case "date":
        case "datetime":
            return DATETIME_MODES;
        default:
            return [];
    }
}

/** The `bg_mode` values a column of `type` accepts, empty for boolean. */
export function bg_modes_for(type: ColumnType): readonly BgMode[] {
    switch (type) {
        case "integer":
        case "float":
            return NUMBER_BG_MODES;
        case "string":
            return STRING_MODES;
        case "date":
        case "datetime":
            return DATETIME_MODES;
        default:
            return [];
    }
}

/** The `fg_mode` an omitted key stands for: colored text for numbers. */
export function default_fg_mode(type: ColumnType): FgMode {
    return type === "integer" || type === "float" ? "color" : "disabled";
}

/** The `bg_mode` an omitted key stands for. */
export function default_bg_mode(_type: ColumnType): BgMode {
    return "disabled";
}

/** `raw` as an `fg_mode` a column of `type` accepts, else `undefined`. */
export function parse_fg_mode(
    type: ColumnType,
    raw: unknown,
): FgMode | undefined {
    return (fg_modes_for(type) as readonly unknown[]).includes(raw)
        ? (raw as FgMode)
        : undefined;
}

/** `raw` as a `bg_mode` a column of `type` accepts, else `undefined`. */
export function parse_bg_mode(
    type: ColumnType,
    raw: unknown,
): BgMode | undefined {
    return (bg_modes_for(type) as readonly unknown[]).includes(raw)
        ? (raw as BgMode)
        : undefined;
}

/**
 * Datagrid per-column style configuration - one value of the
 * `columns_config` map of a `ViewerConfigUpdate` when the Datagrid plugin
 * is active. Valid keys depend on the column's type; the authoritative,
 * value-dependent declaration is `column_config_schema()` (surfaced at
 * runtime via the agent's `get_style_schema` tool and the Style tab).
 */
export interface ColumnConfig {
    /**
     * Foreground treatment. Numeric columns: `"color"` (default, text
     * colored by sign), `"bar"` (proportional bar), `"label-bar"` (bar
     * with label) or `"disabled"`. String columns: `"disabled"` (default),
     * `"color"` or `"series"` (one `fg_color` palette entry per distinct
     * value). Date / datetime columns: `"disabled"` (default) or
     * `"color"`. A mode the column's type does not accept is rejected on
     * input.
     */
    fg_mode?: FgMode;

    /**
     * Background treatment. Numeric columns: `"disabled"` (default),
     * `"color"` (solid fill by sign), `"gradient"` (fill intensity scaled
     * to the value) or `"pulse"` (flash on change). String columns:
     * `"disabled"`, `"color"` or `"series"`. Date / datetime columns:
     * `"disabled"` or `"color"`.
     */
    bg_mode?: BgMode;

    /**
     * The foreground color value, a CSS string whose grammar follows the
     * column's type and `fg_mode` - not advertised while the mode is
     * `"disabled"`:
     *
     * - numeric columns: sign-split stops, `linear-gradient(to right,
     *   #rrggbb 0%, #rrggbb 100%)`, t-ordered (the first stop is the
     *   negative color, the last the positive);
     * - string / datetime columns in `"color"` mode: one color, `#rrggbb`;
     * - string columns in `"series"` mode: a palette assigned to distinct
     *   values in encounter order, `linear-gradient(to right, #rrggbb, …)`
     *   with no positions.
     */
    fg_color?: string;

    /**
     * The background color value, as `fg_color` but keyed by `bg_mode`.
     * Numeric `"gradient"` and `"pulse"` modes take a color scale with the
     * sign pivot at offset 0.5.
     */
    bg_color?: string;

    /**
     * Numeric columns: the absolute value at which bar/gradient
     * foreground modes reach full scale.
     */
    fg_gradient?: number;

    /**
     * Numeric columns: the absolute value at which gradient background
     * mode reaches full scale.
     */
    bg_gradient?: number;

    fixed?: number;

    /**
     * Group-by rollup depth override for this column when the view is
     * pivoted in `Rollup` mode.
     */
    aggregate_depth?: number;

    /** Pixel width override, written when a user drag-resizes a column. */
    column_size_override?: number;

    /**
     * Font family for this column's body cells, overriding
     * `plugin_config.font_family`.
     */
    font_family?: string;

    /**
     * Font size in CSS pixels for this column's body cells, overriding
     * `plugin_config.font_size`.
     */
    font_size?: number;

    /**
     * Wrap this column's clipped text (`true`) or clip it with an ellipsis
     * (`false`), overriding `plugin_config.word_wrap`.
     */
    word_wrap?: boolean;

    /**
     * Alignment of this column's body cells, overriding
     * `plugin_config.align`.
     */
    align?: Align;

    /**
     * String columns: render each value as a hyperlink to itself, which is
     * then not text-editable.
     */
    link?: boolean;

    /** Bold body text for this column, overriding `plugin_config.bold`. */
    bold?: boolean;

    /** Italic body text for this column, overriding `plugin_config.italic`. */
    italic?: boolean;

    /** Datetime columns: display format preset or custom fields. */
    date_format?: DateFormatConfig;

    /**
     * Numeric columns: `Intl.NumberFormat`-style options controlling
     * digits, notation, currency, etc.
     */
    number_format?: NumberFormatConfig;
}

// The format-object types are the VIEWER's exported contract - its
// `createNumberFormatter` / `createDatetimeFormatter` consume them and its
// style editors write them - so they are imported, not redefined.
export type {
    NumberFormatConfig,
    DateFormatConfig,
} from "@perspective-dev/viewer";

export type ColumnsConfig = Record<string, ColumnConfig>;

/**
 * A column's {@link ColumnConfig} with its `fg_color` / `bg_color` strings
 * parsed once at `restore()`. Column types are not known at restore time,
 * so every reader runs and each parsed form is present when its grammar
 * matched; the per-type cell style handlers pick the form their mode
 * needs.
 */
export interface ResolvedColumnStyle
    extends Omit<ColumnConfig, "fg_color" | "bg_color"> {
    /** `fg_color` as a single color (string / datetime `"color"` mode). */
    fg_color?: ColorRecord;
    bg_color?: ColorRecord;

    /** `fg_color` as gradient stops (numeric columns), t-ordered. */
    fg_stops?: GradientStopRgb[];
    bg_stops?: GradientStopRgb[];

    /** End colors of `fg_stops` / `bg_stops`: the last stop is positive. */
    pos_fg_color?: ColorRecord;
    neg_fg_color?: ColorRecord;
    pos_bg_color?: ColorRecord;
    neg_bg_color?: ColorRecord;

    /** `fg_color` as a palette (string `"series"` mode), `#rrggbb` each. */
    fg_palette?: string[];
    bg_palette?: string[];
}

/** What `restore()` stores under {@link PRIVATE_PLUGIN_SYMBOL}. */
export type ResolvedColumnsConfig = Record<string, ResolvedColumnStyle>;

/**
 * Datagrid plugin-level configuration - the `plugin_config` slot of a
 * `ViewerConfigUpdate` when the Datagrid plugin is active (the
 * `save()`/`restore()` token).
 */
export interface DatagridPluginConfig {
    /** Legacy alias for `edit_mode: "EDIT"`. */
    editable?: boolean;

    /**
     * When `true`, the Datagrid keeps its scroll position pinned during
     * data updates instead of following appended rows.
     */
    scroll_lock?: boolean;

    /**
     * Whether the header shows the per-column edit-button row while the
     * settings panel is open (default `true`).
     */
    column_menus?: boolean;

    /** Cell interaction mode - see {@link EditMode}. */
    edit_mode?: EditMode;

    /**
     * Font family for every cell: `"inherit"` (the default, and the
     * meaning of an omitted key), a CSS generic family, or a local font
     * family name as listed by the browser's Local Font Access API.
     */
    font_family?: string;

    /** Cell font size in CSS pixels, defaulting to the theme's. */
    font_size?: number;

    /** Bold text in every cell unless a column's own `bold` overrides it. */
    bold?: boolean;

    /** Italic text in every cell unless a column's own `italic` overrides it. */
    italic?: boolean;

    /**
     * When `true`, text in a column narrower than its content wraps onto
     * further lines instead of being clipped with an ellipsis.
     */
    word_wrap?: boolean;

    /**
     * Alignment of every body cell, defaulting to the column type's (numbers
     * right, others left, vertically centered).
     */
    align?: Align;

    /** Row height in CSS pixels, defaulting to the theme's. */
    row_height?: number;

    /**
     * Zebra striping period: every `zebra_rows` rows alternate between the
     * plain background and `zebra_color`, with `0` (default) disabling
     * striping.
     */
    zebra_rows?: number;

    /**
     * Stripe color for zebra rows as `#rrggbb`, present only while
     * `zebra_rows >= 1`.
     */
    zebra_color?: string;

    column_size_override?: Record<string, number>;
}

export type Schema = Record<string, ColumnType>;

// Model object stored on regular-table
export interface DatagridModel {
    /** This datagrid's panel id (the plugin element's `slot`, stamped by the
     * host viewer) — `undefined` for a lone, unslotted panel. Passed as the
     * `name` argument of the host's `*Panel` API variants so every viewer
     * call targets THIS panel, never the host's active panel. */
    _panel?: string;
    _edit_port: number;
    _view: View;
    _table: Table;
    _table_schema: Schema;
    _config: ViewerConfig;
    _num_rows: number;
    _num_columns?: number;
    _schema: Schema;

    /// Output types of the view's `windows` columns, synthesized in
    /// `create.ts` - a window column used only in `group_by` appears in no
    /// queryable schema (`view.schema()` covers visible columns only).
    _window_schema: Schema;
    _theme: string;
    _ids: unknown[][];
    _plugin_background: number[];
    _color: ColorRecord;
    _pos_fg_color: ColorRecord;
    _neg_fg_color: ColorRecord;
    _pos_bg_color: ColorRecord;
    _neg_bg_color: ColorRecord;

    _default_bg_color_stops: GradientStopRgb[];

    _series_palette: string[];
    _column_paths: string[];
    _column_types: ColumnType[];
    _is_editable: boolean[];
    _edit_mode: EditMode;

    /**
     * `plugin_config.row_height`, reported on every `DataResponse` so
     * `regular-table` sizes its viewport with it.
     */
    _row_height?: number;

    /**
     * Column width overrides keyed by column path, the plugin's single
     * source of truth shared by reference with the element.
     */
    _column_overrides: Map<string, number>;

    /**
     * What the plugin last wrote into `regular-table`'s override map at each
     * size key, the base of the three-way reconcile.
     */
    _projected: Map<number, ProjectedWidth>;

    /**
     * Row-header count reported on the last `DataResponse`, the offset of a
     * data column's `regular-table` size key.
     */
    _num_row_headers: number;

    /**
     * Paths whose override changed by user gesture and has not yet been
     * echoed to the host.
     */
    _unpersisted_widths: Set<string>;

    /** `plugin_config.word_wrap`, mirrored from the plugin element. */
    _word_wrap: boolean;
    _column_menus: boolean;

    /** `plugin_config.align`, mirrored from the plugin element. */
    _align?: Align;
    _tree_selection_id?: unknown[];
    _last_insert_configs?: ViewConfigUpdate[];
    _selection_state: SelectionState;
    _row_header_types: ColumnType[];
    _series_color_map: Map<string, Map<string, number>>;
    _series_color_seed: Map<string, number>;
    _last_window?: ViewWindow;
    _is_old_viewport?: boolean;
    _reverse_columns?: Map<string, number>;
    _reverse_ids?: Map<string, number>;
    last_column_paths?: string[];
    last_meta?: unknown[][];
    last_ids?: unknown[][];
    last_reverse_ids?: Map<string, number>;
    last_reverse_columns?: Map<string, number>;
    get_psp_type(metadata: CellMetadata): ColumnType;
    _column_settings_selected_column?: string;
}

// Symbol for private plugin data on regular-table
export const PRIVATE_PLUGIN_SYMBOL: unique symbol = Symbol(
    "Perspective Column Config",
);

// Data listener function type
export type DataListener = (
    regularTable: RegularTableElement,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
) => Promise<DataResponse>;

// Style listener function type
export type StyleListener = () => void;

// Toolbar element interface
export interface DatagridToolbarElement extends HTMLElement {
    setEditButton(button: HTMLElement): void;
    setScrollLockButton(button: HTMLElement): void;
}

/** One `regular-table` override entry as the plugin last wrote it. */
export interface ProjectedWidth {
    path: string;
    px: number | undefined;
}

// Formatter cache types
export interface FormatterCacheEntry {
    format(value: unknown): string;
}

export type FormatterCache = Map<string, FormatterCacheEntry>;

// Cell config result from getCellConfig
export interface CellConfigResult {
    row: Record<string, unknown>;
    column_names: string[];
    config: ViewConfigUpdate;
}

// Custom event detail types
export interface PerspectiveClickDetail {
    row: Record<string, unknown>;
    column_names: string[];
    config: Partial<ViewConfig>;
    /** The id (`slot`) of the panel that fired this, in a multi-panel viewer. */
    panel?: string;
}

export { PerspectiveSelectDetail } from "@perspective-dev/viewer/select-detail";

// Mouse event with handled flag
export interface HandledMouseEvent extends MouseEvent {
    handled?: boolean;
}

// Sort order mappings
export type SortRotationOrder = Record<string, SortDir | undefined>;

// Datagrid plugin element interface for toolbar
export interface DatagridPluginElement extends HTMLElement {
    regular_table: RegularTableElement;
    model?: DatagridModel;
    _columns_config: ColumnsConfig;
    _toolbar?: DatagridToolbarElement;
    _edit_button?: HTMLElement;
    _scroll_lock?: HTMLElement;
    _is_scroll_lock: boolean;
    _edit_mode: EditMode;
    _font_family?: string;
    _font_size?: number;
    _bold: boolean;
    _italic: boolean;
    _word_wrap: boolean;
    _column_menus: boolean;
    _align?: Align;
    _row_height?: number;
    _zebra_rows: number;
    _zebra_color?: string;
    _column_overrides: Map<string, number>;
    _initialized?: boolean;
    _reset_scroll_top?: boolean;
    _reset_scroll_left?: boolean;
    _reset_select?: boolean;
    _reset_column_size?: boolean;
}

// Map types for selected positions
export type SelectedPositionMap = WeakMap<
    RegularTableElement,
    SelectedPosition
>;

// Centralized editable mode check - used by style handlers and event handlers
export function isEditableMode(
    model: DatagridModel,
    _viewer: HTMLPerspectiveViewerElement,
    allowed: boolean = false,
): boolean {
    const has_pivots =
        model._config.group_by.length === 0 &&
        model._config.split_by.length === 0;
    // Read the edit mode from the model (mirrored from the plugin element in
    // `model/create.ts`) rather than `viewer.children[0]`: the host viewer's
    // light DOM now also holds per-panel `<perspective-viewer-tab>` and
    // `statusbar-extra-*` elements, so the datagrid plugin is no longer
    // reliably the first child.
    const editable = allowed || model._edit_mode === "EDIT";
    return has_pivots && editable;
}
