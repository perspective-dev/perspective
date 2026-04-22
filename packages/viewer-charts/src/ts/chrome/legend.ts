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

import type { PlotLayout } from "../layout/plot-layout";
import { formatTickValue } from "../layout/ticks";
import {
    colorValueToT,
    sampleGradient,
    type GradientStop,
} from "../theme/gradient";

function rgbCss(c: [number, number, number, number]): string {
    return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

/**
 * Render a vertical color gradient legend on the Canvas2D overlay.
 * Only call when a color column is active. When `colorDomain` crosses
 * zero the 50% stop (sign pivot) is annotated with a tick + `0` label.
 */
export function renderLegend(
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
    colorDomain: { min: number; max: number; label: string },
    stops: GradientStop[],
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const style = getComputedStyle(canvas);
    const textColor =
        style.getPropertyValue("--psp-webgl--legend--color").trim() ||
        "rgba(180, 180, 180, 0.9)";
    const borderColor =
        style.getPropertyValue("--psp-webgl--legend-border--color").trim() ||
        "rgba(128,128,128,0.3)";
    const fontFamily =
        style.getPropertyValue("--psp-webgl--font-family").trim() ||
        "monospace";

    const barWidth = 16;
    const barHeight = Math.min(120, layout.plotRect.height * 0.4);
    const x = layout.plotRect.x + layout.plotRect.width + 12;
    const y = layout.margins.top + 20;

    ctx.fillStyle = textColor;
    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(colorDomain.label, x, y - 4);

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

    const labelX = x + barWidth + 5;
    ctx.fillText(formatTickValue(colorDomain.max), labelX, y + 2);
    ctx.fillText(
        formatTickValue((colorDomain.min + colorDomain.max) / 2),
        labelX,
        y + barHeight / 2,
    );
    ctx.fillText(formatTickValue(colorDomain.min), labelX, y + barHeight - 2);

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
}

/**
 * Render a categorical legend with discrete colored swatches.
 * Used when split_by or string color columns produce distinct categories.
 */
export function renderCategoricalLegend(
    canvas: HTMLCanvasElement,
    layout: PlotLayout,
    labels: Map<string, number>,
    palette: [number, number, number][],
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (labels.size === 0) return;

    const style = getComputedStyle(canvas);
    const textColor =
        style.getPropertyValue("--psp-webgl--legend--color").trim() ||
        "rgba(180, 180, 180, 0.9)";
    const fontFamily =
        style.getPropertyValue("--psp-webgl--font-family").trim() ||
        "monospace";

    const swatchSize = 10;
    const lineHeight = 18;
    const x = layout.plotRect.x + layout.plotRect.width + 12;
    let y = layout.margins.top + 10;

    ctx.font = `11px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (const [label, idx] of labels) {
        const color = palette[idx] ??
            palette[idx % palette.length] ?? [0, 0, 0];
        ctx.fillStyle = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
        ctx.fillRect(x, y - swatchSize / 2, swatchSize, swatchSize);

        ctx.fillStyle = textColor;
        ctx.fillText(label, x + swatchSize + 6, y);

        y += lineHeight;
    }
}
