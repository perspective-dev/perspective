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

/**
 * Minimal positioning input — PlotLayout satisfies this.
 */
export interface CssBounds {
    cssWidth: number;
    cssHeight: number;
}

export interface TooltipCallbacks {
    /**
     * RAF-throttled mouse position in CSS pixels, relative to the GL
     * canvas (host already subtracted `getBoundingClientRect`).
     */
    onHover(mx: number, my: number): void;

    /**
     * Fires on mouseleave; skipped while a pinned tooltip is active.
     */
    onLeave(): void;

    /**
     * Fires on click with mouse position. Return true to consume the click
     * (skipping the default pin/dismiss flow — used for legend clicks).
     */
    onClickPre?(mx: number, my: number): boolean;

    /**
     * Fires when a click should pin the current hover target.
     */
    onPin?(mx: number, my: number): void;

    /**
     * Fires on dblclick (treemap drill-up gesture). Optional — charts
     * that don't bind a handler simply ignore the event.
     */
    onDblClick?(mx: number, my: number): void;

    /**
     * Fires when an active pin is dismissed by a click on the
     * already-pinned target (the "click again to unpin" gesture in
     * `dispatchClick`). Chart impls hook this to emit a
     * `perspective-global-filter` with `selected: false`. Does *not*
     * fire on the implicit dismiss inside `pin()` that replaces an
     * existing pin — that path is followed by a fresh `onPin` which
     * emits its own `selected: true`.
     */
    onUnpin?(): void;
}

export interface RenderTooltipOptions {
    /**
     * Draw a dashed crosshair at `pos`. Used by scatter/line.
     */
    crosshair?: boolean;

    /**
     * Draw a ring of `radius` CSS pixels at `pos`. Used to highlight a
     * hovered point. Omit for bars (where the bar itself highlights).
     */
    highlightRadius?: number;
}

/**
 * Side-channel from the chart back to the host's DOM. The chart calls
 * into a sink rather than touching the DOM itself; the host
 * materializes the actual visual (`<div>` for pinned tooltip, cursor
 * mutation on the GL canvas).
 *
 *   - `MessageHostSink` (in worker/) — forwards calls over a
 *                              `postMessage`-shaped channel back to
 *                              the host.
 *   - `DomHostSink` (in host transport) — receives the matching
 *                              envelopes and applies them to the DOM.
 *
 * The controller's `_pinned` flag is the source of truth for whether
 * hover updates are gated; the sink only owns the visual artifact.
 */
export interface HostSink {
    pin(
        lines: string[],
        pos: { px: number; py: number },
        bounds: CssBounds,
    ): void;
    dismiss(): void;
    setCursor(cursor: string): void;

    /**
     * Forward a `perspective-click` to the host. Optional — only the
     * worker-bound `MessageHostSink` implements it; `DomHostSink` (the
     * host-side consumer of pin/dismiss) never sees user-event calls,
     * so omits the implementation.
     */
    emitUserClick?(detail: UserClickPayload): void;

    /**
     * Forward a `perspective-global-filter` to the host with the
     * `selected: true` / `selected: false` semantics. The host owns the
     * `removeConfigs` history (mirrors datagrid's
     * `model._last_insert_configs`); the sink only ships the new state.
     */
    emitUserSelect?(payload: UserSelectPayload): void;
}

/**
 * Plain-object payload for `HostSink.emitUserClick`. Matches
 * `PerspectiveClickDetail` byte-for-byte; defined locally to avoid a
 * cycle through `event-detail.ts`.
 */
export interface UserClickPayload {
    row: Record<string, unknown>;
    column_names: string[];
    config: { filter?: unknown[] };
}

/**
 * Plain-object payload for `HostSink.emitUserSelect`. The host
 * transport reconstructs a `PerspectiveSelectDetail` class instance
 * from this plus its cached `_lastInsertConfig`.
 */
export interface UserSelectPayload {
    selected: boolean;
    row: Record<string, unknown>;
    column_names: string[];
    insertConfig: { filter?: unknown[] };
}

/**
 * Owns the hover/click/dblclick state machine and the pinned-tooltip
 * lifecycle. The renderer drives this purely through
 * `dispatchHover` / `dispatchLeave` / `dispatchClick` /
 * `dispatchDblClick` — the host's `RawEventForwarder` captures DOM
 * events on the GL canvas and posts them as `InteractionEvent`s.
 *
 * Pinning + cursor changes go through a {@link HostSink} so the actual
 * DOM mutations happen host-side regardless of where the chart runs.
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
     * Replace the active host sink. Dismisses any existing pin via the
     * prior sink so we never leak a pinned artifact across resets —
     * though in practice each chart instance uses one sink for its
     * lifetime.
     */
    setHost(sink: HostSink): void {
        if (this._pinned) {
            this._host?.dismiss();
            this._pinned = false;
        }

        this._host = sink;
    }

    /**
     * Forward a cursor change to the host. No-op when no host sink is
     * installed (chart constructed without a transport).
     */
    setCursor(cursor: string): void {
        this._host?.setCursor(cursor);
    }

    /**
     * Install the chart's tooltip callbacks. The renderer drives the
     * controller via `dispatchHover` / `dispatchLeave` /
     * `dispatchClick` / `dispatchDblClick`; this controller never
     * touches the DOM directly.
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
     * coords. Coalesces multiple calls within one animation frame so
     * pointer streams don't backlog the chart's hit-test path.
     *
     * Workers ship with `requestAnimationFrame` (DedicatedWorkerGlobalScope
     * exposes it for OffscreenCanvas painting), so the same coalescer
     * works in both modes. We fall back to setTimeout if RAF is missing
     * (e.g. node tests without a polyfill).
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
     * Pin a tooltip (or replace an active one). Forwards through the
     * configured sink and flips the controller's pinned flag so hover
     * dispatch is suppressed until dismissal.
     */
    pin(
        lines: string[],
        pos: { px: number; py: number },
        bounds: CssBounds,
    ): void {
        if (lines.length === 0) {
            return;
        }

        this._host?.pin(lines, pos, bounds);
        this._pinned = true;
    }

    dismiss(): void {
        this._host?.dismiss();
        this._pinned = false;
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
    canvas: Canvas2D | null,
    pos: { px: number; py: number },
    lines: string[],
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
    const lineHeight = 16;
    const padding = 8;
    let maxWidth = 0;
    for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxWidth) {
            maxWidth = w;
        }
    }

    const boxW = maxWidth + padding * 2;
    const boxH = lines.length * lineHeight + padding * 2 - 4;
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

    const hasLines = lines.length > 0;

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

    // Box + text are only drawn when we have content. Callers pass an
    // empty `lines` array while a lazy row fetch is still in flight —
    // the crosshair / highlight ring above paint immediately so the
    // hover remains visible, but the tooltip chrome waits for data.
    if (hasLines) {
        ctx.fillStyle = theme.tooltipBg;
        ctx.strokeStyle = theme.tooltipBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = theme.tooltipText;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], tx + padding, ty + padding + i * lineHeight);
        }
    }

    ctx.restore();
}
