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
 * Datagrid per-column style configuration - one value of the
 * `columns_config` map of a `ViewerConfigUpdate` when the Datagrid plugin
 * is active. Valid keys depend on the column's type; the authoritative,
 * value-dependent declaration is `column_config_schema()` (surfaced at
 * runtime via the agent's `get_style_schema` tool and the Style tab).
 */
export interface ColumnConfig {
    /** String / datetime columns: the applied color (CSS color). */
    color?: string;

    /** Numeric columns: positive-value foreground color (CSS color). */
    pos_fg_color?: string;

    /** Numeric columns: negative-value foreground color (CSS color). */
    neg_fg_color?: string;

    /** Numeric columns: positive-value background color (CSS color). */
    pos_bg_color?: string;

    /** Numeric columns: negative-value background color (CSS color). */
    neg_bg_color?: string;

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

    /**
     * Numeric columns: foreground treatment - `"color"` (default,
     * colored text), `"bar"` (proportional bar), `"label-bar"` (bar with
     * label) or `"disabled"`.
     */
    number_fg_mode?: string;

    /**
     * Numeric columns: background treatment - `"disabled"` (default),
     * `"color"` (solid fill) or `"gradient"` (fill intensity scaled to
     * the value).
     */
    number_bg_mode?: string;

    /**
     * String columns: color mode (`"foreground"`, `"background"` or
     * `"series"`), paired with `color`.
     */
    string_color_mode?: string;

    /**
     * Datetime columns: color mode (`"foreground"` or `"background"`),
     * paired with `color`.
     */
    datetime_color_mode?: string;

    fixed?: number;

    /**
     * Group-by rollup depth override for this column when the view is
     * pivoted in `Rollup` mode.
     */
    aggregate_depth?: number;

    /** Pixel width override, written when a user drag-resizes a column. */
    column_size_override?: number;

    /** String columns: display format, e.g. `"link"`, `"image"`, `"bold"`. */
    format?: string;

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

    /** Cell interaction mode - see {@link EditMode}. */
    edit_mode?: EditMode;

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
    _column_paths: string[];
    _column_types: ColumnType[];
    _is_editable: boolean[];
    _edit_mode: EditMode;
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

// Column override for persisting column sizes
export type ColumnOverrides = Record<string, number | undefined>;

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

export { PerspectiveSelectDetail } from "@perspective-dev/viewer/src/ts/extensions.js";

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
