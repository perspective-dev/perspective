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

import { labelFunction } from "../axis/axisLabel";
import { DataRowsWithKey, Settings } from "../types";
import { splitIntoMultiSeries } from "./splitIntoMultiSeries";

type MappedSeries = {
    crossValue: any;
    mainValues: any[];
    openValue: any;
    closeValue: any;
    highValue: any;
    lowValue: any;
    key: string;
    row: any;
};

interface MappedSeriesArray extends Array<MappedSeries> {
    key: string;
}

export function ohlcData(settings: Settings, data: DataRowsWithKey) {
    return splitIntoMultiSeries(settings, data, { excludeEmpty: true }).map(
        (data) => seriesToOHLC(settings, data)
    );
}

function seriesToOHLC(
    settings: Settings,
    data: DataRowsWithKey
): MappedSeriesArray {
    const labelfn = labelFunction(settings);
    const getNextOpen = (i) =>
        data[i < data.length - 1 ? i + 1 : i][settings.realValues[0]];
    const mappedSeries: any = data.map((col, i) => {
        const openValue = !!settings.realValues[0]
            ? col[settings.realValues[0]]
            : undefined;
        const closeValue = !!settings.realValues[1]
            ? col[settings.realValues[1]]
            : getNextOpen(i);

        return {
            crossValue: labelfn(col, i),
            mainValues: settings.mainValues.map((v) => col[v.name]),
            openValue: openValue,
            closeValue: closeValue,
            highValue: !!settings.realValues[2]
                ? col[settings.realValues[2]]
                : Math.max(openValue as number, closeValue as number),
            lowValue: !!settings.realValues[3]
                ? col[settings.realValues[3]]
                : Math.min(openValue as number, closeValue as number),
            key: data.key,
            row: col,
        };
    });

    mappedSeries.key = data.key;
    return mappedSeries;
}
