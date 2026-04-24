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
import { MAX_ZOOM, MIN_ZOOM, type ZoomController } from "./zoom-controller";

/**
 * Resolver that maps a cursor position to `{ controller, layout }` —
 * returns `null` when the cursor is not inside any facet. In
 * independent-zoom mode the facet under the cursor owns its events; in
 * shared-zoom mode the resolver always returns the same controller for
 * every plot rect in the grid.
 */
export interface ZoomTarget {
    controller: ZoomController;
    layout: PlotLayout;
}
export type ZoomTargetResolver = (mx: number, my: number) => ZoomTarget | null;

/**
 * One set of wheel / pointer listeners on the GL canvas that dispatches
 * zoom + pan events to a {@link ZoomController} resolved from the
 * cursor position. Replaces `ZoomController.attach` so multiple
 * controllers (one per facet) can coexist on a single canvas.
 */
export class ZoomRouter {
    private _element: HTMLElement | null = null;
    private _resolve: ZoomTargetResolver | null = null;
    private _onUpdate: (() => void) | null = null;

    private _pointerDown = false;
    private _pointerTarget: ZoomTarget | null = null;
    private _lastPointerX = 0;
    private _lastPointerY = 0;

    private _onWheel: ((e: WheelEvent) => void) | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerUp: ((e: PointerEvent) => void) | null = null;

    attach(
        element: HTMLElement,
        resolve: ZoomTargetResolver,
        onUpdate: () => void,
    ): void {
        this.detach();
        this._element = element;
        this._resolve = resolve;
        this._onUpdate = onUpdate;

        this._onWheel = (e: WheelEvent) => {
            const rect = element.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const target = resolve(mouseX, mouseY);
            if (!target) return;
            e.preventDefault();
            applyWheel(target, mouseX, mouseY, e.deltaY);
            onUpdate();
        };

        this._onPointerDown = (e: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const target = resolve(mouseX, mouseY);
            if (!target) return;
            this._pointerDown = true;
            this._pointerTarget = target;
            this._lastPointerX = e.clientX;
            this._lastPointerY = e.clientY;
            element.setPointerCapture(e.pointerId);
        };

        this._onPointerMove = (e: PointerEvent) => {
            if (!this._pointerDown || !this._pointerTarget) return;
            const dx = e.clientX - this._lastPointerX;
            const dy = e.clientY - this._lastPointerY;
            this._lastPointerX = e.clientX;
            this._lastPointerY = e.clientY;
            applyPan(this._pointerTarget, dx, dy);
            onUpdate();
        };

        this._onPointerUp = () => {
            this._pointerDown = false;
            this._pointerTarget = null;
        };

        element.addEventListener("wheel", this._onWheel, { passive: false });
        element.addEventListener("pointerdown", this._onPointerDown);
        element.addEventListener("pointermove", this._onPointerMove);
        element.addEventListener("pointerup", this._onPointerUp);
    }

    detach(): void {
        if (this._element) {
            if (this._onWheel)
                this._element.removeEventListener("wheel", this._onWheel);
            if (this._onPointerDown)
                this._element.removeEventListener(
                    "pointerdown",
                    this._onPointerDown,
                );
            if (this._onPointerMove)
                this._element.removeEventListener(
                    "pointermove",
                    this._onPointerMove,
                );
            if (this._onPointerUp)
                this._element.removeEventListener(
                    "pointerup",
                    this._onPointerUp,
                );
        }
        this._element = null;
        this._resolve = null;
        this._onUpdate = null;
        this._pointerDown = false;
        this._pointerTarget = null;
    }
}

function applyWheel(
    target: ZoomTarget,
    mouseX: number,
    mouseY: number,
    deltaY: number,
): void {
    const { controller, layout } = target;
    const plot = layout.plotRect;

    const domain = controller.getVisibleDomain();
    const dataX =
        domain.xMin +
        ((mouseX - plot.x) / plot.width) * (domain.xMax - domain.xMin);
    const dataY =
        domain.yMax -
        ((mouseY - plot.y) / plot.height) * (domain.yMax - domain.yMin);

    const factor = Math.pow(1.1, -deltaY / 100);
    const locked = controller.lockedAxis;
    if (locked !== "x") {
        controller.scaleX = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, controller.scaleX * factor),
        );
    }
    if (locked !== "y") {
        controller.scaleY = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, controller.scaleY * factor),
        );
    }

    const newDomain = controller.getVisibleDomain();
    const newDataX =
        newDomain.xMin +
        ((mouseX - plot.x) / plot.width) * (newDomain.xMax - newDomain.xMin);
    const newDataY =
        newDomain.yMax -
        ((mouseY - plot.y) / plot.height) * (newDomain.yMax - newDomain.yMin);

    const bxRange = controller.baseXRange;
    const byRange = controller.baseYRange;
    if (locked !== "x" && bxRange > 0) {
        controller.normTranslateX += (dataX - newDataX) / bxRange;
    }
    if (locked !== "y" && byRange > 0) {
        controller.normTranslateY += (dataY - newDataY) / byRange;
    }
}

function applyPan(target: ZoomTarget, dx: number, dy: number): void {
    const { controller, layout } = target;
    const domain = controller.getVisibleDomain();
    const plot = layout.plotRect;
    const dataPerPixelX = (domain.xMax - domain.xMin) / plot.width;
    const dataPerPixelY = (domain.yMax - domain.yMin) / plot.height;

    const locked = controller.lockedAxis;
    const bxRange = controller.baseXRange;
    const byRange = controller.baseYRange;
    if (locked !== "x" && bxRange > 0) {
        controller.normTranslateX -= (dx * dataPerPixelX) / bxRange;
    }
    if (locked !== "y" && byRange > 0) {
        controller.normTranslateY += (dy * dataPerPixelY) / byRange;
    }
}
