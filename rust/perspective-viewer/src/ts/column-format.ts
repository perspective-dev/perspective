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
 * straight into the respective constructors. The `date_format.format`
 * discriminator ("simple" | "custom") selects between two derivation
 * paths: simple uses `dateStyle` / `timeStyle`, custom uses the
 * per-field overrides (year / month / day / ...).
 */

import type { CustomNumberFormatConfig } from "./ts-rs/CustomNumberFormatConfig.d.ts";
import type { NumberFormatStyle } from "./ts-rs/NumberFormatStyle.d.ts";
import type { Notation } from "./ts-rs/Notation.d.ts";
import type { DatetimeFormatType } from "./ts-rs/DatetimeFormatType.d.ts";
import type { SimpleDatetimeStyleConfig } from "./ts-rs/SimpleDatetimeStyleConfig.d.ts";

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
 * A datetime column's `date_format` (`columns_config` value) — the Rust
 * `DatetimeFormatType` union: a `Simple` preset (`dateStyle` /
 * `timeStyle`), or per-part custom fields discriminated by
 * `format: "custom"`.
 */
export type DateFormatConfig = DatetimeFormatType;

/** Narrow a [`DateFormatConfig`] to its `Simple` arm, if it is one. */
function simple_config(
    cfg?: DateFormatConfig,
): SimpleDatetimeStyleConfig | undefined {
    return cfg && !("format" in cfg) ? cfg : undefined;
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
 * Default `Intl.DateTimeFormatOptions` applied when a datetime column has
 * no `date_format` configured.
 */
const DATETIME_LEGACY_DEFAULTS: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "medium",
};

const DATE_LEGACY_DEFAULTS: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
};

export function createNumberFormatter(
    type: string,
    cfg?: NumberFormatConfig,
): Intl.NumberFormat {
    // ts-rs renders serde-absent keys as `T | null`; the wire never
    // carries an explicit `null` (`skip_serializing_if`), and
    // `Intl.NumberFormat` treats both absent and `undefined` the same, so
    // the cast is presentation-only.
    const opts = (cfg ??
        NUMERIC_LEGACY_DEFAULTS[type] ??
        {}) as Intl.NumberFormatOptions;
    return new Intl.NumberFormat(navigator.languages as string[], opts);
}

export function createDatetimeFormatter(
    cfg?: DateFormatConfig,
): Intl.DateTimeFormat {
    if (!cfg || !("format" in cfg)) {
        const preset = simple_config(cfg);
        const opts: Intl.DateTimeFormatOptions = {
            timeZone: preset?.timeZone ?? undefined,
            dateStyle:
                preset?.dateStyle === "disabled"
                    ? undefined
                    : (preset?.dateStyle ?? DATETIME_LEGACY_DEFAULTS.dateStyle),
            timeStyle:
                preset?.timeStyle === "disabled"
                    ? undefined
                    : (preset?.timeStyle ?? DATETIME_LEGACY_DEFAULTS.timeStyle),
        };

        return new Intl.DateTimeFormat(navigator.languages as string[], opts);
    }

    // Per-part fields are the shared `CustomDatetimeFormat` enum; the
    // editor only writes each part's `Intl`-valid subset, so the
    // narrowing casts below are presentation-only.
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: cfg.timeZone ?? undefined,
        hour12: cfg.hour12 ?? true,
        fractionalSecondDigits: cfg.fractionalSecondDigits as
            | 1
            | 2
            | 3
            | undefined,
    };
    if (cfg.year !== "disabled") {
        opts.year = (cfg.year ??
            "2-digit") as Intl.DateTimeFormatOptions["year"];
    }
    if (cfg.month !== "disabled") {
        opts.month = (cfg.month ??
            "numeric") as Intl.DateTimeFormatOptions["month"];
    }
    if (cfg.day !== "disabled") {
        opts.day = (cfg.day ?? "numeric") as Intl.DateTimeFormatOptions["day"];
    }
    if (cfg.weekday && cfg.weekday !== "disabled") {
        opts.weekday = cfg.weekday as Intl.DateTimeFormatOptions["weekday"];
    }
    if (cfg.hour !== "disabled") {
        opts.hour = (cfg.hour ??
            "numeric") as Intl.DateTimeFormatOptions["hour"];
    }
    if (cfg.minute !== "disabled") {
        opts.minute = (cfg.minute ??
            "numeric") as Intl.DateTimeFormatOptions["minute"];
    }
    if (cfg.second !== "disabled") {
        opts.second = (cfg.second ??
            "numeric") as Intl.DateTimeFormatOptions["second"];
    }
    return new Intl.DateTimeFormat(navigator.languages as string[], opts);
}

export function createDateFormatter(
    cfg?: DateFormatConfig,
): Intl.DateTimeFormat {
    const preset = simple_config(cfg);
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: "utc",
        dateStyle:
            preset?.dateStyle === "disabled"
                ? undefined
                : (preset?.dateStyle ?? DATE_LEGACY_DEFAULTS.dateStyle),
    };
    return new Intl.DateTimeFormat(navigator.languages as string[], opts);
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
