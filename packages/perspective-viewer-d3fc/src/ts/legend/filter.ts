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

import { groupFromKey } from "../series/seriesKey";
import { DataRowsWithKey, Settings } from "../types";

export function filterData(
    settings: Settings,
    data: any[] | undefined = undefined
) {
    const useData = data || settings.data;
    const len = settings.hideKeys?.length ?? 0;
    return len > 0
        ? useData.map((col) => {
              const clone = { ...col };
              settings.hideKeys.forEach((k) => {
                  delete clone[k];
              });
              return clone;
          })
        : useData;
}

export function filterDataByGroup(settings: Settings): DataRowsWithKey {
    const newData = settings.data;
    const hideKeysLen = settings.hideKeys?.length ?? 0;
    const splitValsLen = settings.splitValues.length;
    return hideKeysLen > 0
        ? splitValsLen === 0
            ? newData.filter((row) => {
                  return Object.values(row).reduce(
                      (res, val) => res && !settings.hideKeys.includes(val),
                      true
                  );
              })
            : newData.map((row) => {
                  const entries = Object.entries(row).filter(
                      ([key, _val]) =>
                          !settings.hideKeys.includes(groupFromKey(key))
                  );
                  return Object.fromEntries(entries);
              })
        : newData;
}
