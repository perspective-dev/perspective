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

import mapView from "../views/map-view";
import views from "../views/views";
import css from "../../../dist/css/perspective-viewer-openlayers.css";

views.forEach(async (plugin) => {
    customElements.define(
        plugin.plugin.type,
        class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: "open" });
                const style = document.createElement("style");
                style.textContent = css;
                this.shadowRoot.appendChild(style);
                const container = document.createElement("div");
                container.setAttribute("id", "container");
                this.shadowRoot.appendChild(container);
            }

            async draw(view) {
                drawView(plugin).call(this.shadowRoot.children[1], view);
            }

            async update(view) {
                drawView(plugin).call(this.shadowRoot.children[1], view);
            }

            async resize() {
                mapView.resize(this.shadowRoot.children[1]);
            }

            get name() {
                return plugin.plugin.name;
            }

            get category() {
                return "OpenStreetMap";
            }

            restyle() {
                mapView.restyle(this.shadowRoot.children[1]);
            }

            get select_mode() {
                return "toggle";
            }

            get min_config_columns() {
                return 2;
            }

            get config_column_names() {
                return plugin.plugin.initial.names;
            }

            save() {
                return mapView.save(this.shadowRoot.children[1]);
            }

            async restore(token) {
                mapView.restore(this.shadowRoot.children[1], token);
            }

            delete() {}
        },
    );

    await customElements.whenDefined("perspective-viewer");
    customElements.get("perspective-viewer").registerPlugin(plugin.plugin.type);
});

function drawView(viewEntryPoint) {
    return async function (view) {
        const table = await this.getRootNode().host.parentElement.getTable();

        // TODO ue faster serialization method
        const [tschema, schema, data, config] = await Promise.all([
            table.schema(),
            view.schema(),
            view.to_json(),
            this.getRootNode().host.parentElement.save(),
        ]);

        config.real_columns = config.columns;
        config.columns = config.columns.filter((x) => !!x);

        // Enrich color info
        if (!!config.real_columns[2]) {
            const [min, max] = await view.get_min_max(config.real_columns[2]);
            config.color_extents = { min, max };
        }

        // Enrich size info
        if (!!config.real_columns[3]) {
            const [min, max] = await view.get_min_max(config.real_columns[3]);
            config.size_extents = { min, max };
        }

        viewEntryPoint(this, Object.assign({ schema, tschema, data }, config));
    };
}
