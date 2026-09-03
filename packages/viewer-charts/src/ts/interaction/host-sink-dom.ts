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
import {
    DEFAULT_TOOLTIP_STYLE,
    NUMERIC_RE,
    TOOLTIP_COL_GAP,
    type TooltipContent,
    type TooltipStyle,
} from "./tooltip-grid";

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
        grid: TooltipContent,
        pos: { px: number; py: number },
        bounds: CssBounds,
        style: TooltipStyle = DEFAULT_TOOLTIP_STYLE,
    ): void {
        this.dismiss();
        const div = document.createElement("div");

        div.className = "webgl-tooltip";
        div.style.maxHeight = `${Math.round(bounds.cssHeight * 0.6)}px`;
        renderTooltipGridDom(div, grid, style);

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

function renderTooltipGridDom(
    root: HTMLDivElement,
    grid: TooltipContent,
    style: TooltipStyle,
): void {
    const ncols = grid.reduce((n, row) => Math.max(n, row.length), 0);
    root.style.display = "grid";
    root.style.gridTemplateColumns = `repeat(${Math.max(1, ncols)}, minmax(0, max-content))`;
    root.style.columnGap = `${TOOLTIP_COL_GAP}px`;
    if (style.opacity < 1) {
        const pct = Math.max(0, Math.round(style.opacity * 100));
        root.style.background = `color-mix(in srgb, var(--psp-charts--tooltip--background) ${pct}%, transparent)`;
    }

    const rightAlign: boolean[] = [];
    for (const row of grid) {
        if (row.length <= 1) {
            continue;
        }

        for (let j = 1; j < row.length; j++) {
            if (row[j] === "") {
                continue;
            }

            const numeric = NUMERIC_RE.test(row[j]);
            rightAlign[j] =
                rightAlign[j] === undefined
                    ? numeric
                    : rightAlign[j] && numeric;
        }
    }

    for (const row of grid) {
        const span = row.length <= 1;
        for (let j = 0; j < Math.max(1, row.length); j++) {
            const cell = document.createElement("div");
            cell.textContent = row[j] ?? "";
            cell.style.maxWidth = `${style.maxColumnPx * (span ? 2 : 1)}px`;
            cell.style.overflow = "hidden";
            cell.style.textOverflow = "ellipsis";
            cell.style.whiteSpace = "nowrap";
            if (span) {
                cell.style.gridColumn = "1 / -1";
            } else if (rightAlign[j]) {
                cell.style.textAlign = "right";
            }

            root.appendChild(cell);
            if (span) {
                break;
            }
        }
    }
}
