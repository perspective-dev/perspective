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

export interface NumberFormatConfig {
    style?: "decimal" | "currency" | "percent" | "unit";
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    minimumIntegerDigits?: number;
    minimumSignificantDigits?: number;
    maximumSignificantDigits?: number;
    currency?: string;
    currencyDisplay?: "code" | "symbol" | "narrowSymbol" | "name";
    notation?: "standard" | "scientific" | "engineering" | "compact";
    compactDisplay?: "short" | "long";
    useGrouping?: boolean;
}

export interface DateFormatConfig {
    format?: "custom" | string;
    timeZone?: string;
    dateStyle?: "short" | "medium" | "long" | "full" | "disabled";
    timeStyle?: "short" | "medium" | "long" | "full" | "disabled";
    second?: "numeric" | "2-digit" | "disabled";
    minute?: "numeric" | "2-digit" | "disabled";
    hour?: "numeric" | "2-digit" | "disabled";
    day?: "numeric" | "2-digit" | "disabled";
    weekday?: "narrow" | "short" | "long" | "disabled";
    month?: "numeric" | "2-digit" | "narrow" | "short" | "long" | "disabled";
    year?: "numeric" | "2-digit" | "disabled";
    hour12?: boolean;
    fractionalSecondDigits?: 1 | 2 | 3;
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
    const opts: Intl.NumberFormatOptions =
        cfg ?? NUMERIC_LEGACY_DEFAULTS[type] ?? {};
    return new Intl.NumberFormat(navigator.languages as string[], opts);
}

export function createDatetimeFormatter(
    cfg?: DateFormatConfig,
): Intl.DateTimeFormat {
    if (!cfg || cfg.format !== "custom") {
        const opts: Intl.DateTimeFormatOptions = {
            timeZone: cfg?.timeZone,
            dateStyle:
                cfg?.dateStyle === "disabled"
                    ? undefined
                    : (cfg?.dateStyle ?? DATETIME_LEGACY_DEFAULTS.dateStyle),
            timeStyle:
                cfg?.timeStyle === "disabled"
                    ? undefined
                    : (cfg?.timeStyle ?? DATETIME_LEGACY_DEFAULTS.timeStyle),
        };

        return new Intl.DateTimeFormat(navigator.languages as string[], opts);
    }

    const opts: Intl.DateTimeFormatOptions = {
        timeZone: cfg.timeZone,
        hour12: cfg.hour12 ?? true,
        fractionalSecondDigits: cfg.fractionalSecondDigits,
    };
    if (cfg.year !== "disabled") {
        opts.year = cfg.year ?? "2-digit";
    }
    if (cfg.month !== "disabled") {
        opts.month = cfg.month ?? "numeric";
    }
    if (cfg.day !== "disabled") {
        opts.day = cfg.day ?? "numeric";
    }
    if (cfg.weekday && cfg.weekday !== "disabled") {
        opts.weekday = cfg.weekday;
    }
    if (cfg.hour !== "disabled") {
        opts.hour = cfg.hour ?? "numeric";
    }
    if (cfg.minute !== "disabled") {
        opts.minute = cfg.minute ?? "numeric";
    }
    if (cfg.second !== "disabled") {
        opts.second = cfg.second ?? "numeric";
    }
    return new Intl.DateTimeFormat(navigator.languages as string[], opts);
}

export function createDateFormatter(
    cfg?: DateFormatConfig,
): Intl.DateTimeFormat {
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: "utc",
        dateStyle:
            cfg?.dateStyle === "disabled"
                ? undefined
                : (cfg?.dateStyle ?? DATE_LEGACY_DEFAULTS.dateStyle),
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
