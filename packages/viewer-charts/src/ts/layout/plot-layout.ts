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

export interface PlotMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface PlotRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PlotLayoutOptions {
    hasXLabel: boolean;
    hasYLabel: boolean;
    hasLegend: boolean;
    /**
     * Additional CSS-pixel height reserved at the bottom of the plot for a
     * hierarchical / rotated categorical X axis. Overrides the default 24px
     * tick band. The axis-label allowance from `hasXLabel` is preserved.
     */
    bottomExtra?: number;

    /**
     * Total CSS-pixel width reserved at the left of the plot for a
     * hierarchical categorical Y axis. Overrides the default `55 +
     * hasYLabel*16` left gutter. The axis-label allowance from `hasYLabel`
     * is preserved.
     */
    leftExtra?: number;

    /**
     * Total CSS-pixel width reserved at the right of the plot. Overrides
     * the default (`80` when `hasLegend`, else `16`). Faceted cells
     * without axes (treemap / sunburst in grid mode) pass `0` to make
     * adjacent cell plot rects flush; axis-bearing charts leave it
     * unset to keep the default breathing-room margin.
     */
    rightExtra?: number;

    /**
     * Absolute canvas-coordinate offset for this layout's plot origin.
     * When set, `cssWidth` / `cssHeight` describe the *outer* canvas, and
     * `originX` / `originY` name the top-left corner of the cell this
     * layout represents. The cell's own width/height come from
     * `cellWidth` / `cellHeight`. `margins` are computed relative to the
     * cell then shifted into canvas-absolute space so projection
     * matrices, scissor, and `dataToPixel` all operate in full-canvas
     * coordinates without branching per-facet.
     *
     * When any of these fields is unset, the layout is single-plot: the
     * cell occupies the whole canvas and `originX` / `originY` default
     * to 0.
     */
    originX?: number;
    originY?: number;
    cellWidth?: number;
    cellHeight?: number;
}

/**
 * Coordinates margins and coordinate transforms between WebGL and Canvas2D.
 * All measurements are in CSS pixels (not physical/DPR-scaled pixels).
 */
export class PlotLayout {
    readonly margins: PlotMargins;
    readonly plotRect: PlotRect;
    readonly cssWidth: number;
    readonly cssHeight: number;

    // Padded domain set by buildProjectionMatrix, used by dataToPixel
    // and pixelToData for tooltip hit-testing.
    paddedXMin = 0;
    paddedXMax = 1;
    paddedYMin = 0;
    paddedYMax = 1;

    constructor(
        cssWidth: number,
        cssHeight: number,
        options: PlotLayoutOptions,
    ) {
        this.cssWidth = cssWidth;
        this.cssHeight = cssHeight;

        const baseLeft = options.leftExtra ?? 55;
        const left = baseLeft + (options.hasYLabel ? 16 : 0);
        const baseBottom = options.bottomExtra ?? 24;
        const bottom = baseBottom + (options.hasXLabel ? 18 : 0);
        const top = 0;
        const right = options.rightExtra ?? (options.hasLegend ? 80 : 16);

        // Facet cells: the sub-plot lives at `(originX, originY)` within a
        // larger canvas of size `(cssWidth, cssHeight)`. Its own bounds are
        // `cellWidth × cellHeight`. The gutters above are then interpreted
        // inside that cell, and `margins` / `plotRect` are shifted into
        // canvas-absolute coordinates. Single-plot layouts leave these
        // unset, in which case `originX / originY = 0` and the cell
        // occupies the whole canvas — identical to pre-facet semantics.
        const originX = options.originX ?? 0;
        const originY = options.originY ?? 0;
        const cellW = options.cellWidth ?? cssWidth;
        const cellH = options.cellHeight ?? cssHeight;

        const marginLeftAbs = originX + left;
        const marginTopAbs = originY + top;
        const plotW = Math.max(1, cellW - left - right);
        const plotH = Math.max(1, cellH - top - bottom);
        const marginRightAbs = cssWidth - (marginLeftAbs + plotW);
        const marginBottomAbs = cssHeight - (marginTopAbs + plotH);

        this.margins = {
            top: marginTopAbs,
            right: marginRightAbs,
            bottom: marginBottomAbs,
            left: marginLeftAbs,
        };

        this.plotRect = {
            x: marginLeftAbs,
            y: marginTopAbs,
            width: plotW,
            height: plotH,
        };
    }

    /**
     * Build an orthographic projection matrix that maps data coordinates
     * [xMin..xMax, yMin..yMax] to the plot area sub-region of clip space [-1, 1].
     *
     * The matrix bakes margin offsets into the transform so that gl.viewport
     * remains full-canvas and no scissor/sub-viewport is needed.
     *
     * `clamp`, when set, names the axis that carries the *value* (as
     * opposed to categorical / positional) data. Today it only affects
     * `requireZero`; both axes always receive symmetric 2% padding.
     *
     * `requireZero`, when true, guarantees that the unpadded value `0`
     * falls inside the clamped axis's final domain. For all-positive
     * data the axis minimum is pinned at `0` (the baseline sits on the
     * axis line); for all-negative data the maximum is pinned at `0`;
     * for data that already straddles zero, nothing changes. Pairs with
     * `clamp`, and is a no-op when `clamp` is unset.
     */
    buildProjectionMatrix(
        xMin: number,
        xMax: number,
        yMin: number,
        yMax: number,
        clamp?: "x" | "y",
        requireZero?: boolean,
    ): Float32Array {
        // Symmetric 2% cosmetic padding on both axes.
        let xRange = xMax - xMin;
        let yRange = yMax - yMin;
        if (xRange === 0) xRange = 1;
        if (yRange === 0) yRange = 1;
        const xPad = xRange * 0.02;
        const yPad = yRange * 0.02;

        // Evaluate the zero-snap condition against the *pre-pad*
        // values so that an exact-zero boundary (e.g. bar pipelines
        // that snap `valMin` to 0) still qualifies — otherwise the
        // padding step would tip the boundary slightly negative and
        // the snap branch below would miss. Inclusive comparison is
        // deliberate.
        const snapYMin = requireZero && clamp === "y" && yMin >= 0;
        const snapYMax = requireZero && clamp === "y" && yMax <= 0;
        const snapXMin = requireZero && clamp === "x" && xMin >= 0;
        const snapXMax = requireZero && clamp === "x" && xMax <= 0;

        xMin -= xPad;
        xMax += xPad;
        yMin -= yPad;
        yMax += yPad;

        // Pin the snapped boundary to exactly zero and give the
        // opposite boundary a second pad for visual headroom above the
        // tallest bar. No-op when data straddles zero (neither flag
        // set) so no boundary collapses onto an in-range value.
        if (snapYMin) {
            yMin = 0;
            yMax += yPad;
        } else if (snapYMax) {
            yMax = 0;
            yMin -= yPad;
        }
        if (snapXMin) {
            xMin = 0;
            xMax += xPad;
        } else if (snapXMax) {
            xMax = 0;
            xMin -= xPad;
        }

        // Store padded domain for dataToPixel
        this.paddedXMin = xMin;
        this.paddedXMax = xMax;
        this.paddedYMin = yMin;
        this.paddedYMax = yMax;

        // Clip-space bounds for the plot area
        const clipLeft = (2 * this.margins.left) / this.cssWidth - 1;
        const clipRight = 1 - (2 * this.margins.right) / this.cssWidth;
        const clipBottom = (2 * this.margins.bottom) / this.cssHeight - 1;
        const clipTop = 1 - (2 * this.margins.top) / this.cssHeight;

        // Scale and translate: data [min,max] → clip [clipMin, clipMax]
        const sx = (clipRight - clipLeft) / (xMax - xMin);
        const sy = (clipTop - clipBottom) / (yMax - yMin);
        const tx = clipLeft - sx * xMin;
        const ty = clipBottom - sy * yMin;

        // Column-major 4x4 matrix
        // prettier-ignore
        return new Float32Array([
            sx,  0,   0, 0,
            0,   sy,  0, 0,
            0,   0,  -1, 0,
            tx,  ty,  0, 1,
        ]);
    }

    /**
     * Convert data coordinates to CSS pixel coordinates on the overlay canvas.
     * Uses the padded domain from the last `buildProjectionMatrix` call so
     * that pixel positions align exactly with the WebGL projection.
     */
    dataToPixel(dataX: number, dataY: number): { px: number; py: number } {
        const { x, y, width, height } = this.plotRect;
        const tx =
            (dataX - this.paddedXMin) / (this.paddedXMax - this.paddedXMin);
        const ty =
            (dataY - this.paddedYMin) / (this.paddedYMax - this.paddedYMin);
        return {
            px: x + tx * width,
            py: y + (1 - ty) * height, // Y is flipped (CSS Y goes down)
        };
    }
}
