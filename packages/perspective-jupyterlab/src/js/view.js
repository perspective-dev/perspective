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

import { DOMWidgetView } from "@jupyter-widgets/base";
import { PerspectiveJupyterWidget } from "./widget";
import { PerspectiveJupyterClient } from "./client";

import perspective from "@finos/perspective/src/ts/perspective.ts";

function isEqual(a, b) {
    if (a === b) return true;
    if (typeof a != "object" || typeof b != "object" || a == null || b == null)
        return false;

    let keysA = Object.keys(a),
        keysB = Object.keys(b);

    if (keysA.length != keysB.length) return false;
    for (let key of keysA) {
        if (!keysB.includes(key)) return false;
        if (typeof a[key] === "function" || typeof b[key] === "function") {
            if (a[key].toString() != b[key].toString()) return false;
        } else {
            if (!isEqual(a[key], b[key])) return false;
        }
    }

    return true;
}

/**
 * `PerspectiveView` defines the plugin's DOM and how the plugin interacts with
 * the DOM.
 */
export class PerspectiveView extends DOMWidgetView {
    _createElement() {
        this.luminoWidget = new PerspectiveJupyterWidget(
            undefined,
            this,
            this.model.get("server"),
            this.model.get("client")
        );

        this.perspective_client = new PerspectiveJupyterClient(this);

        // bind synchronize to this
        this._synchronize_state = this._synchronize_state.bind(this);

        // add event handler to synchronize
        this.luminoWidget.viewer.addEventListener(
            "perspective-config-update",
            this._synchronize_state
        );

        // bind toggle_editable to this
        this._toggle_editable = this._toggle_editable.bind(this);

        // return the node against witch pWidget is bound
        return this.luminoWidget.node;
    }

    _setElement(el) {
        if (this.el || el !== this.luminoWidget.node) {
            // Do not allow the view to be reassigned to a different element.
            throw new Error("Cannot reset the DOM element.");
        }
        this.el = this.luminoWidget.node;
    }

    /**
     * When state changes on the viewer DOM, apply it to the widget state.
     *
     * @param mutations
     */

    async _synchronize_state(event) {
        if (!this.luminoWidget._load_complete) {
            return;
        }

        const config = await this.luminoWidget.viewer.save();

        for (const name of Object.keys(config)) {
            let new_value = config[name];

            const current_value = this.model.get(name);
            if (typeof new_value === "undefined") {
                continue;
            }

            if (
                new_value &&
                typeof new_value === "string" &&
                name !== "plugin" &&
                name !== "theme" &&
                name !== "title" &&
                name !== "version"
            ) {
                new_value = JSON.parse(new_value);
            }

            if (new_value === null && name === "plugin_config") {
                new_value = {};
            }

            if (!isEqual(new_value, current_value)) {
                this.model.set(name, new_value);
            }
        }

        // propagate changes back to Python
        this.touch();
    }

    /**
     * Attach event handlers to the model for state changes in order to
     * reflect them back to the DOM.
     */

    render() {
        super.render();
        this.model.on("msg:custom", this._handle_message, this);
        this.model.on("change:plugin", this.plugin_changed, this);
        this.model.on("change:columns", this.columns_changed, this);
        this.model.on("change:group_by", this.group_by_changed, this);
        this.model.on("change:split_by", this.split_by_changed, this);
        this.model.on("change:aggregates", this.aggregates_changed, this);
        this.model.on("change:sort", this.sort_changed, this);
        this.model.on("change:filter", this.filter_changed, this);
        this.model.on("change:expressions", this.expressions_changed, this);
        this.model.on("change:plugin_config", this.plugin_config_changed, this);
        this.model.on("change:theme", this.theme_changed, this);
        this.model.on("change:settings", this.settings_changed, this);
        this.model.on("change:title", this.title_changed, this);

        /**
         * Request a table from the manager. If a table has been loaded, proxy
         * it and kick off subsequent operations.
         *
         * If a table hasn't been loaded, the viewer won't get a response back
         * and simply waits until it receives a table name.
         */
        this.perspective_client.send({
            id: -2,
            cmd: "table",
        });
    }

    /**
     * Handle messages from the Python Perspective instance.
     *
     * Messages should conform to the `PerspectiveJupyterMessage` interface.
     *
     * @param msg {PerspectiveJupyterMessage}
     */

    _handle_message(msg, buffers) {
        if (this._pending_binary && buffers.length === 1) {
            // Handle binary messages from the widget, which (unlike the
            // tornado handler), does not send messages in chunks.
            const binary = buffers[0].buffer.slice(0);
            // make sure on_update callbacks are called with a `port_id`
            // AND the transferred binary.
            if (this._pending_port_id !== undefined) {
                // call handle individually to bypass typescript complaints
                // that we override `data` with different types.
                this.perspective_client._handle({
                    id: this._pending_binary,
                    data: {
                        id: this._pending_binary,
                        data: {
                            port_id: this._pending_port_id,
                            delta: binary,
                        },
                    },
                });
            } else {
                this.perspective_client._handle({
                    id: this._pending_binary,
                    data: {
                        id: this._pending_binary,
                        data: binary,
                    },
                });
            }
            this._pending_port_id = undefined;
            this._pending_binary = undefined;
            return;
        }
        if (msg.type === "table") {
            // If in client-only mode (no Table on the python widget),
            // message.data is an object containing "data" and "options".
            this._handle_load_message(msg);
        } else {
            if (msg.data["cmd"] === "delete") {
                // Regardless of client mode, if `delete()` is called we need to
                // clean up the Viewer.
                this.luminoWidget.delete();
                return;
            }
            if (this.luminoWidget.client === true) {
                // In client mode, we need to directly call the methods on the
                // viewer
                const command = msg.data["cmd"];
                if (command === "update") {
                    this.luminoWidget._update(msg.data["data"]);
                } else if (command === "replace") {
                    this.luminoWidget.replace(msg.data["data"]);
                } else if (command === "clear") {
                    this.luminoWidget.clear();
                }
            } else {
                // Make a deep copy of each message - widget views share the
                // same comm, so mutations on `msg` affect subsequent message
                // handlers.
                const message = JSON.parse(JSON.stringify(msg));
                delete message.type;
                if (typeof message.data === "string") {
                    message.data = JSON.parse(message.data);
                }
                if (message.data["binary_length"]) {
                    // If the `binary_length` flag is set, the worker expects
                    // the next message to be a transferable object. This sets
                    // the `_pending_binary` flag, which triggers a special
                    // handler for the ArrayBuffer containing binary data.
                    this._pending_binary = message.data.id;
                    // Check whether the message also contains a `port_id`,
                    // indicating that we are in an `on_update` callback and
                    // the pending binary needs to be joined with the port_id
                    // for on_update handlers to work properly.
                    if (
                        message.data.data &&
                        message.data.data.port_id !== undefined
                    ) {
                        this._pending_port_id = message.data.data.port_id;
                    }
                } else {
                    this.perspective_client._handle(message);
                }
            }
        }
    }

    get client_worker() {
        if (!this._client_worker) {
            this._client_worker = perspective.shared_worker();
        }
        return this._client_worker;
    }

    async _restore_from_model() {
        await this.luminoWidget.restore({
            plugin: this.model.get("plugin"),
            columns: this.model.get("columns"),
            group_by: this.model.get("group_by"),
            split_by: this.model.get("split_by"),
            aggregates: this.model.get("aggregates"),
            sort: this.model.get("sort"),
            filter: this.model.get("filter"),
            expressions: this.model.get("expressions"),
            plugin_config: this.model.get("plugin_config"),
            theme: this.model.get("theme"),
            settings: this.model.get("settings"),
            title: this.model.get("title"),
            version: this.model.get("version"),
        });
    }

    /**
     * Given a message that commands the widget to load a dataset or table,
     * process it.
     *
     * @param {PerspectiveJupyterMessage} msg
     */

    _handle_load_message(msg) {
        const table_options = msg.data["options"] || {};
        if (this.luminoWidget.client) {
            /**
             * In client mode, retrieve the serialized data and the options
             * passed by the user, and create a new table on the client end.
             */
            const data = msg.data["data"];
            const client_table = this.client_worker.table(data, table_options);
            this.luminoWidget.load(client_table);
            this._restore_from_model();
        } else {
            if (this.luminoWidget.server && msg.data["table_name"]) {
                /**
                 * Get a remote table handle, and load the remote table in
                 * the client for server mode Perspective.
                 */
                const table = this.perspective_client.open_table(
                    msg.data["table_name"]
                );
                this.luminoWidget.load(table);
                this._restore_from_model();
            } else if (msg.data["table_name"]) {
                // Get a remote table handle from the Jupyter kernel, and mirror
                // the table on the client, setting up editing if necessary.
                this.perspective_client
                    .open_table(msg.data["table_name"])
                    .then(async (kernel_table) => {
                        // setup kernel table and view
                        this._kernel_table = kernel_table;
                        this._kernel_view = await kernel_table.view();

                        const arrow = await this._kernel_view.to_arrow();

                        // Create a client side table
                        let client_table = this.client_worker.table(
                            arrow,
                            table_options
                        );

                        this.luminoWidget.load(client_table);
                        await this._restore_from_model();

                        // Need to await the table and get the instance
                        // separately as load() only takes a promise
                        // to a table and not the instance itself.
                        const client_table_loaded = await client_table;

                        // setup local view
                        this._client_view = await client_table_loaded.view();

                        // handle editing
                        await this._toggle_editable();
                    });
            } else {
                throw new Error(
                    `PerspectiveWidget cannot load data from kernel message: ${JSON.stringify(
                        msg
                    )}`
                );
            }

            // Only call `init` after the viewer has a table.
            this.perspective_client.send({
                id: -1,
                cmd: "init",
            });
        }
    }

    async _toggle_editable() {
        // Need to await the table and get the instance
        // separately as load() only takes a promise
        // to a table and not the instance itself.
        const table = await this.luminoWidget.getTable();

        // Setup ports in advance
        if (!this._client_edit_port) {
            this._client_edit_port = await this.luminoWidget.getEditPort();
        }
        if (!this._kernel_edit_port) {
            this._kernel_edit_port = await this._kernel_table.make_port();
        }

        const { plugin_config } = await this.luminoWidget.viewer.save();
        if (plugin_config?.editable) {
            // TODO only evaluated during initial load.
            // Toggling from python after initial load won't
            // cause edits to propagate

            // Allow edits from the client Perspective to
            // feed back to the kernel.

            // When the client updates, if the update
            // comes through the edit port then forward
            // it to the server.
            this._client_view_update_callback = (updated) => {
                if (updated.port_id === this._client_edit_port) {
                    this._kernel_table.update(updated.delta, {
                        port_id: this._kernel_edit_port,
                    });
                }
            };

            // If the server updates, and the edit is
            // not coming from the server edit port,
            // then synchronize state with the client.
            this._kernel_view_update_callback = (updated) => {
                if (updated.port_id !== this._kernel_edit_port) {
                    table.update(updated.delta); // any port, we dont care
                }
            };
        } else {
            // ignore
            this._client_view_update_callback = () => {};

            // Load the table and mirror updates from the
            // kernel.
            this._kernel_view_update_callback = (updated) =>
                table.update(updated.delta);
        }

        this._client_view.on_update(
            (updated) => this._client_view_update_callback(updated),
            { mode: "row" }
        );

        this._kernel_view.on_update(
            (updated) => this._kernel_view_update_callback(updated),
            { mode: "row" }
        );
    }

    /**
     * When the View is removed after the widget terminates, clean up the
     * client viewer and Web Worker.
     */

    remove() {
        // Delete the <perspective-viewer> but do not terminate the shared
        // worker as it is shared across other widgets.
        this.luminoWidget.delete();
        this.luminoWidget.viewer.removeEventListener(
            "perspective-config-update",
            this._synchronize_state
        );
    }

    /**
     * When traitlets are updated in python, update the corresponding value on
     * the front-end viewer. `client` and `server` are not included, as they
     * are not properties in `<perspective-viewer>`.
     */

    plugin_changed() {
        this.luminoWidget.restore({
            plugin: this.model.get("plugin"),
        });
    }

    columns_changed() {
        this.luminoWidget.restore({
            columns: this.model.get("columns"),
        });
    }

    group_by_changed() {
        this.luminoWidget.restore({
            group_by: this.model.get("group_by"),
        });
    }

    split_by_changed() {
        this.luminoWidget.restore({
            split_by: this.model.get("split_by"),
        });
    }

    aggregates_changed() {
        this.luminoWidget.restore({
            aggregates: this.model.get("aggregates"),
        });
    }

    sort_changed() {
        this.luminoWidget.restore({
            sort: this.model.get("sort"),
        });
    }

    filter_changed() {
        this.luminoWidget.restore({
            filter: this.model.get("filter"),
        });
    }

    expressions_changed() {
        this.luminoWidget.restore({
            expressions: this.model.get("expressions"),
        });
    }

    plugin_config_changed() {
        this.luminoWidget.restore({
            plugin_config: this.model.get("plugin_config"),
        });
        this._toggle_editable();
    }

    theme_changed() {
        this.luminoWidget.restore({
            theme: this.model.get("theme"),
        });
    }

    settings_changed() {
        this.luminoWidget.restore({
            settings: this.model.get("settings"),
        });
    }

    title_changed() {
        this.luminoWidget.restore({
            title: this.model.get("title"),
        });
    }

    version_changed() {
        this.luminoWidget.restore({
            version: this.model.get("version"),
        });
    }
}
