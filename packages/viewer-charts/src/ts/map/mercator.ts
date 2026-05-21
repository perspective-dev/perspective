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
 * Web Mercator projection helpers and XYZ tile-pyramid math. Pure
 * functions, no side effects, safe to call from any thread (including
 * the renderer worker).
 *
 * Mercator output is in *meters*, not the normalized [0, 1] form that
 * some libraries use. We feed the meter values straight into the
 * cartesian projection matrix in `plot-layout.ts`, so the upstream
 * domain stays in physical units and per-pixel ground resolution is a
 * straightforward division.
 */

/**
 * WGS84 equatorial radius in meters. Matches what every standard tile
 * provider (OSM, CartoDB, Mapbox, ...) uses for Web Mercator.
 */
export const EARTH_RADIUS_M = 6378137;

/**
 * Half the world extent in Mercator meters: π · R ≈ 20037508.34. The
 * full Mercator square is `[-WORLD_HALF, +WORLD_HALF]` on both axes.
 */
export const WORLD_HALF = Math.PI * EARTH_RADIUS_M;

/**
 * Maximum absolute latitude representable in Web Mercator. Beyond this
 * the projection diverges to ±∞; tile providers don't ship tiles
 * outside [-MAX_LAT, +MAX_LAT]. Computed as
 * `atan(sinh(π)) · 180 / π ≈ 85.0511287798°`.
 */
export const MAX_LAT = 85.0511287798066;

/**
 * Project (longitude, latitude) in degrees to Web Mercator meters.
 *
 * Latitudes outside ±MAX_LAT return `[NaN, NaN]` so callers in the
 * cartesian build path (which already has a post-`projectPoint` NaN
 * guard) discard those rows without special-casing.
 */
export function lonLatToMercator(lon: number, lat: number): [number, number] {
    if (lat > MAX_LAT || lat < -MAX_LAT) {
        return [NaN, NaN];
    }

    const x = (lon * Math.PI * EARTH_RADIUS_M) / 180;
    const latRad = (lat * Math.PI) / 180;
    const y = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return [x, y];
}

/**
 * Inverse: Mercator meters → (lon, lat) in degrees. Used by tooltip
 * formatting and any UI that surfaces the cursor position to the user.
 */
export function mercatorToLonLat(x: number, y: number): [number, number] {
    const lon = (x * 180) / (Math.PI * EARTH_RADIUS_M);
    const lat = (Math.atan(Math.exp(y / EARTH_RADIUS_M)) * 360) / Math.PI - 90;
    return [lon, lat];
}

/**
 * A single XYZ tile address.
 */
export interface TileId {
    z: number;
    x: number;
    y: number;
}

/**
 * Mercator extent in meters of one XYZ tile. Y is in the Mercator
 * convention (north positive), not the tile-pyramid convention (y=0
 * at the top); the conversion is done inside the helper.
 */
export interface TileExtent {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
}

/**
 * Return the Mercator-meter bounds of an XYZ tile. Tile (0, 0) at
 * zoom 0 covers `[-WORLD_HALF, +WORLD_HALF]` on both axes — the whole
 * world. Each zoom level subdivides into `2^z × 2^z` equal squares.
 */
export function tileExtent(z: number, x: number, y: number): TileExtent {
    const n = 1 << z;
    const tileSize = (2 * WORLD_HALF) / n;
    const xMin = -WORLD_HALF + x * tileSize;
    const xMax = xMin + tileSize;
    // Tile y=0 sits at the *top* of the pyramid (north), so flip.
    const yMax = WORLD_HALF - y * tileSize;
    const yMin = yMax - tileSize;
    return { xMin, yMin, xMax, yMax };
}

/**
 * Pick the integer zoom level whose tile pixel resolution best matches
 * the requested Mercator-meters-per-pixel. Snaps to the next coarser
 * level so we never undersample (a finer level would fetch tiles only
 * to scale them down).
 *
 * `targetResolutionMpp` is meters per *device pixel*; the caller
 * computes it as `(domain.xMax - domain.xMin) / plotRect.width`.
 */
export function pickZoom(
    targetResolutionMpp: number,
    tileSizePx = 256,
    maxZoom = 19,
): number {
    if (!isFinite(targetResolutionMpp) || targetResolutionMpp <= 0) {
        return 0;
    }

    // Resolution at zoom z = (2·WORLD_HALF) / (tileSizePx · 2^z).
    // Solve for z; floor so we stay at the next coarser level when in
    // between two levels.
    const z = Math.log2((2 * WORLD_HALF) / (tileSizePx * targetResolutionMpp));
    return Math.max(0, Math.min(maxZoom, Math.floor(z)));
}

/**
 * Enumerate every visible tile at a single zoom level that intersects
 * the given Mercator extent. Returned in left-to-right, top-to-bottom
 * order so the layer's render loop produces a deterministic draw
 * sequence (helps with debugging tile-load races).
 *
 * Tiles outside the world's `[0, 2^z)` X range are *not* wrapped —
 * antimeridian wraparound is a v2 feature. Callers see a gap when
 * panning past ±180° lon; tiles inside the valid range still render.
 */
export function tilesForExtent(extent: TileExtent, z: number): TileId[] {
    const n = 1 << z;
    const tileSize = (2 * WORLD_HALF) / n;

    // Tile X grows east; tile Y grows south. Convert the extent's
    // bounds accordingly.
    const xMinTile = Math.floor((extent.xMin + WORLD_HALF) / tileSize);
    const xMaxTile = Math.floor((extent.xMax + WORLD_HALF) / tileSize);
    const yMinTile = Math.floor((WORLD_HALF - extent.yMax) / tileSize);
    const yMaxTile = Math.floor((WORLD_HALF - extent.yMin) / tileSize);

    const result: TileId[] = [];
    for (let ty = yMinTile; ty <= yMaxTile; ty++) {
        if (ty < 0 || ty >= n) {
            continue;
        }

        for (let tx = xMinTile; tx <= xMaxTile; tx++) {
            if (tx < 0 || tx >= n) {
                continue;
            }

            result.push({ z, x: tx, y: ty });
        }
    }

    return result;
}

/**
 * Return the parent tile (one zoom level coarser) of the given tile,
 * along with the [0, 1] UV sub-rect that this tile occupies inside
 * its parent. Used by the layer's "draw what we have" fallback while
 * a missing target tile is in-flight — the parent texture is sampled
 * with the sub-rect so the visible region keeps tile-aligned content
 * instead of flashing blank.
 *
 * Returns `null` for zoom-0 tiles (no parent).
 */
export function parentTile(tile: TileId): {
    parent: TileId;
    uvMin: [number, number];
    uvMax: [number, number];
} | null {
    if (tile.z <= 0) {
        return null;
    }

    const parent: TileId = {
        z: tile.z - 1,
        x: tile.x >> 1,
        y: tile.y >> 1,
    };

    const u = tile.x & 1;
    const v = tile.y & 1;
    const uvMin: [number, number] = [u * 0.5, v * 0.5];
    const uvMax: [number, number] = [uvMin[0] + 0.5, uvMin[1] + 0.5];
    return { parent, uvMin, uvMax };
}
