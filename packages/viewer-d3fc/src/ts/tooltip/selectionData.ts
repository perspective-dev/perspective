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

function createDateFormatter(type: string, columnConfig?: any) {
    const dateFormat = columnConfig?.date_format;
    
    if (type === "date") {
        const options: Intl.DateTimeFormatOptions = {
            timeZone: "UTC",
            dateStyle: dateFormat?.dateStyle === "disabled" ? undefined : (dateFormat?.dateStyle ?? "short"),
        };
        return new Intl.DateTimeFormat(navigator.languages as string[], options);
    }
    
    // datetime
    if (dateFormat?.format === "custom") {
        const options: Intl.DateTimeFormatOptions = {
            timeZone: dateFormat?.timeZone,
            second: dateFormat?.second === "disabled" ? undefined : dateFormat?.second,
            minute: dateFormat?.minute === "disabled" ? undefined : dateFormat?.minute,
            hour: dateFormat?.hour === "disabled" ? undefined : dateFormat?.hour,
            day: dateFormat?.day === "disabled" ? undefined : dateFormat?.day,
            weekday: dateFormat?.weekday === "disabled" ? undefined : dateFormat?.weekday,
            month: dateFormat?.month === "disabled" ? undefined : dateFormat?.month,
            year: dateFormat?.year === "disabled" ? undefined : dateFormat?.year,
            hour12: dateFormat?.hour12,
            fractionalSecondDigits: dateFormat?.fractionalSecondDigits,
        };
        return new Intl.DateTimeFormat(navigator.languages as string[], options);
    }
    
    const options: Intl.DateTimeFormatOptions = {
        timeZone: dateFormat?.timeZone,
        dateStyle: dateFormat?.dateStyle === "disabled" ? undefined : (dateFormat?.dateStyle ?? "short"),
        timeStyle: dateFormat?.timeStyle === "disabled" ? undefined : (dateFormat?.timeStyle ?? "medium"),
    };
    return new Intl.DateTimeFormat(navigator.languages as string[], options);
}

export function toValue(type: string, value: any, columnConfig?: any) {
    switch (type) {
        case "date":
        case "datetime": {
            const date = value instanceof Date ? value : new Date(parseInt(value));
            const formatter = createDateFormatter(type, columnConfig);
            return formatter.format(date);
        }
        case "integer":
            return parseInt(value, 10);
        case "float":
            return parseFloat(value);
    }
    return value;
}

export function getGroupValues(data, settings: Settings) {
    if (settings.crossValues.length === 0) return [];
    if (data.crossValue.length === 0) return [];
    const groupValues = (data.crossValue.split
        ? data.crossValue.split("|")
        : Array.isArray(data.crossValue)
          ? data.crossValue
          : [data.crossValue]) || [data.key];
    return groupValues.map((cross, i) => {
        const columnName = settings.crossValues[i].name;
        const columnConfig = settings.columns_config?.[columnName];
        return {
            name: columnName,
            value: toValue(settings.crossValues[i].type, cross, columnConfig),
        };
    });
}

export function getSplitValues(data, settings: Settings) {
    if (settings.splitValues.length === 0) return [];
    let splitValues = [data.mainValue];

    if (data.key) {
        splitValues = data.key.split("|");
    } else if (data.mainValue?.split) {
        splitValues = data.mainValue.split("|");
    }

    return settings.splitValues.map((split, i) => {
        const columnConfig = settings.columns_config?.[split.name];
        return {
            name: split.name,
            value: toValue(split.type, splitValues[i], columnConfig),
        };
    });
}

export function getDataValues(data, settings: Settings) {
    if (settings.mainValues.length > 1) {
        if (data.mainValues) {
            return settings.mainValues.map((main, i) => {
                const columnConfig = settings.columns_config?.[main.name];
                return {
                    name: main.name,
                    value: toValue(main.type, data.mainValues[i], columnConfig),
                };
            });
        }
        return settings.mainValues.map((main) => {
            const columnConfig = settings.columns_config?.[main.name];
            return {
                name: main.name,
                value: toValue(
                    main.type,
                    data.row[getDataRowKey(data.key, main, settings.realValues)],
                    columnConfig,
                ),
            };
        });
    }
    const mainValue = settings.mainValues[0];
    const columnConfig = settings.columns_config?.[mainValue.name];
    return [
        {
            name: mainValue.name,
            value: toValue(
                mainValue.type,
                data.colorValue ||
                    data.mainValue - data.baseValue ||
                    data.mainValue ||
                    data.mainValues,
                columnConfig,
            ),
        },
    ];
}

function getDataRowKey(key, main, realValues) {
    if (!key) {
        return main.name;
    }

    if (key.includes("|")) {
        const splitKey = key.split("|");
        const keyIncludesValidValueName =
            splitKey[splitKey.length - 1] === main.name;

        if (keyIncludesValidValueName) {
            return key;
        }

        const keyIncludesInvalidValueName = realValues.includes(
            splitKey[splitKey.length - 1],
        );

        const validKeyPrefix = keyIncludesInvalidValueName
            ? splitKey.slice(0, splitKey.length - 1).join("|")
            : key;

        return `${validKeyPrefix}|${main.name}`;
    }

    const keyIsRealValue = realValues.includes(key);

    return keyIsRealValue ? main.name : `${key}|${main.name}`;
}
