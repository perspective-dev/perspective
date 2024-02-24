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

const FORMATTER_CONS = {
    datetime: Intl.DateTimeFormat,
    date: Intl.DateTimeFormat,
    integer: Intl.NumberFormat,
    float: Intl.NumberFormat,
    boolean: class {
        format(val) {
            return val ? "true" : "false";
        }
    },
};

export class FormatterCache {
    constructor() {
        this._formatters = new Map();
    }

    create_datetime_formatter(type, plugin) {
        const type_config = {
            dateStyle: "short",
            timeStyle: "medium",
        };
        if (type === "datetime") {
            if (plugin.date_format?.format !== "custom") {
                const options = {
                    ...type_config,
                    timeZone: plugin.date_format?.timeZone,
                    dateStyle: plugin.date_format?.dateStyle,
                    timeStyle: plugin.date_format?.timeStyle,
                };
                if (options.dateStyle === "disabled") {
                    options.dateStyle = undefined;
                } else if (options.dateStyle === undefined) {
                    options.dateStyle = "short";
                }

                if (options.timeStyle === "disabled") {
                    options.timeStyle = undefined;
                } else if (options.timeStyle === undefined) {
                    options.timeStyle = "medium";
                }

                return new Intl.DateTimeFormat(navigator.languages, options);
            } else {
                const options = {
                    // ...type_config.format,
                    timeZone: plugin.date_format?.timeZone,
                    second: plugin.date_format?.second,
                    minute: plugin.date_format?.minute,
                    hour: plugin.date_format?.hour,
                    day: plugin.date_format?.day,
                    weekday: plugin.date_format?.weekday,
                    month: plugin.date_format?.month,
                    year: plugin.date_format?.year,
                    hour12: plugin.date_format?.hour12,
                    fractionalSecondDigits:
                        plugin.date_format?.fractionalSecondDigits,
                };

                if (options.year === "disabled") {
                    options.year = undefined;
                } else if (options.year === undefined) {
                    options.year = "2-digit";
                }

                if (options.month === "disabled") {
                    options.month = undefined;
                } else if (options.month === undefined) {
                    options.month = "numeric";
                }

                if (options.day === "disabled") {
                    options.day = undefined;
                } else if (options.day === undefined) {
                    options.day = "numeric";
                }

                if (options.weekday === "disabled") {
                    options.weekday = undefined;
                }

                if (options.hour === "disabled") {
                    options.hour = undefined;
                } else if (options.hour === undefined) {
                    options.hour = "numeric";
                }

                if (options.minute === "disabled") {
                    options.minute = undefined;
                } else if (options.minute === undefined) {
                    options.minute = "numeric";
                }

                if (options.second === "disabled") {
                    options.second = undefined;
                } else if (options.second === undefined) {
                    options.second = "numeric";
                }

                if (options.hour12 === undefined) {
                    options.hour12 = true;
                }

                return new Intl.DateTimeFormat(navigator.languages, options);
            }
        } else {
            const options = {
                ...type_config.format,
                dateStyle: plugin.date_format?.dateStyle,
            };

            if (options.dateStyle === "disabled") {
                options.dateStyle = undefined;
            } else if (options.dateStyle === undefined) {
                options.dateStyle = "short";
            }

            return new Intl.DateTimeFormat(navigator.languages, options);
        }
    }

    create_number_formatter(type, plugin) {
        const format = {
            style: "decimal",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        };

        if (plugin.number_format !== undefined) {
            format = plugin.number_format;
        }

        return new FORMATTER_CONS[type](navigator.languages, format);
    }

    create_boolean_formatter(type, plugin) {
        return new FORMATTER_CONS[type](navigator.languages, {});
    }

    get(type, plugin) {
        let formatter_key = [
            type,
            ...Object.values(plugin.date_format ?? {}),
            ...Object.values(plugin.number_format ?? {}),
        ].join("-");

        if (!this._formatters.has(formatter_key)) {
            if (type === "date" || type === "datetime") {
                this._formatters.set(
                    formatter_key,
                    this.create_datetime_formatter(type, plugin)
                );
            } else if (type === "integer" || type === "float") {
                this._formatters.set(
                    formatter_key,
                    this.create_number_formatter(type, plugin)
                );
            } else if (type === "boolean") {
                this._formatters.set(
                    formatter_key,
                    this.create_boolean_formatter(type, plugin)
                );
            } else {
                this._formatters.set(formatter_key, false);
            }
        }

        return this._formatters.get(formatter_key);
    }
}
