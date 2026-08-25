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

export type EngineId = "perspective-server" | "duckdb-wasm";

export type SourceKind = "fetch" | "file" | "s3" | "generated" | "sql" | "eval";

export interface Source {
    /** App-local and stable; not the table name. */
    id: string;
    engine: EngineId;

    /** Qualified exactly as the owning client reports it. */
    table: string;
    label: string;
    kind: SourceKind;
}

const SOURCES = signal<Source[]>([]);
let NEXT_ID = 0;

export function nextSourceId(): string {
    return `source_${NEXT_ID++}`;
}

export function listSources(): Source[] {
    return SOURCES.get();
}

/**
 * Register a source and notify every subscriber.
 *
 * @param source the newly created source.
 */
export function addSource(source: Source) {
    SOURCES.set([...SOURCES.get(), source]);
}

/**
 * Forget a source and notify every subscriber.
 *
 * @param id the source's app-local id.
 */
export function removeSource(id: string) {
    const next = SOURCES.get().filter((s) => s.id !== id);
    if (next.length < SOURCES.get().length) {
        SOURCES.set(next);
    }
}

/**
 * Subscribe to source changes, invoked immediately with the current list.
 *
 * @param listener called with a snapshot on every change.
 */
export function subscribeSources(
    listener: (sources: Source[]) => void,
): () => void {
    return SOURCES.subscribe(listener);
}
