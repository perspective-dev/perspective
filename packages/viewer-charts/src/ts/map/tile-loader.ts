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

import type { TileSource } from "./tile-source";

/**
 * One in-flight tile fetch. The same key (z/x/y under one source) only
 * launches one fetch; concurrent requesters share the promise.
 */
interface InFlight {
    promise: Promise<ImageBitmap | null>;
    abort: AbortController;
}

/**
 * Async tile fetcher with in-flight dedup and abort-on-zoom-change.
 *
 * Runs inside the renderer worker (the chart's host process). `fetch`
 * and `createImageBitmap` are both available in workers, and the
 * resulting `ImageBitmap` can be uploaded straight to a WebGL2 texture
 * via `gl.texImage2D(..., ImageBitmap)` — no main-thread bounce.
 *
 * The loader does not own GPU resources. Upload to texture happens in
 * the tile layer once an `ImageBitmap` resolves; the layer then drops
 * the bitmap (calling `close()` to free the decoded pixels).
 */
export class TileLoader {
    private _inFlight = new Map<string, InFlight>();
    private _onLoad: () => void = () => {};

    /**
     * Register the "tile arrived" callback. The layer wires this to
     * `chart.requestRender(glManager)` so a newly-loaded tile triggers
     * exactly one extra frame.
     */
    setOnLoad(cb: () => void): void {
        this._onLoad = cb;
    }

    /**
     * Kick off a fetch (or return the in-flight one). The same
     * (source.id, z, x, y) tuple only ever has one outstanding
     * fetch; multiple callers share the result. Rejected fetches
     * (network error, abort) resolve to `null` so callers can skip
     * the tile without try/catch noise on every miss.
     */
    load(
        source: TileSource,
        z: number,
        x: number,
        y: number,
    ): Promise<ImageBitmap | null> {
        const key = tileKey(source.id, z, x, y);
        const existing = this._inFlight.get(key);
        if (existing) {
            return existing.promise;
        }

        const abort = new AbortController();
        const url = source.urlFor(z, x, y);
        const promise = this._fetchAndDecode(url, abort.signal)
            .then((bmp) => {
                this._inFlight.delete(key);
                if (bmp) {
                    this._onLoad();
                }

                return bmp;
            })
            .catch(() => {
                this._inFlight.delete(key);
                return null;
            });

        this._inFlight.set(key, { promise, abort });
        return promise;
    }

    /**
     * Abort every in-flight fetch. Called on view teardown / chart
     * destroy. Fetches whose `Response` has already arrived but
     * haven't yet decoded will still complete the decode and resolve
     * to `null` (because `_onLoad` is replaced or the cache is gone)
     * — harmless, no resource leak.
     */
    cancelAll(): void {
        for (const entry of this._inFlight.values()) {
            entry.abort.abort();
        }

        this._inFlight.clear();
    }

    /**
     * Abort just the fetches whose key isn't in the supplied set.
     * The layer calls this on every render with the currently-visible
     * tile set so old-zoom requests don't keep arriving and triggering
     * spurious re-renders after the user has moved on.
     */
    cancelExcept(liveKeys: Set<string>): void {
        for (const [key, entry] of this._inFlight) {
            if (!liveKeys.has(key)) {
                entry.abort.abort();
                this._inFlight.delete(key);
            }
        }
    }

    private async _fetchAndDecode(
        url: string,
        signal: AbortSignal,
    ): Promise<ImageBitmap | null> {
        const resp = await fetch(url, { signal });
        if (!resp.ok) {
            return null;
        }

        const blob = await resp.blob();
        return await createImageBitmap(blob);
    }
}

/**
 * Stable cache key for a tile under a given source. Embedded source id
 * so swapping sources (light/dark) doesn't surface stale tiles.
 */
export function tileKey(
    sourceId: string,
    z: number,
    x: number,
    y: number,
): string {
    return `${sourceId}/${z}/${x}/${y}`;
}
