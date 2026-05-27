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

export type ChartType = "bar" | "line" | "scatter" | "area";

/**
 * Per-column interpolation mode for line / area glyphs.
 */
export type InterpolateMode = "skip" | "solid" | "transparent";

/**
 * Per-column entry inside the viewer's `columns_config` map.
 */
export interface ColumnChartConfig {
    /**
     * "Bar" | "Line" | "Scatter" | "Area" (case-insensitive). Invalid / missing → bar.
     */
    chart_type?: string;

    /**
     * Explicit stack override.
     */
    stack?: boolean;

    /**
     * Force this aggregate onto the secondary (right) Y axis,
     * independent of `autoAltYAxis` and the dual-axis ratio
     * heuristic.
     */
    alt_axis?: boolean;

    /**
     * Interpolation mode for line / area glyphs. See
     * {@link InterpolateMode}. Legacy values `true` / `false` are also
     * accepted by {@link resolveInterpolate} (mapped to `"solid"` /
     * `"skip"`). Default `"skip"`. No effect on bar / scatter.
     */
    interpolate?: InterpolateMode;
}

/**
 * Resolve the render glyph for an aggregate base name. Lookup key is the
 * *base* (e.g. `"Sales"`); composite arrow columns like `"North|Sales"`
 * should strip the prefix before calling — the bar pipeline already
 * tracks aggregates as base names, so call sites pass the base directly.
 */
export function resolveChartType(
    aggName: string,
    cfg: Record<string, ColumnChartConfig> | undefined,
    fallback: ChartType = "bar",
): ChartType {
    const raw = cfg?.[aggName]?.chart_type?.toLowerCase?.();
    if (
        raw === "bar" ||
        raw === "line" ||
        raw === "scatter" ||
        raw === "area"
    ) {
        return raw;
    }

    return fallback;
}

/**
 * Resolve whether a series stacks with its aggregate siblings.
 */
export function resolveStack(
    aggName: string,
    chartType: ChartType,
    cfg: Record<string, ColumnChartConfig> | undefined,
): boolean {
    const explicit = cfg?.[aggName]?.stack;
    if (typeof explicit === "boolean") {
        return explicit;
    }

    return chartType === "bar" || chartType === "area";
}

/**
 * Resolve whether a column is pinned to the secondary Y axis via
 * `columns_config[aggName].alt_axis`.
 */
export function resolveAltAxis(
    aggName: string,
    cfg: Record<string, ColumnChartConfig> | undefined,
): boolean {
    return cfg?.[aggName]?.alt_axis === true;
}

/**
 * Resolve the interpolation mode for this aggregate.
 */
export function resolveInterpolate(
    aggName: string,
    chartType: ChartType,
    cfg: Record<string, ColumnChartConfig> | undefined,
): InterpolateMode {
    if (chartType !== "line" && chartType !== "area") {
        return "skip";
    }

    const mode = cfg?.[aggName]?.interpolate;
    if (mode === undefined || chartType === "area") {
        return "solid";
    }

    return mode;
}
