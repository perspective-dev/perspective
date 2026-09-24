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
    PRIVATE_PLUGIN_SYMBOL,
    readThemeStyle,
    reconcile_column_widths,
    width_config_delta,
} from "../model/index.js";
import { activate } from "../plugin/activate.js";
import { restore, sync_wrap_lines } from "../plugin/restore.js";
import { save } from "../plugin/save.js";
import { draw } from "../plugin/draw.js";
import column_config_schema, {
    ColumnConfigSchema,
} from "../plugin/column_config_schema.js";
import plugin_config_schema from "../plugin/plugin_config_schema.js";
import datagridStyles from "../../../dist/css/perspective-viewer-datagrid.css";
import { format_raw } from "../data_listener/format_cell.js";
import { sourceColumn } from "@perspective-dev/viewer/column-format";

import type { View, ViewWindow } from "@perspective-dev/client";
import type {
    HTMLPerspectiveViewerElement,
    IPerspectiveViewerPlugin,
    PluginStaticConfig,
} from "@perspective-dev/viewer";
import type {
    DatagridModel,
    DatagridToolbarElement,
    EditMode,
    DatagridPluginConfig,
    ColumnsConfig,
    ResolvedColumnsConfig,
    Align,
} from "../types.js";
import { RegularTableElement } from "regular-table";

type RenderTarget = "shadow" | "light";

/**
 * The custom element class for this plugin.  The interface methods for this
 */
export class HTMLPerspectiveViewerDatagridPluginElement
    extends HTMLElement
    implements IPerspectiveViewerPlugin
{
    private static _global_stylesheet_installed: boolean = false;
    private static _sheet: CSSStyleSheet | undefined;

    // Determines whether this datagrid renders in the light DOM. This will
    // break style encapsulation and may cause inconsistent behavior.
    static renderTarget: RenderTarget =
        window.CSS?.supports &&
        window.CSS?.supports("selector(:host-context(foo))")
            ? "shadow"
            : "light";

    regular_table: RegularTableElement;
    model?: DatagridModel;
    _toolbar?: DatagridToolbarElement;
    _edit_button?: HTMLElement;
    _scroll_lock?: HTMLElement;
    _is_scroll_lock: boolean;
    _edit_mode: EditMode;
    _font_family?: string;
    _font_size?: number;
    _bold: boolean = false;
    _italic: boolean = false;
    _word_wrap: boolean = false;
    _column_menus: boolean = true;
    _align?: Align;
    _row_height?: number;
    _zebra_rows: number = 0;
    _zebra_color?: string;
    _column_overrides: Map<string, number> = new Map();
    _initialized?: boolean;
    _reset_scroll_top?: boolean;
    _reset_scroll_left?: boolean;
    _reset_select?: boolean;
    _reset_column_size?: boolean;
    _columns_config: ColumnsConfig = {};

    /**
     * Reconcile the last fetched window at gesture end and echo the columns
     * whose override changed.
     */
    private _persist_column_sizes = (): void => {
        const model = this.model;
        if (!model || model._config.split_by?.length > 0) {
            return;
        }

        const window = model._last_window;
        reconcile_column_widths(
            model,
            this.regular_table,
            window?.start_col ?? 0,
            window?.end_col ?? 0,
        );

        if (model._unpersisted_widths.size === 0) {
            return;
        }

        const columns_config = width_config_delta(
            this,
            model._unpersisted_widths,
        );

        model._unpersisted_widths.clear();
        const viewer = this.parentElement as HTMLPerspectiveViewerElement;
        void viewer?.restore?.(
            { columns_config: JSON.parse(JSON.stringify(columns_config)) },
            { panel: model._panel },
        );
    };

    private _on_column_resize = (event: MouseEvent): void => {
        const is_resize = event.composedPath().some((target) => {
            return (
                target instanceof HTMLElement &&
                target.classList.contains("rt-column-resize")
            );
        });

        if (is_resize) {
            document.addEventListener("mouseup", this._persist_column_sizes, {
                once: true,
            });
        }
    };

    constructor() {
        super();
        this.regular_table = document.createElement(
            "regular-table",
        ) as RegularTableElement;
        this.regular_table.part = "regular-table";
        this._is_scroll_lock = false;
        this._edit_mode = "READ_ONLY";
        const Elem = HTMLPerspectiveViewerDatagridPluginElement;
        if (!Elem._sheet) {
            Elem._sheet = new CSSStyleSheet();
            Elem._sheet.replaceSync(datagridStyles);
        }

        if (Elem.renderTarget === "shadow") {
            const shadow = this.attachShadow({ mode: "open" });
            shadow.adoptedStyleSheets.push(Elem._sheet);
        } else if (
            Elem.renderTarget === "light" &&
            !Elem._global_stylesheet_installed
        ) {
            Elem._global_stylesheet_installed = true;
            document.adoptedStyleSheets.push(Elem._sheet);
        }
    }

    connectedCallback(): void {
        this.regular_table.addEventListener(
            "mousedown",
            this._on_column_resize,
            { capture: true },
        );

        if (!this._toolbar) {
            this._toolbar = document.createElement(
                "perspective-viewer-datagrid-toolbar",
            ) as DatagridToolbarElement;
        }

        if (this.parentElement) {
            this.insertAdjacentElement("afterend", this._toolbar);
        }
    }

    disconnectedCallback(): void {
        this.regular_table.removeEventListener(
            "mousedown",
            this._on_column_resize,
            { capture: true },
        );
        document.removeEventListener("mouseup", this._persist_column_sizes);
        this._toolbar?.parentElement?.removeChild?.(this._toolbar);
    }

    async activate(view: View): Promise<void> {
        return await activate.call(this, view);
    }

    get_static_config(): PluginStaticConfig {
        return {
            name: "Datagrid",
            category: "Basic",
            select_mode: "toggle",
            config_column_names: ["Columns"],

            // The datagrid's pivots are structural rather than spatial:
            // `group_by` nests rows into an expandable tree, `split_by`
            // repeats the column set once per split value.
            // group_by_role: "Row Groups",
            // split_by_role: "Column Groups",
            group_rollup_modes: ["rollup", "flat", "total"],
            split_rollup_modes: ["flat", "rollup"],
            // Higher priority than the chart plugins so the Datagrid is
            // loaded by default.
            priority: 1,
            can_render_column_styles: true,
        };
    }

    plugin_config_schema(
        view_config?: Record<string, unknown>,
        current_value?: Record<string, unknown> | null,
    ): ColumnConfigSchema {
        return plugin_config_schema.call(this, view_config, current_value);
    }

    column_config_schema(
        type: string,
        group: string | undefined,
        column_name: string,
        current_value: Record<string, unknown> | null,
        viewer_config?: {
            group_by?: string[];
            split_by?: string[];
            group_rollup_mode?: string;
        },
        plugin_config?: Record<string, unknown> | null,
    ): ColumnConfigSchema {
        return column_config_schema.call(
            this,
            type as any,
            group,
            column_name,
            current_value,
            viewer_config,
            plugin_config,
        );
    }

    async draw(view: View): Promise<void> {
        return await draw.call(this, view);
    }

    async update(view: View): Promise<void> {
        if (this.model === undefined) {
            await this.draw(view);
        } else if (this.model._config.split_by?.length > 0) {
            const dimensions = await view.dimensions();
            this.model._num_rows = dimensions.num_view_rows;
            await this.regular_table.draw();
        } else {
            this.model._num_rows = await view.num_rows();
            await this.regular_table.draw();
        }
    }

    async render(view: View, viewport?: ViewWindow): Promise<string> {
        const json = await view.to_columns(viewport as any);
        const cols = await view.column_paths(viewport as any);
        const nrows =
            viewport?.end_row !== undefined &&
            viewport?.end_row !== null &&
            viewport?.start_row !== undefined &&
            viewport?.start_row !== null
                ? viewport.end_row - viewport.start_row
                : await view.num_rows();

        let out = "";
        for (let ridx = 0; ridx < nrows; ridx++) {
            for (const col_name of cols) {
                const col = (json as Record<string, unknown[]>)[col_name];
                const type = this.model!._schema[col_name];
                const pluginConfig = (this.regular_table as any)[
                    PRIVATE_PLUGIN_SYMBOL
                ] as ResolvedColumnsConfig | undefined;
                const columnName = sourceColumn(col_name);
                const formatter = format_raw(
                    type,
                    pluginConfig?.[columnName] || {},
                );

                if (formatter) {
                    out += formatter.format(col[ridx]) + "\t";
                } else {
                    out += col[ridx] + "\t";
                }
            }

            out += "\n";
        }

        return out.trim();
    }

    async resize(_view: View): Promise<void> {
        if (!this.isConnected || this.offsetParent == null) {
            return;
        }

        if (this._initialized) {
            await this.regular_table.draw();
        }
    }

    /**
     * Host presize protocol: stage a render for the TARGET element box
     * `(width, height)` — the box the host's pending layout commit will
     * produce — via `regular-table`'s `predraw()`, which runs the data
     * fetch and viewport calculation now without touching the visible
     * DOM. Resolves to the commit closure; the host invokes it in the
     * same task as the layout commit, landing geometry and cells in one
     * paint.
     *
     * The `predraw()` box is derived by delta: `regular-table` fills this
     * element with constant chrome, so the element's box delta IS the
     * table's. When column widths for the target viewport aren't yet
     * measured (first paint, post-`resetAutoSize`), `predraw()` draws
     * inline and the closure no-ops — the pre-staging behavior, degraded
     * not broken.
     */
    async presize(width: number, height: number): Promise<(() => void) | void> {
        if (
            !this.isConnected ||
            this.offsetParent == null ||
            !this._initialized
        ) {
            return;
        }

        const rect = this.getBoundingClientRect();
        return await this.regular_table.predraw(
            Math.max(0, this.regular_table.clientWidth + (width - rect.width)),
            Math.max(
                0,
                this.regular_table.clientHeight + (height - rect.height),
            ),
        );
    }

    async clear(): Promise<void> {
        this.regular_table.resetAutoSize();
        this.regular_table.clear();
    }

    save(): any {
        return save.call(this);
    }

    restore(token: DatagridPluginConfig, columns_config?: ColumnsConfig): void {
        return restore.call(this, token, columns_config ?? {});
    }

    async deselect(): Promise<void> {
        const model = this.model;
        if (!model?._selection_state) {
            return;
        }

        model._selection_state.selected_areas = [];
        model._selection_state.old_selected_areas = [];
        model._selection_state.potential_selection = undefined;
        model._selection_state.CURRENT_MOUSEDOWN_COORDINATES = {};
        model._selection_state.dirty = true;
        model._tree_selection_id = undefined;
        if (this._initialized) {
            await this.regular_table.draw({ preserve_width: true });
        }
    }

    restyle(): void {
        if (!this.model || !this.isConnected) {
            return;
        }

        Object.assign(this.model, readThemeStyle(this.regular_table));
        sync_wrap_lines.call(this);
    }

    delete(): void {
        this.disconnectedCallback();
        this._toolbar = undefined;
        if ((this.regular_table as any).table_model) {
            this.regular_table.resetAutoSize();
        }

        this.regular_table.clear();
    }
}
