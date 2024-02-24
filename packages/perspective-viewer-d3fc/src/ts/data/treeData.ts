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

import * as d3 from "d3";
import { toValue } from "../tooltip/selectionData";
import { Settings } from "../types";

export type TreeData = {
    name: string;
    children: unknown;
    size?: number;
    color?: number;
    tooltip?: unknown[];
};

export function treeData(settings: Settings) {
    const sets = {};
    const real_aggs = settings.realValues.map((x) =>
        x === null ? null : settings.mainValues.find((y) => y.name === x)
    );
    settings.data.forEach((d, j) => {
        const groups = Array.isArray(d.__ROW_PATH__)
            ? (d.__ROW_PATH__ as string[])
            : [];

        const splits = getSplitNames(d);
        splits.forEach((split) => {
            let currentLevel;
            if (!sets[split]) {
                sets[split] = [];
            }
            currentLevel = sets[split];
            groups.forEach((group, i) => {
                let element = currentLevel.find((e) => e.name === group);
                if (!element) {
                    element = { name: group, children: [] };
                    currentLevel.push(element);
                }
                if (
                    settings.realValues.length > 1 &&
                    settings.realValues[1] !== null
                ) {
                    const is_leaf = i === groups.length - 1;
                    const colorValue = is_leaf
                        ? getDataValue(d, settings.mainValues[1], split)
                        : getDataValue(
                              settings.agg_paths[j][i + 1] || d,
                              settings.mainValues[1],
                              split
                          );
                    if (colorValue !== undefined) {
                        element.color = colorValue;
                    }
                }
                if (
                    settings.realValues.length > 2 &&
                    settings.realValues[2] !== null
                ) {
                    element.tooltip = [];
                    for (let i = 2; i < settings.realValues.length; ++i) {
                        element.tooltip.push(
                            getDataValue(d, real_aggs[i], split)
                        );
                    }
                }
                if (i === groups.length - 1) {
                    element.name = groups.slice(-1)[0];
                    if (settings.crossValues.length === 0) {
                        element.size = getDataValue(
                            d,
                            settings.mainValues[0],
                            ""
                        );
                    } else if (groups.length === settings.crossValues.length) {
                        const size = getDataValue(
                            d,
                            settings.mainValues[0],
                            split
                        );
                        element.size = size > 0 ? size : 0;
                    }
                }
                currentLevel = element.children;
            });
        });
    });

    const data = Object.entries(sets).map((set) => {
        const tree: TreeData = {
            name: "root",
            children: set[1],
        };

        const root = d3.hierarchy(tree).sum((d) => d.size); // adds a `value` field to each node
        const chartData: d3.HierarchyNode<TreeData> = d3
            .partition<TreeData>()
            .size([2 * Math.PI, root.height + 1])(root);

        // "d" is a Node, but chartData is a HierarchyNode, and there is a couple of
        // fields that are missing from the Node type.
        // What is the best way to handle this? What is the actual type here??
        (chartData as any).each((d) => {
            d.current = d;
            d.mainValues =
                settings.realValues.length === 1 ||
                (settings.realValues[1] === null &&
                    settings.realValues[2] === null)
                    ? d.value
                    : [d.value, d.data.color]
                          .concat(d.data.tooltip || [])
                          .filter((x) => x !== undefined);

            d.crossValue = d
                .ancestors()
                .slice(0, -1)
                .reverse()
                .map((cross) => cross.data.name);

            d.key = set[0];
            d.label = toValue(
                settings.crossValues[d.depth - 1 < 0 ? 0 : d.depth - 1]?.type ||
                    settings.mainValues[0].type,
                d.data.name
            );
        });

        return {
            split: set[0],
            data: chartData,
            extents: getExtents(settings, set),
        };
    });

    return data;
}

export const getDataValue = (d, aggregate, split) =>
    split.length ? d[`${split}|${aggregate.name}`] : d[aggregate.name];

function getExtents(settings, [split, data]) {
    if (settings.realValues.length > 1 && settings.realValues[1] !== null) {
        const min = Math.min(
            ...settings.data.map((d) =>
                getDataValue(d, settings.mainValues[1], split)
            )
        );
        const max = Math.max(...data.map((d) => d.color));
        return [min, max];
    }
}

function getSplitNames(d) {
    const splits = [];
    Object.keys(d).forEach((key) => {
        if (key !== "__ROW_PATH__") {
            const splitValue = key.split("|").slice(0, -1).join("|");
            if (!splits.includes(splitValue)) {
                splits.push(splitValue);
            }
        }
    });
    return splits;
}
