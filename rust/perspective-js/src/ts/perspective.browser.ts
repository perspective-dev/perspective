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

export type * from "./public_types.ts";
import type * as psp from "../../dist/wasm/perspective-js.d.ts";
export type * from "./virtual_server.ts";
import * as psp_virtual from "./virtual_server.ts";
import * as wasm_module from "../../dist/wasm/perspective-js.js";
import * as api from "./wasm/browser.ts";
import { host_supports_memory64 } from "./wasm/features.ts";
import type { MigrateKind, MigrateResult } from "./wasm/migrate.ts";
import {
    init,
    MigrateLoader,
    provide_client_glue,
    provide_client_runtime,
    register,
    resolve_client,
    resolve_migrate,
    resolve_server,
    shared_migrate,
} from "./wasm/registry.ts";
import type { WasmSource } from "./wasm/registry.ts";

export { host_supports_memory64 } from "./wasm/features.ts";
export { init } from "./wasm/registry.ts";
export type {
    InitOptions,
    WasmBinary,
    WasmRegistration,
    WasmSource,
} from "./wasm/registry.ts";

export type {
    MigrateKind,
    MigrateNotice,
    MigrateResult,
} from "./wasm/migrate.ts";

export {
    GenericSQLVirtualServerModel,
    VirtualDataSlice,
    VirtualServer,
} from "../../dist/wasm/perspective-js.js";

import {
    GenericSQLVirtualServerModel,
    VirtualDataSlice,
    VirtualServer,
} from "../../dist/wasm/perspective-js.js";

/**
 * A single Perspective engine binary, in any form `init_server` accepts.
 * Thunk sources are only invoked if selected — register both bitnesses as
 * `() => fetch(...)` and only the winning binary is ever downloaded.
 */
export type ServerWasmSource =
    | Uint8Array
    | ArrayBuffer
    | Response
    | WebAssembly.Module
    | Promise<ArrayBuffer | Response | WebAssembly.Module>
    | (() => Promise<ArrayBuffer | Response | WebAssembly.Module>);

/**
 * Engine binaries by bitness, and the `perspective-migrate` binary behind
 * `migrate()`. Registering `wasm64` is the opt-in for the Memory64 engine
 * (4GB heap ceiling raised to 16GB, at some engine performance cost) — it is
 * selected whenever the host supports Memory64.
 */
export interface ServerWasmRegistration {
    wasm32?: ServerWasmSource;
    wasm64?: ServerWasmSource;
    migrate?: ServerWasmSource;
}

export interface InitServerOptions {
    disable_stage_0?: boolean;
}

provide_client_runtime(async (wasm) => {
    const module =
        wasm instanceof WebAssembly.Module
            ? wasm
            : await WebAssembly.compile(wasm);

    await wasm_module.default({ module_or_path: module });
    await wasm_module.init();
    return { glue: wasm_module, module };
});

const MIGRATE = new MigrateLoader();
MIGRATE.register(resolve_migrate);

function client_glue(): Promise<typeof psp> {
    return resolve_client().then((runtime) => runtime.glue);
}

export async function createMessageHandler(
    handler: psp_virtual.VirtualServerHandler,
) {
    return psp_virtual.createMessageHandler(await client_glue(), handler);
}

function is_wasm_source(
    wasm: ServerWasmSource | ServerWasmRegistration,
): wasm is ServerWasmSource {
    return (
        wasm instanceof Uint8Array ||
        wasm instanceof ArrayBuffer ||
        (typeof Response !== "undefined" && wasm instanceof Response) ||
        wasm instanceof Promise ||
        wasm instanceof WebAssembly.Module ||
        typeof wasm === "function"
    );
}

/**
 * Register the Perspective engine ("server") WebAssembly binary that backs
 * `worker()`; a wrapper over `init()`'s `server` / `server32` / `server64` /
 * `migrate` roles.
 *
 * The single-argument form registers one binary of either bitness (`server`).
 * The object form registers a wasm32 and/or wasm64 (Memory64) binary
 * (`server32` / `server64`); the wasm64 binary is preferred whenever the host
 * supports Memory64, raising the engine's heap ceiling from 4GB to 16GB (at
 * some engine performance cost — register only `wasm32` to opt out). Sources
 * registered as thunks are only invoked if selected, so the losing binary is
 * never downloaded; if the selected wasm64 source fails to load and a wasm32
 * source is also registered, selection falls back to wasm32 with a console
 * warning. Either form replaces any engine binaries registered earlier.
 *
 * Selection and download are deferred to the first `worker()` call. The
 * `migrate` binary is likewise only downloaded by the first `migrate()` call.
 *
 * # Examples
 *
 * ```javascript
 * perspective.init_server(
 *     fetch("perspective-server.wasm"),
 * );
 *
 * perspective.init_server({
 *     wasm32: () => fetch("perspective-server.wasm"),
 *     wasm64: () => fetch("perspective-server.memory64.wasm"),
 *     migrate: () => fetch("perspective-migrate.wasm"),
 * });
 * ```
 */
export function init_server(
    wasm: ServerWasmSource | ServerWasmRegistration,
    options: boolean | InitServerOptions = false,
) {
    const disable_stage_0 =
        typeof options === "boolean" ? options : !!options.disable_stage_0;

    if (is_wasm_source(wasm)) {
        register({ server: wasm }, { disable_stage_0 }, "replace_server");
        return;
    }

    // `WebAssembly.Module`'s lib type is structurally empty, so TypeScript
    // can't negatively narrow this branch itself.
    const { wasm32, wasm64, migrate } = wasm as ServerWasmRegistration;
    if (wasm32 === undefined && wasm64 === undefined && migrate === undefined) {
        throw new Error(
            "init_server requires a wasm source or a {wasm32, wasm64, migrate} registration",
        );
    }

    if (wasm32 !== undefined || wasm64 !== undefined) {
        register(
            { server32: wasm32, server64: wasm64 },
            { disable_stage_0 },
            "replace_server",
        );
    }

    if (migrate !== undefined) {
        register({ migrate }, { disable_stage_0 });
    }
}

/**
 * Upgrade a persisted config written by any Perspective release since 2.0.0
 * to the current schema, using the `migrate` binary registered with `init()`.
 *
 * # Arguments
 *
 * - `kind` - `"view"` for a `ViewConfig`, `"viewer"` for a
 *   `<perspective-viewer>` `save()` token, or `"workspace"` for a
 *   `saveWorkspace()` token.
 * - `config` - The config to upgrade.
 * - `from_version` - The release which wrote `config`, used only when it has
 *   no `version` field.
 *
 * # Examples
 *
 * ```javascript
 * const { value, notices } = await perspective.migrate("viewer", token);
 * await viewer.restore(value);
 * ```
 */
export async function migrate<T = Record<string, unknown>>(
    kind: MigrateKind,
    config: unknown,
    from_version?: string,
): Promise<MigrateResult<T>> {
    return await shared_migrate(MIGRATE).migrate<T>(kind, config, from_version);
}

export type PerspectiveWasm =
    | ArrayBuffer
    | Response
    | typeof psp
    | Promise<ArrayBuffer | Response | Object>;

function is_client_source(wasm: PerspectiveWasm): boolean {
    return (
        wasm instanceof Uint8Array ||
        wasm instanceof ArrayBuffer ||
        (typeof Response !== "undefined" && wasm instanceof Response) ||
        wasm instanceof Promise ||
        wasm instanceof WebAssembly.Module
    );
}

/**
 * Register the `perspective-js` client WebAssembly binary, or an
 * already-initialized `perspective-js` module; a wrapper over `init()`'s
 * `client` role.
 */
export function init_client(wasm: PerspectiveWasm, disable_stage_0 = false) {
    if (is_client_source(wasm)) {
        register({ client: wasm as WasmSource }, { disable_stage_0 });
    } else {
        provide_client_glue(wasm as typeof psp);
    }
}

/**
 * Create a `Client` which sends requests through `send_request`; feed its
 * responses to `client.handle_response()`.
 *
 * # Examples
 *
 * ```javascript
 * const client = await perspective.make_client(async (bytes) => {
 *     socket.send(bytes);
 * });
 *
 * socket.onmessage = (event) => client.handle_response(event.data);
 * ```
 */
export async function make_client(
    send_request: (buffer: Uint8Array) => Promise<void>,
    close?: Function,
) {
    const { Client } = await client_glue();
    return new Client(send_request, close);
}

/**
 * Returns the compiled `WebAssembly.Module` for the perspective-js client
 * runtime. The module is structured-cloneable, so it can be sent via
 * `postMessage` to a Worker which can instantiate its own `Client` without
 * re-fetching or re-compiling the wasm binary.
 *
 * Resolves the `client` (or `viewer`) binary registered with `init()`,
 * compiling it on first use.
 *
 * # Examples
 *
 * ```javascript
 * const mod = await perspective.getCompiledClientWasm();
 * worker.postMessage({ kind: "init", clientWasm: mod }, [port]);
 * ```
 */
export async function getCompiledClientWasm(): Promise<WebAssembly.Module> {
    const { module } = await resolve_client();
    if (module === undefined) {
        throw new Error(
            "perspective-js was initialized from a pre-initialized module, so its compiled `WebAssembly.Module` is unavailable",
        );
    }

    return module;
}

// `WorkerPlugin` resolves this import to a stub that exports
// `getPerspectiveWorkerURL(): Promise<string>`.
import { initialize as initializePerspectiveWorker } from "../../src/ts/perspective-server.worker.ts";

async function get_worker(): Promise<Worker | MessagePort> {
    return await initializePerspectiveWorker({
        type: "module",
        name: "perspective-server",
    });
}

export async function websocket(url: string | URL) {
    return await api.websocket(client_glue(), url);
}

export async function worker(
    worker?: Promise<SharedWorker | Worker | MessagePort>,
) {
    if (typeof worker === "undefined") {
        worker = get_worker();
    }

    return await api.worker(client_glue(), resolve_server(), worker);
}

export default {
    init,
    websocket,
    worker,
    init_client,
    init_server,
    make_client,
    migrate,
    host_supports_memory64,
    createMessageHandler,
    getCompiledClientWasm,
    GenericSQLVirtualServerModel,
    VirtualDataSlice,
    VirtualServer,
};
