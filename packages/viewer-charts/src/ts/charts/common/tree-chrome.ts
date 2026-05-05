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

import type { Context2D } from "../canvas-types";
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
