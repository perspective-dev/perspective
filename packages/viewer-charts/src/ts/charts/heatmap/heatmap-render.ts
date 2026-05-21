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
import type { HeatmapChart } from "./heatmap";
import { PlotLayout } from "../../layout/plot-layout";
import { drawFacetTitle } from "../../axis/facet-chrome";
import {
    renderInPlotFrame,
    clearAndSetupFrame,
    withScissor,
} from "../../webgl/plot-frame";
import { getInstancing } from "../../webgl/instanced-attrs";
import { initCanvas } from "../../axis/canvas";
import { buildFacetGrid } from "../../layout/facet-grid";
import {
    measureCategoricalAxisHeight,
    renderCategoricalXTicks,
    type CategoricalDomain,
} from "../../axis/categorical-axis";
import {
    measureCategoricalAxisWidth,
    renderCategoricalYTicks,
    type CategoricalYAxisOptions,
} from "./heatmap-y-axis";
import {
    drawNumericCategoryX,
    drawNumericCategoryY,
} from "../../axis/bar-axis";
import { computeNiceTicks } from "../../layout/ticks";

// The heatmap's Y-axis column names end with the (single, externally
// enforced) aggregate name. That leaf column is a redundant constant and
// doesn't belong on the axis — promote the deepest split prefix to the
// leaf position instead.
const HEATMAP_Y_AXIS_OPTS: CategoricalYAxisOptions = {
    skipLeafLevel: true,
};

import { renderLegend, renderLegendAt } from "../../axis/legend";
import heatmapVert from "../../shaders/heatmap.vert.glsl";
import heatmapFrag from "../../shaders/heatmap.frag.glsl";
import { colorValueToT } from "../../theme/gradient";
import {
    bindGradientTexture,
    ensureGradientTexture,
} from "../../webgl/gradient-texture";
import { renderHeatmapTooltip } from "./heatmap-interact";

export interface HeatmapLocations {
    u_projection: WebGLUniformLocation | null;
    u_cell_inset: WebGLUniformLocation | null;
    u_cell_size: WebGLUniformLocation | null;
    u_gradient_lut: WebGLUniformLocation | null;
    a_corner: number;
    a_cell: number;
    a_color_t: number;
}

/**
 * Full-frame render: WebGL cells → chrome overlay.
 */
export function renderHeatmapFrame(
    chart: HeatmapChart,
    glManager: WebGLContextManager,
): void {
    const gl = glManager.gl;
    const dpr = glManager.dpr;
    const cssWidth = gl.canvas.width / dpr;
    const cssHeight = gl.canvas.height / dpr;
    if (cssWidth <= 0 || cssHeight <= 0) {
        return;
    }

    if (chart._facets.length > 0) {
        renderFacetedHeatmap(chart, glManager, cssWidth, cssHeight);
        return;
    }

    if (chart._numX === 0 || chart._numY === 0) {
        return;
    }

    const theme = chart._resolveTheme();

    const xDomain: CategoricalDomain = {
        levels: chart._xLevels,
        numRows: chart._numX,
        levelLabels: chart._groupBy.slice(),
    };
    const yDomain: CategoricalDomain = {
        levels: chart._yLevels,
        numRows: chart._numY,
        levelLabels: [],
    };

    const xNumeric = chart._xAxisMode.mode === "numeric";
    const yNumeric = chart._yAxisMode.mode === "numeric";

    // Measure both hierarchical axes *before* building the layout so the
    // plot rect accounts for their footprints. Numeric axes get fixed
    // gutters matching bar's branch (24px bottom, 55px left).
    const estLeft = yNumeric
        ? 55
        : measureCategoricalAxisWidth(yDomain, HEATMAP_Y_AXIS_OPTS);
    const bottomExtra = xNumeric
        ? 24
        : measureCategoricalAxisHeight(
              xDomain,
              Math.max(1, cssWidth - estLeft - 110),
          );

    const layout = new PlotLayout(cssWidth, cssHeight, {
        hasXLabel: chart._groupBy.length > 0,
        hasYLabel: false,
        hasLegend: true,
        bottomExtra,
        leftExtra: estLeft,
    });
    chart._lastLayout = layout;
    if (chart._zoomController) {
        chart._zoomController.updateLayout(layout);
    }

    // Domain depends on axis mode. Category mode: cell grid
    // `[-0.5, N-0.5]` so cells sit at integer coordinates. Numeric mode:
    // pre-padded `numericDomain` already includes a half-band on each
    // edge so cells stay flush with the axis.
    const xDomainMin = xNumeric ? chart._xNumericDomain!.min : -0.5;
    const xDomainMax = xNumeric
        ? chart._xNumericDomain!.max
        : chart._numX - 0.5;
    const yDomainMin = yNumeric ? chart._yNumericDomain!.min : -0.5;
    const yDomainMax = yNumeric
        ? chart._yNumericDomain!.max
        : chart._numY - 0.5;
    if (chart._zoomController) {
        chart._zoomController.setBaseDomain(
            xDomainMin,
            xDomainMax,
            yDomainMin,
            yDomainMax,
        );
    }

    const vis = chart._zoomController
        ? chart._zoomController.getVisibleDomain()
        : {
              xMin: xDomainMin,
              xMax: xDomainMax,
              yMin: yDomainMin,
              yMax: yDomainMax,
          };

    // Heatmap cell rects span the exact domain edge-to-edge, so any
    // cosmetic padding leaves a visible sliver between the outermost
    // cells and the axis chrome. Force `padRatio: 0` for flush edges.
    const projection = layout.buildProjectionMatrix(
        vis.xMin,
        vis.xMax,
        vis.yMin,
        vis.yMax,
        undefined,
        undefined,
        0,
        chart._xOrigin,
        chart._yOrigin,
    );

    // Cell gap is specified in CSS pixels but the shader needs data-space
    // insets. Convert using the plot's data-per-pixel scale; clamp to
    // half a band so the gap can't eat the entire cell.
    const plot = layout.plotRect;
    const pxPerDataX = plot.width / (vis.xMax - vis.xMin);
    const pxPerDataY = plot.height / (vis.yMax - vis.yMin);
    const halfGap = theme.heatmapGapPx * 0.5;
    const cellSizeX = xNumeric ? chart._xNumericDomain!.bandWidth : 1;
    const cellSizeY = yNumeric ? chart._yNumericDomain!.bandWidth : 1;
    const insetX = Math.min(
        cellSizeX * 0.5,
        pxPerDataX > 0 ? halfGap / pxPerDataX : 0,
    );
    const insetY = Math.min(
        cellSizeY * 0.5,
        pxPerDataY > 0 ? halfGap / pxPerDataY : 0,
    );

    // Gridline canvas isn't used by heatmap — clear it so stale content
    // from a previous plugin doesn't bleed through.
    if (chart._gridlineCanvas) {
        const _gctx = initCanvas(chart._gridlineCanvas, layout, glManager.dpr);
    }

    ensureProgram(chart, glManager);
    uploadInstanceBuffers(chart, glManager);

    chart._gradientCache = ensureGradientTexture(
        glManager,
        chart._gradientCache,
        theme.gradientStops,
    );

    renderInPlotFrame(gl, layout, glManager.dpr, () => {
        gl.useProgram(chart._program!);
        const loc = chart._locations!;
        gl.uniformMatrix4fv(loc.u_projection, false, projection);
        gl.uniform2f(loc.u_cell_inset, insetX, insetY);
        gl.uniform2f(loc.u_cell_size, cellSizeX, cellSizeY);
        bindGradientTexture(
            glManager,
            chart._gradientCache!.texture,
            loc.u_gradient_lut,
            0,
        );
        drawCellsInstanced(chart, gl, glManager, 0, chart._uploadedCells);
    });

    renderHeatmapChromeOverlay(chart);
}

function ensureProgram(
    chart: HeatmapChart,
    glManager: WebGLContextManager,
): void {
    if (chart._program) {
        return;
    }

    const gl = glManager.gl;
    const program = glManager.shaders.getOrCreate(
        "heatmap",
        heatmapVert,
        heatmapFrag,
    );
    chart._program = program;
    chart._locations = {
        u_projection: gl.getUniformLocation(program, "u_projection"),
        u_cell_inset: gl.getUniformLocation(program, "u_cell_inset"),
        u_cell_size: gl.getUniformLocation(program, "u_cell_size"),
        u_gradient_lut: gl.getUniformLocation(program, "u_gradient_lut"),
        a_corner: gl.getAttribLocation(program, "a_corner"),
        a_cell: gl.getAttribLocation(program, "a_cell"),
        a_color_t: gl.getAttribLocation(program, "a_color_t"),
    };

    const cornerBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);

    // Triangle strip: (0,0) (1,0) (0,1) (1,1)
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        gl.STATIC_DRAW,
    );
    chart._cornerBuffer = cornerBuffer;
}

function uploadInstanceBuffers(
    chart: HeatmapChart,
    glManager: WebGLContextManager,
): void {
    const n = chart._cells.length;
    chart._uploadedCells = n;
    if (n === 0) {
        return;
    }

    const cellXY = new Float32Array(n * 2);
    const colorT = new Float32Array(n);

    // Sign-aware `t`: 0 always lands at 0.5. See `theme/gradient.ts`.
    // Numeric-axis mode pre-multiplies the integer index into the real
    // data position so the shader can apply `u_cell_size` (band width)
    // uniformly without per-instance attrs. Datetime axes need an
    // origin rebase before f32 narrowing — see {@link HeatmapFacet}
    // and `HeatmapChart._xOrigin/_yOrigin`. Origins are 0 for category
    // mode, where the integer index is already small.
    if (chart._facets.length > 0) {
        let i = 0;
        for (const facet of chart._facets) {
            const xPos = facet.pipeline.xPositions;
            const yPos = facet.pipeline.yPositions;
            const xO = facet.xOrigin;
            const yO = facet.yOrigin;
            for (const c of facet.pipeline.cells) {
                cellXY[i * 2] = xPos ? xPos[c.xIdx] - xO : c.xIdx;
                cellXY[i * 2 + 1] = yPos ? yPos[c.yIdx] - yO : c.yIdx;
                colorT[i] = colorValueToT(
                    c.value,
                    chart._colorMin,
                    chart._colorMax,
                );
                i++;
            }
        }
    } else {
        const xPos = chart._xPositions;
        const yPos = chart._yPositions;
        const xO = chart._xOrigin;
        const yO = chart._yOrigin;
        for (let i = 0; i < n; i++) {
            const c = chart._cells[i];
            cellXY[i * 2] = xPos ? xPos[c.xIdx] - xO : c.xIdx;
            cellXY[i * 2 + 1] = yPos ? yPos[c.yIdx] - yO : c.yIdx;
            colorT[i] = colorValueToT(
                c.value,
                chart._colorMin,
                chart._colorMax,
            );
        }
    }

    glManager.bufferPool.ensureCapacity(n);
    glManager.bufferPool.upload("heatmap_cell", cellXY, 0, 2);
    glManager.bufferPool.upload("heatmap_t", colorT, 0, 1);
}

function drawCellsInstanced(
    chart: HeatmapChart,
    gl: WebGL2RenderingContext | WebGLRenderingContext,
    glManager: WebGLContextManager,
    instanceStart: number,
    instanceCount: number,
): void {
    if (instanceCount === 0) {
        return;
    }

    const loc = chart._locations!;
    const instancing = getInstancing(glManager);
    const { setDivisor } = instancing;
    const f = Float32Array.BYTES_PER_ELEMENT;

    // Per-vertex corner buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, chart._cornerBuffer!);
    gl.enableVertexAttribArray(loc.a_corner);
    gl.vertexAttribPointer(loc.a_corner, 2, gl.FLOAT, false, 0, 0);
    setDivisor(loc.a_corner, 0);

    // Per-instance cell position. Byte offset into the packed buffer
    // advances instance 0 of this draw to slot `instanceStart`.
    //
    // Render-path uses `peek` (not `getOrCreate`); if the buffers
    // haven't been uploaded yet, skip the draw rather than render
    // against a recreated zero buffer.
    const cellBuf = glManager.bufferPool.peek("heatmap_cell");
    const tBuf = glManager.bufferPool.peek("heatmap_t");
    if (!cellBuf || !tBuf) {
        return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf.buffer);
    gl.enableVertexAttribArray(loc.a_cell);
    gl.vertexAttribPointer(
        loc.a_cell,
        2,
        gl.FLOAT,
        false,
        0,
        instanceStart * 2 * f,
    );
    setDivisor(loc.a_cell, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, tBuf.buffer);
    gl.enableVertexAttribArray(loc.a_color_t);
    gl.vertexAttribPointer(
        loc.a_color_t,
        1,
        gl.FLOAT,
        false,
        0,
        instanceStart * f,
    );
    setDivisor(loc.a_color_t, 1);

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);

    setDivisor(loc.a_cell, 0);
    setDivisor(loc.a_color_t, 0);
}

/**
 * Chrome overlay: X axis + Y axis + color legend + (optional) tooltip.
 */
export function renderHeatmapChromeOverlay(chart: HeatmapChart): void {
    if (!chart._chromeCanvas) {
        return;
    }

    if (chart._facets.length > 0) {
        renderFacetedHeatmapChromeOverlay(chart);
        return;
    }

    if (!chart._lastLayout) {
        return;
    }

    const layout = chart._lastLayout;
    const theme = chart._resolveTheme();
    const dpr = chart._glManager?.dpr ?? 1;

    const ctx = initCanvas(chart._chromeCanvas, layout, dpr);
    if (!ctx) {
        return;
    }

    // L-shaped axis line, same as bar chart chrome.
    ctx.strokeStyle = theme.gridlineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.plotRect.x, layout.plotRect.y);
    ctx.lineTo(layout.plotRect.x, layout.plotRect.y + layout.plotRect.height);
    ctx.lineTo(
        layout.plotRect.x + layout.plotRect.width,
        layout.plotRect.y + layout.plotRect.height,
    );
    ctx.stroke();

    const xDomain: CategoricalDomain = {
        levels: chart._xLevels,
        numRows: chart._numX,
        levelLabels: chart._groupBy.slice(),
    };

    const yDomain: CategoricalDomain = {
        levels: chart._yLevels,
        numRows: chart._numY,
        levelLabels: [],
    };

    // Heatmap X axis is the first group_by level; Y axis is the
    // second (when present) or the first split_by level.
    const xColumn = chart._groupBy[0];
    const yColumn = chart._groupBy[1] ?? chart._splitBy[0];

    if (chart._xAxisMode.mode === "numeric" && chart._xNumericDomain) {
        const ticks = computeNiceTicks(layout.paddedXMin, layout.paddedXMax, 6);
        drawNumericCategoryX(
            ctx,
            layout,
            chart._xNumericDomain,
            ticks,
            theme,
            chart.getColumnFormatter(xColumn, "tick"),
        );
    } else {
        renderCategoricalXTicks(ctx, layout, xDomain, theme);
    }

    if (chart._yAxisMode.mode === "numeric" && chart._yNumericDomain) {
        const ticks = computeNiceTicks(layout.paddedYMin, layout.paddedYMax, 6);
        drawNumericCategoryY(
            ctx,
            layout,
            chart._yNumericDomain,
            ticks,
            theme,
            chart.getColumnFormatter(yColumn, "tick"),
        );
    } else {
        renderCategoricalYTicks(
            ctx,
            layout,
            yDomain,
            theme,
            HEATMAP_Y_AXIS_OPTS,
        );
    }

    // Color legend on the right. The aggregate column name is in
    // `_columnSlots[0]` (heatmap's only data column slot is "Color").
    renderLegend(
        chart._chromeCanvas,
        layout,
        {
            min: chart._colorMin,
            max: chart._colorMax,
            label: chart._aggName,
        },
        theme.gradientStops,
        theme,
        chart.getColumnFormatter(chart._columnSlots[0], "value"),
    );

    if (chart._hoveredCell) {
        renderHeatmapTooltip(chart);
    }
}

/** Multi-facet WebGL render. Packs all facets' cells into one instance
 *  buffer and dispatches once per facet with a rebound pointer offset,
 *  matching projection, and scissor to the facet's plot rect. */
function renderFacetedHeatmap(
    chart: HeatmapChart,
    glManager: WebGLContextManager,
    cssWidth: number,
    cssHeight: number,
): void {
    const gl = glManager.gl;
    const theme = chart._resolveTheme();

    // Derive the effective shared-axis flags for this frame. Stamps
    // `_lastEffectiveSharedX/Y` on the chart so
    // `renderFacetedHeatmapChromeOverlay` reads the same values without
    // re-deriving (and without us having to mutate `_facetConfig`).
    const { effectiveSharedX, effectiveSharedY } =
        chart.computeEffectiveFacetFlags();

    const grid = buildFacetGrid(
        chart._facets.map((f) => f.label),
        {
            cssWidth,
            cssHeight,
            xAxis: effectiveSharedX ? "outer" : "cell",
            yAxis: effectiveSharedY ? "outer" : "cell",
            hasLegend: true,
            hasXLabel: chart._groupBy.length > 0,
            hasYLabel: false,
            gap: 8,
        },
    );
    chart._facetGrid = grid;

    for (let i = 0; i < chart._facets.length; i++) {
        const cell = grid.cells[i];
        if (cell) {
            chart._facets[i].layout = cell.layout;
        }
    }

    // Wire every active zoom controller's layout pointer so wheel/pan
    // hit-tests compute correct data deltas.
    chart.syncFacetZoomLayouts(grid.cells);

    ensureProgram(chart, glManager);
    uploadInstanceBuffers(chart, glManager);
    chart._gradientCache = ensureGradientTexture(
        glManager,
        chart._gradientCache,
        theme.gradientStops,
    );

    gl.useProgram(chart._program!);
    const loc = chart._locations!;
    bindGradientTexture(
        glManager,
        chart._gradientCache!.texture,
        loc.u_gradient_lut,
        0,
    );

    // One clear for the whole frame; per-facet scissor keeps each
    // facet's draw confined to its plot rect without wiping its
    // neighbours.
    clearAndSetupFrame(gl);

    for (let i = 0; i < chart._facets.length; i++) {
        const facet = chart._facets[i];
        if (facet.instanceCount === 0) {
            continue;
        }

        const { numX, numY } = facet.pipeline;
        if (numX === 0 || numY === 0) {
            continue;
        }

        const layout = facet.layout;
        const xNumeric = facet.pipeline.xAxisMode.mode === "numeric";
        const yNumeric = facet.pipeline.yAxisMode.mode === "numeric";
        const xDomainMin = xNumeric ? facet.pipeline.xNumericDomain!.min : -0.5;
        const xDomainMax = xNumeric
            ? facet.pipeline.xNumericDomain!.max
            : numX - 0.5;
        const yDomainMin = yNumeric ? facet.pipeline.yNumericDomain!.min : -0.5;
        const yDomainMax = yNumeric
            ? facet.pipeline.yNumericDomain!.max
            : numY - 0.5;

        // Anchor the controller's base domain to this facet's data
        // extent so wheel/pan transforms compose against a meaningful
        // identity. In shared mode every facet writes the same base
        // (heatmap facets share group_by → identical X domain, and
        // matching Y shapes from `partitionColumnsPerFacet` → identical
        // Y domain), so last-write-wins is a no-op. In independent
        // mode each facet's own controller gets its own base.
        const zc = chart.getZoomControllerForFacet(i);
        if (zc) {
            zc.setBaseDomain(xDomainMin, xDomainMax, yDomainMin, yDomainMax);
        }

        const vis = zc
            ? zc.getVisibleDomain()
            : {
                  xMin: xDomainMin,
                  xMax: xDomainMax,
                  yMin: yDomainMin,
                  yMax: yDomainMax,
              };
        const projection = layout.buildProjectionMatrix(
            vis.xMin,
            vis.xMax,
            vis.yMin,
            vis.yMax,
            undefined,
            undefined,
            0,
            facet.xOrigin,
            facet.yOrigin,
        );

        const plot = layout.plotRect;
        const pxPerDataX = plot.width / (vis.xMax - vis.xMin);
        const pxPerDataY = plot.height / (vis.yMax - vis.yMin);
        const halfGap = theme.heatmapGapPx * 0.5;
        const cellSizeX = xNumeric
            ? facet.pipeline.xNumericDomain!.bandWidth
            : 1;
        const cellSizeY = yNumeric
            ? facet.pipeline.yNumericDomain!.bandWidth
            : 1;
        const insetX = Math.min(
            cellSizeX * 0.5,
            pxPerDataX > 0 ? halfGap / pxPerDataX : 0,
        );
        const insetY = Math.min(
            cellSizeY * 0.5,
            pxPerDataY > 0 ? halfGap / pxPerDataY : 0,
        );

        withScissor(gl, layout, glManager.dpr, () => {
            gl.uniformMatrix4fv(loc.u_projection, false, projection);
            gl.uniform2f(loc.u_cell_inset, insetX, insetY);
            gl.uniform2f(loc.u_cell_size, cellSizeX, cellSizeY);
            drawCellsInstanced(
                chart,
                gl,
                glManager,
                facet.instanceStart,
                facet.instanceCount,
            );
        });
    }

    renderHeatmapChromeOverlay(chart);
}

/**
 * Multi-facet chrome: per-facet X/Y axis + title, one shared legend.
 */
function renderFacetedHeatmapChromeOverlay(chart: HeatmapChart): void {
    if (!chart._chromeCanvas || !chart._facetGrid) {
        return;
    }

    const theme = chart._resolveTheme();

    // `initCanvas` wants a `PlotLayout` to sync DPR-aware sizing. The
    // first facet's layout is canvas-sized (cssWidth/cssHeight match
    // the element), so either facet works for the DPR handshake.
    const dpr = chart._glManager?.dpr ?? 1;
    const ctx = initCanvas(chart._chromeCanvas, chart._facets[0].layout, dpr);
    if (!ctx) {
        return;
    }

    // Shared-axis suppression: when shared-X is active the X tick
    // labels paint just below `cell.layout.plotRect` — which, because
    // `buildFacetGrid` was called with `xAxis: "outer"`, falls into
    // the reserved `outerXAxisRect` band rather than per-cell padding.
    // Painting from a bottom-edge cell's layout is enough; non-edge
    // rows would paint the same labels at the wrong y coordinate, so
    // we skip them. Symmetric for Y. The cleanest way to express
    // "shared = only edge cells render axes" is to gate the per-cell
    // call on `!sharedX || isBottomEdge` (and analogously for Y).
    const sharedX = chart._lastEffectiveSharedX;
    const sharedY = chart._lastEffectiveSharedY;
    const grid = chart._facetGrid;
    for (let i = 0; i < chart._facets.length; i++) {
        const facet = chart._facets[i];
        const cell = grid.cells[i];
        const layout = facet.layout;
        const plot = layout.plotRect;

        ctx.strokeStyle = theme.gridlineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plot.x, plot.y);
        ctx.lineTo(plot.x, plot.y + plot.height);
        ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
        ctx.stroke();

        const xDomain: CategoricalDomain = {
            levels: facet.pipeline.xLevels,
            numRows: facet.pipeline.numX,
            levelLabels: chart._groupBy.slice(),
        };
        const yDomain: CategoricalDomain = {
            levels: facet.pipeline.yLevels,
            numRows: facet.pipeline.numY,
            levelLabels: [],
        };

        const xColumn = chart._groupBy[0];
        const yColumn = chart._groupBy[1] ?? chart._splitBy[0];

        if (!sharedX || cell.isBottomEdge) {
            if (
                facet.pipeline.xAxisMode.mode === "numeric" &&
                facet.pipeline.xNumericDomain
            ) {
                const ticks = computeNiceTicks(
                    layout.paddedXMin,
                    layout.paddedXMax,
                    6,
                );
                drawNumericCategoryX(
                    ctx,
                    layout,
                    facet.pipeline.xNumericDomain,
                    ticks,
                    theme,
                    chart.getColumnFormatter(xColumn, "tick"),
                );
            } else {
                renderCategoricalXTicks(ctx, layout, xDomain, theme);
            }
        }

        if (!sharedY || cell.isLeftEdge) {
            if (
                facet.pipeline.yAxisMode.mode === "numeric" &&
                facet.pipeline.yNumericDomain
            ) {
                const ticks = computeNiceTicks(
                    layout.paddedYMin,
                    layout.paddedYMax,
                    6,
                );
                drawNumericCategoryY(
                    ctx,
                    layout,
                    facet.pipeline.yNumericDomain,
                    ticks,
                    theme,
                    chart.getColumnFormatter(yColumn, "tick"),
                );
            } else {
                renderCategoricalYTicks(
                    ctx,
                    layout,
                    yDomain,
                    theme,
                    HEATMAP_Y_AXIS_OPTS,
                );
            }
        }
    }

    // Per-facet titles sit in the grid cell's titleRect — one strip per
    // facet, above the plot rect. The grid's cells and the chart's
    // facets are parallel arrays by construction.
    for (let i = 0; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        const facet = chart._facets[i];
        if (!facet || !cell.titleRect) {
            continue;
        }

        drawFacetTitle(
            chart._chromeCanvas,
            facet.label,
            cell.titleRect,
            theme,
            dpr,
        );
    }

    // Shared colorbar at `grid.legendRect`. No meaningful single label —
    // the facet titles already name each column, and a combined label
    // would be ambiguous when columns differ.
    if (grid.legendRect) {
        renderLegendAt(
            chart._chromeCanvas,
            {
                x: grid.legendRect.x,
                y: grid.legendRect.y + 20,
                width: grid.legendRect.width,
                height: Math.max(1, grid.legendRect.height - 20),
            },
            {
                min: chart._colorMin,
                max: chart._colorMax,
                label: "",
            },
            theme.gradientStops,
            theme,
            chart.getColumnFormatter(chart._columnSlots[0], "value"),
        );
    }

    if (chart._hoveredCell) {
        renderHeatmapTooltip(chart);
    }
}
