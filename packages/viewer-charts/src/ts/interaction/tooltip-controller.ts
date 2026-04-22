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
import type { Theme } from "../theme/theme";

/** Minimal positioning input — PlotLayout satisfies this. */
export interface CssBounds {
    cssWidth: number;
    cssHeight: number;
}

export interface TooltipCallbacks {
    /** RAF-throttled mouse position in CSS pixels, relative to `glCanvas`. */
    onHover(mx: number, my: number): void;
    /** Fires on mouseleave; skipped while a pinned tooltip is active. */
    onLeave(): void;
    /**
     * Fires on click with mouse position. Return true to consume the click
     * (skipping the default pin/dismiss flow — used for legend clicks).
     */
    onClickPre?(mx: number, my: number): boolean;
    /** Fires when a click should pin the current hover target. */
    onPin?(mx: number, my: number): void;
}

export interface RenderTooltipOptions {
    /** Draw a dashed crosshair at `pos`. Used by scatter/line. */
    crosshair?: boolean;
    /**
     * Draw a ring of `radius` CSS pixels at `pos`. Used to highlight a
     * hovered point. Omit for bars (where the bar itself highlights).
     */
    highlightRadius?: number;
}

/**
 * Owns tooltip mouse wiring and the pinned-DOM-tooltip lifecycle.
 * Composition-friendly: each chart instantiates one, forwards callbacks
 * into its own state, and calls the canvas/DOM render helpers.
 */
export class TooltipController {
    private _canvas: HTMLCanvasElement | null = null;
    private _moveHandler: ((e: MouseEvent) => void) | null = null;
    private _leaveHandler: (() => void) | null = null;
    private _clickHandler: ((e: MouseEvent) => void) | null = null;
    private _hoverRAFId = 0;
    private _pinnedDiv: HTMLDivElement | null = null;

    get isPinned(): boolean {
        return this._pinnedDiv !== null;
    }

    attach(glCanvas: HTMLCanvasElement, callbacks: TooltipCallbacks): void {
        this.detach();
        this._canvas = glCanvas;

        this._moveHandler = (e: MouseEvent) => {
            if (this.isPinned) return;
            if (this._hoverRAFId) return;
            const rect = glCanvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            this._hoverRAFId = requestAnimationFrame(() => {
                this._hoverRAFId = 0;
                callbacks.onHover(mx, my);
            });
        };

        this._leaveHandler = () => {
            if (this.isPinned) return;
            callbacks.onLeave();
        };

        this._clickHandler = (e: MouseEvent) => {
            const rect = glCanvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            if (callbacks.onClickPre?.(mx, my)) return;
            if (this.isPinned) {
                this.dismissPinned();
                return;
            }
            callbacks.onPin?.(mx, my);
        };

        glCanvas.addEventListener("mousemove", this._moveHandler);
        glCanvas.addEventListener("mouseleave", this._leaveHandler);
        glCanvas.addEventListener("click", this._clickHandler);
    }

    detach(): void {
        if (this._canvas) {
            if (this._moveHandler)
                this._canvas.removeEventListener(
                    "mousemove",
                    this._moveHandler,
                );
            if (this._leaveHandler)
                this._canvas.removeEventListener(
                    "mouseleave",
                    this._leaveHandler,
                );
            if (this._clickHandler)
                this._canvas.removeEventListener("click", this._clickHandler);
        }
        if (this._hoverRAFId) {
            cancelAnimationFrame(this._hoverRAFId);
            this._hoverRAFId = 0;
        }
        this._moveHandler = null;
        this._leaveHandler = null;
        this._clickHandler = null;
    }

    /** Create a floating DOM tooltip and attach to `parent`. */
    showPinned(
        parent: HTMLElement,
        lines: string[],
        pos: { px: number; py: number },
        bounds: CssBounds,
        theme: Theme,
    ): void {
        this.dismissPinned();
        if (lines.length === 0) return;

        const div = document.createElement("div");
        div.style.cssText = [
            "position:absolute",
            "pointer-events:auto",
            `font:11px ${theme.fontFamily}`,
            `background:${theme.tooltipBg}`,
            `color:${theme.tooltipText}`,
            `border:1px solid ${theme.tooltipBorder}`,
            "border-radius:4px",
            "padding:8px",
            "overflow-y:auto",
            `max-height:${Math.round(bounds.cssHeight * 0.6)}px`,
            "white-space:pre",
            "z-index:10",
            "line-height:16px",
        ].join(";");
        div.textContent = lines.join("\n");

        parent.style.position = "relative";
        div.style.left = "-9999px";
        div.style.top = "0px";
        parent.appendChild(div);
        this._pinnedDiv = div;

        const divW = div.getBoundingClientRect().width;
        const divH = div.getBoundingClientRect().height;
        let tx = pos.px + 12;
        let ty = pos.py - divH - 8;
        if (tx + divW > bounds.cssWidth) tx = pos.px - divW - 12;
        if (tx < 0) tx = 4;
        if (ty < 0) ty = pos.py + 12;
        if (ty + divH > bounds.cssHeight) ty = bounds.cssHeight - divH - 4;

        div.style.left = `${tx}px`;
        div.style.top = `${ty}px`;
    }

    dismissPinned(): void {
        if (this._pinnedDiv) {
            this._pinnedDiv.remove();
            this._pinnedDiv = null;
        }
    }
}

/**
 * Paint a canvas tooltip (crosshair, highlight ring, box + text) onto
 * `canvas`. The helper normalizes the 2D context to a DPR-scaled
 * identity transform on entry and restores prior state on exit, so it
 * composes cleanly with other chrome painters that may have already
 * called `initCanvas` on the same canvas — re-applying `scale(dpr,dpr)`
 * blind would double-scale in that case, misplacing the tooltip
 * proportionally to its distance from the origin.
 */
export function renderCanvasTooltip(
    canvas: HTMLCanvasElement,
    pos: { px: number; py: number },
    lines: string[],
    layout: PlotLayout,
    theme: Theme,
    options: RenderTooltipOptions = {},
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.font = `11px ${theme.fontFamily}`;
    const lineHeight = 16;
    const padding = 8;
    let maxWidth = 0;
    for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxWidth) maxWidth = w;
    }
    const boxW = maxWidth + padding * 2;
    const boxH = lines.length * lineHeight + padding * 2 - 4;

    let tx = pos.px + 12;
    let ty = pos.py - boxH - 8;
    if (tx + boxW > layout.cssWidth) tx = pos.px - boxW - 12;
    if (ty < 0) ty = pos.py + 12;
    if (ty + boxH > layout.cssHeight) ty = layout.cssHeight - boxH - 4;

    // Crosshair
    if (options.crosshair) {
        ctx.strokeStyle = theme.tickColor;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pos.px, layout.plotRect.y);
        ctx.lineTo(pos.px, layout.plotRect.y + layout.plotRect.height);
        ctx.moveTo(layout.plotRect.x, pos.py);
        ctx.lineTo(layout.plotRect.x + layout.plotRect.width, pos.py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
    }

    // Highlight ring
    if (options.highlightRadius && options.highlightRadius > 0) {
        ctx.strokeStyle = theme.tickColor;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.px, pos.py, options.highlightRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    // Box
    ctx.fillStyle = theme.tooltipBg;
    ctx.strokeStyle = theme.tooltipBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = theme.tooltipText;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], tx + padding, ty + padding + i * lineHeight);
    }

    ctx.restore();
}
