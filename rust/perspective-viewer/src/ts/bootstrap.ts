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
    MigrateLoader,
    provide_viewer_runtime,
    resolve_migrate,
    shared_migrate,
} from "@perspective-dev/client/registry";
import type {
    ClientRuntime,
    InitOptions,
    MigrateKind,
    MigrateResult,
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

/**
 * A WebAssembly binary in any form `init_client` accepts; thunks are only
 * invoked when the binary is needed.
 */
export type ViewerWasmSource =
    | Promise<Response | ArrayBuffer | Uint8Array>
    | Response
    | ArrayBuffer
    | Uint8Array
    | (() => Promise<Response | ArrayBuffer | Uint8Array>);

/**
 * The `<perspective-viewer>` binary, and the `perspective-migrate` binary
 * behind `migrate()`.
 */
export interface ViewerWasmRegistration {
    viewer?: ViewerWasmSource;
    migrate?: ViewerWasmSource;
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

const MIGRATE = new MigrateLoader();
MIGRATE.register(resolve_migrate);

function is_registration(
    wasm: ViewerWasmSource | ViewerWasmRegistration,
): wasm is ViewerWasmRegistration {
    return (
        typeof wasm === "object" &&
        !(wasm instanceof Promise) &&
        !(wasm instanceof Response) &&
        !(wasm instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(wasm)
    );
}

/**
 * Initialize `<perspective-viewer>` from its WebAssembly binary, and register
 * the `perspective-migrate` binary which `migrate()` downloads on first use;
 * a wrapper over `init()`'s `viewer` and `migrate` roles.
 *
 * # Examples
 *
 * ```javascript
 * await init_client({
 *     viewer: () => fetch("perspective-viewer.wasm"),
 *     migrate: () => fetch("perspective-migrate.wasm"),
 * });
 * ```
 */
export async function init_client(
    wasm: ViewerWasmSource | ViewerWasmRegistration,
    wasm_module?: typeof wasm_module_type,
) {
    const registration = is_registration(wasm) ? wasm : { viewer: wasm };
    const { viewer, migrate } = registration;
    if (viewer === undefined && migrate === undefined) {
        throw new Error(
            "init_client requires a wasm source or a {viewer, migrate} registration",
        );
    }

    if (wasm_module !== undefined) {
        GLUE_OVERRIDE = wasm_module;
    }

    await init({ viewer, migrate });
}

/**
 * Upgrade a persisted config written by any Perspective release since 2.0.0
 * to the current schema, using the `migrate` binary registered with `init()`.
 *
 * # Arguments
 *
 * - `kind` - `"view"` for a `ViewConfig`, `"viewer"` for a `save()` token, or
 *   `"workspace"` for a `saveWorkspace()` token.
 * - `config` - The config to upgrade.
 * - `from_version` - The release which wrote `config`, used only when it has
 *   no `version` field.
 */
export async function migrate<T = Record<string, unknown>>(
    kind: MigrateKind,
    config: unknown,
    from_version?: string,
): Promise<MigrateResult<T>> {
    return await shared_migrate(MIGRATE).migrate<T>(kind, config, from_version);
}
