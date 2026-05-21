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
import { blend, make_color_record, parseColor } from "../color_utils.js";
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
    type ElemFactory,
    type EditMode,
} from "../types.js";
import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";

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

class ElemFactoryImpl implements ElemFactory {
    private _name: string;
    private _elements: HTMLElement[];
    private _index: number;

    constructor(name: string) {
        this._name = name;
        this._elements = [];
        this._index = 0;
    }

    clear(): void {
        this._index = 0;
    }

    get(): HTMLElement {
        if (!this._elements[this._index]) {
            this._elements[this._index] = document.createElement(this._name);
        }

        const elem = this._elements[this._index];
        this._index += 1;
        return elem;
    }
}

export async function createModel(
    this: DatagridPluginElement,
    regular: RegularTable,
    table: Table,
    view: View,
    theme: string,
    extend: Partial<DatagridModel> = {},
): Promise<DatagridModel> {
    const config = (await view.get_config()) as ViewConfig;
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

        const theme_changed = this.model._theme !== theme;
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
            split_by_changed ||
            group_by_changed ||
            columns_changed ||
            theme_changed ||
            type_changed;
    }

    const [table_schema, num_rows, schema, expression_schema, _edit_port] =
        await Promise.all([
            table.schema(),
            view.num_rows(),
            view.schema(),
            view.expression_schema(),
            (this.parentElement as HTMLPerspectiveViewerElement).getEditPort(),
        ]);

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

    const _schema: Schema = {
        ...(schema as Schema),
        ...(expression_schema as Schema),
    };
    const _table_schema: Schema = {
        ...(table_schema as Schema),
        ...(expression_schema as Schema),
    };

    const _column_paths: string[] = [];
    const _is_editable: boolean[] = [];
    const _column_types: ColumnType[] = [];
    let _edit_mode: EditMode = this._edit_mode || "READ_ONLY";

    if (
        _edit_mode === "SELECT_ROW_TREE" &&
        (config.group_by.length === 0 || config.group_rollup_mode === "flat")
    ) {
        _edit_mode = "READ_ONLY";
        this._edit_mode = _edit_mode;
    }

    this._edit_button!.dataset.editMode = _edit_mode;
    const model: DatagridModel = Object.assign(extend, {
        _edit_port,
        _view: view,
        _table: table,
        _table_schema,
        _config: config,
        _num_rows: num_rows,
        _schema,
        _ids: [],
        _plugin_background,
        _color,
        _pos_fg_color,
        _neg_fg_color,
        _pos_bg_color,
        _neg_bg_color,
        _column_paths,
        _column_types,
        _theme: theme,
        _is_editable,
        _edit_mode,
        _selection_state: {
            selected_areas: [],
            dirty: false,
        },
        _row_header_types: config.group_by.map((column_path) => {
            return _table_schema[column_path];
        }),
        _series_color_map: new Map<string, string>(),
        _series_color_seed: new Map<string, number>(),

        // get_psp_type,
        _div_factory: extend._div_factory || new ElemFactoryImpl("div"),
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
        },
    );

    return model;
}
