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

import type { CellScalar } from "regular-table/dist/esm/types.js";
import type { RegularTableElement } from "regular-table";
import type {
    CommandSpec,
    HTMLPerspectiveViewerElement,
    PerspectiveCommandLocation,
    PerspectiveCommands,
    PerspectiveHitRef,
    PerspectiveViewFrame,
} from "@perspective-dev/viewer";
import type { DatagridModel, DatagridPluginElement } from "./types.ts";

/** The sentinel path of the synthetic trailing command column. */
export const COMMAND_COLUMN_PATH = "__COMMANDS__";

export const COMMAND_CELL_CLASS = "psp-command-cell";
export const COMMAND_BUTTON_CLASS = "psp-command-button";

const CONTEXT_KEY = Symbol("Perspective Command Context");
const SPECS_KEY = Symbol("Perspective Command Specs");

interface CommandButton extends HTMLButtonElement {
    [CONTEXT_KEY]?: PerspectiveCommands;
}

interface CommandBlock extends HTMLElement {
    [SPECS_KEY]?: string;
}

/**
 * The viewport read the data listener just made, in the shape the viewer's
 * hit resolver reads; references, not copies.
 */
export function build_frame(
    model: DatagridModel,
    columns: Record<string, unknown[] | undefined>,
    x0: number,
    y0: number,
    x1: number,
): PerspectiveViewFrame {
    const end = Math.min(x1, model._column_paths.length);
    return {
        start_row: y0,
        start_col: x0,
        paths: model._column_paths.slice(x0, end),
        column_paths: model._column_path_area.map((level) =>
            level.slice(x0, end).map((value) => value ?? null),
        ) as CellScalar[][] as PerspectiveViewFrame["column_paths"],
        data: columns as Record<string, unknown[]>,
    };
}

/**
 * The viewer hosting `plugin`, the only party that evaluates the schema.
 */
export function host_viewer(
    plugin: DatagridPluginElement,
): HTMLPerspectiveViewerElement | null {
    return plugin.parentElement as HTMLPerspectiveViewerElement | null;
}

/**
 * The app's commands for `refs` at `location`, none for any ref when the host
 * throws, or `undefined` when the location is out of scope, no schema is set,
 * or the host is too old to ask.
 */
export function query_commands(
    plugin: DatagridPluginElement,
    location: PerspectiveCommandLocation,
    frame: PerspectiveViewFrame,
    refs: PerspectiveHitRef[],
): (PerspectiveCommands | undefined)[] | undefined {
    const viewer = host_viewer(plugin);
    if (!viewer?.queryCommands || refs.length === 0) {
        return undefined;
    }

    try {
        return viewer.queryCommands(plugin, location, frame, refs);
    } catch (error) {
        console.error(`Failed to query "${location}" commands`, error);
        return refs.map(() => undefined);
    }
}

/**
 * Whether `location` is in the app's scopes, asked with an empty frame so no
 * schema call runs.
 */
export function is_command_scope(
    plugin: DatagridPluginElement,
    location: PerspectiveCommandLocation,
): boolean {
    const viewer = host_viewer(plugin);
    if (!viewer?.queryCommands || !plugin.model) {
        return false;
    }

    const frame: PerspectiveViewFrame = {
        start_row: 0,
        start_col: 0,
        paths: [],
        column_paths: [],
        data: {},
    };

    return viewer.queryCommands(plugin, location, frame, []) !== undefined;
}

function command_button(
    spec: CommandSpec,
    result: PerspectiveCommands,
): HTMLButtonElement {
    const button = document.createElement("button") as CommandButton;
    button.className = COMMAND_BUTTON_CLASS;
    button.type = "button";
    button.dataset.key = spec.key;
    button.title = (spec.kind === "Command" && spec.title) || spec.label;
    button.tabIndex = -1;
    button[CONTEXT_KEY] = result;
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

    if (spec.kind === "Group") {
        button.dataset.group = "";
    }

    return button;
}

/**
 * A block holding one button per command of `result`, empty when it has none;
 * `previous`, the block last drawn at this position, is updated in place and
 * returned so an unchanged row keeps its button elements across draws.
 */
export function command_block(
    result: PerspectiveCommands | undefined,
    previous?: HTMLElement,
): HTMLElement {
    const block = previous ?? document.createElement("div");
    block.className = COMMAND_CELL_CLASS;
    update_command_block(block, result);
    return block;
}

function set_block_value(
    block: HTMLElement,
    content: string | HTMLElement | null | undefined,
): void {
    const current = block.querySelector(":scope > .psp-command-value");
    if (content instanceof HTMLElement) {
        content.classList.add("psp-command-value");
        if (current) {
            current.replaceWith(content);
        } else {
            block.prepend(content);
        }
    } else if (content) {
        if (current instanceof HTMLSpanElement) {
            if (current.textContent !== String(content)) {
                current.textContent = String(content);
            }
        } else {
            const value = document.createElement("span");
            value.className = "psp-command-value";
            value.textContent = String(content);
            current?.remove();
            block.prepend(value);
        }
    } else {
        current?.remove();
    }
}

/**
 * A block holding `content` (when any) followed by one button per command,
 * or `content` untouched when there are no commands; `previous`, the block
 * last drawn at this position, is updated in place and returned.
 */
export function command_cell(
    content: string | HTMLElement | null | undefined,
    result: PerspectiveCommands | undefined,
    previous?: HTMLElement,
): string | HTMLElement | null | undefined {
    if (!result || result.commands.length === 0) {
        return content;
    }

    const block = previous ?? document.createElement("div");
    block.className = COMMAND_CELL_CLASS;
    set_block_value(block, content);
    update_command_block(block, result);
    return block;
}

/**
 * Bring an existing block's buttons to `result`: rebuilt when the specs
 * differ from those last rendered, else kept with their contexts refreshed.
 */
export function update_command_block(
    block: HTMLElement,
    result: PerspectiveCommands | undefined,
): void {
    const specs = JSON.stringify(result?.commands ?? []);
    const buttons = Array.from(
        block.querySelectorAll(`:scope > .${COMMAND_BUTTON_CLASS}`),
    ) as CommandButton[];

    if ((block as CommandBlock)[SPECS_KEY] === specs) {
        for (const button of buttons) {
            button[CONTEXT_KEY] = result;
        }

        return;
    }

    for (const button of buttons) {
        button.remove();
    }

    for (const spec of result?.commands ?? []) {
        block.appendChild(command_button(spec, result!));
    }

    (block as CommandBlock)[SPECS_KEY] = specs;
}

/**
 * Whether `event` targets a command button, whose gesture belongs to the
 * command rather than to the grid.
 */
export function is_command_target(event: Event): boolean {
    const target = event.target as Element | null;
    return !!target?.closest?.(`.${COMMAND_BUTTON_CLASS}`);
}

/**
 * Isolate command-button gestures from the grid's own handlers and run the
 * command on click, through one capture-phase listener per event.
 */
export function install_command_listeners(
    plugin: DatagridPluginElement,
    table: RegularTableElement,
): void {
    const isolate = (event: Event) => {
        if (is_command_target(event)) {
            event.stopImmediatePropagation();
            if (event.type === "mousedown") {
                event.preventDefault();
            }
        }
    };

    for (const type of ["pointerdown", "mousedown", "mouseup", "dblclick"]) {
        table.addEventListener(type, isolate, { capture: true });
    }

    table.addEventListener(
        "click",
        (event: Event) => {
            const target = (event.target as Element | null)?.closest?.(
                `.${COMMAND_BUTTON_CLASS}`,
            ) as CommandButton | null;

            if (!target) {
                return;
            }

            event.stopImmediatePropagation();
            const result = target[CONTEXT_KEY];
            const viewer = host_viewer(plugin);
            if (!result || !viewer || target.disabled) {
                return;
            }

            const key = target.dataset.key ?? "";
            if (target.dataset.group !== undefined) {
                const group = result.commands.find(
                    (spec) => spec.kind === "Group" && spec.key === key,
                );

                if (group?.kind === "Group") {
                    const mouse = event as MouseEvent;
                    void viewer.showCommandMenu(
                        result.context,
                        group.commands,
                        {
                            x: mouse.clientX,
                            y: mouse.clientY,
                        },
                    );
                }
            } else {
                viewer.invokeCommand(key, result.context);
            }
        },
        { capture: true },
    );
}

/**
 * The button surfaces in force: each scope the app declared, less the ones
 * `plugin_config` turned off.
 */
export function effective_command_scopes(plugin: DatagridPluginElement): {
    row: boolean;
    cell: boolean;
} {
    return {
        row:
            plugin._command_column !== "none" &&
            is_command_scope(plugin, "datagrid-row"),
        cell:
            plugin._command_cells && is_command_scope(plugin, "datagrid-cell"),
    };
}

/**
 * Whether the scopes in force differ from those the last draw rendered, so
 * button chrome must be added or dropped by a redraw.
 */
export function command_scopes_changed(plugin: DatagridPluginElement): boolean {
    const drawn = plugin.model?._command_drawn;
    if (!drawn) {
        return false;
    }

    const scopes = effective_command_scopes(plugin);
    return drawn.row !== scopes.row || drawn.cell !== scopes.cell;
}
