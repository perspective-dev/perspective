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

import TILE_SOURCE_SEED from "./tile-sources.json";

/**
 * A tile source describes *where* to fetch raster XYZ tiles and what
 * attribution text the renderer must display in the chrome canvas.
 * Implementations are stateless — the tile loader handles caching and
 * in-flight dedup.
 */
export interface TileSource {
    /**
     * Build the URL for tile (z, x, y). Implementations typically
     * substitute a template like `{z}/{x}/{y}` and may rotate
     * subdomains for browsers that throttle concurrent connections
     * per host.
     */
    urlFor(z: number, x: number, y: number): string;

    /**
     * Plain-text attribution shown in the bottom-right of the chrome
     * canvas. Required by every major tile provider's terms of use —
     * do not suppress it without provider-side opt-out.
     */
    readonly attribution: string;

    /**
     * Side length of one tile in pixels. Tile providers ship 256 by
     * default; a few offer 512 (`@2x`) variants. Used by the zoom-
     * level picker to convert meters-per-pixel into a zoom level.
     */
    readonly tileSize: number;

    /**
     * Maximum zoom level the provider serves. Tiles requested above
     * this fall back to the deepest available level with sub-tile
     * UVs — same trick used during async loads.
     */
    readonly maxZoom: number;

    /**
     * Stable identifier for caching. Two `TileSource` instances with
     * the same `id` share a tile cache; switching source (e.g. theme
     * change) invalidates and re-fetches.
     */
    readonly id: string;
}

/**
 * Subdomain-rotated URL template. Replaces `{s}` with one of the
 * provided subdomains hashed by `(x + y)`, and `{z}`, `{x}`, `{y}`
 * with the tile address. Most major tile providers fit this shape.
 */
export class TemplatedTileSource implements TileSource {
    constructor(
        readonly id: string,
        private readonly template: string,
        readonly attribution: string,
        readonly tileSize = 256,
        readonly maxZoom = 19,
        private readonly subdomains: readonly string[] = [],
    ) {}

    urlFor(z: number, x: number, y: number): string {
        let url = this.template
            .replace("{z}", String(z))
            .replace("{x}", String(x))
            .replace("{y}", String(y));
        if (this.subdomains.length > 0) {
            const idx = (x + y) % this.subdomains.length;
            url = url.replace("{s}", this.subdomains[idx]);
        }

        return url;
    }
}

/**
 * Declarative description of one raster XYZ tile provider — the shape
 * of an entry in [tile-sources.json] and of the argument to
 * `registerTileSource`. Everything the renderer needs to construct a
 * concrete {@link TileSource} lives here; the TypeScript is generic
 * over these entries and hardcodes no provider URLs.
 */
export interface TileSourceSpec {
    /** Registry key; the persisted `map_tile_provider` value. */
    readonly id: string;

    /** Human-readable enum-variant label on the settings panel. */
    readonly label: string;

    /**
     * URL template with `{z}`/`{x}`/`{y}` placeholders and optional
     * `{s}` subdomain rotation. A provider that needs an API key
     * embeds it directly in the template it registers — keys never
     * pass through `plugin_config`, so they never appear in `save()`
     * output.
     */
    readonly template: string;

    /** `{s}` rotation pool; required non-empty iff `template` has `{s}`. */
    readonly subdomains: readonly string[];

    /** See {@link TileSource.attribution}. */
    readonly attribution: string;

    /** See {@link TileSource.tileSize}. Default 256. */
    readonly tile_size: number;

    /** See {@link TileSource.maxZoom}. Default 19. */
    readonly max_zoom: number;
}

/**
 * Validate + normalize an untrusted spec (a JSON entry or a
 * `registerTileSource` argument). Throws `TypeError` naming the
 * offending field; returns a frozen spec with defaults applied.
 */
export function parseTileSourceSpec(input: unknown): TileSourceSpec {
    if (typeof input !== "object" || input === null) {
        throw new TypeError("TileSourceSpec must be an object");
    }

    const raw = input as Record<string, unknown>;
    const str = (key: string): string => {
        const v = raw[key];
        if (typeof v !== "string" || v.length === 0) {
            throw new TypeError(
                `TileSourceSpec.${key} must be a non-empty string`,
            );
        }

        return v;
    };

    const id = str("id");
    const label = str("label");
    const template = str("template");
    const attribution = str("attribution");
    for (const placeholder of ["{z}", "{x}", "{y}"]) {
        if (!template.includes(placeholder)) {
            throw new TypeError(
                `TileSourceSpec.template must contain "${placeholder}"`,
            );
        }
    }

    const rawSubdomains = raw["subdomains"] ?? [];
    if (
        !Array.isArray(rawSubdomains) ||
        rawSubdomains.some((s) => typeof s !== "string" || s.length === 0)
    ) {
        throw new TypeError(
            "TileSourceSpec.subdomains must be an array of non-empty strings",
        );
    }

    const subdomains = Object.freeze([...rawSubdomains] as string[]);
    if (template.includes("{s}") && subdomains.length === 0) {
        throw new TypeError(
            'TileSourceSpec.template uses "{s}" but no subdomains were given',
        );
    }

    const num = (key: string, dflt: number): number => {
        const v = raw[key];
        if (v === undefined) {
            return dflt;
        }

        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
            throw new TypeError(
                `TileSourceSpec.${key} must be a positive number`,
            );
        }

        return v;
    };

    return Object.freeze({
        id,
        label,
        template,
        subdomains,
        attribution,
        tile_size: num("tile_size", 256),
        max_zoom: num("max_zoom", 19),
    });
}

/**
 * 32-bit FNV-1a over a string, hex-encoded. Fingerprints a spec's
 * fetch-relevant fields into the {@link TileSource.id} cache key.
 */
function fnv1a(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return (h >>> 0).toString(16);
}

/**
 * The set of known tile providers: the bundled entries from
 * [tile-sources.json] plus any registered at runtime via
 * `registerTileSource`. One instance exists per JS realm ({@link
 * TILE_SOURCES}) — the plugin realm's is the source of truth for the
 * settings-panel enum; the worker realm's resolves ids at render time.
 * The realms need no eager mirroring: every `setPluginConfig` / `init`
 * control message carries the resolved spec for the config's
 * `map_tile_provider` alongside the config itself, so a worker can
 * never hold a config whose spec it lacks.
 */
export class TileSourceRegistry {
    private _specs = new Map<string, TileSourceSpec>();

    constructor(seed: readonly unknown[]) {
        for (const entry of seed) {
            const spec = parseTileSourceSpec(entry);
            this._specs.set(spec.id, spec);
        }
    }

    /**
     * Add (or replace, by id) a provider. Validates via
     * {@link parseTileSourceSpec} and returns the normalized spec.
     * Replacement is safe for live charts: the cache identity below is
     * content-derived, so a changed template yields a new cache key
     * and the tile layer drops its stale textures on next bind.
     */
    register(input: unknown): TileSourceSpec {
        const spec = parseTileSourceSpec(input);
        this._specs.set(spec.id, spec);
        return spec;
    }

    /** Every known spec, bundled first, in insertion order. */
    list(): readonly TileSourceSpec[] {
        return [...this._specs.values()];
    }

    /** The spec registered under `id`, or `undefined` if unknown. */
    specFor(id: string): TileSourceSpec | undefined {
        return this._specs.get(id);
    }

    /**
     * Resolve a `map_tile_provider` id to a concrete `TileSource`.
     * Unknown ids fall back to the first bundled entry so a
     * misconfigured `plugin_config` never produces a blank map — and
     * so a config restored *before* its custom source is registered
     * degrades to the default basemap until the next config forward
     * carries the registered spec.
     */
    sourceFor(id: string): TileSource {
        const spec = this._specs.get(id) ?? this._specs.values().next().value!;

        // Cache identity = id + content hash of the fetch-relevant
        // fields. Re-registering an id with a different template MUST
        // invalidate `TileCache` entries (keyed on `TileSource.id`)
        // or stale tiles from the old URL would keep rendering; the
        // hash does that without any cross-realm revision state.
        const fingerprint = fnv1a(
            `${spec.template} ${spec.subdomains.join(",")}`,
        );

        return new TemplatedTileSource(
            `${spec.id}@${fingerprint}`,
            spec.template,
            spec.attribution,
            spec.tile_size,
            spec.max_zoom,
            spec.subdomains,
        );
    }
}

/**
 * Realm-wide provider registry, seeded from [tile-sources.json]. A
 * malformed bundled entry fails loudly here, at first import.
 */
export const TILE_SOURCES = new TileSourceRegistry(TILE_SOURCE_SEED);

/**
 * Read-only listing of every known tile provider (bundled + runtime-
 * registered), in settings-panel enum order. Public package export.
 */
export function tileSources(): readonly TileSourceSpec[] {
    return TILE_SOURCES.list();
}
