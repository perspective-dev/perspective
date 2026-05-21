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
 * Bounded LRU of `WebGLTexture` keyed by tile cache key (see
 * `tile-loader.tileKey`). Evicts least-recently-touched entries on
 * insert past `capacity`, deleting their GPU textures.
 *
 * Default capacity of 256 is enough to cover a full screen worth of
 * tiles at zoom-1 jumps either side of the current viewport plus the
 * parent fallbacks — at 256×256 RGBA that's ~64 MB of texture memory,
 * which sits comfortably under the 256 MB headroom most browsers
 * grant to a tab.
 */
export class TileCache {
    private _entries = new Map<string, WebGLTexture>();
    private readonly _capacity: number;

    constructor(capacity = 256) {
        this._capacity = capacity;
    }

    /**
     * Fetch a texture by key. Touching an existing entry moves it to
     * the LRU tail so it survives the next eviction sweep.
     */
    get(key: string): WebGLTexture | undefined {
        const tex = this._entries.get(key);
        if (tex !== undefined) {
            // Re-insert to push the entry to the tail.
            this._entries.delete(key);
            this._entries.set(key, tex);
        }

        return tex;
    }

    /**
     * Insert a texture under `key`. If the cache is at capacity, evict
     * the oldest entry first (calling `gl.deleteTexture` on its GPU
     * resource).
     */
    set(
        gl: WebGL2RenderingContext | WebGLRenderingContext,
        key: string,
        texture: WebGLTexture,
    ): void {
        if (this._entries.has(key)) {
            const old = this._entries.get(key)!;
            gl.deleteTexture(old);
            this._entries.delete(key);
        }

        this._entries.set(key, texture);
        while (this._entries.size > this._capacity) {
            const oldestKey = this._entries.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }

            const tex = this._entries.get(oldestKey)!;
            gl.deleteTexture(tex);
            this._entries.delete(oldestKey);
        }
    }

    /**
     * Whether a key is resident. Used to gate the "kick off a fetch"
     * branch in the layer's render loop.
     */
    has(key: string): boolean {
        return this._entries.has(key);
    }

    /**
     * Release every texture. Called on chart destroy. Safe to call
     * with a stale `gl` reference (no-op if `deleteTexture` rejects),
     * but in practice the caller passes the still-live worker context.
     */
    dispose(gl: WebGL2RenderingContext | WebGLRenderingContext): void {
        for (const tex of this._entries.values()) {
            gl.deleteTexture(tex);
        }

        this._entries.clear();
    }
}
