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

import type { FacetConfig, PluginConfig } from "../charts/chart";
import type { PerspectiveClickDetail } from "../event-detail";
import type { ViewConfig } from "@perspective-dev/client";

/**
 * Worker-mode control-channel messages. Distinct from the perspective
 * `ProxySession` channel that the worker's `Client` uses to talk to the
 * host's real `Client` — that's pure protobuf bytes; this one is the
 * chart's own renderer control plane.
 */
export type ControlMsg =
    | InitMsg
    | SetViewByNameMsg
    | SetColumnsConfigMsg
    | SetPluginConfigMsg
    | SetBufferMaxCapacityMsg
    | LoadAndRenderMsg
    | RedrawMsg
    | ResizeMsg
    | ClearMsg
    | InvalidateThemeMsg
    | RestoreZoomMsg
    | ResetAllZoomsMsg
    | ResetExpandedDomainMsg
    | SaveZoomReqMsg
    | SnapshotPngReqMsg
    | InteractionMsg
    | DestroyMsg;

export type WorkerMsg =
    | ReadyMsg
    | ZoomChangedMsg
    | SaveZoomReplyMsg
    | SnapshotPngReplyMsg
    | PinTooltipMsg
    | DismissTooltipMsg
    | SetCursorMsg
    | UserClickMsg
    | UserSelectMsg
    | LoadAndRenderAckMsg
    | FrameBitmapMsg
    | ErrorMsg;

/**
 * Session-tagged envelopes for the shared-worker transport. Every
 * message between the host and the shared `Worker` carries a numeric
 * `sessionId` that addresses a specific `WorkerRenderer` slot in the
 * worker's `RENDERERS` map.
 *
 * In-process mode bypasses these — its `MessageChannel` is per-
 * transport, so messages are already private and routing isn't
 * needed. Only worker-mode `RendererTransport` and the worker-scope
 * message handler wrap / unwrap envelopes.
 */
export interface ControlEnvelope {
    sessionId: number;
    msg: ControlMsg;
}

export interface WorkerEnvelope {
    sessionId: number;
    msg: WorkerMsg;
}

export interface InitMsg {
    kind: "init";

    /**
     * GL canvas display strategy. `"direct"` means `glCanvas` below is
     * the host's `.webgl-canvas` transferred via
     * `transferControlToOffscreen` and the renderer paints straight
     * into it. `"blit"` means `glCanvas` is omitted; the renderer
     * allocates its own internal `OffscreenCanvas`, renders into it,
     * and posts each completed frame back as a `FrameBitmapMsg` for
     * the host to draw into a 2D-context display canvas.
     */
    renderMode: "direct" | "blit";

    /**
     * Transferred via `transferControlToOffscreen` on the host. Present
     * iff `renderMode === "direct"`. In blit mode the renderer
     * constructs its own offscreen surface from `cssWidth`/`cssHeight`/
     * `dpr` and there is no host-side GL drawing buffer.
     */
    glCanvas?: OffscreenCanvas;
    gridlinesCanvas: OffscreenCanvas;
    chromeCanvas: OffscreenCanvas;

    /**
     * `MessagePort` to the host's `ProxySession`. Worker mode only —
     * the worker bootstraps a fresh `Client` and bridges it through
     * this port. In-process mode uses the host's `Client` directly
     * (handed in via `bootstrapInProcess`'s `client` option), so no
     * proxy bridge is needed.
     */
    proxyPort?: MessagePort;

    /**
     * Compiled perspective-js client wasm forwarded from the host.
     * Worker mode only — passed to `module.initSync(...)` after the
     * worker dynamic-imports `clientWorkerURL`. In-process mode
     * inherits the host's already-bound wasm via the supplied
     * `Client` instance.
     */
    clientWasm?: WebAssembly.Module;

    /**
     * URL the worker uses to dynamic-import the perspective-viewer
     * wasm-bindgen JS module. Worker mode only — required because
     * the worker scope can't share module instances with the host.
     * In-process mode uses the host's already-loaded module via
     * the supplied `Client` instance.
     */
    clientWorkerURL?: URL;

    /**
     * `ChartTypeConfig.tag` — selects which `ChartImplementation` to
     * construct in the worker. The worker has its own copy of the
     * chart class registry.
     */
    chartTag: string;

    /**
     * Server-assigned `View` name for `client.__unsafe_open_view(name)`.
     */
    viewName: string;

    /**
     * `Table` name for the worker to resolve via `client.open_table(...)`
     * once at bootstrap. Used for source-schema lookups (group-by level
     * types) on the render path so the host doesn't have to await
     * `table.schema()` on every draw. May be omitted if the host viewer
     * has no table loaded yet — `loadAndRender` falls back to an empty
     * source schema in that case.
     */
    tableName?: string;
    facetConfig: FacetConfig;

    /**
     * Initial plugin-scoped global config. Seeds the chart impl's
     * `_pluginConfig` before the first `loadAndRender` so the build
     * pipeline (`auto_alt_y_axis`, `band_inner_frac`, `bar_inner_pad`)
     * and render-path uniforms see correct values on the very first
     * frame. The host's later `restore({ plugin_config })` arrives as
     * a `setPluginConfig` control msg.
     */
    pluginConfig: PluginConfig;
    defaultChartType?: string;

    /**
     * Pre-resolved CSS-variable theme snapshot from the host.
     */
    themeVars: ThemeSnapshot;

    /**
     * `@font-face` rules captured from the host document, to be
     * re-loaded into the worker's `self.fonts` set before first
     * paint. Worker mode only — workers don't share `FontFaceSet`
     * with the document, so any font referenced via `font-family`
     * must be reloaded there. In-process mode shares
     * `document.fonts` with the host so the array is empty / unused.
     * See `snapshotFontFaces()` for CORS / scope caveats.
     */
    fontFaces: FontFaceDescriptor[];

    /**
     * Initial CSS size + DPR; subsequent resizes arrive as `resize`.
     */
    cssWidth: number;
    cssHeight: number;
    dpr: number;

    /**
     * `ChartTypeConfig.max_cells` for the buffer pool.
     */
    bufferMaxCapacity: number;

    /**
     * If `true`, the `WebGLContextManager` constructed on the
     * renderer side compiles + links every shader in
     * `SHADER_MANIFEST` during construction. Trades a known init-time
     * cost for elimination of inline compile latency on first frame.
     * Default behavior (when undefined) is lazy compilation as a
     * side effect of each glyph's first `getOrCreate` call.
     */
    precompileShaders?: boolean;
}

/**
 * Plain-object form of an `@font-face` rule, structured-cloneable for
 * `postMessage`. The worker reconstitutes a `FontFace` via
 * `new FontFace(family, src, descriptors)`, awaits its load, and
 * registers it in `self.fonts`.
 *
 * `src` is the raw CSS `src:` value (e.g.
 * `url(https://…/foo.woff2) format("woff2")`), with every `url(...)`
 * already absolutized on the host against the parent stylesheet's
 * `href` — the worker's script URL is a Blob URL, so relative URLs
 * would otherwise fail to resolve.
 */
export interface FontFaceDescriptor {
    family: string;
    src: string;
    style?: string;
    weight?: string;
    stretch?: string;
    unicodeRange?: string;
    variant?: string;
    featureSettings?: string;
    display?: string;
}

/**
 * Theme values resolved on the host via `getComputedStyle` and shipped
 * to the renderer scope, which has no DOM. Decoded by the chart via
 * `theme/theme.ts::resolveThemeFromVars`. Plain map for
 * structured-clone.
 */
export type ThemeSnapshot = Record<string, string>;

export interface SetViewByNameMsg {
    kind: "setViewByName";
    name: string;
}

export interface SetColumnsConfigMsg {
    kind: "setColumnsConfig";
    cfg: Record<string, any>;
}

/**
 * Host → worker: replace the chart impl's `_pluginConfig` with a new
 * snapshot. Sent on every `plugin.restore({ plugin_config })`. The
 * chart re-syncs derived state (`_facetConfig.facet_mode`,
 * `_facetConfig.zoom_mode`, `_autoFitValue`) in `setPluginConfig` and
 * the host posts a `redraw` so render-path uniform changes (line
 * widths, point size) take effect on the next frame. Build-time
 * fields (`auto_alt_y_axis`, `band_inner_frac`, `bar_inner_pad`) take
 * effect on the next `loadAndRender`.
 */
export interface SetPluginConfigMsg {
    kind: "setPluginConfig";
    cfg: PluginConfig;
}

export interface SetBufferMaxCapacityMsg {
    kind: "setBufferMaxCapacity";
    n: number;
}

/**
 * Host → worker: trigger a full data-fetch + render cycle. The worker
 * resolves all schema / row-count metadata against its own `View` and
 * `Table` (no host-side `Client`/`Table`/`View` await on the render
 * path), runs `view.with_typed_arrays`, and uploads the resulting
 * column data straight into the chart impl on the same thread —
 * eliminating the prior cross-boundary `postMessage` of column buffers.
 *
 * `viewerConfig` ships the bits the worker can't read for itself
 * (`<perspective-viewer>` element APIs, not `Client`/`Table`/`View`).
 *
 * Mid-flight cancellation: each call increments a worker-side
 * generation counter. A newer `loadAndRender` arriving while one is in
 * flight causes the older call's `with_typed_arrays` callback to throw
 * a sentinel before any chart mutation, unwinding the wasm Arrow
 * buffer release before the new call proceeds. Both calls reply with
 * `loadAndRenderAck` so the host promise resolves either way.
 */
export interface LoadAndRenderMsg {
    kind: "loadAndRender";
    msgId: number;
    viewerConfig: {
        group_by: string[];
        split_by: string[];
        columns: (string | null)[];
    };
    options: {
        float32: boolean;
    };
}

/**
 * Worker → host reply to a `LoadAndRenderMsg`. Always sent — including
 * on stale-generation drop — so the host's awaited promise resolves
 * deterministically.
 */
export interface LoadAndRenderAckMsg {
    kind: "loadAndRenderAck";
    msgId: number;
}

export interface RedrawMsg {
    kind: "redraw";
}

export interface ResizeMsg {
    kind: "resize";
    cssWidth: number;
    cssHeight: number;
    dpr: number;
}

export interface ClearMsg {
    kind: "clear";
}

export interface InvalidateThemeMsg {
    kind: "invalidateTheme";

    /**
     * Fresh CSS-variable snapshot — the worker can't read DOM.
     */
    themeVars: ThemeSnapshot;
}

export interface RestoreZoomMsg {
    kind: "restoreZoom";
    state: any;
}

export interface ResetAllZoomsMsg {
    kind: "resetAllZooms";
}

/**
 * Host → worker: clear the chart's `domain_mode: "expand"` accumulator
 * so the next data load starts from a fresh extent. Sent at the head
 * of every `plugin.draw()` (which always indicates a view-level
 * change). `plugin.update()` does not send this — same view, more
 * data, the accumulator should keep growing.
 */
export interface ResetExpandedDomainMsg {
    kind: "resetExpandedDomain";
}

export interface SaveZoomReqMsg {
    kind: "saveZoom";
    requestId: number;
}

/**
 * Host → worker: ask the renderer to flush a frame and return a PNG of
 * the composited canvas stack. The reply ships a `Blob` correlated to
 * the request via `requestId` (allocated by the host's
 * `RendererTransport.snapshotPng()`).
 */
export interface SnapshotPngReqMsg {
    kind: "snapshotPng";
    requestId: number;
}

/**
 * Worker → host reply to a `SnapshotPngReqMsg`. Resolves the
 * corresponding host-side promise with the encoded `Blob`.
 */
export interface SnapshotPngReplyMsg {
    kind: "snapshotPngReply";
    requestId: number;
    blob: Blob;
}

export interface DestroyMsg {
    kind: "destroy";
}

/**
 * Raw pointer / wheel event forwarded from the host's
 * `RawEventForwarder` to the renderer. Coordinates are canvas-relative
 * CSS pixels (host already subtracted `getBoundingClientRect`).
 *
 * `pointerdown` carries `pointerId` so the host can drive
 * `setPointerCapture` while the corresponding `pointermove` /
 * `pointerup` events fire even when the cursor leaves the canvas.
 *
 * `pointermove` drives both pan (when a drag is active) and tooltip
 * hover (when not). `pointerleave` drives tooltip leave. `click` /
 * `dblclick` drive tooltip click handling. One channel per cursor
 * stream — no parallel `mouse*` mirror.
 */
export type InteractionEvent =
    | { type: "wheel"; mx: number; my: number; deltaY: number }
    | { type: "pointerdown"; mx: number; my: number; pointerId: number }
    | { type: "pointermove"; mx: number; my: number }
    | { type: "pointerup" }
    | { type: "pointerleave" }
    | { type: "click"; mx: number; my: number }
    | { type: "dblclick"; mx: number; my: number };

export interface InteractionMsg {
    kind: "interaction";
    event: InteractionEvent;
}

export interface ReadyMsg {
    kind: "ready";
}

export interface ZoomChangedMsg {
    kind: "zoomChanged";
    isDefault: boolean;
}

export interface SaveZoomReplyMsg {
    kind: "saveZoomReply";
    requestId: number;
    state: any;
}

export interface ErrorMsg {
    kind: "error";
    message: string;
}

/**
 * Worker-side request to render a pinned tooltip on the host. The
 * worker has no DOM, so the persistent tooltip `<div>` is materialized
 * by `RendererTransport` (via a `DomHostSink`) on receipt. `bounds` ships
 * the chart's CSS size so the host can clamp the tooltip without
 * reading the canvas geometry itself.
 */
export interface PinTooltipMsg {
    kind: "pinTooltip";
    lines: string[];
    pos: { px: number; py: number };
    bounds: { cssWidth: number; cssHeight: number };
}

export interface DismissTooltipMsg {
    kind: "dismissTooltip";
}

/**
 * Renderer → host: set the GL canvas's `style.cursor`. The renderer
 * has no DOM (worker mode) — `cursor` is a CSS cursor value
 * (`"pointer"`, `"default"`, etc.) applied directly by the host on
 * receipt.
 */
export interface SetCursorMsg {
    kind: "setCursor";
    cursor: string;
}

/**
 * Renderer → host: a user click landed on a chart glyph. Host
 * re-dispatches as `CustomEvent<PerspectiveClickDetail>` on the
 * `<perspective-viewer>` ancestor. Payload is a plain object so it
 * survives `postMessage` without losing the class prototype.
 */
export interface UserClickMsg {
    kind: "userClick";
    detail: PerspectiveClickDetail;
}

/**
 * Renderer → host: a user click pinned or unpinned a chart target.
 * Host materializes a `PerspectiveSelectDetail` from this payload plus
 * its own cached previous-insert config and dispatches as
 * `CustomEvent<PerspectiveSelectDetail>` (`perspective-global-filter`).
 * `removeConfigs` is computed host-side — not sent.
 */
export interface UserSelectMsg {
    kind: "userSelect";
    selected: boolean;
    row: Record<string, unknown>;
    column_names: string[];
    insertConfig: Partial<ViewConfig>;
}

/**
 * Worker → host: a completed GL frame, materialized as an
 * `ImageBitmap` from the renderer's internal offscreen canvas via
 * `transferToImageBitmap()`. Sent only in `renderMode === "blit"`,
 * after each `_fullRender` completes. The host draws the bitmap into
 * its 2D-context display canvas and calls `bitmap.close()` to release
 * the GPU-backed surface.
 *
 * The bitmap MUST appear in the postMessage transfer list — the
 * underlying surface is moved, not copied, so failing to transfer
 * renders the host's drawImage a no-op (or worse, a Safari crash on
 * older WebKits).
 */
export interface FrameBitmapMsg {
    kind: "frameBitmap";
    bitmap: ImageBitmap;
}
