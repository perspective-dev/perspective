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

export interface ZoomState {
    scaleX: number;
    scaleY: number;

    // Translate as fraction of base domain range (0 = centered, ±0.5 = edge)
    normTranslateX: number;
    normTranslateY: number;
}

/**
 * Runtime config for `ZoomController`. Not part of `ZoomState` — wired
 * by the owning chart at construction, not serialized with zoom level.
 *
 * `lockAxis` pins one axis at `scale=1, translate=0` and suppresses
 * wheel / pan updates on that axis, leaving the other axis fully
 * zoomable. Categorical axes are the typical candidates.
 *
 * `lockAspect` keeps `dataPerPixel` equal on both axes by padding the
 * narrower axis of the rendered domain to match the plot rect's aspect
 * ratio. Required by map plugins (Mercator preserves local angle, so
 * map glyphs distort under independent X/Y zoom), and useful for any
 * cartesian view where stretching points along one axis would lie
 * about the data.
 */
export interface ZoomConfig {
    lockAxis?: "x" | "y" | null;
    lockAspect?: boolean;
}

export const MAX_ZOOM = 100_000;
export const MIN_ZOOM = 1;

/**
 * Pad the narrower axis of `domain` so its aspect ratio matches
 * `plotRect`. Preserves the center of each axis and the longer axis's
 * extent — only the shorter axis grows. Returns the input unmodified
 * if either dimension is non-positive.
 *
 * Used by `lockAspect` mode to keep `dataPerPixel` equal on both axes,
 * which is what map plugins (Mercator) and any "square pixel" view
 * require.
 */
function applyAspectLock(
    domain: { xMin: number; xMax: number; yMin: number; yMax: number },
    plotRect: { width: number; height: number },
): { xMin: number; xMax: number; yMin: number; yMax: number } {
    if (plotRect.width <= 0 || plotRect.height <= 0) {
        return domain;
    }

    const xRange = domain.xMax - domain.xMin;
    const yRange = domain.yMax - domain.yMin;
    if (xRange <= 0 || yRange <= 0) {
        return domain;
    }

    const plotAspect = plotRect.width / plotRect.height;
    const dataAspect = xRange / yRange;

    if (dataAspect < plotAspect) {
        const cx = (domain.xMin + domain.xMax) / 2;
        const newX = (yRange * plotAspect) / 2;
        return {
            xMin: cx - newX,
            xMax: cx + newX,
            yMin: domain.yMin,
            yMax: domain.yMax,
        };
    } else {
        const cy = (domain.yMin + domain.yMax) / 2;
        const newY = xRange / plotAspect / 2;
        return {
            xMin: domain.xMin,
            xMax: domain.xMax,
            yMin: cy - newY,
            yMax: cy + newY,
        };
    }
}

export class ZoomController {
    private _scaleX = 1;
    private _scaleY = 1;

    // Normalized translate: fraction of base domain range
    private _normTX = 0;
    private _normTY = 0;

    private _baseXMin = 0;
    private _baseXMax = 1;
    private _baseYMin = 0;
    private _baseYMax = 1;

    private _lockAxis: "x" | "y" | null = null;
    private _lockAspect = false;

    private _element: HTMLElement | null = null;
    private _layout: PlotLayout | null = null;
    private _onUpdate: (() => void) | null = null;

    private _pointerDown = false;
    private _lastPointerX = 0;
    private _lastPointerY = 0;

    private _onWheel: ((e: WheelEvent) => void) | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerUp: ((e: PointerEvent) => void) | null = null;

    // Per-controller mutators used by `ZoomRouter` to apply wheel/pan
    // events without going through `attach`. Live below under "Router
    // helpers" for the facet-aware zoom path.
    get lockedAxis(): "x" | "y" | null {
        return this._lockAxis;
    }
    get scaleX(): number {
        return this._scaleX;
    }
    get scaleY(): number {
        return this._scaleY;
    }
    set scaleX(v: number) {
        this._scaleX = v;
    }
    set scaleY(v: number) {
        this._scaleY = v;
    }
    get normTranslateX(): number {
        return this._normTX;
    }
    get normTranslateY(): number {
        return this._normTY;
    }
    set normTranslateX(v: number) {
        this._normTX = v;
    }
    set normTranslateY(v: number) {
        this._normTY = v;
    }
    get baseXRange(): number {
        return this._baseXMax - this._baseXMin;
    }
    get baseYRange(): number {
        return this._baseYMax - this._baseYMin;
    }

    /**
     * Update the base (full-data) domain that this controller's
     * normalized translate is interpreted against, while preserving
     * the *absolute* center of any user-applied pan.
     *
     * `_normTX` / `_normTY` are stored as fractions of the base
     * range, not absolute coordinates. A naive "swap base, keep
     * normTranslate" update reinterprets the same fraction against a
     * new range, so when an external `draw()` updates the extent
     * (via `processCartesianChunk` → `setZoomBaseDomain`) the user's
     * pan-offset visible center jumps to a different absolute
     * position. With concurrent pan events feeding in offsets that
     * were computed against the old base, the jump can project the
     * visible center past the data entirely, leaving `_fullRender`
     * to draw zero glyphs onto a freshly-cleared canvas — a blank
     * bitmap reaches the host as a flicker.
     *
     * When the user is in default state (no pan, no zoom — fresh
     * controller, or just-reset), no rebase is needed; just swap the
     * base and let the chart auto-fit to the new data. Otherwise
     * recompute `_normTX` / `_normTY` so the visible center stays at
     * the same absolute (data-coordinate) position before and after
     * the swap.
     */
    setBaseDomain(
        xMin: number,
        xMax: number,
        yMin: number,
        yMax: number,
    ): void {
        if (this.isDefault()) {
            this._baseXMin = xMin;
            this._baseXMax = xMax;
            this._baseYMin = yMin;
            this._baseYMax = yMax;
            return;
        }

        const oldRangeX = this._baseXMax - this._baseXMin;
        const oldRangeY = this._baseYMax - this._baseYMin;
        const oldCx =
            (this._baseXMin + this._baseXMax) / 2 + this._normTX * oldRangeX;
        const oldCy =
            (this._baseYMin + this._baseYMax) / 2 + this._normTY * oldRangeY;

        this._baseXMin = xMin;
        this._baseXMax = xMax;
        this._baseYMin = yMin;
        this._baseYMax = yMax;

        const newRangeX = xMax - xMin;
        const newRangeY = yMax - yMin;
        this._normTX =
            newRangeX > 0 ? (oldCx - (xMin + xMax) / 2) / newRangeX : 0;
        this._normTY =
            newRangeY > 0 ? (oldCy - (yMin + yMax) / 2) / newRangeY : 0;
    }

    /**
     * Apply config. Called once by the chart during `setZoomController`.
     * Locking an axis snaps its `scale`/`translate` to identity so any
     * pre-existing state on that axis is cleared; subsequent wheel /
     * pan events leave the locked axis alone.
     */
    configure(config: ZoomConfig): void {
        this._lockAxis = config.lockAxis ?? null;
        this._lockAspect = config.lockAspect ?? false;
        if (this._lockAxis === "x") {
            this._scaleX = 1;
            this._normTX = 0;
        } else if (this._lockAxis === "y") {
            this._scaleY = 1;
            this._normTY = 0;
        }
    }

    isDefault(): boolean {
        return (
            this._scaleX === 1 &&
            this._scaleY === 1 &&
            this._normTX === 0 &&
            this._normTY === 0
        );
    }

    getVisibleDomain(): {
        xMin: number;
        xMax: number;
        yMin: number;
        yMax: number;
    } {
        const bxRange = this._baseXMax - this._baseXMin;
        const byRange = this._baseYMax - this._baseYMin;
        const vxRange = bxRange / this._scaleX;
        const vyRange = byRange / this._scaleY;

        // Center = base midpoint + normalized translate * base range
        const cx =
            (this._baseXMin + this._baseXMax) / 2 + this._normTX * bxRange;
        const cy =
            (this._baseYMin + this._baseYMax) / 2 + this._normTY * byRange;

        const domain = {
            xMin: cx - vxRange / 2,
            xMax: cx + vxRange / 2,
            yMin: cy - vyRange / 2,
            yMax: cy + vyRange / 2,
        };

        if (this._lockAspect && this._layout) {
            return applyAspectLock(domain, this._layout.plotRect);
        }

        return domain;
    }

    attach(
        element: HTMLElement,
        layout: PlotLayout,
        onUpdate: () => void,
    ): void {
        this.detach();
        this._element = element;
        this._layout = layout;
        this._onUpdate = onUpdate;

        this._onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = element.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const plot = this._layout!.plotRect;

            if (
                mouseX < plot.x ||
                mouseX > plot.x + plot.width ||
                mouseY < plot.y ||
                mouseY > plot.y + plot.height
            ) {
                return;
            }

            // Data coordinate under cursor before zoom
            const domain = this.getVisibleDomain();
            const dataX =
                domain.xMin +
                ((mouseX - plot.x) / plot.width) * (domain.xMax - domain.xMin);
            const dataY =
                domain.yMax -
                ((mouseY - plot.y) / plot.height) * (domain.yMax - domain.yMin);

            // Zoom factor — skip the locked axis so its scale stays
            // pinned at 1.
            const factor = Math.pow(1.1, -e.deltaY / 100);
            if (this._lockAxis !== "x") {
                this._scaleX = Math.max(
                    MIN_ZOOM,
                    Math.min(MAX_ZOOM, this._scaleX * factor),
                );
            }

            if (this._lockAxis !== "y") {
                this._scaleY = Math.max(
                    MIN_ZOOM,
                    Math.min(MAX_ZOOM, this._scaleY * factor),
                );
            }

            // Adjust translate so the data point under cursor stays put
            const newDomain = this.getVisibleDomain();
            const newDataX =
                newDomain.xMin +
                ((mouseX - plot.x) / plot.width) *
                    (newDomain.xMax - newDomain.xMin);
            const newDataY =
                newDomain.yMax -
                ((mouseY - plot.y) / plot.height) *
                    (newDomain.yMax - newDomain.yMin);

            const bxRange = this._baseXMax - this._baseXMin;
            const byRange = this._baseYMax - this._baseYMin;
            if (this._lockAxis !== "x" && bxRange > 0) {
                this._normTX += (dataX - newDataX) / bxRange;
            }

            if (this._lockAxis !== "y" && byRange > 0) {
                this._normTY += (dataY - newDataY) / byRange;
            }

            this._onUpdate!();
        };

        this._onPointerDown = (e: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const plot = this._layout!.plotRect;

            if (
                mouseX >= plot.x &&
                mouseX <= plot.x + plot.width &&
                mouseY >= plot.y &&
                mouseY <= plot.y + plot.height
            ) {
                this._pointerDown = true;
                this._lastPointerX = e.clientX;
                this._lastPointerY = e.clientY;
                element.setPointerCapture(e.pointerId);
            }
        };

        this._onPointerMove = (e: PointerEvent) => {
            if (!this._pointerDown) {
                return;
            }

            const dx = e.clientX - this._lastPointerX;
            const dy = e.clientY - this._lastPointerY;
            this._lastPointerX = e.clientX;
            this._lastPointerY = e.clientY;

            const domain = this.getVisibleDomain();
            const plot = this._layout!.plotRect;
            const dataPerPixelX = (domain.xMax - domain.xMin) / plot.width;
            const dataPerPixelY = (domain.yMax - domain.yMin) / plot.height;

            const bxRange = this._baseXMax - this._baseXMin;
            const byRange = this._baseYMax - this._baseYMin;
            if (this._lockAxis !== "x" && bxRange > 0) {
                this._normTX -= (dx * dataPerPixelX) / bxRange;
            }

            if (this._lockAxis !== "y" && byRange > 0) {
                this._normTY += (dy * dataPerPixelY) / byRange;
            }

            this._onUpdate!();
        };

        this._onPointerUp = () => {
            this._pointerDown = false;
        };

        element.addEventListener("wheel", this._onWheel, { passive: false });
        element.addEventListener("pointerdown", this._onPointerDown);
        element.addEventListener("pointermove", this._onPointerMove);
        element.addEventListener("pointerup", this._onPointerUp);
    }

    updateLayout(layout: PlotLayout): void {
        this._layout = layout;
    }

    detach(): void {
        if (this._element) {
            if (this._onWheel) {
                this._element.removeEventListener("wheel", this._onWheel);
            }

            if (this._onPointerDown) {
                this._element.removeEventListener(
                    "pointerdown",
                    this._onPointerDown,
                );
            }

            if (this._onPointerMove) {
                this._element.removeEventListener(
                    "pointermove",
                    this._onPointerMove,
                );
            }

            if (this._onPointerUp) {
                this._element.removeEventListener(
                    "pointerup",
                    this._onPointerUp,
                );
            }
        }

        this._element = null;
        this._onUpdate = null;
    }

    reset(): void {
        this._scaleX = 1;
        this._scaleY = 1;
        this._normTX = 0;
        this._normTY = 0;
    }

    serialize(): ZoomState {
        return {
            scaleX: this._scaleX,
            scaleY: this._scaleY,
            normTranslateX: this._normTX,
            normTranslateY: this._normTY,
        };
    }

    restore(state: ZoomState): void {
        this._scaleX = state.scaleX;
        this._scaleY = state.scaleY;
        this._normTX = state.normTranslateX;
        this._normTY = state.normTranslateY;
    }
}
