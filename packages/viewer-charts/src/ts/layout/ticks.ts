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

function niceNum(value: number, round: boolean): number {
    const exp = Math.floor(Math.log10(value));
    const frac = value / Math.pow(10, exp);
    let nice: number;
    if (round) {
        if (frac < 1.5) {
            nice = 1;
        } else if (frac < 3) {
            nice = 2;
        } else if (frac < 7) {
            nice = 5;
        } else {
            nice = 10;
        }
    } else {
        if (frac <= 1) {
            nice = 1;
        } else if (frac <= 2) {
            nice = 2;
        } else if (frac <= 5) {
            nice = 5;
        } else {
            nice = 10;
        }
    }

    return nice * Math.pow(10, exp);
}

/**
 * Generate an array of "nice" tick values spanning [min, max].
 * @param min - Domain minimum
 * @param max - Domain maximum
 * @param targetCount - Desired number of ticks (approximate)
 */
export function computeNiceTicks(
    min: number,
    max: number,
    targetCount: number,
): number[] {
    if (targetCount < 1) {
        targetCount = 1;
    }

    const range = niceNum(max - min, false);
    const step = niceNum(range / targetCount, true);
    const tickMin = Math.ceil(min / step) * step;
    const tickMax = Math.floor(max / step) * step;

    const ticks: number[] = [];

    // Use epsilon to avoid floating point overshoot
    for (let t = tickMin; t <= tickMax + step * 0.001; t += step) {
        ticks.push(t);
    }

    return ticks;
}

export function stepTickFormatter(
    isDate: boolean | undefined,
    ticks: number[] | null | undefined,
): (v: number) => string {
    if (!isDate) {
        return formatTickValue;
    }

    const step = ticks && ticks.length > 1 ? ticks[1] - ticks[0] : 0;
    return (v: number) => formatDateTickValue(v, step);
}

/**
 * Format a numeric tick value for display.
 * Uses K/M/B suffixes for large numbers, fixed decimals for small.
 *
 * Total over any input: label formatters run inside render passes, so a
 * non-finite value (or `undefined` smuggled in by an upstream
 * out-of-bounds read) must degrade to a placeholder, never throw the
 * frame away.
 */
export function formatTickValue(val: number): string {
    if (!Number.isFinite(val)) {
        return "-";
    }

    const abs = Math.abs(val);
    if (abs === 0) {
        return "0";
    }

    if (abs >= 1e9) {
        return (val / 1e9).toFixed(1) + "B";
    }

    if (abs >= 1e6) {
        return (val / 1e6).toFixed(1) + "M";
    }

    if (abs >= 1e3) {
        return (val / 1e3).toFixed(1) + "K";
    }

    if (Number.isInteger(val)) {
        return val.toString();
    }

    if (abs >= 1) {
        return val.toFixed(1);
    }

    return val.toFixed(2);
}

/**
 * Cached `Intl.DateTimeFormat` per option shape. `Date.prototype.
 * toLocale*` constructs a fresh `DateTimeFormat` (plus its ICU
 * backing) on EVERY call — ~30µs each — which turned per-row label
 * synthesis over large pivots into a multi-second stall. A cached
 * formatter's `format()` is ~1µs. Keyed by precision tier; the
 * default locale is fixed for the lifetime of the worker, so entries
 * never invalidate.
 */
const DATE_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat>();

function cachedDateFormat(
    key: string,
    options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
    let fmt = DATE_FORMAT_CACHE.get(key);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat(undefined, options);
        DATE_FORMAT_CACHE.set(key, fmt);
    }

    return fmt;
}

/**
 * Format a timestamp (ms since epoch) as a human-readable date/time label.
 * Adapts precision based on the tick spacing.
 */
export function formatDateTickValue(val: number, stepMs?: number): string {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
        return formatTickValue(val);
    }

    // If step is provided, choose precision based on tick interval
    if (stepMs !== undefined && stepMs > 0) {
        const DAY = 86_400_000;
        const HOUR = 3_600_000;
        const MINUTE = 60_000;

        if (stepMs >= DAY * 28) {
            // Monthly or longer — show year-month
            return cachedDateFormat("ym", {
                year: "numeric",
                month: "short",
            }).format(d);
        }

        if (stepMs >= DAY) {
            // Daily — show month and day
            return cachedDateFormat("md", {
                month: "short",
                day: "numeric",
            }).format(d);
        }

        if (stepMs >= HOUR) {
            // Hourly
            return cachedDateFormat("mdh", {
                month: "short",
                day: "numeric",
                hour: "numeric",
            }).format(d);
        }

        if (stepMs >= MINUTE) {
            // Minutes
            return cachedDateFormat("hm", {
                hour: "numeric",
                minute: "2-digit",
            }).format(d);
        }

        // Sub-minute
        return cachedDateFormat("hms", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
        }).format(d);
    }

    // Default: show date only
    return cachedDateFormat("ymd", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(d);
}
