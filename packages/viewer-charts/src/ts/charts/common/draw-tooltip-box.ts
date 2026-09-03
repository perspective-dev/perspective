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
import type { Theme } from "../../theme/theme";
import {
    measureTooltipGrid,
    paintTooltipGrid,
    DEFAULT_TOOLTIP_STYLE,
    type TooltipContent,
    type TooltipStyle,
} from "../../interaction/tooltip-grid";

/**
 * Draw a freestanding tooltip box anchored near (cx, cy), measuring
 * lines, sizing/clamping the box, painting bg/border, and laying out
 * text rows. Shared by sunburst + treemap which need a non-PlotLayout
 * anchor.
 */
export function drawTooltipBox(
    ctx: Context2D,
    theme: Theme,
    grid: TooltipContent,
    cx: number,
    cy: number,
    cssWidth: number,
    cssHeight: number,
    fontFamily: string,
    style: TooltipStyle = DEFAULT_TOOLTIP_STYLE,
): void {
    if (grid.length === 0) {
        return;
    }

    ctx.font = `11px ${fontFamily}`;
    const measured = measureTooltipGrid(ctx, grid, style.maxColumnPx);
    const { boxW, boxH } = measured;

    let tx = cx + 12;
    let ty = cy - boxH - 8;
    if (tx + boxW > cssWidth) {
        tx = cx - boxW - 12;
    }

    if (tx < 0) {
        tx = 4;
    }

    if (ty < 0) {
        ty = cy + 12;
    }

    if (ty + boxH > cssHeight) {
        ty = cssHeight - boxH - 4;
    }

    paintTooltipGrid(ctx, measured, tx, ty, theme, style.opacity);
}
