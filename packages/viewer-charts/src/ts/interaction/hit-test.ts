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

import { SpatialGrid } from "./spatial-grid";

export interface HitBounds {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

/**
 * Wraps SpatialGrid with dirty-flag bookkeeping + the cell-size heuristic
 * (~√n cells), so chart code no longer repeats the insertion loop scaffold.
 * Callers drive the iteration through `rebuild` and the `visit` callback,
 * which lets scatter (flat array) and line (series-indexed array) share
 * the same code path.
 */
export class SpatialHitTester {
    private _grid: SpatialGrid | null = null;
    private _dirty = true;

    markDirty(): void {
        this._dirty = true;
    }

    get isDirty(): boolean {
        return this._dirty;
    }

    /**
     * Rebuild the grid. `forEachPoint` is called once with an insert
     * function; the caller drives iteration. Cleared when `pointCount`
     * is zero.
     */
    rebuild(
        bounds: HitBounds,
        pointCount: number,
        forEachPoint: (
            insert: (idx: number, x: number, y: number) => void,
        ) => void,
    ): void {
        if (pointCount === 0) {
            this._grid = null;
            this._dirty = false;
            return;
        }
        const xRange = bounds.xMax - bounds.xMin || 1;
        const yRange = bounds.yMax - bounds.yMin || 1;
        const avgRange = (xRange + yRange) / 2;
        const cellSize = avgRange / Math.max(1, Math.sqrt(pointCount));
        const grid = new SpatialGrid(
            bounds.xMin,
            bounds.xMax,
            bounds.yMin,
            bounds.yMax,
            cellSize,
        );
        forEachPoint((idx, x, y) => grid.insert(idx, x, y));
        this._grid = grid;
        this._dirty = false;
    }

    /** Query the nearest point within `radiusPx` of (dataX, dataY). */
    query(
        dataX: number,
        dataY: number,
        radiusPx: number,
        pxPerDataX: number,
        pxPerDataY: number,
        xData: Float32Array | null,
        yData: Float32Array | null,
    ): number {
        if (!this._grid || !xData || !yData) return -1;
        return this._grid.query(
            dataX,
            dataY,
            radiusPx,
            pxPerDataX,
            pxPerDataY,
            xData,
            yData,
        );
    }

    clear(): void {
        this._grid = null;
        this._dirty = true;
    }
}
