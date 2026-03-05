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

import { getGroupValues, getSplitValues, getDataValues } from "./selectionData";
import { PerspectiveSelectDetail } from "@perspective-dev/viewer";

const mapToFilter = (d) => [d.name, "==", d.value];

export const raiseEvent = (node, data, settings) => {
    const column_names = getDataValues(data, settings).map((d) => d.name);
    const groupFilters = getGroupValues(data, settings).map(mapToFilter);
    const splitFilters = getSplitValues(data, settings).map(mapToFilter);
    const filter = settings.filter.concat(groupFilters).concat(splitFilters);
    const detail = new PerspectiveSelectDetail(
        true,
        data === null ? null : data?.row,
        column_names,
        [],
        [{ filter }],
    );
    node.dispatchEvent(
        new CustomEvent("perspective-select", {
            bubbles: true,
            composed: true,
            detail,
        }),
    );
};

export const selectionEvent = () => {
    let settings = null;

    const _event = (selection) => {
        const node = selection.node();
        selection.on("click", (_event, data) =>
            raiseEvent(node, data, settings),
        );
    };

    _event.settings = (...args) => {
        if (!args.length) {
            return settings;
        }
        settings = args[0];
        return _event;
    };

    return _event;
};
