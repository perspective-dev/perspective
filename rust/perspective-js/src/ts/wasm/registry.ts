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
 * The page-wide WebAssembly registry shared by Perspective's packages, an
 * internal contract between them rather than a public API.
 *
 * @module
 */

import type * as psp from "../../../dist/wasm/perspective-js.d.ts";
import { load_wasm_stage_0 } from "./decompress.ts";
import { host_supports_memory64 } from "./features.ts";
import type { MigrateKind, MigrateResult } from "./migrate.ts";

export { MigrateLoader } from "./migrate.ts";
export type { MigrateKind, MigrateNotice, MigrateResult } from "./migrate.ts";
export { resolve_package_wasm_url } from "./cdn.ts";

declare const __PSP_VERSION__: string;

/**
 * A WebAssembly binary in a form `init()` accepts.
 */
export type WasmBinary =
    | Uint8Array
    | ArrayBuffer
    | Response
    | WebAssembly.Module;

/**
 * A WebAssembly binary, a promise of one, or a thunk which is only invoked
 * when the binary is first needed.
 */
export type WasmSource =
    | WasmBinary
    | Promise<WasmBinary>
    | (() => Promise<WasmBinary>);

/**
 * The WebAssembly binaries to register with `init()`, by role.
 */
export interface WasmRegistration {
    client?: WasmSource;
    viewer?: WasmSource;
    server?: WasmSource;
    server32?: WasmSource;
    server64?: WasmSource;
    migrate?: WasmSource;
}

/**
 * Options for `init()`, applied to the sources registered by that call.
 */
export interface InitOptions {
    disable_stage_0?: boolean;
}

/**
 * The initialized wasm-bindgen module backing every `Client` on the page.
 */
export interface ClientRuntime {
    glue: typeof psp;
    module?: WebAssembly.Module;
}

/**
 * Instantiates a package's wasm-bindgen module from its extracted binary.
 */
export type RuntimeProvider = (
    wasm: ArrayBuffer | WebAssembly.Module,
) => Promise<ClientRuntime>;

/**
 * A loader which runs `perspective-migrate` for `migrate()`.
 */
export interface MigrateHost {
    migrate<T = Record<string, unknown>>(
        kind: MigrateKind,
        config: unknown,
        from_version?: string,
    ): Promise<MigrateResult<T>>;
}

type WasmKey = keyof WasmRegistration;

type ServerKey = "server" | "server32" | "server64";

type RegisterMode = "user" | "default" | "replace_server";

interface Entry {
    source: WasmSource;
    disable_stage_0: boolean;
    is_default: boolean;
}

interface RegistryState {
    sources: Partial<Record<WasmKey, Entry>>;
    consumed: Set<WasmKey>;
    client_provider?: RuntimeProvider;
    viewer_provider?: RuntimeProvider;
    client?: Promise<ClientRuntime>;
    client_origin?: "client" | "viewer" | "glue";
    client_runtime?: ClientRuntime;
    viewer?: Promise<ClientRuntime>;
    server?: Promise<ArrayBuffer | WebAssembly.Module>;
    migrate_binary?: Promise<ArrayBuffer | WebAssembly.Module>;
    migrate?: MigrateHost;
}

const STATE_KEY = Symbol.for("@perspective-dev/wasm");

const WASM_KEYS: WasmKey[] = [
    "client",
    "viewer",
    "server",
    "server32",
    "server64",
    "migrate",
];

const SERVER_KEYS: ServerKey[] = ["server", "server32", "server64"];

function is_server_key(key: WasmKey): key is ServerKey {
    return (SERVER_KEYS as WasmKey[]).includes(key);
}

function states(): Map<string, RegistryState> {
    const global = globalThis as any;
    global[STATE_KEY] ??= new Map();
    return global[STATE_KEY];
}

function state(): RegistryState {
    const all = states();
    let s = all.get(__PSP_VERSION__);
    if (s === undefined) {
        s = { sources: {}, consumed: new Set() };
        all.set(__PSP_VERSION__, s);
    }

    return s;
}

function assert_single_version() {
    const others = [...states().keys()].filter(
        (version) => version !== __PSP_VERSION__,
    );

    if (others.length > 0) {
        throw new Error(
            `Perspective ${__PSP_VERSION__} cannot share a page with Perspective ${others.join(", ")}`,
        );
    }
}

async function materialize({
    source,
    disable_stage_0,
}: Entry): Promise<ArrayBuffer | WebAssembly.Module> {
    let wasm = typeof source === "function" ? await source() : await source;
    if (wasm instanceof WebAssembly.Module) {
        return wasm;
    }

    if (wasm instanceof Uint8Array) {
        wasm = wasm.slice().buffer as ArrayBuffer;
    }

    if (typeof Response !== "undefined" && wasm instanceof Response) {
        if (!wasm.ok) {
            throw new Error(
                `Failed to fetch perspective wasm (HTTP ${wasm.status} "${wasm.url}")`,
            );
        }

        if (disable_stage_0) {
            return await wasm.arrayBuffer();
        }
    }

    if (disable_stage_0) {
        return wasm as ArrayBuffer;
    }

    const bytes = await load_wasm_stage_0(wasm as ArrayBuffer | Response);
    return bytes.buffer as ArrayBuffer;
}

async function select_server(
    sources: RegistryState["sources"],
): Promise<ArrayBuffer | WebAssembly.Module> {
    if (sources.server !== undefined) {
        return await materialize(sources.server);
    }

    const { server32, server64 } = sources;
    if (
        server64 !== undefined &&
        (server32 === undefined || host_supports_memory64())
    ) {
        try {
            return await materialize(server64);
        } catch (e) {
            if (server32 === undefined) {
                throw e;
            }

            console.warn(
                "Memory64 perspective server wasm failed to load, falling back to wasm32",
                e,
            );
        }
    }

    return await materialize(server32!);
}

function start_viewer(s: RegistryState) {
    s.consumed.add("viewer");
    s.viewer = materialize(s.sources.viewer!).then(s.viewer_provider!);
    if (s.client === undefined) {
        s.client = s.viewer;
        s.client_origin = "viewer";
        s.viewer.then(
            (runtime) => {
                s.client_runtime = runtime;
            },
            () => undefined,
        );
    }
}

/**
 * Registers sources with the page-wide registry under the given mode.
 */
export function register(
    wasm: WasmRegistration,
    options: InitOptions = {},
    mode: RegisterMode = "user",
) {
    if (mode !== "default") {
        assert_single_version();
    }

    const s = state();
    const unknown = Object.keys(wasm).filter(
        (key) => !WASM_KEYS.includes(key as WasmKey),
    );

    if (unknown.length > 0) {
        throw new Error(
            `Unknown perspective wasm key(s) ${unknown.join(", ")}; expected ${WASM_KEYS.join(", ")}`,
        );
    }

    let keys = WASM_KEYS.filter((key) => wasm[key] !== undefined);
    if (mode === "default") {
        const has_server = SERVER_KEYS.some(
            (key) => s.sources[key] !== undefined,
        );

        keys = keys.filter(
            (key) =>
                s.sources[key] === undefined &&
                !s.consumed.has(key) &&
                !(has_server && is_server_key(key)),
        );
    } else {
        if (keys.length === 0) {
            throw new Error(
                `init() requires at least one of ${WASM_KEYS.join(", ")}`,
            );
        }

        for (const key of keys) {
            if (s.consumed.has(key)) {
                throw new Error(`${key} wasm is already initialized`);
            }
        }

        if (keys.some(is_server_key)) {
            for (const key of SERVER_KEYS) {
                if (mode === "replace_server" || s.sources[key]?.is_default) {
                    delete s.sources[key];
                }
            }
        }
    }

    if (keys.includes("viewer")) {
        if (s.client !== undefined) {
            throw new Error(
                "viewer wasm must be registered before any Client is created from client wasm",
            );
        }

        if (s.viewer_provider === undefined) {
            throw new Error(
                "viewer wasm was registered, but @perspective-dev/viewer is not loaded",
            );
        }
    }

    const servers = SERVER_KEYS.filter(
        (key) => keys.includes(key) || s.sources[key] !== undefined,
    );

    if (servers.includes("server") && servers.length > 1) {
        throw new Error(
            "`server` cannot be combined with `server32` or `server64`",
        );
    }

    const disable_stage_0 = !!options.disable_stage_0;
    for (const key of keys) {
        s.sources[key] = {
            source: wasm[key]!,
            disable_stage_0,
            is_default: mode === "default",
        };
    }

    if (keys.includes("viewer")) {
        start_viewer(s);
    }
}

/**
 * Register Perspective's WebAssembly binaries for this page, shared by every
 * copy of `@perspective-dev/client` and `@perspective-dev/viewer`, throwing if
 * another Perspective version has loaded on this page.
 *
 * # Arguments
 *
 * - `wasm` - Binaries by role: `client` (`perspective-js.wasm`), `viewer`
 *   (`perspective-viewer.wasm`, which also backs every `Client`), `server`
 *   (one engine build) or `server32` / `server64` (selected by Memory64
 *   support), and `migrate` (`perspective-migrate.wasm`).
 * - `options` - `disable_stage_0` skips decompression for these sources.
 *
 * # Examples
 *
 * ```javascript
 * await perspective.init({
 *     server32: () => fetch(SERVER_WASM),
 *     server64: () => fetch(SERVER_MEMORY64_WASM),
 *     viewer: fetch(VIEWER_WASM),
 * });
 * ```
 */
export async function init(
    wasm: WasmRegistration,
    options: InitOptions = {},
): Promise<void> {
    register(wasm, options);
    if (wasm.viewer !== undefined) {
        await state().viewer;
    }
}

/**
 * Registers sources only for roles the page has not registered yet.
 */
export function register_default(wasm: WasmRegistration) {
    register(wasm, {}, "default");
}

/**
 * Installs the `client` role's runtime provider if none is installed.
 */
export function provide_client_runtime(provider: RuntimeProvider) {
    const s = state();
    s.client_provider ??= provider;
}

/**
 * Installs the `viewer` role's runtime provider if none is installed.
 */
export function provide_viewer_runtime(provider: RuntimeProvider) {
    const s = state();
    s.viewer_provider ??= provider;
}

/**
 * Backs every `Client` with an already-initialized wasm-bindgen module.
 */
export function provide_client_glue(glue: typeof psp) {
    const s = state();
    if (s.client !== undefined) {
        throw new Error("client wasm is already initialized");
    }

    s.consumed.add("client");
    s.client_origin = "glue";
    s.client_runtime = { glue };
    s.client = Promise.resolve(s.client_runtime);
}

/**
 * Resolves the runtime backing every `Client`, instantiating it on first use.
 */
export function resolve_client(): Promise<ClientRuntime> {
    const s = state();
    if (s.client === undefined) {
        const entry = s.sources.client;
        if (entry === undefined) {
            return Promise.reject(
                new Error(
                    "Missing perspective-js.wasm: register `client` or `viewer` with init()",
                ),
            );
        }

        if (s.client_provider === undefined) {
            return Promise.reject(
                new Error(
                    "client wasm was registered, but @perspective-dev/client is not loaded",
                ),
            );
        }

        s.consumed.add("client");
        s.client_origin = "client";
        s.client = materialize(entry).then(s.client_provider);
        s.client.then(
            (runtime) => {
                s.client_runtime = runtime;
            },
            () => undefined,
        );
    }

    return s.client;
}

/**
 * The runtime backing every `Client`, if it has finished initializing.
 */
export function client_runtime(): ClientRuntime | undefined {
    return (globalThis as any)[STATE_KEY]?.get(__PSP_VERSION__)?.client_runtime;
}

/**
 * Resolves once `<perspective-viewer>` is defined.
 */
export async function resolve_viewer(): Promise<void> {
    const viewer = state().viewer;
    if (viewer === undefined) {
        throw new Error(
            "Missing perspective-viewer.wasm: register `viewer` with init()",
        );
    }

    await viewer;
}

/**
 * Resolves the selected engine binary, a fresh copy per call.
 */
export function resolve_server(): Promise<ArrayBuffer | WebAssembly.Module> {
    const s = state();
    if (s.server === undefined) {
        if (!SERVER_KEYS.some((key) => s.sources[key] !== undefined)) {
            return Promise.reject(
                new Error(
                    "Missing perspective-server.wasm: register `server` (or `server32` / `server64`) with init()",
                ),
            );
        }

        for (const key of SERVER_KEYS) {
            s.consumed.add(key);
        }

        s.server = select_server(s.sources);
    }

    return s.server.then((wasm) =>
        wasm instanceof WebAssembly.Module ? wasm : wasm.slice(0),
    );
}

/**
 * Resolves the extracted `perspective-migrate` binary.
 */
export function resolve_migrate(): Promise<ArrayBuffer | WebAssembly.Module> {
    const s = state();
    if (s.migrate_binary === undefined) {
        const entry = s.sources.migrate;
        if (entry === undefined) {
            return Promise.reject(
                new Error(
                    "Missing perspective-migrate.wasm: register `migrate` with init()",
                ),
            );
        }

        s.consumed.add("migrate");
        s.migrate_binary = materialize(entry);
    }

    return s.migrate_binary;
}

/**
 * The page's one `migrate()` loader, installing `local` if there is none.
 */
export function shared_migrate(local: MigrateHost): MigrateHost {
    const s = state();
    s.migrate ??= local;
    return s.migrate;
}
