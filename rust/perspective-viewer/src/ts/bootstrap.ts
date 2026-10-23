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
import { load_wasm_stage_0 } from "@perspective-dev/client/src/ts/wasm/decompress.ts";
import { MigrateLoader } from "@perspective-dev/client/src/ts/wasm/migrate.ts";
import type {
    MigrateKind,
    MigrateResult,
} from "@perspective-dev/client/src/ts/wasm/migrate.ts";

// @ts-ignore
import * as worker_url from "./perspective-viewer.worker";

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

const MIGRATE = new MigrateLoader();

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

async function resolve_source(
    source: ViewerWasmSource,
): Promise<Response | ArrayBuffer | Uint8Array> {
    return typeof source === "function" ? await source() : await source;
}

async function decompress(source: ViewerWasmSource) {
    return await load_wasm_stage_0(
        (await resolve_source(source)) as ArrayBuffer,
    );
}

/**
 * Initialize `<perspective-viewer>` from its WebAssembly binary, and register
 * the `perspective-migrate` binary which `migrate()` downloads on first use.
 *
 * # Examples
 *
 * ```javascript
 * await init_client({
 *     viewer: () => fetch("perspective-viewer.wasm"),
 *     migrate: () => fetch("perspective-migrate-js.wasm"),
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

    if (migrate !== undefined) {
        MIGRATE.register(() => decompress(migrate));
    }

    if (viewer === undefined) {
        return;
    }

    // @ts-ignore
    const url = await worker_url.getWorkerURL();
    const [wasm_module2, module_or_path] = await Promise.all([
        wasm_module === undefined ? import(url) : wasm_module,
        decompress(viewer).then((unzipped) =>
            WebAssembly.compile(unzipped as BufferSource),
        ),
    ]);

    await wasm_module2.default({ module_or_path });
    await wasm_module2.init(module_or_path, url);
}

/**
 * Upgrade a persisted config written by any Perspective release since 2.0.0
 * to the current schema, using the `migrate` binary registered with
 * `init_client`.
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
    return await MIGRATE.migrate<T>(kind, config, from_version);
}
