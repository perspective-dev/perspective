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

import { createDataListener } from "../data_listener/index.js";
import {
    blend,
    make_color_record,
    parseColor,
    rgbToHex,
    type RGB,
} from "../color_utils.js";
import type {
    ColumnType,
    Table,
    View,
    ViewConfig,
} from "@perspective-dev/client";
import {
    type DatagridModel,
    type DatagridPluginElement,
    type RegularTable,
    type Schema,
    type EditMode,
} from "../types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

// Mirror of the engine's window-aggregate result types (the
// `GetFeaturesResp.window_aggregates` table in `server.cpp`): these
// aggregates yield a fixed type, everything else - `min`, `max`, `lag`,
// `lead` - preserves the source column's type. Window columns appear in no
// schema the client can query when they are not visible (the `View`'s
// `schema()` covers visible columns only, and `table.schema()` /
// `expression_schema()` are pre-window), so a `group_by` on a window column
// needs this to format and style its row headers.
const WINDOW_FLOAT_AGGREGATES = new Set([
    "sum",
    "avg",
    "stddev",
    "var",
    "diff",
    "rate",
    "ema",
]);

function window_output_type(
    aggregate: string,
    source_column: string,
    table_schema: Schema,
): ColumnType {
    if (aggregate === "count") {
        return "integer";
    }

    if (WINDOW_FLOAT_AGGREGATES.has(aggregate)) {
        return "float";
    }

    return table_schema[source_column] ?? "string";
}

function arraysChanged<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) {
        return true;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return true;
        }
    }

    return false;
}

function nestedArraysChanged<T>(a: T[][], b: T[][]): boolean {
    if (a.length !== b.length) {
        return true;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i].length !== b[i].length) {
            return true;
        }

        for (let j = 0; j < a[i].length; j++) {
            if (a[i][j] !== b[i][j]) {
                return true;
            }
        }
    }

    return false;
}

function get_rule(regular: HTMLElement, tag: string, def: string): string {
    const color = window.getComputedStyle(regular).getPropertyValue(tag).trim();
    if (color.length > 0) {
        return color;
    } else {
        return def;
    }
}

export type ThemeStyle = Pick<
    DatagridModel,
    | "_theme"
    | "_plugin_background"
    | "_color"
    | "_pos_fg_color"
    | "_neg_fg_color"
    | "_pos_bg_color"
    | "_neg_bg_color"
    | "_default_bg_color_stops"
    | "_series_palette"
>;

function read_series_palette(regular: HTMLElement, accent: string): string[] {
    const walk = (prefix: string): string[] => {
        const out: string[] = [];
        for (let i = 1; ; i++) {
            const raw = get_rule(regular, `${prefix}${i}--color`, "");
            if (!raw) {
                break;
            }

            out.push(rgbToHex(parseColor(raw)));
        }

        return out;
    };

    const own = walk("--psp-datagrid--series-");
    if (own.length > 0) {
        return own;
    }

    const charts = walk("--psp-charts--series-");
    return charts.length > 0 ? charts : [rgbToHex(parseColor(accent))];
}

/**
 * Read the theme-derived style values off `regular`'s computed style, the
 * single source for the color/theme fields cached on `DatagridModel`.
 */
export function readThemeStyle(regular: HTMLElement): ThemeStyle {
    const _theme = get_rule(regular, "--psp-theme-name", "");
    const _plugin_background = parseColor(
        get_rule(regular, "--psp--background-color", "#FFFFFF"),
    );

    const _pos_fg_color = make_color_record(
        get_rule(regular, "--psp-datagrid--pos-cell--color", "#338DCD"),
    );

    const _neg_fg_color = make_color_record(
        get_rule(regular, "--psp-datagrid--neg-cell--color", "#FF5942"),
    );

    const _pos_bg_color = make_color_record(
        blend(_pos_fg_color[0], _plugin_background),
    );

    const _neg_bg_color = make_color_record(
        blend(_neg_fg_color[0], _plugin_background),
    );

    const _color = make_color_record(
        get_rule(regular, "--psp-active--color", "#ff0000"),
    );

    const _series_palette = read_series_palette(regular, _color[0]);

    const _default_bg_color_stops = [
        {
            rgb: [_neg_bg_color[1], _neg_bg_color[2], _neg_bg_color[3]] as RGB,
            offset: 0,
        },
        { rgb: _plugin_background as RGB, offset: 0.5 },
        {
            rgb: [_pos_bg_color[1], _pos_bg_color[2], _pos_bg_color[3]] as RGB,
            offset: 1,
        },
    ];

    return {
        _theme,
        _plugin_background,
        _color,
        _pos_fg_color,
        _neg_fg_color,
        _pos_bg_color,
        _neg_bg_color,
        _default_bg_color_stops,
        _series_palette,
    };
}

export async function createModel(
    this: DatagridPluginElement,
    regular: RegularTable,
    table: Table,
    view: View,
    extend: Partial<DatagridModel> = {},
): Promise<DatagridModel> {
    const config = (await view.get_config()) as ViewConfig;
    const style = readThemeStyle(regular);
    if (this?.model?._config) {
        const old = this.model._config;
        const group_by_changed = arraysChanged(old.group_by, config.group_by);
        const type_changed =
            (old.group_by.length === 0 || config.group_by.length === 0) &&
            group_by_changed;

        const split_by_changed = arraysChanged(old.split_by, config.split_by);
        const columns_changed = arraysChanged(old.columns, config.columns);
        const filter_changed = nestedArraysChanged(
            old.filter as unknown[][],
            config.filter as unknown[][],
        );

        const sort_changed = nestedArraysChanged(
            old.sort as unknown[][],
            config.sort as unknown[][],
        );

        const group_rollup_mode_changed =
            old.group_rollup_mode !== config.group_rollup_mode;

        const split_rollup_mode_changed =
            old.split_rollup_mode !== config.split_rollup_mode;

        const theme_changed = this.model._theme !== style._theme;
        this._reset_scroll_top = group_by_changed;
        this._reset_scroll_left = split_by_changed;
        this._reset_select =
            group_by_changed ||
            split_by_changed ||
            filter_changed ||
            sort_changed ||
            columns_changed;

        this._reset_column_size =
            group_rollup_mode_changed ||
            split_rollup_mode_changed ||
            split_by_changed ||
            group_by_changed ||
            columns_changed ||
            theme_changed ||
            type_changed;
    }

    const _panel = this.getAttribute("slot") ?? undefined;
    const [table_schema, num_rows, schema, expression_schema, _edit_port] =
        await Promise.all([
            table.schema(),
            view.num_rows(),
            view.schema(),
            view.expression_schema(),
            (this.parentElement as HTMLPerspectiveViewerElement).getEditPort({
                panel: _panel,
            }),
        ]);

    const _schema: Schema = {
        ...(schema as Schema),
        ...(expression_schema as Schema),
    };
    const _table_schema: Schema = {
        ...(table_schema as Schema),
        ...(expression_schema as Schema),
    };

    const _window_schema: Schema = Object.fromEntries(
        Object.entries(config.windows ?? {}).map(([name, spec]) => [
            name,
            window_output_type(spec!.aggregate, spec!.column, _table_schema),
        ]),
    );

    const _column_paths: string[] = [];
    const _is_editable: boolean[] = [];
    const _column_types: ColumnType[] = [];
    let _edit_mode: EditMode = this._edit_mode || "READ_ONLY";

    if (_edit_mode === "SELECT_ROW_TREE" && config.group_by.length === 0) {
        _edit_mode = "READ_ONLY";
        this._edit_mode = _edit_mode;
    } else if (
        _edit_mode === "SELECT_ROW_TREE" &&
        config.group_rollup_mode === "flat"
    ) {
        _edit_mode = "SELECT_ROW";
        this._edit_mode = _edit_mode;
    }

    if (this._edit_button !== undefined) {
        this._edit_button.dataset.editMode = _edit_mode;
    }

    const model: DatagridModel = Object.assign(extend, {
        _panel,
        _edit_port,
        _view: view,
        _table: table,
        _table_schema,
        _config: config,
        _num_rows: num_rows,
        _schema,
        _window_schema,
        _ids: [],
        ...style,
        _column_paths,
        _column_types,
        _is_editable,
        _edit_mode,
        _selection_state: {
            selected_areas: [],
            dirty: false,
        },
        _row_header_types: config.group_by.map((column_path) => {
            return _table_schema[column_path] ?? _window_schema[column_path];
        }),
        _series_color_map: new Map<string, string>(),
        _series_color_seed: new Map<string, number>(),
    }) as DatagridModel;

    regular.setDataListener(
        createDataListener(
            this.parentElement as HTMLPerspectiveViewerElement,
        ).bind(model, regular) as any,
        {
            virtual_mode: (window
                .getComputedStyle(regular)
                .getPropertyValue("--datagrid-virtual-mode")
                ?.trim() || "both") as
                | "both"
                | "horizontal"
                | "vertical"
                | "none",
            column_classes: true,
        },
    );

    return model;
}
