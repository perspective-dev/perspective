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

import CHARTS from "./plugin/charts";
import { HTMLPerspectiveViewerWebGLPluginElement } from "./plugin/plugin";

export type { PerspectiveClickDetail } from "./event-detail";
export { PerspectiveSelectDetail } from "./event-detail";

export function register(...plugin_names: string[]) {
    const plugins = new Set(
        plugin_names.length > 0
            ? plugin_names
            : CHARTS.map((chart) => chart.name),
    );

    CHARTS.forEach((chart) => {
        if (plugins.has(chart.name)) {
            const tagName = `perspective-viewer-charts-${chart.tag}`;

            // Each registered tag is a thin subclass that pins
            // `_chartType` so `draw()` / `save()` / etc. know which
            // `ChartTypeConfig` they're driving. The chart impl
            // class itself lives in the worker bundle — only
            // `ChartTypeConfig.tag` crosses the host/renderer
            // boundary, and the renderer constructs the impl from
            // its own `CHART_IMPLS` registry.
            customElements.define(
                tagName,
                class extends HTMLPerspectiveViewerWebGLPluginElement {
                    _chartType = chart;
                    static _chartType = chart;
                },
            );

            customElements.whenDefined("perspective-viewer").then(async () => {
                const Viewer = customElements.get("perspective-viewer") as any;
                await Viewer.registerPlugin(tagName);
            });
        }
    });
}

register();
