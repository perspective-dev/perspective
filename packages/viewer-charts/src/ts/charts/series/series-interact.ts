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

import type { SeriesChart } from "./series";
import {
    BAR_TYPE_BAR,
    BAR_TYPE_AREA,
    readBarRecord,
    type SeriesChartRecord,
} from "./series-build";
import {
    renderBarFrame,
    uploadBarInstances,
    rebuildGlyphBuffers,
    rightAxisDataToPixel,
} from "./series-render";

const POINT_HIT_RADIUS_PX = 10;

/**
 * Unified accessor for the currently hovered glyph. Returns either the
 * real {@link SeriesChartRecord} from `_bars` (bar / stacked-area hits) or the
 * synthetic one stored in `_hoveredSample` (line / scatter / non-stacked
 * area hits), or `null`.
 */
export function getHoveredBar(chart: SeriesChart): SeriesChartRecord | null {
    if (chart._hoveredBarIdx >= 0) {
        return readBarRecord(
            chart._bars,
            chart._hoveredBarIdx,
            chart._splitPrefixes.length,
            chart._samples,
            chart._series.length,
        );
    }

    return chart._hoveredSample;
}

/**
 * Handle mouse-move across all glyph types. Tests (in reverse paint order
 * so top glyphs win): scatter points → line points → bars → areas.
 * Updates `_hoveredBarIdx` or `_hoveredSample` and re-renders on change.
 */
export function handleBarHover(
    chart: SeriesChart,
    mx: number,
    my: number,
): void {
    if (!chart._lastLayout) {
        return;
    }

    const layout = chart._lastLayout;
    const plot = layout.plotRect;

    if (
        mx < plot.x ||
        mx > plot.x + plot.width ||
        my < plot.y ||
        my > plot.y + plot.height
    ) {
        clearHover(chart);
        return;
    }

    // Convert mouse pixels to *logical* (category, value) coordinates.
    // In horizontal mode the plot's X-axis is numeric and Y-axis is the
    // flipped category index, so the raw pixel→data inversion differs.
    const padXMin = layout.paddedXMin;
    const padXMax = layout.paddedXMax;
    const padYMin = layout.paddedYMin;
    const padYMax = layout.paddedYMax;
    let dataX: number;
    let dataYLeft: number;
    let pxPerDataX: number;
    let pxPerDataYLeft: number;
    if (chart._isHorizontal) {
        // paddedY is flipped (catMax, catMin); undo that when inverting so
        // dataYLeft (= logical category axis) grows from top to bottom.
        const valMin = padXMin;
        const valMax = padXMax;
        const catTop = Math.min(padYMin, padYMax);
        const catBot = Math.max(padYMin, padYMax);
        const valAtMouse =
            valMin + ((mx - plot.x) / plot.width) * (valMax - valMin);
        const catAtMouse =
            catTop + ((my - plot.y) / plot.height) * (catBot - catTop);
        dataX = catAtMouse; // logical category → "dataX" in hit-test
        dataYLeft = valAtMouse; // logical value → "dataYLeft" in hit-test
        pxPerDataX = plot.height / (catBot - catTop);
        pxPerDataYLeft = plot.width / (valMax - valMin);
    } else {
        dataX = padXMin + ((mx - plot.x) / plot.width) * (padXMax - padXMin);
        dataYLeft =
            padYMax - ((my - plot.y) / plot.height) * (padYMax - padYMin);
        pxPerDataX = plot.width / (padXMax - padXMin);
        pxPerDataYLeft = plot.height / (padYMax - padYMin);
    }

    const dataYRight =
        chart._hasRightAxis && chart._rightDomain && !chart._isHorizontal
            ? chart._rightDomain.max -
              ((my - plot.y) / plot.height) *
                  (chart._rightDomain.max - chart._rightDomain.min)
            : dataYLeft;
    const pxPerDataYRight =
        chart._hasRightAxis && chart._rightDomain && !chart._isHorizontal
            ? plot.height / (chart._rightDomain.max - chart._rightDomain.min)
            : pxPerDataYLeft;

    let nextBarIdx = -1;
    let nextSample: SeriesChartRecord | null = null;

    // 1. Scatter (top).
    nextSample = hitTestPoints(
        chart,
        "scatter",
        dataX,
        dataYLeft,
        dataYRight,
        pxPerDataX,
        pxPerDataYLeft,
        pxPerDataYRight,
    );

    // 2. Line points (still above bars; treat as point hits).
    if (!nextSample) {
        nextSample = hitTestPoints(
            chart,
            "line",
            dataX,
            dataYLeft,
            dataYRight,
            pxPerDataX,
            pxPerDataYLeft,
            pxPerDataYRight,
        );
    }

    // 3. Bars (rect intersect).
    if (!nextSample) {
        const bars = chart._bars;
        const ct = bars.chartType;
        const sid = bars.seriesId;
        const xC = bars.xCenter;
        const hw = bars.halfWidth;
        const by0 = bars.y0;
        const by1 = bars.y1;
        const ax = bars.axis;
        const hidden = chart._hiddenSeries;
        for (let i = 0; i < bars.count; i++) {
            if (ct[i] !== BAR_TYPE_BAR) {
                continue;
            }

            if (hidden.has(sid[i])) {
                continue;
            }

            const xc = xC[i];
            const halfW = hw[i];
            if (dataX < xc - halfW || dataX > xc + halfW) {
                continue;
            }

            const dy = ax[i] === 0 ? dataYLeft : dataYRight;
            const y0 = by0[i];
            const y1 = by1[i];
            const lo = y0 < y1 ? y0 : y1;
            const hi = y0 < y1 ? y1 : y0;
            if (dy >= lo && dy <= hi) {
                nextBarIdx = i;
                break;
            }
        }
    }

    // 4. Areas (strip hit — stacked records via `_bars`, unstacked via samples).
    if (nextBarIdx < 0 && !nextSample) {
        const areaHit = hitTestAreas(chart, dataX, dataYLeft, dataYRight);
        if (areaHit) {
            if (areaHit.idx >= 0) {
                nextBarIdx = areaHit.idx;
            } else {
                nextSample = areaHit.bar;
            }
        }
    }

    applyHover(chart, nextBarIdx, nextSample);
}

function hitTestPoints(
    chart: SeriesChart,
    chartType: "scatter" | "line",
    dataX: number,
    dataYLeft: number,
    dataYRight: number,
    pxPerDataX: number,
    pxPerDataYLeft: number,
    pxPerDataYRight: number,
): SeriesChartRecord | null {
    const N = chart._numCategories;
    const S = chart._series.length;
    if (N === 0 || S === 0) {
        return null;
    }

    const samples = chart._samples;
    const valid = chart._sampleValid;

    const rSq = POINT_HIT_RADIUS_PX * POINT_HIT_RADIUS_PX;
    let bestDistSq = rSq;
    let best: SeriesChartRecord | null = null;

    const positions = chart._categoryPositions;
    for (const s of chart._series) {
        if (s.chartType !== chartType) {
            continue;
        }

        if (chart._hiddenSeries.has(s.seriesId)) {
            continue;
        }

        const dataY = s.axis === 1 ? dataYRight : dataYLeft;
        const pyPerData = s.axis === 1 ? pxPerDataYRight : pxPerDataYLeft;

        // In numeric mode the per-category X positions aren't dense so
        // the catIdx-based narrowing doesn't apply — fall back to a
        // full sweep. In category mode, narrow to ±radius around dataX.
        const catMin = positions
            ? 0
            : Math.max(0, Math.floor(dataX - POINT_HIT_RADIUS_PX / pxPerDataX));
        const catMax = positions
            ? N - 1
            : Math.min(
                  N - 1,
                  Math.ceil(dataX + POINT_HIT_RADIUS_PX / pxPerDataX),
              );

        for (let c = catMin; c <= catMax; c++) {
            const idx = c * S + s.seriesId;
            if (!((valid[idx >> 3] >> (idx & 7)) & 1)) {
                continue;
            }

            const v = samples[idx];
            const x = positions ? positions[c] : c;
            const dx = (x - dataX) * pxPerDataX;
            const dy = (v - dataY) * pyPerData;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = {
                    catIdx: c,
                    aggIdx: s.aggIdx,
                    splitIdx: s.splitIdx,
                    seriesId: s.seriesId,
                    xCenter: x,
                    halfWidth: 0,
                    y0: 0,
                    y1: v,
                    value: v,
                    axis: s.axis,

                    // Tag as bar so the tooltip renderer treats it like one.
                    chartType: "bar",
                };
            }
        }
    }

    return best;
}

function hitTestAreas(
    chart: SeriesChart,
    dataX: number,
    dataYLeft: number,
    dataYRight: number,
): { idx: number; bar: SeriesChartRecord | null } | null {
    // Closest category to the mouse; an area covers every [cat - 0.5, cat + 0.5]
    // slot, so use `round(dataX)` as the candidate index.
    const cat = Math.round(dataX);
    if (cat < 0 || cat >= chart._numCategories) {
        return null;
    }

    if (Math.abs(dataX - cat) > 0.5) {
        return null;
    }

    const S = chart._series.length;
    const samples = chart._samples;
    const valid = chart._sampleValid;

    // Prefer stacked hits (iterate existing bar records — they carry y0/y1).
    const bars = chart._bars;
    const ct = bars.chartType;
    const ci = bars.catIdx;
    const sid = bars.seriesId;
    const ax = bars.axis;
    const by0 = bars.y0;
    const by1 = bars.y1;
    for (let i = 0; i < bars.count; i++) {
        if (ct[i] !== BAR_TYPE_AREA) {
            continue;
        }

        if (ci[i] !== cat) {
            continue;
        }

        if (chart._hiddenSeries.has(sid[i])) {
            continue;
        }

        const dy = ax[i] === 0 ? dataYLeft : dataYRight;
        const y0 = by0[i];
        const y1 = by1[i];
        const lo = y0 < y1 ? y0 : y1;
        const hi = y0 < y1 ? y1 : y0;
        if (dy >= lo && dy <= hi) {
            return { idx: i, bar: null };
        }
    }

    // Unstacked area series: synthesise from samples.
    for (const s of chart._series) {
        if (s.chartType !== "area" || s.stack) {
            continue;
        }

        if (chart._hiddenSeries.has(s.seriesId)) {
            continue;
        }

        const idx = cat * S + s.seriesId;
        if (!((valid[idx >> 3] >> (idx & 7)) & 1)) {
            continue;
        }

        const v = samples[idx];
        const dy = s.axis === 1 ? dataYRight : dataYLeft;
        const lo = Math.min(0, v);
        const hi = Math.max(0, v);
        if (dy >= lo && dy <= hi) {
            return {
                idx: -1,
                bar: {
                    catIdx: cat,
                    aggIdx: s.aggIdx,
                    splitIdx: s.splitIdx,
                    seriesId: s.seriesId,
                    xCenter: cat,
                    halfWidth: 0.5,
                    y0: 0,
                    y1: v,
                    value: v,
                    axis: s.axis,
                    chartType: "area",
                },
            };
        }
    }

    return null;
}

function clearHover(chart: SeriesChart): void {
    if (chart._hoveredBarIdx !== -1 || chart._hoveredSample !== null) {
        chart._hoveredBarIdx = -1;
        chart._hoveredSample = null;
        if (chart._glManager) {
            renderBarFrame(chart, chart._glManager);
        }
    }
}

function applyHover(
    chart: SeriesChart,
    nextBarIdx: number,
    nextSample: SeriesChartRecord | null,
): void {
    const sameBar = chart._hoveredBarIdx === nextBarIdx;
    const sameSample =
        (chart._hoveredSample?.seriesId ?? -1) ===
            (nextSample?.seriesId ?? -1) &&
        (chart._hoveredSample?.catIdx ?? -1) === (nextSample?.catIdx ?? -1);
    if (sameBar && sameSample) {
        return;
    }

    chart._hoveredBarIdx = nextBarIdx;
    chart._hoveredSample = nextSample;
    if (chart._glManager) {
        renderBarFrame(chart, chart._glManager);
    }
}

/**
 * Handle a click on the legend area. Returns true when the click hit a
 * legend entry (the caller should then treat the event as consumed).
 */
export function handleBarLegendClick(
    chart: SeriesChart,
    mx: number,
    my: number,
): boolean {
    if (chart._legendRects.length === 0) {
        return false;
    }

    for (const entry of chart._legendRects) {
        const r = entry.rect;
        if (
            mx >= r.x &&
            mx <= r.x + r.width &&
            my >= r.y &&
            my <= r.y + r.height
        ) {
            if (chart._hiddenSeries.has(entry.seriesId)) {
                chart._hiddenSeries.delete(entry.seriesId);
            } else {
                chart._hiddenSeries.add(entry.seriesId);
            }

            // Hidden-series change affects which bars contribute to
            // the auto-fit extent and which scatter / line points are
            // uploaded. Bars rebuild via `uploadBarInstances` (it
            // filters hidden). Scatter and line rebuild because their
            // bulk-packed per-axis buffers need to drop hidden points
            // — the line glyph used to skip rebuilds (per-series
            // buffers + draw-path filter), but with the bulk pack the
            // hidden filter must apply at upload time. Area still
            // uses per-series buffers; its draw path skips hidden.
            // The per-category extent buckets (`_catExtents`) are
            // also invalidated — they hold a pointer to the hidden
            // set used at build time and rebuild on next read.
            chart._autoFitCache = null;
            chart._legendCacheValid = false;
            chart._catExtentsHidden = null;
            if (chart._glManager) {
                uploadBarInstances(chart, chart._glManager);
                rebuildGlyphBuffers(chart, chart._glManager);
                renderBarFrame(chart, chart._glManager);
            }

            return true;
        }
    }

    return false;
}

/**
 * Build the per-bar tooltip content lines.
 */
export function buildBarTooltipLines(
    chart: SeriesChart,
    b: SeriesChartRecord,
): string[] {
    const lines: string[] = [];
    const s = chart._series[b.seriesId];
    const categoryPath = formatBarCategoryPath(chart, b.catIdx);
    if (categoryPath) {
        lines.push(categoryPath);
    }

    const yFmt = chart.getColumnFormatter(s.aggName, "value");
    lines.push(`${s.aggName}: ${yFmt(b.value)}`);
    if (s.splitKey) {
        lines.push(`Split: ${s.splitKey}`);
    }

    if (b.y0 !== 0) {
        lines.push(`Base: ${yFmt(b.y0)}`);
        lines.push(`Top: ${yFmt(b.y1)}`);
    }

    return lines;
}

/**
 * Format the hierarchical path label for a given category index. Used by
 * the tooltip — the axis uses per-level text directly instead.
 */
export function formatBarCategoryPath(
    chart: SeriesChart,
    catIdx: number,
): string {
    // Numeric category mode: resolve from the bar's xCenter (real data
    // value) rather than the row-path label array, which is empty when
    // the single group_by level is non-string.
    if (chart._categoryAxisMode === "numeric" && chart._numericCategoryDomain) {
        const bars = chart._bars;
        let v: number | null = null;
        for (let i = 0; i < bars.count; i++) {
            if (bars.catIdx[i] === catIdx) {
                v = bars.xCenter[i];
                break;
            }
        }

        if (v == null) {
            return "";
        }

        const xColumn = chart._groupBy[0];
        return chart.getColumnFormatter(xColumn, "value")(v);
    }

    if (chart._rowPaths.length === 0) {
        return "";
    }

    const parts: string[] = [];
    for (const rp of chart._rowPaths) {
        const s = rp.labels[catIdx];
        if (s != null && s !== "") {
            parts.push(s);
        }
    }

    return parts.join(" / ");
}

export function showBarPinnedTooltip(chart: SeriesChart, barIdx: number): void {
    if (barIdx < 0 || barIdx >= chart._bars.count) {
        return;
    }

    chart._pinnedBarIdx = barIdx;
    pinTooltip(
        chart,
        readBarRecord(
            chart._bars,
            barIdx,
            chart._splitPrefixes.length,
            chart._samples,
            chart._series.length,
        ),
    );
}

/**
 * Pin a tooltip against a synthetic BarRecord (scatter/line/area hit).
 */
export function showBarPinnedTooltipForSample(
    chart: SeriesChart,
    bar: SeriesChartRecord,
): void {
    chart._pinnedBarIdx = -1;
    pinTooltip(chart, bar);
}

function pinTooltip(chart: SeriesChart, b: SeriesChartRecord): void {
    chart._tooltip.dismiss();
    if (!chart._lastLayout) {
        return;
    }

    const layout = chart._lastLayout;

    // Anchor at the bar midpoint for bar glyphs (tooltip reads against
    // the body); at the point itself (`y1`) for line / scatter / area.
    const glyph = chart._series[b.seriesId]?.chartType ?? "bar";
    const anchorV = glyph === "bar" ? (b.y0 + b.y1) / 2 : b.y1;
    const pos =
        b.axis === 0
            ? chart._isHorizontal
                ? layout.dataToPixel(anchorV, b.xCenter)
                : layout.dataToPixel(b.xCenter, anchorV)
            : rightAxisDataToPixel(chart, b.xCenter, anchorV);

    const lines = buildBarTooltipLines(chart, b);
    if (lines.length === 0) {
        return;
    }

    chart._tooltip.pin(lines, pos, layout);

    chart._hoveredBarIdx = -1;
    chart._hoveredSample = null;
    if (chart._glManager) {
        renderBarFrame(chart, chart._glManager);
    }
}

export function dismissBarPinnedTooltip(chart: SeriesChart): void {
    chart._tooltip.dismiss();
    chart._pinnedBarIdx = -1;
}
