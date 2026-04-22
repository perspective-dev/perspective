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
        if (frac < 1.5) nice = 1;
        else if (frac < 3) nice = 2;
        else if (frac < 7) nice = 5;
        else nice = 10;
    } else {
        if (frac <= 1) nice = 1;
        else if (frac <= 2) nice = 2;
        else if (frac <= 5) nice = 5;
        else nice = 10;
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
    if (targetCount < 1) targetCount = 1;
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

/**
 * Format a numeric tick value for display.
 * Uses K/M/B suffixes for large numbers, fixed decimals for small.
 */
export function formatTickValue(val: number): string {
    const abs = Math.abs(val);
    if (abs === 0) return "0";
    if (abs >= 1e9) return (val / 1e9).toFixed(1) + "B";
    if (abs >= 1e6) return (val / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return (val / 1e3).toFixed(1) + "K";
    if (Number.isInteger(val)) return val.toString();
    if (abs >= 1) return val.toFixed(1);
    return val.toFixed(2);
}

/**
 * Format a timestamp (ms since epoch) as a human-readable date/time label.
 * Adapts precision based on the tick spacing.
 */
export function formatDateTickValue(val: number, stepMs?: number): string {
    const d = new Date(val);
    if (isNaN(d.getTime())) return formatTickValue(val);

    // If step is provided, choose precision based on tick interval
    if (stepMs !== undefined && stepMs > 0) {
        const DAY = 86_400_000;
        const HOUR = 3_600_000;
        const MINUTE = 60_000;

        if (stepMs >= DAY * 28) {
            // Monthly or longer — show year-month
            return d.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
            });
        }
        if (stepMs >= DAY) {
            // Daily — show month and day
            return d.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
            });
        }
        if (stepMs >= HOUR) {
            // Hourly
            return d.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
            });
        }
        if (stepMs >= MINUTE) {
            // Minutes
            return d.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
            });
        }
        // Sub-minute
        return d.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    // Default: show date only
    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
