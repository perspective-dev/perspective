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

    // Opt-in "pin" flags. When set, `setBaseDomain` preserves the
    // axis's *absolute* visible center across a base swap — the
    // pre-existing rebase math. Default-cleared: data updates "follow"
    // (preserve normalized translate, so the visible window tracks the
    // data fractionally). Wire to a paused-frame review feature when
    // one exists; no current caller flips these.
    private _xPinned = false;
    private _yPinned = false;

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

    // Per-controller mutators used by `applyWheel` / `applyPan`
    // (zoom-router.ts) for the facet-aware zoom path.
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
     * Update the base (full-data) domain. Each axis is handled
     * independently:
     *
     *  - If the axis is at default (no user pan or zoom on this axis),
     *    just swap the new base in — no further math needed.
     *  - If the axis has been explicitly *pinned* (`pinAxis("x" | "y")`),
     *    preserve its *absolute* visible center across the swap:
     *    re-solve `_normT` so the data-space center is unchanged.
     *    This is paused-frame-review semantics — the user has marked a
     *    region of interest and wants it to stay put even as new data
     *    flows in. No current caller pins, but the API is here so the
     *    default rule below doesn't bake the choice in.
     *  - Otherwise (the default — "follow"): keep `_normT` as-is and
     *    just swap the new base. The visible window's *fractional*
     *    position is preserved, so sliding windows slide with the data
     *    and extending windows grow proportionally with the data.
     *
     * Per-axis handling matters because `_scaleX/_normTX` and
     * `_scaleY/_normTY` are independent. A user who panned X to scroll
     * through time should not force Y onto the rebase path — Y data
     * updates should still flow through cleanly.
     */
    setBaseDomain(
        xMin: number,
        xMax: number,
        yMin: number,
        yMax: number,
    ): void {
        const newRangeX = xMax - xMin;
        if (this.isXDefault() || !this._xPinned) {
            this._baseXMin = xMin;
            this._baseXMax = xMax;
        } else {
            const oldRangeX = this._baseXMax - this._baseXMin;
            const oldCx =
                (this._baseXMin + this._baseXMax) / 2 +
                this._normTX * oldRangeX;
            this._baseXMin = xMin;
            this._baseXMax = xMax;
            this._normTX =
                newRangeX > 0 ? (oldCx - (xMin + xMax) / 2) / newRangeX : 0;
        }

        const newRangeY = yMax - yMin;
        if (this.isYDefault() || !this._yPinned) {
            this._baseYMin = yMin;
            this._baseYMax = yMax;
        } else {
            const oldRangeY = this._baseYMax - this._baseYMin;
            const oldCy =
                (this._baseYMin + this._baseYMax) / 2 +
                this._normTY * oldRangeY;
            this._baseYMin = yMin;
            this._baseYMax = yMax;
            this._normTY =
                newRangeY > 0 ? (oldCy - (yMin + yMax) / 2) / newRangeY : 0;
        }
    }

    /**
     * Mark an axis as "pinned" so subsequent `setBaseDomain` calls
     * preserve its *absolute* visible center (paused-frame-review
     * semantics). Default-cleared on construction; both axes follow
     * data growth fractionally until explicitly pinned.
     */
    pinAxis(axis: "x" | "y"): void {
        if (axis === "x") {
            this._xPinned = true;
        } else {
            this._yPinned = true;
        }
    }

    unpinAxis(axis: "x" | "y"): void {
        if (axis === "x") {
            this._xPinned = false;
        } else {
            this._yPinned = false;
        }
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

    isXDefault(): boolean {
        return this._scaleX === 1 && this._normTX === 0;
    }

    isYDefault(): boolean {
        return this._scaleY === 1 && this._normTY === 0;
    }

    isDefault(): boolean {
        return this.isXDefault() && this.isYDefault();
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

            // Cursor position as a fraction of the plot rect — the
            // anchor point that should stay visually fixed across the
            // zoom mutation below. `fracY` is 0 at top, 1 at bottom
            // (screen coords); Y data axis is inverted, hence the
            // `0.5 - fracY` form below.
            const fracX = (mouseX - plot.x) / plot.width;
            const fracY = (mouseY - plot.y) / plot.height;
            const oldScaleX = this._scaleX;
            const oldScaleY = this._scaleY;

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

            // Cursor-anchored zoom: keep the data point under the
            // cursor visually fixed. Derivation, for X:
            //   dataX(scale) = mid + normTX*baseRange
            //                + (fracX - 0.5) * baseRange/scale
            // After mutating scale (normTX unchanged), the cursor data
            // coord shifts. Re-anchoring is `normTX +=
            // (oldDataX - newDataX) / baseRange`; the `baseRange`
            // terms cancel to:
            //   normTXDelta = (fracX - 0.5) * (1/oldScale - 1/newScale)
            // Base-independent — a concurrent `setBaseDomain` mid-
            // handler can't corrupt the anchor math. Y axis is screen-
            // inverted, hence `(0.5 - fracY)`.
            if (this._lockAxis !== "x" && oldScaleX !== this._scaleX) {
                this._normTX +=
                    (fracX - 0.5) * (1 / oldScaleX - 1 / this._scaleX);
            }

            if (this._lockAxis !== "y" && oldScaleY !== this._scaleY) {
                this._normTY +=
                    (0.5 - fracY) * (1 / oldScaleY - 1 / this._scaleY);
            }

            this._onUpdate!();
        };

        this._onPointerDown = (e: PointerEvent) => {
            // Only the primary (left) button starts a pan. Right/middle clicks
            // must fall through so the panel's `contextmenu` handler can open
            // the menu — capturing the pointer here would otherwise swallow the
            // right-click.
            if (e.button !== 0) {
                return;
            }

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

            // Pan as a fraction is `dx / (plotWidth * scaleX)` —
            // independent of the current base range. The chained form
            // (`pixels → data delta → fraction-of-base`) cancels the
            // `baseRange` terms algebraically; computing the cancelled
            // form directly means a concurrent `setBaseDomain` swap
            // mid-gesture cannot corrupt the pan math.
            const plot = this._layout!.plotRect;
            if (this._lockAxis !== "x" && plot.width > 0) {
                this._normTX -= dx / (plot.width * this._scaleX);
            }

            if (this._lockAxis !== "y" && plot.height > 0) {
                this._normTY += dy / (plot.height * this._scaleY);
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
