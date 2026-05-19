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

import type { WebGLContextManager } from "../../../webgl/context-manager";
import type { CartesianChart } from "../cartesian";
import type { Glyph } from "../glyph";
import { bindGradientTexture } from "../../../webgl/gradient-texture";
import { getInstancing } from "../../../webgl/instanced-attrs";
import { buildPointRowTooltipLines } from "../tooltip-lines";
import splatVert from "../../../shaders/density-splat.vert.glsl";
import splatFrag from "../../../shaders/density-splat.frag.glsl";
import extremeFrag from "../../../shaders/density-extreme.frag.glsl";
import mrtVert from "../../../shaders/density-mrt.vert.glsl";
import mrtFrag from "../../../shaders/density-mrt.frag.glsl";
import resolveVert from "../../../shaders/density-resolve.vert.glsl";
import resolveFrag from "../../../shaders/density-resolve.frag.glsl";

/**
 * Integer mode identifiers shared with the resolve shader's
 * `u_color_mode` branch ladder. Keep these in sync with the
 * comparisons in `density-resolve.frag.glsl`.
 */
const MODE_DENSITY = 0;
const MODE_MEAN = 1;
const MODE_EXTREME = 2;
const MODE_SIGNED = 3;

type ColorMode = "mean" | "density" | "extreme" | "signed";

/**
 * Subset of `OES_draw_buffers_indexed` we touch. The official type
 * isn't in `lib.dom.d.ts`; everything we use is `iOES`-suffixed.
 */
interface IndexedBlendExt {
    blendEquationiOES(buf: number, mode: number): void;
    blendFunciOES(buf: number, src: number, dst: number): void;
    enableiOES(target: number, index: number): void;
    disableiOES(target: number, index: number): void;
}

interface SplatProgramCache {
    program: WebGLProgram;
    u_projection: WebGLUniformLocation | null;
    u_radius_ndc: WebGLUniformLocation | null;
    u_intensity: WebGLUniformLocation | null;
    u_color_range: WebGLUniformLocation | null;
    a_corner: number;
    a_position: number;
    a_color_value: number;
}

interface DensityCache {
    splat: SplatProgramCache;

    /**
     * Single-target splat program writing `(w, w·t, 0, 0)` into the
     * extreme FBO with MAX blend. Lazily compiled on first
     * `extreme`-mode render (when MRT is unavailable).
     */
    extremeSplat: SplatProgramCache | null;

    /**
     * Two-target MRT splat program for the `extreme` path on hardware
     * that advertises `OES_draw_buffers_indexed`. `gl_FragData[0]`
     * routes to the heat FBO (ADD blend), `gl_FragData[1]` to the
     * extreme FBO (MAX blend). Lazily compiled on first
     * `extreme`-mode render after the indexed-blend extension is
     * confirmed.
     */
    mrtSplat: SplatProgramCache | null;

    resolve: {
        program: WebGLProgram;
        u_heat: WebGLUniformLocation | null;
        u_extreme: WebGLUniformLocation | null;
        u_gradient_lut: WebGLUniformLocation | null;
        u_heat_max: WebGLUniformLocation | null;
        u_color_mode: WebGLUniformLocation | null;
        a_corner: number;
    };

    quadCornerBuffer: WebGLBuffer;
    tripleCornerBuffer: WebGLBuffer;

    /**
     * Heat (density / weighted-color) framebuffer + texture. R = Σw,
     * G = Σ(w·t). Always allocated.
     */
    heatTexture: WebGLTexture;
    heatFramebuffer: WebGLFramebuffer;

    /**
     * Extreme (signed-max deviation) framebuffer + texture. R holds the
     * MAX of positive deviation, G holds the MAX of negative deviation
     * magnitude. Lazily allocated the first time `extreme` mode runs;
     * `null` otherwise so the common case doesn't pay for a 4MB
     * float texture it never reads.
     */
    extremeTexture: WebGLTexture | null;
    extremeFramebuffer: WebGLFramebuffer | null;

    /**
     * MRT framebuffer with both `heatTexture` and `extremeTexture`
     * attached. Used only on the indexed-blend fast path; `null`
     * otherwise. Lazily allocated alongside `extremeTexture`.
     */
    mrtFramebuffer: WebGLFramebuffer | null;

    heatWidth: number;
    heatHeight: number;
    heatType: number;
    heatInternalFormat: number;
    heatFormat: number;

    /**
     * `true` when the heat FBO uses a true float (or half-float)
     * accumulation format. `signed` mode requires this; on the
     * `UNSIGNED_BYTE` fallback the signed-sum math is meaningless
     * (R and G saturate to 1 independently, so `G - 0.5·R` collapses
     * to a constant 0.5) and the glyph silently degrades to `mean`.
     */
    floatFbo: boolean;

    /**
     * Cached probe result for `OES_draw_buffers_indexed`. `null` until
     * the first `extreme`-mode draw, then either the extension object
     * (MRT path) or `false` (two-pass fallback).
     */
    indexedBlend: IndexedBlendExt | null | false;

    /**
     * `true` after `console.warn` has fired once for a `signed`-mode
     * downgrade on this glyph. Suppresses repeat noise across the
     * 60Hz render loop.
     */
    signedDowngradeWarned: boolean;

    robustBounds: {
        lo: number;
        hi: number;
        dataCount: number;
        colorName: string;
        colorIsString: boolean;
    } | null;
}

/**
 * Density-field glyph. Each cartesian row is rasterized as an additive
 * radial splat into an RGBA float FBO; a fullscreen pass resolves the
 * accumulated density (and optional color-weighted average) through the
 * chart's gradient LUT and composites the result inside the plot rect.
 *
 * The user-facing `gradient_color_mode` plugin field selects between:
 *
 *  - `density` — alpha and hue from density alone.
 *  - `mean` — density-weighted average of color-t (default).
 *  - `extreme` — sign-aware MAX of per-point color deviation. Requires
 *    a second accumulation target; uses `OES_draw_buffers_indexed`
 *    MRT in one pass when available, otherwise falls back to two
 *    sequential splat passes.
 *  - `signed` — net positive vs. negative accumulation via the
 *    `G - 0.5·R` identity. Requires a float-capable framebuffer; on
 *    `UNSIGNED_BYTE` fallback the glyph silently degrades to `mean`
 *    with a one-line console warning.
 */
export class DensityGlyph implements Glyph {
    readonly name = "density" as const;
    private _cache: DensityCache | null = null;

    ensureProgram(chart: CartesianChart, glManager: WebGLContextManager): void {
        if (this._cache) {
            this.ensureHeatTarget(chart, glManager);
            return;
        }

        const gl = glManager.gl;
        const splatProgram = glManager.shaders.getOrCreate(
            "density-splat",
            splatVert,
            splatFrag,
        );
        const resolveProgram = glManager.shaders.getOrCreate(
            "density-resolve",
            resolveVert,
            resolveFrag,
        );

        const quadCornerBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, quadCornerBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW,
        );

        const tripleCornerBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, tripleCornerBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 3, -1, -1, 3]),
            gl.STATIC_DRAW,
        );

        const { internalFormat, format, type, isFloat } =
            pickHeatFormat(glManager);

        const heatTexture = createAccumTexture(gl);
        const heatFramebuffer = gl.createFramebuffer()!;

        this._cache = {
            splat: extractSplatLocations(gl, splatProgram),
            extremeSplat: null,
            mrtSplat: null,
            resolve: {
                program: resolveProgram,
                u_heat: gl.getUniformLocation(resolveProgram, "u_heat"),
                u_extreme: gl.getUniformLocation(resolveProgram, "u_extreme"),
                u_gradient_lut: gl.getUniformLocation(
                    resolveProgram,
                    "u_gradient_lut",
                ),
                u_heat_max: gl.getUniformLocation(resolveProgram, "u_heat_max"),
                u_color_mode: gl.getUniformLocation(
                    resolveProgram,
                    "u_color_mode",
                ),
                a_corner: gl.getAttribLocation(resolveProgram, "a_corner"),
            },
            quadCornerBuffer,
            tripleCornerBuffer,
            heatTexture,
            heatFramebuffer,
            extremeTexture: null,
            extremeFramebuffer: null,
            mrtFramebuffer: null,
            heatWidth: 0,
            heatHeight: 0,
            heatType: type,
            heatInternalFormat: internalFormat,
            heatFormat: format,
            floatFbo: isFloat,
            indexedBlend: null,
            signedDowngradeWarned: false,
            robustBounds: null,
        };

        this.ensureHeatTarget(chart, glManager);
    }

    draw(
        chart: CartesianChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
    ): void {
        const cache = this._cache;
        if (!cache || !ensurePointBuffers(glManager)) {
            return;
        }

        const numSeries = Math.max(1, chart._splitGroups.length);
        const cap = chart._seriesCapacity;
        let total = 0;
        for (let s = 0; s < numSeries; s++) {
            total += chart._seriesUploadedCounts[s] ?? 0;
        }

        if (total === 0) {
            return;
        }

        this.runSplatAndResolve(chart, glManager, cache, projection, (cb) => {
            for (let s = 0; s < numSeries; s++) {
                const count = chart._seriesUploadedCounts[s] ?? 0;
                if (count <= 0) {
                    continue;
                }

                cb(s * cap, count);
            }
        });
    }

    drawSeries(
        chart: CartesianChart,
        glManager: WebGLContextManager,
        projection: Float32Array,
        seriesIdx: number,
    ): void {
        const cache = this._cache;
        if (!cache || !ensurePointBuffers(glManager)) {
            return;
        }

        const count = chart._seriesUploadedCounts[seriesIdx] ?? 0;
        if (count <= 0) {
            return;
        }

        const cap = chart._seriesCapacity;
        this.runSplatAndResolve(chart, glManager, cache, projection, (cb) =>
            cb(seriesIdx * cap, count),
        );
    }

    buildTooltipLines(
        chart: CartesianChart,
        flatIdx: number,
    ): Promise<string[]> {
        return buildPointRowTooltipLines(chart, flatIdx);
    }

    tooltipOptions() {
        return { crosshair: true, highlightRadius: 0 };
    }

    destroy(chart: CartesianChart): void {
        const cache = this._cache;
        if (!cache || !chart._glManager) {
            this._cache = null;
            return;
        }

        const gl = chart._glManager.gl;
        gl.deleteBuffer(cache.quadCornerBuffer);
        gl.deleteBuffer(cache.tripleCornerBuffer);
        gl.deleteTexture(cache.heatTexture);
        gl.deleteFramebuffer(cache.heatFramebuffer);
        if (cache.extremeTexture) {
            gl.deleteTexture(cache.extremeTexture);
        }

        if (cache.extremeFramebuffer) {
            gl.deleteFramebuffer(cache.extremeFramebuffer);
        }

        if (cache.mrtFramebuffer) {
            gl.deleteFramebuffer(cache.mrtFramebuffer);
        }

        this._cache = null;
    }

    /**
     * Resize the heat (and, when allocated, extreme + MRT) targets to
     * the current canvas bitmap size. The canvas backing store changes
     * on DPR or layout updates, so we compare cached dimensions and
     * re-allocate when stale.
     */
    private ensureHeatTarget(
        _chart: CartesianChart,
        glManager: WebGLContextManager,
    ): void {
        const cache = this._cache;
        if (!cache) {
            return;
        }

        const gl = glManager.gl;
        const w = gl.canvas.width;
        const h = gl.canvas.height;
        if (w === cache.heatWidth && h === cache.heatHeight) {
            return;
        }

        if (w <= 0 || h <= 0) {
            return;
        }

        this.allocAccumTexture(gl, cache, cache.heatTexture, w, h);

        gl.bindFramebuffer(gl.FRAMEBUFFER, cache.heatFramebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            cache.heatTexture,
            0,
        );

        if (cache.extremeTexture) {
            this.allocAccumTexture(gl, cache, cache.extremeTexture, w, h);
            if (cache.extremeFramebuffer) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, cache.extremeFramebuffer);
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    cache.extremeTexture,
                    0,
                );
            }

            if (cache.mrtFramebuffer) {
                // MRT FBO only exists when indexed-blend was probed
                // successfully, which is gated on WebGL2.
                const gl2 = gl as WebGL2RenderingContext;
                gl2.bindFramebuffer(gl2.FRAMEBUFFER, cache.mrtFramebuffer);
                gl2.framebufferTexture2D(
                    gl2.FRAMEBUFFER,
                    gl2.COLOR_ATTACHMENT0,
                    gl2.TEXTURE_2D,
                    cache.heatTexture,
                    0,
                );
                gl2.framebufferTexture2D(
                    gl2.FRAMEBUFFER,
                    gl2.COLOR_ATTACHMENT1,
                    gl2.TEXTURE_2D,
                    cache.extremeTexture,
                    0,
                );
            }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        cache.heatWidth = w;
        cache.heatHeight = h;
    }

    /**
     * Re-allocate the storage for one accumulation texture using the
     * cached format triple. Called both at first draw and on every
     * canvas-size change.
     */
    private allocAccumTexture(
        gl: WebGL2RenderingContext | WebGLRenderingContext,
        cache: DensityCache,
        tex: WebGLTexture,
        w: number,
        h: number,
    ): void {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            cache.heatInternalFormat,
            w,
            h,
            0,
            cache.heatFormat,
            cache.heatType,
            null,
        );
    }

    /**
     * Lazily allocate the extreme-mode accumulation texture + its
     * framebuffers. Sized to match the heat target. Also probes
     * `OES_draw_buffers_indexed` once per cache; if available, builds
     * the MRT framebuffer with both textures attached.
     */
    private ensureExtremeTarget(
        glManager: WebGLContextManager,
        cache: DensityCache,
    ): void {
        const gl = glManager.gl;
        if (cache.extremeTexture) {
            return;
        }

        const tex = createAccumTexture(gl);
        cache.extremeTexture = tex;
        cache.extremeFramebuffer = gl.createFramebuffer()!;

        this.allocAccumTexture(
            gl,
            cache,
            tex,
            cache.heatWidth,
            cache.heatHeight,
        );

        gl.bindFramebuffer(gl.FRAMEBUFFER, cache.extremeFramebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            tex,
            0,
        );

        if (cache.indexedBlend === null) {
            // First chance to probe: only attempt MRT on WebGL2 where
            // `gl.drawBuffers` is in core. On WebGL1 we'd also need
            // `WEBGL_draw_buffers` for the JS function, but the
            // indexed-blend extension itself doesn't ship there.
            const ext = glManager.isWebGL2
                ? (gl.getExtension(
                      "OES_draw_buffers_indexed",
                  ) as IndexedBlendExt | null)
                : null;
            cache.indexedBlend = ext ?? false;
        }

        if (cache.indexedBlend) {
            // Indexed blend is gated on `isWebGL2`, so `gl` is a
            // WebGL2 context here — cast for `COLOR_ATTACHMENT1`,
            // which isn't on the WebGL1 type.
            const gl2 = gl as WebGL2RenderingContext;
            cache.mrtFramebuffer = gl2.createFramebuffer()!;
            gl2.bindFramebuffer(gl2.FRAMEBUFFER, cache.mrtFramebuffer);
            gl2.framebufferTexture2D(
                gl2.FRAMEBUFFER,
                gl2.COLOR_ATTACHMENT0,
                gl2.TEXTURE_2D,
                cache.heatTexture,
                0,
            );
            gl2.framebufferTexture2D(
                gl2.FRAMEBUFFER,
                gl2.COLOR_ATTACHMENT1,
                gl2.TEXTURE_2D,
                tex,
                0,
            );
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Compile (and cache) the single-target extreme splat program — the
     * fallback two-pass path's second pass. Reuses the splat vertex
     * shader so `v_color_t` semantics match the heat pass.
     */
    private ensureExtremeSplatProgram(
        glManager: WebGLContextManager,
        cache: DensityCache,
    ): SplatProgramCache {
        if (cache.extremeSplat) {
            return cache.extremeSplat;
        }

        const program = glManager.shaders.getOrCreate(
            "density-extreme",
            splatVert,
            extremeFrag,
        );
        cache.extremeSplat = extractSplatLocations(glManager.gl, program);
        return cache.extremeSplat;
    }

    /**
     * Compile (and cache) the MRT splat program. Only safe to call
     * after `cache.indexedBlend` resolves truthy — the program's
     * `#extension GL_EXT_draw_buffers : require` would fail to
     * compile on contexts without multi-render-target support.
     */
    private ensureMrtSplatProgram(
        glManager: WebGLContextManager,
        cache: DensityCache,
    ): SplatProgramCache {
        if (cache.mrtSplat) {
            return cache.mrtSplat;
        }

        // The MRT frag is GLSL ES 3.00 (`layout(location=N) out vec4`);
        // the legacy GLSL 100 splat vert can't link against it because
        // a program's shaders must share a version. Use the paired
        // `density-mrt.vert.glsl` instead — same math, 300 ES dialect.
        const program = glManager.shaders.getOrCreate(
            "density-mrt",
            mrtVert,
            mrtFrag,
        );
        cache.mrtSplat = extractSplatLocations(glManager.gl, program);
        return cache.mrtSplat;
    }

    /**
     * Resolve the active mode for this frame. Folds in the silent
     * downgrades to `mean` with a one-shot console warning:
     *
     *  - `signed` requires a float-capable framebuffer
     *    (`EXT_color_buffer_float` on WebGL2 in practice).
     *  - `extreme` requires `gl.MAX` blend and a second color
     *    attachment, both of which are WebGL2-only here. On WebGL1
     *    we could probe `EXT_blend_minmax` + `WEBGL_draw_buffers`
     *    but degrading is simpler and the context manager prefers
     *    WebGL2 already.
     */
    private activeMode(
        glManager: WebGLContextManager,
        chart: CartesianChart,
        cache: DensityCache,
    ): ColorMode {
        const requested = chart._pluginConfig.gradient_color_mode;
        if (requested === "signed" && !cache.floatFbo) {
            this.warnDowngradeOnce(
                cache,
                "signed mode requires a float framebuffer (EXT_color_buffer_float); falling back to mean.",
            );
            return "mean";
        }

        if (requested === "extreme" && !glManager.isWebGL2) {
            this.warnDowngradeOnce(
                cache,
                "extreme mode requires WebGL2 (for MAX blend and a second color attachment); falling back to mean.",
            );
            return "mean";
        }

        return requested;
    }

    private warnDowngradeOnce(cache: DensityCache, message: string): void {
        if (cache.signedDowngradeWarned) {
            return;
        }

        cache.signedDowngradeWarned = true;
        console.warn(`Density: ${message}`);
    }

    /**
     * Shared splat → resolve pipeline. `dispatchSplats(cb)` iterates
     * the series ranges the caller wants drawn, invoking
     * `cb(slotOffset, count)` per range — `drawSeries` passes a single
     * range, `draw` iterates every series. Internally branches on the
     * active color mode: density/mean/signed share the single-target
     * heat-only pass, `extreme` runs either an MRT single-pass or two
     * sequential passes depending on extension support.
     */
    private runSplatAndResolve(
        chart: CartesianChart,
        glManager: WebGLContextManager,
        cache: DensityCache,
        projection: Float32Array,
        dispatchSplats: (
            cb: (slotOffset: number, count: number) => void,
        ) => void,
    ): void {
        this.ensureHeatTarget(chart, glManager);
        if (cache.heatWidth === 0 || cache.heatHeight === 0) {
            return;
        }

        if (!chart._gradientCache) {
            return;
        }

        const mode = this.activeMode(glManager, chart, cache);

        // Resolve the color range we want the splat shader to use for
        // its per-point `t` mapping. Robust bounds apply to modes that
        // consume `t` directly (`mean`, `extreme`); `signed` actively
        // benefits from raw extents so outlier influence accumulates;
        // `density` ignores color entirely.
        const hasColor =
            chart._colorMin < chart._colorMax &&
            (!!chart._colorName || chart._splitGroups.length > 1);
        let cmin = 0.0;
        let cmax = 0.0;
        if (mode !== "density" && hasColor) {
            cmin = chart._colorMin;
            cmax = chart._colorMax;
            const useRobust =
                !chart._colorIsString &&
                (mode === "mean" || mode === "extreme");
            if (useRobust) {
                const robust = ensureRobustBounds(chart, cache);
                if (robust) {
                    cmin = robust.lo;
                    cmax = robust.hi;
                }
            }
        }

        if (mode === "extreme") {
            this.ensureExtremeTarget(glManager, cache);
        }

        if (mode === "extreme" && cache.indexedBlend) {
            this.runMrtExtremePass(
                glManager,
                cache,
                projection,
                chart._pluginConfig.gradient_intensity,
                glManager.dpr * chart._pluginConfig.gradient_radius_px,
                cmin,
                cmax,
                dispatchSplats,
            );
        } else {
            this.runHeatPass(
                glManager,
                cache,
                projection,
                chart._pluginConfig.gradient_intensity,
                glManager.dpr * chart._pluginConfig.gradient_radius_px,
                cmin,
                cmax,
                dispatchSplats,
            );

            if (mode === "extreme") {
                this.runExtremePass(
                    glManager,
                    cache,
                    projection,
                    chart._pluginConfig.gradient_intensity,
                    glManager.dpr * chart._pluginConfig.gradient_radius_px,
                    cmin,
                    cmax,
                    dispatchSplats,
                );
            }
        }

        this.runResolvePass(glManager, cache, chart, mode);
    }

    /**
     * Single-target accumulation into the heat FBO. ADD blend; writes
     * `(w, w·t, 0, 0)`. Used by every mode except `extreme` on the
     * MRT path (which does this work and the extreme pass in one go).
     */
    private runHeatPass(
        glManager: WebGLContextManager,
        cache: DensityCache,
        projection: Float32Array,
        intensity: number,
        radiusPx: number,
        cmin: number,
        cmax: number,
        dispatchSplats: (
            cb: (slotOffset: number, count: number) => void,
        ) => void,
    ): void {
        const gl = glManager.gl;
        const wasScissor = !!gl.getParameter(gl.SCISSOR_TEST);

        gl.bindFramebuffer(gl.FRAMEBUFFER, cache.heatFramebuffer);
        gl.viewport(0, 0, cache.heatWidth, cache.heatHeight);
        this.clearTarget(gl, wasScissor);

        gl.blendFunc(gl.ONE, gl.ONE);
        gl.blendEquation(gl.FUNC_ADD);

        this.bindSplatProgram(
            gl,
            cache.splat,
            projection,
            intensity,
            radiusPx,
            cache.heatWidth,
            cache.heatHeight,
            cmin,
            cmax,
        );

        this.bindAndDispatchInstanced(
            glManager,
            cache,
            cache.splat,
            dispatchSplats,
        );
        this.unbindSplatInstancing(glManager, cache.splat);
    }

    /**
     * Second pass of the two-pass extreme path. MAX blend; writes
     * sign-split deviation magnitudes into the extreme FBO. Skipped
     * entirely on the MRT fast path.
     */
    private runExtremePass(
        glManager: WebGLContextManager,
        cache: DensityCache,
        projection: Float32Array,
        intensity: number,
        radiusPx: number,
        cmin: number,
        cmax: number,
        dispatchSplats: (
            cb: (slotOffset: number, count: number) => void,
        ) => void,
    ): void {
        const gl = glManager.gl;
        const wasScissor = !!gl.getParameter(gl.SCISSOR_TEST);
        const program = this.ensureExtremeSplatProgram(glManager, cache);

        gl.bindFramebuffer(gl.FRAMEBUFFER, cache.extremeFramebuffer!);
        gl.viewport(0, 0, cache.heatWidth, cache.heatHeight);
        this.clearTarget(gl, wasScissor);

        gl.blendFunc(gl.ONE, gl.ONE);
        // `MAX` is WebGL2-only on the type; `activeMode` gates the
        // extreme path on WebGL2 so the cast is safe at runtime.
        const gl2 = gl as WebGL2RenderingContext;
        gl2.blendEquation(gl2.MAX);

        this.bindSplatProgram(
            gl,
            program,
            projection,
            intensity,
            radiusPx,
            cache.heatWidth,
            cache.heatHeight,
            cmin,
            cmax,
        );

        this.bindAndDispatchInstanced(
            glManager,
            cache,
            program,
            dispatchSplats,
        );
        this.unbindSplatInstancing(glManager, program);

        // Restore default ADD equation for downstream callers.
        gl.blendEquation(gl.FUNC_ADD);
    }

    /**
     * MRT fast path: one splat draw writes density (ADD) and extreme
     * (MAX) in the same invocation by routing `gl_FragData[0]` /
     * `gl_FragData[1]` to attachments 0 and 1 with per-attachment
     * blend equations.
     */
    private runMrtExtremePass(
        glManager: WebGLContextManager,
        cache: DensityCache,
        projection: Float32Array,
        intensity: number,
        radiusPx: number,
        cmin: number,
        cmax: number,
        dispatchSplats: (
            cb: (slotOffset: number, count: number) => void,
        ) => void,
    ): void {
        const gl = glManager.gl as WebGL2RenderingContext;
        const ext = cache.indexedBlend as IndexedBlendExt;
        const wasScissor = !!gl.getParameter(gl.SCISSOR_TEST);
        const program = this.ensureMrtSplatProgram(glManager, cache);

        gl.bindFramebuffer(gl.FRAMEBUFFER, cache.mrtFramebuffer!);
        gl.viewport(0, 0, cache.heatWidth, cache.heatHeight);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        this.clearTarget(gl, wasScissor);

        // Per-attachment blend: ADD for density, MAX for extreme.
        ext.enableiOES(gl.BLEND, 0);
        ext.enableiOES(gl.BLEND, 1);
        ext.blendEquationiOES(0, gl.FUNC_ADD);
        ext.blendFunciOES(0, gl.ONE, gl.ONE);
        ext.blendEquationiOES(1, gl.MAX);
        ext.blendFunciOES(1, gl.ONE, gl.ONE);

        this.bindSplatProgram(
            gl,
            program,
            projection,
            intensity,
            radiusPx,
            cache.heatWidth,
            cache.heatHeight,
            cmin,
            cmax,
        );

        this.bindAndDispatchInstanced(
            glManager,
            cache,
            program,
            dispatchSplats,
        );
        this.unbindSplatInstancing(glManager, program);

        // Restore the global default for both attachments — subsequent
        // single-target draws (resolve, other charts) rely on it. The
        // indexed extension leaks state across attachments otherwise.
        ext.blendEquationiOES(0, gl.FUNC_ADD);
        ext.blendEquationiOES(1, gl.FUNC_ADD);
        ext.blendFunciOES(0, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        ext.blendFunciOES(1, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    }

    /**
     * Clear the currently bound framebuffer's color attachment(s) to
     * fully transparent, bypassing scissor so leftovers from a prior
     * facet's region don't bleed into this pass's full sample range.
     * Restores the scissor state on exit.
     */
    private clearTarget(
        gl: WebGL2RenderingContext | WebGLRenderingContext,
        wasScissor: boolean,
    ): void {
        if (wasScissor) {
            gl.disable(gl.SCISSOR_TEST);
        }

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (wasScissor) {
            gl.enable(gl.SCISSOR_TEST);
        }
    }

    /**
     * Upload the per-frame splat-program uniforms (projection, splat
     * radius, intensity, color range). Shared by the heat-only pass,
     * the extreme single-target pass, and the MRT pass since each
     * program exposes the same uniform layout.
     */
    private bindSplatProgram(
        gl: WebGL2RenderingContext | WebGLRenderingContext,
        cache: SplatProgramCache,
        projection: Float32Array,
        intensity: number,
        radiusPx: number,
        targetWidth: number,
        targetHeight: number,
        cmin: number,
        cmax: number,
    ): void {
        gl.useProgram(cache.program);
        gl.uniformMatrix4fv(cache.u_projection, false, projection);
        gl.uniform1f(cache.u_intensity, intensity);

        const radiusNdcX = (2 * radiusPx) / Math.max(1, targetWidth);
        const radiusNdcY = (2 * radiusPx) / Math.max(1, targetHeight);
        gl.uniform2f(cache.u_radius_ndc, radiusNdcX, radiusNdcY);
        gl.uniform2f(cache.u_color_range, cmin, cmax);
    }

    /**
     * Bind the static unit-quad corner buffer (divisor 0) and per-
     * instance position + color attributes (divisor 1), then iterate
     * the caller's series ranges issuing one instanced draw each.
     */
    private bindAndDispatchInstanced(
        glManager: WebGLContextManager,
        cache: DensityCache,
        program: SplatProgramCache,
        dispatchSplats: (
            cb: (slotOffset: number, count: number) => void,
        ) => void,
    ): void {
        const gl = glManager.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, cache.quadCornerBuffer);
        gl.enableVertexAttribArray(program.a_corner);
        gl.vertexAttribPointer(program.a_corner, 2, gl.FLOAT, false, 0, 0);

        const instancing = getInstancing(glManager);
        instancing.setDivisor(program.a_corner, 0);
        instancing.setDivisor(program.a_position, 1);
        instancing.setDivisor(program.a_color_value, 1);

        const posBuf = glManager.bufferPool.peek("a_position")!;
        const colorBuf = glManager.bufferPool.peek("a_color_value")!;

        dispatchSplats((slotOffset, count) => {
            const posStride = 2 * Float32Array.BYTES_PER_ELEMENT;
            const scalarStride = Float32Array.BYTES_PER_ELEMENT;

            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf.buffer);
            gl.enableVertexAttribArray(program.a_position);
            gl.vertexAttribPointer(
                program.a_position,
                2,
                gl.FLOAT,
                false,
                posStride,
                slotOffset * posStride,
            );

            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf.buffer);
            gl.enableVertexAttribArray(program.a_color_value);
            gl.vertexAttribPointer(
                program.a_color_value,
                1,
                gl.FLOAT,
                false,
                scalarStride,
                slotOffset * scalarStride,
            );

            instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        });
    }

    /**
     * Reset the per-instance divisors so subsequent draws (in this or
     * another chart) don't inherit the instanced bindings.
     */
    private unbindSplatInstancing(
        glManager: WebGLContextManager,
        program: SplatProgramCache,
    ): void {
        const instancing = getInstancing(glManager);
        instancing.setDivisor(program.a_position, 0);
        instancing.setDivisor(program.a_color_value, 0);
    }

    /**
     * Resolve pass on the canvas FBO. Standard alpha composite. Reads
     * the heat FBO (always) and, in `extreme` mode, the extreme FBO.
     * Uploads the mode int that the resolve frag branches on.
     */
    private runResolvePass(
        glManager: WebGLContextManager,
        cache: DensityCache,
        chart: CartesianChart,
        mode: ColorMode,
    ): void {
        const gl = glManager.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const resolve = cache.resolve;
        gl.useProgram(resolve.program);
        gl.uniform1f(resolve.u_heat_max, chart._pluginConfig.gradient_heat_max);
        gl.uniform1i(resolve.u_color_mode, modeToInt(mode));

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cache.heatTexture);
        gl.uniform1i(resolve.u_heat, 0);

        // The shader unconditionally samples `u_extreme` in the extreme
        // branch. Bind whatever we have (the heat texture as a no-op
        // bind in non-extreme modes) so the unit stays defined and
        // texture-completeness checks pass.
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(
            gl.TEXTURE_2D,
            cache.extremeTexture ?? cache.heatTexture,
        );
        gl.uniform1i(resolve.u_extreme, 1);

        bindGradientTexture(
            glManager,
            chart._gradientCache!.texture,
            resolve.u_gradient_lut,
            2,
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, cache.tripleCornerBuffer);
        gl.enableVertexAttribArray(resolve.a_corner);
        gl.vertexAttribPointer(resolve.a_corner, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}

function modeToInt(mode: ColorMode): number {
    switch (mode) {
        case "density":
            return MODE_DENSITY;
        case "extreme":
            return MODE_EXTREME;
        case "signed":
            return MODE_SIGNED;
        case "mean":
        default:
            return MODE_MEAN;
    }
}

function createAccumTexture(
    gl: WebGL2RenderingContext | WebGLRenderingContext,
): WebGLTexture {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

function extractSplatLocations(
    gl: WebGL2RenderingContext | WebGLRenderingContext,
    program: WebGLProgram,
): SplatProgramCache {
    return {
        program,
        u_projection: gl.getUniformLocation(program, "u_projection"),
        u_radius_ndc: gl.getUniformLocation(program, "u_radius_ndc"),
        u_intensity: gl.getUniformLocation(program, "u_intensity"),
        u_color_range: gl.getUniformLocation(program, "u_color_range"),
        a_corner: gl.getAttribLocation(program, "a_corner"),
        a_position: gl.getAttribLocation(program, "a_position"),
        a_color_value: gl.getAttribLocation(program, "a_color_value"),
    };
}

/**
 * Resolve the highest-precision float color buffer the running GL
 * context will accept. WebGL2 + `EXT_color_buffer_float` gives
 * RGBA16F; otherwise fall back to RGBA8. The fallback compresses
 * density into [0, 1] and saturates earlier; `signed` mode degrades
 * to `mean` on this path because its `G - 0.5·R` math depends on
 * unclamped accumulation.
 */
function pickHeatFormat(glManager: WebGLContextManager): {
    internalFormat: number;
    format: number;
    type: number;
    isFloat: boolean;
} {
    const gl = glManager.gl;
    if (glManager.isWebGL2) {
        const gl2 = gl as WebGL2RenderingContext;
        if (gl2.getExtension("EXT_color_buffer_float")) {
            return {
                internalFormat: gl2.RGBA16F,
                format: gl2.RGBA,
                type: gl2.HALF_FLOAT,
                isFloat: true,
            };
        }
    }

    return {
        internalFormat: gl.RGBA,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        isFloat: false,
    };
}

/**
 * Verify the shared cartesian position + color attribute buffers exist.
 * The cartesian build pipeline uploads them on each chunk; render-path
 * callers must use `peek` (never `getOrCreate`) so a pan/zoom render
 * landing between an `ensureBufferCapacity` and its `uploadChunk`
 * doesn't recreate the buffer with zeros.
 */
function ensurePointBuffers(glManager: WebGLContextManager): boolean {
    const pos = glManager.bufferPool.peek("a_position");
    const color = glManager.bufferPool.peek("a_color_value");
    return !!pos && !!color;
}

/**
 * Cap for the strided sample used to compute the 5th/95th percentile
 * color-column bounds. A larger sample tightens the quantile estimate
 * but costs O(n log n) sort time. At 50k the sort runs ~10ms once per
 * data refresh; subsequent renders hit the cache.
 */
const ROBUST_SAMPLE_MAX = 50_000;

/**
 * Resolve the robust (5th/95th percentile) bounds for the color column,
 * reading from the cache when `(dataCount, colorName, colorIsString)`
 * hasn't changed since the last compute. Returns `null` when robust
 * clipping doesn't apply — no color column, categorical column (exact
 * palette indices), or a degenerate sample.
 */
function ensureRobustBounds(
    chart: CartesianChart,
    cache: DensityCache,
): { lo: number; hi: number } | null {
    if (!chart._colorName || chart._colorIsString) {
        cache.robustBounds = null;
        return null;
    }

    const cur = cache.robustBounds;
    if (
        cur &&
        cur.dataCount === chart._dataCount &&
        cur.colorName === chart._colorName &&
        cur.colorIsString === chart._colorIsString
    ) {
        return { lo: cur.lo, hi: cur.hi };
    }

    const computed = computeRobustBounds(chart);
    if (!computed) {
        cache.robustBounds = null;
        return null;
    }

    cache.robustBounds = {
        lo: computed.lo,
        hi: computed.hi,
        dataCount: chart._dataCount,
        colorName: chart._colorName,
        colorIsString: chart._colorIsString,
    };
    return computed;
}

/**
 * Sample `chart._colorData` along its slotted per-series ranges, sort
 * the strided sample, and return the 5th/95th percentile values. The
 * sample skips unused tail slots (per-series `_seriesUploadedCounts`
 * cap) so split mode doesn't pollute the distribution with default
 * `0.5` placeholders.
 *
 * Falls back to raw `_colorMin`/`_colorMax` when the quantile sample
 * collapses to a single value — otherwise a zero-width range would
 * trip the splat shader's `cmax <= cmin` branch and paint every
 * point at t=0.5.
 */
function computeRobustBounds(
    chart: CartesianChart,
): { lo: number; hi: number } | null {
    if (!chart._colorData || chart._dataCount < 2) {
        return null;
    }

    const cap = chart._seriesCapacity;
    const numSeries = Math.max(1, chart._splitGroups.length);
    const stride = Math.max(1, Math.ceil(chart._dataCount / ROBUST_SAMPLE_MAX));

    const samples: number[] = [];
    const data = chart._colorData;
    for (let s = 0; s < numSeries; s++) {
        const count = chart._seriesUploadedCounts[s] ?? 0;
        const base = s * cap;
        for (let j = 0; j < count; j += stride) {
            const v = data[base + j];
            if (Number.isFinite(v)) {
                samples.push(v);
            }
        }
    }

    if (samples.length < 2) {
        return null;
    }

    samples.sort((a, b) => a - b);
    const loIdx = Math.floor(samples.length * 0.05);
    const hiIdx = Math.min(
        samples.length - 1,
        Math.ceil(samples.length * 0.95),
    );

    const lo = samples[loIdx];
    const hi = samples[hiIdx];
    if (!(hi > lo)) {
        if (chart._colorMax > chart._colorMin) {
            return { lo: chart._colorMin, hi: chart._colorMax };
        }

        return null;
    }

    return { lo, hi };
}
