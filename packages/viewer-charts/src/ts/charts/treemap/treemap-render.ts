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

import type { Context2D } from "../canvas-types";
import type { WebGLContextManager } from "../../webgl/context-manager";
import type { TreemapChart } from "./treemap";
import { NULL_NODE } from "../common/node-store";
import {
    squarify,
    collectVisible,
    collectVisibleAppend,
} from "./treemap-layout";
import { Theme } from "../../theme/theme";
import { resolvePalette, type Vec3 } from "../../theme/palette";
import { type GradientStop } from "../../theme/gradient";
import { renderLegend, renderCategoricalLegend } from "../../axis/legend";
import { PlotLayout } from "../../layout/plot-layout";
import { buildFacetGrid } from "../../layout/facet-grid";
import { leafColor, leafRGBA, luminance } from "../common/leaf-color";
import treemapVert from "../../shaders/treemap.vert.glsl";
import treemapFrag from "../../shaders/treemap.frag.glsl";
import { withChromeCache } from "../common/chrome-cache";
import { wrapLabel } from "../../axis/label-geometry";
import {
    renderBreadcrumbs as renderTreeBreadcrumbs,
    renderTreeTooltip,
} from "../common/tree-chrome";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

/**
 * Full-frame treemap render: layout → WebGL rects → chrome overlay.
 *
 * When `_splitBy` is populated the top-level children of `_rootId`
 * become facet roots; each is squarified into its own cell rect via
 * {@link buildFacetGrid}. The visible-node list is concatenated across
 * facets so a single vertex buffer + draw call covers the whole scene.
 */
export function renderTreemapFrame(
    chart: TreemapChart,
    glManager: WebGLContextManager,
): void {
    if (chart._currentRootId === NULL_NODE) {
        return;
    }

    const gl = glManager.gl;
    const cssWidth = glManager.cssWidth;
    const cssHeight = glManager.cssHeight;
    if (cssWidth <= 0 || cssHeight <= 0) {
        return;
    }

    const store = chart._nodeStore;
    const hasSplits =
        chart._splitBy.length > 0 && chart._facetConfig.facet_mode === "grid";

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

    if (hasSplits) {
        layoutFaceted(
            chart,
            scratch,
            cssWidth,
            cssHeight,
            breadcrumbH,
            legendW,
        );
    } else {
        chart._facetGrid = null;
        const baseDepth = store.depth[chart._currentRootId];
        squarify(
            store,
            chart._currentRootId,
            0,
            breadcrumbH,
            cssWidth - legendW,
            cssHeight,
            baseDepth,
            scratch,
            chart._showBranchHeader,
        );
        collectVisible(chart, chart._currentRootId, 100, baseDepth);
        ensureVisibleMetadata(chart);
        const baseArr = chart._visibleBaseDepths!;
        const rootArr = chart._visibleRootIds!;
        for (let k = 0; k < chart._visibleNodeCount; k++) {
            baseArr[k] = baseDepth;
            rootArr[k] = chart._currentRootId;
        }
    }

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

    const theme = chart._resolveTheme();
    const stops = theme.gradientStops;
    const palette = resolvePalette(
        theme.seriesPalette,
        stops,
        Math.max(1, chart._uniqueColorLabels.size),
    );

    if (chart._gridlineCanvas) {
        const gCtx = chart._gridlineCanvas.getContext("2d") as Context2D | null;
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

    generateAndUploadTreemap(chart, gl, stops, palette, theme.areaOpacity);

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
    gl.vertexAttribPointer(chart._locations!.a_color, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, chart._vertexCount);

    renderTreemapChromeOverlay(chart);
}

/**
 * Faceted layout: each top-level child of `_rootId` is one facet.
 * Squarify per cell into the cell's rect and concatenate visible
 * nodes, so downstream rendering and hit-testing treat the scene as
 * one flat visible list.
 *
 * `_visibleBaseDepths` and `_visibleRootIds` are filled in parallel so
 * render code can compute the relative depth of each node without
 * knowing its owning facet. Non-facet callers leave these as copies of
 * the single `_currentRootId` depth.
 */
function layoutFaceted(
    chart: TreemapChart,
    scratch: Int32Array,
    cssWidth: number,
    cssHeight: number,
    breadcrumbH: number,
    legendW: number,
): void {
    const store = chart._nodeStore;

    // Collect the facet roots in declaration order (= top-level children
    // of the synthetic root). Skip zero-value facets.
    const facetIds: number[] = [];
    const labels: string[] = [];
    for (
        let c = store.firstChild[chart._rootId];
        c !== NULL_NODE;
        c = store.nextSibling[c]
    ) {
        if (store.value[c] <= 0) {
            continue;
        }

        facetIds.push(c);
        labels.push(store.name[c]);
    }

    const gridHeight = Math.max(1, cssHeight - breadcrumbH);
    const gridWidth = Math.max(1, cssWidth - legendW);
    const grid = buildFacetGrid(labels, {
        cssWidth: gridWidth,
        cssHeight: gridHeight,
        hasLegend: false, // legend rect handled separately by the chrome
        // Treemap has no X/Y axes — skip the per-cell axis gutters and
        // let adjacent cell plot rects sit flush.
        xAxis: "none",
        yAxis: "none",
        gap: chart._facetConfig.facet_padding,
    });
    chart._facetGrid = grid;

    ensureVisibleMetadata(chart);
    const baseArr = chart._visibleBaseDepths!;

    let outIdx = 0;
    for (let i = 0; i < facetIds.length; i++) {
        const facetId = facetIds[i];
        const cell = grid.cells[i];
        if (!cell) {
            continue;
        }

        const label = store.name[facetId];
        const drillRoot = chart._facetDrillRoots.get(label) ?? facetId;
        const baseDepth = store.depth[drillRoot];
        const plot = cell.layout.plotRect;

        // Shift by breadcrumb band — `buildFacetGrid` works in a
        // local coord system starting at (0,0), but we need absolute
        // canvas coords for squarify's rect.
        squarify(
            store,
            drillRoot,
            plot.x,
            plot.y + breadcrumbH,
            plot.x + plot.width,
            plot.y + breadcrumbH + plot.height,
            baseDepth,
            scratch,
            chart._showBranchHeader,
        );
        const nextIdx = collectVisibleAppend(
            chart,
            drillRoot,
            100,
            baseDepth,
            outIdx,
        );

        // Ensure metadata arrays are wide enough after the append.
        if (baseArr.length < nextIdx) {
            ensureVisibleMetadata(chart);
        }

        const baseArr2 = chart._visibleBaseDepths!;
        const rootArr2 = chart._visibleRootIds!;
        for (let k = outIdx; k < nextIdx; k++) {
            baseArr2[k] = baseDepth;
            rootArr2[k] = drillRoot;
        }

        outIdx = nextIdx;
    }

    chart._visibleNodeCount = outIdx;
}

function ensureVisibleMetadata(chart: TreemapChart): void {
    const need = chart._visibleNodeIds?.length ?? chart._nodeStore.count;
    if (!chart._visibleBaseDepths || chart._visibleBaseDepths.length < need) {
        chart._visibleBaseDepths = new Int32Array(need);
    }

    if (!chart._visibleRootIds || chart._visibleRootIds.length < need) {
        chart._visibleRootIds = new Int32Array(need);
    }
}

function generateAndUploadTreemap(
    chart: TreemapChart,
    gl: GL,
    stops: GradientStop[],
    palette: Vec3[],
    negativeAlpha: number,
): void {
    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds!;
    const n = chart._visibleNodeCount;
    const baseArr = chart._visibleBaseDepths;
    const rootArr = chart._visibleRootIds;

    const baseDepthOf = (i: number): number =>
        baseArr ? baseArr[i] : store.depth[chart._currentRootId];
    const rootOf = (i: number): number =>
        rootArr ? rootArr[i] : chart._currentRootId;

    // Count the rects we'll emit so we can size the buffers exactly.
    let rectCount = 0;
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === rootOf(i)) {
            continue;
        }

        const w = store.x1[id] - store.x0[id];
        const h = store.y1[id] - store.y0[id];
        if (w < 1 || h < 1) {
            continue;
        }

        if (store.firstChild[id] === NULL_NODE) {
            rectCount++;
        } else if (store.depth[id] - baseDepthOf(i) === 1) {
            rectCount += 2;
        }
    }

    const positions = new Float32Array(rectCount * 6 * 2);

    // 4 floats per vertex (RGBA) — negative-size leaves emit with a
    // reduced alpha (= `theme.areaOpacity`); everything else is opaque.
    const colors = new Float32Array(rectCount * 6 * 4);
    let vi = 0;

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (id === rootOf(i)) {
            continue;
        }

        const sx0 = store.x0[id];
        const sy0 = store.y0[id];
        const sx1 = store.x1[id];
        const sy1 = store.y1[id];
        const w = sx1 - sx0;
        const h = sy1 - sy0;
        if (w < 1 || h < 1) {
            continue;
        }

        if (store.firstChild[id] === NULL_NODE) {
            const color = leafRGBA(chart, id, stops, palette, negativeAlpha);
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
            const relDepth = store.depth[id] - baseDepthOf(i);
            if (relDepth === 1) {
                // Branch borders are structural; always opaque.
                const borderColor: [number, number, number, number] = [
                    0.25, 0.25, 0.25, 1.0,
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

    if (!chart._positionBuffer) {
        chart._positionBuffer = gl.createBuffer();
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, chart._positionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        positions.subarray(0, vi * 2),
        gl.DYNAMIC_DRAW,
    );

    if (!chart._colorBuffer) {
        chart._colorBuffer = gl.createBuffer();
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, chart._colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, vi * 4), gl.DYNAMIC_DRAW);
}

function emitRect(
    positions: Float32Array,
    colors: Float32Array,
    vi: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: [number, number, number, number],
): number {
    const pi = vi * 2;
    const ci = vi * 4;

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
        colors[ci + v * 4 + 0] = color[0];
        colors[ci + v * 4 + 1] = color[1];
        colors[ci + v * 4 + 2] = color[2];
        colors[ci + v * 4 + 3] = color[3];
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
    if (!chart._chromeCanvas || chart._currentRootId === NULL_NODE) {
        return;
    }

    const glManager = chart._glManager;
    if (!glManager) {
        return;
    }

    const { dpr, cssWidth, cssHeight } = glManager;

    const highlightId =
        chart._pinnedNodeId !== NULL_NODE
            ? chart._pinnedNodeId
            : chart._hoveredNodeId;

    withChromeCache(
        chart,
        chart._chromeCanvas,
        dpr,
        cssWidth,
        cssHeight,
        (ctx) => drawStaticChrome(chart, ctx, dpr, cssWidth, cssHeight),
        highlightId !== NULL_NODE
            ? (ctx) => {
                  const theme = chart._resolveTheme();
                  const { fontFamily } = theme;
                  const store = chart._nodeStore;

                  renderHoverHighlight(ctx, store, highlightId);

                  const ids = chart._visibleNodeIds!;
                  const n = chart._visibleNodeCount;
                  const baseArr = chart._visibleBaseDepths;
                  const rootArr = chart._visibleRootIds;
                  for (let i = 0; i < n; i++) {
                      const id = ids[i];
                      const rootId = rootArr
                          ? rootArr[i]
                          : chart._currentRootId;
                      if (id === rootId || store.firstChild[id] === NULL_NODE) {
                          continue;
                      }

                      const nw = store.x1[id] - store.x0[id];
                      const nh = store.y1[id] - store.y0[id];
                      const baseDepth = baseArr
                          ? baseArr[i]
                          : store.depth[chart._currentRootId];
                      const relDepth = store.depth[id] - baseDepth;
                      if (relDepth === 1) {
                          renderBranchLabel(
                              ctx,
                              store,
                              id,
                              nw,
                              nh,
                              theme,
                              !chart._showBranchHeader,
                          );
                      } else if (relDepth === 2) {
                          renderBranchLabel(
                              ctx,
                              store,
                              id,
                              nw,
                              nh,
                              theme,
                              true,
                          );
                      }
                  }

                  if (store.firstChild[highlightId] === NULL_NODE) {
                      const stops = theme.gradientStops;
                      const palette = resolvePalette(
                          theme.seriesPalette,
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
              }
            : null,
    );
}

function drawStaticChrome(
    chart: TreemapChart,
    ctx: Context2D,
    dpr: number,
    cssWidth: number,
    cssHeight: number,
): void {
    const canvas = chart._chromeCanvas!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const theme = chart._resolveTheme();
    const { fontFamily, labelColor: textColor } = theme;
    const stops = theme.gradientStops;
    const palette = resolvePalette(
        theme.seriesPalette,
        stops,
        Math.max(1, chart._uniqueColorLabels.size),
    );

    const store = chart._nodeStore;
    const ids = chart._visibleNodeIds!;
    const n = chart._visibleNodeCount;
    const baseArr = chart._visibleBaseDepths;
    const rootArr = chart._visibleRootIds;

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        const rootId = rootArr ? rootArr[i] : chart._currentRootId;
        if (id === rootId || store.firstChild[id] !== NULL_NODE) {
            continue;
        }

        const w = store.x1[id] - store.x0[id];
        const h = store.y1[id] - store.y0[id];
        renderNodeLabel(chart, ctx, id, w, h, fontFamily, stops, palette);
    }

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        const rootId = rootArr ? rootArr[i] : chart._currentRootId;
        if (id === rootId || store.firstChild[id] === NULL_NODE) {
            continue;
        }

        const w = store.x1[id] - store.x0[id];
        const h = store.y1[id] - store.y0[id];
        const baseDepth = baseArr
            ? baseArr[i]
            : store.depth[chart._currentRootId];
        const relDepth = store.depth[id] - baseDepth;
        if (relDepth === 1) {
            renderBranchLabel(
                ctx,
                store,
                id,
                w,
                h,
                theme,
                !chart._showBranchHeader,
            );
        } else if (relDepth === 2) {
            renderBranchLabel(ctx, store, id, w, h, theme, true);
        }
    }

    if (chart._breadcrumbIds.length > 1) {
        renderTreeBreadcrumbs(chart, ctx, cssWidth, fontFamily, textColor);
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
            theme,
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
            theme,
            chart.getColumnFormatter(chart._colorName, "value"),
        );
    }

    // Per-facet titles (rendered over the layout; painted in the static
    // chrome bitmap so they appear alongside leaf labels).
    if (chart._facetGrid) {
        ctx.font = `11px ${fontFamily}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (const cell of chart._facetGrid.cells) {
            const plot = cell.layout.plotRect;
            ctx.fillText(cell.label, plot.x + plot.width / 2, plot.y - 14);
        }
    }

    ctx.restore();
}

function renderNodeLabel(
    chart: TreemapChart,
    ctx: Context2D,
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

    if (w < 30 || h < 14) {
        return;
    }

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
    if (fontSize < 7) {
        return;
    }

    ctx.font = `${fontSize}px ${fontFamily}`;

    const maxW = w - PAD * 2;
    const lineH = fontSize * LINE_HEIGHT;
    const maxLines = Math.max(1, Math.floor((h - PAD * 2) / lineH));

    const lines = wrapLabel(ctx, store.name[nodeId], maxW, maxLines);
    if (lines.length === 0) {
        return;
    }

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

function renderBranchLabel(
    ctx: Context2D,
    store: import("../common/node-store").NodeStore,
    nodeId: number,
    w: number,
    h: number,
    { fontFamily, labelColor, backgroundColor }: Theme,
    nested: boolean,
): void {
    const x0 = store.x0[nodeId];
    const y0 = store.y0[nodeId];
    const name = store.name[nodeId];

    if (nested) {
        if (w < 60 || h < 30) {
            return;
        }

        const fontSize = 12;
        ctx.font = `${fontSize}px ${fontFamily}`;

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

        if (text.length <= 3) {
            return;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, w, h);
        ctx.clip();

        const cx = x0 + w / 2;
        const cy = y0 + h / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 2;
        ctx.strokeStyle = labelColor;
        ctx.lineJoin = "round";
        ctx.strokeText(text, cx, cy);
        ctx.fillStyle = backgroundColor;
        ctx.fillText(text, cx, cy);

        ctx.restore();
    } else {
        if (w < 40 || h < 22) {
            return;
        }

        const fontSize = 11;
        ctx.font = `${fontSize}px ${fontFamily}`;

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

        ctx.fillStyle = labelColor;
        ctx.globalAlpha = 0.85;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(text, x0 + 5, y0 + 4);
        ctx.globalAlpha = 1.0;
    }
}

function renderHoverHighlight(
    ctx: Context2D,
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
    ctx: Context2D,
    nodeId: number,
    cssWidth: number,
    cssHeight: number,
    fontFamily: string,
): void {
    const store = chart._nodeStore;
    const cx = (store.x0[nodeId] + store.x1[nodeId]) / 2;
    const cy = (store.y0[nodeId] + store.y1[nodeId]) / 2;
    renderTreeTooltip(
        chart,
        ctx,
        nodeId,
        cx,
        cy,
        cssWidth,
        cssHeight,
        fontFamily,
    );
}
