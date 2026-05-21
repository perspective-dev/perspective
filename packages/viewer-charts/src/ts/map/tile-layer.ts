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

import type { WebGLContextManager } from "../webgl/context-manager";
import type { PlotLayout } from "../layout/plot-layout";
import { pickZoom, tilesForExtent, tileExtent, type TileId } from "./mercator";
import { TileCache } from "./tile-cache";
import { TileLoader, tileKey } from "./tile-loader";
import type { TileSource } from "./tile-source";
import tileVert from "../shaders/tile.vert.glsl";
import tileFrag from "../shaders/tile.frag.glsl";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface TileProgramCache {
    program: WebGLProgram;
    u_projection: WebGLUniformLocation | null;
    u_extent_min: WebGLUniformLocation | null;
    u_extent_max: WebGLUniformLocation | null;
    u_uv_min: WebGLUniformLocation | null;
    u_uv_max: WebGLUniformLocation | null;
    u_tile: WebGLUniformLocation | null;
    u_alpha: WebGLUniformLocation | null;
    a_corner: number;
}

/**
 * Renders an XYZ raster tile basemap into the chart's webgl canvas
 * inside the plot rect's scissor. Used by `MapChart` from inside
 * `renderInPlotFrame`, before the glyph draw, so chart glyphs (point,
 * line, density) composite naturally on top of the basemap.
 *
 * The layer owns:
 *   - The tile shader program (compiled once per WebGL context).
 *   - A unit-quad corner buffer (one 2-byte attribute, reused per
 *     tile).
 *   - A `TileCache` (LRU of `WebGLTexture`).
 *   - A `TileLoader` (async fetch + dedup).
 *
 * On each render: pick the integer zoom that matches the requested
 * meters-per-pixel, enumerate visible tiles at that zoom, and draw
 * each one — either with the loaded texture or with a parent
 * texture's sub-rect while the target is in flight.
 */
export class TileLayer {
    private _program: TileProgramCache | null = null;
    private _cornerBuffer: WebGLBuffer | null = null;
    private _cache = new TileCache();
    private _loader = new TileLoader();
    private _source: TileSource | null = null;
    private _alpha = 1.0;
    private _onTileLoad: () => void = () => {};

    /**
     * Hook the "tile arrived" notification through to the chart's
     * render scheduler. Called once when the layer is constructed
     * by `MapChart`.
     */
    setOnTileLoad(cb: () => void): void {
        this._onTileLoad = cb;
        this._loader.setOnLoad(cb);
    }

    /**
     * Swap the tile source (e.g. light ↔ dark theme). Drops the cache
     * because the cached textures came from the prior source's URLs.
     */
    setSource(gl: GL, source: TileSource): void {
        if (this._source?.id === source.id) {
            return;
        }

        this._cache.dispose(gl);
        this._loader.cancelAll();
        this._source = source;
    }

    setAlpha(alpha: number): void {
        this._alpha = Math.max(0, Math.min(1, alpha));
    }

    get source(): TileSource | null {
        return this._source;
    }

    /**
     * Render the basemap for the current visible Mercator extent.
     * Caller is responsible for binding the chart's main framebuffer
     * (the plot-frame scissor is already in place by the time we get
     * here). The same `projection` matrix the glyph draw uses is
     * passed straight through.
     */
    render(
        glManager: WebGLContextManager,
        layout: PlotLayout,
        projection: Float32Array,
        domain: { xMin: number; xMax: number; yMin: number; yMax: number },
        xOrigin: number,
        yOrigin: number,
    ): void {
        const source = this._source;
        if (!source) {
            return;
        }

        this._ensureProgram(glManager);
        const prog = this._program;
        const cornerBuf = this._cornerBuffer;
        if (!prog || !cornerBuf) {
            return;
        }

        const gl = glManager.gl;
        const dpr = glManager.dpr;
        const plotWidth = Math.max(1, layout.plotRect.width * dpr);
        const xRange = domain.xMax - domain.xMin;
        if (!isFinite(xRange) || xRange <= 0) {
            return;
        }

        const mpp = xRange / plotWidth;
        const z = pickZoom(mpp, source.tileSize, source.maxZoom);
        const visible = tilesForExtent(domain, z);

        // Cancel any in-flight fetches for old zooms / off-screen
        // tiles. We compute the live key set up-front so the loader
        // doesn't keep tickling `requestRender` after the user pans
        // past a slow-loading region.
        const liveKeys = new Set<string>();
        for (const t of visible) {
            liveKeys.add(tileKey(source.id, t.z, t.x, t.y));
        }

        this._loader.cancelExcept(liveKeys);

        // Setup the shader program + static unit-quad buffer once per
        // frame. Inside the loop only the per-tile uniforms change.
        gl.useProgram(prog.program);
        gl.uniformMatrix4fv(prog.u_projection, false, projection);
        gl.uniform1f(prog.u_alpha, this._alpha);
        gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
        gl.enableVertexAttribArray(prog.a_corner);
        gl.vertexAttribPointer(prog.a_corner, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(prog.u_tile, 0);

        // Tiles are opaque; use the simplest blend mode so the
        // glyph layer (drawn next in `_fullRender`) lands on top
        // naturally without weird premultiplied tricks.
        const wasBlend = gl.isEnabled(gl.BLEND);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        for (const tile of visible) {
            this._drawTile(gl, prog, source, tile, xOrigin, yOrigin);
        }

        if (!wasBlend) {
            gl.disable(gl.BLEND);
        }
    }

    /**
     * Free every GPU resource. Called from `MapChart.destroyInternal`.
     */
    destroy(gl: GL): void {
        this._loader.cancelAll();
        this._cache.dispose(gl);
        if (this._cornerBuffer) {
            gl.deleteBuffer(this._cornerBuffer);
            this._cornerBuffer = null;
        }

        this._program = null;
    }

    private _drawTile(
        gl: GL,
        prog: TileProgramCache,
        source: TileSource,
        tile: TileId,
        xOrigin: number,
        yOrigin: number,
    ): void {
        // Subtract the chart's rebase origin so the position matches
        // the convention glyphs use (`_xData = absX - xOrigin`). The
        // shared projection matrix bakes in `xOrigin/yOrigin` and
        // would otherwise shift tiles by `sx*xOrigin` clip units —
        // for Mercator-scale origins (~1e7 m), well off-screen.
        const rawExtent = tileExtent(tile.z, tile.x, tile.y);
        const extent = {
            xMin: rawExtent.xMin - xOrigin,
            xMax: rawExtent.xMax - xOrigin,
            yMin: rawExtent.yMin - yOrigin,
            yMax: rawExtent.yMax - yOrigin,
        };
        const key = tileKey(source.id, tile.z, tile.x, tile.y);

        const tex = this._cache.get(key);
        if (tex) {
            this._issueDraw(gl, prog, tex, extent, [0, 0], [1, 1]);
            return;
        }

        // Cache miss: kick off async load (idempotent — loader dedups).
        // No await — we paint a fallback this frame and the chart will
        // re-render when the texture arrives.
        this._kickLoad(gl, source, tile);

        // Walk up the pyramid up to 6 levels looking for any loaded
        // ancestor. Each level halves the UV sub-rect that the target
        // tile occupies inside the ancestor; the math is direct from
        // the tile coordinate bit-shift, no recursive accumulation.
        for (let dz = 1; dz <= 6; dz++) {
            const az = tile.z - dz;
            if (az < 0) {
                return;
            }

            const ax = tile.x >> dz;
            const ay = tile.y >> dz;
            const ancestorKey = tileKey(source.id, az, ax, ay);
            const ancestorTex = this._cache.get(ancestorKey);
            if (!ancestorTex) {
                continue;
            }

            const n = 1 << dz;
            const localX = tile.x - ax * n;
            const localY = tile.y - ay * n;
            const span = 1 / n;
            const uvMin: [number, number] = [localX * span, localY * span];
            const uvMax: [number, number] = [uvMin[0] + span, uvMin[1] + span];
            this._issueDraw(gl, prog, ancestorTex, extent, uvMin, uvMax);
            return;
        }
    }

    private _issueDraw(
        gl: GL,
        prog: TileProgramCache,
        tex: WebGLTexture,
        extent: { xMin: number; yMin: number; xMax: number; yMax: number },
        uvMin: [number, number],
        uvMax: [number, number],
    ): void {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform2f(prog.u_extent_min, extent.xMin, extent.yMin);
        gl.uniform2f(prog.u_extent_max, extent.xMax, extent.yMax);
        gl.uniform2f(prog.u_uv_min, uvMin[0], uvMin[1]);
        gl.uniform2f(prog.u_uv_max, uvMax[0], uvMax[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    private _kickLoad(gl: GL, source: TileSource, tile: TileId): void {
        const key = tileKey(source.id, tile.z, tile.x, tile.y);
        if (this._cache.has(key)) {
            return;
        }

        this._loader.load(source, tile.z, tile.x, tile.y).then((bmp) => {
            if (!bmp) {
                return;
            }

            // The chart may have switched sources between launch and
            // resolve; drop the bitmap if so.
            if (this._source?.id !== source.id) {
                bmp.close();
                return;
            }

            const tex = gl.createTexture();
            if (!tex) {
                bmp.close();
                return;
            }

            // Anchor the upload to a known texture unit. Without
            // this the upload binds to whatever unit was last
            // active (gradient LUT lives at TEXTURE2, etc.), which
            // is harmless for the upload itself but easy to confuse
            // with the sampling path during debugging.
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_S,
                gl.CLAMP_TO_EDGE,
            );
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_T,
                gl.CLAMP_TO_EDGE,
            );

            // Pin pixel-store flags. Workers and main threads start
            // with the WebGL spec defaults, but other parts of the
            // chart (or future extensions) may flip
            // `UNPACK_PREMULTIPLY_ALPHA_WEBGL` or
            // `UNPACK_FLIP_Y_WEBGL` and not restore them. Set them
            // explicitly so the upload result is deterministic.
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                bmp,
            );

            // Do *not* `bmp.close()` here. The WebGL spec says
            // `texImage2D(ImageBitmap)` consumes the source at call
            // time, but several browser/driver combinations defer
            // the actual GPU copy until the next draw; closing the
            // bitmap before that copy lands leaves the texture
            // valid-but-empty and the sampler returns (0,0,0,1) —
            // i.e. solid black — for every tile after the first one
            // or two whose upload happened to drain in time. The
            // ImageBitmap is small (≤256×256×4 ≈ 256 KB) and will
            // be garbage-collected once the .then closure is
            // released.
            this._cache.set(gl, key, tex);
            this._onTileLoad();
        });
    }

    private _ensureProgram(glManager: WebGLContextManager): void {
        if (this._program && this._cornerBuffer) {
            return;
        }

        const gl = glManager.gl;
        const program = glManager.shaders.getOrCreate(
            "map-tile",
            tileVert,
            tileFrag,
        );

        this._program = {
            program,
            u_projection: gl.getUniformLocation(program, "u_projection"),
            u_extent_min: gl.getUniformLocation(program, "u_extent_min"),
            u_extent_max: gl.getUniformLocation(program, "u_extent_max"),
            u_uv_min: gl.getUniformLocation(program, "u_uv_min"),
            u_uv_max: gl.getUniformLocation(program, "u_uv_max"),
            u_tile: gl.getUniformLocation(program, "u_tile"),
            u_alpha: gl.getUniformLocation(program, "u_alpha"),
            a_corner: gl.getAttribLocation(program, "a_corner"),
        };

        const buf = gl.createBuffer();
        if (!buf) {
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        // Unit-quad corners in TRIANGLE_STRIP order:
        //   (0,0) (1,0) (0,1) (1,1)
        // Stretched into Mercator space by `u_extent_*` uniforms in
        // the vertex shader; UV picked by `u_uv_*`.
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
            gl.STATIC_DRAW,
        );
        this._cornerBuffer = buf;
    }
}
