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

import chroma from "chroma-js";
import { createDataListener } from "../data_listener";
import { blend, make_color_record } from "../color_utils.js";

function get_rule(regular, tag, def) {
    let color = window.getComputedStyle(regular).getPropertyValue(tag).trim();
    if (color.length > 0) {
        return color;
    } else {
        return def;
    }
}

class ElemFactory {
    constructor(name) {
        this._name = name;
        this._elements = [];
        this._index = 0;
    }

    clear() {
        this._index = 0;
    }

    get() {
        if (!this._elements[this._index]) {
            this._elements[this._index] = document.createElement(this._name);
        }
        const elem = this._elements[this._index];
        this._index += 1;
        return elem;
    }
}

function get_psp_type(metadata) {
    if (metadata.x >= 0) {
        return this._column_types[metadata.x];
    } else {
        return this._row_header_types[metadata.row_header_x - 1];
    }
}

export async function createModel(regular, table, view, extend = {}) {
    const config = await view.get_config();

    // Extract the entire expression string as typed by the user, so we can
    // feed it into `validate_expressions` and get back the data types for
    // each column without it being affected by a pivot.
    const expressions = Array.isArray(config.expressions)
        ? Object.fromEntries(
              config.expressions.map((expr) => [expr[0], expr[1]])
          )
        : config.expressions;

    const [
        table_schema,
        validated_expressions,
        num_rows,
        schema,
        expression_schema,
        column_paths,
        _edit_port,
    ] = await Promise.all([
        table.schema(),
        table.validate_expressions(expressions),
        view.num_rows(),
        view.schema(),
        view.expression_schema(),
        view.column_paths(),
        this.parentElement.getEditPort(),
    ]);

    const _plugin_background = chroma(
        get_rule(regular, "--plugin--background", "#FFFFFF")
    ).rgb();

    const _pos_fg_color = make_color_record(
        get_rule(regular, "--rt-pos-cell--color", "#338DCD")
    );

    const _neg_fg_color = make_color_record(
        get_rule(regular, "--rt-neg-cell--color", "#FF5942")
    );

    const _pos_bg_color = make_color_record(
        blend(_pos_fg_color[0], _plugin_background)
    );

    const _neg_bg_color = make_color_record(
        blend(_neg_fg_color[0], _plugin_background)
    );

    const _color = make_color_record(
        get_rule(regular, "--active--color", "#ff0000")
    );

    const _schema = { ...schema, ...expression_schema };
    const _table_schema = {
        ...table_schema,
        ...validated_expressions.expression_schema,
    };

    const _column_paths = column_paths.filter((path) => {
        return path !== "__ROW_PATH__" && path !== "__ID__";
    });

    const _is_editable = [];
    const _column_types = [];
    for (const column_path of _column_paths) {
        const column_path_parts = column_path.split("|");
        const column = column_path_parts[config.split_by.length];
        _column_types.push(_schema[column]);
        _is_editable.push(!!table_schema[column]);
    }

    const model = Object.assign(extend, {
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
        _is_editable,
        _row_header_types: config.group_by.map((column_path) => {
            return _table_schema[column_path];
        }),
        _series_color_map: new Map(),
        _series_color_seed: new Map(),
        get_psp_type,
    });

    // Re-use div factory
    model._div_factory = model._div_factory || new ElemFactory("div");
    regular.setDataListener(
        createDataListener(this.parentElement).bind(model, regular),
        {
            virtual_mode:
                window
                    .getComputedStyle(regular)
                    .getPropertyValue("--datagrid-virtual-mode")
                    ?.trim() || "both",
        }
    );

    return model;
}
