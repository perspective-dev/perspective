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

let GLOBAL_SERVER_WASM: Promise<ArrayBuffer | WebAssembly.Module>;

export async function createMessageHandler(
    handler: psp_virtual.VirtualServerHandler,
) {
    return psp_virtual.createMessageHandler(await get_client(), handler);
}

export function init_server(
    wasm:
        | Uint8Array
        | Promise<ArrayBuffer | Response | WebAssembly.Module>
        | ArrayBuffer
        | Response
        | WebAssembly.Module,
    disable_stage_0: boolean = false,
) {
    if (wasm instanceof Uint8Array) {
        GLOBAL_SERVER_WASM = Promise.resolve(wasm.buffer);
    } else if (wasm instanceof Response) {
        GLOBAL_SERVER_WASM = Promise.resolve(wasm);
    } else if (wasm instanceof Promise) {
        GLOBAL_SERVER_WASM = wasm;
    } else {
        GLOBAL_SERVER_WASM = Promise.resolve(wasm);
    }

    if (!disable_stage_0) {
        GLOBAL_SERVER_WASM = GLOBAL_SERVER_WASM.then((x) =>
            load_wasm_stage_0(x).then((x) => x.buffer as ArrayBuffer),
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
    if (GLOBAL_SERVER_WASM === undefined) {
        throw new Error("Missing perspective-server.wasm");
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
    createMessageHandler,
    getCompiledClientWasm,
    GenericSQLVirtualServerModel,
    VirtualDataSlice,
    VirtualServer,
};
