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
import { RegularTableElement } from "regular-table";
import { CellMetadata, DataResponse } from "regular-table/dist/esm/types";

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
export type EditMode =
    | "READ_ONLY"
    | "EDIT"
    | "SELECT_COLUMN"
    | "SELECT_ROW"
    | "SELECT_REGION";

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

// Column configuration values from viewer
export interface ColumnConfig {
    color?: string;
    pos_fg_color?: string;
    neg_fg_color?: string;
    pos_bg_color?: string;
    neg_bg_color?: string;
    fg_gradient?: number;
    bg_gradient?: number;
    number_fg_mode?: string;
    number_bg_mode?: string;
    string_color_mode?: string;
    datetime_color_mode?: string;
    fixed?: number;
    aggregate_depth?: number;
    column_size_override?: number;
    format?: string;
    date_format?: DateFormatConfig;
    number_format?: NumberFormatConfig;
}

// Date format configuration for column styling
export interface DateFormatConfig {
    format?: "custom" | string;
    timeZone?: string;
    dateStyle?: "short" | "medium" | "long" | "full" | "disabled";
    timeStyle?: "short" | "medium" | "long" | "full" | "disabled";
    second?: "numeric" | "2-digit" | "disabled";
    minute?: "numeric" | "2-digit" | "disabled";
    hour?: "numeric" | "2-digit" | "disabled";
    day?: "numeric" | "2-digit" | "disabled";
    weekday?: "narrow" | "short" | "long" | "disabled";
    month?: "numeric" | "2-digit" | "narrow" | "short" | "long" | "disabled";
    year?: "numeric" | "2-digit" | "disabled";
    hour12?: boolean;
    fractionalSecondDigits?: 1 | 2 | 3;
}

// Number format configuration for column styling
export interface NumberFormatConfig {
    style?: "decimal" | "currency" | "percent" | "unit";
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    minimumIntegerDigits?: number;
    minimumSignificantDigits?: number;
    maximumSignificantDigits?: number;
    currency?: string;
    currencyDisplay?: "code" | "symbol" | "narrowSymbol" | "name";
    notation?: "standard" | "scientific" | "engineering" | "compact";
    compactDisplay?: "short" | "long";
    useGrouping?: boolean;
}

export type ColumnsConfig = Record<string, ColumnConfig>;

// Plugin save state
export interface DatagridPluginConfig {
    columns?: ColumnsConfig;
    editable?: boolean;
    scroll_lock?: boolean;
    edit_mode?: EditMode;
    column_size_override?: Record<string, number>;
}

// Element factory for reusing DOM elements
export interface ElemFactory {
    clear(): void;
    get(): HTMLElement;
}

export type Schema = Record<string, ColumnType>;

// Model object stored on regular-table
export interface DatagridModel {
    _edit_port: number;
    _view: View;
    _table: Table;
    _table_schema: Schema;
    _config: ViewConfig;
    _num_rows: number;
    _num_columns?: number;
    _schema: Schema;
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
    _selection_state: SelectionState;
    _row_header_types: ColumnType[];
    _series_color_map: Map<string, Map<string, number>>;
    _series_color_seed: Map<string, number>;
    _div_factory: ElemFactory;
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

// Perspective viewer element interface (subset)
export interface PerspectiveViewerElement extends HTMLElement {
    getView(): Promise<View>;
    getTable(): Promise<Table>;
    getEditPort(): Promise<number>;
    restore(config: Partial<ViewConfig>): Promise<void>;
    toggleColumnSettings(columnName?: string): Promise<void>;
    hasAttribute(name: string): boolean;
    setSelection(viewport?: ViewWindow): void;
    dispatchEvent(event: Event): boolean;
    children: HTMLCollectionOf<HTMLElement>;
}

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
}

export { PerspectiveSelectDetail } from "@perspective-dev/viewer";

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

// Map types for selected rows and positions
export type SelectedRowsMap = WeakMap<RegularTableElement, Set<number>>;
export type SelectedPositionMap = WeakMap<
    RegularTableElement,
    SelectedPosition
>;
