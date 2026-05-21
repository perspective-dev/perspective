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

import type { PluginConfig } from "../charts/chart";

export type ChartType = "bar" | "line" | "scatter" | "area";

export type PluginChartType = ChartType | "candlestick" | "ohlc";

/**
 * Subset of `PluginConfig` keys that a chart impl actually consumes.
 * Drives `plugin_config_schema()` filtering — the host only renders
 * the controls listed here, and `plugin.restore({ plugin_config })`
 * still hands the full struct to the worker (other keys are inert).
 */
export type PluginConfigField = keyof PluginConfig;

export interface ChartTypeConfig {
    name: string;
    tag: string;
    category: string;
    selectMode: "select" | "toggle";
    initial: {
        count: number;
        names: string[];
    };
    max_cells: number;
    max_columns: number;
    default_chart_type?: PluginChartType;

    /**
     * Plugin-config keys this chart type renders controls for. Empty
     * for plugins with no global settings (heatmap / treemap /
     * sunburst). See {@link PluginConfig} for field semantics.
     */
    applicable_plugin_fields: readonly PluginConfigField[];

    /**
     * Per-chart-type overrides for `DEFAULT_PLUGIN_CONFIG`. Used when a
     * field's sensible default differs by chart family — currently
     * `include_zero` (true for Y Bar / Y Area / X Bar, false for line
     * / scatter / cartesian / financial). Applied at schema generation
     * and at `restore({})` so the effective default matches the
     * surfaced UI default.
     */
    plugin_field_defaults?: Partial<PluginConfig>;
}

const SERIES = "Series Charts";
const CART = "Cartesian Charts";
const HIER = "Hierarchical Charts";
const FIN = "Financial Charts";
const MAP = "Map Charts";
const X_AXIS = ["X Axis"];
const Y_AXIS = ["Y Axis"];
const SELECT = "select";
const TOGGLE = "toggle";

const DEFAULT_MAX_CELLS = 2_000_000;
const DEFAULT_MAX_COLUMNS = 10_000;

//  Plugin-config field sets, by chart family.
//
// Series charts paint bars / lines / scatter / area glyphs (selected
// per-column via `chart_type`), so the union covers every glyph that
// might appear. `auto_alt_y_axis` + `series_zoom_mode` are Series-only.
const SERIES_FIELDS: readonly PluginConfigField[] = [
    "auto_alt_y_axis",
    "facet_mode",
    "series_zoom_mode",
    "include_zero",
    "domain_mode",
    "line_width_px",
    "point_size_px",
    "band_inner_frac",
    "bar_inner_pad",
];

// Bar / area series glyphs grow from the zero baseline, so the value
// axis must enclose 0 to render correctly. Line / scatter glyphs have
// no such constraint — their default `include_zero` stays `false`.
const ZERO_ANCHORED_DEFAULTS: Partial<PluginConfig> = { include_zero: true };

// Pure Cartesian (X/Y Scatter, X/Y Line) — no categorical axis, so no
// band geometry; gets the facet-routing variant of zoom_mode.
const CARTESIAN_FIELDS: readonly PluginConfigField[] = [
    "facet_mode",
    "facet_zoom_mode",
    "domain_mode",
    "line_width_px",
    "point_size_px",
];

// Candlestick/OHLC share the categorical-X build pipeline (band slots)
// and add their two stroke widths.
const FIN_FIELDS: readonly PluginConfigField[] = [
    "facet_mode",
    "series_zoom_mode",
    "domain_mode",
    "band_inner_frac",
    "bar_inner_pad",
    "wick_width_px",
    "ohlc_line_width_px",
];

// Hierarchical — none of the listed fields apply.
const NO_FIELDS: readonly PluginConfigField[] = [];

// Heatmap
const HEATMAP_FIELDS: readonly PluginConfigField[] = ["facet_zoom_mode"];

// Map — reuses the cartesian build pipeline with a Mercator
// projection hook. Carries the basemap controls (`map_tile_provider`,
// `map_tile_alpha`) plus the relevant glyph-styling fields the
// underlying chart type already uses. Density-on-map adds the four
// gradient knobs on top.
const MAP_BASE_FIELDS: readonly PluginConfigField[] = [
    "facet_mode",
    "facet_zoom_mode",
    "domain_mode",
    "map_tile_provider",
    "map_tile_alpha",
];
const MAP_SCATTER_FIELDS: readonly PluginConfigField[] = [
    ...MAP_BASE_FIELDS,
    "point_size_px",
];
const MAP_LINE_FIELDS: readonly PluginConfigField[] = [
    ...MAP_BASE_FIELDS,
    "line_width_px",
];
const MAP_DENSITY_FIELDS: readonly PluginConfigField[] = [
    ...MAP_BASE_FIELDS,
    "gradient_color_mode",
    "gradient_radius_px",
    "gradient_intensity",
    "gradient_heat_max",
];

// Density — shares the cartesian build pipeline (X/Y numeric
// with an optional Color column), then routes through the density-field
// glyph. Reuses the cartesian facet/zoom controls and adds the three
// shader-specific knobs.
const DENSITY_FIELDS: readonly PluginConfigField[] = [
    "facet_mode",
    "facet_zoom_mode",
    "domain_mode",
    "gradient_color_mode",
    "gradient_radius_px",
    "gradient_intensity",
    "gradient_heat_max",
];

function make(
    name: string,
    tag: string,
    category: string,
    selectMode: "select" | "toggle",
    count: number,
    names: readonly string[],
    applicable_plugin_fields: readonly PluginConfigField[],
    overrides?: Partial<
        Pick<
            ChartTypeConfig,
            | "max_cells"
            | "max_columns"
            | "default_chart_type"
            | "plugin_field_defaults"
        >
    >,
): ChartTypeConfig {
    return {
        name,
        tag,
        category,
        selectMode,
        initial: { count, names: names as string[] },
        max_cells: overrides?.max_cells ?? DEFAULT_MAX_CELLS,
        max_columns: overrides?.max_columns ?? DEFAULT_MAX_COLUMNS,
        applicable_plugin_fields,
        ...(overrides?.default_chart_type
            ? { default_chart_type: overrides.default_chart_type }
            : {}),
        ...(overrides?.plugin_field_defaults
            ? { plugin_field_defaults: overrides.plugin_field_defaults }
            : {}),
    };
}

const FIN_NAMES = ["Open", "Close", "High", "Low", "Tooltip"];
const HIER_NAMES = ["Size", "Color", "Tooltip"];

const CHARTS: ChartTypeConfig[] = [
    make("X Bar", "x-bar", SERIES, SELECT, 1, X_AXIS, SERIES_FIELDS, {
        default_chart_type: "bar",
        plugin_field_defaults: ZERO_ANCHORED_DEFAULTS,
    }),
    make("Y Bar", "y-bar", SERIES, SELECT, 1, Y_AXIS, SERIES_FIELDS, {
        default_chart_type: "bar",
        plugin_field_defaults: ZERO_ANCHORED_DEFAULTS,
    }),
    make("Y Line", "y-line", SERIES, SELECT, 1, Y_AXIS, SERIES_FIELDS, {
        default_chart_type: "line",
    }),
    make("Y Scatter", "y-scatter", SERIES, SELECT, 1, Y_AXIS, SERIES_FIELDS, {
        default_chart_type: "scatter",
    }),
    make("Y Area", "y-area", SERIES, SELECT, 1, Y_AXIS, SERIES_FIELDS, {
        default_chart_type: "area",
        plugin_field_defaults: ZERO_ANCHORED_DEFAULTS,
    }),
    make(
        "X/Y Scatter",
        "scatter",
        CART,
        TOGGLE,
        2,
        ["X Axis", "Y Axis", "Color", "Size", "Label", "Tooltip"],
        CARTESIAN_FIELDS,
    ),
    make(
        "X/Y Line",
        "line",
        CART,
        SELECT,
        2,
        ["X Axis", "Y Axis", "Tooltip"],
        CARTESIAN_FIELDS,
    ),
    make(
        "Density",
        "density",
        CART,
        TOGGLE,
        2,
        ["X Axis", "Y Axis", "Color", "Tooltip"],
        DENSITY_FIELDS,
    ),
    make("Treemap", "treemap", HIER, TOGGLE, 1, HIER_NAMES, NO_FIELDS),
    make("Sunburst", "sunburst", HIER, TOGGLE, 1, HIER_NAMES, NO_FIELDS),
    make("Heatmap", "heatmap", HIER, SELECT, 1, ["Color"], HEATMAP_FIELDS),
    make("Candlestick", "candlestick", FIN, TOGGLE, 1, FIN_NAMES, FIN_FIELDS, {
        default_chart_type: "candlestick",
    }),
    make("OHLC", "ohlc", FIN, TOGGLE, 1, FIN_NAMES, FIN_FIELDS, {
        default_chart_type: "ohlc",
    }),
    make(
        "Map Scatter",
        "map-scatter",
        MAP,
        TOGGLE,
        2,
        ["Longitude", "Latitude", "Color", "Size", "Label", "Tooltip"],
        MAP_SCATTER_FIELDS,
    ),
    make(
        "Map Line",
        "map-line",
        MAP,
        SELECT,
        2,
        ["Longitude", "Latitude", "Tooltip"],
        MAP_LINE_FIELDS,
    ),
    make(
        "Map Density",
        "map-density",
        MAP,
        TOGGLE,
        2,
        ["Longitude", "Latitude", "Color", "Tooltip"],
        MAP_DENSITY_FIELDS,
    ),
];

export default CHARTS;
