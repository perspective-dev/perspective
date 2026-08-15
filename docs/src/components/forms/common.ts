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

import type { CreatedSource } from "../../data/create_source.js";
import type { EngineId } from "../../data/sources.js";
import { options } from "../dom.js";

export type { CreatedSource };

export interface SourceForm {
    render(root: HTMLElement): void;
    onEngineChange?(engine: EngineId): void;
    create(engine: EngineId): Promise<CreatedSource>;
}

export const PSP_FORMATS = ["arrow", "csv", "json", "ndjson"] as const;
export const DUCKDB_FORMATS = ["parquet", "arrow", "csv", "json"] as const;

/** Every format either engine can read. */
export type Format =
    | (typeof PSP_FORMATS)[number]
    | (typeof DUCKDB_FORMATS)[number];

/**
 * The formats an engine can read.
 *
 * @param engine the engine the source will be created on.
 */
export function formatsFor(engine: EngineId): readonly string[] {
    return engine === "duckdb-wasm" ? DUCKDB_FORMATS : PSP_FORMATS;
}

/**
 * The `accept` attribute for an engine's file picker.
 *
 * @param engine the engine the source will be created on.
 */
export function acceptFor(engine: EngineId): string {
    return engine === "duckdb-wasm"
        ? ".parquet,.arrow,.feather,.csv,.json,.ndjson"
        : ".arrow,.feather,.csv,.json,.ndjson";
}

/**
 * The format a path or URL's extension implies, if any.
 *
 * @param pathish a URL, key or file name.
 */
export function inferFormat(pathish: string): Format | undefined {
    const ext = pathish
        .split("?")[0]
        .split("#")[0]
        .split(".")
        .pop()
        ?.toLowerCase();

    switch (ext) {
        case "parquet":
            return "parquet";
        case "arrow":
        case "feather":
        case "lz4":
            return "arrow";
        case "csv":
            return "csv";
        case "json":
            return "json";
        case "ndjson":
        case "jsonl":
            return "ndjson";
        default:
            return undefined;
    }
}

/**
 * A valid bare table name derived from a path or URL.
 *
 * @param pathish a URL, key or file name.
 */
export function deriveName(pathish: string): string {
    const base =
        pathish.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ??
        "source";

    const stem = base.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "_");
    return /^[A-Za-z_]/.test(stem) ? stem : `t_${stem}`;
}

/**
 * Replace a `<select>`'s options, keeping the selection when it survives.
 *
 * @param el the select to repopulate.
 * @param values the new option values.
 */
export function setOptions(el: HTMLSelectElement, values: readonly string[]) {
    const previous = el.value;
    el.innerHTML = options(values);
    if (values.includes(previous)) {
        el.value = previous;
    }
}
