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

import type { EngineId } from "../sources.js";

/** A datasource that can be reconstructed from committed data alone. */
export type ProjectSource =
    | {
          kind: "fetch";
          engine: EngineId;
          url: string;
          format: string;

          /** Bare table name; DuckDB qualification is applied by its engine. */
          name: string;
      }
    | {
          kind: "generated";

          /** Key into `GENERATORS`. Always the perspective-server engine. */
          generator: string;
          name: string;

          /** Defaults to the generator's own `defaults` when omitted. */
          params?: Record<string, number>;
      }
    | {
          kind: "eval";

          /**
           * Table name the script MUST create on the shared
           * perspective-server client before resolving.
           */
          name: string;

          /**
           * Source text of an async function EXPRESSION,
           * `async (api) => {…}`, run via `new Function` with
           * `api = {client, name, worker}`. Teardown is anchored on
           * `table.on_delete(...)` — the return value is ignored.
           *
           * HARD RULE: `eval` sources are COMMITTED CORPUS CODE ONLY. They
           * must never be hydrated from URLs, query params, or any shared or
           * imported Project format — a shareable Project carrying `eval` is
           * XSS by construction (this app persists an agent API key in
           * localStorage). If Projects ever become shareable, this field is
           * stripped from the share format.
           */
          code: string;
      };

/**
 * A saved starting point: one datasource plus the layout to render over it.
 *
 * `workspace` is a `saveWorkspace()` token, but its panels' `table` fields
 * are NOT authoritative — a Project has exactly one source, so every panel
 * is re-pointed at whatever table that source actually created.
 *
 * Every entry opens with the settings sidebar, which the top-level `active`
 * field is the workspace format's only carrier for — a `settings: true` key
 * inside a panel entry is silently ignored. Both helpers below always emit
 * it, so a hand-written `workspace` literal is the only way to omit it.
 */
export interface Project {
    id: string;
    title: string;
    description?: string;
    source: ProjectSource;
    workspace: any;
}

/**
 * Wrap a single-panel `ViewerConfig` as a `WorkspaceConfig`.
 *
 * @param config the panel's `ViewerConfig`.
 */
export function singlePanel(config: Record<string, unknown>): any {
    return {
        layout: { type: "tab-layout", tabs: ["p0"], selected: 0 },
        panels: { p0: { table: "", ...config } },
        active: "p0",
    };
}

/**
 * Wrap several panel `ViewerConfig`s as a `WorkspaceConfig`.
 *
 * @param layout a layout tree referencing the keys of `panels`.
 * @param panels each panel's `ViewerConfig`, keyed by layout id.
 */
export function multiPanel(
    layout: Record<string, unknown>,
    panels: Record<string, Record<string, unknown>>,
): any {
    const mapped: Record<string, unknown> = {};
    for (const [id, config] of Object.entries(panels)) {
        mapped[id] = { table: "", ...config };
    }

    return { layout, panels: mapped, active: Object.keys(panels)[0] };
}

/**
 * A tab-layout node.
 *
 * @param tabs the panel ids to stack, the first selected.
 */
export function tab(...tabs: string[]): Record<string, unknown> {
    return { type: "tab-layout", tabs, selected: 0 };
}

/**
 * A split-layout node.
 *
 * @param orientation the split's axis.
 * @param sizes each child's fraction of the split.
 * @param children the child layout nodes.
 */
export function split(
    orientation: "horizontal" | "vertical",
    sizes: number[],
    children: unknown[],
): Record<string, unknown> {
    return { type: "split-layout", orientation, sizes, children };
}

/**
 * A stable, filename-safe id — it names the thumbnail on disk.
 *
 * @param value a Project or layout title.
 */
export function slug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

/** A `prefers-color-scheme` value, one thumbnail set per member. */
export type ThumbnailTheme = "light" | "dark";

/**
 * The thumbnail for a Project, as written by `build.projects.mjs`.
 *
 * @param id the Project's id.
 * @param theme the color scheme the shot was captured under.
 */
export function thumbnailUrl(id: string, theme: ThumbnailTheme): string {
    return `/projects/${theme}/${id}.png`;
}
