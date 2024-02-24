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

import { Settings } from "../types";

export function toValue(type, value) {
    switch (type) {
        case "date":
        case "datetime":
            return value instanceof Date
                ? value
                : new Date(parseInt(value)).toLocaleString([], {
                      dateStyle: "short",
                      timeStyle: "medium",
                  });
        case "integer":
            return parseInt(value, 10);
        case "float":
            return parseFloat(value);
    }
    return value;
}

export function getGroupValues(data, settings) {
    if (settings.crossValues.length === 0) return [];
    if (data.crossValue.length === 0) return [];
    const groupValues = (data.crossValue.split
        ? data.crossValue.split("|")
        : Array.isArray(data.crossValue)
        ? data.crossValue
        : [data.crossValue]) || [data.key];
    return groupValues.map((cross, i) => ({
        name: settings.crossValues[i].name,
        value: toValue(settings.crossValues[i].type, cross),
    }));
}

export function getSplitValues(data, settings: Settings) {
    if (settings.splitValues.length === 0) return [];
    let splitValues = [data.mainValue];

    if (data.key) {
        splitValues = data.key.split("|");
    } else if (data.mainValue?.split) {
        splitValues = data.mainValue.split("|");
    }

    return settings.splitValues.map((split, i) => ({
        name: split.name,
        value: toValue(split.type, splitValues[i]),
    }));
}

export function getDataValues(data, settings) {
    if (settings.mainValues.length > 1) {
        if (data.mainValues) {
            return settings.mainValues.map((main, i) => ({
                name: main.name,
                value: toValue(main.type, data.mainValues[i]),
            }));
        }
        return settings.mainValues.map((main) => ({
            name: main.name,
            value: toValue(main.type, data.row[main.name]),
        }));
    }
    return [
        {
            name: settings.mainValues[0].name,
            value: toValue(
                settings.mainValues[0].type,
                data.colorValue ||
                    data.mainValue - data.baseValue ||
                    data.mainValue ||
                    data.mainValues
            ),
        },
    ];
}
