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

export class SpatialGrid {
    private _cells: Map<number, number[]> = new Map();
    private _xMin: number;
    private _yMin: number;
    private _cellSize: number;
    private _cols: number;

    constructor(
        xMin: number,
        xMax: number,
        yMin: number,
        yMax: number,
        cellSize: number,
    ) {
        this._xMin = xMin;
        this._yMin = yMin;
        this._cellSize = cellSize;
        this._cols = Math.max(1, Math.ceil((xMax - xMin) / cellSize));
    }

    private _cellKey(cx: number, cy: number): number {
        return cy * this._cols + cx;
    }

    insert(index: number, x: number, y: number): void {
        const cx = Math.floor((x - this._xMin) / this._cellSize);
        const cy = Math.floor((y - this._yMin) / this._cellSize);
        const key = this._cellKey(cx, cy);
        let cell = this._cells.get(key);
        if (!cell) {
            cell = [];
            this._cells.set(key, cell);
        }
        cell.push(index);
    }

    /**
     * Find the nearest point to (dataX, dataY) within the given radius,
     * measured in pixel distance using the provided scale factors.
     */
    query(
        dataX: number,
        dataY: number,
        radiusPx: number,
        pxPerDataX: number,
        pxPerDataY: number,
        xData: Float32Array,
        yData: Float32Array,
    ): number {
        const cellRadiusX = Math.ceil(radiusPx / pxPerDataX / this._cellSize);
        const cellRadiusY = Math.ceil(radiusPx / pxPerDataY / this._cellSize);
        const centerCX = Math.floor((dataX - this._xMin) / this._cellSize);
        const centerCY = Math.floor((dataY - this._yMin) / this._cellSize);

        let bestIdx = -1;
        let bestDistSq = radiusPx * radiusPx;

        for (
            let cy = centerCY - cellRadiusY;
            cy <= centerCY + cellRadiusY;
            cy++
        ) {
            for (
                let cx = centerCX - cellRadiusX;
                cx <= centerCX + cellRadiusX;
                cx++
            ) {
                const cell = this._cells.get(this._cellKey(cx, cy));
                if (!cell) continue;
                for (const i of cell) {
                    const dx = (xData[i] - dataX) * pxPerDataX;
                    const dy = (yData[i] - dataY) * pxPerDataY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < bestDistSq) {
                        bestDistSq = distSq;
                        bestIdx = i;
                    }
                }
            }
        }

        return bestIdx;
    }
}
