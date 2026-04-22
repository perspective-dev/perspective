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

import { PlotLayout } from "../layout/plot-layout";
import {
    labelRect,
    rectContained,
    rectsOverlap,
    rotatedLabelsOverlap,
    truncateLabel,
} from "./label-geometry";
import { buildGroupRuns, maxDictLength } from "./categorical-axis-core";
import type { Theme } from "../theme/theme";

/**
 * A level of the group_by hierarchy. The same shape as the string columns
 * in `ColumnDataMap`: `indices[r]` is the dictionary key for row `r`.
 * Levels are ordered outermost-first (level 0 = outermost, level N-1 = leaf).
 */
export interface CategoricalLevel {
    indices: Int32Array;
    dictionary: string[];
}

export interface CategoricalDomain {
    levels: CategoricalLevel[];
    numRows: number;
    levelLabels: string[];
}

interface LevelTickLayout {
    size: number;
    rotation: 0 | 45 | 90;
}

const LEAF_LEVEL_HEIGHT = 25;
const OUTER_LEVEL_HEIGHT = 22;
const TICK_SIZE = 5;
const LABEL_FONT_PX = 11;
const LABEL_LINE_HEIGHT = 14;

export function categoryIndexToPixel(
    layout: PlotLayout,
    index: number,
): number {
    return layout.dataToPixel(index, 0).px;
}

/**
 * Choose label rotation + row height for the leaf level based on how many
 * ticks would need to fit horizontally and how wide the longest one is.
 * Mirrors d3fc's `getGroupTickLayout` but uses dictionary stats instead of
 * iterating all rows.
 */
function leafLevelLayout(
    numRows: number,
    longestCharCount: number,
    plotWidth: number,
): LevelTickLayout {
    // The budget for label placement — d3fc subtracts 100 from width.
    const budget = Math.max(0, plotWidth - 100);
    if (numRows * 16 > budget) {
        return { size: longestCharCount * 6.62 + 10, rotation: 90 };
    }
    if (numRows * (longestCharCount * 6 + 10) > budget) {
        return { size: longestCharCount * 4 + 20, rotation: 45 };
    }
    return { size: LEAF_LEVEL_HEIGHT, rotation: 0 };
}

/**
 * Returns per-level heights (outermost-first) so the caller can size the
 * bottom margin before building `PlotLayout`. Uses dictionary statistics;
 * does NOT iterate row indices.
 */
export function measureCategoricalLevels(
    domain: CategoricalDomain,
    plotWidth: number,
): LevelTickLayout[] {
    const L = domain.levels.length;
    const result: LevelTickLayout[] = [];
    for (let l = 0; l < L; l++) {
        const lev = domain.levels[l];
        const longest = maxDictLength(lev.dictionary);
        if (l === L - 1) {
            result.push(leafLevelLayout(domain.numRows, longest, plotWidth));
        } else {
            result.push({ size: OUTER_LEVEL_HEIGHT, rotation: 0 });
        }
    }
    return result;
}

/**
 * Total CSS-pixel height required for the categorical tick band (levels),
 * NOT including the bottom axis-label line. The caller feeds the result to
 * `PlotLayout` as `bottomExtra`; the axis label is added separately by
 * `PlotLayout` via `hasXLabel`.
 */
export function measureCategoricalAxisHeight(
    domain: CategoricalDomain,
    plotWidth: number,
): number {
    if (domain.numRows === 0 || domain.levels.length === 0) return 24;
    const levels = measureCategoricalLevels(domain, plotWidth);
    let total = 0;
    for (const l of levels) total += l.size;
    return total;
}

/**
 * Pick a subset of leaf indices to label inside `[visMin, visMax]`.
 * Always includes the endpoints when density permits.
 */
function selectLeafTickIndices(
    visMin: number,
    visMax: number,
    plotWidth: number,
    avgLabelPx: number,
): number[] {
    const count = visMax - visMin + 1;
    if (count <= 0) return [];
    const maxLabels = Math.max(1, Math.floor(plotWidth / avgLabelPx));
    if (count <= maxLabels) {
        const out: number[] = [];
        for (let i = visMin; i <= visMax; i++) out.push(i);
        return out;
    }
    const step = Math.ceil(count / maxLabels);
    const out: number[] = [];
    for (let i = visMin; i <= visMax; i += step) out.push(i);
    return out;
}

function getLeafText(level: CategoricalLevel, row: number): string {
    return level.dictionary[level.indices[row]] ?? "";
}

/**
 * Render the hierarchical X axis for a categorical domain. The axis line
 * is drawn by `renderBarAxesChrome`. This function owns tick marks, tick
 * labels, outer-level group brackets, and the axis label.
 */
export function renderCategoricalXTicks(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    domain: CategoricalDomain,
    theme: Theme,
): void {
    if (domain.numRows === 0 || domain.levels.length === 0) return;

    const { tickColor, labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;
    const baselineY = plot.y + plot.height;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.lineWidth = 1;
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;

    const levelLayouts = measureCategoricalLevels(domain, plot.width);

    // Visible row window from the (possibly zoomed) padded X domain.
    const visMin = Math.max(0, Math.ceil(layout.paddedXMin));
    const visMax = Math.min(domain.numRows - 1, Math.floor(layout.paddedXMax));
    if (visMax < visMin) return;

    const L = domain.levels.length;
    let yCursor = baselineY;

    // Inner → outer. Leaf is the last level (innermost).
    for (let l = L - 1; l >= 0; l--) {
        const level = domain.levels[l];
        const lay = levelLayouts[l];
        const rowTop = yCursor;
        yCursor += lay.size;

        if (l === L - 1) {
            renderLeafLevel(
                ctx,
                layout,
                level,
                visMin,
                visMax,
                rowTop,
                lay,
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
                rowTop,
                fontFamily,
                tickColor,
            );
        }
    }

    // Axis label — single line that names all group_by fields joined by " / "
    const axisLabel = domain.levelLabels.filter((s) => !!s).join(" / ");
    if (axisLabel) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(axisLabel, plot.x + plot.width / 2, layout.cssHeight - 2);
    }
}

function renderLeafLevel(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    rowTop: number,
    lay: LevelTickLayout,
    fontFamily: string,
    tickColor: string,
): void {
    const { plotRect: plot } = layout;

    // Estimate avg label width from the dictionary (cheap, one pass).
    const avgCharWidth = 6.2; // 11px monospace-ish heuristic
    const longest = maxDictLength(level.dictionary);
    const avgLabelPx = Math.max(
        40,
        Math.min(longest * avgCharWidth + 8, plot.width / 2),
    );

    const tickRows =
        lay.rotation === 0
            ? selectLeafTickIndices(visMin, visMax, plot.width, avgLabelPx)
            : leafRowsForRotated(visMin, visMax);

    // Per-row tick marks.
    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.beginPath();
    for (const r of tickRows) {
        const px = categoryIndexToPixel(layout, r);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) continue;
        ctx.moveTo(px, rowTop);
        ctx.lineTo(px, rowTop + TICK_SIZE);
    }
    ctx.stroke();

    // Labels with overlap hiding.
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    const labelY = rowTop + TICK_SIZE + 3;
    const boundsRect = {
        x: plot.x,
        width: plot.width,
        y: rowTop,
        height: 9999,
    };
    const kept: {
        x: number;
        y: number;
        width: number;
        height: number;
    }[] = [];
    for (const r of tickRows) {
        const px = categoryIndexToPixel(layout, r);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) continue;
        const text = getLeafText(level, r);
        if (!text) continue;

        const textWidth = ctx.measureText(text).width;
        const rect = labelRect(
            px,
            labelY,
            textWidth,
            LABEL_LINE_HEIGHT,
            lay.rotation,
        );
        if (!rectContained(rect, boundsRect)) continue;
        if (lay.rotation === 0) {
            if (kept.some((r) => rectsOverlap(r, rect))) continue;
        } else {
            if (kept.some((r) => rotatedLabelsOverlap(r, rect))) continue;
        }
        kept.push(rect);

        drawLabel(ctx, text, px, labelY, lay.rotation, "center");
    }
}

function renderOuterLevel(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    rowTop: number,
    fontFamily: string,
    tickColor: string,
): void {
    const { plotRect: plot } = layout;
    const runs = buildGroupRuns(level.indices, visMin, visMax + 1);
    if (runs.length === 0) return;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;

    // Boundary ticks at each run edge + bracket baseline across the group.
    ctx.beginPath();
    for (const run of runs) {
        const xStart = categoryIndexToPixel(layout, run.startIdx - 0.5);
        const xEnd = categoryIndexToPixel(layout, run.endIdx + 0.5);
        const xLeft = Math.max(plot.x, xStart);
        const xRight = Math.min(plot.x + plot.width, xEnd);
        if (xRight <= xLeft) continue;

        // Bracket line
        ctx.moveTo(xLeft, rowTop + 3);
        ctx.lineTo(xRight, rowTop + 3);
        // Boundary ticks
        ctx.moveTo(xStart, rowTop);
        ctx.lineTo(xStart, rowTop + 3);
        ctx.moveTo(xEnd, rowTop);
        ctx.lineTo(xEnd, rowTop + 3);
    }
    ctx.stroke();

    // Labels centered within each span.
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    const labelY = rowTop + 3 + 4;
    const kept: {
        x: number;
        y: number;
        width: number;
        height: number;
    }[] = [];
    const boundsRect = {
        x: plot.x,
        width: plot.width,
        y: rowTop,
        height: 9999,
    };

    for (const run of runs) {
        const xStart = categoryIndexToPixel(layout, run.startIdx - 0.5);
        const xEnd = categoryIndexToPixel(layout, run.endIdx + 0.5);
        const xLeft = Math.max(plot.x, xStart);
        const xRight = Math.min(plot.x + plot.width, xEnd);
        if (xRight <= xLeft) continue;
        const cx = (xLeft + xRight) / 2;

        const text = level.dictionary[run.dictIdx] ?? "";
        if (!text) continue;

        const available = xRight - xLeft - 4;
        const display = truncateLabel(ctx, text, available);
        if (!display) continue;

        const textWidth = ctx.measureText(display).width;
        const rect = labelRect(cx, labelY, textWidth, LABEL_LINE_HEIGHT, 0);
        if (!rectContained(rect, boundsRect)) continue;
        if (kept.some((r) => rectsOverlap(r, rect))) continue;
        kept.push(rect);

        drawLabel(ctx, display, cx, labelY, 0, "center");
    }
}

function leafRowsForRotated(visMin: number, visMax: number): number[] {
    const out: number[] = [];
    for (let i = visMin; i <= visMax; i++) out.push(i);
    return out;
}

// ── Horizontal (Y-axis) categorical variant ────────────────────────────
// Used by X Bar charts: categories stack top-to-bottom on the left side
// of the plot, leaf level closest to the plot, outer levels further
// left. Labels are always horizontal; rotation is unnecessary because
// category count is bounded by plot height and overlap-hiding handles
// density.

const LEAF_LEVEL_WIDTH_MIN = 55;
const OUTER_LEVEL_WIDTH = 60;
const LEAF_LABEL_PADDING = 10;

/** Pixel Y for a row index on the categorical Y axis. */
function categoryIndexToPixelY(layout: PlotLayout, index: number): number {
    return layout.dataToPixel(0, index).py;
}

/**
 * Per-CSS-pixel widths (outermost-first) required to fit the hierarchical
 * categorical Y axis. The leaf level auto-sizes to the longest label; outer
 * levels use a fixed width per level.
 */
export function measureCategoricalLevelWidths(
    domain: CategoricalDomain,
): number[] {
    const L = domain.levels.length;
    const widths: number[] = [];
    const charPx = 6.2;
    for (let l = 0; l < L; l++) {
        if (l === L - 1) {
            const longest = maxDictLength(domain.levels[l].dictionary);
            widths.push(
                Math.max(
                    LEAF_LEVEL_WIDTH_MIN,
                    longest * charPx + LEAF_LABEL_PADDING,
                ),
            );
        } else {
            widths.push(OUTER_LEVEL_WIDTH);
        }
    }
    return widths;
}

/**
 * Total CSS-pixel width required for the left-gutter categorical axis,
 * excluding the axis-label column (added separately by `PlotLayout` via
 * `hasYLabel`). Caller feeds this to `PlotLayout` as `leftExtra`.
 */
export function measureCategoricalAxisWidth(domain: CategoricalDomain): number {
    if (domain.numRows === 0 || domain.levels.length === 0) return 55;
    const widths = measureCategoricalLevelWidths(domain);
    let total = 0;
    for (const w of widths) total += w;
    return total;
}

/**
 * Render the hierarchical Y axis for a categorical domain along the left
 * side of the plot. Mirror of `renderCategoricalXTicks` for X Bar.
 */
export function renderCategoricalYTicks(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    domain: CategoricalDomain,
    theme: Theme,
): void {
    if (domain.numRows === 0 || domain.levels.length === 0) return;

    const { tickColor, labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;
    const axisX = plot.x;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.lineWidth = 1;
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;

    const widths = measureCategoricalLevelWidths(domain);

    // Visible row window from the (possibly zoomed) padded Y domain. The
    // categorical Y domain is stored flipped (higher paddedYMin than
    // paddedYMax) so that catIdx=0 renders at the top — see
    // `buildProjectionMatrix` call in `bar-render.ts` for the swap.
    const lo = Math.min(layout.paddedYMin, layout.paddedYMax);
    const hi = Math.max(layout.paddedYMin, layout.paddedYMax);
    const visMin = Math.max(0, Math.ceil(lo));
    const visMax = Math.min(domain.numRows - 1, Math.floor(hi));
    if (visMax < visMin) return;

    const L = domain.levels.length;
    let xCursor = axisX;

    // Inner → outer. Leaf is the last level (innermost = nearest plot).
    for (let l = L - 1; l >= 0; l--) {
        const level = domain.levels[l];
        const w = widths[l];
        const colRight = xCursor;
        xCursor -= w;

        if (l === L - 1) {
            renderLeafLevelY(
                ctx,
                layout,
                level,
                visMin,
                visMax,
                colRight,
                fontFamily,
                tickColor,
            );
        } else {
            renderOuterLevelY(
                ctx,
                layout,
                level,
                visMin,
                visMax,
                colRight,
                w,
                fontFamily,
                tickColor,
            );
        }
    }

    // Axis label — single line running vertically along the far-left gutter.
    const axisLabel = domain.levelLabels.filter((s) => !!s).join(" / ");
    if (axisLabel) {
        ctx.fillStyle = labelColor;
        ctx.font = `13px ${fontFamily}`;
        ctx.save();
        ctx.translate(14, plot.y + plot.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(axisLabel, 0, 0);
        ctx.restore();
    }
}

function renderLeafLevelY(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    colRight: number,
    fontFamily: string,
    tickColor: string,
): void {
    const { plotRect: plot } = layout;

    // Overlap-based tick thinning: estimate min vertical spacing from
    // the label line height.
    const avgLabelHeight = LABEL_LINE_HEIGHT + 4;
    const count = visMax - visMin + 1;
    const maxLabels = Math.max(1, Math.floor(plot.height / avgLabelHeight));
    const step = count <= maxLabels ? 1 : Math.ceil(count / maxLabels);

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.beginPath();
    for (let r = visMin; r <= visMax; r += step) {
        const py = categoryIndexToPixelY(layout, r);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) continue;
        ctx.moveTo(colRight - TICK_SIZE, py);
        ctx.lineTo(colRight, py);
    }
    ctx.stroke();

    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let r = visMin; r <= visMax; r += step) {
        const py = categoryIndexToPixelY(layout, r);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) continue;
        const text = getLeafText(level, r);
        if (!text) continue;
        ctx.fillText(text, colRight - TICK_SIZE - 3, py);
    }
}

function renderOuterLevelY(
    ctx: CanvasRenderingContext2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    colRight: number,
    colWidth: number,
    fontFamily: string,
    tickColor: string,
): void {
    const { plotRect: plot } = layout;
    const runs = buildGroupRuns(level.indices, visMin, visMax + 1);
    if (runs.length === 0) return;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;

    const bracketX = colRight - 3;
    ctx.beginPath();
    for (const run of runs) {
        const yStart = categoryIndexToPixelY(layout, run.startIdx - 0.5);
        const yEnd = categoryIndexToPixelY(layout, run.endIdx + 0.5);
        const yTop = Math.max(plot.y, Math.min(yStart, yEnd));
        const yBot = Math.min(plot.y + plot.height, Math.max(yStart, yEnd));
        if (yBot <= yTop) continue;

        ctx.moveTo(bracketX, yTop);
        ctx.lineTo(bracketX, yBot);
        ctx.moveTo(bracketX, yStart);
        ctx.lineTo(colRight, yStart);
        ctx.moveTo(bracketX, yEnd);
        ctx.lineTo(colRight, yEnd);
    }
    ctx.stroke();

    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const run of runs) {
        const yStart = categoryIndexToPixelY(layout, run.startIdx - 0.5);
        const yEnd = categoryIndexToPixelY(layout, run.endIdx + 0.5);
        const yTop = Math.max(plot.y, Math.min(yStart, yEnd));
        const yBot = Math.min(plot.y + plot.height, Math.max(yStart, yEnd));
        if (yBot <= yTop) continue;
        const cy = (yTop + yBot) / 2;

        const text = level.dictionary[run.dictIdx] ?? "";
        if (!text) continue;

        const available = colWidth - 6;
        const display = truncateLabel(ctx, text, available);
        if (!display) continue;

        ctx.fillText(display, bracketX - 3, cy);
    }
}

function drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    px: number,
    py: number,
    rotation: 0 | 45 | 90,
    anchor: "center" | "end",
): void {
    if (rotation === 0) {
        ctx.textAlign = anchor === "end" ? "right" : "center";
        ctx.textBaseline = "top";
        ctx.fillText(text, px, py);
        return;
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((-rotation * Math.PI) / 180);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    // Small offset so the right end of the rotated text sits near the tick.
    ctx.fillText(text, -2, 0);
    ctx.restore();
}
