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

import Semver from "./semver";
import { Options } from "../migrate";
import {
    PerspectiveColumnConfig,
    PerspectiveColumnConfigValue,
} from "../perspective-viewer";

/**
 * Migrates from 2.7.1. Focus is on plugin API changes, moving plugin_config.columns to columns_config
 * @param old
 * @param options
 * @returns
 */
export default function migrate_2_7_1(old: any, options: Options) {
    let next_version = options.version_chain.shift();
    if (old.version?.gt(next_version!)) {
        return old;
    } else if (options.warn) {
        console.warn(`Migrating 2.7.1 -> ${next_version}`);
    }
    old.version = new Semver(next_version!);

    old.columns_config = old.columns_config ?? {};

    const has_config = !!old.plugin_config?.columns;
    const has_plugin =
        old.plugin === "Datagrid" || old.plugin === "X/Y Scatter";
    if (has_config && has_plugin) {
        if (options.warn) {
            console.warn("Migrating plugin_config to columns_config!");
        }

        old.columns_config = old.columns_config ?? {};
        let entries = Object.entries(old.plugin_config.columns);
        for (let [column_name, value_map] of entries) {
            old.columns_config[column_name] =
                old.columns_config[column_name] ?? {};

            if (old.plugin === "X/Y Scatter") {
                old.columns_config[column_name].symbols =
                    old.plugin_config.columns[column_name]?.symbols ?? {};
                delete old.plugin_config.columns[column_name];
            } else {
                const cwo =
                    old.plugin_config.columns[column_name]
                        .column_width_override;
                delete old.plugin_config.columns[column_name]
                    .column_width_override;
                for (const [key, val] of Object.entries(value_map)) {
                    switch (key) {
                        case "format":
                            if (val !== "custom") {
                                break;
                            }
                        case "timeZone":
                        case "fractionalSecondDigits":
                        case "second":
                        case "minute":
                        case "hour":
                        case "day":
                        case "weekday":
                        case "month":
                        case "year":
                        case "hour12":
                        case "dateStyle":
                        case "timeStyle": {
                            old.columns_config[column_name] =
                                old.columns_config[column_name] ?? {};
                            old.columns_config[column_name].date_format =
                                old.columns_config[column_name].date_format ??
                                {};
                            old.columns_config[column_name].date_format[key] =
                                val;
                            delete old.plugin_config.columns[column_name][key];
                            continue;
                        }
                        case "fixed": {
                            old.columns_config[column_name] =
                                old.columns_config[column_name] ?? {};

                            old.columns_config[column_name].number_format =
                                old.columns_config[column_name].number_format ??
                                {};

                            old.columns_config[
                                column_name
                            ].number_format.minimumFractionDigits = val;

                            old.columns_config[
                                column_name
                            ].number_format.maximumFractionDigits = val;

                            delete old.plugin_config.columns[column_name][key];
                            continue;
                        }
                        default: {
                        }
                    }

                    old.columns_config[column_name] =
                        old.columns_config[column_name] ?? {};
                    old.columns_config[column_name][key] = val;
                    delete old.plugin_config.columns[column_name][key];
                }

                if (!!cwo) {
                    old.plugin_config.columns[column_name] = {
                        column_width_override: cwo,
                    };
                } else {
                    delete old.plugin_config.columns[column_name];
                }
            }
        }

        if (
            old.plugin === "X/Y Scatter" &&
            Object.keys(old.plugin_config?.columns).length === 0
        ) {
            delete old.plugin_config?.columns;
        }
    }

    if (options.verbose) {
        console.log(old);
    }
    return old;
}
