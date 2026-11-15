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

import type {
    CommandSpec,
    HTMLPerspectiveViewerElement,
    PerspectiveCommands,
} from "@perspective-dev/viewer";
import type { ChartHit } from "../event-detail.ts";
import type { CssBounds, HostSink } from "./tooltip-controller.ts";
import {
    DEFAULT_TOOLTIP_STYLE,
    NUMERIC_RE,
    TOOLTIP_COL_GAP,
    type TooltipContent,
    type TooltipStyle,
} from "./tooltip-grid.ts";

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
    private _hit: ChartHit | null = null;

    /** `plugin_config.tooltip_commands`: whether pins carry command buttons. */
    commandsEnabled = true;

    constructor(glCanvas: HTMLCanvasElement, parent: HTMLElement) {
        this._glCanvas = glCanvas;
        this._parent = parent;
    }

    /** The plugin element hosting the canvas, which identifies its panel. */
    private _plugin(): HTMLElement | null {
        const root = this._glCanvas.getRootNode();
        return root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
    }

    private _viewer(): HTMLPerspectiveViewerElement | null {
        return (this._plugin()?.parentElement ??
            null) as HTMLPerspectiveViewerElement | null;
    }

    /**
     * The app's commands for the pinned mark, or `undefined` when the
     * `"chart-tooltip"` scope is off or the host is too old to ask.
     */
    private _queryCommands(hit: ChartHit): PerspectiveCommands | undefined {
        const plugin = this._plugin();
        const viewer = this._viewer();
        if (!plugin || !viewer?.queryCommands) {
            return undefined;
        }

        return viewer.queryCommands(plugin, "chart-tooltip", hit.frame, [
            hit.ref,
        ])?.[0];
    }

    private _renderCommands(div: HTMLDivElement, hit: ChartHit | null): void {
        let row = div.querySelector(
            `:scope > .${COMMANDS_CLASS}`,
        ) as CommandRow | null;

        const result =
            hit && this.commandsEnabled ? this._queryCommands(hit) : undefined;
        if (!result || result.commands.length === 0) {
            row?.remove();
            return;
        }

        const specs = JSON.stringify(result.commands);
        if (row && row[SPECS_KEY] === specs) {
            for (const button of Array.from(row.children)) {
                (button as CommandButton)[RESULT_KEY] = result;
            }

            return;
        }

        const viewer = this._viewer()!;
        if (!row) {
            row = document.createElement("div") as CommandRow;
            row.className = COMMANDS_CLASS;
            row.style.gridColumn = "1 / -1";
            div.appendChild(row);
        }

        row.replaceChildren();
        for (const spec of result.commands) {
            row.appendChild(commandButton(spec, result, viewer));
        }

        row[SPECS_KEY] = specs;
    }

    /** Re-query and swap the pinned tooltip's buttons, with no redraw. */
    refreshCommands(): void {
        if (this._div) {
            this._renderCommands(this._div, this._hit);
        }
    }

    pin(
        grid: TooltipContent,
        pos: { px: number; py: number },
        bounds: CssBounds,
        style: TooltipStyle = DEFAULT_TOOLTIP_STYLE,
        hit?: ChartHit,
    ): void {
        const div = this._div ?? document.createElement("div");
        const commands = div.querySelector(`:scope > .${COMMANDS_CLASS}`);
        for (const child of Array.from(div.children)) {
            if (child !== commands) {
                child.remove();
            }
        }

        div.className = "webgl-tooltip";
        div.style.maxHeight = `${Math.round(bounds.cssHeight * 0.6)}px`;
        renderTooltipGridDom(div, grid, style, commands);

        this._hit = hit ?? null;
        this._renderCommands(div, this._hit);

        if (getComputedStyle(this._parent).position === "static") {
            this._parent.style.position = "relative";
        }

        div.style.left = "-9999px";
        div.style.top = "0px";
        if (!this._div) {
            this._parent.appendChild(div);
            this._div = div;
        }

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

        this._hit = null;
    }

    setCursor(cursor: string): void {
        this._glCanvas.style.cursor = cursor;
    }
}

function renderTooltipGridDom(
    root: HTMLDivElement,
    grid: TooltipContent,
    style: TooltipStyle,
    before: Element | null = null,
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

            root.insertBefore(cell, before);
            if (span) {
                break;
            }
        }
    }
}

const COMMANDS_CLASS = "webgl-tooltip-commands";
const SPECS_KEY = Symbol("Perspective Command Specs");
const RESULT_KEY = Symbol("Perspective Command Result");

interface CommandRow extends HTMLDivElement {
    [SPECS_KEY]?: string;
}

interface CommandButton extends HTMLButtonElement {
    [RESULT_KEY]?: PerspectiveCommands;
}

function commandButton(
    spec: CommandSpec,
    result: PerspectiveCommands,
    viewer: HTMLPerspectiveViewerElement,
): HTMLButtonElement {
    const button = document.createElement("button") as CommandButton;
    button[RESULT_KEY] = result;
    button.className = "psp-command-button";
    button.type = "button";
    button.dataset.key = spec.key;
    button.title = (spec.kind === "Command" && spec.title) || spec.label;
    button.textContent = spec.label;
    if (spec.kind === "Command" && spec.icon) {
        button.dataset.icon = spec.icon;
        button.style.setProperty(
            "--psp-command-button--mask-image",
            `var(--psp-icon--${spec.icon}--mask-image)`,
        );
    }

    if (spec.kind === "Command" && spec.disabled) {
        button.disabled = true;
    }

    button.addEventListener("click", (event) => {
        event.stopPropagation();
        const context = (button[RESULT_KEY] ?? result).context;
        if (spec.kind === "Group") {
            void viewer.showCommandMenu(context, spec.commands, {
                x: event.clientX,
                y: event.clientY,
            });
        } else {
            viewer.invokeCommand(spec.key, context);
        }
    });

    for (const type of ["pointerdown", "mousedown", "mouseup", "dblclick"]) {
        button.addEventListener(type, (event) => event.stopPropagation());
    }

    return button;
}
