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

import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";

import server_wasm from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import client_wasm from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";

const ready = Promise.all([
    perspective_viewer.init_client(client_wasm),
    perspective.init_server(server_wasm),
]);

export { ready };

export async function worker() {
    await ready;
    return await perspective.worker();
}

const PERSISTENT_ATTRIBUTES = [
    "plugin",
    "columns",
    "columns_config",
    "group_by",
    "split_by",
    "group_rollup_mode",
    "aggregates",
    "sort",
    "filter",
    "expressions",
    "plugin_config",
    "settings",
    "theme",
    "title",
    "version",
];

// Traits whose `save()` value is a bare string (not JSON) — the sync loop must
// not `JSON.parse` them.
const STRING_ATTRIBUTES = new Set([
    "plugin",
    "theme",
    "title",
    "version",
    "group_rollup_mode",
]);

function isEqual(a, b) {
    if (a === b) return true;
    if (typeof a != "object" || typeof b != "object" || a == null || b == null)
        return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length != keysB.length) return false;
    for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (typeof a[key] === "function" || typeof b[key] === "function") {
            if (a[key].toString() != b[key].toString()) return false;
        } else {
            if (!isEqual(a[key], b[key])) return false;
        }
    }
    return true;
}

async function get_psp_wasm_module() {
    let elem = customElements.get("perspective-viewer");
    if (!elem) {
        await customElements.whenDefined("perspective-viewer");
        elem = customElements.get("perspective-viewer");
    }
    return elem.__wasm_module__;
}

async function render({ model, el }) {
    await ready;

    el.classList.add("PSPContainer");
    const viewer = document.createElement("perspective-viewer");
    viewer.classList.add("PSPViewer");
    viewer.setAttribute("type", "application/psp+json");
    viewer.addEventListener(
        "contextmenu",
        (event) => event.stopPropagation(),
        false,
    );
    el.appendChild(viewer);

    const client_id = `${Math.random()}`;
    const wasm_module = await get_psp_wasm_module();
    const psp_client = new wasm_module.Client(
        async (binary_msg) => {
            const buffer = binary_msg.slice().buffer;
            model.send({ type: "binary_msg", client_id }, null, [buffer]);
        },
        () => {
            model.send({ type: "hangup", client_id }, null);
        },
    );

    const on_custom_msg = (msg, buffers) => {
        if (msg.type === "binary_msg" && msg.client_id === client_id) {
            const [dataview] = buffers;
            psp_client.handle_response(dataview.buffer);
        }
    };
    model.on("msg:custom", on_custom_msg);
    model.send({ type: "connect", client_id }, null);

    const binding_mode = model.get("binding_mode");
    const table_name = model.get("table_name");
    if (!table_name) {
        throw new Error("table_name not set in model");
    }

    const table_promise = psp_client.open_table(table_name).then(async (t) => {
        if (binding_mode === "client-server") {
            const local_client = await perspective.worker();
            const remote_view = await t.view();
            return await local_client.table(remote_view);
        } else if (binding_mode === "server") {
            return t;
        } else {
            throw new Error(`unknown binding mode: ${binding_mode}`);
        }
    });

    // The viewer's `load()` also accepts a `Client` (with `table` naming the
    // binding in `ViewerConfig`) since the workspace->viewer merge, but the
    // single-table widget loads a `Table` directly and treats `table_name` as
    // the source of truth. The config's derived `table` field therefore has no
    // widget trait and is excluded from the config sync below. Revisit if the
    // widget ever grows multi-table (master/detail, global filter) support.
    await viewer.load(table_promise);
    await viewer.restore(
        Object.fromEntries(PERSISTENT_ATTRIBUTES.map((k) => [k, model.get(k)])),
    );

    // Bidirectional config sync as a single serialized reconciler. The viewer
    // (`perspective-config-update`) and the model (`change:`) each request a
    // reconcile in a fixed direction, and tasks run one at a time on
    // `reconcile` so a `restore()` never overlaps a `save()` read (no stale
    // mid-restore reads) and never re-enters.
    const normalize_config = (raw) => {
        const config = {};
        for (const name of PERSISTENT_ATTRIBUTES) {
            let value = raw[name];
            if (typeof value === "undefined") {
                continue;
            }
            if (
                value &&
                typeof value === "string" &&
                !STRING_ATTRIBUTES.has(name)
            ) {
                value = JSON.parse(value);
            }
            if (value === null && name === "plugin_config") {
                value = {};
            }
            config[name] = value;
        }
        return config;
    };

    let reconcile = Promise.resolve();
    const enqueue = (task) => {
        reconcile = reconcile.then(task).catch((e) => console.error(e));
        return reconcile;
    };

    // viewer -> model: the viewer changed; push every differing trait up.
    const push_viewer_to_model = async () => {
        const config = normalize_config(await viewer.save());
        let changed = false;
        for (const name of PERSISTENT_ATTRIBUTES) {
            if (name in config && !isEqual(config[name], model.get(name))) {
                model.set(name, config[name]);
                changed = true;
            }
        }
        if (changed) {
            model.save_changes();
        }
    };

    // model -> viewer: a trait changed; restore the differing traits in one
    // call (coalescing the per-trait `change:` events of a multi-assign cell).
    const push_model_to_viewer = async () => {
        const config = normalize_config(await viewer.save());
        const diff = {};
        for (const name of PERSISTENT_ATTRIBUTES) {
            const value = model.get(name);
            if (typeof value === "undefined") {
                continue;
            }
            if (!(name in config) || !isEqual(value, config[name])) {
                diff[name] = value;
            }
        }
        if (Object.keys(diff).length > 0) {
            await viewer.restore(diff);
            await viewer.flush();
        }
    };

    const on_config_update = () => enqueue(push_viewer_to_model);
    viewer.addEventListener("perspective-config-update", on_config_update);
    const trait_listeners = PERSISTENT_ATTRIBUTES.map((name) => {
        const cb = () => enqueue(push_model_to_viewer);
        model.on(`change:${name}`, cb);
        return [name, cb];
    });

    return () => {
        for (const [name, cb] of trait_listeners) {
            model.off(`change:${name}`, cb);
        }
        model.off("msg:custom", on_custom_msg);
        viewer.removeEventListener(
            "perspective-config-update",
            on_config_update,
        );
        psp_client.terminate();
        viewer.delete();
        if (viewer.parentNode === el) {
            el.removeChild(viewer);
        }
    };
}

export default { render };
