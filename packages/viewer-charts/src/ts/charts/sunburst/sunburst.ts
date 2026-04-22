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

import type { ColumnDataMap } from "../../data/view-reader";
import type { WebGLContextManager } from "../../webgl/context-manager";
import { TreeChartBase } from "../common/tree-chart";
import { NULL_NODE } from "../common/node-store";
import {
    processTreeChunk,
    finalizeTree,
    resetTreeState,
} from "../common/tree-data";
import {
    renderSunburstFrame,
    renderSunburstChromeOverlay,
} from "./sunburst-render";
import {
    handleSunburstHover,
    handleSunburstClick,
    showSunburstPinnedTooltip,
    dismissSunburstPinnedTooltip,
    type SunburstBreadcrumbRegion,
} from "./sunburst-interact";

export interface SunburstLocations {
    u_center: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_border_px: WebGLUniformLocation | null;
    a_strip_t: number;
    a_side: number;
    a_angles: number;
    a_radii: number;
    a_color: number;
}

/**
 * Sunburst chart. Shares tree storage + streaming pipeline + color
 * mode with `TreeChartBase`; adds polar layout + instanced-arc WebGL
 * rendering + drill / tooltip interactions.
 *
 * Internal option: `_labelRotation` — `"upright"` keeps labels on the
 * left half flipped 180° so they read upright (d3fc behavior);
 * `"radial"` leaves them purely tangent to the arc. Defaults to
 * `"upright"`; toggle here if a call site wants flat radial labels.
 */
export class SunburstChart extends TreeChartBase {
    _program: WebGLProgram | null = null;
    _locations: SunburstLocations | null = null;
    _stripBuffer: WebGLBuffer | null = null;
    _instanceBuffer: WebGLBuffer | null = null;
    _instanceCount = 0;

    /** Label orientation mode — see class docstring. */
    _labelRotation: "upright" | "radial" = "upright";

    // Center / radius state resolved per frame.
    _centerX = 0;
    _centerY = 0;
    _maxRadius = 0;

    // ── Interaction ──────────────────────────────────────────────────────
    _hoveredNodeId: number = NULL_NODE;
    _pinnedNodeId: number = NULL_NODE;
    _breadcrumbRegions: SunburstBreadcrumbRegion[] = [];

    _chromeCache: ImageBitmap | null = null;
    _chromeCacheDirty = true;

    attachTooltip(glCanvas: HTMLCanvasElement): void {
        this._glCanvas = glCanvas;
        this._tooltip.attach(glCanvas, {
            onHover: (mx, my) => handleSunburstHover(this, mx, my),
            onLeave: () => {
                if (
                    this._hoveredNodeId !== NULL_NODE &&
                    this._pinnedNodeId === NULL_NODE
                ) {
                    this._hoveredNodeId = NULL_NODE;
                    renderSunburstChromeOverlay(this);
                }
            },
            onClickPre: (mx, my) => {
                handleSunburstClick(this, mx, my);
                return true;
            },
        });
    }

    uploadAndRender(
        glManager: WebGLContextManager,
        columns: ColumnDataMap,
        startRow: number,
        _endRow: number,
    ): void {
        this._glManager = glManager;

        if (startRow === 0) {
            this._cancelScheduledRender();

            this._allColumns = Array.from(columns.keys()).filter(
                (k) => !k.startsWith("__"),
            );

            const slots = this._columnSlots;
            this._sizeName = slots[0] || this._allColumns[0] || "";
            this._colorName = slots[1] || "";
            if (!this._colorName) {
                this._colorMode = "empty";
            } else {
                const t = this._columnTypes[this._colorName];
                const isNumeric =
                    t === "float" ||
                    t === "integer" ||
                    t === "date" ||
                    t === "datetime";
                this._colorMode = isNumeric ? "numeric" : "series";
            }

            resetTreeState(this);
        }

        processTreeChunk(this, columns);
        finalizeTree(this);
        if (this._rootId !== NULL_NODE) this._scheduleRender(glManager);
    }

    redraw(glManager: WebGLContextManager): void {
        this._glManager = glManager;
        if (this._rootId !== NULL_NODE) this._scheduleRender(glManager);
    }

    protected _fullRender(glManager: WebGLContextManager): void {
        renderSunburstFrame(this, glManager);
    }

    protected destroyInternal(): void {
        dismissSunburstPinnedTooltip(this);
        this._chromeCache?.close();
        this._chromeCache = null;
        const gl = this._glManager?.gl;
        if (gl) {
            if (this._stripBuffer) gl.deleteBuffer(this._stripBuffer);
            if (this._instanceBuffer) gl.deleteBuffer(this._instanceBuffer);
        }
        this._stripBuffer = null;
        this._instanceBuffer = null;
        this._program = null;
        this._locations = null;
        this._rootId = NULL_NODE;
        this._currentRootId = NULL_NODE;
        this._breadcrumbIds = [];
        this._childLookup.clear();
        this._numericRowData.clear();
        this._stringRowData.clear();
        this._visibleNodeIds = null;
        this._visibleNodeCount = 0;
        this._breadcrumbRegions = [];
    }
}
