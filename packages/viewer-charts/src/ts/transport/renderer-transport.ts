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

import type { Client, View, ViewConfig } from "@perspective-dev/client";
import type { FacetConfig, PluginConfig } from "../charts/chart";
import type {
    ControlMsg,
    InitMsg,
    InteractionEvent,
    LoadAndRenderMsg,
    WorkerEnvelope,
    WorkerMsg,
} from "./protocol";
import {
    PerspectiveSelectDetail,
    type PerspectiveClickDetail,
} from "../event-detail";
import { snapshotThemeVars } from "../theme/theme-snapshot";
import { snapshotFontFaces } from "../utils/font-snapshot";
import { DomHostSink } from "../interaction/host-sink-dom";
import { RUNTIME_MODE } from "../config";

// @ts-ignore — resolved at build time by `@perspective-dev/esbuild-plugin/worker`
import getWorkerURL from "../worker/renderer.worker.js";

/**
 * Module-level shared `Worker` for every `RendererTransport` running
 * in worker mode. One worker process hosts one `WorkerRenderer` per
 * active `sessionId` — N chart instances share startup costs (wasm
 * `initSync`, font loads, JS module parse) instead of paying them N
 * times.
 *
 * Lazy: created on first `transport.init()` in worker mode. Lives
 * until page teardown — no refcount, no termination logic. Pages
 * with no charts never spawn one. Per-session memory still scales
 * with N (each session retains its own WebGL context, buffer pool,
 * chart impl, view, client); the browser's ~16-context-per-worker
 * cap is the new ceiling on simultaneous worker-mode charts.
 *
 * In-process mode bypasses this entirely — each transport gets its
 * own `MessageChannel` + in-thread `WorkerRenderer`.
 */
let SHARED_WORKER: Promise<Worker> | null = null;

/**
 * Per-session message handlers, keyed by the host-allocated
 * `sessionId`. The shared worker's response listener demultiplexes
 * incoming envelopes into here.
 */
const HOST_LISTENERS = new Map<number, (msg: WorkerMsg) => void>();

let NEXT_SESSION_ID = 0;

async function getSharedWorker(): Promise<Worker> {
    if (SHARED_WORKER) {
        return SHARED_WORKER;
    }

    SHARED_WORKER = (async () => {
        const url = await getWorkerURL();
        const w = new Worker(url, { type: "module", name: "viewer-charts" });
        w.addEventListener("message", (e: MessageEvent) => {
            const env = e.data as WorkerEnvelope;
            HOST_LISTENERS.get(env.sessionId)?.(env.msg);
        });
        return w;
    })();

    return SHARED_WORKER;
}

interface RendererHandle {
    post(msg: any, transfer: Transferable[]): void;
    addMessageListener(cb: (msg: any) => void): void;
    terminate(): void;
}

type PendingRenderType = "saveZoom" | "loadAndRender" | "snapshotPng";
interface PendingRenderRequest {
    kind: PendingRenderType;
    resolve: (v: any) => void;
    reject: (e: Error) => void;
}

/**
 * Unified host-side driver for the chart renderer. Owns one of two
 * handle shapes:
 *
 *  - **Worker mode**: a real `Worker` running the same module. The
 *    handle posts `ControlMsg`s over `Worker.postMessage`.
 *  - **In-process mode**: a `MessageChannel` whose `port2` is owned
 *    by an in-thread `WorkerRenderer` instantiated via
 *    `await import(workerURL)`. Same module bytes, different host.
 *
 * Both modes go through the same control channel, the same
 * `ProxySession` proxy port, and the same `OffscreenCanvas` transfer
 * — `MessageChannel` and `transferControlToOffscreen` work in-realm
 * just as well as cross-thread. The only branching is at construction
 * (handle creation) and bootstrap (worker scope sets up its own
 * `Client`; in-process reuses the host's).
 */
export class RendererTransport {
    private _handle: RendererHandle | null = null;
    private _proxyChannel: MessageChannel | null = null;
    private _proxySession: any = null;
    private _client: Client;
    private _view: View;
    private _tableName: string | undefined;
    private _clientWorkerURL: URL;
    private _clientWasm: WebAssembly.Module;
    private _chartTag: string;
    private _maxCells: number;
    private _precompileShaders: boolean;
    private _ready: Promise<void>;
    private _resolveReady!: () => void;
    private _rejectReady!: (err: Error) => void;

    /**
     * Pending request/reply promises across all worker round-trips —
     * `saveZoom`, `uploadChunk` ACKs, and `snapshotPng`. Each entry
     * carries its `kind` so `destroy()` can apply per-kind teardown
     * semantics (uploadChunk resolves silently, the rest reject with
     * a teardown error).
     *
     * Keyed by a single monotonic counter; the worker's reply messages
     * carry that id back verbatim. One counter for all kinds is safe
     * because the host's switch already keys on `msg.kind` before
     * resolving.
     */
    private _pending = new Map<number, PendingRenderRequest>();

    private _pendingCounter = 0;
    private _onZoomChanged: ((isDefault: boolean) => void) | null = null;

    /**
     * Cached zoom-default flag pushed by the renderer after each zoom
     * mutation. Surfaced sync via `allZoomsDefault()`; updates between
     * calls are best-effort.
     */
    private _allZoomsDefault = true;
    private _hostGlCanvas: HTMLCanvasElement | null = null;

    /**
     * Blit-mode only: the visible `.webgl-canvas`'s 2D context. The
     * worker emits each completed GL frame as a `FrameBitmapMsg`; on
     * receipt we `drawImage` the bitmap into this context and `close()`
     * it to release the GPU surface. Null in direct mode (the visible
     * canvas's drawing buffer is the worker's transferred GL canvas).
     */
    private _displayCtx: CanvasRenderingContext2D | null = null;

    /**
     * Host-side sink for tooltip + cursor side-effects. The chart
     * inside the renderer calls into a `MessageHostSink` that posts
     * `pinTooltip` / `dismissTooltip` / `setCursor` over the control
     * channel; this sink applies them to the DOM. Initialized lazily
     * on first signal so we don't pay for the parent-style lookup
     * unless a user interacts.
     */
    private _hostSink: DomHostSink | null = null;

    /**
     * Last `insertConfig` accepted by a `userSelect { selected: true }`
     * message. Used to populate `removeConfigs` on the next
     * `selected: false` (unpin / drill-up / view-change) — mirrors
     * datagrid's `model._last_insert_configs` so coordinated-filter
     * consumers can roll back the previous select when a new one
     * supplants it.
     */
    private _lastInsertConfig: Partial<ViewConfig> | undefined = undefined;

    constructor(opts: {
        client: Client;
        view: View;
        tableName?: string;
        clientWasm: WebAssembly.Module;
        clientWorkerURL: URL;
        chartTag: string;
        maxCells: number;
        precompileShaders?: boolean;
        onZoomChanged?: (isDefault: boolean) => void;
    }) {
        this._client = opts.client;
        this._view = opts.view;
        this._tableName = opts.tableName;
        this._clientWorkerURL = opts.clientWorkerURL;
        this._clientWasm = opts.clientWasm;
        this._chartTag = opts.chartTag;
        this._maxCells = opts.maxCells;
        this._precompileShaders = opts.precompileShaders ?? false;
        this._onZoomChanged = opts.onZoomChanged ?? null;
        this._ready = new Promise((resolve, reject) => {
            this._resolveReady = resolve;
            this._rejectReady = reject;
        });
    }

    async init(opts: {
        gl: HTMLCanvasElement;
        gridlines: HTMLCanvasElement;
        chrome: HTMLCanvasElement;
        facetConfig: FacetConfig;
        pluginConfig: PluginConfig;
        defaultChartType?: string;
        renderBlitMode: "blit" | "direct";
    }): Promise<void> {
        this._hostGlCanvas = opts.gl;
        const workerURL: string = await getWorkerURL();

        // Worker mode: bridge the worker's fresh `Client` (instantiated
        // in `bootstrapWorker` from `clientWasm` + `clientWorkerURL`)
        // back to the host's real `Client` via a `ProxySession` over a
        // dedicated `MessageChannel`.
        //
        // In-process mode skips this entirely — `bootstrapInProcess`
        // is handed the host's `Client` directly, so there's no
        // worker-side `Client` to bridge. The proxy port would just
        // dangle.
        if (RUNTIME_MODE === "worker") {
            this._proxyChannel = new MessageChannel();
            this._proxySession = (this._client as any).new_proxy_session(
                (bytes: Uint8Array) => {
                    const buf = bytes.slice().buffer;
                    this._proxyChannel!.port1.postMessage(buf, [buf]);
                },
            );

            this._proxyChannel.port1.addEventListener(
                "message",
                (e: MessageEvent) => {
                    this._proxySession.handle_request(new Uint8Array(e.data));
                },
            );

            this._proxyChannel.port1.start();
        }

        // Blit mode keeps the visible `.webgl-canvas` main-thread with
        // a 2D context — the renderer paints into its own internal
        // `OffscreenCanvas` and ships each completed frame back as an
        // `ImageBitmap`. Direct mode transfers the visible canvas's
        // drawing buffer to the renderer so GL paints straight to
        // screen.
        let glOC: OffscreenCanvas | undefined;
        if (opts.renderBlitMode === "blit") {
            this._displayCtx = opts.gl.getContext("2d");
        } else {
            glOC = opts.gl.transferControlToOffscreen();
        }

        const gridlinesOC = opts.gridlines.transferControlToOffscreen();
        const chromeOC = opts.chrome.transferControlToOffscreen();
        const rect = opts.gl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const themeVars = snapshotThemeVars(opts.gl);

        // Worker mode forwards `@font-face` rules so the worker's
        // separate `FontFaceSet` can resolve `ctx.font` family names.
        // In-process mode shares `document.fonts` with the host —
        // omit the descriptors entirely.
        const fontFaces = RUNTIME_MODE === "worker" ? snapshotFontFaces() : [];
        const clientWasm =
            RUNTIME_MODE === "worker" ? this._clientWasm : undefined;

        const clientWorkerURL =
            RUNTIME_MODE === "worker" ? this._clientWorkerURL : undefined;

        const proxyPort =
            RUNTIME_MODE === "worker" ? this._proxyChannel!.port2 : undefined;

        const initMsg: InitMsg = {
            kind: "init",
            renderMode: opts.renderBlitMode,
            glCanvas: glOC,
            gridlinesCanvas: gridlinesOC,
            chromeCanvas: chromeOC,
            proxyPort,
            clientWorkerURL,
            clientWasm,
            chartTag: this._chartTag,
            viewName: this._view.__unsafe_get_name(),
            tableName: this._tableName,
            facetConfig: opts.facetConfig,
            pluginConfig: opts.pluginConfig,
            defaultChartType: opts.defaultChartType,
            themeVars,
            fontFaces,
            cssWidth: rect.width,
            cssHeight: rect.height,
            dpr,
            bufferMaxCapacity: 0,
            precompileShaders: this._precompileShaders,
        };

        this._handle = await this._createHandle(workerURL, initMsg);
        this._handle.addMessageListener((msg) =>
            this._handleRendererMsg(msg as WorkerMsg),
        );

        if (RUNTIME_MODE === "worker") {
            // Worker mode: the bootstrap is triggered by posting the
            // init message into the worker's scope (which the
            // `if (IS_WORKER_SCOPE)` block in `renderer.worker.ts`
            // listens for). `glOC` is omitted in blit mode (the
            // renderer allocates its own offscreen) — only include the
            // GL canvas in the transfer list when present.
            const transfer: Transferable[] = [
                gridlinesOC,
                chromeOC,
                this._proxyChannel!.port2,
            ];
            if (glOC) {
                transfer.unshift(glOC);
            }

            this._handle.post(initMsg, transfer);
        }

        // In-process mode: the handle's `_createHandle` already kicked
        // off `bootstrapInProcess` with the init msg directly, no
        // postMessage needed.

        await this._ready;
    }

    /**
     * Construct the underlying transport. Worker mode wraps the
     * module-shared `Worker` (lazy, page-singleton) and tags every
     * message with a unique `sessionId`. In-process mode pairs a
     * `MessageChannel` with a dynamically-imported
     * {@link bootstrapInProcess}.
     */
    private async _createHandle(
        workerURL: string,
        initMsg: InitMsg,
    ): Promise<RendererHandle> {
        if (RUNTIME_MODE === "worker") {
            const w = await getSharedWorker();
            const sessionId = ++NEXT_SESSION_ID;
            return {
                post: (msg, transfer) =>
                    w.postMessage({ sessionId, msg }, transfer),
                addMessageListener: (cb) => {
                    HOST_LISTENERS.set(sessionId, cb);
                },
                terminate: () => {
                    HOST_LISTENERS.delete(sessionId);
                    // Don't terminate the underlying worker — other
                    // sessions may still be live. Worker-side
                    // `WorkerRenderer` cleanup is driven by the
                    // `destroy` ControlMsg posted by the transport
                    // before reaching here.
                },
            };
        }

        // In-process: instantiate the renderer on this thread by
        // dynamic-importing the same module the worker uses. The Blob
        // URL (or file URL in debug builds) loads as ESM, so module
        // dedup means only one copy of the chart code lives in
        // memory regardless of how many host elements use this mode.
        // `@vite-ignore` is harmless under esbuild (esbuild's parser
        // ignores it); some downstream bundlers honor it to suppress
        // a static-import warning on the dynamic URL.
        //
        // Hand the host's already-bound `Client` to the renderer via
        // `bootstrapInProcess` — option B. The dynamically-imported
        // module has its own copy of the perspective-viewer
        // wasm-bindgen JS, but that copy stays unused: we never
        // construct `new Client(...)` inside it; we only ever call
        // methods on the host-supplied instance.
        const mod: any = await import(/* @vite-ignore */ workerURL);
        const channel = new MessageChannel();
        await mod.bootstrapInProcess({
            msg: initMsg,
            client: this._client,
            controlPort: channel.port2,
        });

        return {
            post: (msg, transfer) => channel.port1.postMessage(msg, transfer),
            addMessageListener: (cb) => {
                // `addEventListener("message", …)` does NOT auto-start
                // a `MessagePort` — only setting `onmessage` does.
                // Without this explicit `start()` the renderer's
                // `{ kind: "ready" }` would queue on `port1` forever
                // and `init()` would hang on `await this._ready`.
                channel.port1.addEventListener("message", (e: MessageEvent) =>
                    cb(e.data),
                );
                channel.port1.start();
            },
            terminate: () => {
                channel.port1.close();
                channel.port2.close();
            },
        };
    }

    setView(view: View): void {
        this._view = view;
        this._post({
            kind: "setViewByName",
            name: this._view.__unsafe_get_name(),
        });
    }

    setColumnsConfig(cfg: Record<string, any>): void {
        this._post({ kind: "setColumnsConfig", cfg });
    }

    setPluginConfig(cfg: PluginConfig): void {
        this._post({ kind: "setPluginConfig", cfg });
    }

    setBufferMaxCapacity(n: number): void {
        this._post({ kind: "setBufferMaxCapacity", n });
    }

    /**
     * Trigger a worker-side data fetch + render cycle. The worker
     * resolves all schema / row-count metadata against its own `View`
     * and `Table`, runs `view.with_typed_arrays`, and pipes the
     * resulting `ColumnDataMap` directly into `chartImpl.uploadAndRender`
     * — no host-side `Client`/`Table`/`View` await, no `postMessage` of
     * column buffers.
     *
     * The returned promise resolves when the worker replies with
     * `loadAndRenderAck`. Per the worker's "resolve on stale"
     * contract, a mid-flight cancellation (a newer `loadAndRender`
     * superseding this one) still acks — the host's awaiter just
     * resolves quietly.
     */
    loadAndRender(opts: {
        viewerConfig: {
            group_by: string[];
            split_by: string[];
            columns: (string | null)[];
        };
        options?: { float32?: boolean };
    }): Promise<void> {
        const { id, promise } = this._allocPending<void>("loadAndRender");
        const msg: LoadAndRenderMsg = {
            kind: "loadAndRender",
            msgId: id,
            viewerConfig: opts.viewerConfig,
            options: { float32: opts.options?.float32 ?? true },
        };

        this._post(msg);
        return promise;
    }

    redraw(): void {
        this._post({ kind: "redraw" });
    }

    resize(): void {
        if (!this._hostGlCanvas) {
            return;
        }

        const rect = this._hostGlCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this._post({
            kind: "resize",
            cssWidth: rect.width,
            cssHeight: rect.height,
            dpr,
        });
    }

    clear() {
        this._post({ kind: "clear" });
    }

    invalidateTheme() {
        if (!this._hostGlCanvas) {
            return;
        }

        const themeVars = snapshotThemeVars(this._hostGlCanvas);
        this._post({ kind: "invalidateTheme", themeVars });
    }

    async saveZoom() {
        const { id } = this._allocPending<any>("saveZoom");
        this._post({ kind: "saveZoom", requestId: id });
    }

    /**
     * Allocate a pending request slot of the given `kind`. Returns the
     * id (encoded into the outgoing `ControlMsg`) and a promise that
     * resolves / rejects when the matching reply arrives or
     * `destroy()` drains the table.
     */
    private _allocPending<T>(kind: PendingRenderType): {
        id: number;
        promise: Promise<T>;
    } {
        const id = ++this._pendingCounter;
        const promise = new Promise<T>((resolve, reject) => {
            this._pending.set(id, { kind, resolve, reject });
        });

        return { id, promise };
    }

    restoreZoom(state: any): void {
        this._post({ kind: "restoreZoom", state });
    }

    allZoomsDefault(): boolean {
        return this._allZoomsDefault;
    }

    resetAllZooms(): void {
        this._post({ kind: "resetAllZooms" });
    }

    resetExpandedDomain(): void {
        this._post({ kind: "resetExpandedDomain" });
    }

    /**
     * Request a PNG snapshot of the current frame. The worker flushes a
     * synchronous render across the GL + gridlines + chrome layers,
     * composites them into a single `OffscreenCanvas`, fills the theme
     * background, and replies with the `convertToBlob` result.
     */
    snapshotPng(): Promise<Blob> {
        const { id, promise } = this._allocPending<Blob>("snapshotPng");
        this._post({ kind: "snapshotPng", requestId: id });
        return promise;
    }

    forwardInteraction(event: InteractionEvent): void {
        this._post({ kind: "interaction", event });
    }

    destroy(): void {
        this._post({ kind: "destroy" });
        if (this._proxySession) {
            this._proxySession.close().catch(() => {});
        }

        if (this._proxyChannel) {
            this._proxyChannel.port1.close();
            this._proxyChannel = null;
        }

        if (this._handle) {
            this._handle.terminate();
            this._handle = null;
        }

        this._hostSink?.dismiss();
        this._hostSink = null;

        // The host's `<canvas>` elements are torn down by the plugin
        // element's `disconnectedCallback` after `destroy()` returns —
        // null these refs now so any post-destroy code can't dereference
        // them, and so the GPU-backed 2D context can release earlier.
        this._hostGlCanvas = null;
        this._displayCtx = null;

        // Drain pending request promises with kind-aware semantics:
        //  - `loadAndRender` resolves silently (the host's awaited draw
        //    observes a clean "no more work" rather than a teardown
        //    rejection it would otherwise have to suppress).
        //  - `saveZoom` / `snapshotPng` reject so the upstream promise
        //    chain doesn't hang. Any unanswered messages still in the
        //    worker's queue are abandoned along with the renderer when
        //    the `destroy` ControlMsg fires worker-side.
        const teardownErr = new Error("RendererTransport destroyed");
        for (const entry of this._pending.values()) {
            if (entry.kind === "loadAndRender") {
                entry.resolve(undefined);
            } else {
                entry.reject(teardownErr);
            }
        }

        this._pending.clear();
    }

    private _post(msg: ControlMsg): void {
        this._postRaw(msg, []);
    }

    private _postRaw(msg: ControlMsg, transfer: Transferable[]): void {
        if (!this._handle) {
            return;
        }

        this._handle.post(msg, transfer);
    }

    private _handleRendererMsg(msg: WorkerMsg): void {
        switch (msg.kind) {
            case "ready":
                this._resolveReady();
                break;
            case "zoomChanged":
                this._allZoomsDefault = msg.isDefault;
                this._onZoomChanged?.(msg.isDefault);
                break;
            case "saveZoomReply":
                this._resolvePending(msg.requestId, "saveZoom", msg.state);
                break;
            case "pinTooltip":
                this._ensureHostSink()?.pin(msg.lines, msg.pos, msg.bounds);
                break;
            case "dismissTooltip":
                this._hostSink?.dismiss();
                break;
            case "setCursor":
                this._ensureHostSink()?.setCursor(msg.cursor);
                break;
            case "userClick":
                this._dispatchOnViewer(
                    new CustomEvent<PerspectiveClickDetail>(
                        "perspective-click",
                        {
                            bubbles: true,
                            composed: true,
                            detail: msg.detail,
                        },
                    ),
                );
                break;
            case "userSelect": {
                const removeConfigs = this._lastInsertConfig
                    ? [this._lastInsertConfig]
                    : [];
                const insertConfigs = msg.selected ? [msg.insertConfig] : [];
                this._lastInsertConfig = msg.selected
                    ? msg.insertConfig
                    : undefined;
                const detail = new PerspectiveSelectDetail(
                    msg.selected,
                    msg.row,
                    msg.column_names,
                    // `Partial<ViewConfig>` (what the chart emits) is
                    // structurally a `ViewConfigUpdate` for the
                    // `filter`-only patches we ship; the only
                    // incompatible field (`group_by_depth: number |
                    // null`) is never set by our emitters.
                    removeConfigs as any,
                    insertConfigs as any,
                );
                this._dispatchOnViewer(
                    new CustomEvent<PerspectiveSelectDetail>(
                        "perspective-global-filter",
                        {
                            bubbles: true,
                            composed: true,
                            detail,
                        },
                    ),
                );
                break;
            }

            case "frameBitmap":
                this._drawFrameBitmap(msg.bitmap);
                break;
            case "error":
                this._rejectReady(new Error(msg.message));
                break;
            case "loadAndRenderAck":
                this._resolvePending(msg.msgId, "loadAndRender", undefined);
                break;
            case "snapshotPngReply":
                this._resolvePending(msg.requestId, "snapshotPng", msg.blob);
                break;
        }
    }

    /**
     * Look up a pending request by id, verify the recorded kind
     * matches the inbound reply, resolve, and remove. Mismatches are
     * silently dropped — they would only fire if the worker echoed
     * the wrong kind for a given id, which would itself be a bug
     * worth catching at the worker side.
     */
    private _resolvePending(
        id: number,
        kind: PendingRenderType,
        value: unknown,
    ): void {
        const entry = this._pending.get(id);
        if (!entry || entry.kind !== kind) {
            return;
        }

        this._pending.delete(id);
        entry.resolve(value);
    }

    /**
     * Blit-mode handler: draw a renderer-emitted frame into the
     * visible 2D-context display canvas, then close the bitmap so its
     * GPU-backed surface is released. Resizes the visible canvas's
     * drawing buffer to the bitmap dimensions on first frame and
     * after any worker-side resize — the host doesn't directly
     * control GL canvas size in blit mode, so we follow whatever the
     * renderer emits.
     */
    private _drawFrameBitmap(bitmap: ImageBitmap): void {
        if (this._displayCtx && this._hostGlCanvas) {
            const w = bitmap.width;
            const h = bitmap.height;
            if (this._hostGlCanvas.width !== w) {
                this._hostGlCanvas.width = w;
            }

            if (this._hostGlCanvas.height !== h) {
                this._hostGlCanvas.height = h;
            }

            this._displayCtx.globalCompositeOperation = "copy";
            this._displayCtx.drawImage(bitmap, 0, 0);
        }

        bitmap.close();
    }

    /**
     * Dispatch a `CustomEvent` on the `<perspective-viewer>` ancestor
     * of this transport's GL canvas. Walks the parent chain so the
     * event bubbles from the viewer (matching where datagrid
     * dispatches its `perspective-click` / `perspective-global-filter`
     * events). No-op when the canvas is detached or no viewer ancestor
     * exists (test harnesses, snapshot mode).
     */
    private _dispatchOnViewer(ev: CustomEvent): void {
        if (!this._hostGlCanvas) {
            return;
        }

        let node: Node | null = this._hostGlCanvas;
        while (node) {
            if (
                node instanceof HTMLElement &&
                node.tagName === "PERSPECTIVE-VIEWER"
            ) {
                node.dispatchEvent(ev);
                return;
            }

            // Cross shadow-root boundaries — `parentNode` returns `null`
            // at a ShadowRoot, so use `host` when present.
            node =
                (node as ShadowRoot).host ??
                (node as Element).parentNode ??
                null;
        }
    }

    /**
     * Lazily construct a `DomHostSink` rooted at the host GL canvas
     * (cursor mutations) and its parent (pinned-tooltip `<div>`).
     * Returns `null` if the canvas has been detached.
     */
    private _ensureHostSink(): DomHostSink | null {
        if (this._hostSink) {
            return this._hostSink;
        }

        const parent = this._hostGlCanvas?.parentElement;
        if (!parent || !this._hostGlCanvas) {
            return null;
        }

        this._hostSink = new DomHostSink(this._hostGlCanvas, parent);
        return this._hostSink;
    }
}
