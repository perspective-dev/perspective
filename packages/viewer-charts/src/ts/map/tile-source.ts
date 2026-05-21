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
 * Identifier of the default tile providers shipped with `viewer-charts`.
 * Surfaced as the `map_tile_provider` PluginConfig enum so users can
 * pick light vs. dark vs. labels-only without writing a custom source.
 */
export type TileProviderId =
    | "carto-positron"
    | "carto-dark-matter"
    | "carto-voyager";

/**
 * CartoDB's "Positron" basemap — light, low-contrast, designed to sit
 * behind a chart overlay. Default for light themes.
 */
function cartoPositron(): TileSource {
    return new TemplatedTileSource(
        "carto-positron",
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "© OpenStreetMap contributors © CARTO",
        256,
        19,
        ["a", "b", "c", "d"],
    );
}

/**
 * CartoDB's "Dark Matter" basemap — dark, low-contrast. Default for
 * dark themes.
 */
function cartoDarkMatter(): TileSource {
    return new TemplatedTileSource(
        "carto-dark-matter",
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "© OpenStreetMap contributors © CARTO",
        256,
        19,
        ["a", "b", "c", "d"],
    );
}

/**
 * CartoDB's "Voyager" basemap — full color, more land/water contrast
 * than Positron. Good when the chart glyphs are translucent.
 */
function cartoVoyager(): TileSource {
    return new TemplatedTileSource(
        "carto-voyager",
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "© OpenStreetMap contributors © CARTO",
        256,
        19,
        ["a", "b", "c", "d"],
    );
}

/**
 * Resolve a `TileProviderId` (from PluginConfig) to a concrete
 * `TileSource`. Unknown ids fall back to Positron so a misconfigured
 * `_pluginConfig` never produces a blank map.
 */
export function tileSourceFor(id: TileProviderId | string): TileSource {
    switch (id) {
        case "carto-dark-matter":
            return cartoDarkMatter();
        case "carto-voyager":
            return cartoVoyager();
        case "carto-positron":
        default:
            return cartoPositron();
    }
}
