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

import type { CssBounds, HostSink } from "./tooltip-controller";

/**
 * Host-side `HostSink` that materializes pinned tooltips as a `<div>`
 * next to the GL canvas, and applies cursor changes to the canvas's
 * own `style.cursor`. Host-only — depends on `document` /
 * `getComputedStyle`.
 */
export class DomHostSink implements HostSink {
    private _glCanvas: HTMLCanvasElement;
    private _parent: HTMLElement;
    private _div: HTMLDivElement | null = null;

    constructor(glCanvas: HTMLCanvasElement, parent: HTMLElement) {
        this._glCanvas = glCanvas;
        this._parent = parent;
    }

    pin(
        lines: string[],
        pos: { px: number; py: number },
        bounds: CssBounds,
    ): void {
        this.dismiss();
        const div = document.createElement("div");

        div.className = "webgl-tooltip";
        div.style.maxHeight = `${Math.round(bounds.cssHeight * 0.6)}px`;
        div.textContent = lines.join("\n");

        if (getComputedStyle(this._parent).position === "static") {
            this._parent.style.position = "relative";
        }

        div.style.left = "-9999px";
        div.style.top = "0px";
        this._parent.appendChild(div);
        this._div = div;
        const divW = div.getBoundingClientRect().width;
        const divH = div.getBoundingClientRect().height;
        let tx = pos.px + 12;
        let ty = pos.py - divH - 8;
        if (tx + divW > bounds.cssWidth) {
            tx = pos.px - divW - 12;
        }

        if (tx < 0) {
            tx = 4;
        }

        if (ty < 0) {
            ty = pos.py + 12;
        }

        if (ty + divH > bounds.cssHeight) {
            ty = bounds.cssHeight - divH - 4;
        }

        div.style.left = `${tx}px`;
        div.style.top = `${ty}px`;
    }

    dismiss(): void {
        if (this._div) {
            this._div.remove();
            this._div = null;
        }
    }

    setCursor(cursor: string): void {
        this._glCanvas.style.cursor = cursor;
    }
}
