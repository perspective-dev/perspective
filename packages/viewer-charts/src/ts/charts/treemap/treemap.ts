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
    type BreadcrumbRegion,
    processTreemapChunk,
    finalizeTreemap,
    resetTreemapState,
} from "./treemap-layout";
import { renderTreemapFrame } from "./treemap-render";
import {
    handleTreemapHover,
    handleTreemapClick,
    handleTreemapDblClick,
    dismissTreemapPinnedTooltip,
} from "./treemap-interact";

export interface TreemapLocations {
    u_resolution: WebGLUniformLocation | null;
    a_position: number;
    a_color: number;
}

/**
 * Treemap chart. Shares tree storage + streaming-pipeline + color-mode
 * state with `TreeChartBase`; adds rectangular layout + WebGL quad
 * rendering + drill / tooltip interactions.
 */
export class TreemapChart extends TreeChartBase {
    _program: WebGLProgram | null = null;
    _locations: TreemapLocations | null = null;
    _positionBuffer: WebGLBuffer | null = null;
    _colorBuffer: WebGLBuffer | null = null;
    _vertexCount = 0;

    // ── Interaction ──────────────────────────────────────────────────────
    _hoveredNodeId: number = NULL_NODE;
    _pinnedNodeId: number = NULL_NODE;
    _breadcrumbRegions: BreadcrumbRegion[] = [];
    _dblClickHandler: ((e: MouseEvent) => void) | null = null;

    _chromeCache: ImageBitmap | null = null;
    _chromeCacheDirty = true;

    attachTooltip(glCanvas: HTMLCanvasElement): void {
        this._glCanvas = glCanvas;
        this._tooltip.attach(glCanvas, {
            onHover: (mx, my) => handleTreemapHover(this, mx, my),
            onLeave: () => {
                if (
                    this._hoveredNodeId !== NULL_NODE &&
                    this._pinnedNodeId === NULL_NODE
                ) {
                    this._hoveredNodeId = NULL_NODE;
                    if (this._glManager)
                        renderTreemapFrame(this, this._glManager);
                }
            },
            onClickPre: (mx, my) => {
                handleTreemapClick(this, mx, my);
                return true; // treemap owns all click logic
            },
        });

        this._dblClickHandler = (e: MouseEvent) => {
            const rect = glCanvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            handleTreemapDblClick(this, mx, my);
        };
        glCanvas.addEventListener("dblclick", this._dblClickHandler);
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

            resetTreemapState(this);
        }

        processTreemapChunk(this, columns);
        finalizeTreemap(this);
        if (this._rootId !== NULL_NODE) this._scheduleRender(glManager);
    }

    redraw(glManager: WebGLContextManager): void {
        this._glManager = glManager;
        if (this._rootId !== NULL_NODE) this._scheduleRender(glManager);
    }

    protected _fullRender(glManager: WebGLContextManager): void {
        renderTreemapFrame(this, glManager);
    }

    protected destroyInternal(): void {
        if (this._glCanvas && this._dblClickHandler) {
            this._glCanvas.removeEventListener(
                "dblclick",
                this._dblClickHandler,
            );
        }
        this._dblClickHandler = null;
        dismissTreemapPinnedTooltip(this);
        this._chromeCache?.close();
        this._chromeCache = null;
        const gl = this._glManager?.gl;
        if (gl) {
            if (this._positionBuffer) gl.deleteBuffer(this._positionBuffer);
            if (this._colorBuffer) gl.deleteBuffer(this._colorBuffer);
        }
        this._positionBuffer = null;
        this._colorBuffer = null;
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
