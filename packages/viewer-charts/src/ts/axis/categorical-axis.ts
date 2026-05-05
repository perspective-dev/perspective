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

import type { Context2D } from "../charts/canvas-types";
import { PlotLayout } from "../layout/plot-layout";
import {
    labelRect,
    rectContained,
    rectsOverlap,
    rotatedLabelsOverlap,
    truncateLabel,
} from "./label-geometry";
import { type GroupRun, runsInRange } from "./categorical-axis-core";
import type { Theme } from "../theme/theme";

export interface CategoricalLevel {
    labels: string[];
    runs: GroupRun[];
    maxLabelChars: number;
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
const LEAF_LEVEL_WIDTH_MIN = 55;
const OUTER_LEVEL_WIDTH = 60;
const LEAF_LABEL_PADDING = 10;

function categoryIndexToPixelX(layout: PlotLayout, index: number): number {
    return layout.dataToPixel(index, 0).px;
}

function categoryIndexToPixelY(layout: PlotLayout, index: number): number {
    return layout.dataToPixel(0, index).py;
}

export const categoryIndexToPixel = categoryIndexToPixelX;

function leafLevelLayout(
    numRows: number,
    longestCharCount: number,
    plotWidth: number,
): LevelTickLayout {
    const budget = Math.max(0, plotWidth - 100);
    if (numRows * 16 > budget) {
        return { size: longestCharCount * 6.62 + 10, rotation: 90 };
    }

    if (numRows * (longestCharCount * 6 + 10) > budget) {
        return { size: longestCharCount * 4 + 20, rotation: 45 };
    }

    return { size: LEAF_LEVEL_HEIGHT, rotation: 0 };
}

export function measureCategoricalLevels(
    domain: CategoricalDomain,
    plotWidth: number,
): LevelTickLayout[] {
    const L = domain.levels.length;
    const result: LevelTickLayout[] = [];
    for (let l = 0; l < L; l++) {
        const lev = domain.levels[l];
        if (l === L - 1) {
            result.push(
                leafLevelLayout(domain.numRows, lev.maxLabelChars, plotWidth),
            );
        } else {
            result.push({ size: OUTER_LEVEL_HEIGHT, rotation: 0 });
        }
    }

    return result;
}

export function measureCategoricalLevelWidths(
    domain: CategoricalDomain,
): number[] {
    const L = domain.levels.length;
    const widths: number[] = [];
    const charPx = 6.2;
    for (let l = 0; l < L; l++) {
        if (l === L - 1) {
            const longest = domain.levels[l].maxLabelChars;
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

function sumNumeric(arr: number[]): number {
    let t = 0;
    for (const v of arr) {
        t += v;
    }

    return t;
}

export function measureCategoricalAxisHeight(
    domain: CategoricalDomain,
    plotWidth: number,
): number {
    if (domain.numRows === 0 || domain.levels.length === 0) {
        return 24;
    }

    return sumNumeric(
        measureCategoricalLevels(domain, plotWidth).map((l) => l.size),
    );
}

export function measureCategoricalAxisWidth(domain: CategoricalDomain): number {
    if (domain.numRows === 0 || domain.levels.length === 0) {
        return 55;
    }

    return sumNumeric(measureCategoricalLevelWidths(domain));
}

function selectLeafTickIndices(
    visMin: number,
    visMax: number,
    plotWidth: number,
    avgLabelPx: number,
): number[] {
    const count = visMax - visMin + 1;
    if (count <= 0) {
        return [];
    }

    const maxLabels = Math.max(1, Math.floor(plotWidth / avgLabelPx));
    if (count <= maxLabels) {
        const out: number[] = [];
        for (let i = visMin; i <= visMax; i++) {
            out.push(i);
        }

        return out;
    }

    const step = Math.ceil(count / maxLabels);
    const out: number[] = [];
    for (let i = visMin; i <= visMax; i += step) {
        out.push(i);
    }

    return out;
}

function getLeafText(level: CategoricalLevel, row: number): string {
    return level.labels[row] ?? "";
}

/**
 * Visible row window from a (possibly zoomed) padded data range. `flip`
 * accounts for the categorical Y-axis storing the domain inverted so
 * that catIdx=0 renders at the top.
 */
function visibleRowWindow(
    numRows: number,
    a: number,
    b: number,
    flip: boolean,
): [number, number] | null {
    const lo = flip ? Math.min(a, b) : a;
    const hi = flip ? Math.max(a, b) : b;
    const visMin = Math.max(0, Math.ceil(lo));
    const visMax = Math.min(numRows - 1, Math.floor(hi));
    return visMax < visMin ? null : [visMin, visMax];
}

/**
 * Compute clipped main-axis spans for each visible run. Used by both
 * outer-level renderers; the caller supplies the projection from
 * row-index to the relevant pixel coordinate (X or Y) and the plot
 * extent along the main axis.
 */
function clippedRuns(
    runs: GroupRun[],
    pixelOf: (idx: number) => number,
    mainStart: number,
    mainEnd: number,
): Array<{
    run: GroupRun;
    nearEdge: number;
    farEdge: number;
    nearClip: number;
    farClip: number;
}> {
    const out = [];
    for (const run of runs) {
        const nearEdge = pixelOf(run.startIdx - 0.5);
        const farEdge = pixelOf(run.endIdx + 0.5);
        const nearClip = Math.max(mainStart, Math.min(nearEdge, farEdge));
        const farClip = Math.min(mainEnd, Math.max(nearEdge, farEdge));
        if (farClip > nearClip) {
            out.push({ run, nearEdge, farEdge, nearClip, farClip });
        }
    }

    return out;
}

export function renderCategoricalXTicks(
    ctx: Context2D,
    layout: PlotLayout,
    domain: CategoricalDomain,
    theme: Theme,
): void {
    if (domain.numRows === 0 || domain.levels.length === 0) {
        return;
    }

    const { tickColor, labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;
    const baselineY = plot.y + plot.height;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.lineWidth = 1;
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;

    const levelLayouts = measureCategoricalLevels(domain, plot.width);
    const win = visibleRowWindow(
        domain.numRows,
        layout.paddedXMin,
        layout.paddedXMax,
        false,
    );
    if (!win) {
        return;
    }

    const [visMin, visMax] = win;

    const L = domain.levels.length;
    let yCursor = baselineY;
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
    ctx: Context2D,
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

    const avgCharWidth = 6.2;
    const avgLabelPx = Math.max(
        40,
        Math.min(level.maxLabelChars * avgCharWidth + 8, plot.width / 2),
    );

    const tickRows =
        lay.rotation === 0
            ? selectLeafTickIndices(visMin, visMax, plot.width, avgLabelPx)
            : leafRowsForRotated(visMin, visMax);

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.beginPath();
    for (const r of tickRows) {
        const px = categoryIndexToPixelX(layout, r);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) {
            continue;
        }

        ctx.moveTo(px, rowTop);
        ctx.lineTo(px, rowTop + TICK_SIZE);
    }

    ctx.stroke();

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
        const px = categoryIndexToPixelX(layout, r);
        if (px < plot.x - 1 || px > plot.x + plot.width + 1) {
            continue;
        }

        const text = getLeafText(level, r);
        if (!text) {
            continue;
        }

        const textWidth = ctx.measureText(text).width;
        const rect = labelRect(
            px,
            labelY,
            textWidth,
            LABEL_LINE_HEIGHT,
            lay.rotation,
        );
        if (!rectContained(rect, boundsRect)) {
            continue;
        }

        if (lay.rotation === 0) {
            if (kept.some((r) => rectsOverlap(r, rect))) {
                continue;
            }
        } else {
            if (kept.some((r) => rotatedLabelsOverlap(r, rect))) {
                continue;
            }
        }

        kept.push(rect);

        drawLabel(ctx, text, px, labelY, lay.rotation, "center");
    }
}

function renderOuterLevel(
    ctx: Context2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    rowTop: number,
    fontFamily: string,
    tickColor: string,
): void {
    const { plotRect: plot } = layout;
    const runs = runsInRange(level.runs, visMin, visMax);
    if (runs.length === 0) {
        return;
    }

    const clipped = clippedRuns(
        runs,
        (idx) => categoryIndexToPixelX(layout, idx),
        plot.x,
        plot.x + plot.width,
    );
    if (clipped.length === 0) {
        return;
    }

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;

    ctx.beginPath();
    for (const c of clipped) {
        ctx.moveTo(c.nearClip, rowTop + 3);
        ctx.lineTo(c.farClip, rowTop + 3);
        ctx.moveTo(c.nearEdge, rowTop);
        ctx.lineTo(c.nearEdge, rowTop + 3);
        ctx.moveTo(c.farEdge, rowTop);
        ctx.lineTo(c.farEdge, rowTop + 3);
    }

    ctx.stroke();

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

    for (const c of clipped) {
        const cx = (c.nearClip + c.farClip) / 2;

        const text = c.run.label;
        if (!text) {
            continue;
        }

        const available = c.farClip - c.nearClip - 4;
        const display = truncateLabel(ctx, text, available);
        if (!display) {
            continue;
        }

        const textWidth = ctx.measureText(display).width;
        const rect = labelRect(cx, labelY, textWidth, LABEL_LINE_HEIGHT, 0);
        if (!rectContained(rect, boundsRect)) {
            continue;
        }

        if (kept.some((r) => rectsOverlap(r, rect))) {
            continue;
        }

        kept.push(rect);

        drawLabel(ctx, display, cx, labelY, 0, "center");
    }
}

function leafRowsForRotated(visMin: number, visMax: number): number[] {
    const out: number[] = [];
    for (let i = visMin; i <= visMax; i++) {
        out.push(i);
    }

    return out;
}

export function renderCategoricalYTicks(
    ctx: Context2D,
    layout: PlotLayout,
    domain: CategoricalDomain,
    theme: Theme,
): void {
    if (domain.numRows === 0 || domain.levels.length === 0) {
        return;
    }

    const { tickColor, labelColor, fontFamily } = theme;
    const { plotRect: plot } = layout;
    const axisX = plot.x;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.lineWidth = 1;
    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;

    const widths = measureCategoricalLevelWidths(domain);
    const win = visibleRowWindow(
        domain.numRows,
        layout.paddedYMin,
        layout.paddedYMax,
        true,
    );
    if (!win) {
        return;
    }

    const [visMin, visMax] = win;

    const L = domain.levels.length;
    let xCursor = axisX;
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
    ctx: Context2D,
    layout: PlotLayout,
    level: CategoricalLevel,
    visMin: number,
    visMax: number,
    colRight: number,
    fontFamily: string,
    tickColor: string,
): void {
    const { plotRect: plot } = layout;

    const avgLabelHeight = LABEL_LINE_HEIGHT + 4;
    const count = visMax - visMin + 1;
    const maxLabels = Math.max(1, Math.floor(plot.height / avgLabelHeight));
    const step = count <= maxLabels ? 1 : Math.ceil(count / maxLabels);

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;
    ctx.beginPath();
    for (let r = visMin; r <= visMax; r += step) {
        const py = categoryIndexToPixelY(layout, r);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) {
            continue;
        }

        ctx.moveTo(colRight - TICK_SIZE, py);
        ctx.lineTo(colRight, py);
    }

    ctx.stroke();

    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let r = visMin; r <= visMax; r += step) {
        const py = categoryIndexToPixelY(layout, r);
        if (py < plot.y - 1 || py > plot.y + plot.height + 1) {
            continue;
        }

        const text = getLeafText(level, r);
        if (!text) {
            continue;
        }

        ctx.fillText(text, colRight - TICK_SIZE - 3, py);
    }
}

function renderOuterLevelY(
    ctx: Context2D,
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
    const runs = runsInRange(level.runs, visMin, visMax);
    if (runs.length === 0) {
        return;
    }

    const clipped = clippedRuns(
        runs,
        (idx) => categoryIndexToPixelY(layout, idx),
        plot.y,
        plot.y + plot.height,
    );
    if (clipped.length === 0) {
        return;
    }

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = tickColor;

    const bracketX = colRight - 3;
    ctx.beginPath();
    for (const c of clipped) {
        ctx.moveTo(bracketX, c.nearClip);
        ctx.lineTo(bracketX, c.farClip);
        ctx.moveTo(bracketX, c.nearEdge);
        ctx.lineTo(colRight, c.nearEdge);
        ctx.moveTo(bracketX, c.farEdge);
        ctx.lineTo(colRight, c.farEdge);
    }

    ctx.stroke();

    ctx.font = `${LABEL_FONT_PX}px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const c of clipped) {
        const cy = (c.nearClip + c.farClip) / 2;

        const text = c.run.label;
        if (!text) {
            continue;
        }

        const available = colWidth - 6;
        const display = truncateLabel(ctx, text, available);
        if (!display) {
            continue;
        }

        ctx.fillText(display, bracketX - 3, cy);
    }
}

function drawLabel(
    ctx: Context2D,
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

    ctx.fillText(text, -2, 0);
    ctx.restore();
}
