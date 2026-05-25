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

import type { Canvas2D, Context2D } from "../canvas-types";
import type { PlotRect } from "../../layout/plot-layout";
import { PlotLayout } from "../../layout/plot-layout";
import type { GradientStop } from "../../theme/gradient";
import type { Vec3 } from "../../theme/palette";
import type { Theme } from "../../theme/theme";
import {
    renderCategoricalLegend,
    renderCategoricalLegendAt,
    renderLegend,
} from "../../axis/legend";
import type { TreeChartBase } from "./tree-chart";
import { drawTooltipBox } from "./draw-tooltip-box";

/**
 * Click target for one breadcrumb segment. Tree-chart hit-testing
 * checks `_breadcrumbRegions` first so a click on the trail re-roots
 * the view to that ancestor.
 */
export interface BreadcrumbRegion {
    nodeId: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

const BREADCRUMB_HEIGHT = 24;
const BREADCRUMB_PAD_X = 8;
const BREADCRUMB_TEXT_Y = 12;
const BREADCRUMB_HIT_PAD = 2;
const BREADCRUMB_SEPARATOR = " › ";

/**
 * Paint the ancestor-path strip across the top of a tree chart and
 * record per-crumb hit regions on `chart._breadcrumbRegions`. Mirrors
 * the structure used by both treemap and sunburst — they only differ
 * in their hover-highlight geometry, so this strip is shared verbatim.
 */
export function renderBreadcrumbs(
    chart: TreeChartBase & { _breadcrumbRegions: BreadcrumbRegion[] },
    ctx: Context2D,
    cssWidth: number,
    fontFamily: string,
    textColor: string,
): void {
    chart._breadcrumbRegions = [];

    const bgColor = chart._resolveTheme().tooltipBg;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cssWidth, BREADCRUMB_HEIGHT);

    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    let x = BREADCRUMB_PAD_X;
    const store = chart._nodeStore;

    for (let i = 0; i < chart._breadcrumbIds.length; i++) {
        const crumbId = chart._breadcrumbIds[i];
        const isLast = i === chart._breadcrumbIds.length - 1;
        const label = store.name[crumbId];

        ctx.fillStyle = textColor;
        const textW = ctx.measureText(label).width;
        ctx.fillText(label, x, BREADCRUMB_TEXT_Y);

        chart._breadcrumbRegions.push({
            nodeId: crumbId,
            x0: x - BREADCRUMB_HIT_PAD,
            y0: 0,
            x1: x + textW + BREADCRUMB_HIT_PAD,
            y1: BREADCRUMB_HEIGHT,
        });

        x += textW;

        if (!isLast) {
            ctx.fillText(BREADCRUMB_SEPARATOR, x, BREADCRUMB_TEXT_Y);
            x += ctx.measureText(BREADCRUMB_SEPARATOR).width;
        }
    }
}

/**
 * Paint the lazy-tooltip box for a tree-chart node, anchored at
 * `(cx, cy)`. Returns early when no lines are cached for `nodeId`
 * (the lazy lookup hasn't resolved yet, or `nodeId` doesn't match the
 * currently-hovered target). Both treemap (rect-center) and sunburst
 * (arc-mid) charts only differ in how they compute the anchor.
 */
export function renderTreeTooltip(
    chart: TreeChartBase,
    ctx: Context2D,
    nodeId: number,
    cx: number,
    cy: number,
    cssWidth: number,
    cssHeight: number,
    fontFamily: string,
): void {
    const lines =
        chart._lazyTooltip.hoveredTarget === nodeId
            ? (chart._lazyTooltip.lines ?? [])
            : [];
    if (lines.length === 0) {
        return;
    }

    drawTooltipBox(
        ctx,
        chart._resolveTheme(),
        lines,
        cx,
        cy,
        cssWidth,
        cssHeight,
        fontFamily,
    );
}

/**
 * Paint a color legend (categorical swatches or numeric gradient bar)
 * for a tree chart. Shared by sunburst + treemap; both consult
 * `_colorMode` / `_uniqueColorLabels.size` / `_colorMin..max` the same
 * way.
 *
 * `categoricalRect`, when non-null, is used as the explicit rect for
 * the categorical-swatch variant (sunburst's faceted mode passes
 * `FacetGrid.legendRect` here). Numeric mode always derives from a
 * synthetic single-plot `PlotLayout` to match the legacy per-chart
 * branch — its gradient bar's vertical span doesn't fit the
 * categorical legend's compact rect.
 *
 * Returns silently when the color slot is empty, when categorical mode
 * has only one label, or when numeric mode has a degenerate
 * (`min >= max`) extent.
 */
export function renderTreeColorLegend(
    chart: TreeChartBase,
    canvas: Canvas2D,
    palette: Vec3[],
    stops: GradientStop[],
    theme: Theme,
    cssWidth: number,
    cssHeight: number,
    categoricalRect: PlotRect | null = null,
): void {
    if (chart._colorMode === "series" && chart._uniqueColorLabels.size > 1) {
        if (categoricalRect) {
            renderCategoricalLegendAt(
                canvas,
                categoricalRect,
                chart._uniqueColorLabels,
                palette,
                theme,
            );
        } else {
            renderCategoricalLegend(
                canvas,
                syntheticLegendLayout(cssWidth, cssHeight),
                chart._uniqueColorLabels,
                palette,
                theme,
            );
        }
    } else if (
        chart._colorMode === "numeric" &&
        chart._colorMin < chart._colorMax
    ) {
        renderLegend(
            canvas,
            syntheticLegendLayout(cssWidth, cssHeight),
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

function syntheticLegendLayout(
    cssWidth: number,
    cssHeight: number,
): PlotLayout {
    return new PlotLayout(cssWidth, cssHeight, {
        hasXLabel: false,
        hasYLabel: false,
        hasLegend: true,
    });
}
