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

import type { ColumnType } from "@perspective-dev/client";
import {
    createDateFormatter,
    createDatetimeFormatter,
    createNumberFormatter,
} from "@perspective-dev/viewer/src/ts/column-format.js";
import type { ColumnConfig } from "../types.js";

export interface Formatter {
    format(val: unknown): string;
}

class BooleanFormatter implements Formatter {
    format(val: unknown): string {
        return val ? "true" : "false";
    }
}

// PluginConfig is a subset of ColumnConfig with the formatting properties
type PluginConfig = Pick<ColumnConfig, "date_format" | "number_format">;

export class FormatterCache {
    private _formatters: Map<string, Formatter | false>;

    constructor() {
        this._formatters = new Map();
    }

    private create_datetime_formatter(
        _type: ColumnType,
        plugin: PluginConfig,
    ): Intl.DateTimeFormat {
        return createDatetimeFormatter(plugin.date_format);
    }

    private create_date_formatter(
        _type: ColumnType,
        plugin: PluginConfig,
    ): Intl.DateTimeFormat {
        return createDateFormatter(plugin.date_format);
    }

    private create_number_formatter(
        type: ColumnType,
        plugin: PluginConfig,
    ): Intl.NumberFormat {
        return createNumberFormatter(type, plugin.number_format);
    }

    private create_boolean_formatter(
        _type: ColumnType,
        _plugin: PluginConfig,
    ): Formatter {
        return new BooleanFormatter();
    }

    get(type: ColumnType, plugin: PluginConfig): Formatter | false | undefined {
        const formatter_key = [
            type,
            ...Object.values(plugin.date_format ?? {}),
            ...Object.values(plugin.number_format ?? {}),
        ].join("-");

        if (!this._formatters.has(formatter_key)) {
            if (type === "date") {
                this._formatters.set(
                    formatter_key,
                    this.create_date_formatter(type, plugin),
                );
            } else if (type === "datetime") {
                this._formatters.set(
                    formatter_key,
                    this.create_datetime_formatter(type, plugin),
                );
            } else if (type === "integer" || type === "float") {
                this._formatters.set(
                    formatter_key,
                    this.create_number_formatter(type, plugin),
                );
            } else if (type === "boolean") {
                this._formatters.set(
                    formatter_key,
                    this.create_boolean_formatter(type, plugin),
                );
            } else {
                this._formatters.set(formatter_key, false);
            }
        }

        return this._formatters.get(formatter_key);
    }
}
