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

export type * from "../../dist/wasm/perspective-js.d.ts";
import type * as psp from "../../dist/wasm/perspective-js.d.ts";
export type * from "./virtual_server.ts";
import * as psp_virtual from "./virtual_server.ts";
import * as wasm_module from "../../dist/wasm/perspective-js.js";
import * as api from "./wasm/browser.ts";
import { load_wasm_stage_0 } from "./wasm/decompress.ts";
import { host_supports_memory64 } from "./wasm/features.ts";
export { host_supports_memory64 } from "./wasm/features.ts";

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
 * Engine binaries by bitness. Registering `wasm64` is the opt-in for the
 * Memory64 engine (4GB heap ceiling raised to 16GB, at some engine
 * performance cost) — it is selected whenever the host supports Memory64.
 */
export interface ServerWasmRegistration {
    wasm32?: ServerWasmSource;
    wasm64?: ServerWasmSource;
}

export interface InitServerOptions {
    disable_stage_0?: boolean;
}

interface ServerWasmRegistry extends ServerWasmRegistration {
    sole?: ServerWasmSource;
    disable_stage_0: boolean;
}

let SERVER_REGISTRY: ServerWasmRegistry | undefined;
let GLOBAL_SERVER_WASM: Promise<ArrayBuffer | WebAssembly.Module> | undefined;

export async function createMessageHandler(
    handler: psp_virtual.VirtualServerHandler,
) {
    return psp_virtual.createMessageHandler(await get_client(), handler);
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

async function materialize_server_wasm(
    source: ServerWasmSource,
    disable_stage_0: boolean,
): Promise<ArrayBuffer | WebAssembly.Module> {
    let wasm = typeof source === "function" ? await source() : await source;
    if (wasm instanceof Uint8Array) {
        wasm = wasm.buffer as ArrayBuffer;
    }

    if (typeof Response !== "undefined" && wasm instanceof Response) {
        if (!wasm.ok) {
            throw new Error(
                `Failed to fetch perspective server wasm (HTTP ${wasm.status} "${wasm.url}")`,
            );
        }

        if (disable_stage_0) {
            return await wasm.arrayBuffer();
        }
    }

    if (disable_stage_0) {
        return wasm as ArrayBuffer | WebAssembly.Module;
    }

    const bytes = await load_wasm_stage_0(wasm);
    return bytes.buffer as ArrayBuffer;
}

async function select_server_wasm(
    registry: ServerWasmRegistry,
): Promise<ArrayBuffer | WebAssembly.Module> {
    if (registry.sole !== undefined) {
        return await materialize_server_wasm(
            registry.sole,
            registry.disable_stage_0,
        );
    }

    // A lone `wasm64` registration is an explicit opt-in and is used as-is
    // regardless of the probe (an unsupporting host fails at instantiation,
    // which is the correct error).
    if (
        registry.wasm64 !== undefined &&
        (registry.wasm32 === undefined || host_supports_memory64())
    ) {
        try {
            return await materialize_server_wasm(
                registry.wasm64,
                registry.disable_stage_0,
            );
        } catch (e) {
            if (registry.wasm32 === undefined) {
                throw e;
            }

            console.warn(
                "Memory64 perspective server wasm failed to load, falling back to wasm32",
                e,
            );
        }
    }

    return await materialize_server_wasm(
        registry.wasm32!,
        registry.disable_stage_0,
    );
}

/**
 * Register the Perspective engine ("server") WebAssembly binary that backs
 * `worker()`.
 *
 * The single-argument form registers one binary of either bitness. The
 * object form registers a wasm32 and/or wasm64 (Memory64) binary; the wasm64
 * binary is preferred whenever the host supports Memory64, raising the
 * engine's heap ceiling from 4GB to 16GB (at some engine performance cost —
 * register only `wasm32` to opt out). Sources registered as thunks are only
 * invoked if selected, so the losing binary is never downloaded; if the
 * selected wasm64 source fails to load and a wasm32 source is also
 * registered, selection falls back to wasm32 with a console warning.
 *
 * Selection and download are deferred to the first `worker()` call.
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
 * });
 * ```
 */
export function init_server(
    wasm: ServerWasmSource | ServerWasmRegistration,
    options: boolean | InitServerOptions = false,
) {
    const disable_stage_0 =
        typeof options === "boolean" ? options : !!options.disable_stage_0;

    GLOBAL_SERVER_WASM = undefined;
    if (is_wasm_source(wasm)) {
        SERVER_REGISTRY = { sole: wasm, disable_stage_0 };
        return;
    }

    // `WebAssembly.Module`'s lib type is structurally empty, so TypeScript
    // can't negatively narrow this branch itself.
    const registration = wasm as ServerWasmRegistration;
    if (
        registration.wasm32 !== undefined ||
        registration.wasm64 !== undefined
    ) {
        SERVER_REGISTRY = {
            wasm32: registration.wasm32,
            wasm64: registration.wasm64,
            disable_stage_0,
        };
    } else {
        throw new Error(
            "init_server requires a wasm source or a {wasm32, wasm64} registration",
        );
    }
}

let GLOBAL_CLIENT_WASM: Promise<typeof psp>;
let GLOBAL_CLIENT_MODULE: Promise<WebAssembly.Module> | undefined;

async function compile_module(wasm: any): Promise<WebAssembly.Module> {
    if (wasm instanceof WebAssembly.Module) {
        return wasm;
    }

    if (typeof Response !== "undefined" && wasm instanceof Response) {
        return WebAssembly.compileStreaming(wasm);
    }

    return WebAssembly.compile(wasm);
}

async function compilerize(
    wasm: PerspectiveWasm,
    disable_stage_0: boolean = false,
) {
    const wasm_buff = disable_stage_0 ? wasm : await load_wasm_stage_0(wasm);
    // Compile to a `WebAssembly.Module` once so it can be both instantiated
    // locally and forwarded to other workers via `getCompiledClientWasm()`.
    // `WebAssembly.Module` is structured-cloneable across workers, so the
    // recipient can instantiate without re-fetching or re-compiling.
    const compiled = await compile_module(wasm_buff);
    GLOBAL_CLIENT_MODULE = Promise.resolve(compiled);
    await wasm_module.default({ module_or_path: compiled });
    await wasm_module.init();
    return wasm_module;
}

export type PerspectiveWasm =
    | ArrayBuffer
    | Response
    | typeof psp
    | Promise<ArrayBuffer | Response | Object>;

export function init_client(wasm: PerspectiveWasm, disable_stage_0 = false) {
    if (wasm instanceof Uint8Array) {
        GLOBAL_CLIENT_WASM = compilerize(
            wasm.buffer as ArrayBuffer,
            disable_stage_0,
        );
    } else if (wasm instanceof ArrayBuffer) {
        GLOBAL_CLIENT_WASM = compilerize(wasm, disable_stage_0);
    } else if (wasm instanceof Response) {
        GLOBAL_CLIENT_WASM = compilerize(wasm, disable_stage_0);
    } else if (wasm instanceof Promise) {
        GLOBAL_CLIENT_WASM = compilerize(wasm, disable_stage_0);
    } else if (wasm instanceof Object) {
        GLOBAL_CLIENT_WASM = Promise.resolve(wasm as typeof psp);
    }
}

function get_client() {
    const viewer_class: any = customElements.get("perspective-viewer");
    if (viewer_class) {
        GLOBAL_CLIENT_WASM = Promise.resolve(viewer_class.__wasm_module__);
        if (
            GLOBAL_CLIENT_MODULE === undefined &&
            viewer_class.__wasm_client_module__
        ) {
            GLOBAL_CLIENT_MODULE = Promise.resolve(
                viewer_class.__wasm_client_module__,
            );
        }
    } else if (GLOBAL_CLIENT_WASM === undefined) {
        throw new Error("Missing perspective-client.wasm");
    }

    return GLOBAL_CLIENT_WASM;
}

/**
 * Returns the compiled `WebAssembly.Module` for the perspective-js client
 * runtime. The module is structured-cloneable, so it can be sent via
 * `postMessage` to a Worker which can instantiate its own `Client` without
 * re-fetching or re-compiling the wasm binary.
 *
 * Requires that the client wasm has been initialized — typically by a prior
 * call to `init_client(...)`, or implicitly by mounting a `<perspective-viewer>`
 * element. Throws otherwise.
 *
 * # Examples
 *
 * ```javascript
 * const mod = await perspective.getCompiledClientWasm();
 * worker.postMessage({ kind: "init", clientWasm: mod }, [port]);
 * ```
 */
export async function getCompiledClientWasm(): Promise<WebAssembly.Module> {
    if (GLOBAL_CLIENT_MODULE !== undefined) {
        return GLOBAL_CLIENT_MODULE;
    }

    const viewer_class: any = customElements.get("perspective-viewer");
    if (viewer_class?.__wasm_client_module__) {
        GLOBAL_CLIENT_MODULE = Promise.resolve(
            viewer_class.__wasm_client_module__,
        );
        return GLOBAL_CLIENT_MODULE;
    }

    throw new Error(
        "perspective-js client wasm has not been compiled yet — call " +
            "`init_client(...)` or `perspective.worker()` before " +
            "`getCompiledClientWasm()`.",
    );
}

function get_server() {
    if (SERVER_REGISTRY === undefined) {
        throw new Error("Missing perspective-server.wasm");
    }

    if (GLOBAL_SERVER_WASM === undefined) {
        GLOBAL_SERVER_WASM = select_server_wasm(SERVER_REGISTRY);
    }

    return GLOBAL_SERVER_WASM.then((x) =>
        x instanceof WebAssembly.Module ? x : x.slice(0),
    );
}

let GLOBAL_WORKER: undefined | (() => Promise<Worker>) = undefined;

// `WorkerPlugin` resolves this import to a stub that exports
// `getPerspectiveWorkerURL(): Promise<string>`. The URL is either a
// Blob URL (inline mode — production builds) or a real file path
// resolved against `import.meta.url` (file mode — debug builds).
// Constructing the `Worker` lives here in the consumer rather than
// inside the plugin so the same module text can also be loaded
// in-process via dynamic `import(url)` when a future caller wants
// it; the plugin no longer owns Worker lifecycle.
//
// `initialize()` constructs `new Worker(blobUrl)` and falls back to
// running the worker source on the main thread via `new Function(...)`
// when Worker construction is unavailable (e.g. `file://` origins where
// module-Worker support is gated). The shim it returns is
// MessagePort-shaped so downstream code can treat it like a real
// Worker.
// @ts-ignore — resolved at build time by `@perspective-dev/esbuild-plugin/worker`
import { initialize as initializePerspectiveWorker } from "../../src/ts/perspective-server.worker.js";

async function get_worker(): Promise<Worker> {
    if (GLOBAL_WORKER === undefined) {
        return await initializePerspectiveWorker({
            type: "module",
            name: "perspective-server",
        });
    }

    return GLOBAL_WORKER();
}

export async function websocket(url: string | URL) {
    return await api.websocket(get_client(), url);
}

export async function worker(
    worker?: Promise<SharedWorker | ServiceWorker | Worker | MessagePort>,
) {
    if (typeof worker === "undefined") {
        worker = get_worker();
    }

    return await api.worker(get_client(), get_server(), worker);
}

export default {
    websocket,
    worker,
    init_client,
    init_server,
    host_supports_memory64,
    createMessageHandler,
    getCompiledClientWasm,
    GenericSQLVirtualServerModel,
    VirtualDataSlice,
    VirtualServer,
};
