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

import type { InteractionEvent } from "../transport/protocol";

/**
 * Worker-mode counterpart to {@link ZoomRouter}. Captures wheel /
 * pointer events on the GL canvas, normalizes coords to canvas-relative
 * CSS pixels, and emits semantic {@link InteractionEvent}s to the
 * Renderer over its transport. The Renderer (running in a Web Worker)
 * owns the `ZoomController`s and runs the actual hit-test + apply
 * logic — see `applyWheel` / `applyPan` in `zoom-router.ts`.
 *
 * Pointer capture is set on `pointerdown` and released on `pointerup`
 * so drags continue to deliver `pointermove` events when the cursor
 * leaves the canvas, matching the in-process `ZoomRouter` behavior.
 */
export class RawEventForwarder {
    private _element: HTMLElement | null = null;
    private _emit: ((e: InteractionEvent) => void) | null = null;
    private _pointerId: number | null = null;

    private _onWheel: ((e: WheelEvent) => void) | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerUp: ((e: PointerEvent) => void) | null = null;
    private _onPointerLeave: (() => void) | null = null;
    private _onClick: ((e: MouseEvent) => void) | null = null;
    private _onDblClick: ((e: MouseEvent) => void) | null = null;

    attach(element: HTMLElement, emit: (e: InteractionEvent) => void): void {
        this.detach();
        this._element = element;
        this._emit = emit;

        this._onWheel = (e: WheelEvent) => {
            const rect = element.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // Match `ZoomRouter`: only consume the wheel event if the
            // cursor is over the canvas. `preventDefault` is fired
            // unconditionally so the page does not scroll while the
            // chart is hovered — the worker may still no-op if the
            // cursor is outside any facet's plot rect.
            e.preventDefault();
            emit({ type: "wheel", mx, my, deltaY: e.deltaY });
        };

        this._onPointerDown = (e: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            element.setPointerCapture(e.pointerId);
            this._pointerId = e.pointerId;
            emit({ type: "pointerdown", mx, my, pointerId: e.pointerId });
        };

        this._onPointerMove = (e: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            emit({ type: "pointermove", mx, my });
        };

        this._onPointerUp = (e: PointerEvent) => {
            if (this._pointerId !== null) {
                try {
                    element.releasePointerCapture(this._pointerId);
                } catch {
                    // capture may have already been released
                }

                this._pointerId = null;
            }

            void e;
            emit({ type: "pointerup" });
        };

        // Pointerleave gives the renderer a single signal that the
        // cursor truly exited the canvas — used for tooltip dismissal.
        // Hover + drag both ride the `pointermove` stream above, so no
        // parallel `mousemove` channel exists.
        this._onPointerLeave = () => {
            emit({ type: "pointerleave" });
        };

        this._onClick = (e: MouseEvent) => {
            const rect = element.getBoundingClientRect();
            emit({
                type: "click",
                mx: e.clientX - rect.left,
                my: e.clientY - rect.top,
            });
        };

        this._onDblClick = (e: MouseEvent) => {
            const rect = element.getBoundingClientRect();
            emit({
                type: "dblclick",
                mx: e.clientX - rect.left,
                my: e.clientY - rect.top,
            });
        };

        element.addEventListener("wheel", this._onWheel, { passive: false });
        element.addEventListener("pointerdown", this._onPointerDown);
        element.addEventListener("pointermove", this._onPointerMove);
        element.addEventListener("pointerup", this._onPointerUp);
        element.addEventListener("pointerleave", this._onPointerLeave);
        element.addEventListener("click", this._onClick);
        element.addEventListener("dblclick", this._onDblClick);
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

            if (this._onPointerLeave) {
                this._element.removeEventListener(
                    "pointerleave",
                    this._onPointerLeave,
                );
            }

            if (this._onClick) {
                this._element.removeEventListener("click", this._onClick);
            }

            if (this._onDblClick) {
                this._element.removeEventListener("dblclick", this._onDblClick);
            }
        }

        this._element = null;
        this._emit = null;
        this._pointerId = null;
        this._onPointerLeave = null;
        this._onClick = null;
        this._onDblClick = null;
    }
}
