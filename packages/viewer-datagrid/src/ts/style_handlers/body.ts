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

import { RegularTableElement } from "regular-table";

import {
    type DatagridModel,
    type ColumnsConfig,
    type ColumnConfig,
    type Align,
    get_psp_type,
} from "../types.js";
import type { ColumnType } from "@perspective-dev/client";
import {
    css_font_family,
    measure_px,
    wrap_lines,
} from "../plugin/plugin_config_schema.js";

import { cell_style_numeric } from "./table_cell/numeric.js";
import { cell_style_string } from "./table_cell/string.js";
import { cell_style_datetime } from "./table_cell/datetime.js";
import { cell_style_boolean } from "./table_cell/boolean.js";
import { cell_style_row_header } from "./table_cell/row_header.js";
import { is_type_text_editable } from "../event_handlers/edit_focus.js";
import {
    sync_column_alignment,
    type ColumnAlignment,
} from "./column_alignment.js";
import { CollectedCell } from "./types.js";

const B_VALUE_NULL = 1;
const B_USER_NULL = 2;
const B_HIDDEN = 4;
const B_POS = 8;
const B_NEG = 16;
const B_SEL_EXACT = 32;
const B_SEL_SUB = 64;

interface ColState {
    plugin: ColumnConfig | undefined;
    type: ColumnType | undefined;
    is_numeric: boolean;
    is_rollup_col: boolean;
    n_split_levels: number | undefined;
    column_name: string | undefined;
    mods: number;
    value_styled: boolean;
    text_editable: boolean;
    boolean_editable: boolean;

    /** The column's own font as inline CSS values, `undefined` following the grid. */
    font_family: string | undefined;
    font_size: string | undefined;
    wrap_lines: string | undefined;

    /** Explicit `bold` / `italic` as CSS values, `undefined` following the grid. */
    font_weight: string | undefined;
    font_style: string | undefined;
    align: Align | undefined;
}

const HEADER_ALIGNMENT: ColumnAlignment = { text: "left", vertical: "middle" };

function resolve_alignment(
    align: Align | undefined,
    is_numeric: boolean,
): ColumnAlignment {
    if (align === undefined) {
        return { text: is_numeric ? "right" : "left", vertical: "middle" };
    }

    return {
        text: align.endsWith("left")
            ? "left"
            : align.endsWith("right")
              ? "right"
              : "center",
        vertical: align.startsWith("top")
            ? "top"
            : align.startsWith("bottom")
              ? "bottom"
              : "middle",
    };
}

interface StyleMemo {
    plugin: ColumnConfig | undefined;
    type: string | undefined;
    mods: number;
    theme: unknown;
    bits: number;
    value: unknown;
}

function row_header_depth(row_header: unknown[] | undefined): number {
    if (!row_header) {
        return 0;
    }

    let n = 0;
    for (let i = 0; i < row_header.length; i++) {
        if (row_header[i] !== undefined) {
            n++;
        }
    }

    return n;
}

/**
 * Apply styles to all body cells in a single pass.
 */
export function applyBodyCellStyles(
    model: DatagridModel,
    cells: CollectedCell[],
    plugins: ColumnsConfig,
    isSettingsOpen: boolean,
    isSelectable: boolean,
    isEditable: boolean,
    regularTable: RegularTableElement,
): void {
    const selectedId = isSelectable ? model._tree_selection_id : undefined;

    regularTable.classList.toggle(
        "flat-group-rollup-mode",
        model._config.group_rollup_mode === "flat",
    );

    const is_rollup_mode = model._config.group_rollup_mode === "rollup";
    const n_split_by = model._config.split_by.length;
    const group_by_len = model._config.group_by.length;
    const theme = model._pos_bg_color;
    const menu_col =
        model._config.columns.length > 1
            ? model._column_settings_selected_column
            : undefined;
    const col_states: Map<number, ColState> = new Map();
    let row_height: number | undefined;
    const col_state = (
        key: number,
        meta_x: number | undefined,
        column_name: string | undefined,
        type: ColumnType | undefined,
    ): ColState => {
        let state = col_states.get(key);
        if (state) {
            return state;
        }

        const plugin = column_name
            ? plugins[column_name.toString()]
            : undefined;

        const n_split_levels =
            meta_x === undefined
                ? undefined
                : model._column_paths[meta_x]?.split("|").length - 1;

        const is_rollup_col =
            n_split_by > 0 &&
            n_split_levels !== undefined &&
            n_split_levels < n_split_by;

        const is_numeric = type === "integer" || type === "float";
        const value_styled =
            (is_numeric &&
                (plugin?.number_bg_mode === "gradient" ||
                    plugin?.number_bg_mode === "pulse" ||
                    plugin?.number_fg_mode === "bar" ||
                    plugin?.number_fg_mode === "label-bar")) ||
            (type === "string" &&
                (plugin?.string_fg_mode === "series" ||
                    plugin?.string_bg_mode === "series" ||
                    plugin?.link === true));

        const editable_col = isEditable && !!model._is_editable[meta_x ?? -1];
        const font_size =
            typeof plugin?.font_size === "number" && plugin.font_size > 0
                ? plugin.font_size
                : undefined;

        if (font_size !== undefined) {
            row_height ??=
                model._row_height ??
                measure_px(regularTable, "--psp-datagrid--row--height", 23);
        }

        state = {
            plugin,
            type,
            is_numeric,
            is_rollup_col,
            n_split_levels,
            column_name: column_name?.toString(),
            mods:
                (isSettingsOpen ? 1 : 0) |
                (isSelectable ? 2 : 0) |
                (editable_col ? 4 : 0) |
                (is_rollup_col ? 8 : 0) |
                (n_split_levels === 0 ? 16 : 0) |
                (column_name === menu_col ? 32 : 0) |
                (menu_col ? 64 : 0) |
                (is_rollup_mode ? 128 : 0) |
                (plugin?.number_fg_mode === "bar" ? 256 : 0) |
                (plugin?.number_fg_mode === "label-bar" ? 512 : 0),
            value_styled,
            text_editable:
                editable_col && is_type_text_editable(type, plugin?.link),
            boolean_editable: editable_col && type === "boolean",
            font_family:
                plugin?.font_family !== undefined &&
                plugin.font_family !== "inherit"
                    ? css_font_family(plugin.font_family)
                    : undefined,
            font_size: font_size !== undefined ? `${font_size}px` : undefined,
            font_weight:
                plugin?.bold === undefined
                    ? undefined
                    : plugin.bold
                      ? "bold"
                      : "normal",
            font_style:
                plugin?.italic === undefined
                    ? undefined
                    : plugin.italic
                      ? "italic"
                      : "normal",
            wrap_lines:
                font_size !== undefined
                    ? String(wrap_lines(row_height!, font_size))
                    : undefined,
            align: plugin?.align,
        };

        col_states.set(key, state);
        return state;
    };

    const alignments: Map<number, ColumnAlignment> = new Map();

    for (const { element: td, metadata, isHeader } of cells) {
        const column_name =
            metadata.column_header?.[n_split_by]?.toString?.() ??
            (metadata.column_header?.[n_split_by] as string | undefined);

        const meta_x = (metadata as { x?: number }).x;
        const type = get_psp_type(model, metadata);
        const key =
            meta_x ??
            -1 - ((metadata as { row_header_x?: number }).row_header_x ?? 0);
        const c = col_state(key, meta_x, column_name, type);

        const size_key = (metadata as { size_key?: number }).size_key;
        if (size_key !== undefined && !alignments.has(size_key)) {
            alignments.set(
                size_key,
                isHeader
                    ? HEADER_ALIGNMENT
                    : resolve_alignment(c.align ?? model._align, c.is_numeric),
            );
        }

        const hidden =
            is_rollup_mode &&
            ((d: number) =>
                d === 0
                    ? false
                    : d - 1 <
                      Math.min(group_by_len, c.plugin?.aggregate_depth || 0))(
                row_header_depth(metadata.row_header as unknown[] | undefined),
            );

        // @ts-ignore
        metadata._is_hidden_by_aggregate_depth = hidden;

        let bits =
            (metadata.value === null ? B_VALUE_NULL : 0) |
            (metadata.user === null ? B_USER_NULL : 0) |
            (hidden ? B_HIDDEN : 0);

        if (c.is_numeric || c.type === "boolean") {
            const user = metadata.user as number | boolean | null | undefined;
            bits |=
                (user === true || (user as number) > 0 ? B_POS : 0) |
                (user === false || (user as number) < 0 ? B_NEG : 0);
        }

        let isExact = false,
            isSub = false;
        if (isSelectable && selectedId) {
            const id = model._ids[(metadata.y ?? 0) - (metadata.y0 ?? 0)];
            let key_match = true;
            for (let i = 0; i < selectedId.length; i++) {
                if (selectedId[i] !== id[i]) {
                    key_match = false;
                    break;
                }
            }

            isExact = id.length === selectedId.length && key_match;
            isSub = id.length !== selectedId.length && key_match;
            bits |= (isExact ? B_SEL_EXACT : 0) | (isSub ? B_SEL_SUB : 0);
        }

        if (!isHeader) {
            // @ts-ignore
            const memo: StyleMemo | undefined = metadata.__psp_style_memo;
            if (
                memo !== undefined &&
                memo.plugin === c.plugin &&
                memo.type === c.type &&
                memo.mods === c.mods &&
                memo.theme === theme &&
                memo.bits === bits &&
                (!c.value_styled || memo.value === metadata.user)
            ) {
                continue;
            }

            if (memo !== undefined) {
                memo.plugin = c.plugin;
                memo.type = c.type;
                memo.mods = c.mods;
                memo.theme = theme;
                memo.bits = bits;
                memo.value = c.value_styled ? metadata.user : undefined;
            } else {
                // @ts-ignore
                metadata.__psp_style_memo = {
                    plugin: c.plugin,
                    type: c.type,
                    mods: c.mods,
                    theme,
                    bits,
                    value: c.value_styled ? metadata.user : undefined,
                } satisfies StyleMemo;
            }
        }

        td.classList.toggle(
            "psp-split-total",
            c.is_rollup_col && c.n_split_levels === 0,
        );

        td.classList.toggle(
            "psp-split-subtotal",
            c.is_rollup_col && c.n_split_levels! > 0,
        );

        // Apply type-specific cell styling
        if (c.is_numeric) {
            cell_style_numeric(
                model,
                c.plugin as any,
                c.type,
                td,
                metadata as any,
                isSettingsOpen,
            );
        } else if (c.type === "boolean") {
            cell_style_boolean(model, c.plugin, td, metadata as any);
        } else if (c.type === "string") {
            cell_style_string(model, c.plugin as any, td, metadata as any);
        } else if (c.type === "date" || c.type === "datetime") {
            cell_style_datetime(model, c.plugin as any, td, metadata);
        } else {
            td.style.backgroundColor = "";
            td.style.color = "";
        }

        // Apply common cell classes
        td.classList.toggle(
            "psp-bool-type",
            c.type === "boolean" && metadata.user !== null,
        );

        td.classList.toggle("psp-null", metadata.value === null);
        td.classList.toggle(
            "psp-menu-open",
            !!menu_col && column_name === menu_col,
        );

        td.classList.toggle(
            "psp-color-mode-bar",
            c.plugin?.number_fg_mode === "bar" && c.is_numeric,
        );

        td.classList.toggle(
            "psp-color-mode-label-bar",
            c.plugin?.number_fg_mode === "label-bar" && c.is_numeric,
        );

        // Apply row header styling
        if (isHeader) {
            cell_style_row_header(model, regularTable, td, metadata as any);
        }

        // Apply tree selection styling (SELECT_ROW_TREE).
        // psp-select-region-inactive is exclusively a tree-selection class,
        // so always clean it up. psp-select-region is shared with the
        // coordinate-based selection modes, so only touch it when in
        // SELECT_ROW_TREE mode (isSelectable).
        td.classList.toggle("psp-select-region-inactive", false);
        if (isSelectable) {
            if (!selectedId) {
                td.classList.toggle("psp-select-region", false);
            } else if (
                isHeader &&
                metadata.type === "row_header" &&
                metadata.row_header_x !== undefined &&
                metadata.row_header_x <
                    model._ids[(metadata.y ?? 0) - (metadata.y0 ?? 0)].length
            ) {
                td.classList.toggle("psp-select-region", false);
            } else {
                td.classList.toggle("psp-select-region", isExact);
                td.classList.toggle("psp-select-region-inactive", isSub);
            }
        }

        if (!isHeader && metadata.type === "body") {
            td.style.fontFamily = c.font_family ?? "";
            td.style.fontSize = c.font_size ?? "";
            td.style.fontWeight = c.font_weight ?? "";
            td.style.fontStyle = c.font_style ?? "";
            if (c.wrap_lines !== undefined) {
                td.style.setProperty(
                    "--psp-datagrid--wrap-lines",
                    c.wrap_lines,
                );
            } else {
                td.style.removeProperty("--psp-datagrid--wrap-lines");
            }

            td.classList.toggle("psp-editable", c.text_editable);
            if (c.text_editable) {
                td.setAttribute("tabindex", "-1");
            } else if (td.hasAttribute("tabindex")) {
                td.removeAttribute("tabindex");
            }

            td.classList.toggle(
                "boolean-editable",
                c.boolean_editable &&
                    (metadata as { user?: unknown }).user !== null,
            );
        }
    }

    sync_column_alignment(regularTable, alignments);
}
