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

import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";
import TOOLBAR_STYLE from "../../../dist/css/perspective-viewer-datagrid-toolbar.css";
import { toggle_edit_mode, toggle_scroll_lock } from "../model/toolbar.js";
import type { DatagridPluginElement } from "../types.js";

const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(TOOLBAR_STYLE);

/**
 * The custom element for this plugin's toolbar, a component which displays in
 * the host `<perspective-viewer>`'s status bar when this plugin is active.
 * In the case of Datagrid, this comprises "Editable" and "Scroll Lock" toggle
 * buttons.
 */
export class HTMLPerspectiveViewerDatagridToolbarElement extends HTMLElement {
    private _initialized: boolean = false;

    connectedCallback(): void {
        if (this._initialized) {
            return;
        }

        this._initialized = true;
        const panel = this.previousElementSibling?.getAttribute("slot");
        this.setAttribute(
            "slot",
            panel ? `statusbar-extra-${panel}` : "statusbar-extra",
        );
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.adoptedStyleSheets.push(stylesheet);
        this.shadowRoot!.innerHTML = `
            <div id="toolbar">
                <span class="hover-target">
                    <span id="scroll_lock" class="button">
                        <span></span>
                    </span>
                </span>
                <span class="hover-target">
                    <span id="edit_mode" class="button" data-edit-mode="READ_ONLY">
                        <span></span>
                    </span>
                </span>
            </div>
        `;

        const viewer = this.parentElement as HTMLPerspectiveViewerElement;
        const prev = this.previousElementSibling;
        const plugin = (
            prev?.tagName === "PERSPECTIVE-VIEWER-DATAGRID"
                ? prev
                : viewer.getPlugin("Datagrid")
        ) as DatagridPluginElement;

        plugin._scroll_lock = this.shadowRoot!.querySelector(
            "#scroll_lock",
        ) as HTMLElement;

        plugin._scroll_lock.addEventListener("click", () =>
            toggle_scroll_lock.call(plugin),
        );

        plugin._edit_button = this.shadowRoot!.querySelector(
            "#edit_mode",
        ) as HTMLElement;

        plugin._edit_button.dataset.editMode = plugin._edit_mode ?? "READ_ONLY";
        plugin._edit_button.addEventListener("click", () => {
            toggle_edit_mode.call(plugin);
            plugin.regular_table.draw();
            viewer.dispatchEvent(new Event("perspective-config-update"));
        });
    }
}
