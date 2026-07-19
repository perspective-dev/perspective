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

import "regular-table";
import { HTMLPerspectiveViewerDatagridPluginElement } from "./custom_elements/datagrid.js";
import { HTMLPerspectiveViewerDatagridToolbarElement } from "./custom_elements/toolbar.js";

/******************************************************************************
 *
 * Main
 *
 */

interface PerspectiveViewerConstructor {
    registerPlugin(tagName: string): void;
}

async function _register_element(): Promise<void> {
    if (customElements.get("perspective-viewer-datagrid")) {
        console.warn(
            'Custom element "perspective-viewer-datagrid" is already registered; skipping duplicate registration (Perspective was loaded more than once on this page).',
        );
        return;
    }

    customElements.define(
        "perspective-viewer-datagrid-toolbar",
        HTMLPerspectiveViewerDatagridToolbarElement,
    );

    customElements.define(
        "perspective-viewer-datagrid",
        HTMLPerspectiveViewerDatagridPluginElement,
    );

    await customElements.whenDefined("perspective-viewer");
    const PerspectiveViewer = customElements.get(
        "perspective-viewer",
    ) as unknown as PerspectiveViewerConstructor;
    PerspectiveViewer.registerPlugin("perspective-viewer-datagrid");
}

_register_element();

export { PRIVATE_PLUGIN_SYMBOL } from "./types.js";
export { HTMLPerspectiveViewerDatagridPluginElement };
export { HTMLPerspectiveViewerDatagridToolbarElement };
