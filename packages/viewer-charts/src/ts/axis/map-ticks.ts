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

import type { PlotLayout } from "../layout/plot-layout";
import { computeNiceTicks } from "../layout/ticks";
import {
    lonLatToMercator,
    mercatorToLonLat,
    MAX_LAT,
    WORLD_HALF,
} from "../map/mercator";

export interface MapDegreeTicks {
    xTicks: number[];
    yTicks: number[];
    formatX: (meters: number) => string;
    formatY: (meters: number) => string;
}

/**
 * Compute "nice" longitude/latitude ticks for the visible window of a
 * map layout. Must be called AFTER `buildProjectionMatrix` has seeded
 * the layout's padded-domain fields — the ticks are derived from the
 * exact meter domain the projection maps, or labels would misalign
 * with glyphs.
 */
export function computeMapDegreeTicks(layout: PlotLayout): MapDegreeTicks {
    const plot = layout.plotRect;
    const targetX = Math.max(2, Math.floor(plot.width / 90));
    const targetY = Math.max(2, Math.floor(plot.height / 60));

    const lonMin = metersToLon(layout.paddedXMin);
    const lonMax = metersToLon(layout.paddedXMax);
    const latMin = clampLat(mercatorToLonLat(0, layout.paddedYMin)[1]);
    const latMax = clampLat(mercatorToLonLat(0, layout.paddedYMax)[1]);

    const lonTicks = safeNiceTicks(lonMin, lonMax, targetX);
    const latTicks = safeNiceTicks(latMin, latMax, targetY);
    const lonStep = tickStep(lonTicks);
    const latStep = tickStep(latTicks);

    return {
        xTicks: lonTicks.map((deg) => (deg / 180) * WORLD_HALF),
        yTicks: latTicks.map((deg) => lonLatToMercator(0, deg)[1]),
        formatX: (m) => formatDegrees(metersToLon(m), lonStep, "E", "W"),
        formatY: (m) =>
            formatDegrees(mercatorToLonLat(0, m)[1], latStep, "N", "S"),
    };
}

function metersToLon(m: number): number {
    return (m / WORLD_HALF) * 180;
}

function clampLat(lat: number): number {
    return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

function safeNiceTicks(min: number, max: number, target: number): number[] {
    if (!isFinite(min) || !isFinite(max) || max <= min) {
        return [];
    }

    return computeNiceTicks(min, max, target);
}

function tickStep(ticks: number[]): number {
    return ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
}

function formatDegrees(
    deg: number,
    step: number,
    pos: string,
    neg: string,
): string {
    const decimals =
        step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) + 1e-9));
    const magnitude = String(parseFloat(Math.abs(deg).toFixed(decimals)));
    if (parseFloat(magnitude) === 0) {
        return "0°";
    }

    return `${magnitude}°${deg > 0 ? pos : neg}`;
}
