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

import * as migrate_wasm from "../../../dist/wasm/perspective-migrate.js";

/**
 * The kind of persisted config `migrate()` upgrades: an engine `ViewConfig`,
 * a `<perspective-viewer>` `save()` token, one workspace panel, or a
 * `saveWorkspace()` token.
 */
export type MigrateKind = "view" | "viewer" | "panel" | "workspace";

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

/**
 * Synchronous `migrate()` and `validate()` over an instantiated
 * `perspective-migrate` binary, from `create_validator()`.
 */
export interface Validator {
    /**
     * Upgrade a persisted config written by any Perspective release since
     * 2.0.0 to the current schema.
     *
     * # Arguments
     *
     * - `kind` - `"view"` for a `ViewConfig`, `"viewer"` for a `save()`
     *   token, `"panel"` for one workspace panel, or `"workspace"` for a
     *   `saveWorkspace()` token.
     * - `config` - The config to upgrade.
     * - `from_version` - The release which wrote `config`, used only when it
     *   has no `version` field.
     */
    migrate<T = Record<string, unknown>>(
        kind: MigrateKind,
        config: unknown,
        from_version?: string,
    ): MigrateResult<T>;

    /**
     * Check that a config is valid for this release without migrating it,
     * throwing the offending JSON pointer and reason otherwise.
     *
     * # Arguments
     *
     * - `kind` - `"view"`, `"viewer"`, `"panel"` or `"workspace"`.
     * - `config` - The config to check.
     * - `options.strict` - Require the complete `save()` form rather than the
     *   field-wise `restore()` update form.
     */
    validate(
        kind: MigrateKind,
        config: unknown,
        options?: { strict?: boolean },
    ): void;
}

/**
 * Instantiate the `perspective-migrate` binary and wrap its exports as a
 * `Validator`.
 */
export async function load_validator(
    binary: BufferSource | WebAssembly.Module,
): Promise<Validator> {
    await migrate_wasm.default({ module_or_path: binary });
    return {
        migrate<T>(kind: MigrateKind, config: unknown, from_version?: string) {
            return migrate_wasm.migrate(
                kind,
                from_version,
                config,
            ) as MigrateResult<T>;
        },
        validate(kind, config, options) {
            migrate_wasm.validate_config(kind, config, options?.strict);
        },
    };
}
