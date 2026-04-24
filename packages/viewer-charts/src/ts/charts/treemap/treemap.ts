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
 * Sentinel fallback for the Size slot when the user hasn't picked one:
 * use the first non-metadata column in the incoming view. Treemap
 * still needs *some* numeric-ish column to size rects.
 */
function firstNonMetadataColumn(columns: ColumnDataMap): string {
    for (const k of columns.keys()) {
        if (!k.startsWith("__")) return k;
    }
    return "";
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

    /**
     * Monotonic generation counter bumped every time the static chrome
     * content changes (a new `drawStaticChrome` call). The async
     * `createImageBitmap` callback captures the current gen at kickoff
     * and only installs the resulting bitmap if its gen is still the
     * most-recent one. Without this, out-of-order bitmap resolutions
     * can store a stale bitmap in `_chromeCache` — any subsequent
     * hover-only overlay call then blits that stale snapshot over the
     * fresh chart, producing "leftover labels / cells" artefacts.
     */
    _chromeCacheGen = 0;

    // ── Faceted state ────────────────────────────────────────────────────
    /**
     * Per-facet drill roots in split_by mode. Key is the facet label
     * (the top-level child of `_rootId`); value is the currently drilled
     * node inside that facet's subtree. Missing keys mean the facet
     * shows its full subtree.
     */
    _facetDrillRoots: Map<string, number> = new Map();
    _facetGrid: import("../../layout/facet-grid").FacetGrid | null = null;

    /** When `false`, branch nodes at relDepth=1 render as a centered
     *  overlay (same style as relDepth=2) and no top-of-rect label
     *  reservation is made in `squarify`. Default `true` preserves the
     *  legacy title-bar look. */
    _showBranchHeader = false;

    /**
     * Parallel to `_visibleNodeIds`. Each entry stores the depth of the
     * drill root that owns the corresponding visible node, so render
     * paths can compute `relDepth` uniformly without knowing whether
     * faceting is active. Populated in `renderTreemapFrame` during
     * layout.
     */
    _visibleBaseDepths: Int32Array | null = null;
    /**
     * Parallel to `_visibleNodeIds`. The drill-root node id that owns
     * each visible node (= `_currentRootId` in non-facet mode, per-
     * facet drill root in facet mode). Used by hit-testing and chrome
     * to skip the drill-root itself without a separate equality check.
     */
    _visibleRootIds: Int32Array | null = null;

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

            const slots = this._columnSlots;
            this._sizeName = slots[0] || firstNonMetadataColumn(columns) || "";
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

            // Clear per-draw state that's tied to the OLD tree. Node
            // IDs from the previous render don't map to anything in
            // the fresh tree; leaving them around lets stale drill
            // roots, hovered/pinned IDs, breadcrumb regions, the
            // cached chrome bitmap, or an old WebGL vertex count bleed
            // into the new render as ghost rects / labels / hit
            // targets. See tree-data.ts's `resetTreeState` for the
            // shared fields; everything below is treemap-specific.
            this._hoveredNodeId = NULL_NODE;
            this._pinnedNodeId = NULL_NODE;
            this._breadcrumbRegions = [];
            this._facetDrillRoots.clear();
            this._facetGrid = null;
            this._visibleBaseDepths = null;
            this._visibleRootIds = null;
            // Invalidate the GPU buffer contents so any render that
            // fires before `generateAndUploadTreemap` has refilled the
            // buffers draws zero triangles instead of the previous
            // tree's geometry.
            this._vertexCount = 0;
            // Drop any in-flight hover tooltip promise — its serial
            // is captured by the caller, so bumping here makes stale
            // resolutions no-ops rather than painting old lines on
            // the new chart.
            this._hoveredTooltipLines = null;
            this._hoveredTooltipNodeId = -1;
            this._hoveredTooltipSerial++;
            this._pinnedTooltipSerial++;
            dismissTreemapPinnedTooltip(this);
            this._chromeCache?.close();
            this._chromeCache = null;
            this._chromeCacheDirty = true;
            this._chromeCacheGen++;

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
        this._visibleNodeIds = null;
        this._visibleNodeCount = 0;
        this._breadcrumbRegions = [];
        this._facetDrillRoots.clear();
        this._facetGrid = null;
        this._visibleBaseDepths = null;
        this._visibleRootIds = null;
    }
}
