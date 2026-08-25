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

import { signal } from "./signal.js";
import type { EngineId } from "./sources.js";

export type EngineStatus = "idle" | "starting" | "ready" | "failed";

export interface EngineInfo {
    id: EngineId;
    label: string;
    status: EngineStatus;
    error?: string;
}

export interface Engine {
    /** Qualify a bare table name as this client reports it to Perspective. */
    qualify(name: string): string;
    client(): any;
    drop(name: string): Promise<void>;
}

export const ENGINE_LABELS: Record<EngineId, string> = {
    "perspective-server": "perspective-server",
    "duckdb-wasm": "DuckDB-WASM",
};

const STATUS: Record<EngineId, EngineInfo> = {
    "perspective-server": {
        id: "perspective-server",
        label: ENGINE_LABELS["perspective-server"],
        status: "idle",
    },
    "duckdb-wasm": {
        id: "duckdb-wasm",
        label: ENGINE_LABELS["duckdb-wasm"],
        status: "idle",
    },
};

function engineStatuses(): EngineInfo[] {
    return Object.values(STATUS).map((e) => ({ ...e }));
}

const ENGINES = signal(engineStatuses());

/**
 * Subscribe to engine status changes, invoked immediately with the current
 * statuses.
 *
 * @param listener called with a snapshot on every change.
 */
export function subscribeEngines(
    listener: (info: EngineInfo[]) => void,
): () => void {
    return ENGINES.subscribe(listener);
}

function setStatus(id: EngineId, status: EngineStatus, error?: string) {
    STATUS[id].status = status;
    STATUS[id].error = error;
    ENGINES.set(engineStatuses());
}

/**
 * Memoize an engine's boot behind its status lifecycle — `starting` on first
 * call, `ready` on success, and `failed` with the promise reset so a later
 * call may retry.
 *
 * @param id the engine whose status this boot drives.
 * @param make boots the engine, registering its client with the viewer.
 */
function boot<T extends Engine>(
    id: EngineId,
    make: () => Promise<T>,
): () => Promise<T> {
    let started: Promise<T> | undefined;
    return () => {
        started ??= (async () => {
            setStatus(id, "starting");
            try {
                const engine = await make();
                setStatus(id, "ready");
                return engine;
            } catch (err) {
                setStatus(id, "failed", String(err));
                started = undefined;
                throw err;
            }
        })();

        return started;
    };
}

let VIEWER: any;

/**
 * Bind the element every engine registers itself with. Called once at boot,
 * before anything may construct an engine.
 *
 * @param viewer the app's `perspective-viewer`.
 */
export function bindViewer(viewer: any) {
    VIEWER = viewer;
}

const BOOT = (async () => {
    const perspective = await import("@perspective-dev/client");
    const perspective_viewer = await import("@perspective-dev/viewer");

    const client_wasm = import(
        // @ts-ignore
        "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm"
    );

    await Promise.all([
        perspective.init_server({
            wasm64: () =>
                import(
                    // @ts-ignore
                    "@perspective-dev/server/dist/wasm/perspective-server.memory64.wasm"
                ).then((x: any) => x.default),
            wasm32: () =>
                import(
                    // @ts-ignore
                    "@perspective-dev/server/dist/wasm/perspective-server.wasm"
                ).then((x: any) => x.default),
        }),
        perspective_viewer.init_client(client_wasm.then((x: any) => x.default)),
    ]);

    return perspective;
})();

/**
 * Spawn a PRIVATE perspective-server worker, never registered with the
 * viewer — for `eval` scripts whose queries must not contend with the shared
 * client's.
 */
export async function spawnWorker(): Promise<any> {
    const perspective = await BOOT;
    return perspective.worker();
}

/** The shared perspective-server engine, booted and registered on first use. */
export const perspectiveServer = boot<Engine>(
    "perspective-server",
    async () => {
        const perspective = await BOOT;
        const client = await perspective.worker();
        await VIEWER.load(client);
        return {
            qualify: (name: string) => name,
            client: () => client,
            async drop(name: string) {
                const table = await client.open_table(name);
                await table.delete();
            },
        };
    },
);

export interface DuckDBEngine extends Engine {
    /** The `AsyncDuckDB`, for `registerFile*` (which live on the db). */
    db: any;

    /** The connection, for SQL and `insertArrowFromIPCStream`. */
    conn: any;
}

/** The shared DuckDB-WASM engine, booted and registered on first use. */
export const duckdb = boot<DuckDBEngine>("duckdb-wasm", async () => {
    const perspective = await BOOT;
    const duckdbMod = await import("@duckdb/duckdb-wasm");
    const bundle = await duckdbMod.selectBundle(
        duckdbMod.getJsDelivrBundles(),
    );

    const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
            type: "text/javascript",
        }),
    );

    const worker = new Worker(worker_url);
    const db = new duckdbMod.AsyncDuckDB(new duckdbMod.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    const conn = await db.connect();
    await conn.query(
        `SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;`,
    );

    const { DuckDBHandler } = await import(
        // @ts-ignore - optional submodule, not exported from the root
        "@perspective-dev/client/dist/esm/virtual_servers/duckdb.js"
    );

    const handler = new DuckDBHandler(conn);
    const client = await perspective.worker(
        perspective.createMessageHandler(handler),
    );

    await VIEWER.load(client);
    return {
        db,
        conn,
        qualify: (name: string) => `memory.${name}`,
        client: () => client,
        async drop(name: string) {
            await conn.query(`DROP TABLE IF EXISTS "${name}"`);
            await conn.query(`DROP VIEW IF EXISTS "${name}"`);
        },
    };
});

/**
 * The engine `id` names.
 *
 * @param id the engine to boot or return.
 */
export function engine(id: EngineId): Promise<Engine> {
    return id === "duckdb-wasm" ? duckdb() : perspectiveServer();
}
