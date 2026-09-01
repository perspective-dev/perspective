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

import type { Canvas2D, Context2D } from "../charts/canvas-types";
import type { PlotLayout, PlotRect } from "../layout/plot-layout";
import { formatTickValue } from "../layout/ticks";
import {
    LEGEND_ENTRY_LEADING,
    LEGEND_FRAME_H,
    LEGEND_FRAME_PAD_L,
    LEGEND_FRAME_W,
    LEGEND_HEADER_H,
    LEGEND_LINE_HEIGHT,
    LEGEND_TITLE_PAD,
    type LegendAutoFit,
    type LegendController,
} from "../interaction/legend-controller";
import {
    colorValueToT,
    sampleGradient,
    type GradientStop,
} from "../theme/gradient";
import type { Theme } from "../theme/theme";

export { LEGEND_LINE_HEIGHT };

/** Painted scrollbar thumb width (the hit zone is wider). */
const SCROLLBAR_W = 4;

const LEGEND_BAR_W = 16;
const LEGEND_BAR_GAP = 5;

function rgbCss(c: [number, number, number, number]): string {
    return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

/**
 * Presentation context threaded into every legend painter. Carries the
 * resolved `legend_mode` branch and the chart's {@link LegendController}
 * — the painter reads its scroll offset and reports the painted
 * geometry back so hit-testing always resolves against what is on
 * screen. `"none"` mode never reaches a painter (call sites skip and
 * `clearPainted()` instead).
 */
export interface LegendPaintView {
    mode: "sidebar" | "floating";
    legend: LegendController;
    title?: string;
    sidebarGutter?: number;

    /**
     * Floating background-fill opacity (`plugin_config.legend_opacity`,
     * default 1). Border, header text, and entries stay opaque.
     */
    opacity?: number;
}

const AUTO_WIDTH_MAX_SAMPLES = 64;

export function legendAutoFit(
    canvas: Canvas2D | null | undefined,
    theme: Theme,
    entryCount: number,
    labels: () => Iterable<string>,
    opts: { title?: string; leading?: number; fontPx?: number } = {},
): LegendAutoFit {
    return {
        entryCount,
        boxWidth: () => {
            const ctx = canvas?.getContext("2d") as Context2D | null;
            if (!ctx) {
                return 0;
            }

            ctx.save();
            let text = 0;
            let n = 0;
            ctx.font = `${opts.fontPx ?? 11}px ${theme.fontFamily}`;
            for (const label of labels()) {
                text = Math.max(text, ctx.measureText(label).width);
                if (++n >= AUTO_WIDTH_MAX_SAMPLES) {
                    break;
                }
            }

            let title = 0;
            if (opts.title) {
                ctx.font = `bold 10px ${theme.fontFamily}`;
                title = ctx.measureText(opts.title).width + LEGEND_TITLE_PAD;
            }

            ctx.restore();
            const leading = opts.leading ?? LEGEND_ENTRY_LEADING;
            return Math.ceil(Math.max(title, leading + text + LEGEND_FRAME_W));
        },
    };
}

export function gradientLegendAutoFit(
    canvas: Canvas2D | null | undefined,
    theme: Theme,
    colorDomain: { min: number; max: number },
    formatter: (v: number) => string = formatTickValue,
    title?: string,
): LegendAutoFit {
    return legendAutoFit(
        canvas,
        theme,
        0,
        () => [
            formatter(colorDomain.max),
            formatter((colorDomain.min + colorDomain.max) / 2),
            formatter(colorDomain.min),
        ],
        {
            title,
            leading: LEGEND_BAR_W + LEGEND_BAR_GAP,
            fontPx: 10,
        },
    );
}

/**
 * Paint the floating panel's chrome — themed background, border, and
 * header strip — and return the content rect inside it. The header
 * carries `title` and doubles as the move grip. `opacity` applies to
 * the background fill only.
 */
export function paintFloatingLegendFrame(
    ctx: Context2D,
    box: PlotRect,
    theme: Theme,
    title: string | undefined,
    opacity: number = 1,
): PlotRect {
    ctx.save();
    ctx.fillStyle = theme.backgroundColor;
    ctx.strokeStyle = theme.legendBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
    ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();

    // Header separator line under the grip strip.
    ctx.beginPath();
    ctx.moveTo(box.x + 0.5, box.y + LEGEND_HEADER_H + 0.5);
    ctx.lineTo(box.x + box.width - 0.5, box.y + LEGEND_HEADER_H + 0.5);
    ctx.stroke();

    if (title) {
        ctx.fillStyle = theme.legendText;
        ctx.font = `bold 10px ${theme.fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
            truncateText(ctx, title, Math.max(0, box.width - LEGEND_TITLE_PAD)),
            box.x + 8,
            box.y + LEGEND_HEADER_H / 2 + 0.5,
        );
    }

    ctx.restore();
    return {
        x: box.x + LEGEND_FRAME_PAD_L,
        y: box.y + LEGEND_HEADER_H + LEGEND_FRAME_H / 2,
        width: Math.max(0, box.width - LEGEND_FRAME_W),
        height: Math.max(0, box.height - LEGEND_HEADER_H - LEGEND_FRAME_H),
    };
}

/**
 * Paint the scroll thumb on the content rect's right edge. No-op when
 * the content fits.
 */
export function paintLegendScrollbar(
    ctx: Context2D,
    content: PlotRect,
    scroll: number,
    contentHeight: number,
    theme: Theme,
): void {
    if (contentHeight <= content.height) {
        return;
    }

    const trackX = content.x + content.width - SCROLLBAR_W;
    const thumbH = Math.max(
        20,
        (content.height / contentHeight) * content.height,
    );
    const travel = content.height - thumbH;
    const maxScroll = contentHeight - content.height;
    const thumbY =
        content.y + (maxScroll > 0 ? (scroll / maxScroll) * travel : 0);
    ctx.save();
    ctx.fillStyle = theme.legendBorder;
    ctx.fillRect(trackX, content.y, SCROLLBAR_W, content.height);
    ctx.fillStyle = theme.legendText;
    ctx.fillRect(trackX, thumbY, SCROLLBAR_W, thumbH);
    ctx.restore();
}

/**
 * Clip `text` to `maxWidth` with a trailing ellipsis. Only called for
 * entries inside the visible window, so the `measureText` cost is
 * bounded by the box height, not the entry count.
 */
export function truncateText(
    ctx: Context2D,
    text: string,
    maxWidth: number,
): string {
    if (maxWidth <= 0) {
        return "";
    }

    if (ctx.measureText(text).width <= maxWidth) {
        return text;
    }

    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }

    return lo > 0 ? text.slice(0, lo) + "…" : "…";
}

/**
 * Render a vertical color gradient legend on the Canvas2D overlay.
 * Only call when a color column is active. When `colorDomain` crosses
 * zero the 50% stop (sign pivot) is annotated with a tick + `0` label.
 *
 * Per-facet wrapper; computes the anchor from `layout` and delegates
 * to {@link renderLegendAt}. Facet grids render one shared gradient
 * legend and pass an explicit rect to `renderLegendAt` directly.
 */
export function renderLegend(
    canvas: Canvas2D,
    layout: PlotLayout,
    colorDomain: { min: number; max: number; label: string },
    stops: GradientStop[],
    theme: Theme,
    formatter?: (v: number) => string,
    view?: LegendPaintView,
): void {
    const rect: PlotRect = {
        x: layout.plotRect.x + layout.plotRect.width + 12,
        y: layout.margins.top + 20,
        width: Math.max(
            1,
            layout.cssWidth - layout.plotRect.x - layout.plotRect.width - 12,
        ),
        height: Math.max(1, layout.plotRect.height),
    };
    renderLegendAt(
        canvas,
        rect,
        colorDomain,
        stops,
        theme,
        formatter,
        view && { ...view, sidebarGutter: layout.margins.right },
    );
}

/**
 * Render a gradient legend at an explicit canvas-absolute rect.
 * Used by facet grids that paint one legend for the whole grid and
 * by single-plot charts through {@link renderLegend}.
 */
export function renderLegendAt(
    canvas: Canvas2D,
    rect: PlotRect,
    colorDomain: { min: number; max: number; label: string },
    stops: GradientStop[],
    theme: Theme,
    formatter: (v: number) => string = formatTickValue,
    view?: LegendPaintView,
): void {
    const ctx = canvas.getContext("2d") as Context2D | null;
    if (!ctx) {
        return;
    }

    const textColor = theme.legendText;
    const borderColor = theme.legendBorder;
    const fontFamily = theme.fontFamily;
    const floating = view?.mode === "floating";

    let x: number;
    let y: number;
    let barHeight: number;
    let content: PlotRect = rect;
    const barWidth = LEGEND_BAR_W;
    if (floating) {
        content = paintFloatingLegendFrame(
            ctx,
            rect,
            theme,
            colorDomain.label,
            view?.opacity,
        );
        x = content.x;
        y = content.y + 4;
        barHeight = Math.max(8, content.height - 12);
    } else {
        x = rect.x;
        y = rect.y;
        barHeight = Math.min(120, rect.height * 0.4);
        ctx.fillStyle = textColor;
        ctx.font = `9px ${fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(colorDomain.label, x, y - 4);
    }

    // Paint the gradient by walking `colorDomain.min..max` top→bottom and
    // feeding each value through `colorValueToT` so the legend matches the
    // sign-aware mapping used by the GPU / treemap paths.
    const topVal = colorDomain.max;
    const bottomVal = colorDomain.min;
    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    const SAMPLES = 16;
    for (let i = 0; i <= SAMPLES; i++) {
        const offset = i / SAMPLES;
        const v = topVal + offset * (bottomVal - topVal);
        const t = colorValueToT(v, colorDomain.min, colorDomain.max);
        const rgba = sampleGradient(stops, t);
        gradient.addColorStop(offset, rgbCss(rgba));
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barWidth, barHeight);

    ctx.fillStyle = textColor;
    ctx.font = `10px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const labelX = x + barWidth + LEGEND_BAR_GAP;
    const labelW = Math.max(0, content.x + content.width - labelX);
    ctx.fillText(
        truncateText(ctx, formatter(colorDomain.max), labelW),
        labelX,
        y + 2,
    );
    ctx.fillText(
        truncateText(
            ctx,
            formatter((colorDomain.min + colorDomain.max) / 2),
            labelW,
        ),
        labelX,
        y + barHeight / 2,
    );
    ctx.fillText(
        truncateText(ctx, formatter(colorDomain.min), labelW),
        labelX,
        y + barHeight - 2,
    );

    // Sign-pivot marker when the data crosses zero: a small tick on the
    // right edge of the bar + a "0" label.
    if (colorDomain.min < 0 && colorDomain.max > 0) {
        const zeroOffset =
            (colorDomain.max - 0) / (colorDomain.max - colorDomain.min);
        const zeroY = y + zeroOffset * barHeight;
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + barWidth, zeroY);
        ctx.lineTo(x + barWidth + 4, zeroY);
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.fillText("0", labelX, zeroY);
    }

    if (view) {
        view.legend.setPainted({
            mode: view.mode,
            box: rect,
            content,
            contentHeight: Math.min(content.height, barHeight + 8),
            sidebarGutter: view.sidebarGutter,
        });
    }
}

/**
 * Render a categorical legend with discrete colored swatches.
 * Used when split_by or string color columns produce distinct categories.
 *
 * The per-facet wrapper; computes the anchor from `layout` and delegates
 * to {@link renderCategoricalLegendAt}. Facet grids that render one
 * shared legend pass an explicit rect to `renderCategoricalLegendAt`
 * directly.
 */
export function renderCategoricalLegend(
    canvas: Canvas2D,
    layout: PlotLayout,
    labels: Map<string, number>,
    palette: [number, number, number][],
    theme: Theme,
    view?: LegendPaintView,
): void {
    const rect: PlotRect = {
        x: layout.plotRect.x + layout.plotRect.width + 12,
        y: layout.margins.top + 10,
        width: Math.max(
            1,
            layout.cssWidth - layout.plotRect.x - layout.plotRect.width - 12,
        ),
        height: Math.max(1, layout.plotRect.height),
    };
    renderCategoricalLegendAt(
        canvas,
        rect,
        labels,
        palette,
        theme,
        view && { ...view, sidebarGutter: layout.margins.right },
    );
}

/**
 * Render a categorical legend at an explicit canvas-absolute rect.
 * Used by facet grids that paint one legend for the whole grid and by
 * single-plot charts through {@link renderCategoricalLegend}.
 */
export function renderCategoricalLegendAt(
    canvas: Canvas2D,
    rect: PlotRect,
    labels: Map<string, number>,
    palette: [number, number, number][],
    theme: Theme,
    view?: LegendPaintView,
): void {
    const ctx = canvas.getContext("2d") as Context2D | null;
    if (!ctx) {
        return;
    }

    if (labels.size === 0) {
        view?.legend.clearPainted();
        return;
    }

    const textColor = theme.legendText;
    const fontFamily = theme.fontFamily;
    const floating = view?.mode === "floating";

    let content: PlotRect = rect;
    if (floating) {
        content = paintFloatingLegendFrame(
            ctx,
            rect,
            theme,
            view?.title ?? "Legend",
            view?.opacity,
        );
    }

    const swatchSize = 10;
    const lineHeight = LEGEND_LINE_HEIGHT;
    const contentHeight = labels.size * lineHeight;
    const scroll = view
        ? view.legend.clampScroll(content.height, contentHeight)
        : 0;
    const scrollable = contentHeight > content.height;
    const textMax = Math.max(
        0,
        content.width - swatchSize - 6 - (scrollable ? SCROLLBAR_W + 4 : 0),
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(content.x, content.y, content.width, content.height);
    ctx.clip();

    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const start = Math.floor(scroll / lineHeight);
    const x = content.x;
    let idx = 0;
    let y = content.y + lineHeight / 2 + start * lineHeight - scroll;
    for (const [label, palIdx] of labels) {
        if (idx < start) {
            idx++;
            continue;
        }

        if (y - lineHeight / 2 >= content.y + content.height) {
            break;
        }

        const color = palette[palIdx] ??
            palette[palIdx % palette.length] ?? [0, 0, 0];
        ctx.fillStyle = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
        ctx.fillRect(x, y - swatchSize / 2, swatchSize, swatchSize);

        ctx.fillStyle = textColor;
        ctx.fillText(truncateText(ctx, label, textMax), x + swatchSize + 6, y);

        y += lineHeight;
        idx++;
    }

    ctx.restore();
    paintLegendScrollbar(ctx, content, scroll, contentHeight, theme);

    if (view) {
        view.legend.setPainted({
            mode: view.mode,
            box: rect,
            content,
            contentHeight,
            sidebarGutter: view.sidebarGutter,
        });
    }
}
