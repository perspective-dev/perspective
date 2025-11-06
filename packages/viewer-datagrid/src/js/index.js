// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the Apache License 2.0.                                                ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import "regular-table";
import { HTMLPerspectiveViewerDatagridPluginElement } from "./custom_elements/datagrid.js";
import { HTMLPerspectiveViewerDatagridToolbarElement } from "./custom_elements/toolbar.js";

/******************************************************************************
 * JP Morgan Virtual Internship — Task 5
 * Author: Niyaz Khan
 *
 * This section was added as part of the JP Morgan Software Engineering
 * Virtual Internship (Task 5) to verify successful local setup and contribution.
 ******************************************************************************/

console.log("✅ Perspective Viewer successfully loaded by Niyaz Khan — JP Morgan Virtual Internship Task 5");

/******************************************************************************
 * Main
 ******************************************************************************/

async function _register_element() {
    // Register datagrid toolbar
    customElements.define(
        "perspective-viewer-datagrid-toolbar",
        HTMLPerspectiveViewerDatagridToolbarElement
    );

    // Register datagrid main plugin
    customElements.define(
        "perspective-viewer-datagrid",
        HTMLPerspectiveViewerDatagridPluginElement
    );

    // Wait until main viewer is ready, then attach this plugin
    await customElements.whenDefined("perspective-viewer");

    // Register plugin with Perspective Viewer
    customElements
        .get("perspective-viewer")
        .registerPlugin("perspective-viewer-datagrid");

    // Confirmation log after plugin registration
    console.log("🎯 Perspective Datagrid Plugin Registered Successfully — JP Morgan Task 5");
}

// Initialize plugin registration
_register_element();
