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

import type { Canvas2D } from "../canvas-types";
import { drawFacetTitle } from "../../axis/facet-chrome";
import type { WebGLContextManager } from "../../webgl/context-manager";
import type { CartesianChart } from "./cartesian";
import { PlotLayout } from "../../layout/plot-layout";
import {
    buildFacetGrid,
    bottomRowLayouts,
    leftColumnLayouts,
    type FacetGrid,
} from "../../layout/facet-grid";
import { type Theme } from "../../theme/theme";
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
} from "../../axis/numeric-axis";
import { initCanvas, getScaledContext } from "../../axis/canvas";
import {
    renderLegend,
    renderLegendAt,
    renderCategoricalLegend,
    renderCategoricalLegendAt,
} from "../../axis/legend";

/**
 * NaN guard: `_xOrigin`/`_yOrigin` start as NaN before the first valid sample.
 */
function rebaseOrigin(o: number): number {
    return isNaN(o) ? 0 : o;
}

/**
 * Full-frame render: gridlines → glyph draw inside the plot-frame
 * scissor → chrome overlay (axes + legend + tooltip).
 *
 * Branches on `_facetConfig.facet_mode`:
 *
 *   - `"overlay"` (legacy): a single plot rect; all split series are
 *     drawn together, distinguished by color. This is the pre-facet
 *     behavior, preserved for manual opt-in via `plugin_config.facet_mode`.
 *   - `"grid"` (default): when splits are present, `_splitGroups` laid
 *     out as a grid of sub-plots by {@link buildFacetGrid}. When splits
 *     are absent, falls through to the single-plot path — identical to
 *     the `"overlay"` case with 0 splits, so the non-split render path
 *     is byte-for-byte unchanged from before this feature.
 */
export function renderCartesianFrame(
    chart: CartesianChart,
    glManager: WebGLContextManager,
): void {
    const gl = glManager.gl;
    const dpr = glManager.dpr;
    const cssWidth = gl.canvas.width / dpr;
    const cssHeight = gl.canvas.height / dpr;
    if (cssWidth <= 0 || cssHeight <= 0) {
        return;
    }

    const hasSplits = chart._splitGroups.length > 0;
    const facetMode = chart._facetConfig.facet_mode;
    const useGrid = hasSplits && facetMode === "grid";

    chart.computeEffectiveFacetFlags();

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

    if (!isFinite(domain.xMin) || !isFinite(domain.yMin)) {
        return;
    }

    const theme = chart._resolveTheme();
    const seriesPalette = theme.seriesPalette;

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
            ? Math.max(1, chart._splitGroups.length)
            : Math.max(1, chart._uniqueColorLabels.size);

        // Cache key carries the `seriesPalette` reference (changes per
        // theme — `_resolveTheme` returns a fresh `Theme` after
        // `invalidateTheme()`) plus `labelCount`. Reference compare
        // catches theme switches that the prior length-only key
        // missed.
        if (
            chart._lastLutStops &&
            chart._lastLutSeriesPalette === seriesPalette &&
            chart._lastLutLabelCount === labelCount
        ) {
            lutStops = chart._lastLutStops;
        } else {
            const palette = resolvePalette(
                seriesPalette,
                theme.gradientStops,
                labelCount,
            );
            lutStops = paletteToStops(palette);
            chart._lastLutStops = lutStops;
            chart._lastLutSeriesPalette = seriesPalette;
            chart._lastLutLabelCount = labelCount;
        }
    } else {
        chart._lastLutStops = null;
        chart._lastLutSeriesPalette = null;
        chart._lastLutLabelCount = -1;
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

    renderCartesianChromeOverlay(chart);
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
    chart: CartesianChart,
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
    chart: CartesianChart,
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
    chart: CartesianChart,
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
    if (chart._zoomController) {
        chart._zoomController.updateLayout(layout);
    }

    const projection = layout.buildProjectionMatrix(
        domain.xMin,
        domain.xMax,
        domain.yMin,
        domain.yMax,
        undefined,
        undefined,
        undefined,
        rebaseOrigin(chart._xOrigin),
        rebaseOrigin(chart._yOrigin),
    );

    const xDomain = buildXDomain(chart, domain.xMin, domain.xMax, xIsDate);
    const yDomain = buildYDomain(chart, domain.yMin, domain.yMax, yIsDate);
    const { xTicks, yTicks } = computeTicks(xDomain, yDomain, layout);

    const isMap = chart._renderMode === "map";

    if (chart._gridlineCanvas && !isMap) {
        // One-shot destructive prep (resizes + clears + scales to DPR).
        // `renderGridlines` itself is non-destructive.
        const dpr = glManager.dpr;
        initCanvas(chart._gridlineCanvas, layout, dpr);
        renderGridlines(
            chart._gridlineCanvas,
            layout,
            xTicks,
            yTicks,
            theme,
            dpr,
        );
    } else if (chart._gridlineCanvas && isMap) {
        // Map mode draws no cartesian gridlines, but the gridline
        // canvas may carry stale ink from a prior cartesian chart
        // type. Reset it to a clean transparent surface so the
        // basemap (rendered into the GL canvas below) reads as the
        // only background layer.
        initCanvas(chart._gridlineCanvas, layout, glManager.dpr);
    }

    renderInPlotFrame(gl, layout, glManager.dpr, () => {
        if (isMap) {
            chart.renderBackground(
                glManager,
                layout,
                projection,
                domain,
                rebaseOrigin(chart._xOrigin),
                rebaseOrigin(chart._yOrigin),
            );
        }

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
    chart: CartesianChart,
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

    // Use the frame-local effective flags (set in
    // `renderCartesianFrame`) so independent-zoom mode falls through
    // to per-cell axes without mutating the user's stored
    // `_facetConfig.shared_x_axis` / `shared_y_axis`. Continuous
    // charts always have both axes, so the false branch maps to
    // per-cell mode (never to "none", which is reserved for tree
    // charts).
    const grid: FacetGrid = buildFacetGrid(labels, {
        cssWidth,
        cssHeight,
        xAxis: chart._lastEffectiveSharedX ? "outer" : "cell",
        yAxis: chart._lastEffectiveSharedY ? "outer" : "cell",
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
    chart.syncFacetZoomLayouts(grid.cells);
    const independent = chart._facetConfig.zoom_mode === "independent";

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
        initCanvas(chart._gridlineCanvas, sampleLayout, glManager.dpr);
    }

    clearAndSetupFrame(gl);

    for (let i = 0; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        const zc = chart.getZoomControllerForFacet(i);
        const facetDomain = independent && zc ? zc.getVisibleDomain() : domain;

        // `buildProjectionMatrix` must run before `renderGridlines`:
        // it seeds the padded-domain fields on `cell.layout` that
        // `dataToPixel` (used by gridline tick → pixel mapping) reads.
        // Skipping this order leaves the layout on its default
        // `[0, 1]` padded domain, and every tick pixel falls outside
        // the cell's `plotRect`, so `drawGridlinesX/Y` filters them
        // all out and the gridline canvas stays blank.
        const projection = cell.layout.buildProjectionMatrix(
            facetDomain.xMin,
            facetDomain.xMax,
            facetDomain.yMin,
            facetDomain.yMax,
            undefined,
            undefined,
            undefined,
            rebaseOrigin(chart._xOrigin),
            rebaseOrigin(chart._yOrigin),
        );

        // Per-facet gridlines: reuse shared ticks in shared-zoom mode,
        // compute fresh ticks in independent mode (each facet has its
        // own domain). Map mode skips gridlines entirely; the
        // basemap layer is rendered into the GL canvas inside the
        // facet's scissor below.
        const isMap = chart._renderMode === "map";
        if (chart._gridlineCanvas && !isMap) {
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
                glManager.dpr,
            );
        }

        withScissor(gl, cell.layout, glManager.dpr, () => {
            if (isMap) {
                chart.renderBackground(
                    glManager,
                    cell.layout,
                    projection,
                    facetDomain,
                    rebaseOrigin(chart._xOrigin),
                    rebaseOrigin(chart._yOrigin),
                );
            }

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
export function renderCartesianChromeOverlay(chart: CartesianChart): void {
    if (
        !chart._chromeCanvas ||
        !chart._lastLayout ||
        !chart._lastXDomain ||
        !chart._lastYDomain ||
        !chart._glManager
    ) {
        return;
    }

    // One-shot destructive prep for the chrome canvas — resizes to
    // CSS × DPR and scales the transform. Per-facet calls below read
    // the already-prepared context via `getScaledContext` so the
    // bitmap persists across the loop.
    initCanvas(chart._chromeCanvas, chart._lastLayout, chart._glManager.dpr);
    if (chart._facetGrid) {
        renderFacetedChromeOverlay(chart);
    } else {
        renderSinglePlotChromeOverlay(chart);
    }
}

function renderSinglePlotChromeOverlay(chart: CartesianChart): void {
    const layout = chart._lastLayout!;
    const theme = chart._resolveTheme();
    const dpr = chart._glManager?.dpr ?? 1;
    const isMap = chart._renderMode === "map";

    if (isMap) {
        chart.renderMapChrome(chart._chromeCanvas!, layout, theme, dpr);
    } else {
        renderAxesChrome(
            chart._chromeCanvas!,
            chart._lastXDomain!,
            chart._lastYDomain!,
            layout,
            chart._lastXTicks!,
            chart._lastYTicks!,
            theme,
            dpr,
            chart.getColumnFormatter(chart._xName, "tick"),
            chart.getColumnFormatter(chart._yName, "tick"),
        );
    }

    if (chart._lastHasColorCol) {
        const stops = chart._lastGradientStops ?? theme.gradientStops;
        if (chart._colorIsString && chart._uniqueColorLabels.size > 0) {
            const palette = resolvePalette(
                theme.seriesPalette,
                stops,
                chart._uniqueColorLabels.size,
            );
            renderCategoricalLegend(
                chart._chromeCanvas!,
                layout,
                chart._uniqueColorLabels,
                palette,
                theme,
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
                theme,
                chart.getColumnFormatter(chart._colorName, "value"),
            );
        }
    }

    renderScatterLabels(chart, chart._chromeCanvas!, layout, 0, 1);

    if (chart._hoveredIndex >= 0 && chart._xData && chart._yData) {
        renderTooltip(chart, chart._chromeCanvas!, layout);
    }
}

function renderFacetedChromeOverlay(chart: CartesianChart): void {
    const grid = chart._facetGrid!;
    const canvas = chart._chromeCanvas!;
    const theme = chart._resolveTheme();
    const dpr = chart._glManager?.dpr ?? 1;
    const sharedXTicks = chart._lastXTicks!;
    const sharedYTicks = chart._lastYTicks!;
    const xDomain = chart._lastXDomain!;
    const yDomain = chart._lastYDomain!;
    const isMap = chart._renderMode === "map";

    // Read the frame-local effective flags set by `renderCartesianFrame`
    // — these already fold in the independent-zoom override (outer
    // axes are incompatible with per-cell viewports), so `sharedX` /
    // `sharedY` true here implies shared-zoom too.
    const sharedX = chart._lastEffectiveSharedX;
    const sharedY = chart._lastEffectiveSharedY;
    const independent = chart._facetConfig.zoom_mode === "independent";

    // Shared X axis: one outer band across the bottom of the grid,
    // with ticks painted per-column (one pass per bottom-row cell).
    // Shared Y axis: one outer band down the left, ticks per-row
    // (one pass per leftmost-column cell). Map mode replaces both
    // with `renderMapChrome` (attribution + scale bar), painted once
    // over the whole facet grid.
    if (isMap) {
        chart.renderMapChrome(canvas, chart._lastLayout!, theme, dpr);
    }

    if (!isMap && sharedX && grid.outerXAxisRect) {
        renderOuterXAxis(
            canvas,
            grid.outerXAxisRect,
            xDomain,
            sharedXTicks,
            bottomRowLayouts(grid),
            theme,
            !!chart._xLabel,
            dpr,
            chart.getColumnFormatter(chart._xName, "tick"),
        );
    }

    if (!isMap && sharedY && grid.outerYAxisRect) {
        renderOuterYAxis(
            canvas,
            grid.outerYAxisRect,
            yDomain,
            sharedYTicks,
            leftColumnLayouts(grid),
            theme,
            !!chart._yLabel,
            dpr,
            chart.getColumnFormatter(chart._yName, "tick"),
        );
    }

    // Per-facet axes for the non-shared sides + title strips.
    // Map mode skips per-cell axis rendering (no cartesian axes
    // belong on a map) but still paints facet titles and labels.
    for (let i = 0; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        const zc = independent ? chart.getZoomControllerForFacet(i) : null;
        const d = zc ? zc.getVisibleDomain() : null;
        const localX = d ? { ...xDomain, min: d.xMin, max: d.xMax } : xDomain;
        const localY = d ? { ...yDomain, min: d.yMin, max: d.yMax } : yDomain;
        const ticks = independent
            ? computeTicks(localX, localY, cell.layout)
            : { xTicks: sharedXTicks, yTicks: sharedYTicks };

        if (!isMap && !sharedX) {
            renderCellXAxis(
                canvas,
                localX,
                cell.layout,
                ticks.xTicks,
                theme,
                !!chart._xLabel,
                dpr,
                chart.getColumnFormatter(chart._xName, "tick"),
            );
        }

        if (!isMap && !sharedY) {
            renderCellYAxis(
                canvas,
                localY,
                cell.layout,
                ticks.yTicks,
                theme,
                !!chart._yLabel,
                dpr,
                chart.getColumnFormatter(chart._yName, "tick"),
            );
        }

        if (cell.titleRect) {
            drawFacetTitle(canvas, cell.label, cell.titleRect, theme, dpr);
        }

        renderScatterLabels(chart, canvas, cell.layout, i, i + 1);
    }

    // Shared legend: categorical (string color) or gradient
    // (numeric color). Position derives from `grid.legendRect`
    // which `buildFacetGrid` populates when `hasLegend` was set.
    if (chart._lastHasColorCol && grid.legendRect) {
        const stops = chart._lastGradientStops ?? theme.gradientStops;
        if (chart._colorIsString && chart._uniqueColorLabels.size > 0) {
            const palette = resolvePalette(
                theme.seriesPalette,
                stops,
                Math.max(1, chart._uniqueColorLabels.size),
            );
            renderCategoricalLegendAt(
                canvas,
                grid.legendRect,
                chart._uniqueColorLabels,
                palette,
                theme,
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
                theme,
                chart.getColumnFormatter(chart._colorName, "value"),
            );
        }
    }

    // Coordinated hover / click indicators across facets. The tooltip
    // lines are whatever the last resolved lazy fetch produced (or
    // null while a fetch is still in flight); `renderCanvasTooltip`
    // paints crosshair + ring regardless, but skips the text box
    // until lines are available. See `handleCartesianHover`.
    if (chart._hoveredIndex >= 0 && chart._xData && chart._yData) {
        // `_xData`/`_yData` are rebased; `dataToPixel` expects absolute
        // domain coords (matching `paddedXMin`/`paddedXMax`), so undo
        // the rebase before mapping.
        const xOrigin = isNaN(chart._xOrigin) ? 0 : chart._xOrigin;
        const yOrigin = isNaN(chart._yOrigin) ? 0 : chart._yOrigin;
        const dataX = chart._xData[chart._hoveredIndex] + xOrigin;
        const dataY = chart._yData[chart._hoveredIndex] + yOrigin;
        const sourceFacet = seriesFromIndex(chart, chart._hoveredIndex);
        const opts = chart.glyph.tooltipOptions();
        const tooltipLines = chart._lazyTooltip.lines ?? [];

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
            renderCanvasTooltip(canvas, pos, lines, cell.layout, theme, dpr, {
                crosshair: opts.crosshair,
                highlightRadius: isSource ? opts.highlightRadius : 0,
            });
        }
    }
}

/**
 * Map a flat slotted index back to its series (facet) index.
 */
export function seriesFromIndex(
    chart: CartesianChart,
    flatIdx: number,
): number {
    if (chart._seriesCapacity <= 0) {
        return 0;
    }

    return Math.floor(flatIdx / chart._seriesCapacity);
}

/**
 * Maximum scatter labels painted in a single chrome pass. Beyond this
 * we sample with a fixed stride so the canvas pass stays bounded as
 * the user zooms out. The chrome overlay redraws on hover, so an
 * unbounded `fillText` loop would stutter on every mouse move.
 */
const MAX_SCATTER_LABELS = 5_000;

/**
 * Draw the scatter-label column (slot 4) as 2D text next to each
 * visible point. Labels are anchored slightly to the right of the
 * point and vertically centered on it, painted in the theme's
 * `labelColor`. Caller scopes us to a series range so faceted mode
 * draws only the cell's own labels.
 */
function renderScatterLabels(
    chart: CartesianChart,
    canvas: Canvas2D,
    layout: PlotLayout,
    seriesStart: number,
    seriesEnd: number,
): void {
    if (!chart._labels || !chart._xData || !chart._yData) {
        return;
    }

    const dict = chart._labels.dictionary;
    const labelData = chart._labels.data;
    const xData = chart._xData;
    const yData = chart._yData;
    const xOrigin = isNaN(chart._xOrigin) ? 0 : chart._xOrigin;
    const yOrigin = isNaN(chart._yOrigin) ? 0 : chart._yOrigin;
    const cap = chart._seriesCapacity;
    if (cap <= 0) {
        return;
    }

    let visibleCount = 0;
    for (let s = seriesStart; s < seriesEnd; s++) {
        visibleCount += chart._seriesUploadedCounts[s] ?? 0;
    }

    if (visibleCount === 0) {
        return;
    }

    const dpr = chart._glManager?.dpr ?? 1;
    const ctx = getScaledContext(canvas, dpr);
    if (!ctx) {
        return;
    }

    const theme = chart._resolveTheme();
    const plot = layout.plotRect;
    const stride = Math.max(1, Math.ceil(visibleCount / MAX_SCATTER_LABELS));

    ctx.save();
    ctx.font = `11px ${theme.fontFamily}`;
    ctx.fillStyle = theme.labelColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let s = seriesStart; s < seriesEnd; s++) {
        const count = chart._seriesUploadedCounts[s] ?? 0;
        const base = s * cap;
        for (let j = 0; j < count; j += stride) {
            const idx = base + j;
            const dictIdx = labelData[idx];
            if (dictIdx < 0) {
                continue;
            }

            const { px, py } = layout.dataToPixel(
                xData[idx] + xOrigin,
                yData[idx] + yOrigin,
            );
            if (
                px < plot.x ||
                px > plot.x + plot.width ||
                py < plot.y ||
                py > plot.y + plot.height
            ) {
                continue;
            }

            ctx.fillText(dict[dictIdx], px + 8, py - 4);
        }
    }

    ctx.restore();
}

function renderTooltip(
    chart: CartesianChart,
    canvas: Canvas2D,
    layout: PlotLayout,
): void {
    const idx = chart._hoveredIndex;
    if (idx < 0 || !chart._xData || !chart._yData) {
        return;
    }

    const xOrigin = isNaN(chart._xOrigin) ? 0 : chart._xOrigin;
    const yOrigin = isNaN(chart._yOrigin) ? 0 : chart._yOrigin;
    const pos = layout.dataToPixel(
        chart._xData[idx] + xOrigin,
        chart._yData[idx] + yOrigin,
    );

    // Lines come from the async lazy tooltip fetch kicked off in
    // `handleCartesianHover`. While a fetch is in flight this is
    // `null`; the canvas tooltip helper still paints the crosshair /
    // highlight ring but skips the text box.
    const lines = chart._lazyTooltip.lines ?? [];
    const theme = chart._resolveTheme();
    renderCanvasTooltip(
        canvas,
        pos,
        lines,
        layout,
        theme,
        chart._glManager?.dpr ?? 1,
        chart.glyph.tooltipOptions(),
    );
}
