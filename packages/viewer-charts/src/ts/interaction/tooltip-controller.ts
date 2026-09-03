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
import type { PlotLayout } from "../layout/plot-layout";
import type { Theme } from "../theme/theme";
import {
    measureTooltipGrid,
    paintTooltipGrid,
    DEFAULT_TOOLTIP_STYLE,
    type TooltipContent,
    type TooltipStyle,
} from "./tooltip-grid";

export interface CssBounds {
    cssWidth: number;
    cssHeight: number;
}

export interface TooltipCallbacks {
    /**
     * RAF-throttled mouse position in CSS pixels, relative to the GL
     * canvas.
     */
    onHover(mx: number, my: number): void;

    /**
     * Fires on mouseleave; skipped while a pinned tooltip is active.
     */
    onLeave(): void;

    /**
     * Fires on click with mouse position.
     */
    onClickPre?(mx: number, my: number): boolean;

    /**
     * Fires when a click should pin the current hover target.
     */
    onPin?(mx: number, my: number): void;

    /**
     * Fires on dblclick (treemap drill-up gesture).
     */
    onDblClick?(mx: number, my: number): void;

    /**
     * Fires when an active pin is dismissed by a click.
     */
    onUnpin?(): void;
}

export interface RenderTooltipOptions {
    crosshair?: boolean;
    highlightRadius?: number;
    maxColumnPx?: number;
    opacity?: number;
}

/**
 * Side-channel from the chart back to the host's DOM.
 */
export interface HostSink {
    pin(
        grid: TooltipContent,
        pos: { px: number; py: number },
        bounds: CssBounds,
        style?: TooltipStyle,
    ): void;
    dismiss(): void;
    setCursor(cursor: string): void;
    emitUserClick?(detail: UserClickPayload): void;
    emitUserSelect?(payload: UserSelectPayload): void;
}

export interface UserClickPayload {
    row: Record<string, unknown>;
    column_names: string[];
    config: { filter?: unknown[] };
}

export interface UserSelectPayload {
    selected: boolean;
    row: Record<string, unknown>;
    column_names: string[];
    insertConfig: { filter?: unknown[] };
}

/**
 * Owns the hover/click/dblclick state machine and the pinned-tooltip
 * lifecycle.
 */
export class TooltipController {
    private _callbacks: TooltipCallbacks | null = null;
    private _hoverRAFId = 0;
    private _hoverTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private _host: HostSink | null = null;
    private _pinned = false;

    get isPinned(): boolean {
        return this._pinned;
    }

    /**
     * Replace the active host sink.
     */
    setHost(sink: HostSink): void {
        if (this._pinned) {
            this._host?.dismiss();
            this._pinned = false;
        }

        this._host = sink;
    }

    /**
     * Forward a cursor change to the host.
     */
    setCursor(cursor: string): void {
        this._host?.setCursor(cursor);
    }

    /**
     * Install the chart's tooltip callbacks.
     */
    attach(callbacks: TooltipCallbacks): void {
        this.detach();
        this._callbacks = callbacks;
    }

    detach(): void {
        if (this._hoverRAFId) {
            cancelAnimationFrame(this._hoverRAFId);
            this._hoverRAFId = 0;
        }

        if (this._hoverTimeoutId !== null) {
            clearTimeout(this._hoverTimeoutId);
            this._hoverTimeoutId = null;
        }

        this._callbacks = null;
    }

    /**
     * Schedule an `onHover` callback for the given canvas-relative
     * coords.
     */
    dispatchHover(mx: number, my: number): void {
        if (this._pinned || !this._callbacks) {
            return;
        }

        if (this._hoverRAFId || this._hoverTimeoutId !== null) {
            return;
        }

        const fire = () => {
            this._hoverRAFId = 0;
            this._hoverTimeoutId = null;
            this._callbacks?.onHover(mx, my);
        };

        if (typeof requestAnimationFrame === "function") {
            this._hoverRAFId = requestAnimationFrame(fire);
        } else {
            this._hoverTimeoutId = setTimeout(fire, 16);
        }
    }

    dispatchLeave(): void {
        if (this._pinned || !this._callbacks) {
            return;
        }

        this._callbacks.onLeave();
    }

    dispatchClick(mx: number, my: number): void {
        if (!this._callbacks) {
            return;
        }

        if (this._callbacks.onClickPre?.(mx, my)) {
            return;
        }

        if (this._pinned) {
            const cb = this._callbacks;
            this.dismiss();
            cb.onUnpin?.();
            return;
        }

        this._callbacks.onPin?.(mx, my);
    }

    dispatchDblClick(mx: number, my: number): void {
        this._callbacks?.onDblClick?.(mx, my);
    }

    /**
     * Pin a tooltip (or replace an active one).
     */
    pin(
        grid: TooltipContent,
        pos: { px: number; py: number },
        bounds: CssBounds,
        style: TooltipStyle = DEFAULT_TOOLTIP_STYLE,
    ): void {
        if (grid.length === 0) {
            return;
        }

        this._host?.pin(grid, pos, bounds, style);
        this._pinned = true;
    }

    dismiss(): void {
        this._host?.dismiss();
        this._pinned = false;
    }
}

/**
 * Paint a canvas tooltip (crosshair, highlight ring, box + text) onto
 * `canvas`.
 */
export function renderCanvasTooltip(
    canvas: Canvas2D | null,
    pos: { px: number; py: number },
    grid: TooltipContent,
    layout: PlotLayout,
    theme: Theme,
    dpr: number,
    options: RenderTooltipOptions = {},
): void {
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d") as Context2D | null;
    if (!ctx) {
        return;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.font = `11px ${theme.fontFamily}`;
    const measured = measureTooltipGrid(
        ctx,
        grid,
        options.maxColumnPx ?? DEFAULT_TOOLTIP_STYLE.maxColumnPx,
    );
    const { boxW, boxH } = measured;
    let tx = pos.px + 12;
    let ty = pos.py - boxH - 8;
    if (tx + boxW > layout.cssWidth) {
        tx = pos.px - boxW - 12;
    }

    if (ty < 0) {
        ty = pos.py + 12;
    }

    if (ty + boxH > layout.cssHeight) {
        ty = layout.cssHeight - boxH - 4;
    }

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

    if (grid.length > 0) {
        paintTooltipGrid(
            ctx,
            measured,
            tx,
            ty,
            theme,
            options.opacity ?? DEFAULT_TOOLTIP_STYLE.opacity,
        );
    }

    ctx.restore();
}
