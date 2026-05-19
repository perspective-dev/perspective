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
 * Per-column entry inside the viewer's `columns_config` map. The map itself
 * is typed as `Record<string, any>` at the plugin boundary because
 * `columns_config` is shared across plugins; this interface documents the
 * keys the Y-bar glyph router consumes.
 */
export interface ColumnChartConfig {
    /**
     * "Bar" | "Line" | "Scatter" | "Area" (case-insensitive). Invalid / missing → bar.
     */
    chart_type?: string;

    /**
     * Explicit stack override. If omitted: bar / area stack by default,
     * line / scatter do not.
     */
    stack?: boolean;

    /**
     * Force this aggregate onto the secondary (right) Y axis,
     * independent of `autoAltYAxis` and the dual-axis ratio
     * heuristic. Missing / false → axis assignment is driven by
     * `autoAltYAxis` alone.
     */
    alt_axis?: boolean;
}

/**
 * Resolve the render glyph for an aggregate base name. Lookup key is the
 * *base* (e.g. `"Sales"`); composite arrow columns like `"North|Sales"`
 * should strip the prefix before calling — the bar pipeline already
 * tracks aggregates as base names, so call sites pass the base directly.
 *
 * `fallback` is the plugin's default glyph (e.g. `"line"` for Y Line),
 * supplied by the plugin element via `setDefaultChartType`. Falls back to
 * `"bar"` when the plugin never set one.
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
 * Default: `true` for bar/area, `false` for line/scatter. Overridable
 * per column via `columns_config[aggName].stack`.
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
 * `columns_config[aggName].alt_axis`. Independent of `autoAltYAxis`:
 * when `true`, the per-column override forces axis 1 regardless of
 * the auto-split heuristic.
 */
export function resolveAltAxis(
    aggName: string,
    cfg: Record<string, ColumnChartConfig> | undefined,
): boolean {
    return cfg?.[aggName]?.alt_axis === true;
}
