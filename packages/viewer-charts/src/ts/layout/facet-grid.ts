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

import { PlotLayout, type PlotRect } from "./plot-layout";

/**
 * Tri-state axis mode.
 *
 *   - `"outer"` — one shared axis band reserved at the grid edge;
 *     `outerXAxisRect` / `outerYAxisRect` populated, per-cell gutter
 *     collapsed to 0 on that side. Caller paints the shared axis
 *     once per frame using the grid's outer rect.
 *   - `"cell"` — every cell reserves its own gutter on that side;
 *     caller paints one axis per cell. Outer rect is undefined.
 *   - `"none"` — no gutter anywhere on that side: neither an outer
 *     band nor a per-cell reservation. Intended for chart types with
 *     no numeric axis at all (treemap, sunburst). When BOTH axes are
 *     `"none"` cells are also made flush on the right so adjacent
 *     plot rects share a boundary.
 *
 * Defaults to `"cell"` when undefined.
 */
export type AxisMode = "outer" | "cell" | "none";

export interface FacetGridOptions {
    cssWidth: number;
    cssHeight: number;
    /** See {@link AxisMode}. Default `"cell"`. */
    xAxis?: AxisMode;
    /** See {@link AxisMode}. Default `"cell"`. */
    yAxis?: AxisMode;
    /** Reserve a right gutter for a single shared legend. */
    hasLegend?: boolean;
    /** Axis-label allowance (consumed only when the corresponding axis
     *  mode produces a gutter — outer band or per-cell). */
    hasXLabel?: boolean;
    hasYLabel?: boolean;
    /** Per-facet title strip height (px). 0 disables. */
    titleBand?: number;
    /**
     * Pixel gap between adjacent cells. Carved out of the grid
     * interior before cell sizing; outer edges of the leftmost /
     * rightmost columns and top / bottom rows are unaffected. Default
     * 0 (flush cells).
     */
    gap?: number;
}

export interface FacetCell {
    index: number;
    label: string;
    /**
     * Sub-plot layout. Every cell in a grid has *identical*
     * `plotRect.width` and `plotRect.height` — cell internal margins
     * do not vary by edge position. Shared-axis gutters live in
     * `FacetGrid.outerXAxisRect` / `outerYAxisRect` instead, painted
     * once per frame by the caller.
     */
    layout: PlotLayout;
    /** Title strip above the facet's plot rect, if `titleBand > 0`. */
    titleRect?: PlotRect;
    isLeftEdge: boolean;
    isBottomEdge: boolean;
}

export interface FacetGrid {
    cells: FacetCell[];
    /** Right-gutter rect for the shared legend. */
    legendRect?: PlotRect;
    /**
     * Outer band reserved for the shared X axis (ticks + label). Only
     * set when `xAxis === "outer"`. Spans the grid interior's
     * horizontal extent and sits immediately below the bottom row of
     * cells.
     */
    outerXAxisRect?: PlotRect;
    /**
     * Outer band reserved for the shared Y axis (ticks + label). Only
     * set when `yAxis === "outer"`. Spans the grid interior's
     * vertical extent and sits immediately left of the leftmost
     * column of cells.
     */
    outerYAxisRect?: PlotRect;
}

// Per-cell internal gutter defaults mirror `PlotLayout`'s constants so
// that a cell with `leftExtra: undefined` reserves the same space the
// outer band would reserve when the axis is shared. Keep these in sync
// with `plot-layout.ts`.
const CELL_LEFT_GUTTER = 55;
const CELL_BOTTOM_GUTTER = 24;
const AXIS_LABEL_W = 16;
const AXIS_LABEL_H = 18;

const TITLE_BAND_DEFAULT = 18;
const LEGEND_GUTTER = 96;

/**
 * Pick `(cols, rows)` so that each resulting cell's aspect ratio is as
 * close to 1 as possible given the grid interior. Sweeps `cols ∈ [1,
 * count]` with `rows = ceil(count / cols)` and minimizes
 * `max(cellW/cellH, cellH/cellW)`. Ties break toward fewer total cells
 * (less unused grid area).
 */
function pickGridShape(
    count: number,
    gridW: number,
    gridH: number,
    gap: number,
): { cols: number; rows: number } {
    if (count <= 1) return { cols: 1, rows: 1 };
    let bestCols = 1;
    let bestRows = count;
    let bestCost = Infinity;
    let bestTotal = count;
    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const cellW = Math.max(1, (gridW - (cols - 1) * gap) / cols);
        const cellH = Math.max(1, (gridH - (rows - 1) * gap) / rows);
        const aspect = cellW / cellH;
        const cost = Math.max(aspect, 1 / aspect);
        const total = cols * rows;
        if (cost < bestCost || (cost === bestCost && total < bestTotal)) {
            bestCols = cols;
            bestRows = rows;
            bestCost = cost;
            bestTotal = total;
        }
    }
    return { cols: bestCols, rows: bestRows };
}

/**
 * Arrange `labels.length` sub-plots in a row-major grid sized to fit
 * `(cssWidth, cssHeight)`.
 *
 * Grid shape is chosen to minimize cell aspect distance from square
 * given the container's grid interior: `cols ∈ [1, count]`,
 * `rows = ceil(count / cols)`, tie-broken toward fewer total cells.
 *
 * **Invariant:** every `cells[i].layout.plotRect` has the same
 * `width` and `height`. Shared-axis gutters are carved out of the
 * outer canvas BEFORE cell sizing, so a cell's edge position never
 * affects its internal margins. This lets per-facet draws reuse the
 * same projection scale and lets shared ticks line up with the
 * interior cell boundaries exactly.
 *
 * Axis modes — see {@link AxisMode}:
 *   - `"outer"` → outer band rect is populated; per-cell gutter is 0.
 *   - `"cell"` → outer band is undefined; each cell owns its own gutter.
 *   - `"none"` → no gutter anywhere on that side; used by axis-less
 *     chart types.
 *
 * Because all cells are identical in size, callers can sample *any*
 * cell's layout (e.g. `cells[0].layout`) for tick / scale
 * computations.
 */
export function buildFacetGrid(
    labels: string[],
    opts: FacetGridOptions,
): FacetGrid {
    const count = labels.length;
    const { cssWidth, cssHeight } = opts;

    if (count <= 0 || cssWidth <= 0 || cssHeight <= 0) {
        return { cells: [] };
    }

    const titleBand = opts.titleBand ?? TITLE_BAND_DEFAULT;
    const legendW = opts.hasLegend ? LEGEND_GUTTER : 0;

    const xMode: AxisMode = opts.xAxis ?? "cell";
    const yMode: AxisMode = opts.yAxis ?? "cell";
    // Axis-less chart types (trees) benefit from fully-flush cells —
    // no per-cell breathing on the right either, so adjacent plot
    // rects share a boundary instead of leaving a 16 px seam.
    const cellsFlush = xMode === "none" && yMode === "none";

    // Outer margins: shared-axis gutters + legend gutter live OUTSIDE
    // the per-cell rects.
    const outerLeft =
        yMode === "outer"
            ? CELL_LEFT_GUTTER + (opts.hasYLabel ? AXIS_LABEL_W : 0)
            : 0;
    const outerBottom =
        xMode === "outer"
            ? CELL_BOTTOM_GUTTER + (opts.hasXLabel ? AXIS_LABEL_H : 0)
            : 0;
    const outerTop = 0;
    const outerRight = legendW;

    const gridX = outerLeft;
    const gridY = outerTop;
    const gridW = Math.max(1, cssWidth - outerLeft - outerRight);
    const gridH = Math.max(1, cssHeight - outerTop - outerBottom);

    // Carve the total inter-cell gap out of the grid interior before
    // sizing cells so every cell remains identical in size (the
    // grid-uniform invariant). Gaps only sit BETWEEN neighbors — not
    // against the outer edges.
    const gap = Math.max(0, opts.gap ?? 0);
    const { cols, rows } = pickGridShape(count, gridW, gridH, gap);
    const totalGapX = Math.max(0, cols - 1) * gap;
    const totalGapY = Math.max(0, rows - 1) * gap;
    const cellW = Math.max(1, (gridW - totalGapX) / cols);
    const cellH = Math.max(1, (gridH - totalGapY) / rows);

    const cells: FacetCell[] = [];
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i - row * cols;
        const isBottomEdge = row === rows - 1 || i + cols >= count;
        const isLeftEdge = col === 0;

        const cellX = gridX + col * (cellW + gap);
        const cellY = gridY + row * (cellH + gap);

        // Carve a title strip from the top of each cell. The remaining
        // rect becomes the per-cell `PlotLayout`.
        const plotTop = cellY + titleBand;
        const plotLeft = cellX;
        const plotWidth = cellW;
        const plotHeight = Math.max(1, cellH - titleBand);

        // Per-cell gutters:
        //   - "cell" → keep `PlotLayout` default (undefined).
        //   - "outer" / "none" → collapse to 0 (no internal gutter).
        // Per-cell labels only paint when the axis is per-cell.
        const layout = new PlotLayout(cssWidth, cssHeight, {
            hasXLabel: xMode === "cell" && opts.hasXLabel === true,
            hasYLabel: yMode === "cell" && opts.hasYLabel === true,
            hasLegend: false,
            leftExtra: yMode === "cell" ? undefined : 0,
            bottomExtra: xMode === "cell" ? undefined : 0,
            rightExtra: cellsFlush ? 0 : undefined,
            originX: plotLeft,
            originY: plotTop,
            cellWidth: plotWidth,
            cellHeight: plotHeight,
        });

        const titleRect: PlotRect | undefined =
            titleBand > 0
                ? {
                      x: plotLeft,
                      y: cellY,
                      width: plotWidth,
                      height: titleBand,
                  }
                : undefined;

        cells.push({
            index: i,
            label: labels[i],
            layout,
            titleRect,
            isLeftEdge,
            isBottomEdge,
        });
    }

    const legendRect: PlotRect | undefined = opts.hasLegend
        ? {
              x: gridX + gridW,
              y: outerTop,
              width: legendW,
              height: gridH,
          }
        : undefined;

    const outerXAxisRect: PlotRect | undefined =
        xMode === "outer"
            ? {
                  x: gridX,
                  y: gridY + gridH,
                  width: gridW,
                  height: outerBottom,
              }
            : undefined;

    const outerYAxisRect: PlotRect | undefined =
        yMode === "outer"
            ? {
                  x: 0,
                  y: gridY,
                  width: outerLeft,
                  height: gridH,
              }
            : undefined;

    return { cells, legendRect, outerXAxisRect, outerYAxisRect };
}
