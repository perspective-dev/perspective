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

/**
 * `PerspectiveJupyterClient` acts as a message bus between the frontend and
 * backend, passing messages from `perspective-viewer` (method calls,
 * `to_format()` calls, etc.) to the `PerspectiveManager` on the python side of
 * the plugin.
 *
 * This client implements the `Client` class as defined in
 * `@finos/perspective/api`.
 */
export class PerspectiveJupyterClient {
    /**
     * Create a new instance of the client.
     *
     * @param view {DOMWidgetView} the plugin view that can send messages to the
     * Python backend.
     */

    constructor(view) {
        // super();
        this.view = view;
    }

    /**
     * Given a message, pass it to the `PerspectiveManager` instance on the
     * ipywidget.
     *
     * The sent message conforms to the `PerspectiveJupyterMessage` interface.
     *
     * @param msg {any} the message to pass to the `PerspectiveManager`.
     */

    send(msg) {
        // Handle calls to `update` with a binary by setting `binary_length`
        // to true, so the kernel knows to handle the arraybuffer properly.
        if (
            msg.method === "update" &&
            msg.args.length === 2 &&
            msg.args[0] instanceof ArrayBuffer
        ) {
            const binary_msg = msg.args[0];
            const buffers = [binary_msg];

            // Set `binary_length` to true so the manager expects a binary
            // message.
            msg.binary_length = binary_msg.byteLength;

            // Remove the arraybuffer from the message args, so it can be
            // passed along in `buffers`.
            msg.args.shift();
            const serialized = JSON.stringify(msg);

            // Send the first update message over the Jupyter comm with
            // `binary_length` set, so the kernel knows the expect the arrow.
            this.view.send({
                id: msg.id,
                type: "cmd",
                data: serialized,
            });

            // Send the second message with buffers.
            this.view.send({}, buffers);
        } else {
            // Send the message over the Jupyter comm.
            this.view.send({
                id: msg.id,
                type: "cmd",
                data: JSON.stringify(msg),
            });
        }
    }
}
