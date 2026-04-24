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

import type { View } from "@perspective-dev/client";

/**
 * A single row's column values, keyed by column name. Numeric columns
 * yield a `number`; string (dictionary) columns yield the decoded
 * `string`; invalid (null) cells yield `null`.
 */
export type LazyRow = Map<string, string | number | null>;

const DEFAULT_CACHE_SIZE = 128;

/**
 * On-demand single-row fetcher backing lazy tooltip lookups. Given a
 * view row index, performs `view.with_typed_arrays({start_row, end_row:
 * start_row+1})` and projects the result into a plain `Map`. Concurrent
 * fetches for the same index are deduped into one Promise; resolved
 * rows are cached in a bounded LRU keyed by rowIdx.
 *
 * Invalidation is lifecycle-driven: the owning chart disposes and
 * constructs a new fetcher whenever its underlying view changes (i.e.
 * on each `draw`). In-flight fetches from the prior fetcher still
 * resolve, but callers stamp each fetch with a serial and discard
 * results whose serial no longer matches — so stale rows never reach
 * the tooltip. See the per-chart hover/pin paths for that plumbing.
 */
export class LazyRowFetcher {
    private _view: View | null;
    private _cache: Map<number, LazyRow> = new Map();
    private _inFlight: Map<number, Promise<LazyRow>> = new Map();
    private readonly _maxCacheSize: number;

    constructor(view: View, maxCacheSize: number = DEFAULT_CACHE_SIZE) {
        this._view = view;
        this._maxCacheSize = maxCacheSize;
    }

    async fetchRow(rowIdx: number): Promise<LazyRow> {
        if (!this._view) throw new Error("LazyRowFetcher disposed");
        const cached = this._cache.get(rowIdx);
        if (cached) {
            // LRU touch: re-insert to move to tail.
            this._cache.delete(rowIdx);
            this._cache.set(rowIdx, cached);
            return cached;
        }
        const inflight = this._inFlight.get(rowIdx);
        if (inflight) return inflight;

        const p = this._fetch(rowIdx);
        this._inFlight.set(rowIdx, p);
        try {
            const result = await p;
            if (!this._view) return result; // disposed mid-flight
            this._cache.set(rowIdx, result);
            if (this._cache.size > this._maxCacheSize) {
                const oldest = this._cache.keys().next().value;
                if (oldest !== undefined) this._cache.delete(oldest);
            }
            return result;
        } finally {
            this._inFlight.delete(rowIdx);
        }
    }

    private async _fetch(rowIdx: number): Promise<LazyRow> {
        const view = this._view;
        if (!view) throw new Error("LazyRowFetcher disposed");
        const row: LazyRow = new Map();
        await (view as any).with_typed_arrays(
            {
                start_row: rowIdx,
                end_row: rowIdx + 1,
                float32: true,
            },
            (
                names: string[],
                values: ArrayLike<number>[],
                validities: (Uint8Array | null)[],
                dictionaries: (string[] | null)[],
            ) => {
                for (let i = 0; i < names.length; i++) {
                    const name = names[i];
                    if (name.startsWith("__")) continue;
                    const vals = values[i];
                    const valid = validities[i];
                    const dict = dictionaries[i];
                    const isInvalid = valid ? !((valid[0] >> 0) & 1) : false;
                    if (isInvalid) {
                        row.set(name, null);
                    } else if (dict) {
                        row.set(name, dict[vals[0] as number]);
                    } else {
                        row.set(name, vals[0] as number);
                    }
                }
            },
        );
        return row;
    }

    dispose(): void {
        this._view = null;
        this._cache.clear();
        this._inFlight.clear();
    }

    get isDisposed(): boolean {
        return this._view === null;
    }
}
