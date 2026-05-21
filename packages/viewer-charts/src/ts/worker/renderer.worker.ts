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

import "./boot";

import type { Client, Table, View } from "@perspective-dev/client";

import type * as wasm_module_type from "@perspective-dev/viewer/dist/wasm/perspective-viewer.js";
import { WebGLContextManager } from "../webgl/context-manager";
import { ChartImplementation } from "../charts/chart";
import { ZoomController } from "../interaction/zoom-controller";
import {
    applyPan,
    applyWheel,
    type ZoomTarget,
} from "../interaction/zoom-router";
import { MessageHostSink } from "../interaction/host-sink-message";
import { CHART_IMPLS } from "../charts/registry";
import type { PlotLayout } from "../layout/plot-layout";
import type {
    ControlMsg,
    InitMsg,
    InteractionEvent,
    LoadAndRenderMsg,
    WorkerMsg,
} from "../transport/protocol";
import { viewToColumnDataMap } from "../data/view-reader";
import { loadFontDeduped } from "./font-loader";
import { dispatch } from "./dispatch";
import { installSessionHost } from "./session-host";
import { deferIfDraining } from "../render/scheduler";

/**
 * Sentinel thrown inside the `with_typed_arrays` callback when a newer
 * `loadAndRender` has bumped the generation counter. Lets the wasm-side
 * Arrow buffer release path run (the callback's promise must reject
 * cleanly so `with_typed_arrays` unwinds before the next call) without
 * polluting the worker's error path — caught and swallowed by
 * `loadAndRender`'s try/catch.
 */
class StaleGenerationError extends Error {
    constructor() {
        super("StaleGenerationError");
    }
}

/**
 * Renderer state. One per host element. In worker mode it lives in
 * the worker; in in-process mode (host loads this module via dynamic
 * `import(workerURL)`) it lives on the main thread. The class itself
 * doesn't care — both modes drive it through a `MessagePort` of
 * `ControlMsg`s.
 */
/**
 * Resolve a chart tag to its impl class via the lazy registry. Eager
 * tags microtask-resolve; map tags trigger a dynamic `import()` that
 * the bundler emits as a separately-fetched chunk.
 */
async function resolveChartImpl(
    tag: string,
): Promise<new () => ChartImplementation> {
    const factory = CHART_IMPLS[tag];
    if (!factory) {
        throw new Error(`Unknown chart tag: ${tag}`);
    }

    return await factory();
}

export class WorkerRenderer {
    chartImpl: ChartImplementation;
    glManager: WebGLContextManager;
    zoomController: ZoomController | null = null;
    gridlines: OffscreenCanvas;
    chrome: OffscreenCanvas;
    cssWidth: number;
    cssHeight: number;
    dpr: number;
    client: Client;
    view: View;

    /**
     * Source `Table` opened once at bootstrap from the host-supplied
     * `tableName`. Used by `loadAndRender` to fetch the source schema
     * for group-by level types — the worker resolves it itself so the
     * host's render path makes zero `Client`/`Table`/`View` awaits.
     * Null when the host had no table loaded at init time.
     */
    table: Table | null;
    controlPort: MessagePort;

    /**
     * Monotonic counter bumped by every `loadAndRender` entry. Captured
     * locally as `myGen` and re-checked after each await — a stale
     * value means a newer call has superseded this one and we must
     * bail (throwing inside the `with_typed_arrays` callback so the
     * wasm Arrow buffer release runs cleanly).
     */
    private _renderGen = 0;

    /**
     * Active drag state. `pointerdown` resolves a target via the
     * facet grid and stores it; `pointermove` consults this until
     * `pointerup` clears it. Pointer capture itself is host-side.
     */
    private _dragTarget: ZoomTarget | null = null;
    private _lastDragX = 0;
    private _lastDragY = 0;

    constructor(
        msg: InitMsg,
        client: Client,
        view: View,
        table: Table | null,
        controlPort: MessagePort,
        ImplClass: new () => ChartImplementation,
    ) {
        this.client = client;
        this.view = view;
        this.table = table;
        this.controlPort = controlPort;

        this.chartImpl = new ImplClass();

        // Direct mode hands us the host's transferred `.webgl-canvas`.
        // Blit mode omits it — the renderer owns its own offscreen
        // surface and posts each completed frame back as an
        // `ImageBitmap` via the `endFrame` callback wired below.
        const glCanvas =
            msg.glCanvas ??
            new OffscreenCanvas(
                Math.max(1, Math.round(msg.cssWidth * msg.dpr)),
                Math.max(1, Math.round(msg.cssHeight * msg.dpr)),
            );

        this.glManager = new WebGLContextManager(glCanvas, {
            precompile: msg.precompileShaders ?? false,
        });

        if (msg.renderMode === "blit") {
            this.glManager.setFrameCallback((bitmap) => {
                this.post({ kind: "frameBitmap", bitmap }, [bitmap]);
            });
        }

        this.gridlines = msg.gridlinesCanvas;
        this.chrome = msg.chromeCanvas;
        this.cssWidth = msg.cssWidth;
        this.cssHeight = msg.cssHeight;
        this.dpr = msg.dpr;

        this.chartImpl.setGridlineCanvas?.(msg.gridlinesCanvas);
        this.chartImpl.setChromeCanvas?.(msg.chromeCanvas);
        this.chartImpl.setTheme?.(msg.themeVars);

        if (msg.defaultChartType) {
            this.chartImpl.setDefaultChartType?.(msg.defaultChartType);
        }

        this.chartImpl.setFacetConfig?.(msg.facetConfig);
        this.chartImpl.setPluginConfig?.(msg.pluginConfig);

        if (this.chartImpl.setZoomController) {
            this.zoomController = new ZoomController();
            this.chartImpl.setZoomController(this.zoomController);
        }

        this.chartImpl.setView?.(view);
        this.glManager.bufferPool.maxCapacity = msg.bufferMaxCapacity;
        this.glManager.resize(msg.cssWidth, msg.cssHeight, msg.dpr);
        const hostSink = new MessageHostSink((envelope) => {
            switch (envelope.kind) {
                case "pin":
                    this.post({
                        kind: "pinTooltip",
                        lines: envelope.payload.lines,
                        pos: envelope.payload.pos,
                        bounds: envelope.payload.bounds,
                    });
                    break;
                case "dismiss":
                    this.post({ kind: "dismissTooltip" });
                    break;
                case "setCursor":
                    this.post({ kind: "setCursor", cursor: envelope.cursor });
                    break;
                case "userClick":
                    this.post({
                        kind: "userClick",
                        detail: envelope.payload as any,
                    });
                    break;
                case "userSelect":
                    this.post({
                        kind: "userSelect",
                        selected: envelope.payload.selected,
                        row: envelope.payload.row,
                        column_names: envelope.payload.column_names,
                        insertConfig: envelope.payload.insertConfig as any,
                    });
                    break;
            }
        });

        this.chartImpl.attachTooltip?.(hostSink);
    }

    setViewByName(name: string): void {
        this.view = this.client.__unsafe_open_view(name);
        this.chartImpl.setView?.(this.view);
    }

    /**
     * Full data-fetch + render pipeline. Owns every `Client`/`Table`/
     * `View` await on the render path:
     *
     *  1. Resolve metadata (`view.num_rows`, `view.schema`,
     *     `view.expression_schema`, `table.schema`) in parallel.
     *  2. Apply schema + viewer-config to the chart impl (replaces the
     *     individual `setColumnTypes` / `setGroupByTypes` /
     *     `setViewPivots` / `setColumnSlots` setters that used to
     *     stream from the host).
     *  3. Compute `totalRows` from `bufferPool.maxCapacity / numCols`
     *     and grow the buffer pool to fit.
     *  4. Run `view.with_typed_arrays`; the inner callback hands the
     *     resulting `ColumnDataMap` straight to
     *     `chartImpl.uploadAndRender` — no `postMessage`, no transfer.
     *
     * Mid-flight cancellation: each entry bumps `_renderGen` and
     * captures `myGen`. After the metadata await we re-check; if a
     * newer call has superseded this one, ack-and-return so the host
     * promise resolves cleanly. Inside the `with_typed_arrays`
     * callback the same check throws `StaleGenerationError` so the
     * wasm Arrow buffer release path runs (callback's promise must
     * reject for `with_typed_arrays` to unwind) before the next call
     * proceeds — caught and swallowed here.
     *
     * Always sends `loadAndRenderAck` (even on stale drop) per the
     * "resolve on stale" host contract.
     */
    async loadAndRender(msg: LoadAndRenderMsg): Promise<void> {
        const myGen = ++this._renderGen;
        try {
            const [numRows, schema, exprSchema, tableSchema] =
                await Promise.all([
                    this.view.num_rows(),
                    this.view.schema() as Promise<Record<string, string>>,
                    this.view.expression_schema() as Promise<
                        Record<string, string>
                    >,
                    (this.table?.schema() ?? Promise.resolve({})) as Promise<
                        Record<string, string>
                    >,
                ]);

            if (this._renderGen !== myGen) {
                return;
            }

            // Order mirrors the pre-refactor host-side message stream
            // (pivots → types → groupByTypes → slots) — chart impls
            // assume types/groupByTypes are pushed after pivots so
            // axis-builder code paths see consistent state.
            this.chartImpl.setViewPivots?.(
                msg.viewerConfig.group_by,
                msg.viewerConfig.split_by,
            );
            this.chartImpl.setColumnTypes?.(schema);
            this.chartImpl.setGroupByTypes?.({ ...tableSchema, ...exprSchema });
            this.chartImpl.setColumnSlots?.(msg.viewerConfig.columns);

            const numCols = Object.keys(schema).length || 1;
            const maxRows = Math.floor(
                this.glManager.bufferPool.maxCapacity / numCols,
            );

            const totalRows = Math.min(numRows, maxRows);
            this.glManager.ensureBufferCapacity(totalRows);

            try {
                await viewToColumnDataMap(
                    this.view,
                    async (cols) => {
                        if (this._renderGen !== myGen) {
                            throw new StaleGenerationError();
                        }

                        await this.chartImpl.uploadAndRender(
                            this.glManager,
                            cols,
                            0,
                            totalRows,
                        );
                    },
                    { end_row: totalRows, float32: msg.options.float32 },
                );
            } catch (e) {
                if (!(e instanceof StaleGenerationError)) {
                    throw e;
                }
            }
        } catch (err) {
            // Any unexpected throw — proxy hiccup, chart-impl mutation
            // failure, RAF chain rejection — must not leak past the
            // outer fire-and-forget caller (`dispatch` does not await
            // this method). Surface to the worker console; the host's
            // pending promise still gets resolved via the `finally`
            // ack below so `draw()` can't deadlock on a renderer error.
            console.error("loadAndRender failed", err);
        } finally {
            this.post({ kind: "loadAndRenderAck", msgId: msg.msgId });
        }
    }

    redraw(): void {
        this.chartImpl.requestRender(this.glManager);
    }

    resize(cssWidth: number, cssHeight: number, dpr: number): void {
        // `glManager.resize` would set `canvas.width = N`, which the
        // spec mandates clears the drawing buffer immediately. In
        // direct / in-process modes the GL canvas IS the host's
        // visible canvas, so a clear at message-receipt time
        // followed by a paint on the next RAF leaves one full
        // compositor cycle between them displaying an empty buffer
        // — visible flicker.
        //
        // `requestResize` only stores the pending dimensions; the
        // `canvas.width = N` assignment is deferred to the next
        // `drain()` Phase 1, where it runs in the same un-yielded
        // synchronous loop as `_fullRender`. Compositor only
        // observes the post-paint state.
        //
        // Because `requestResize` is a pure JS-state operation (no
        // GL ops, no canvas mutation), it doesn't need
        // `deferIfDraining` — it's safe to call concurrently with
        // an in-flight drain. The drain serialization at the
        // scheduler level ensures the actual `applyPendingResize`
        // happens between drains, never during one.
        //
        // Multiple `requestResize` calls before the next render
        // coalesce: last write wins. Five rapid width changes from
        // a window-drag produce one resize+paint, not five.
        this.cssWidth = cssWidth;
        this.cssHeight = cssHeight;
        this.dpr = dpr;
        this.glManager.requestResize(cssWidth, cssHeight, dpr);
        this.chartImpl.requestRender(this.glManager);
    }

    clear(): void {
        // Same rationale as `resize`: `gl.clear` would queue after
        // Phase 1's draws but could execute before
        // `transferToImageBitmap`, wiping the bitmap. Defer.
        deferIfDraining(this.glManager, () => {
            this.glManager.clear();
            const ctx = this.gridlines.getContext("2d");
            ctx?.clearRect(0, 0, this.gridlines.width, this.gridlines.height);
        });
    }

    saveZoom(): any {
        return this.zoomController?.serialize();
    }

    restoreZoom(state: any): void {
        if (state) {
            this.zoomController?.restore(state);
        }
    }

    allZoomsDefault(): boolean {
        if (this.zoomController && !this.zoomController.isDefault()) {
            return false;
        }

        const facets = (this.chartImpl as any)?._facetZoomControllers;
        if (facets) {
            for (const zc of facets) {
                if (zc && !zc.isDefault()) {
                    return false;
                }
            }
        }

        return true;
    }

    resetAllZooms(): void {
        this.zoomController?.reset();
        const facets = (this.chartImpl as any)?._facetZoomControllers;
        if (facets) {
            for (const zc of facets) {
                zc?.reset();
            }
        }

        // Also drop any `domain_mode: "expand"` accumulator — the user
        // explicitly asked for a clean reset, so the next data load
        // should start from the fresh data extent rather than the
        // previously-grown one.
        this.resetExpandedDomain();
    }

    resetExpandedDomain(): void {
        this.chartImpl.resetExpandedDomain?.();
    }

    /**
     * Hit-test the cursor against the chart's facet grid (in faceted
     * mode) or its current layout (single-plot). Mirrors the resolver
     * `_setupZoomRouter` builds on the host for in-process mode — the
     * worker owns the facet grid and controllers, so the resolution
     * runs here.
     */
    private _resolveTarget(mx: number, my: number): ZoomTarget | null {
        const chart = this.chartImpl as any;
        const facetGrid = chart?._facetGrid as
            | { cells: { layout: PlotLayout }[] }
            | null
            | undefined;
        if (facetGrid) {
            for (let i = 0; i < facetGrid.cells.length; i++) {
                const cell = facetGrid.cells[i];
                const plot = cell.layout.plotRect;
                if (
                    mx >= plot.x &&
                    mx <= plot.x + plot.width &&
                    my >= plot.y &&
                    my <= plot.y + plot.height
                ) {
                    const zc =
                        chart.getZoomControllerForFacet?.(i) ??
                        this.zoomController;
                    return zc ? { controller: zc, layout: cell.layout } : null;
                }
            }

            return null;
        }

        if (!this.zoomController) {
            return null;
        }

        const layout = chart?._lastLayout as PlotLayout | null | undefined;
        if (!layout) {
            return null;
        }

        const plot = layout.plotRect;
        if (
            mx < plot.x ||
            mx > plot.x + plot.width ||
            my < plot.y ||
            my > plot.y + plot.height
        ) {
            return null;
        }

        return { controller: this.zoomController, layout };
    }

    onInteraction(event: InteractionEvent): void {
        switch (event.type) {
            case "wheel": {
                const target = this._resolveTarget(event.mx, event.my);
                if (!target) {
                    return;
                }

                applyWheel(target, event.mx, event.my, event.deltaY);
                this.chartImpl.requestRender(this.glManager);
                this.post({
                    kind: "zoomChanged",
                    isDefault: this.allZoomsDefault(),
                });
                break;
            }

            case "pointerdown": {
                const target = this._resolveTarget(event.mx, event.my);
                if (!target) {
                    return;
                }

                this._dragTarget = target;
                this._lastDragX = event.mx;
                this._lastDragY = event.my;
                break;
            }

            case "pointermove": {
                if (this._dragTarget) {
                    // Mid-drag: pan only; suppress hover dispatch so
                    // the tooltip doesn't chase the cursor across a
                    // zoom gesture.
                    const dx = event.mx - this._lastDragX;
                    const dy = event.my - this._lastDragY;
                    this._lastDragX = event.mx;
                    this._lastDragY = event.my;
                    applyPan(this._dragTarget, dx, dy);
                    this.chartImpl.requestRender(this.glManager);
                    this.post({
                        kind: "zoomChanged",
                        isDefault: this.allZoomsDefault(),
                    });
                } else {
                    // Plain hover: route into the chart's
                    // `TooltipController` (RAF-coalesced).
                    this._tooltip()?.dispatchHover(event.mx, event.my);
                }

                break;
            }

            case "pointerup": {
                this._dragTarget = null;
                break;
            }

            case "pointerleave": {
                this._tooltip()?.dispatchLeave();
                break;
            }

            case "click": {
                this._tooltip()?.dispatchClick(event.mx, event.my);
                break;
            }

            case "dblclick": {
                this._tooltip()?.dispatchDblClick(event.mx, event.my);
                break;
            }
        }
    }

    /**
     * Read the chart impl's `TooltipController`. Charts that don't use
     * one (no `attachTooltip` override) yield `null` and the
     * mouse-event branches fall through.
     */
    private _tooltip(): {
        dispatchHover: (mx: number, my: number) => void;
        dispatchLeave: () => void;
        dispatchClick: (mx: number, my: number) => void;
        dispatchDblClick: (mx: number, my: number) => void;
    } | null {
        const tt = (this.chartImpl as any)?._tooltip;
        return tt ?? null;
    }

    /**
     * Composite the three layers into a single PNG `Blob`.
     */
    async snapshotPng(): Promise<Blob> {
        // Snapshot bypasses the scheduler's drain, so it must
        // mirror Phase 1's "apply pending resize before paint"
        // step itself — otherwise a snapshot taken after a resize
        // message but before the next drain would render at the
        // previous dimensions.
        this.glManager.applyPendingResize();
        this.chartImpl._fullRender(this.glManager);
        const gl = this.glManager.gl;
        const glCanvas = gl.canvas as OffscreenCanvas;
        const w = glCanvas.width;
        const h = glCanvas.height;
        const pixels = new Uint8ClampedArray(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const composite = new OffscreenCanvas(w, h);
        const ctx = composite.getContext("2d");
        if (!ctx) {
            throw new Error("snapshotPng: 2D context unavailable");
        }

        const theme = (this.chartImpl as any)._resolveTheme?.();
        const bg = theme?.backgroundColor ?? "transparent";
        if (bg !== "transparent") {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);
        }

        ctx.drawImage(this.gridlines, 0, 0);
        const glLayer = new OffscreenCanvas(w, h);
        const glCtx = glLayer.getContext("2d");
        if (!glCtx) {
            throw new Error("snapshotPng: 2D context unavailable for GL blit");
        }

        glCtx.putImageData(new ImageData(pixels, w, h), 0, 0);
        ctx.save();
        ctx.scale(1, -1);

        // `readPixels` returns rows bottom-up; flip on the Y axis
        ctx.drawImage(glLayer, 0, -h);
        ctx.restore();
        ctx.drawImage(this.chrome, 0, 0);

        return await composite.convertToBlob({ type: "image/png" });
    }

    destroy(): void {
        this.chartImpl.destroy();
        this.glManager.destroy();
    }

    post(msg: WorkerMsg, transfer?: Transferable[]): void {
        if (transfer && transfer.length > 0) {
            this.controlPort.postMessage(msg, transfer);
        } else {
            this.controlPort.postMessage(msg);
        }
    }
}

/**
 * Detect whether this module is loaded in a Web Worker scope.
 */
const IS_WORKER_SCOPE = typeof (globalThis as any).importScripts === "function";

/**
 * Worker-mode bootstrap: receives the host's `InitMsg`, instantiates
 * wasm, registers fonts, opens a `Client` against the host's
 * `ProxySession`, and constructs a {@link WorkerRenderer} bound to the
 * supplied control port (which in worker scope is `self`).
 */
async function bootstrapWorker(
    msg: InitMsg,
    host: MessagePort,
): Promise<WorkerRenderer> {
    if (!msg.clientWorkerURL || !msg.clientWasm || !msg.proxyPort) {
        throw new Error("Init error");
    }

    const module = (await import(
        msg.clientWorkerURL.toString()
    )) as typeof wasm_module_type;

    await module.initSync({ module: msg.clientWasm });

    // Register every `@font-face` the host found in its document so
    // Canvas2D `ctx.font` lookups inside this worker resolve correctly.
    if (msg.fontFaces?.length) {
        await Promise.all(msg.fontFaces.map(loadFontDeduped));
    }

    const proxyPort = msg.proxyPort;
    const client = new module.Client(
        async (proto: Uint8Array) => {
            const buf = proto.slice().buffer;
            proxyPort.postMessage(buf, [buf]);
        },
        async () => proxyPort.close(),
    );

    proxyPort.addEventListener("message", (e: MessageEvent) => {
        client.handle_response(new Uint8Array(e.data));
    });

    proxyPort.start();
    const view = client.__unsafe_open_view(msg.viewName);
    const table = msg.tableName ? await client.open_table(msg.tableName) : null;
    const ImplClass = await resolveChartImpl(msg.chartTag);
    const renderer = new WorkerRenderer(
        msg,
        client,
        view,
        table,
        host,
        ImplClass,
    );
    renderer.post({ kind: "ready" });
    return renderer;
}

/**
 * In-process bootstrap. Used when the host loads this same module via
 * `await import(workerURL)` to run the renderer on the main thread —
 * skips the wasm / font / proxy-port plumbing because the host already
 * owns a live `Client` and the document's `FontFaceSet` is the active
 * one.
 */
export async function bootstrapInProcess(opts: {
    msg: InitMsg;
    client: Client;
    controlPort: MessagePort;
}): Promise<WorkerRenderer> {
    const view = opts.client.__unsafe_open_view(opts.msg.viewName);
    const table = opts.msg.tableName
        ? await opts.client.open_table(opts.msg.tableName)
        : null;
    const ImplClass = await resolveChartImpl(opts.msg.chartTag);
    const renderer = new WorkerRenderer(
        opts.msg,
        opts.client,
        view,
        table,
        opts.controlPort,
        ImplClass,
    );

    // Listen for control messages on the same port so the host's
    // `RendererTransport` shape doesn't need to branch.
    opts.controlPort.addEventListener("message", (e: MessageEvent) => {
        const ctrl = e.data as ControlMsg;
        if (ctrl?.kind === "init") {
            return;
        }

        dispatch(renderer, ctrl);
    });

    opts.controlPort.start();

    renderer.post({ kind: "ready" });
    return renderer;
}

// Worker scope only: install the shared message handler . The same module is
// dynamic-imported on the main thread (in-process mode) where this branch is
// skipped.
if (IS_WORKER_SCOPE) {
    installSessionHost(bootstrapWorker);
}
