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

    const already_registered: string[] = [];

    CHARTS.forEach((chart) => {
        if (plugins.has(chart.name)) {
            const tagName = `perspective-viewer-charts-${chart.tag}`;

            if (customElements.get(tagName)) {
                already_registered.push(tagName);
                return;
            }

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

    if (already_registered.length > 0) {
        console.warn(
            `viewer-charts plugins already registered (${already_registered.length}); skipping duplicate registration (Perspective was loaded more than once on this page).`,
        );
    }
}

register();
