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
    DateFormatConfig,
    DateFormatModifiers,
    Formatter,
} from "@perspective-dev/viewer";
import { plugin_utils } from "../plugin_utils.ts";

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
    modifiers?: DateFormatModifiers,
): (v: number) => string {
    if (!isDate) {
        return formatTickValue;
    }

    const step = ticks && ticks.length > 1 ? ticks[1] - ticks[0] : 0;
    return (v: number) => formatDateTickValue(v, step, modifiers);
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
 * Formatters by precision tier and date modifiers, never invalidated as the
 * worker's locale is fixed.
 */
const DATE_FORMAT_CACHE = new Map<string, Formatter>();

function cachedDateFormat(
    tier: string,
    options: DateFormatConfig,
    modifiers?: DateFormatModifiers,
): Formatter {
    const key = `${tier}|${modifiers?.timeZone ?? ""}|${modifiers?.hour12 ?? ""}`;
    let fmt = DATE_FORMAT_CACHE.get(key);
    if (!fmt) {
        fmt = plugin_utils().formatter("datetime", {
            ...options,
            ...modifiers,
        })!;

        DATE_FORMAT_CACHE.set(key, fmt);
    }

    return fmt;
}

/** The formatter whose precision suits ticks `stepMs` apart, date-only without a step. */
function dateTickFormatter(
    stepMs?: number,
    modifiers?: DateFormatModifiers,
): Formatter {
    if (stepMs !== undefined && stepMs > 0) {
        const DAY = 86_400_000;
        const HOUR = 3_600_000;
        const MINUTE = 60_000;

        if (stepMs >= DAY * 28) {
            return cachedDateFormat(
                "ym",
                {
                    year: "numeric",
                    month: "short",
                },
                modifiers,
            );
        }

        if (stepMs >= DAY) {
            return cachedDateFormat(
                "md",
                {
                    month: "short",
                    day: "numeric",
                },
                modifiers,
            );
        }

        if (stepMs >= HOUR) {
            return cachedDateFormat(
                "mdh",
                {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                },
                modifiers,
            );
        }

        if (stepMs >= MINUTE) {
            return cachedDateFormat(
                "hm",
                {
                    hour: "numeric",
                    minute: "2-digit",
                },
                modifiers,
            );
        }

        return cachedDateFormat(
            "hms",
            {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
            },
            modifiers,
        );
    }

    return cachedDateFormat(
        "ymd",
        {
            year: "numeric",
            month: "short",
            day: "numeric",
        },
        modifiers,
    );
}

/**
 * Format a timestamp (ms since epoch) as a date/time label whose precision
 * suits the tick spacing.
 */
export function formatDateTickValue(
    val: number,
    stepMs?: number,
    modifiers?: DateFormatModifiers,
): string {
    if (isNaN(new Date(val).getTime())) {
        return formatTickValue(val);
    }

    return dateTickFormatter(stepMs, modifiers).format(val);
}

/** {@link formatDateTickValue} over every one of `vals` in one call. */
export function formatDateTickValues(
    vals: number[],
    stepMs?: number,
    modifiers?: DateFormatModifiers,
): string[] {
    const out = dateTickFormatter(stepMs, modifiers).format_strings(
        new Float64Array(vals),
    );

    for (let i = 0; i < vals.length; i++) {
        if (isNaN(new Date(vals[i]).getTime())) {
            out[i] = formatTickValue(vals[i]);
        }
    }

    return out;
}
