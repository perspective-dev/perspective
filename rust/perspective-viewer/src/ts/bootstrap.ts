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

import type * as wasm_module_type from "../../dist/wasm/perspective-viewer.js";
import {
    init as registry_init,
    provide_viewer_runtime,
} from "@perspective-dev/client/registry";
import type {
    ClientRuntime,
    InitOptions,
    WasmRegistration,
} from "@perspective-dev/client/registry";

// @ts-ignore
import * as worker_url from "./perspective-viewer.worker.ts";

export type {
    InitOptions,
    WasmBinary,
    WasmRegistration,
    WasmSource,
} from "@perspective-dev/client/registry";

/**
 * Register Perspective's WebAssembly binaries for this page; the same function
 * as `@perspective-dev/client`'s `init()`.
 */
export async function init(
    wasm: WasmRegistration,
    options?: InitOptions,
): Promise<void> {
    await registry_init(wasm, options);
}

let GLUE_OVERRIDE: typeof wasm_module_type | undefined;

provide_viewer_runtime(async (wasm) => {
    // @ts-ignore
    const url = await worker_url.getWorkerURL();
    const [glue, module] = await Promise.all([
        GLUE_OVERRIDE === undefined
            ? import(/* webpackIgnore: true */ /* @vite-ignore */ url)
            : GLUE_OVERRIDE,
        wasm instanceof WebAssembly.Module ? wasm : WebAssembly.compile(wasm),
    ]);

    await glue.default({ module_or_path: module });
    await glue.init(module, url);
    return { glue: glue as ClientRuntime["glue"], module };
});

/**
 * Initialize `<perspective-viewer>` from its WebAssembly binary; a wrapper
 * over `init()`'s `viewer` role.
 */
export async function init_client(
    wasm_binary:
        | Promise<Response | ArrayBuffer | Uint8Array>
        | Response
        | ArrayBuffer
        | Uint8Array,
    wasm_module?: typeof wasm_module_type,
) {
    if (wasm_module !== undefined) {
        GLUE_OVERRIDE = wasm_module;
    }

    await init({ viewer: wasm_binary });
}
