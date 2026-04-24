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
import type { HeatmapChart, HeatmapFacet } from "./heatmap";
import { PlotLayout } from "../../layout/plot-layout";
import { resolveTheme, type Theme } from "../../theme/theme";
import {
    renderInPlotFrame,
    clearAndSetupFrame,
    withScissor,
} from "../../webgl/plot-frame";
import { getInstancing } from "../../webgl/instanced-attrs";
import { initCanvas } from "../../chrome/canvas";
import { buildFacetGrid } from "../../layout/facet-grid";
import {
    measureCategoricalAxisHeight,
    renderCategoricalXTicks,
    type CategoricalDomain,
} from "../../chrome/categorical-axis";
import {
    measureCategoricalAxisWidth,
    renderCategoricalYTicks,
    type CategoricalYAxisOptions,
} from "./heatmap-y-axis";

// The heatmap's Y-axis column names end with the (single, externally
// enforced) aggregate name. That leaf column is a redundant constant and
// doesn't belong on the axis — promote the deepest split prefix to the
// leaf position instead.
const HEATMAP_Y_AXIS_OPTS: CategoricalYAxisOptions = {
    skipLeafLevel: true,
};
import { renderLegend, renderLegendAt } from "../../chrome/legend";
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
    u_gradient_lut: WebGLUniformLocation | null;
    a_corner: number;
    a_cell: number;
    a_color_t: number;
}

/** Full-frame render: WebGL cells → chrome overlay. */
export function renderHeatmapFrame(
    chart: HeatmapChart,
    glManager: WebGLContextManager,
): void {
    const gl = glManager.gl;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = gl.canvas.width / dpr;
    const cssHeight = gl.canvas.height / dpr;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    if (chart._facets.length > 0) {
        renderFacetedHeatmap(chart, glManager, cssWidth, cssHeight);
        return;
    }

    if (chart._numX === 0 || chart._numY === 0) return;

    const themeEl = (chart._gridlineCanvas!.getRootNode() as ShadowRoot).host;
    const theme = resolveTheme(themeEl);

    const xDomain: CategoricalDomain = {
        levels: chart._xLevels,
        numRows: chart._numX,
        levelLabels: chart._groupBy.slice(),
    };
    const yDomain: CategoricalDomain = {
        levels: chart._yLevels,
        numRows: chart._numY,
        // The Y axis shows columns directly; no meaningful label set.
        levelLabels: [],
    };

    // Measure both hierarchical axes *before* building the layout so the
    // plot rect accounts for their footprints.
    const estLeft = measureCategoricalAxisWidth(yDomain, HEATMAP_Y_AXIS_OPTS);
    // For the bottom extra we need an estimated plot width. Use the CSS
    // width minus rough left/right gutters as a first approximation.
    const estPlotWidth = Math.max(1, cssWidth - estLeft - 110);
    const bottomExtra = measureCategoricalAxisHeight(xDomain, estPlotWidth);

    const layout = new PlotLayout(cssWidth, cssHeight, {
        hasXLabel: chart._groupBy.length > 0,
        hasYLabel: false,
        hasLegend: true,
        bottomExtra,
        leftExtra: estLeft,
    });
    chart._lastLayout = layout;
    if (chart._zoomController) chart._zoomController.updateLayout(layout);

    // Apply zoom + domain padding via the standard projection matrix. The
    // domain is the cell grid `[-0.5, numX-0.5] × [-0.5, numY-0.5]` so
    // cells sit at integer coordinates.
    const xDomainMin = -0.5;
    const xDomainMax = chart._numX - 0.5;
    const yDomainMin = -0.5;
    const yDomainMax = chart._numY - 0.5;
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

    const projection = layout.buildProjectionMatrix(
        vis.xMin,
        vis.xMax,
        vis.yMin,
        vis.yMax,
    );

    // Cell gap is specified in CSS pixels but the shader needs data-space
    // insets. Convert using the plot's data-per-pixel scale.
    const plot = layout.plotRect;
    const pxPerDataX = plot.width / (vis.xMax - vis.xMin);
    const pxPerDataY = plot.height / (vis.yMax - vis.yMin);
    const halfGap = theme.heatmapGapPx * 0.5;
    const insetX = Math.min(0.5, pxPerDataX > 0 ? halfGap / pxPerDataX : 0);
    const insetY = Math.min(0.5, pxPerDataY > 0 ? halfGap / pxPerDataY : 0);

    // Gridline canvas isn't used by heatmap — clear it so stale content
    // from a previous plugin doesn't bleed through.
    if (chart._gridlineCanvas) {
        const gctx = initCanvas(chart._gridlineCanvas, layout);
        if (gctx) {
            // already cleared by initCanvas
        }
    }

    ensureProgram(chart, glManager);
    uploadInstanceBuffers(chart, glManager);

    chart._gradientCache = ensureGradientTexture(
        glManager,
        chart._gradientCache,
        theme.gradientStops,
    );

    renderInPlotFrame(gl, layout, () => {
        gl.useProgram(chart._program!);
        const loc = chart._locations!;
        gl.uniformMatrix4fv(loc.u_projection, false, projection);
        gl.uniform2f(loc.u_cell_inset, insetX, insetY);
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
    if (chart._program) return;
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
    if (n === 0) return;

    const cellXY = new Float32Array(n * 2);
    const colorT = new Float32Array(n);
    // Sign-aware `t`: 0 always lands at 0.5. See `theme/gradient.ts`.
    for (let i = 0; i < n; i++) {
        const c = chart._cells[i];
        cellXY[i * 2] = c.xIdx;
        cellXY[i * 2 + 1] = c.yIdx;
        colorT[i] = colorValueToT(c.value, chart._colorMin, chart._colorMax);
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
    if (instanceCount === 0) return;
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
    const cellBuf = glManager.bufferPool.getOrCreate("heatmap_cell", 2, f);
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

    const tBuf = glManager.bufferPool.getOrCreate("heatmap_t", 1, f);
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

/** Chrome overlay: X axis + Y axis + color legend + (optional) tooltip. */
export function renderHeatmapChromeOverlay(chart: HeatmapChart): void {
    if (!chart._chromeCanvas) return;
    if (chart._facets.length > 0) {
        renderFacetedHeatmapChromeOverlay(chart);
        return;
    }
    if (!chart._lastLayout) return;
    const layout = chart._lastLayout;
    const theme = resolveTheme(chart._chromeCanvas);

    const ctx = initCanvas(chart._chromeCanvas, layout);
    if (!ctx) return;

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

    renderCategoricalXTicks(ctx, layout, xDomain, theme);
    renderCategoricalYTicks(ctx, layout, yDomain, theme, HEATMAP_Y_AXIS_OPTS);

    // Color legend on the right.
    renderLegend(
        chart._chromeCanvas,
        layout,
        {
            min: chart._colorMin,
            max: chart._colorMax,
            label: chart._aggName,
        },
        theme.gradientStops,
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
    const themeEl = (chart._gridlineCanvas!.getRootNode() as ShadowRoot).host;
    const theme = resolveTheme(themeEl);

    const grid = buildFacetGrid(
        chart._facets.map((f) => f.label),
        {
            cssWidth,
            cssHeight,
            xAxis: "cell",
            yAxis: "cell",
            hasLegend: true,
            hasXLabel: chart._groupBy.length > 0,
            hasYLabel: false,
            gap: 8,
        },
    );
    chart._facetGrid = grid;

    for (let i = 0; i < chart._facets.length; i++) {
        const cell = grid.cells[i];
        if (cell) chart._facets[i].layout = cell.layout;
    }

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
        if (facet.instanceCount === 0) continue;
        const { numX, numY } = facet.pipeline;
        if (numX === 0 || numY === 0) continue;

        const layout = facet.layout;
        const xDomainMin = -0.5;
        const xDomainMax = numX - 0.5;
        const yDomainMin = -0.5;
        const yDomainMax = numY - 0.5;
        const projection = layout.buildProjectionMatrix(
            xDomainMin,
            xDomainMax,
            yDomainMin,
            yDomainMax,
        );

        const plot = layout.plotRect;
        const pxPerDataX = plot.width / (xDomainMax - xDomainMin);
        const pxPerDataY = plot.height / (yDomainMax - yDomainMin);
        const halfGap = theme.heatmapGapPx * 0.5;
        const insetX = Math.min(0.5, pxPerDataX > 0 ? halfGap / pxPerDataX : 0);
        const insetY = Math.min(0.5, pxPerDataY > 0 ? halfGap / pxPerDataY : 0);

        withScissor(gl, layout, () => {
            gl.uniformMatrix4fv(loc.u_projection, false, projection);
            gl.uniform2f(loc.u_cell_inset, insetX, insetY);
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

/** Multi-facet chrome: per-facet X/Y axis + title, one shared legend. */
function renderFacetedHeatmapChromeOverlay(chart: HeatmapChart): void {
    if (!chart._chromeCanvas || !chart._facetGrid) return;
    const theme = resolveTheme(chart._chromeCanvas);
    // `initCanvas` wants a `PlotLayout` to sync DPR-aware sizing. The
    // first facet's layout is canvas-sized (cssWidth/cssHeight match
    // the element), so either facet works for the DPR handshake.
    const ctx = initCanvas(chart._chromeCanvas, chart._facets[0].layout);
    if (!ctx) return;

    for (const facet of chart._facets) {
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

        renderCategoricalXTicks(ctx, layout, xDomain, theme);
        renderCategoricalYTicks(
            ctx,
            layout,
            yDomain,
            theme,
            HEATMAP_Y_AXIS_OPTS,
        );
    }

    // Per-facet titles sit in the grid cell's titleRect — one strip per
    // facet, above the plot rect. The grid's cells and the chart's
    // facets are parallel arrays by construction.
    const grid = chart._facetGrid;
    for (let i = 0; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        const facet = chart._facets[i];
        if (!facet || !cell.titleRect) continue;
        drawFacetTitle(chart._chromeCanvas, facet.label, cell.titleRect, theme);
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
        );
    }

    if (chart._hoveredCell) {
        renderHeatmapTooltip(chart);
    }
}

function drawFacetTitle(
    canvas: HTMLCanvasElement,
    label: string,
    rect: { x: number; y: number; width: number; height: number },
    theme: Theme,
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.font = `11px ${theme.fontFamily}`;
    ctx.fillStyle = theme.labelColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.restore();
}
