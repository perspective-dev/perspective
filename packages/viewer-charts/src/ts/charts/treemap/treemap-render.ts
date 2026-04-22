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
import type { TreemapChart } from "./treemap";
import { NULL_NODE } from "../common/node-store";
import { squarify, collectVisible } from "./treemap-layout";
import { resolveTheme, readSeriesPalette } from "../../theme/theme";
import { resolvePalette, type Vec3 } from "../../theme/palette";
import {
    colorValueToT,
    sampleGradient,
    type GradientStop,
} from "../../theme/gradient";
import { renderLegend, renderCategoricalLegend } from "../../chrome/legend";
import { PlotLayout } from "../../layout/plot-layout";
import treemapVert from "../../shaders/treemap.vert.glsl";
import treemapFrag from "../../shaders/treemap.frag.glsl";
import { buildTreemapTooltipLines } from "./treemap-interact";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

function luminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sampleRGB(stops: GradientStop[], t: number): [number, number, number] {
    const c = sampleGradient(stops, t);
    return [c[0], c[1], c[2]];
}

/**
 * Resolve a leaf's fill color according to the chart's color mode:
 *   - `"numeric"` — sign-aware gradient sample via `colorValueToT`.
 *   - `"series"` / `"empty"` — discrete palette lookup keyed by the
 *     node's `colorLabel` (composite of group_by levels in series mode;
 *     `""` in empty mode, which maps to `palette[0]`).
 */
function leafColor(
    chart: TreemapChart,
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
 * Full-frame treemap render: layout → WebGL rects → chrome overlay.
 */
export function renderTreemapFrame(
    chart: TreemapChart,
    glManager: WebGLContextManager,
): void {
    if (chart._currentRootId === NULL_NODE) return;

    const gl = glManager.gl;
    const cssWidth = (gl.canvas as HTMLCanvasElement).getBoundingClientRect()
        .width;
    const cssHeight = (gl.canvas as HTMLCanvasElement).getBoundingClientRect()
        .height;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    const store = chart._nodeStore;
    const baseDepth = store.depth[chart._currentRootId];

    const breadcrumbH = chart._breadcrumbIds.length > 1 ? 28 : 0;
    const hasLegend =
        chart._colorMode === "series"
            ? chart._uniqueColorLabels.size > 1
            : chart._colorMode === "numeric" &&
              chart._colorMin < chart._colorMax;
    const legendW = hasLegend ? 90 : 0;

    // Scratch buffer for the ordered-layout child ids. Worst case:
    // active children at every level = store.count. Reuse the chart's
    // visible-id buffer as scratch when large enough.
    const scratch = new Int32Array(Math.max(store.count, 64));

    squarify(
        store,
        chart._currentRootId,
        0,
        breadcrumbH,
        cssWidth - legendW,
        cssHeight,
        baseDepth,
        scratch,
    );

    collectVisible(chart, chart._currentRootId, 100, baseDepth);

    if (!chart._program) {
        chart._program = glManager.shaders.getOrCreate(
            "treemap",
            treemapVert,
            treemapFrag,
        );
        chart._locations = {
            u_resolution: gl.getUniformLocation(chart._program, "u_resolution"),
            a_position: gl.getAttribLocation(chart._program, "a_position"),
            a_color: gl.getAttribLocation(chart._program, "a_color"),
        };
    }

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

    generateAndUploadTreemap(chart, gl, stops, palette);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(chart._program);
    gl.uniform2f(chart._locations!.u_resolution, cssWidth, cssHeight);

    gl.bindBuffer(gl.ARRAY_BUFFER, chart._positionBuffer);
    gl.enableVertexAttribArray(chart._locations!.a_position);
    gl.vertexAttribPointer(
        chart._locations!.a_position,
        2,
        gl.FLOAT,
        false,
        0,
        0,
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, chart._colorBuffer);
    gl.enableVertexAttribArray(chart._locations!.a_color);
    gl.vertexAttribPointer(chart._locations!.a_color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, chart._vertexCount);

    renderTreemapChromeOverlay(chart);
}

function generateAndUploadTreemap(
    chart: TreemapChart,
    gl: GL,
    stops: GradientStop[],
    palette: Vec3[],
): void {
    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds!;
    const n = chart._visibleNodeCount;
    const baseDepth = store.depth[chart._currentRootId];

    // Count the rects we'll emit so we can size the buffers exactly.
    let rectCount = 0;
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === chart._currentRootId) continue;
        const w = store.x1[id] - store.x0[id];
        const h = store.y1[id] - store.y0[id];
        if (w < 1 || h < 1) continue;
        if (store.firstChild[id] === NULL_NODE) {
            rectCount++;
        } else if (store.depth[id] - baseDepth === 1) {
            rectCount += 2;
        }
    }

    const positions = new Float32Array(rectCount * 6 * 2);
    const colors = new Float32Array(rectCount * 6 * 3);
    let vi = 0;

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === chart._currentRootId) continue;
        const sx0 = store.x0[id];
        const sy0 = store.y0[id];
        const sx1 = store.x1[id];
        const sy1 = store.y1[id];
        const w = sx1 - sx0;
        const h = sy1 - sy0;
        if (w < 1 || h < 1) continue;

        if (store.firstChild[id] === NULL_NODE) {
            const color = leafColor(chart, id, stops, palette);
            vi = emitRect(
                positions,
                colors,
                vi,
                sx0,
                sy0,
                sx1 - 1,
                sy1 - 1,
                color,
            );
        } else {
            const relDepth = store.depth[id] - baseDepth;
            if (relDepth === 1) {
                const borderColor: [number, number, number] = [
                    0.25, 0.25, 0.25,
                ];
                vi = emitRect(
                    positions,
                    colors,
                    vi,
                    sx0,
                    sy1 - 1,
                    sx1,
                    sy1,
                    borderColor,
                );
                vi = emitRect(
                    positions,
                    colors,
                    vi,
                    sx1 - 1,
                    sy0,
                    sx1,
                    sy1,
                    borderColor,
                );
            }
        }
    }

    chart._vertexCount = vi;

    if (!chart._positionBuffer) chart._positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, chart._positionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        positions.subarray(0, vi * 2),
        gl.DYNAMIC_DRAW,
    );

    if (!chart._colorBuffer) chart._colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, chart._colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, vi * 3), gl.DYNAMIC_DRAW);
}

function emitRect(
    positions: Float32Array,
    colors: Float32Array,
    vi: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: [number, number, number],
): number {
    const pi = vi * 2;
    const ci = vi * 3;

    positions[pi + 0] = x0;
    positions[pi + 1] = y0;
    positions[pi + 2] = x1;
    positions[pi + 3] = y0;
    positions[pi + 4] = x0;
    positions[pi + 5] = y1;

    positions[pi + 6] = x1;
    positions[pi + 7] = y0;
    positions[pi + 8] = x1;
    positions[pi + 9] = y1;
    positions[pi + 10] = x0;
    positions[pi + 11] = y1;

    for (let v = 0; v < 6; v++) {
        colors[ci + v * 3 + 0] = color[0];
        colors[ci + v * 3 + 1] = color[1];
        colors[ci + v * 3 + 2] = color[2];
    }

    return vi + 6;
}

/**
 * Render the chrome overlay. On layout changes, draws static content
 * (labels, breadcrumbs, legend) directly and snapshots it into a cached
 * bitmap. On hover-only updates, blits the cache and draws only the
 * tooltip + highlight on top.
 */
export function renderTreemapChromeOverlay(chart: TreemapChart): void {
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
        drawStaticChrome(chart, ctx, dpr, cssWidth, cssHeight);

        createImageBitmap(canvas).then((bmp) => {
            if (!chart._chromeCacheDirty) {
                chart._chromeCache = bmp;
            } else {
                bmp.close();
            }
        });
    } else if (chart._chromeCache) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(chart._chromeCache, 0, 0);
    }

    const highlightId =
        chart._pinnedNodeId !== NULL_NODE
            ? chart._pinnedNodeId
            : chart._hoveredNodeId;
    if (highlightId !== NULL_NODE) {
        ctx.save();
        ctx.scale(dpr, dpr);
        const theme = resolveTheme(canvas);
        const { fontFamily, labelColor: textColor } = theme;
        const store = chart._nodeStore;

        renderHoverHighlight(ctx, store, highlightId);

        const baseDepth = store.depth[chart._currentRootId];
        const ids = chart._visibleNodeIds!;
        const n = chart._visibleNodeCount;
        for (let i = 0; i < n; i++) {
            const id = ids[i];
            if (
                id === chart._currentRootId ||
                store.firstChild[id] === NULL_NODE
            )
                continue;
            const nw = store.x1[id] - store.x0[id];
            const nh = store.y1[id] - store.y0[id];
            const relDepth = store.depth[id] - baseDepth;
            if (relDepth === 1) {
                renderBranchLabel(
                    ctx,
                    store,
                    id,
                    nw,
                    nh,
                    fontFamily,
                    textColor,
                    false,
                );
            } else if (relDepth === 2) {
                renderBranchLabel(
                    ctx,
                    store,
                    id,
                    nw,
                    nh,
                    fontFamily,
                    textColor,
                    true,
                );
            }
        }

        if (store.firstChild[highlightId] === NULL_NODE) {
            const themeEl = chart._gridlineCanvas || canvas;
            const innerTheme = resolveTheme(themeEl);
            const stops = innerTheme.gradientStops;
            const palette = resolvePalette(
                readSeriesPalette(themeEl),
                stops,
                Math.max(1, chart._uniqueColorLabels.size),
            );
            const hw = store.x1[highlightId] - store.x0[highlightId];
            const hh = store.y1[highlightId] - store.y0[highlightId];
            renderNodeLabel(
                chart,
                ctx,
                highlightId,
                hw,
                hh,
                fontFamily,
                stops,
                palette,
                true,
            );
        }

        if (
            chart._pinnedNodeId === NULL_NODE &&
            chart._hoveredNodeId !== NULL_NODE
        ) {
            renderTreemapTooltip(
                chart,
                ctx,
                chart._hoveredNodeId,
                cssWidth,
                cssHeight,
                fontFamily,
            );
        }
        ctx.restore();
    }
}

function drawStaticChrome(
    chart: TreemapChart,
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
    const { fontFamily, labelColor: textColor } = theme;
    const stops = theme.gradientStops;
    const palette = resolvePalette(
        readSeriesPalette(themeEl),
        stops,
        Math.max(1, chart._uniqueColorLabels.size),
    );

    const store = chart._nodeStore;
    const baseDepth = store.depth[chart._currentRootId];
    const ids = chart._visibleNodeIds!;
    const n = chart._visibleNodeCount;

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === chart._currentRootId || store.firstChild[id] !== NULL_NODE)
            continue;
        const w = store.x1[id] - store.x0[id];
        const h = store.y1[id] - store.y0[id];
        renderNodeLabel(chart, ctx, id, w, h, fontFamily, stops, palette);
    }
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === chart._currentRootId || store.firstChild[id] === NULL_NODE)
            continue;
        const w = store.x1[id] - store.x0[id];
        const h = store.y1[id] - store.y0[id];
        const relDepth = store.depth[id] - baseDepth;
        if (relDepth === 1) {
            renderBranchLabel(
                ctx,
                store,
                id,
                w,
                h,
                fontFamily,
                textColor,
                false,
            );
        } else if (relDepth === 2) {
            renderBranchLabel(
                ctx,
                store,
                id,
                w,
                h,
                fontFamily,
                textColor,
                true,
            );
        }
    }

    if (chart._breadcrumbIds.length > 1) {
        renderBreadcrumbs(chart, ctx, cssWidth, fontFamily, textColor);
    }

    // Legend: numeric mode → gradient bar; series mode with 2+ unique
    // labels → categorical swatches. Empty mode (and single-label series)
    // suppress the legend entirely.
    if (chart._colorMode === "series" && chart._uniqueColorLabels.size > 1) {
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

function renderNodeLabel(
    chart: TreemapChart,
    ctx: CanvasRenderingContext2D,
    nodeId: number,
    w: number,
    h: number,
    fontFamily: string,
    stops: GradientStop[],
    palette: Vec3[],
    hovered = false,
): void {
    const MAX_FONT = 11;
    const PAD = 4;
    const LINE_HEIGHT = 1.3;

    if (w < 30 || h < 14) return;

    const store = chart._nodeStore;
    const fillColor = leafColor(chart, nodeId, stops, palette);

    const lum = luminance(fillColor[0], fillColor[1], fillColor[2]);
    const labelColor = hovered
        ? lum > 0.5
            ? "rgba(0,0,0,0.85)"
            : "rgba(255,255,255,0.9)"
        : lum > 0.5
          ? "rgba(0,0,0,0.5)"
          : "rgba(255,255,255,0.55)";

    const fontSize = Math.min(MAX_FONT, Math.floor(h / 2));
    if (fontSize < 7) return;
    ctx.font = `${fontSize}px ${fontFamily}`;

    const maxW = w - PAD * 2;
    const lineH = fontSize * LINE_HEIGHT;
    const maxLines = Math.max(1, Math.floor((h - PAD * 2) / lineH));

    const lines = wrapText(ctx, store.name[nodeId], maxW, maxLines);
    if (lines.length === 0) return;

    const blockH = lines.length * lineH;
    const startY = store.y0[nodeId] + (h - blockH) / 2 + lineH / 2;

    ctx.fillStyle = labelColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = store.x0[nodeId] + w / 2;
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx, startY + i * lineH);
    }
}

function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxW: number,
    maxLines: number,
): string[] {
    if (maxLines <= 0 || maxW <= 0) return [];

    if (ctx.measureText(text).width <= maxW) return [text];

    const lines: string[] = [];
    let remaining = text;

    while (remaining.length > 0 && lines.length < maxLines) {
        const isLastLine = lines.length === maxLines - 1;

        let fitLen = remaining.length;
        while (
            fitLen > 0 &&
            ctx.measureText(remaining.slice(0, fitLen)).width > maxW
        ) {
            fitLen--;
        }
        if (fitLen === 0) fitLen = 1;

        if (fitLen === remaining.length) {
            lines.push(remaining);
            break;
        }

        let breakAt = fitLen;
        const spaceIdx = remaining.lastIndexOf(" ", fitLen);
        if (spaceIdx > 0) breakAt = spaceIdx;

        if (isLastLine) {
            lines.push(truncateWithEllipsis(ctx, remaining, maxW));
            break;
        }

        lines.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).trimStart();
    }

    if (lines.length === 1 && lines[0].length <= 2) return [];
    return lines;
}

function truncateWithEllipsis(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxW: number,
): string {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1) {
        text = text.slice(0, -1);
        if (ctx.measureText(text + "\u2026").width <= maxW) {
            return text + "\u2026";
        }
    }
    return text;
}

function renderBranchLabel(
    ctx: CanvasRenderingContext2D,
    store: import("../common/node-store").NodeStore,
    nodeId: number,
    w: number,
    h: number,
    fontFamily: string,
    textColor: string,
    nested: boolean,
): void {
    const x0 = store.x0[nodeId];
    const y0 = store.y0[nodeId];
    const name = store.name[nodeId];

    if (nested) {
        if (w < 60 || h < 30) return;

        const fontSize = 12;
        ctx.font = `bold ${fontSize}px ${fontFamily}`;

        let text = name;
        const maxW = w - 16;
        const textW = ctx.measureText(text).width;
        if (textW > maxW) {
            while (text.length > 1) {
                text = text.slice(0, -1);
                if (ctx.measureText(text + "\u2026").width <= maxW) {
                    text += "\u2026";
                    break;
                }
            }
        }
        if (text.length <= 3) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, w, h);
        ctx.clip();

        const cx = x0 + w / 2;
        const cy = y0 + h / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
        ctx.lineJoin = "round";
        ctx.strokeText(text, cx, cy);
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fillText(text, cx, cy);

        ctx.restore();
    } else {
        if (w < 40 || h < 22) return;

        const fontSize = 11;
        ctx.font = `bold ${fontSize}px ${fontFamily}`;

        let text = name;
        const maxW = w - 10;
        const textW = ctx.measureText(text).width;
        if (textW > maxW) {
            while (text.length > 1) {
                text = text.slice(0, -1);
                if (ctx.measureText(text + "\u2026").width <= maxW) {
                    text += "\u2026";
                    break;
                }
            }
        }

        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.85;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(text, x0 + 5, y0 + 4);
        ctx.globalAlpha = 1.0;
    }
}

function renderBreadcrumbs(
    chart: TreemapChart,
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
        ctx.font = isLast ? `bold 11px ${fontFamily}` : `11px ${fontFamily}`;

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
            ctx.fillStyle = textColor;
            ctx.font = `11px ${fontFamily}`;
            const sep = " \u203A ";
            ctx.fillText(sep, x, y);
            x += ctx.measureText(sep).width;
        }
    }
}

function renderHoverHighlight(
    ctx: CanvasRenderingContext2D,
    store: import("../common/node-store").NodeStore,
    nodeId: number,
): void {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
        store.x0[nodeId],
        store.y0[nodeId],
        store.x1[nodeId] - store.x0[nodeId],
        store.y1[nodeId] - store.y0[nodeId],
    );
}

function renderTreemapTooltip(
    chart: TreemapChart,
    ctx: CanvasRenderingContext2D,
    nodeId: number,
    cssWidth: number,
    cssHeight: number,
    fontFamily: string,
): void {
    const theme = resolveTheme(chart._chromeCanvas!);
    const { tooltipBg, tooltipText, tooltipBorder } = theme;

    const lines = buildTreemapTooltipLines(chart, nodeId);
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
    const cx = (store.x0[nodeId] + store.x1[nodeId]) / 2;
    const cy = (store.y0[nodeId] + store.y1[nodeId]) / 2;
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
