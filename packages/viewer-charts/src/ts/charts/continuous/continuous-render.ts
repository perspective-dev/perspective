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
import type { ContinuousChart } from "./continuous-chart";
import { PlotLayout } from "../../layout/plot-layout";
import { buildFacetGrid, type FacetGrid } from "../../layout/facet-grid";
import { resolveTheme, readSeriesPalette, type Theme } from "../../theme/theme";
import { resolvePalette } from "../../theme/palette";
import { paletteToStops } from "../../theme/gradient";
import {
    renderInPlotFrame,
    clearAndSetupFrame,
    withScissor,
} from "../../webgl/plot-frame";
import { ensureGradientTexture } from "../../webgl/gradient-texture";
import { renderCanvasTooltip } from "../../interaction/tooltip-controller";
import {
    computeTicks,
    renderGridlines,
    renderAxesChrome,
    renderCellXAxis,
    renderCellYAxis,
    renderOuterXAxis,
    renderOuterYAxis,
    type AxisDomain,
} from "../../chrome/numeric-axis";
import { initCanvas } from "../../chrome/canvas";
import {
    renderLegend,
    renderLegendAt,
    renderCategoricalLegend,
    renderCategoricalLegendAt,
} from "../../chrome/legend";

/**
 * Full-frame render: gridlines → glyph draw inside the plot-frame
 * scissor → chrome overlay (axes + legend + tooltip).
 *
 * Branches on `_facetConfig.facet_mode`:
 *
 *   - `"overlay"` (legacy): a single plot rect; all split series are
 *     drawn together, distinguished by color. This is the pre-facet
 *     behavior, preserved for manual opt-in via `FACET_CONFIG`.
 *   - `"grid"` (default): when splits are present, `_splitGroups` laid
 *     out as a grid of sub-plots by {@link buildFacetGrid}. When splits
 *     are absent, falls through to the single-plot path — identical to
 *     the `"overlay"` case with 0 splits, so the non-split render path
 *     is byte-for-byte unchanged from before this feature.
 */
export function renderContinuousFrame(
    chart: ContinuousChart,
    glManager: WebGLContextManager,
): void {
    const gl = glManager.gl;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = gl.canvas.width / dpr;
    const cssHeight = gl.canvas.height / dpr;
    if (cssWidth <= 0 || cssHeight <= 0) return;

    const hasSplits = chart._splitGroups.length > 0;
    const facetMode = chart._facetConfig.facet_mode;
    const useGrid = hasSplits && facetMode === "grid";

    // Shared axes and independent zoom are incompatible: the outer
    // axis band would display domain values that don't match any
    // single cell's zoom. Force shared axes off when independent zoom
    // is active; per-cell axes then reflect each cell's own domain.
    if (useGrid && chart._facetConfig.zoom_mode === "independent") {
        if (
            chart._facetConfig.shared_x_axis ||
            chart._facetConfig.shared_y_axis
        ) {
            chart._facetConfig = {
                ...chart._facetConfig,
                shared_x_axis: false,
                shared_y_axis: false,
            };
        }
    }

    // Legend appears only when the user wired a color column with a
    // non-degenerate range. `split_by` alone no longer forces a
    // legend — faceting is the axis of splitting, not coloring.
    const hasColorCol =
        chart._colorName !== "" && chart._colorMin < chart._colorMax;

    // Overall domain = current viewport in shared-zoom mode, full data
    // extents in independent-zoom mode (each facet consults its own
    // controller inside `renderFacetedFrame`).
    const independent =
        useGrid && chart._facetConfig.zoom_mode === "independent";
    let domain: { xMin: number; xMax: number; yMin: number; yMax: number };
    if (chart._zoomController && !independent) {
        domain = chart._zoomController.getVisibleDomain();
    } else {
        domain = {
            xMin: chart._xMin,
            xMax: chart._xMax,
            yMin: chart._yMin,
            yMax: chart._yMax,
        };
    }
    if (!isFinite(domain.xMin) || !isFinite(domain.yMin)) return;

    const themeEl = chart._gridlineCanvas!;
    const theme = resolveTheme(themeEl);
    chart._lastTheme = theme;
    const seriesPalette = readSeriesPalette(themeEl);
    chart._lastSeriesPalette = seriesPalette;

    const xType = chart._columnTypes[chart._xLabel] || "";
    const yType = chart._columnTypes[chart._yLabel] || "";
    const xIsDate = xType === "date" || xType === "datetime";
    const yIsDate = yType === "date" || yType === "datetime";

    // Prepare the shared gradient LUT once (used by all facets).
    //
    // Three color sources map to three LUT types:
    //   - split_by or string color column → multi-entry series palette
    //     keyed by `_uniqueColorLabels.size`.
    //   - no color source at all          → single-entry series palette
    //     (`palette[0]`). Points are stored with `a_color_value = 0.5`
    //     in the build; a 1-color LUT returns the same RGB for every
    //     sample so the default value is harmless.
    //   - numeric color column            → continuous theme gradient.
    // Categorical only when a string color column was wired —
    // `split_by` alone no longer implies categorical coloring.
    const isCategorical = chart._colorIsString;
    const hasNoColorSource = !isCategorical && !chart._colorName;
    let lutStops = theme.gradientStops;
    if (isCategorical || hasNoColorSource) {
        const labelCount = hasNoColorSource
            ? 1
            : Math.max(1, chart._uniqueColorLabels.size);
        const key = `${labelCount}|${seriesPalette.length}`;
        if (chart._lastLutStops && chart._lastLutKey === key) {
            lutStops = chart._lastLutStops;
        } else {
            const palette = resolvePalette(
                seriesPalette,
                theme.gradientStops,
                labelCount,
            );
            lutStops = paletteToStops(palette);
            chart._lastLutStops = lutStops;
            chart._lastLutKey = key;
        }
    } else {
        chart._lastLutStops = null;
        chart._lastLutKey = "";
    }
    chart._gradientCache = ensureGradientTexture(
        glManager,
        chart._gradientCache,
        lutStops,
    );

    if (useGrid) {
        renderFacetedFrame(chart, glManager, domain, theme, {
            xIsDate,
            yIsDate,
            cssWidth,
            cssHeight,
        });
    } else {
        // Single-plot path (no splits, or `"overlay"` mode).
        chart._facetGrid = null;
        renderSinglePlotFrame(chart, glManager, domain, theme, {
            xIsDate,
            yIsDate,
            cssWidth,
            cssHeight,
            hasColorCol,
        });
    }

    renderContinuousChromeOverlay(chart);
}

interface RenderFrameCtx {
    xIsDate: boolean;
    yIsDate: boolean;
    cssWidth: number;
    cssHeight: number;
}

interface SinglePlotCtx extends RenderFrameCtx {
    hasColorCol: boolean;
}

function buildXDomain(
    chart: ContinuousChart,
    min: number,
    max: number,
    isDate: boolean,
): AxisDomain {
    return {
        min,
        max,
        label:
            chart._xLabel || (chart._xIsRowIndex ? "Row" : chart._xName || ""),
        isDate,
    };
}

function buildYDomain(
    chart: ContinuousChart,
    min: number,
    max: number,
    isDate: boolean,
): AxisDomain {
    return {
        min,
        max,
        label: chart._yLabel || chart._yName,
        isDate,
    };
}

/**
 * Original single-plot render path — all series drawn into one
 * `PlotLayout` with one projection matrix. Used when splits are absent
 * or when `facet_mode === "overlay"`.
 */
function renderSinglePlotFrame(
    chart: ContinuousChart,
    glManager: WebGLContextManager,
    domain: { xMin: number; xMax: number; yMin: number; yMax: number },
    theme: Theme,
    ctx: SinglePlotCtx,
): void {
    const gl = glManager.gl;
    const { cssWidth, cssHeight, xIsDate, yIsDate, hasColorCol } = ctx;

    const layout = new PlotLayout(cssWidth, cssHeight, {
        hasXLabel: !!chart._xLabel,
        hasYLabel: !!chart._yLabel,
        hasLegend: hasColorCol,
    });
    chart._lastLayout = layout;
    if (chart._zoomController) chart._zoomController.updateLayout(layout);

    const projection = layout.buildProjectionMatrix(
        domain.xMin,
        domain.xMax,
        domain.yMin,
        domain.yMax,
    );

    const xDomain = buildXDomain(chart, domain.xMin, domain.xMax, xIsDate);
    const yDomain = buildYDomain(chart, domain.yMin, domain.yMax, yIsDate);
    const { xTicks, yTicks } = computeTicks(xDomain, yDomain, layout);

    if (chart._gridlineCanvas) {
        // One-shot destructive prep (resizes + clears + scales to DPR).
        // `renderGridlines` itself is non-destructive.
        initCanvas(chart._gridlineCanvas, layout);
        renderGridlines(chart._gridlineCanvas, layout, xTicks, yTicks, theme);
    }

    renderInPlotFrame(gl, layout, () => {
        chart.glyph.draw(chart, glManager, projection);
    });

    chart._lastXDomain = xDomain;
    chart._lastYDomain = yDomain;
    chart._lastXTicks = xTicks;
    chart._lastYTicks = yTicks;
    chart._lastGradientStops = theme.gradientStops;
    chart._lastHasColorCol = hasColorCol;
}

/**
 * Faceted render path — one sub-plot per split, laid out in a grid.
 * Each facet gets its own `PlotLayout` (with canvas-absolute margins),
 * its own projection matrix, and one `drawSeries(s)` dispatch inside
 * its scissor rect. Shader, buffers, gradient texture, and zoom
 * controller state are all shared.
 *
 * Shared-zoom mode uses one global domain for every facet's projection
 * (current default). Independent-zoom mode (Stage 6) will consult a
 * per-facet `ZoomController`.
 */
function renderFacetedFrame(
    chart: ContinuousChart,
    glManager: WebGLContextManager,
    domain: { xMin: number; xMax: number; yMin: number; yMax: number },
    theme: Theme,
    ctx: RenderFrameCtx,
): void {
    const gl = glManager.gl;
    const { cssWidth, cssHeight, xIsDate, yIsDate } = ctx;

    const labels = chart._splitGroups.map((g) => g.prefix);
    // Legend: reserve space only when the user wired a color column.
    //   - string column: categorical swatches from `_uniqueColorLabels`.
    //   - numeric column: gradient bar from `_colorMin/_colorMax`.
    //   - no color column: no legend (facets alone don't warrant one).
    const hasCategoricalLegend =
        chart._colorIsString && chart._uniqueColorLabels.size > 1;
    const hasGradientLegend =
        !!chart._colorName &&
        !chart._colorIsString &&
        chart._colorMin < chart._colorMax;
    const hasLegend = hasCategoricalLegend || hasGradientLegend;
    // `FacetConfig.shared_x_axis` / `shared_y_axis` are booleans;
    // continuous charts always have both axes, so the false branch
    // maps to the per-cell mode (never to the axis-less "none" mode,
    // which is reserved for tree charts).
    const grid: FacetGrid = buildFacetGrid(labels, {
        cssWidth,
        cssHeight,
        xAxis: chart._facetConfig.shared_x_axis ? "outer" : "cell",
        yAxis: chart._facetConfig.shared_y_axis ? "outer" : "cell",
        hasLegend,
        hasXLabel: !!chart._xLabel,
        hasYLabel: !!chart._yLabel,
        gap: chart._facetConfig.facet_padding,
    });
    chart._facetGrid = grid;

    // Grid invariant: every cell has the same plot rect dimensions.
    // Downstream code (tick sampling, projection math) depends on
    // this. The O(N) comparison runs at most once per frame and bails
    // at the first mismatch — cheap enough to leave on unconditionally.
    if (grid.cells.length > 1) {
        const r0 = grid.cells[0].layout.plotRect;
        for (let i = 1; i < grid.cells.length; i++) {
            const r = grid.cells[i].layout.plotRect;
            if (r.width !== r0.width || r.height !== r0.height) {
                console.warn(
                    `facet-grid: cell ${i} size (${r.width}×${r.height}) ` +
                        `differs from cell 0 (${r0.width}×${r0.height})`,
                );
                break;
            }
        }
    }

    // `_lastLayout` backs the hover hit-test in `continuous-interact.ts`.
    // In faceted mode the hover routine resolves the facet under the
    // cursor and consults that cell's layout directly; for legacy
    // fallback (shouldn't fire), publish the first cell's layout.
    chart._lastLayout = grid.cells[0]?.layout ?? null;

    // Keep every controller's layout pointer fresh for wheel/pan math.
    const independent = chart._facetConfig.zoom_mode === "independent";
    for (let i = 0; i < grid.cells.length; i++) {
        const zc = chart.getZoomControllerForFacet(i);
        if (zc) zc.updateLayout(grid.cells[i].layout);
        if (!independent) break;
    }

    const xDomain = buildXDomain(chart, domain.xMin, domain.xMax, xIsDate);
    const yDomain = buildYDomain(chart, domain.yMin, domain.yMax, yIsDate);

    // Gridlines + per-facet axes use the first cell's layout for tick
    // sampling (all cells have identical plotRect dimensions). Per-facet
    // rendering then reuses the same tick arrays.
    const sampleLayout = grid.cells[0]?.layout;
    const { xTicks, yTicks } = sampleLayout
        ? computeTicks(xDomain, yDomain, sampleLayout)
        : { xTicks: [], yTicks: [] };

    // One-shot destructive prep for the gridline + WebGL canvases.
    // Both phases below are per-facet; calling their destructive
    // helpers (initCanvas / renderInPlotFrame) in the loop would wipe
    // every previously-drawn facet, leaving only the last cell
    // visible.
    if (chart._gridlineCanvas && sampleLayout) {
        initCanvas(chart._gridlineCanvas, sampleLayout);
    }
    clearAndSetupFrame(gl);

    for (let i = 0; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        const zc = chart.getZoomControllerForFacet(i);
        const facetDomain = independent && zc ? zc.getVisibleDomain() : domain;

        // Per-facet gridlines: reuse shared ticks in shared-zoom mode,
        // compute fresh ticks in independent mode (each facet has its
        // own domain).
        if (chart._gridlineCanvas) {
            const localXTicks = independent
                ? computeTicks(
                      buildXDomain(
                          chart,
                          facetDomain.xMin,
                          facetDomain.xMax,
                          xIsDate,
                      ),
                      buildYDomain(
                          chart,
                          facetDomain.yMin,
                          facetDomain.yMax,
                          yIsDate,
                      ),
                      cell.layout,
                  ).xTicks
                : xTicks;
            const localYTicks = independent
                ? computeTicks(
                      buildXDomain(
                          chart,
                          facetDomain.xMin,
                          facetDomain.xMax,
                          xIsDate,
                      ),
                      buildYDomain(
                          chart,
                          facetDomain.yMin,
                          facetDomain.yMax,
                          yIsDate,
                      ),
                      cell.layout,
                  ).yTicks
                : yTicks;
            renderGridlines(
                chart._gridlineCanvas,
                cell.layout,
                localXTicks,
                localYTicks,
                theme,
            );
        }

        const projection = cell.layout.buildProjectionMatrix(
            facetDomain.xMin,
            facetDomain.xMax,
            facetDomain.yMin,
            facetDomain.yMax,
        );
        withScissor(gl, cell.layout, () => {
            chart.glyph.drawSeries(chart, glManager, projection, i);
        });
    }

    chart._lastXDomain = xDomain;
    chart._lastYDomain = yDomain;
    chart._lastXTicks = xTicks;
    chart._lastYTicks = yTicks;
    chart._lastGradientStops = theme.gradientStops;
    chart._lastHasColorCol = hasLegend;
}

/**
 * Redraw the chrome canvas only. Used for lightweight hover updates.
 */
export function renderContinuousChromeOverlay(chart: ContinuousChart): void {
    if (
        !chart._chromeCanvas ||
        !chart._lastLayout ||
        !chart._lastXDomain ||
        !chart._lastYDomain
    )
        return;

    // One-shot destructive prep for the chrome canvas — resizes to
    // CSS × DPR and scales the transform. Per-facet calls below read
    // the already-prepared context via `getScaledContext` so the
    // bitmap persists across the loop.
    initCanvas(chart._chromeCanvas, chart._lastLayout);
    if (chart._facetGrid) {
        renderFacetedChromeOverlay(chart);
    } else {
        renderSinglePlotChromeOverlay(chart);
    }
}

function renderSinglePlotChromeOverlay(chart: ContinuousChart): void {
    const layout = chart._lastLayout!;
    const theme = chart._lastTheme ?? resolveTheme(chart._chromeCanvas!);

    renderAxesChrome(
        chart._chromeCanvas!,
        chart._lastXDomain!,
        chart._lastYDomain!,
        layout,
        chart._lastXTicks!,
        chart._lastYTicks!,
        theme,
    );

    if (chart._lastHasColorCol) {
        const stops = chart._lastGradientStops ?? theme.gradientStops;
        if (chart._colorIsString && chart._uniqueColorLabels.size > 0) {
            const seriesPalette =
                chart._lastSeriesPalette ??
                readSeriesPalette(chart._chromeCanvas!);
            const palette = resolvePalette(
                seriesPalette,
                stops,
                chart._uniqueColorLabels.size,
            );
            renderCategoricalLegend(
                chart._chromeCanvas!,
                layout,
                chart._uniqueColorLabels,
                palette,
            );
        } else if (chart._colorName) {
            renderLegend(
                chart._chromeCanvas!,
                layout,
                {
                    min: chart._colorMin,
                    max: chart._colorMax,
                    label: chart._colorName,
                },
                stops,
            );
        }
    }

    if (chart._hoveredIndex >= 0 && chart._xData && chart._yData) {
        renderTooltip(chart, chart._chromeCanvas!, layout);
    }
}

function renderFacetedChromeOverlay(chart: ContinuousChart): void {
    const grid = chart._facetGrid!;
    const canvas = chart._chromeCanvas!;
    const theme = chart._lastTheme ?? resolveTheme(canvas);
    const sharedXTicks = chart._lastXTicks!;
    const sharedYTicks = chart._lastYTicks!;
    const xDomain = chart._lastXDomain!;
    const yDomain = chart._lastYDomain!;

    // `shared_x_axis` / `shared_y_axis` are silently forced off in
    // independent-zoom mode by the render entry — see `renderContinuousFrame`.
    // So by the time we get here, shared = true implies shared-zoom too.
    const sharedX = chart._facetConfig.shared_x_axis;
    const sharedY = chart._facetConfig.shared_y_axis;
    const independent = chart._facetConfig.zoom_mode === "independent";

    // Shared X axis: one outer band across the bottom of the grid,
    // with ticks painted per-column (one pass per bottom-row cell).
    // Shared Y axis: one outer band down the left, ticks per-row
    // (one pass per leftmost-column cell).
    if (sharedX && grid.outerXAxisRect) {
        const bottomRowLayouts = grid.cells
            .filter((c) => c.isBottomEdge)
            .map((c) => c.layout);
        renderOuterXAxis(
            canvas,
            grid.outerXAxisRect,
            xDomain,
            sharedXTicks,
            bottomRowLayouts,
            theme,
            !!chart._xLabel,
        );
    }
    if (sharedY && grid.outerYAxisRect) {
        const leftColLayouts = grid.cells
            .filter((c) => c.isLeftEdge)
            .map((c) => c.layout);
        renderOuterYAxis(
            canvas,
            grid.outerYAxisRect,
            yDomain,
            sharedYTicks,
            leftColLayouts,
            theme,
            !!chart._yLabel,
        );
    }

    // Per-facet axes for the non-shared sides + title strips.
    for (let i = 0; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        const zc = independent ? chart.getZoomControllerForFacet(i) : null;
        const d = zc ? zc.getVisibleDomain() : null;
        const localX = d ? { ...xDomain, min: d.xMin, max: d.xMax } : xDomain;
        const localY = d ? { ...yDomain, min: d.yMin, max: d.yMax } : yDomain;
        const ticks = independent
            ? computeTicks(localX, localY, cell.layout)
            : { xTicks: sharedXTicks, yTicks: sharedYTicks };

        if (!sharedX) {
            renderCellXAxis(
                canvas,
                localX,
                cell.layout,
                ticks.xTicks,
                theme,
                !!chart._xLabel,
            );
        }
        if (!sharedY) {
            renderCellYAxis(
                canvas,
                localY,
                cell.layout,
                ticks.yTicks,
                theme,
                !!chart._yLabel,
            );
        }

        if (cell.titleRect) {
            drawFacetTitle(canvas, cell.label, cell.titleRect, theme);
        }
    }

    // Shared legend: categorical (string color) or gradient
    // (numeric color). Position derives from `grid.legendRect`
    // which `buildFacetGrid` populates when `hasLegend` was set.
    if (chart._lastHasColorCol && grid.legendRect) {
        const stops = chart._lastGradientStops ?? theme.gradientStops;
        if (
            chart._colorIsString &&
            chart._uniqueColorLabels.size > 0
        ) {
            const seriesPalette =
                chart._lastSeriesPalette ?? readSeriesPalette(canvas);
            const palette = resolvePalette(
                seriesPalette,
                stops,
                Math.max(1, chart._uniqueColorLabels.size),
            );
            renderCategoricalLegendAt(
                canvas,
                grid.legendRect,
                chart._uniqueColorLabels,
                palette,
            );
        } else if (chart._colorName) {
            // Numeric gradient legend in the shared outer rect. The
            // label sits above the bar, so inset the rect's top by
            // the usual 20 px that `renderLegend` reserves.
            renderLegendAt(
                canvas,
                {
                    x: grid.legendRect.x,
                    y: grid.legendRect.y + 20,
                    width: grid.legendRect.width,
                    height: grid.legendRect.height - 20,
                },
                {
                    min: chart._colorMin,
                    max: chart._colorMax,
                    label: chart._colorName,
                },
                stops,
            );
        }
    }

    // Coordinated hover / click indicators across facets. The tooltip
    // lines are whatever the last resolved lazy fetch produced (or
    // null while a fetch is still in flight); `renderCanvasTooltip`
    // paints crosshair + ring regardless, but skips the text box
    // until lines are available. See `handleContinuousHover`.
    if (chart._hoveredIndex >= 0 && chart._xData && chart._yData) {
        const dataX = chart._xData[chart._hoveredIndex];
        const dataY = chart._yData[chart._hoveredIndex];
        const sourceFacet = seriesFromIndex(chart, chart._hoveredIndex);
        const opts = chart.glyph.tooltipOptions();
        const tooltipLines = chart._hoveredTooltipLines ?? [];

        for (let i = 0; i < grid.cells.length; i++) {
            const cell = grid.cells[i];
            const isSource = i === sourceFacet;
            // Pixel position inside this facet for the source point's
            // data coordinate — ghost indicator in non-source facets.
            const pos = cell.layout.dataToPixel(dataX, dataY);
            const plot = cell.layout.plotRect;
            if (
                pos.px < plot.x ||
                pos.px > plot.x + plot.width ||
                pos.py < plot.y ||
                pos.py > plot.y + plot.height
            ) {
                continue;
            }
            const coordinated = chart._facetConfig.coordinated_tooltip;
            const lines = isSource || coordinated ? tooltipLines : [];
            renderCanvasTooltip(canvas, pos, lines, cell.layout, theme, {
                crosshair: opts.crosshair,
                highlightRadius: isSource ? opts.highlightRadius : 0,
            });
        }
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

/** Map a flat slotted index back to its series (facet) index. */
export function seriesFromIndex(
    chart: ContinuousChart,
    flatIdx: number,
): number {
    if (chart._seriesCapacity <= 0) return 0;
    return Math.floor(flatIdx / chart._seriesCapacity);
}

function renderTooltip(
    chart: ContinuousChart,
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
): void {
    const idx = chart._hoveredIndex;
    if (idx < 0 || !chart._xData || !chart._yData) return;

    const pos = layout.dataToPixel(chart._xData[idx], chart._yData[idx]);
    // Lines come from the async lazy tooltip fetch kicked off in
    // `handleContinuousHover`. While a fetch is in flight this is
    // `null`; the canvas tooltip helper still paints the crosshair /
    // highlight ring but skips the text box.
    const lines = chart._hoveredTooltipLines ?? [];
    const theme = chart._lastTheme ?? resolveTheme(canvas);
    renderCanvasTooltip(
        canvas,
        pos,
        lines,
        layout,
        theme,
        chart.glyph.tooltipOptions(),
    );
}
