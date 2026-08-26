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

import {
    DEFAULT_PLUGIN_CONFIG,
    type LegendAnchor,
    type PluginConfig,
} from "../charts/chart";
import type { PlotRect } from "../layout/plot-layout";
import type { InteractionEvent } from "../transport/protocol";

/** Minimum legend width for any mode (drag clamp + config clamp). */
export const LEGEND_MIN_WIDTH = 48;

/** Maximum configurable legend width (further clamped to canvas/2). */
export const LEGEND_MAX_WIDTH = 512;

/** Minimum floating-panel height. */
export const LEGEND_MIN_HEIGHT = 48;

/** Floating-panel width when `legend_width_px` is 0 (auto). */
const FLOATING_AUTO_WIDTH = 160;

/** Floating-panel height when `legend_height_px` is 0. */
const FLOATING_AUTO_HEIGHT = 160;

/** Floating-panel header strip height (title + move grip). */
export const LEGEND_HEADER_H = 18;

/** Edge-proximity in CSS px that reads as a resize handle. */
const EDGE = 5;

/** Corner zone size for the combined SE resize handle. */
const CORNER = 12;

/** Scrollbar hit-zone width (paint width is narrower). */
const SCROLLBAR_HIT_W = 10;

/** Pointer travel in CSS px before a body-press becomes a move drag. */
const MOVE_THRESHOLD = 3;

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}

function clamp01(v: number): number {
    return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

/** Normalized-span coordinate: `px` along a free span of `span` px. */
function norm(px: number, span: number): number {
    return span > 0 ? clamp01(px / span) : 0;
}

function anchorRight(a: LegendAnchor): boolean {
    return a === "top-right" || a === "bottom-right";
}

function anchorBottom(a: LegendAnchor): boolean {
    return a === "bottom-left" || a === "bottom-right";
}

/**
 * Sidebar gutter width when the sidebar legend is active: the
 * configured `legend_width_px`, or `legacy` (the chart family's
 * historical gutter constant) when the config is 0 (auto).
 */
export function legendSidebarWidth(cfg: PluginConfig, legacy: number): number {
    return cfg.legend_width_px > 0
        ? clamp(cfg.legend_width_px, LEGEND_MIN_WIDTH, LEGEND_MAX_WIDTH)
        : legacy;
}

/**
 * Right-margin width a plot layout should reserve for the legend.
 * `legacy` is the family's historical `hasLegend` gutter (80 for
 * single-plot layouts, 96 for facet grids). Modes `"none"` and
 * `"floating"` collapse the gutter to the no-legend breathing margin —
 * the plot widens and the floating panel overlays it.
 */
export function legendRightGutter(
    cfg: PluginConfig,
    hasLegend: boolean,
    legacy: number = 80,
): number {
    if (!hasLegend || cfg.legend_mode !== "sidebar") {
        return 16;
    }

    return legendSidebarWidth(cfg, legacy);
}

/**
 * Tree-chart variant of {@link legendRightGutter}: trees reserve `0`
 * (fully flush cells) rather than a 16px breathing margin when no
 * sidebar legend is present.
 */
export function legendTreeGutter(
    cfg: PluginConfig,
    hasLegend: boolean,
    legacy: number,
): number {
    if (!hasLegend || cfg.legend_mode !== "sidebar") {
        return 0;
    }

    return legendSidebarWidth(cfg, legacy);
}

/**
 * Cursor-zone classification for a point over the painted legend.
 * Sidebar legends expose only `resize-w` (their left edge) plus
 * `scrollbar` / `body`; floating panels add the E/S/SE handles and the
 * `move` grip (header strip — the body also moves, gated by
 * {@link MOVE_THRESHOLD} so entry clicks still land).
 */
export type LegendHitZone =
    | "none"
    | "body"
    | "move"
    | "scrollbar"
    | "resize-w"
    | "resize-e"
    | "resize-s"
    | "resize-se";

/**
 * Frame snapshot the legend painters hand back after painting: the
 * panel's outer box, the scrollable content rect inside it, and the
 * full (unclipped) content height. Hit-testing and wheel/drag routing
 * all consult the LAST PAINTED geometry — between paints the on-screen
 * pixels are exactly this snapshot, so events resolve against what the
 * user actually sees.
 */
export interface PaintedLegend {
    mode: "sidebar" | "floating";
    box: PlotRect;
    content: PlotRect;
    contentHeight: number;

    /**
     * The resolved right-gutter width this frame (sidebar mode only).
     * The width-drag applies its delta to this — NOT to `box.width`,
     * which excludes the gutter's padding — so a drag that starts on
     * an auto-width (config 0) legend continues from the family's
     * legacy width without a jump.
     */
    sidebarGutter?: number;
}

/** The `PluginConfig` fields this controller owns. */
const LEGEND_FIELDS = [
    "legend_mode",
    "legend_width_px",
    "legend_height_px",
    "legend_anchor",
    "legend_x",
    "legend_y",
    "legend_opacity",
] as const;

type LegendFieldSnapshot = {
    legend_width_px: number;
    legend_height_px: number;
    legend_x: number;
    legend_y: number;
};

type DragState =
    | {
          kind: "resize-w" | "resize-e" | "resize-s" | "resize-se";
          startMx: number;
          startMy: number;
          startBox: PlotRect;
          startGutter: number;
          snapshot: LegendFieldSnapshot;
      }
    | {
          kind: "move";
          startMx: number;
          startMy: number;
          startBox: PlotRect;
          moved: boolean;
          snapshot: LegendFieldSnapshot;
      }
    | {
          kind: "scrollbar";
          startMy: number;
          startScroll: number;
      };

/**
 * Per-event services the worker renderer supplies. The controller is
 * pure state — it never reaches into the chart or transport itself.
 */
export interface LegendEventCtx {
    /**
     * The chart's live plugin config. Drag gestures mutate the legend
     * fields on this object directly (the worker-local copy), so the
     * next paint lays out from the in-progress values; the persisted
     * delta is posted once at pointerup.
     */
    cfg: PluginConfig;
    cssWidth: number;
    cssHeight: number;

    /**
     * Visible toggleable entry rects (series legends). A floating-panel
     * click that lands on one passes through to the chart's own legend
     * click handler instead of being consumed.
     */
    legendRects: ReadonlyArray<{ rect: PlotRect }>;

    /**
     * Schedule a repaint. `relayout: true` when the gesture changed the
     * plot geometry (sidebar width) and a full GL pass is required;
     * `false` for chrome-only changes (scroll, floating move/resize).
     */
    repaint(relayout: boolean): void;

    /** Post a persisted config delta (pointerup, changed fields only). */
    postDelta(fields: Partial<PluginConfig>): void;

    setCursor(cursor: string): void;

    /** Dismiss any active plot hover (cursor entered the legend). */
    dispatchLeave(): void;
}

/**
 * Single owner of legend interaction state: last-painted geometry,
 * scroll offset, hover cursor, and the drag state machine. One
 * instance per chart (`AbstractChart._legend`); the worker renderer
 * consults {@link handleEvent} FIRST for every forwarded interaction
 * event, so legend gestures structurally preempt plot zoom / pan /
 * tooltip routing rather than racing them.
 *
 * The scroll offset is transient (never persisted); geometry fields
 * (`legend_width_px`, `legend_height_px`, `legend_x`, `legend_y`)
 * round-trip through `plugin_config`.
 */
export class LegendController {
    private _painted: PaintedLegend | null = null;
    private _scroll = 0;
    private _drag: DragState | null = null;
    private _suppressClick = false;
    private _hoverInside = false;
    private _lastCursor = "";

    //  Painter surface

    /**
     * Clamp and return the scroll offset for this frame. Painters call
     * this before drawing the entry window so the offset is always
     * valid against the CURRENT content/viewport pair (content can
     * shrink between frames — data updates, panel resizes).
     */
    clampScroll(viewHeight: number, contentHeight: number): number {
        this._scroll = clamp(
            this._scroll,
            0,
            Math.max(0, contentHeight - viewHeight),
        );
        return this._scroll;
    }

    /** Record this frame's painted geometry. */
    setPainted(p: PaintedLegend): void {
        this._painted = p;
    }

    /**
     * Record that no legend was painted this frame (mode `"none"`, or
     * no legend content). Kills every hit zone until the next paint.
     */
    clearPainted(): void {
        this._painted = null;
    }

    /**
     * Resolve the floating panel's outer box from config. Offsets are
     * normalized to the free span and measured from the
     * `legend_anchor` corner, so every `legend_x`/`legend_y` in [0, 1]
     * yields a fully on-canvas box at any canvas size.
     */
    floatingBox(
        cfg: PluginConfig,
        cssWidth: number,
        cssHeight: number,
    ): PlotRect {
        const width = clamp(
            cfg.legend_width_px > 0 ? cfg.legend_width_px : FLOATING_AUTO_WIDTH,
            LEGEND_MIN_WIDTH,
            Math.max(LEGEND_MIN_WIDTH, Math.floor(cssWidth / 2)),
        );
        const height = clamp(
            cfg.legend_height_px > 0
                ? cfg.legend_height_px
                : FLOATING_AUTO_HEIGHT,
            LEGEND_MIN_HEIGHT,
            Math.max(LEGEND_MIN_HEIGHT, cssHeight - 8),
        );
        const freeW = Math.max(0, cssWidth - width);
        const freeH = Math.max(0, cssHeight - height);
        const rx = clamp01(cfg.legend_x) * freeW;
        const ry = clamp01(cfg.legend_y) * freeH;
        return {
            x: anchorRight(cfg.legend_anchor) ? freeW - rx : rx,
            y: anchorBottom(cfg.legend_anchor) ? freeH - ry : ry,
            width,
            height,
        };
    }

    //  Config lifecycle

    /**
     * Called by `setPluginConfig` BEFORE the incoming config replaces
     * the current one. A restore whose legend fields EQUAL the current
     * values is the persistence echo of a completed drag — a no-op
     * here, so scroll and any in-flight gesture survive. Different
     * values (the user typed in the settings form, or a restore raced
     * in) win unconditionally: any in-flight drag is cancelled.
     */
    reconcileConfig(prev: PluginConfig, next: PluginConfig): void {
        if (!this._drag) {
            return;
        }

        for (const key of LEGEND_FIELDS) {
            if (prev[key] !== next[key]) {
                this._drag = null;
                return;
            }
        }
    }

    //  Interaction

    cancelGesture(): void {
        this._drag = null;
        this._suppressClick = false;
    }

    /**
     * Route one forwarded interaction event. Returns `true` when the
     * event was consumed (the caller must not forward it to zoom /
     * tooltip routing).
     */
    handleEvent(event: InteractionEvent, ctx: LegendEventCtx): boolean {
        switch (event.type) {
            case "wheel":
                return this._onWheel(event.mx, event.my, event.deltaY, ctx);
            case "pointerdown":
                return this._onPointerDown(event.mx, event.my, ctx);
            case "pointermove":
                return this._onPointerMove(event.mx, event.my, ctx);
            case "pointerup":
                return this._onPointerUp(ctx);
            case "click":
                return this._onClick(event.mx, event.my, ctx);
            case "dblclick":
                return this._onDblClick(event.mx, event.my, ctx);
            case "pointerleave":
                this._hoverInside = false;
                this._setCursor("", ctx);
                return false;
        }
    }

    /** Classify a canvas-CSS-px point against the last painted legend. */
    hitTest(mx: number, my: number): LegendHitZone {
        const p = this._painted;
        if (!p) {
            return "none";
        }

        const b = p.box;
        if (p.mode === "floating") {
            const inX = mx >= b.x - EDGE && mx <= b.x + b.width + EDGE;
            const inY = my >= b.y - EDGE && my <= b.y + b.height + EDGE;
            if (!inX || !inY) {
                return "none";
            }

            const nearW = Math.abs(mx - b.x) <= EDGE;
            const nearE = Math.abs(mx - (b.x + b.width)) <= EDGE;
            const nearS = Math.abs(my - (b.y + b.height)) <= EDGE;
            if (
                (nearE && my >= b.y + b.height - CORNER) ||
                (nearS && mx >= b.x + b.width - CORNER)
            ) {
                return "resize-se";
            }

            if (nearE) {
                return "resize-e";
            }

            if (nearW) {
                return "resize-w";
            }

            if (nearS) {
                return "resize-s";
            }

            if (this._inScrollbar(mx, my)) {
                return "scrollbar";
            }

            if (my <= b.y + LEGEND_HEADER_H) {
                return "move";
            }

            return "body";
        }

        // Sidebar: the grab zone straddles the legend's left edge and
        // the 12px pad between it and the plot rect.
        const inY = my >= b.y && my <= b.y + b.height;
        if (inY && mx >= b.x - 14 && mx <= b.x + 2) {
            return "resize-w";
        }

        if (inY && mx >= b.x && mx <= b.x + b.width) {
            if (this._inScrollbar(mx, my)) {
                return "scrollbar";
            }

            return "body";
        }

        return "none";
    }

    private _scrollable(): boolean {
        const p = this._painted;
        return !!p && p.contentHeight > p.content.height + 0.5;
    }

    private _inScrollbar(mx: number, my: number): boolean {
        const p = this._painted;
        if (!p || !this._scrollable()) {
            return false;
        }

        const c = p.content;
        return (
            mx >= c.x + c.width - SCROLLBAR_HIT_W &&
            mx <= c.x + c.width &&
            my >= c.y &&
            my <= c.y + c.height
        );
    }

    private _onWheel(
        mx: number,
        my: number,
        deltaY: number,
        ctx: LegendEventCtx,
    ): boolean {
        if (this._drag) {
            return true;
        }

        if (this.hitTest(mx, my) === "none") {
            return false;
        }

        if (this._scrollable()) {
            this._setScroll(this._scroll + deltaY, ctx);
        }

        // Consume regardless: a wheel over the legend must never zoom
        // the plot underneath (floating), and the sidebar gutter has no
        // zoom target anyway.
        return true;
    }

    private _onPointerDown(
        mx: number,
        my: number,
        ctx: LegendEventCtx,
    ): boolean {
        const zone = this.hitTest(mx, my);
        if (zone === "none") {
            return false;
        }

        const p = this._painted!;
        this._suppressClick = false;
        if (zone === "scrollbar") {
            this._drag = {
                kind: "scrollbar",
                startMy: my,
                startScroll: this._scroll,
            };
            return true;
        }

        const snapshot: LegendFieldSnapshot = {
            legend_width_px: ctx.cfg.legend_width_px,
            legend_height_px: ctx.cfg.legend_height_px,
            legend_x: ctx.cfg.legend_x,
            legend_y: ctx.cfg.legend_y,
        };

        if (
            zone === "resize-w" ||
            zone === "resize-e" ||
            zone === "resize-s" ||
            zone === "resize-se"
        ) {
            this._drag = {
                kind: zone,
                startMx: mx,
                startMy: my,
                startBox: { ...p.box },
                startGutter: p.sidebarGutter ?? p.box.width,
                snapshot,
            };
            this._setCursor(
                zone === "resize-s"
                    ? "ns-resize"
                    : zone === "resize-se"
                      ? "nwse-resize"
                      : "ew-resize",
                ctx,
            );
            return true;
        }

        if (p.mode === "floating") {
            // Header and body both arm a move; the threshold in
            // `_applyDrag` keeps plain clicks (entry toggles) intact.
            this._drag = {
                kind: "move",
                startMx: mx,
                startMy: my,
                startBox: { ...p.box },
                moved: false,
                snapshot,
            };
            return true;
        }

        // Sidebar body press: nothing to drag, but consume so no other
        // handler interprets the press.
        return true;
    }

    private _onPointerMove(
        mx: number,
        my: number,
        ctx: LegendEventCtx,
    ): boolean {
        if (this._drag) {
            this._applyDrag(mx, my, ctx);
            return true;
        }

        const zone = this.hitTest(mx, my);
        const inside = zone !== "none";
        if (inside && !this._hoverInside) {
            // Entering the legend: clear any plot hover so a stale
            // tooltip doesn't sit frozen under / beside the panel.
            ctx.dispatchLeave();
        }

        this._hoverInside = inside;
        this._setCursor(LegendController._cursorFor(zone), ctx);

        // Only the floating panel overlays plot data — consume so the
        // hover dispatch can't tooltip through it. The sidebar gutter
        // is outside the plot rect; hover there is already inert.
        return inside && this._painted!.mode === "floating";
    }

    private _onPointerUp(ctx: LegendEventCtx): boolean {
        const d = this._drag;
        if (!d) {
            return false;
        }

        this._drag = null;
        if (d.kind === "scrollbar") {
            this._suppressClick = true;
            return true;
        }

        if (d.kind === "move" && !d.moved) {
            // A press that never crossed the move threshold: plain
            // click — let the click event through for entry toggles.
            return true;
        }

        this._suppressClick = true;
        const fields: Partial<PluginConfig> = {};
        const cfg = ctx.cfg;
        if (cfg.legend_width_px !== d.snapshot.legend_width_px) {
            fields.legend_width_px = Math.round(cfg.legend_width_px);
        }

        if (cfg.legend_height_px !== d.snapshot.legend_height_px) {
            fields.legend_height_px = Math.round(cfg.legend_height_px);
        }

        if (round4(cfg.legend_x) !== round4(d.snapshot.legend_x)) {
            fields.legend_x = round4(cfg.legend_x);
        }

        if (round4(cfg.legend_y) !== round4(d.snapshot.legend_y)) {
            fields.legend_y = round4(cfg.legend_y);
        }

        if (Object.keys(fields).length > 0) {
            ctx.postDelta(fields);
        }

        return true;
    }

    private _onDblClick(mx: number, my: number, ctx: LegendEventCtx): boolean {
        const zone = this.hitTest(mx, my);
        if (zone === "none") {
            return false;
        }

        const resetsWidth =
            zone === "resize-w" || zone === "resize-e" || zone === "resize-se";
        const resetsHeight = zone === "resize-s" || zone === "resize-se";
        if (!resetsWidth && !resetsHeight) {
            return this._painted!.mode === "floating";
        }

        const cfg = ctx.cfg;
        const fields: Partial<PluginConfig> = {};
        if (
            resetsWidth &&
            cfg.legend_width_px !== DEFAULT_PLUGIN_CONFIG.legend_width_px
        ) {
            cfg.legend_width_px = DEFAULT_PLUGIN_CONFIG.legend_width_px;
            fields.legend_width_px = cfg.legend_width_px;
        }

        if (
            resetsHeight &&
            cfg.legend_height_px !== DEFAULT_PLUGIN_CONFIG.legend_height_px
        ) {
            cfg.legend_height_px = DEFAULT_PLUGIN_CONFIG.legend_height_px;
            fields.legend_height_px = cfg.legend_height_px;
        }

        if (Object.keys(fields).length > 0) {
            // Sidebar width changes the plot rect — full relayout;
            // floating resets are chrome-only. The anchored-coords
            // model keeps the anchor corner glued through the size
            // change, so no position rewrite is needed.
            ctx.repaint(this._painted!.mode === "sidebar");
            ctx.postDelta(fields);
        }

        return true;
    }

    private _onClick(mx: number, my: number, ctx: LegendEventCtx): boolean {
        if (this._suppressClick) {
            this._suppressClick = false;
            return true;
        }

        const zone = this.hitTest(mx, my);
        if (zone === "none") {
            return false;
        }

        if (zone === "scrollbar") {
            return true;
        }

        if (this._painted!.mode === "floating") {
            // Pass through only when the click lands on a toggleable
            // entry (series legends populate `legendRects` with the
            // visible window); everything else is consumed so the
            // click can't pin a tooltip on the plot under the panel.
            for (const entry of ctx.legendRects) {
                const r = entry.rect;
                if (
                    mx >= r.x &&
                    mx <= r.x + r.width &&
                    my >= r.y &&
                    my <= r.y + r.height
                ) {
                    return false;
                }
            }

            return true;
        }

        // Sidebar clicks keep their existing path (series toggle via
        // the chart's own click handler; the gutter is outside the
        // plot so nothing else can trigger).
        return false;
    }

    private _applyDrag(mx: number, my: number, ctx: LegendEventCtx): void {
        const d = this._drag!;
        const cfg = ctx.cfg;
        const { cssWidth, cssHeight } = ctx;
        const maxW = Math.max(LEGEND_MIN_WIDTH, Math.floor(cssWidth / 2));
        switch (d.kind) {
            case "scrollbar": {
                const p = this._painted;
                if (!p || p.content.height <= 0) {
                    return;
                }

                const ratio = p.contentHeight / p.content.height;
                this._setScroll(d.startScroll + (my - d.startMy) * ratio, ctx);
                return;
            }

            case "move": {
                if (!d.moved) {
                    const dist = Math.hypot(mx - d.startMx, my - d.startMy);
                    if (dist < MOVE_THRESHOLD) {
                        return;
                    }

                    d.moved = true;
                    this._setCursor("grabbing", ctx);
                }

                const w = d.startBox.width;
                const h = d.startBox.height;
                const x = clamp(
                    d.startBox.x + (mx - d.startMx),
                    0,
                    Math.max(0, cssWidth - w),
                );
                const y = clamp(
                    d.startBox.y + (my - d.startMy),
                    0,
                    Math.max(0, cssHeight - h),
                );
                this._writeAnchoredPos(ctx, x, y, w, h);
                ctx.repaint(false);
                return;
            }

            case "resize-w": {
                if (this._painted?.mode === "sidebar") {
                    cfg.legend_width_px = clamp(
                        Math.round(d.startGutter + (d.startMx - mx)),
                        LEGEND_MIN_WIDTH,
                        Math.min(LEGEND_MAX_WIDTH, maxW),
                    );
                    ctx.repaint(true);
                    return;
                }

                // Floating: keep the RIGHT edge fixed while the left
                // edge follows the cursor.
                const right = d.startBox.x + d.startBox.width;
                const w = clamp(
                    Math.round(d.startBox.width + (d.startMx - mx)),
                    LEGEND_MIN_WIDTH,
                    Math.min(LEGEND_MAX_WIDTH, maxW),
                );
                cfg.legend_width_px = w;
                this._writeAnchoredPos(
                    ctx,
                    right - w,
                    d.startBox.y,
                    w,
                    d.startBox.height,
                );
                ctx.repaint(false);
                return;
            }

            case "resize-e":
            case "resize-se": {
                const w = clamp(
                    Math.round(d.startBox.width + (mx - d.startMx)),
                    LEGEND_MIN_WIDTH,
                    Math.min(LEGEND_MAX_WIDTH, maxW),
                );
                cfg.legend_width_px = w;
                const h =
                    d.kind === "resize-se"
                        ? this._applySouthResize(d.startBox, d.startMy, my, ctx)
                        : d.startBox.height;
                this._writeAnchoredPos(ctx, d.startBox.x, d.startBox.y, w, h);
                ctx.repaint(false);
                return;
            }

            case "resize-s": {
                const h = this._applySouthResize(
                    d.startBox,
                    d.startMy,
                    my,
                    ctx,
                );
                this._writeAnchoredPos(
                    ctx,
                    d.startBox.x,
                    d.startBox.y,
                    d.startBox.width,
                    h,
                );
                ctx.repaint(false);
                return;
            }
        }
    }

    /** Bottom-edge resize: new height with the top edge held fixed. */
    private _applySouthResize(
        startBox: PlotRect,
        startMy: number,
        my: number,
        ctx: LegendEventCtx,
    ): number {
        const h = clamp(
            Math.round(startBox.height + (my - startMy)),
            LEGEND_MIN_HEIGHT,
            Math.max(LEGEND_MIN_HEIGHT, ctx.cssHeight - 8),
        );
        ctx.cfg.legend_height_px = h;
        return h;
    }

    private _writeAnchoredPos(
        ctx: LegendEventCtx,
        xPx: number,
        yPx: number,
        w: number,
        h: number,
    ): void {
        const freeW = Math.max(0, ctx.cssWidth - w);
        const freeH = Math.max(0, ctx.cssHeight - h);
        const a = ctx.cfg.legend_anchor;
        ctx.cfg.legend_x = norm(anchorRight(a) ? freeW - xPx : xPx, freeW);
        ctx.cfg.legend_y = norm(anchorBottom(a) ? freeH - yPx : yPx, freeH);
    }

    private _setScroll(next: number, ctx: LegendEventCtx): void {
        const p = this._painted;
        if (!p) {
            return;
        }

        const clamped = clamp(
            next,
            0,
            Math.max(0, p.contentHeight - p.content.height),
        );
        if (clamped !== this._scroll) {
            this._scroll = clamped;
            ctx.repaint(false);
        }
    }

    private static _cursorFor(zone: LegendHitZone): string {
        switch (zone) {
            case "resize-w":
            case "resize-e":
                return "ew-resize";
            case "resize-s":
                return "ns-resize";
            case "resize-se":
                return "nwse-resize";
            case "move":
                return "grab";
            default:
                return "";
        }
    }

    private _setCursor(cursor: string, ctx: LegendEventCtx): void {
        if (cursor !== this._lastCursor) {
            this._lastCursor = cursor;
            ctx.setCursor(cursor);
        }
    }
}

function round4(v: number): number {
    return Math.round(v * 10000) / 10000;
}
