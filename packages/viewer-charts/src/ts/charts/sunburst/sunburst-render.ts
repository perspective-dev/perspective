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

import type { WebGLContextManager } from "../../webgl/context-manager";
import type { SunburstChart } from "./sunburst";
import { NULL_NODE } from "../common/node-store";
import { resolveTheme, readSeriesPalette } from "../../theme/theme";
import { resolvePalette, type Vec3 } from "../../theme/palette";
import {
    colorValueToT,
    sampleGradient,
    type GradientStop,
} from "../../theme/gradient";
import { renderLegend, renderCategoricalLegend } from "../../chrome/legend";
import { PlotLayout } from "../../layout/plot-layout";
import arcVert from "../../shaders/sunburst-arc.vert.glsl";
import arcFrag from "../../shaders/sunburst-arc.frag.glsl";
import { getInstancing } from "../../webgl/instanced-attrs";
import {
    partitionSunburst,
    collectVisibleArcs,
    collectVisibleArcsAppend,
    INNER_RING_PX,
} from "./sunburst-layout";
import { buildFacetGrid } from "../../layout/facet-grid";
import { renderCategoricalLegendAt } from "../../chrome/legend";

/**
 * Triangle-strip template resolution. `N_STEPS` angular samples × 2
 * radial sides = `2 * (N_STEPS + 1)` strip vertices. 32 samples is
 * smooth to the eye at typical viewport sizes; bump to 64 if faceting
 * becomes visible on full-circle arcs.
 */
const N_STEPS = 32;
const BREADCRUMB_H = 28;
const LEGEND_W = 90;

function luminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sampleRGB(stops: GradientStop[], t: number): [number, number, number] {
    const c = sampleGradient(stops, t);
    return [c[0], c[1], c[2]];
}

function leafColor(
    chart: SunburstChart,
    nodeId: number,
    stops: GradientStop[],
    palette: Vec3[],
): [number, number, number] {
    const store = chart._nodeStore;
    const colorValue = store.colorValue[nodeId];
    if (
        chart._colorMode === "numeric" &&
        !isNaN(colorValue) &&
        chart._colorMax > chart._colorMin
    ) {
        return sampleRGB(
            stops,
            colorValueToT(colorValue, chart._colorMin, chart._colorMax),
        );
    }
    const idx = chart._uniqueColorLabels.get(store.colorLabel[nodeId]) ?? 0;
    return palette[idx % palette.length] ?? [0, 0, 0];
}

/**
 * `leafColor` + alpha: arcs whose source-row size was negative dim
 * to `negativeAlpha` so they read as "magnitude with inverse sign"
 * rather than disappearing. Mirrors the treemap helper.
 */
function leafRGBA(
    chart: SunburstChart,
    nodeId: number,
    stops: GradientStop[],
    palette: Vec3[],
    negativeAlpha: number,
): [number, number, number, number] {
    const rgb = leafColor(chart, nodeId, stops, palette);
    const alpha = chart._nodeStore.sizeSign[nodeId] < 0 ? negativeAlpha : 1.0;
    return [rgb[0], rgb[1], rgb[2], alpha];
}

/** Full-frame render: layout → WebGL arcs → chrome overlay. */
export function renderSunburstFrame(
    chart: SunburstChart,
    glManager: WebGLContextManager,
): void {
    if (chart._currentRootId === NULL_NODE) return;

    const gl = glManager.gl;
    const cssWidth = (gl.canvas as HTMLCanvasElement).getBoundingClientRect()
        .width;
    const cssHeight = (gl.canvas as HTMLCanvasElement).getBoundingClientRect()
        .height;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    const hasSplits =
        chart._splitBy.length > 0 && chart._facetConfig.facet_mode === "grid";
    const hasLegend =
        chart._colorMode === "series"
            ? chart._uniqueColorLabels.size > 1
            : chart._colorMode === "numeric" &&
              chart._colorMin < chart._colorMax;
    const breadcrumbH =
        !hasSplits && chart._breadcrumbIds.length > 1 ? BREADCRUMB_H : 0;
    const legendW = hasLegend ? LEGEND_W : 0;

    if (hasSplits) {
        layoutFacetedSunburst(chart, cssWidth, cssHeight, legendW);
    } else {
        chart._facetGrid = null;
        chart._facets = [];
        const plotW = cssWidth - legendW;
        const plotH = cssHeight - breadcrumbH;
        chart._centerX = plotW / 2;
        chart._centerY = breadcrumbH + plotH / 2;
        chart._maxRadius = Math.max(0, Math.min(plotW, plotH) / 2 - 4);

        partitionSunburst(
            chart._nodeStore,
            chart._currentRootId,
            chart._maxRadius,
        );
        collectVisibleArcs(chart, chart._currentRootId);
    }

    ensureProgram(chart, glManager);

    const themeEl = chart._gridlineCanvas || chart._chromeCanvas!;
    const theme = resolveTheme(themeEl);
    const stops = theme.gradientStops;
    const palette = resolvePalette(
        readSeriesPalette(themeEl),
        stops,
        Math.max(1, chart._uniqueColorLabels.size),
    );

    if (chart._gridlineCanvas) {
        const gCtx = chart._gridlineCanvas.getContext("2d");
        if (gCtx) {
            gCtx.clearRect(
                0,
                0,
                chart._gridlineCanvas.width,
                chart._gridlineCanvas.height,
            );
        }
    }

    chart._chromeCacheDirty = true;
    uploadArcInstances(chart, gl, stops, palette, theme.areaOpacity);

    const dpr = window.devicePixelRatio || 1;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(chart._program!);

    const loc = chart._locations!;
    gl.uniform2f(
        loc.u_resolution,
        (gl.canvas as HTMLCanvasElement).width,
        (gl.canvas as HTMLCanvasElement).height,
    );
    gl.uniform1f(loc.u_border_px, theme.sunburstGapPx * dpr);

    if (chart._facets.length > 0) {
        // Faceted: one dispatch per facet with the matching `u_center`
        // and instance range. Instance attribs are rebound per facet so
        // instance 0 of each dispatch is the facet's first arc.
        for (const facet of chart._facets) {
            if (facet.instanceCount === 0) continue;
            gl.uniform2f(
                loc.u_center,
                facet.centerX * dpr,
                facet.centerY * dpr,
            );
            drawArcs(
                chart,
                gl,
                glManager,
                facet.instanceStart,
                facet.instanceCount,
            );
        }
    } else {
        gl.uniform2f(loc.u_center, chart._centerX * dpr, chart._centerY * dpr);
        drawArcs(chart, gl, glManager, 0, chart._instanceCount);
    }

    renderSunburstChromeOverlay(chart);
}

/**
 * Allocate the facet grid and compute per-facet (center, radius, drill
 * root) triples. Also runs `partitionSunburst` + `collectVisibleArcs`
 * per facet so the combined visible list is in `_visibleNodeIds` with
 * facets in cell order (instance uploads walk this list).
 */
function layoutFacetedSunburst(
    chart: SunburstChart,
    cssWidth: number,
    cssHeight: number,
    legendW: number,
): void {
    const store = chart._nodeStore;
    const facetIds: number[] = [];
    const labels: string[] = [];
    for (
        let c = store.firstChild[chart._rootId];
        c !== NULL_NODE;
        c = store.nextSibling[c]
    ) {
        if (store.value[c] <= 0) continue;
        facetIds.push(c);
        labels.push(store.name[c]);
    }

    const gridWidth = Math.max(1, cssWidth - legendW);
    const grid = buildFacetGrid(labels, {
        cssWidth: gridWidth,
        cssHeight,
        hasLegend: false,
        // Sunburst has no X/Y axes — no per-cell gutter reservation.
        xAxis: "none",
        yAxis: "none",
        gap: chart._facetConfig.facet_padding,
    });
    chart._facetGrid = grid;

    const facets: SunburstChart["_facets"] = [];
    let outIdx = 0;
    for (let i = 0; i < facetIds.length; i++) {
        const facetId = facetIds[i];
        const cell = grid.cells[i];
        if (!cell) continue;
        const label = store.name[facetId];
        const drillRoot = chart._facetDrillRoots.get(label) ?? facetId;
        const plot = cell.layout.plotRect;
        const centerX = plot.x + plot.width / 2;
        const centerY = plot.y + plot.height / 2;
        const maxRadius = Math.max(
            0,
            Math.min(plot.width, plot.height) / 2 - 4,
        );

        partitionSunburst(store, drillRoot, maxRadius);
        const nextIdx = collectVisibleArcsAppend(chart, drillRoot, outIdx);
        const instanceStart = outIdx;
        const instanceCount = nextIdx - outIdx;

        facets.push({
            label,
            centerX,
            centerY,
            maxRadius,
            drillRoot,
            instanceStart,
            instanceCount,
        });
        outIdx = nextIdx;
    }
    chart._visibleNodeCount = outIdx;
    chart._facets = facets;

    // Publish the first facet's center/radius to the legacy fields so
    // chrome code paths that still read them (e.g. non-faceted label
    // placement) pick sensible values.
    if (facets.length > 0) {
        chart._centerX = facets[0].centerX;
        chart._centerY = facets[0].centerY;
        chart._maxRadius = facets[0].maxRadius;
    }
}

function ensureProgram(
    chart: SunburstChart,
    glManager: WebGLContextManager,
): void {
    if (chart._program) return;
    const gl = glManager.gl;
    const prog = glManager.shaders.getOrCreate(
        "sunburst-arc",
        arcVert,
        arcFrag,
    );
    chart._program = prog;
    chart._locations = {
        u_center: gl.getUniformLocation(prog, "u_center"),
        u_resolution: gl.getUniformLocation(prog, "u_resolution"),
        u_border_px: gl.getUniformLocation(prog, "u_border_px"),
        a_strip_t: gl.getAttribLocation(prog, "a_strip_t"),
        a_side: gl.getAttribLocation(prog, "a_side"),
        a_angles: gl.getAttribLocation(prog, "a_angles"),
        a_radii: gl.getAttribLocation(prog, "a_radii"),
        a_color: gl.getAttribLocation(prog, "a_color"),
    };

    // Build the static triangle-strip template once. Layout:
    //   pairs of (strip_t, side) for each of the 2*(N_STEPS+1) vertices.
    //   even vertex = inner (side=0), odd vertex = outer (side=1).
    const template = new Float32Array((N_STEPS + 1) * 2 * 2);
    for (let i = 0; i <= N_STEPS; i++) {
        const t = i / N_STEPS;
        const o = i * 4;
        template[o + 0] = t;
        template[o + 1] = 0; // inner
        template[o + 2] = t;
        template[o + 3] = 1; // outer
    }
    chart._stripBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, chart._stripBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, template, gl.STATIC_DRAW);

    chart._instanceBuffer = gl.createBuffer()!;
}

function uploadArcInstances(
    chart: SunburstChart,
    gl: WebGL2RenderingContext | WebGLRenderingContext,
    stops: GradientStop[],
    palette: Vec3[],
    negativeAlpha: number,
): void {
    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds!;
    const dpr = window.devicePixelRatio || 1;
    const faceted = chart._facets.length > 0;

    // Walk each facet's pre-upload visible range (instanceStart and
    // instanceCount as set by `layoutFacetedSunburst`), skip the facet's
    // drill root + any zero-width arcs, and emit one contiguous run per
    // facet. Update `(instanceStart, instanceCount)` to the post-skip
    // values so draw dispatch can offset into the shared buffer.
    //
    // 8 floats per instance: [a0, a1, r0, r1, r, g, b, a]. Alpha = 1
    // for positive-size arcs, `negativeAlpha` for arcs whose raw size
    // column value was negative (keeps the arc visible but dimmer).
    const totalCap = faceted
        ? chart._facets.reduce((a, f) => a + f.instanceCount, 0)
        : chart._visibleNodeCount;
    const data = new Float32Array(totalCap * 8);
    let instance = 0;

    const emitRange = (start: number, end: number, drillRoot: number) => {
        const rangeStart = instance;
        for (let i = start; i < end; i++) {
            const id = ids[i];
            if (id === drillRoot) continue;
            const a0 = store.a0[id];
            const a1 = store.a1[id];
            const r0 = store.r0[id];
            const r1 = store.r1[id];
            if (a1 <= a0 || r1 <= r0) continue;
            const color = leafRGBA(chart, id, stops, palette, negativeAlpha);
            const o = instance * 8;
            data[o + 0] = a0;
            data[o + 1] = a1;
            data[o + 2] = r0 * dpr;
            data[o + 3] = r1 * dpr;
            data[o + 4] = color[0];
            data[o + 5] = color[1];
            data[o + 6] = color[2];
            data[o + 7] = color[3];
            instance++;
        }
        return { rangeStart, rangeCount: instance - rangeStart };
    };

    if (faceted) {
        for (const facet of chart._facets) {
            const preStart = facet.instanceStart;
            const preEnd = preStart + facet.instanceCount;
            const { rangeStart, rangeCount } = emitRange(
                preStart,
                preEnd,
                facet.drillRoot,
            );
            facet.instanceStart = rangeStart;
            facet.instanceCount = rangeCount;
        }
    } else {
        emitRange(0, chart._visibleNodeCount, chart._currentRootId);
    }

    chart._instanceCount = instance;
    gl.bindBuffer(gl.ARRAY_BUFFER, chart._instanceBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        data.subarray(0, instance * 8),
        gl.DYNAMIC_DRAW,
    );
}

/**
 * Dispatch one instanced draw over `[instanceStart, instanceStart+count)`
 * of the shared arc instance buffer. In single-plot mode the range is
 * the whole buffer; in faceted mode the caller dispatches once per
 * facet with the matching `u_center` uniform.
 *
 * Instance attribute pointers are rebound with a byte offset per call
 * so instance 0 of the draw is the facet's first arc.
 */
function drawArcs(
    chart: SunburstChart,
    gl: WebGL2RenderingContext | WebGLRenderingContext,
    glManager: WebGLContextManager,
    instanceStart: number,
    instanceCount: number,
): void {
    if (instanceCount === 0) return;
    const loc = chart._locations!;

    // Static strip: per-vertex (strip_t, side).
    gl.bindBuffer(gl.ARRAY_BUFFER, chart._stripBuffer!);
    const stripStride = 2 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(loc.a_strip_t);
    gl.vertexAttribPointer(loc.a_strip_t, 1, gl.FLOAT, false, stripStride, 0);
    gl.enableVertexAttribArray(loc.a_side);
    gl.vertexAttribPointer(
        loc.a_side,
        1,
        gl.FLOAT,
        false,
        stripStride,
        Float32Array.BYTES_PER_ELEMENT,
    );

    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;
    setDivisor(loc.a_strip_t, 0);
    setDivisor(loc.a_side, 0);

    // Per-instance interleaved buffer (rebind with byte offset so
    // instance 0 of the draw is slot `instanceStart`). Layout:
    //   [0..1] a_angles (a0, a1)
    //   [2..3] a_radii  (r0, r1)
    //   [4..7] a_color  (r, g, b, a)
    gl.bindBuffer(gl.ARRAY_BUFFER, chart._instanceBuffer!);
    const instStride = 8 * Float32Array.BYTES_PER_ELEMENT;
    const f = Float32Array.BYTES_PER_ELEMENT;
    const base = instanceStart * instStride;
    gl.enableVertexAttribArray(loc.a_angles);
    gl.vertexAttribPointer(loc.a_angles, 2, gl.FLOAT, false, instStride, base);
    setDivisor(loc.a_angles, 1);
    gl.enableVertexAttribArray(loc.a_radii);
    gl.vertexAttribPointer(
        loc.a_radii,
        2,
        gl.FLOAT,
        false,
        instStride,
        base + 2 * f,
    );
    setDivisor(loc.a_radii, 1);
    gl.enableVertexAttribArray(loc.a_color);
    gl.vertexAttribPointer(
        loc.a_color,
        4,
        gl.FLOAT,
        false,
        instStride,
        base + 4 * f,
    );
    setDivisor(loc.a_color, 1);

    instancing.drawArraysInstanced(
        gl.TRIANGLE_STRIP,
        0,
        2 * (N_STEPS + 1),
        instanceCount,
    );

    setDivisor(loc.a_angles, 0);
    setDivisor(loc.a_radii, 0);
    setDivisor(loc.a_color, 0);
}

// ── Chrome overlay (Canvas2D) ────────────────────────────────────────────

export function renderSunburstChromeOverlay(chart: SunburstChart): void {
    if (!chart._chromeCanvas || chart._currentRootId === NULL_NODE) return;

    const canvas = chart._chromeCanvas;
    const dpr = window.devicePixelRatio || 1;

    const domRect = canvas.getBoundingClientRect();
    const cssWidth = domRect.width;
    const cssHeight = domRect.height;
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        chart._chromeCacheDirty = true;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (chart._chromeCacheDirty) {
        chart._chromeCache?.close();
        chart._chromeCache = null;
        chart._chromeCacheDirty = false;
        // Bump gen so in-flight `createImageBitmap` calls from prior
        // static draws see a mismatch and discard their snapshot.
        const gen = ++chart._chromeCacheGen;
        drawStaticChrome(chart, ctx, dpr, cssWidth, cssHeight);

        createImageBitmap(canvas).then((bmp) => {
            if (chart._chromeCacheGen === gen) {
                chart._chromeCache?.close();
                chart._chromeCache = bmp;
            } else {
                bmp.close();
            }
        });
    } else if (chart._chromeCache) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(chart._chromeCache, 0, 0);
    }

    if (chart._hoveredNodeId !== NULL_NODE) {
        ctx.save();
        ctx.scale(dpr, dpr);
        renderHoverHighlight(ctx, chart, chart._hoveredNodeId);
        renderSunburstTooltip(
            chart,
            ctx,
            chart._hoveredNodeId,
            cssWidth,
            cssHeight,
            resolveTheme(canvas).fontFamily,
        );
        ctx.restore();
    }
}

function drawStaticChrome(
    chart: SunburstChart,
    ctx: CanvasRenderingContext2D,
    dpr: number,
    cssWidth: number,
    cssHeight: number,
): void {
    const canvas = chart._chromeCanvas!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const themeEl = chart._gridlineCanvas || canvas;
    const theme = resolveTheme(themeEl);
    const { fontFamily, labelColor: textColor, tooltipBg } = theme;
    const stops = theme.gradientStops;
    const palette = resolvePalette(
        readSeriesPalette(themeEl),
        stops,
        Math.max(1, chart._uniqueColorLabels.size),
    );
    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds!;
    const n = chart._visibleNodeCount;
    const faceted = chart._facets.length > 0;
    const drillRoots = faceted
        ? new Set<number>(chart._facets.map((f) => f.drillRoot))
        : null;

    // Arc labels — skip the facet's own drill root (its label is the
    // center text / facet title, handled below).
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (faceted) {
            if (drillRoots!.has(id)) continue;
        } else if (id === chart._currentRootId) {
            continue;
        }
        renderArcLabel(chart, ctx, id, fontFamily, stops, palette);
    }

    // Inner drill-up circle(s). One per facet in faceted mode so each
    // facet has its own center hit target.
    const innerDiscR = Math.max(0, INNER_RING_PX - theme.sunburstGapPx * 0.5);
    ctx.fillStyle = tooltipBg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (faceted) {
        for (const facet of chart._facets) {
            ctx.beginPath();
            ctx.fillStyle = tooltipBg;
            ctx.arc(facet.centerX, facet.centerY, innerDiscR, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = textColor;
            ctx.font = `11px ${fontFamily}`;
            ctx.fillText(
                store.name[facet.drillRoot],
                facet.centerX,
                facet.centerY,
            );
            // Facet title band above the arcs.
            if (chart._facetGrid) {
                const cell = chart._facetGrid.cells.find(
                    (c) => c.label === facet.label,
                );
                if (cell?.titleRect) {
                    ctx.fillStyle = textColor;
                    ctx.font = `11px ${fontFamily}`;
                    ctx.textBaseline = "middle";
                    ctx.fillText(
                        facet.label,
                        cell.titleRect.x + cell.titleRect.width / 2,
                        cell.titleRect.y + cell.titleRect.height / 2,
                    );
                }
            }
        }
    } else {
        ctx.beginPath();
        ctx.arc(chart._centerX, chart._centerY, innerDiscR, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.font = `11px ${fontFamily}`;
        ctx.fillText(
            store.name[chart._currentRootId],
            chart._centerX,
            chart._centerY,
        );
    }

    // Breadcrumbs (non-facet only — per-facet drill is tracked through
    // the per-facet drill root's label, not a global breadcrumb trail).
    if (!faceted && chart._breadcrumbIds.length > 1) {
        renderBreadcrumbs(chart, ctx, cssWidth, fontFamily, textColor);
    }

    // Legend. In faceted mode use the grid's explicit rect; otherwise
    // derive from a synthetic single-plot layout.
    if (faceted && chart._facetGrid?.legendRect) {
        if (
            chart._colorMode === "series" &&
            chart._uniqueColorLabels.size > 1
        ) {
            renderCategoricalLegendAt(
                canvas,
                chart._facetGrid.legendRect,
                chart._uniqueColorLabels,
                palette,
            );
        } else if (
            chart._colorMode === "numeric" &&
            chart._colorMin < chart._colorMax
        ) {
            const legendLayout = new PlotLayout(cssWidth, cssHeight, {
                hasXLabel: false,
                hasYLabel: false,
                hasLegend: true,
            });
            renderLegend(
                canvas,
                legendLayout,
                {
                    min: chart._colorMin,
                    max: chart._colorMax,
                    label: chart._colorName,
                },
                stops,
            );
        }
    } else if (
        chart._colorMode === "series" &&
        chart._uniqueColorLabels.size > 1
    ) {
        const legendLayout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: false,
            hasYLabel: false,
            hasLegend: true,
        });
        renderCategoricalLegend(
            canvas,
            legendLayout,
            chart._uniqueColorLabels,
            palette,
        );
    } else if (
        chart._colorMode === "numeric" &&
        chart._colorMin < chart._colorMax
    ) {
        const legendLayout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: false,
            hasYLabel: false,
            hasLegend: true,
        });
        renderLegend(
            canvas,
            legendLayout,
            {
                min: chart._colorMin,
                max: chart._colorMax,
                label: chart._colorName,
            },
            stops,
        );
    }

    ctx.restore();
}

/**
 * Label placement: rotate the label *radial* to the arc at its midpoint
 * (text runs along the radius, from near the center outward). In
 * `"upright"` mode, arcs on the left half get an extra 180° flip so
 * text reads left-to-right in both halves; `"radial"` mode skips the
 * flip — simpler, but labels on the left read right-to-left.
 *
 * Sizing:
 *   - Text length fits in the ring width (radial direction).
 *   - Font size fits in the arc length at mid-radius (tangential
 *     direction).
 */
function renderArcLabel(
    chart: SunburstChart,
    ctx: CanvasRenderingContext2D,
    nodeId: number,
    fontFamily: string,
    stops: GradientStop[],
    palette: Vec3[],
): void {
    const store = chart._nodeStore;
    const a0 = store.a0[nodeId];
    const a1 = store.a1[nodeId];
    const r0 = store.r0[nodeId];
    const r1 = store.r1[nodeId];
    const ringWidth = r1 - r0;
    const midR = (r0 + r1) / 2;
    const arcSpan = a1 - a0;
    const arcLen = arcSpan * midR;

    // Radial labels need enough ring-width for text length and enough
    // tangential space for font height.
    if (ringWidth < 16 || arcLen < 8) return;

    const fontSize = Math.min(11, Math.floor(arcLen * 0.7));
    if (fontSize < 7) return;

    ctx.font = `${fontSize}px ${fontFamily}`;
    const name = store.name[nodeId];
    const maxTextWidth = ringWidth - 4;
    let text = name;
    if (ctx.measureText(text).width > maxTextWidth) {
        while (text.length > 1) {
            text = text.slice(0, -1);
            if (ctx.measureText(text + "…").width <= maxTextWidth) {
                text += "…";
                break;
            }
        }
    }
    if (text.length < 2) return;

    const midA = (a0 + a1) / 2;

    ctx.save();
    ctx.translate(chart._centerX, chart._centerY);
    // Rotate so the local +x axis points outward along the radius
    // through the arc's midpoint. Text then runs along that axis.
    let rot = midA;
    const onLeftHalf = midA > Math.PI / 2 && midA < (3 * Math.PI) / 2;
    if (chart._labelRotation === "upright" && onLeftHalf) {
        rot += Math.PI;
    }
    ctx.rotate(rot);

    // Pick label color by luminance of the arc's fill for contrast.
    const fill = leafColor(chart, nodeId, stops, palette);
    const lum = luminance(fill[0], fill[1], fill[2]);
    ctx.fillStyle = lum > 0.5 ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Place the label at radial midpoint along the rotated x-axis.
    // Flip the sign when upright-mirrored so the center stays at the
    // correct radial position (the rotation brought +x through the
    // origin, so midR is now on the "back" side in local coords).
    const x = chart._labelRotation === "upright" && onLeftHalf ? -midR : midR;
    ctx.fillText(text, x, 0);
    ctx.restore();
}

function renderBreadcrumbs(
    chart: SunburstChart,
    ctx: CanvasRenderingContext2D,
    cssWidth: number,
    fontFamily: string,
    textColor: string,
): void {
    chart._breadcrumbRegions = [];
    const bgColor = resolveTheme(chart._chromeCanvas!).tooltipBg;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cssWidth, 24);

    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    let x = 8;
    const y = 12;
    const store = chart._nodeStore;

    for (let i = 0; i < chart._breadcrumbIds.length; i++) {
        const crumbId = chart._breadcrumbIds[i];
        const isLast = i === chart._breadcrumbIds.length - 1;
        const label = store.name[crumbId];

        ctx.fillStyle = textColor;
        ctx.font = isLast ? `11px ${fontFamily}` : `11px ${fontFamily}`;
        const textW = ctx.measureText(label).width;
        ctx.fillText(label, x, y);

        chart._breadcrumbRegions.push({
            nodeId: crumbId,
            x0: x - 2,
            y0: 0,
            x1: x + textW + 2,
            y1: 24,
        });

        x += textW;
        if (!isLast) {
            const sep = " › ";
            ctx.fillText(sep, x, y);
            x += ctx.measureText(sep).width;
        }
    }
}

function renderHoverHighlight(
    ctx: CanvasRenderingContext2D,
    chart: SunburstChart,
    nodeId: number,
): void {
    const store = chart._nodeStore;
    const a0 = store.a0[nodeId];
    const a1 = store.a1[nodeId];
    const r0 = store.r0[nodeId];
    const r1 = store.r1[nodeId];

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(chart._centerX, chart._centerY, r1, a0, a1);
    ctx.arc(chart._centerX, chart._centerY, r0, a1, a0, true);
    ctx.closePath();
    ctx.stroke();
}

function renderSunburstTooltip(
    chart: SunburstChart,
    ctx: CanvasRenderingContext2D,
    nodeId: number,
    cssWidth: number,
    cssHeight: number,
    fontFamily: string,
): void {
    const theme = resolveTheme(chart._chromeCanvas!);
    const { tooltipBg, tooltipText, tooltipBorder } = theme;

    // Lines come from the async lazy tooltip fetch in
    // `handleSunburstHover`; empty while in flight.
    const lines =
        chart._hoveredTooltipNodeId === nodeId
            ? (chart._hoveredTooltipLines ?? [])
            : [];
    if (lines.length === 0) return;

    ctx.font = `11px ${fontFamily}`;
    const lineHeight = 16;
    const padding = 8;
    let maxWidth = 0;
    for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxWidth) maxWidth = w;
    }
    const boxW = maxWidth + padding * 2;
    const boxH = lines.length * lineHeight + padding * 2 - 4;

    const store = chart._nodeStore;
    const midA = (store.a0[nodeId] + store.a1[nodeId]) / 2;
    const midR = (store.r0[nodeId] + store.r1[nodeId]) / 2;
    const cx = chart._centerX + Math.cos(midA) * midR;
    const cy = chart._centerY + Math.sin(midA) * midR;
    let tx = cx + 12;
    let ty = cy - boxH - 8;
    if (tx + boxW > cssWidth) tx = cx - boxW - 12;
    if (tx < 0) tx = 4;
    if (ty < 0) ty = cy + 12;
    if (ty + boxH > cssHeight) ty = cssHeight - boxH - 4;

    ctx.fillStyle = tooltipBg;
    ctx.strokeStyle = tooltipBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = tooltipText;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], tx + padding, ty + padding + i * lineHeight);
    }
}
