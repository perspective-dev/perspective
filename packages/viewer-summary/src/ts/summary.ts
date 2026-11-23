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
    ColumnType,
    ColumnWindow,
    Filter,
    Scalar,
    View,
    ViewConfig,
    ViewWindow,
} from "@perspective-dev/client";
import type {
    Align,
    CellStyleModel,
    ColumnConfigSchema,
    ColumnRole,
    HTMLPerspectiveViewerElement,
    IPerspectiveViewerPlugin,
    PerspectiveClickEventDetail,
    PluginStaticConfig,
    ThemeStyle,
} from "@perspective-dev/viewer";
import summaryStyles from "../../dist/css/perspective-viewer-summary.css";
import {
    SPLIT_STEPS,
    TRACK_EXTRA,
    compute_hierarchy_layout,
    compute_layout,
    tile_value_css,
    uniform_value_css,
    type Layout,
    type TileMetrics,
} from "./layout.ts";
import { plugin_utils } from "./plugin_utils.ts";
import {
    parse_label_position,
    parse_plugin_config,
    summary_column_config_schema,
    summary_plugin_config_schema,
} from "./schema.ts";
import { build_tiles, build_tree } from "./tiles.ts";
import type {
    ColumnsConfig,
    ResolvedColumnsConfig,
    ResolvedPluginConfig,
    Schema,
    Tile,
    TileGroup,
} from "./types.ts";

const MEASURE_PX = 100;
const MIN_EM_WIDTH = 0.6;
const METRIC_CACHE_LIMIT = 4096;
const LABEL_PLACEMENTS = ["top", "bottom", "left", "right", "none"] as const;
const EXPORT_LABEL_SEPARATOR = " · ";

const FLEX_ALIGN = { start: "flex-start", center: "center", end: "flex-end" };
const TEXT_ALIGN = { start: "left", center: "center", end: "right" };

interface TileElements {
    tile: HTMLElement;
    label: HTMLElement;
    value: HTMLElement;
}

interface ViewState {
    config: ViewConfig;
    schema: Schema;
    split_types: ColumnType[];
}

interface ThemeFont {
    family: string;
    weight: string;
    style: string;
}

function horizontal(align: Align): keyof typeof FLEX_ALIGN {
    return align.endsWith("left")
        ? "start"
        : align.endsWith("right")
          ? "end"
          : "center";
}

function vertical(align: Align): keyof typeof FLEX_ALIGN {
    return align.startsWith("top")
        ? "start"
        : align.startsWith("bottom")
          ? "end"
          : "center";
}

function is_numeric(type: ColumnType): boolean {
    return type === "integer" || type === "float";
}

/**
 * The `<perspective-viewer>` Summary plugin, which draws the grand-total row
 * of a `View` as one fitted tile per column.
 */
export class HTMLPerspectiveViewerSummaryPluginElement
    extends HTMLElement
    implements IPerspectiveViewerPlugin
{
    private static _sheet: CSSStyleSheet | undefined;
    private static _measure: CanvasRenderingContext2D | null | undefined;

    private _container: HTMLElement;
    private _config: ResolvedPluginConfig = parse_plugin_config(undefined);
    private _styles: ResolvedColumnsConfig = {};
    private _theme?: ThemeStyle;
    private _font?: ThemeFont;
    private _view_state?: ViewState;
    private _tiles: Tile[] = [];
    private _elements: TileElements[] = [];
    private _tree?: TileGroup;
    private _bodies: Map<TileGroup, HTMLElement> = new Map();
    private _nested = false;
    private _metrics: TileMetrics[] = [];
    private _row: Record<string, unknown> = {};
    private _previous?: Map<string, unknown>;
    private _is_new_view = false;
    private _metric_cache: Map<string, number> = new Map();
    private _series_color_map: Map<string, Map<string, number>> = new Map();
    private _series_color_seed: Map<string, number> = new Map();

    private _on_click = (event: MouseEvent): void => {
        const target = event.target as Element | null;
        const tile_elem = target?.closest?.(".tile") as HTMLElement | null;
        const index = Number(tile_elem?.dataset.index);
        const tile = this._tiles[index];
        const state = this._view_state;
        const viewer = this
            .parentElement as HTMLPerspectiveViewerElement | null;
        if (!tile || !state || !viewer) {
            return;
        }

        const split_by = state.config.split_by ?? [];
        const filter: Filter[] = [...(state.config.filter ?? [])];
        tile.split.forEach((value, level) => {
            if (value !== null) {
                filter.push([split_by[level], "==", value] as Filter);
            }
        });

        viewer.dispatchEvent(
            new CustomEvent<PerspectiveClickEventDetail>("perspective-click", {
                bubbles: true,
                composed: true,
                detail: {
                    row: this._row,
                    column_names: [tile.name],
                    config: { filter },
                    panel: this.getAttribute("slot") ?? undefined,
                },
            }),
        );
    };

    constructor() {
        super();
        const Elem = HTMLPerspectiveViewerSummaryPluginElement;
        if (!Elem._sheet) {
            Elem._sheet = new CSSStyleSheet();
            Elem._sheet.replaceSync(
                plugin_utils().cell_style.css + summaryStyles,
            );
        }

        const shadow = this.attachShadow({ mode: "open" });
        shadow.adoptedStyleSheets.push(Elem._sheet);
        this._container = document.createElement("div");
        this._container.id = "tiles";
        this._container.addEventListener("click", this._on_click);
        shadow.appendChild(this._container);
    }

    get_static_config(): PluginStaticConfig {
        return {
            name: "Summary",
            category: "Basic",
            select_mode: "toggle",
            config_column_names: ["Columns"],
            group_rollup_modes: ["total"],
            split_rollup_modes: ["flat", "rollup"],
            priority: 0,
            max_columns: 100,
            can_render_column_styles: true,
            renders_text: true,
        };
    }

    plugin_config_schema(
        _view_config?: Record<string, unknown>,
        _current_value?: Record<string, unknown> | null,
    ): ColumnConfigSchema {
        return summary_plugin_config_schema();
    }

    column_config_schema(
        type: string,
        _group: string | undefined,
        _column_name: string,
        current_value: Record<string, unknown> | null,
        _viewer_config?: Record<string, unknown>,
        plugin_config?: Record<string, unknown> | null,
        role?: ColumnRole,
    ): ColumnConfigSchema {
        return summary_column_config_schema(
            type as ColumnType,
            current_value,
            plugin_config === undefined || plugin_config === null
                ? this._config
                : parse_plugin_config(plugin_config),
            role,
            () =>
                this._theme ?? plugin_utils().theme_style.readThemeStyle(this),
        );
    }

    async draw(view: View, column_limit?: number | null): Promise<void> {
        const viewer = this
            .parentElement as HTMLPerspectiveViewerElement | null;
        const panel = this.getAttribute("slot") ?? undefined;
        const table = await viewer?.getTable?.({ panel });
        const [config, schema, expression_schema, table_schema] =
            await Promise.all([
                view.get_config(),
                view.schema(),
                view.expression_schema(),
                table?.schema() ?? {},
            ]);

        const types: Schema = {
            ...(table_schema as Schema),
            ...(expression_schema as Schema),
        };

        this._view_state = {
            config: config as ViewConfig,
            schema: { ...(schema as Schema), ...(expression_schema as Schema) },
            split_types: (config.split_by ?? []).map(
                (name: string) => types[name] ?? "string",
            ),
        };

        this._is_new_view = true;
        this._previous = undefined;
        this._series_color_map.clear();
        this._series_color_seed.clear();
        await this._load(view, column_limit);
    }

    async update(view: View, column_limit?: number | null): Promise<void> {
        if (this._view_state === undefined) {
            await this.draw(view, column_limit);
            return;
        }

        await this._load(view, column_limit);
    }

    async resize(): Promise<void> {
        if (!this.isConnected || this.offsetParent == null) {
            return;
        }

        this._apply(this._plan(this.clientWidth, this.clientHeight));
    }

    async presize(width: number, height: number): Promise<(() => void) | void> {
        if (
            !this.isConnected ||
            this.offsetParent == null ||
            this._tiles.length === 0
        ) {
            return;
        }

        const layout = this._plan(width, height);
        return () => this._apply(layout);
    }

    restyle(): void {
        if (!this.isConnected || this._theme === undefined) {
            return;
        }

        this._read_theme();
    }

    restore(token: unknown, columns_config?: ColumnsConfig): void {
        const utils = plugin_utils();
        this._config = parse_plugin_config(token);
        const styles: ResolvedColumnsConfig = {};
        for (const [name, config] of Object.entries(columns_config ?? {})) {
            styles[name] = utils.column_style.resolve_column_style(
                JSON.parse(JSON.stringify(config)),
            );
        }

        utils.format.free_formatters(this._styles);
        this._styles = styles;
    }

    async render(_view: View, _viewport?: ViewWindow): Promise<string> {
        return this._tiles
            .map((x) => {
                const label = [...x.path, x.name].join(EXPORT_LABEL_SEPARATOR);
                return `${label}\t${x.text}`;
            })
            .join("\n");
    }

    async clear(): Promise<void> {
        this._container.replaceChildren();
        this._elements = [];
        this._bodies = new Map();
        this._nested = false;
        this._tree = undefined;
        this._tiles = [];
        this._metrics = [];
        this._previous = undefined;
    }

    delete(): void {
        plugin_utils().format.free_formatters(this._styles);
        this._container.replaceChildren();
        this._elements = [];
        this._bodies = new Map();
        this._nested = false;
        this._tree = undefined;
        this._tiles = [];
        this._metrics = [];
        this._previous = undefined;
        this._view_state = undefined;
        this._row = {};
    }

    private _read_theme(): void {
        const style = window.getComputedStyle(this);
        this._theme = plugin_utils().theme_style.readThemeStyle(this);
        this._font = {
            family: style.fontFamily,
            weight: style.fontWeight,
            style: style.fontStyle,
        };

        this._metric_cache.clear();
    }

    private async _load(
        view: View,
        column_limit?: number | null,
    ): Promise<void> {
        const state = this._view_state!;
        const split_by = state.config.split_by ?? [];
        const limit =
            typeof column_limit === "number" ? column_limit : undefined;
        const window: ViewWindow = {
            start_row: 0,
            end_row: 1,
            ...(limit !== undefined ? { start_col: 0, end_col: limit } : {}),
        };

        const column_window: ColumnWindow = {
            start_col: 0,
            end_col: limit ?? null,
        };

        const [data, area] = await Promise.all([
            view.to_columns(window),
            split_by.length > 0 ? view.column_paths(column_window) : undefined,
        ]);

        if (this._theme === undefined && this.isConnected) {
            this._read_theme();
        }

        const source = data as Record<string, unknown[]>;
        this._row = Object.fromEntries(
            Object.entries(source).map(([key, values]) => [key, values?.[0]]),
        );

        this._tiles = build_tiles({
            columns: source,
            area: area as (Scalar | null | undefined)[][] | undefined,
            schema: state.schema,
            split_by,
            split_types: state.split_types,
            styles: this._styles,
            hierarchy: this._config.layout_mode === "hierarchy",
        });

        const tree =
            this._config.layout_mode === "hierarchy"
                ? build_tree(this._tiles)
                : undefined;

        this._tree =
            tree !== undefined && tree.groups.length > 0 ? tree : undefined;
        this._reconcile();
        this._sync_groups();
        this._paint();
        this._metrics = this._tiles.map((tile) => this._measure_tile(tile));
        if (this.isConnected && this.offsetParent != null) {
            this._apply(this._plan(this.clientWidth, this.clientHeight));
        }
    }

    private _reconcile(): void {
        const same =
            this._elements.length === this._tiles.length &&
            this._tiles.every(
                (tile, index) =>
                    this._elements[index].tile.dataset.key === tile.key,
            );

        if (same && !this._is_new_view) {
            return;
        }

        this._is_new_view = false;
        this._previous = undefined;
        this._elements = this._tiles.map((tile, index) => {
            const elem = document.createElement("div");
            elem.className = "tile";
            elem.dataset.key = tile.key;
            elem.dataset.index = String(index);
            const label = document.createElement("div");
            label.className = "label";
            const body = document.createElement("div");
            body.className = "body";
            const value = document.createElement("div");
            value.className = "value";
            const track = document.createElement("div");
            track.className = "track";
            body.append(value, track);
            elem.append(label, body);
            return { tile: elem, label, value };
        });

        this._container.replaceChildren(...this._elements.map((x) => x.tile));
    }

    private _sync_groups(): void {
        const tiles = this._elements.map((x) => x.tile);
        if (this._tree === undefined) {
            if (this._nested) {
                for (const tile of tiles) {
                    tile.style.removeProperty("--psp-summary--padding");
                    tile.classList.remove("last-row");
                }

                this._container.replaceChildren(...tiles);
                this._container.classList.remove(
                    "leaf",
                    "split-rows",
                    "split-columns",
                );

                for (const key of ["tracks", "span", "last-span", "split"]) {
                    this._container.style.removeProperty(
                        `--psp-summary--${key}`,
                    );
                }

                this._bodies = new Map();
                this._nested = false;
            }

            return;
        }

        const bodies = new Map<TileGroup, HTMLElement>();
        const fill = (node: TileGroup, body: HTMLElement): HTMLElement[] => {
            bodies.set(node, body);
            body.classList.toggle("leaf", node.groups.length === 0);
            if (node.groups.length === 0) {
                return node.tiles.map((index) => tiles[index]);
            }

            return node.groups.map((child) => {
                const group = document.createElement("div");
                group.className = "group";
                group.classList.toggle("headless", child.label === undefined);
                if (child.label !== undefined) {
                    const header = document.createElement("div");
                    header.className = "group-header";
                    header.textContent = child.label;
                    header.title = child.label;
                    group.append(header);
                }

                const child_body = document.createElement("div");
                child_body.className = "group-body";
                child_body.append(...fill(child, child_body));
                group.append(child_body);
                return group;
            });
        };

        this._container.replaceChildren(...fill(this._tree, this._container));
        this._bodies = bodies;
        this._nested = true;
    }

    private _style_model(): CellStyleModel | undefined {
        if (this._theme === undefined) {
            return undefined;
        }

        const previous = this._previous;
        const keys = previous ? [...previous.keys()] : [];
        return {
            ...this._theme,
            _series_color_map: this._series_color_map,
            _series_color_seed: this._series_color_seed,
            _config: { split_by: [] },
            _ids: [[]],
            _column_paths: this._tiles.map((x) => x.key),
            _is_old_viewport: previous !== undefined,
            last_meta: previous
                ? keys.map((key) => [previous.get(key)])
                : undefined,
            last_reverse_ids: previous ? new Map([["", 0]]) : undefined,
            last_reverse_columns: previous
                ? new Map(keys.map((key, index) => [key, index]))
                : undefined,
        };
    }

    private _paint(): void {
        const {
            cell_style: {
                cell_style_boolean,
                cell_style_datetime,
                cell_style_numeric,
                cell_style_string,
            },
            color: { infer_foreground_from_background, parseColor },
            schema: { css_font_family },
        } = plugin_utils();

        const model = this._style_model();
        this._tiles.forEach((tile, index) => {
            const { tile: elem, label, value } = this._elements[index];
            const plugin = this._styles[tile.name];
            const numeric = is_numeric(tile.type);
            label.textContent = tile.label;
            label.title = tile.label;
            value.textContent = tile.text;
            elem.dataset.column = tile.name;
            elem.classList.toggle("psp-null", tile.value === null);
            elem.classList.toggle(
                "psp-color-mode-bar",
                numeric && plugin?.fg_mode === "bar",
            );

            elem.classList.toggle(
                "psp-color-mode-label-bar",
                numeric && plugin?.fg_mode === "label-bar",
            );

            const family = plugin?.font_family ?? this._config.font_family;
            value.style.fontFamily =
                family && family !== "inherit" ? css_font_family(family) : "";

            value.style.fontWeight =
                (plugin?.bold ?? this._config.bold) ? "bold" : "";

            value.style.fontStyle =
                (plugin?.italic ?? this._config.italic) ? "italic" : "";

            const align =
                plugin?.align ??
                this._config.align ??
                (numeric ? "right" : "left");
            const h = horizontal(align);
            elem.style.setProperty("--psp-summary--h", FLEX_ALIGN[h]);
            elem.style.setProperty("--psp-summary--t", TEXT_ALIGN[h]);
            elem.style.setProperty(
                "--psp-summary--v",
                FLEX_ALIGN[vertical(align)],
            );
            if (model !== undefined) {
                const metadata = {
                    user: tile.value,
                    value: tile.value,
                    dy: 0,
                    x: index,
                    column_header: [tile.name],
                } as any;

                if (numeric) {
                    cell_style_numeric(
                        model,
                        plugin,
                        tile.type,
                        elem,
                        metadata,
                        false,
                    );
                } else if (tile.type === "boolean") {
                    cell_style_boolean(model, plugin, elem, metadata);
                } else if (tile.type === "string") {
                    cell_style_string(model, plugin, elem, metadata);
                } else if (tile.type === "date" || tile.type === "datetime") {
                    cell_style_datetime(model, plugin, elem, metadata);
                } else {
                    elem.style.backgroundColor = "";
                    elem.style.color = "";
                }
            }

            const background = elem.style.backgroundColor;
            if (background) {
                elem.style.setProperty(
                    "--psp-summary--label--color",
                    infer_foreground_from_background(parseColor(background)),
                );
            } else {
                elem.style.removeProperty("--psp-summary--label--color");
            }
        });

        this._previous = new Map(this._tiles.map((x) => [x.key, x.value]));
    }

    private _em_width(text: string, font: string): number {
        const key = `${font}\n${text}`;
        const cached = this._metric_cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const Elem = HTMLPerspectiveViewerSummaryPluginElement;
        if (Elem._measure === undefined) {
            Elem._measure = document.createElement("canvas").getContext("2d");
        }

        let width = text.length * MIN_EM_WIDTH;
        if (Elem._measure) {
            Elem._measure.font = font;
            width = Elem._measure.measureText(text).width / MEASURE_PX;
        }

        if (this._metric_cache.size >= METRIC_CACHE_LIMIT) {
            this._metric_cache.clear();
        }

        const em = Math.max(width, MIN_EM_WIDTH);
        this._metric_cache.set(key, em);
        return em;
    }

    private _measure_tile(tile: Tile): TileMetrics {
        const base = this._font ?? {
            family: "monospace",
            weight: "normal",
            style: "normal",
        };

        const plugin = this._styles[tile.name];
        const family = plugin?.font_family ?? this._config.font_family;
        const value_family =
            family && family !== "inherit"
                ? `${plugin_utils().schema.css_font_family(family)}, ${base.family}`
                : base.family;

        const weight =
            (plugin?.bold ?? this._config.bold) ? "bold" : base.weight;
        const style =
            (plugin?.italic ?? this._config.italic) ? "italic" : base.style;

        const label_font = `${base.style} ${base.weight} ${MEASURE_PX}px ${base.family}`;
        const lines = tile.label.split("\n");
        return {
            value: this._em_width(
                tile.text,
                `${style} ${weight} ${MEASURE_PX}px ${value_family}`,
            ),
            label: Math.max(...lines.map((x) => this._em_width(x, label_font))),
            lines: lines.length,
            position:
                parse_label_position(plugin?.label_position) ??
                this._config.label_position,
        };
    }

    private _extra(): number {
        const has_track = this._tiles.some(
            (x) =>
                is_numeric(x.type) && this._styles[x.name]?.fg_mode === "bar",
        );

        return has_track ? TRACK_EXTRA : 0;
    }

    private _plan(width: number, height: number): Layout {
        const input = {
            width,
            height,
            tiles: this._metrics,
            uniform: this._config.value_fit === "uniform",
            extra: this._extra(),
            grid_columns: this._config.grid_columns,
            grid_rows: this._config.grid_rows,
        };

        return this._tree
            ? compute_hierarchy_layout(input, this._tree)
            : compute_layout(input);
    }

    private _apply(layout: Layout): void {
        const container = this._container;
        container.classList.toggle("scroll", layout.tile_height !== undefined);
        const nested = layout.containers !== undefined;
        const uniform = this._config.value_fit === "uniform";
        const extra = this._extra();
        container.classList.toggle("hierarchy", nested);
        container.classList.toggle("tile-fit", !nested && !uniform);
        container.style.setProperty("--psp-summary--cols", String(layout.cols));
        container.style.setProperty("--psp-summary--rows", String(layout.rows));
        container.style.setProperty(
            "--psp-summary--padding",
            `${layout.padding}px`,
        );

        if (layout.tile_height !== undefined) {
            container.style.setProperty(
                "--psp-summary--tile-height",
                `${layout.tile_height}px`,
            );
        } else {
            container.style.removeProperty("--psp-summary--tile-height");
        }

        const shared =
            !nested && uniform
                ? uniform_value_css(layout, this._metrics, extra)
                : undefined;

        if (shared === undefined) {
            container.style.removeProperty("--psp-summary--value-size");
        } else {
            container.style.setProperty("--psp-summary--value-size", shared);
        }

        this._place(layout);
        layout.value_sizes.forEach((size, index) => {
            const tile = this._elements[index]?.tile;
            if (tile === undefined) {
                return;
            }

            const value_size = nested
                ? `${size}px`
                : uniform
                  ? undefined
                  : tile_value_css(
                        this._metrics[index],
                        layout.placements[index],
                        extra,
                    );

            if (value_size === undefined) {
                tile.style.removeProperty("--psp-summary--value-size");
            } else if (
                tile.style.getPropertyValue("--psp-summary--value-size") !==
                value_size
            ) {
                tile.style.setProperty("--psp-summary--value-size", value_size);
            }

            tile.style.setProperty(
                "--psp-summary--label-size",
                `${layout.label_sizes[index]}px`,
            );

            for (const placement of LABEL_PLACEMENTS) {
                tile.classList.toggle(
                    `label-${placement}`,
                    placement === layout.placements[index],
                );
            }
        });
    }

    private _place(layout: Layout): void {
        const { containers, paddings } = layout;
        if (containers === undefined) {
            return;
        }

        for (const [node, grid] of containers) {
            const body = this._bodies.get(node);
            if (body === undefined) {
                continue;
            }

            const short = grid.last < grid.cols;
            body.style.setProperty(
                "--psp-summary--tracks",
                String(short ? grid.cols * grid.last : grid.cols),
            );

            body.style.setProperty(
                "--psp-summary--span",
                String(short ? grid.last : 1),
            );

            body.style.setProperty(
                "--psp-summary--last-span",
                String(short ? grid.cols : 1),
            );

            if (grid.rows === undefined) {
                body.style.removeProperty("--psp-summary--rows");
            } else {
                body.style.setProperty(
                    "--psp-summary--rows",
                    String(grid.rows),
                );
            }

            const split = grid.split;
            body.classList.toggle(
                "split-rows",
                split !== undefined && grid.cols === 1,
            );

            body.classList.toggle(
                "split-columns",
                split !== undefined && grid.cols !== 1,
            );

            if (split === undefined) {
                body.style.removeProperty("--psp-summary--split");
            } else {
                body.style.setProperty(
                    "--psp-summary--split",
                    `minmax(0, ${split}fr) minmax(0, ${SPLIT_STEPS - split}fr)`,
                );
            }

            const items = [...body.children];
            const first_last = items.length - grid.last;
            items.forEach((item, index) =>
                item.classList.toggle("last-row", short && index >= first_last),
            );
        }

        paddings?.forEach((padding, index) => {
            this._elements[index]?.tile.style.setProperty(
                "--psp-summary--padding",
                `${padding}px`,
            );
        });
    }
}
