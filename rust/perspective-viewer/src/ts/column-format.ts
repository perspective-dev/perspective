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

/**
 * Cross-package helpers for per-column value formatting. Used by both
 * `viewer-datagrid` (cell formatting) and `viewer-charts` (axis ticks,
 * tooltips, legends) so a column's `number_format` / `date_format`
 * configuration produces identical output across plugins.
 *
 * The format configs mirror the `Intl.NumberFormatOptions` /
 * `Intl.DateTimeFormatOptions` shapes one-for-one — they're written
 * straight into the respective constructors.
 */

import type { CustomNumberFormatConfig } from "../../dist/ts-rs/CustomNumberFormatConfig.d.ts";
import type { NumberFormatStyle } from "../../dist/ts-rs/NumberFormatStyle.d.ts";
import type { Notation } from "../../dist/ts-rs/Notation.d.ts";
import type { DatetimeFormat } from "../../dist/ts-rs/DatetimeFormat.d.ts";

/**
 * A numeric column's `number_format` (`columns_config` value), exactly as
 * the Style tab's editor WRITES it — the ts-rs projection of the Rust
 * `CustomNumberFormatConfig`, re-composed with its serde-flattened
 * `style` and `notation` families (ts-rs cannot flatten `Option<enum>`,
 * so the Rust type `#[ts(skip)]`s them and they export separately).
 */
export type NumberFormatConfig = CustomNumberFormatConfig &
    Partial<NumberFormatStyle> &
    Partial<Notation>;

/**
 * A datetime column's `date_format` (`columns_config` value), a subset of
 * `Intl.DateTimeFormatOptions`.
 */
export type DateFormatConfig = DatetimeFormat;

/** The `date_format` keys that apply as one group. */
export const DATE_FORMAT_SHAPE_KEYS = [
    "dateStyle",
    "timeStyle",
    "weekday",
    "year",
    "month",
    "day",
    "hour",
    "minute",
    "second",
    "fractionalSecondDigits",
] as const satisfies readonly (keyof DateFormatConfig)[];

/** The `date_format` keys that apply individually. */
export const DATE_FORMAT_MODIFIER_KEYS = [
    "timeZone",
    "hour12",
] as const satisfies readonly (keyof DateFormatConfig)[];

/** Whether `cfg` sets any of the `date_format` keys that apply as one group. */
export function hasDateFormatShape(
    cfg: DateFormatConfig | undefined,
): cfg is DateFormatConfig {
    return DATE_FORMAT_SHAPE_KEYS.some((key) => cfg?.[key] !== undefined);
}

/** The `date_format` options that apply individually. */
export type DateFormatModifiers = Pick<
    Intl.DateTimeFormatOptions,
    "timeZone" | "hour12"
>;

/** The `date_format` keys of `cfg` that apply individually, if it sets any. */
export function dateFormatModifiers(
    cfg: DateFormatConfig | undefined,
): DateFormatModifiers | undefined {
    const out: DateFormatModifiers = {};
    if (cfg?.timeZone !== undefined) {
        out.timeZone = cfg.timeZone;
    }

    if (cfg?.hour12 !== undefined) {
        out.hour12 = cfg.hour12;
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Default `Intl.NumberFormatOptions` applied when a numeric column has no
 * `number_format` configured. Float columns get two fractional digits to
 * match the legacy datagrid behavior; integer columns get an empty
 * options bag (locale-default integer rendering).
 */
const NUMERIC_LEGACY_DEFAULTS: Record<string, Intl.NumberFormatOptions> = {
    float: {
        style: "decimal",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    },
};

/**
 * The viewer's own `date_format` for a datetime column, below every plugin
 * and override layer.
 */
const DATETIME_BASE: DateFormatConfig = {
    dateStyle: "short",
    timeStyle: "medium",
};

const DATE_BASE: DateFormatConfig & { dateStyle: "short" } = {
    dateStyle: "short",
};

const NUMBER_FORMAT_GROUPS: readonly (readonly string[])[] = [
    [
        "style",
        "currency",
        "currencyDisplay",
        "currencySign",
        "unit",
        "unitDisplay",
    ],
    ["notation", "compactDisplay"],
    ["minimumFractionDigits", "maximumFractionDigits"],
    ["minimumSignificantDigits", "maximumSignificantDigits"],
];

function mergeNumberOptions(
    base: Intl.NumberFormatOptions,
    cfg?: NumberFormatConfig,
): Intl.NumberFormatOptions {
    const explicit: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cfg ?? {})) {
        if (v !== undefined && v !== null) {
            explicit[k] = v;
        }
    }

    const merged: Record<string, unknown> = { ...base };
    for (const group of NUMBER_FORMAT_GROUPS) {
        if (group.some((key) => key in explicit)) {
            for (const key of group) {
                delete merged[key];
            }
        }
    }

    return Object.assign(merged, explicit) as Intl.NumberFormatOptions;
}

/**
 * `defaults` is the calling plugin's declared default format, filling in
 * the fields `cfg` leaves unset.
 */
export function createNumberFormatter(
    type: string,
    cfg?: NumberFormatConfig,
    defaults?: NumberFormatConfig,
): Intl.NumberFormat {
    // ts-rs renders serde-absent keys as `T | null`; the wire never
    // carries an explicit `null` (`skip_serializing_if`), and
    // `Intl.NumberFormat` treats both absent and `undefined` the same, so
    // the cast is presentation-only.
    const base = ((defaults as Intl.NumberFormatOptions | undefined) ??
        NUMERIC_LEGACY_DEFAULTS[type] ??
        {}) as Intl.NumberFormatOptions;

    const opts = cfg ? mergeNumberOptions(base, cfg) : base;
    return new Intl.NumberFormat(navigator.languages as string[], opts);
}

/**
 * `cfg` layered over `defaults`, then over `base`, by the `date_format`
 * group rule, as `Intl.DateTimeFormat` options.
 */
export function resolveDateFormat(
    cfg: DateFormatConfig | undefined,
    defaults: DateFormatConfig | undefined,
    base: DateFormatConfig,
): Intl.DateTimeFormatOptions {
    const layers = [cfg, defaults, base];
    const shape: DateFormatConfig = layers.find(hasDateFormatShape) ?? {};
    const opts: DateFormatConfig = {};
    const copy = <K extends keyof DateFormatConfig>(
        key: K,
        from: DateFormatConfig | undefined,
    ) => {
        if (from !== undefined && from[key] !== undefined) {
            opts[key] = from[key];
        }
    };

    for (const key of DATE_FORMAT_SHAPE_KEYS) {
        copy(key, shape);
    }

    for (const key of DATE_FORMAT_MODIFIER_KEYS) {
        copy(
            key,
            layers.find((layer) => layer?.[key] !== undefined),
        );
    }

    return opts;
}

/**
 * `defaults` is the calling plugin's declared default `date_format`, which
 * `cfg` overrides by the `date_format` group rule.
 */
export function createDatetimeFormatter(
    cfg?: DateFormatConfig,
    defaults?: DateFormatConfig,
): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(
        navigator.languages as string[],
        resolveDateFormat(cfg, defaults, DATETIME_BASE),
    );
}

/**
 * `defaults` follows the same contract as [`createDatetimeFormatter`];
 * only `dateStyle` applies, in UTC.
 */
export function createDateFormatter(
    cfg?: DateFormatConfig,
    defaults?: DateFormatConfig,
): Intl.DateTimeFormat {
    const { dateStyle } = resolveDateFormat(cfg, defaults, DATE_BASE);
    return new Intl.DateTimeFormat(navigator.languages as string[], {
        timeZone: "utc",
        dateStyle: dateStyle ?? DATE_BASE.dateStyle,
    });
}

/**
 * Recover the source column name from a synthetic split-by path. Split
 * pivoting produces paths of the form `<split_val_1>|...|<source_col>`;
 * per-column config (formatters, aggregate styling, …) is always keyed
 * on the trailing source column.
 */
export function sourceColumn(path: string): string {
    return path.split("|").at(-1) ?? path;
}
