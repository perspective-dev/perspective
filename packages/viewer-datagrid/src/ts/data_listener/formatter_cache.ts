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

const LEGACY_CONFIG: Record<
    string,
    { format: Intl.NumberFormatOptions | Intl.DateTimeFormatOptions }
> = {
    float: {
        format: {
            style: "decimal",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        },
    },
    datetime: {
        format: {
            dateStyle: "short",
            timeStyle: "medium",
        } as Intl.DateTimeFormatOptions,
    },
    date: {
        format: {
            dateStyle: "short",
        } as Intl.DateTimeFormatOptions,
    },
};

export class FormatterCache {
    private _formatters: Map<string, Formatter | false>;

    constructor() {
        this._formatters = new Map();
    }

    private create_datetime_formatter(
        _type: ColumnType,
        plugin: PluginConfig,
    ): Intl.DateTimeFormat {
        if (plugin.date_format?.format !== "custom") {
            const options: Intl.DateTimeFormatOptions = {
                timeZone: plugin.date_format?.timeZone,
                dateStyle:
                    plugin.date_format?.dateStyle === "disabled"
                        ? undefined
                        : (plugin.date_format?.dateStyle ?? "short"),
                timeStyle:
                    plugin.date_format?.timeStyle === "disabled"
                        ? undefined
                        : (plugin.date_format?.timeStyle ?? "medium"),
            };

            return new Intl.DateTimeFormat(
                navigator.languages as string[],
                options,
            );
        } else {
            const options: Intl.DateTimeFormatOptions = {
                timeZone: plugin.date_format?.timeZone,
                hour12: plugin.date_format?.hour12 ?? true,
                fractionalSecondDigits:
                    plugin.date_format?.fractionalSecondDigits,
            };

            if (plugin.date_format?.year !== "disabled") {
                options.year = plugin.date_format?.year ?? "2-digit";
            }

            if (plugin.date_format?.month !== "disabled") {
                options.month = plugin.date_format?.month ?? "numeric";
            }

            if (plugin.date_format?.day !== "disabled") {
                options.day = plugin.date_format?.day ?? "numeric";
            }

            if (
                plugin.date_format?.weekday &&
                plugin.date_format?.weekday !== "disabled"
            ) {
                options.weekday = plugin.date_format.weekday;
            }

            if (plugin.date_format?.hour !== "disabled") {
                options.hour = plugin.date_format?.hour ?? "numeric";
            }

            if (plugin.date_format?.minute !== "disabled") {
                options.minute = plugin.date_format?.minute ?? "numeric";
            }

            if (plugin.date_format?.second !== "disabled") {
                options.second = plugin.date_format?.second ?? "numeric";
            }

            return new Intl.DateTimeFormat(
                navigator.languages as string[],
                options,
            );
        }
    }

    private create_date_formatter(
        _type: ColumnType,
        plugin: PluginConfig,
    ): Intl.DateTimeFormat {
        const options: Intl.DateTimeFormatOptions = {
            timeZone: "utc",
            dateStyle:
                plugin.date_format?.dateStyle === "disabled"
                    ? undefined
                    : (plugin.date_format?.dateStyle ?? "short"),
        };

        return new Intl.DateTimeFormat(
            navigator.languages as string[],
            options,
        );
    }

    private create_number_formatter(
        type: ColumnType,
        plugin: PluginConfig,
    ): Intl.NumberFormat {
        const format =
            plugin.number_format ??
            (LEGACY_CONFIG[type]?.format as Intl.NumberFormatOptions);
        return new Intl.NumberFormat(navigator.languages as string[], format);
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
