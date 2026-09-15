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

import {
    EDIT_MODES,
    toggle_edit_mode,
    toggle_scroll_lock,
} from "../model/toolbar.js";
import { PRIVATE_PLUGIN_SYMBOL } from "../model/index.js";
import {
    css_font_family,
    measure_px,
    parse_align,
    wrap_lines,
} from "./plugin_config_schema.js";
import {
    make_color_record,
    parseCssColorList,
    parseCssGradientStops,
    rgbToHex,
    type GradientStopRgb,
} from "../color_utils.js";
import type {
    ColumnConfig,
    ColorRecord,
    ColumnsConfig,
    DatagridPluginElement,
    EditMode,
    ResolvedColumnStyle,
    ResolvedColumnsConfig,
} from "../types.js";

interface RestoreToken {
    edit_mode?: EditMode;
    scroll_lock?: boolean;
    column_menus?: unknown;
    font_family?: unknown;
    font_size?: unknown;
    word_wrap?: unknown;
    bold?: unknown;
    italic?: unknown;
    align?: unknown;
    row_height?: unknown;
    zebra_rows?: unknown;
    zebra_color?: unknown;
}

export function positive_px(raw: unknown): number | undefined {
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0
        ? raw
        : undefined;
}

/** A stable key over the per-column font settings in `columns`. */
function column_font_state(columns: ColumnsConfig): string {
    let key = "";
    for (const [name, config] of Object.entries(columns)) {
        const size = positive_px(config.font_size);
        if (config.font_family !== undefined || size !== undefined) {
            key += `${name} ${config.font_family ?? ""} ${size ?? ""}`;
        }
    }

    return key;
}

/**
 * Publish `--psp-datagrid--wrap-lines`, the number of lines that fit in a
 * row at the grid's font size and row height.
 */
export function sync_wrap_lines(this: DatagridPluginElement): void {
    const row_height =
        this._row_height ?? measure_px(this, "--psp-datagrid--row--height", 23);

    const font_size = this._font_size ?? measure_px(this, "font-size", 12);
    this.regular_table.style.setProperty(
        "--psp-datagrid--wrap-lines",
        String(wrap_lines(row_height, font_size)),
    );
}

/**
 * Set or clear a font property on the grid as `!important`, so it beats a
 * host page's `::part(regular-table)` rule.
 */
function set_grid_font(
    grid: HTMLElement,
    name: string,
    value: string | undefined,
): void {
    if (value) {
        grid.style.setProperty(name, value, "important");
    } else {
        grid.style.removeProperty(name);
    }
}

/**
 * Record the text/row options from `token` on the element and the
 * `regular-table`, returning `true` when the pinned row height must be
 * re-measured.
 */
function restore_grid_style(
    this: DatagridPluginElement,
    token: RestoreToken,
    columns: ColumnsConfig,
): boolean {
    const font_before = [this._font_family, this._font_size];
    const row_height_before = this._row_height;
    const column_font_before = column_font_state(this._columns_config);
    const column_font = column_font_state(columns);

    this._font_family =
        typeof token.font_family === "string" && token.font_family !== "inherit"
            ? token.font_family
            : undefined;

    this._font_size = positive_px(token.font_size);
    this._word_wrap = token.word_wrap === true;
    this._column_menus = token.column_menus !== false;
    this._bold = token.bold === true;
    this._italic = token.italic === true;
    this._align = parse_align(token.align);

    this._row_height = positive_px(token.row_height);
    this._zebra_rows = Math.max(
        0,
        Math.floor(positive_px(token.zebra_rows) ?? 0),
    );

    this._zebra_color =
        this._zebra_rows >= 1 && typeof token.zebra_color === "string"
            ? token.zebra_color
            : undefined;

    const grid = this.regular_table;
    set_grid_font(
        grid,
        "font-family",
        this._font_family ? css_font_family(this._font_family) : undefined,
    );

    set_grid_font(
        grid,
        "font-size",
        this._font_size ? `${this._font_size}px` : undefined,
    );

    set_grid_font(grid, "font-weight", this._bold ? "bold" : undefined);
    set_grid_font(grid, "font-style", this._italic ? "italic" : undefined);
    if (this._row_height) {
        grid.style.setProperty(
            "--psp-datagrid--row--height",
            `${this._row_height}px`,
        );
    } else {
        grid.style.removeProperty("--psp-datagrid--row--height");
    }

    if (this._zebra_color) {
        grid.style.setProperty(
            "--psp-datagrid--zebra--color",
            this._zebra_color,
        );
    } else {
        grid.style.removeProperty("--psp-datagrid--zebra--color");
    }

    if (this.model) {
        this.model._row_height = this._row_height;
        this.model._word_wrap = this._word_wrap;
        this.model._column_menus = this._column_menus;
        this.model._align = this._align;
    }

    sync_wrap_lines.call(this);
    const font_changed =
        font_before[0] !== this._font_family ||
        font_before[1] !== this._font_size ||
        column_font_before !== column_font;

    return (
        (row_height_before !== undefined && this._row_height === undefined) ||
        (font_changed && this._row_height === undefined)
    );
}

/**
 * Every parsed form of one `fg_color` / `bg_color` string. Column types
 * are unknown here (`restore()` may run before the model exists), so each
 * reader runs and the style handlers pick the form their mode needs.
 */
interface ParsedColor {
    color?: ColorRecord;
    stops?: GradientStopRgb[];
    palette?: string[];
}

function parse_color_value(raw: unknown): ParsedColor {
    if (typeof raw !== "string") {
        return {};
    }

    const stops = parseCssGradientStops(raw) ?? undefined;
    const palette = parseCssColorList(raw)?.map(rgbToHex) ?? undefined;
    return {
        color: is_single_color(raw) ? make_color_record(raw) : undefined,
        stops,
        palette,
    };
}

/** A bare CSS color, as opposed to a `linear-gradient(…)` list. */
function is_single_color(raw: string): boolean {
    return !raw.trim().toLowerCase().startsWith("linear-gradient(");
}

function end_records(
    stops: GradientStopRgb[] | undefined,
): [neg: ColorRecord | undefined, pos: ColorRecord | undefined] {
    if (!stops) {
        return [undefined, undefined];
    }

    return [
        make_color_record(rgbToHex(stops[0].rgb)),
        make_color_record(rgbToHex(stops[stops.length - 1].rgb)),
    ];
}

/** `config` with its color strings parsed into every form a handler reads. */
function resolve_column_style(config: ColumnConfig): ResolvedColumnStyle {
    const { fg_color, bg_color, ...rest } = config;
    const fg = parse_color_value(fg_color);
    const bg = parse_color_value(bg_color);
    const [neg_fg_color, pos_fg_color] = end_records(fg.stops);
    const [neg_bg_color, pos_bg_color] = end_records(bg.stops);
    return {
        ...rest,
        fg_color: fg.color,
        bg_color: bg.color,
        fg_stops: fg.stops,
        bg_stops: bg.stops,
        pos_fg_color,
        neg_fg_color,
        pos_bg_color,
        neg_bg_color,
        fg_palette: fg.palette,
        bg_palette: bg.palette,
    };
}

export function restore(
    this: DatagridPluginElement,
    token: RestoreToken,
    columns: ColumnsConfig,
): void {
    token = JSON.parse(JSON.stringify(token));
    columns = JSON.parse(JSON.stringify(columns));
    const row_height_reset = restore_grid_style.call(this, token, columns);
    this._column_overrides.clear();
    for (const [col, value] of Object.entries(columns)) {
        const px = value.column_size_override;
        if (px !== undefined) {
            if (typeof px === "number" && Number.isFinite(px) && px > 0) {
                this._column_overrides.set(col, px);
            }

            delete value.column_size_override;
        }
    }

    this._columns_config = structuredClone(columns);
    const styles: ResolvedColumnsConfig = {};
    for (const [col_name, controls] of Object.entries(columns)) {
        styles[col_name] = resolve_column_style(controls);
    }

    // `echo = false`: this `restore()` IS the host delivering the config —
    // echoing it back via `restore` queued a second render run
    // (draw-then-update on every initial load carrying a `plugin_config`).
    if ("edit_mode" in token) {
        if (EDIT_MODES.indexOf(token.edit_mode!) !== -1) {
            toggle_edit_mode.call(this, token.edit_mode, false);
        } else {
            console.error("Unknown edit mode " + token.edit_mode);
        }
    } else {
        toggle_edit_mode.call(this, "READ_ONLY", false);
    }

    if ("scroll_lock" in token) {
        toggle_scroll_lock.call(this, token.scroll_lock);
    } else {
        toggle_scroll_lock.call(this, false);
    }

    if (row_height_reset) {
        this.regular_table.resetAutoSize({
            auto: false,
            indices: false,
            override: false,
            row_height: true,
        });
    }

    (this.regular_table as any)[PRIVATE_PLUGIN_SYMBOL] = styles;
}
