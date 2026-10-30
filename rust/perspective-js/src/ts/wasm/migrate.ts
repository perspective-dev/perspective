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

import * as migrate_wasm from "../../../dist/wasm/perspective-migrate-js.js";

/**
 * The kind of persisted config `migrate()` upgrades: an engine `ViewConfig`,
 * a `<perspective-viewer>` `save()` token, or a `saveWorkspace()` token.
 */
export type MigrateKind = "view" | "viewer" | "workspace";

/**
 * Information `migrate()` could not carry into the current schema exactly.
 */
export type MigrateNotice =
    | { kind: "Dropped"; step: string; pointer: string; value: unknown }
    | { kind: "Approximated"; step: string; pointer: string; reason: string };

/**
 * A config upgraded by `migrate()`, with what the upgrade dropped or
 * approximated and the ids of the schema changes it applied.
 */
export interface MigrateResult<T = Record<string, unknown>> {
    value: T;
    notices: MigrateNotice[];
    steps: string[];
}

type MigrateBinary = BufferSource | WebAssembly.Module;

/**
 * Instantiates the `perspective-migrate` WebAssembly module from its
 * registered source on the first `migrate()` call.
 */
export class MigrateLoader {
    private source?: () => Promise<MigrateBinary>;
    private module?: Promise<typeof migrate_wasm>;

    register(source: () => Promise<MigrateBinary>) {
        this.source = source;
        this.module = undefined;
    }

    async migrate<T = Record<string, unknown>>(
        kind: MigrateKind,
        config: unknown,
        from_version?: string,
    ): Promise<MigrateResult<T>> {
        if (this.module === undefined) {
            if (this.source === undefined) {
                throw new Error("Missing perspective-migrate-js.wasm");
            }

            const source = this.source;
            this.module = source().then(async (module_or_path) => {
                await migrate_wasm.default({ module_or_path });
                return migrate_wasm;
            });
        }

        const wasm = await this.module;
        return wasm.migrate(kind, from_version, config) as MigrateResult<T>;
    }
}
