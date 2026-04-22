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

import { PlotLayout } from "../../layout/plot-layout";
import type { Theme } from "../../theme/theme";
import type {
    CategoricalDomain,
    CategoricalLevel,
} from "../../chrome/categorical-axis";
import {
    buildGroupRuns,
    maxDictLength,
} from "../../chrome/categorical-axis-core";
import { truncateLabel } from "../../chrome/label-geometry";

interface LevelTickLayout {
    size: number; // width in CSS pixels consumed by this level
}

export interface CategoricalYAxisOptions {
    /**
     * Drop the innermost level of the domain before rendering, promoting
     * the second-to-last level into the leaf position. Used by the
     * heatmap, whose column names encode `split…|aggregate` — with a
     * single aggregate the leaf level is a redundant constant column,
     * and showing the last split as the leaf reads more naturally.
     *
     * No-op when `levels.length <= 1` (there's nothing left to promote);
     * the axis renders nothing in that case.
     */
    skipLeafLevel?: boolean;
}

/**
 * Apply `skipLeafLevel` to a levels array. Returns the input unchanged
 * when the option is off or when there's only a single level (the leaf
 * itself).
 */
function effectiveLevels(
    levels: CategoricalLevel[],
    opts?: CategoricalYAxisOptions,
): CategoricalLevel[] {
    if (opts?.skipLeafLevel && levels.length > 1) {
        return levels.slice(0, -1);
    }
    return levels;
}

const LEAF_LEVEL_WIDTH = 80;
const OUTER_LEVEL_WIDTH = 20;
const TICK_SIZE = 5;
const LABEL_FONT_PX = 11;

/**
 * Map a Y category index to a pixel y-coordinate. Matches the convention
 * chosen for the heatmap plot: yIdx=0 sits at the *bottom* (math Y-up),
 * so a higher yIdx maps to a lower pixel value via `dataToPixel`'s
 * standard (1 - t) flip.
 */
export function categoryIndexToPixelY(
    layout: PlotLayout,
    index: number,
): number {
    return layout.dataToPixel(0, index).py;
}

/**
 * Per-level widths for a vertical categorical axis. Leaf width is
 * derived from the longest label in that level's dictionary; outer
 * levels get a fixed narrow column for the bracket + short text.
 */
export function measureCategoricalYLevels(
    domain: CategoricalDomain,
    opts?: CategoricalYAxisOptions,
): LevelTickLayout[] {
    const levels = effectiveLevels(domain.levels, opts);
    const L = levels.length;
    const result: LevelTickLayout[] = [];
    for (let l = 0; l < L; l++) {
        const longest = maxDictLength(levels[l].dictionary);
        if (l === L - 1) {
            const w = Math.max(LEAF_LEVEL_WIDTH, longest * 6.5 + 16);
            result.push({ size: w });
        } else {
            const w = Math.max(OUTER_LEVEL_WIDTH, longest * 6.5 + 16);
            result.push({ size: w });
        }
    }
    return result;
}

/**
 * Total CSS-pixel width required for the categorical tick band (levels),
 * NOT including the per-axis-label allowance. Caller feeds this to
 * `PlotLayout` as `leftExtra`; the axis label is added via `hasYLabel`.
 */
export function measureCategoricalAxisWidth(
    domain: CategoricalDomain,
    opts?: CategoricalYAxisOptions,
): number {
    const levels = effectiveLevels(domain.levels, opts);
    if (domain.numRows === 0 || levels.length === 0) return 55;
    const levelLayouts = measureCategoricalYLevels(domain, opts);
    let total = 0;
    for (const l of levelLayouts) total += l.size;
    return total;
}

function getLeafText(level: CategoricalLevel, row: number): string {
    return level.dictionary[level.indices[row]] ?? "";
}

/**
 * Render hierarchical Y-axis tick marks, leaf labels, and outer-level
 * bracket labels on the chrome canvas. The axis line is drawn by the
 * caller alongside the X axis.
 */
export function renderCategoricalYTicks(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    domain: CategoricalDomain,
    theme: Theme,
    opts?: CategoricalYAxisOptions,
): void {
    const levels = effectiveLevels(domain.levels, opts);
    if (domain.numRows === 0 || levels.length === 0) return;

    const { tickColor, labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.lineWidth = 1;
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;

    const levelLayouts = measureCategoricalYLevels(domain, opts);

    // Visible Y range from the (possibly zoomed) padded Y domain.
    const visMin = Math.max(0, Math.ceil(layout.paddedYMin));
    const visMax = Math.min(domain.numRows - 1, Math.floor(layout.paddedYMax));
    if (visMax < visMin) return;

    const L = levels.length;
    // Cursor walks from the plot's left edge leftward, innermost (leaf)
    // level closest to the plot, outer levels further left.
    let xCursor = plot.x;

    for (let l = L - 1; l >= 0; l--) {
        const level = levels[l];
        const lay = levelLayouts[l];
        const bandRight = xCursor;
        const bandLeft = xCursor - lay.size;
        xCursor = bandLeft;

        if (l === L - 1) {
            renderLeafLevel(
                ctx,
                layout,
                level,
                visMin,
                visMax,
                bandRight,
                bandLeft,
                fontFamily,
                tickColor,
            );
        } else {
            renderOuterLevel(
                ctx,
                layout,
                level,
                visMin,
                visMax,
                bandLeft,
                bandRight,
                fontFamily,
                tickColor,
            );
        }
    }

    // Axis label — optional; draw vertical along the leftmost edge.
    const axisLabel = domain.levelLabels.filter((s) => !!s).join(" / ");
    if (axisLabel) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.save();
        ctx.translate(14, plot.y + plot.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(axisLabel, 0, 0);
        ctx.restore();
    }
}

function renderLeafLevel(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    bandRight: number,
    bandLeft: number,
    fontFamily: string,
    tickColor: string,
): void {
    const plot = layout.plotRect;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.beginPath();
    for (let r = visMin; r <= visMax; r++) {
        const py = categoryIndexToPixelY(layout, r);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) continue;
        ctx.moveTo(bandRight, py);
        ctx.lineTo(bandRight - TICK_SIZE, py);
    }
    ctx.stroke();

    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const labelMaxWidth = bandRight - TICK_SIZE - 4 - bandLeft - 4;
    for (let r = visMin; r <= visMax; r++) {
        const py = categoryIndexToPixelY(layout, r);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) continue;
        const text = getLeafText(level, r);
        if (!text) continue;
        const truncated = truncateLabel(ctx, text, labelMaxWidth);
        if (!truncated) continue;
        ctx.fillText(truncated, bandRight - TICK_SIZE - 4, py);
    }
}

function renderOuterLevel(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    bandLeft: number,
    bandRight: number,
    fontFamily: string,
    tickColor: string,
): void {
    const plot = layout.plotRect;
    const runs = buildGroupRuns(level.indices, visMin, visMax + 1);
    if (runs.length === 0) return;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;

    // Bracket line: vertical line near the right edge of the band, with
    // short horizontal ticks at each run boundary.
    const bracketX = bandRight - 3;
    ctx.beginPath();
    for (const run of runs) {
        const yTop = categoryIndexToPixelY(layout, run.endIdx + 0.5);
        const yBot = categoryIndexToPixelY(layout, run.startIdx - 0.5);
        const yHi = Math.min(yTop, yBot);
        const yLo = Math.max(yTop, yBot);
        const clippedHi = Math.max(plot.y, yHi);
        const clippedLo = Math.min(plot.y + plot.height, yLo);
        if (clippedLo <= clippedHi) continue;

        ctx.moveTo(bracketX, clippedHi);
        ctx.lineTo(bracketX, clippedLo);
        // Boundary ticks pointing inward (toward the plot).
        ctx.moveTo(bracketX, clippedHi);
        ctx.lineTo(bracketX + 3, clippedHi);
        ctx.moveTo(bracketX, clippedLo);
        ctx.lineTo(bracketX + 3, clippedLo);
    }
    ctx.stroke();

    // Centered run label, rotated -90° so long labels fit in a narrow band.
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    for (const run of runs) {
        const yTop = categoryIndexToPixelY(layout, run.endIdx + 0.5);
        const yBot = categoryIndexToPixelY(layout, run.startIdx - 0.5);
        const yHi = Math.min(yTop, yBot);
        const yLo = Math.max(yTop, yBot);
        const clippedHi = Math.max(plot.y, yHi);
        const clippedLo = Math.min(plot.y + plot.height, yLo);
        if (clippedLo <= clippedHi) continue;
        const cy = (clippedHi + clippedLo) / 2;
        const cx = bandLeft + (bandRight - bandLeft - 3) / 2;

        const text = level.dictionary[run.dictIdx] ?? "";
        if (!text) continue;
        const span = clippedLo - clippedHi - 4;
        const truncated = truncateLabel(ctx, text, Math.max(0, span));
        if (!truncated) continue;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(truncated, 0, 0);
        ctx.restore();
    }
}
