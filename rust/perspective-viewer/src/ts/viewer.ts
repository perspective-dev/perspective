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

import type * as perspective from "@finos/perspective";
import { PerspectiveColumnConfig } from "./perspective-viewer";

export type Type =
    | "string"
    | "float"
    | "integer"
    | "boolean"
    | "date"
    | "datetime"
    | "object";

export type SortDir =
    | "asc"
    | "asc abs"
    | "desc"
    | "desc abs"
    | "col asc"
    | "col asc abs"
    | "col desc"
    | "col desc abs";

export type Aggregate =
    | "abs sum"
    | "and"
    | "any"
    | "avg"
    | "count"
    | "distinct count"
    | "distinct leaf"
    | "dominant"
    | "first"
    | "high"
    | "last"
    | "low"
    | "or"
    | "median"
    | "pct sum parent"
    | "pct sum grand total"
    | "stddev"
    | "sum"
    | "sum abs"
    | "sum not null"
    | "unique"
    | "var"
    | ["weighted mean", ColumnName];

export type FilterOp =
    | "<"
    | ">"
    | "<="
    | ">="
    | "=="
    | "!="
    | "is null"
    | "is not null"
    | "in"
    | "not in"
    | "begins with"
    | "contains";

export type ColumnName = string | null;
export type Expressions = Record<string, string>;
export type Filter = [
    ColumnName,
    FilterOp,
    string | number | Date | boolean | Array<string | number | Date | boolean>
];

export type Sort = [ColumnName, SortDir];

export type ViewConfig = {
    columns?: Array<ColumnName>;
    group_by?: Array<ColumnName>;
    split_by?: Array<ColumnName>;
    aggregates?: { [column_name: string]: Aggregate };
    sort?: Array<Sort>;
    filter?: Array<Filter>;
    expressions?: Expressions;
};

export type PerspectiveViewerConfig = ViewConfig & {
    version?: string;
    theme?: string;
    title?: string | null;
    plugin?: string;
    settings?: boolean;
    plugin_config?: any;
    columns_config?: PerspectiveColumnConfig;
};

export type RenderStats = {
    /**
     * The most recent N render times (default 5)
     */
    render_times: Array<number>;

    /**
     * Number of plugin renders since the last time `getRenderStats()` was
     * called.
     */
    total_render_count: number;

    /**
     * Time since last `getRenderStats()` call (in milliseconds).
     */
    total_time: number;

    /**
     * Estimated max framerate (in frames per second) of _just_ plugin draw
     * calls (e.g. how many frames could be drawn if there was no engine wait
     * time).
     */
    virtual_fps: number;

    /**
     * Actual framerate (in frames per second) since last `getRenderStats()`
     * call.
     */
    actual_fps: number;
};

/**
 * The Custom Elements implementation for `<perspective-viewer>`, as well at its
 * API.  `PerspectiveViewerElement` should not be constructed directly (like its
 * parent class `HTMLElement`);  instead, use `document.createElement()` or
 * declare your `<perspective-viewer>` element in HTML.  Once instantiated,
 * `<perspective-viewer>` works just like a standard `HTMLElement`, with a few
 * extra perspective-specific methods.
 *
 * @example
 * ```javascript
 * const viewer = document.createElement("perspective-viewer");
 * ```
 * @example
 * ```javascript
 * document.body.innerHTML = `
 *     <perspective-viewer id="viewer"></perspective-viewer>
 * `;
 * const viewer = document.body.querySelector("#viewer");
 * ```
 */
export interface IPerspectiveViewerElement {
    /**
     * Load a `perspective.Table`.  If `load` or `update` have already been
     * called on this element, its internal `perspective.Table` will _not_ be
     * deleted, but it will bed de-referenced by this `<perspective-viewer>`.
     *
     * @category Data
     * @param data A `Promise` which resolves to the `perspective.Table`
     * @returns {Promise<void>} A promise which resolves once the data is
     * loaded, a `perspective.View` has been created, and the active plugin has
     * rendered.
     * @example <caption>Load perspective.table</caption>
     *
     * ```javascript
     * const my_viewer = document.getElementById('#my_viewer');
     * const tbl = perspective.table("x,y\n1,a\n2,b");
     * my_viewer.load(tbl);
     * ```
     * @example <caption>Load Promise&lt;perspective.table&gt;</caption>
     *
     * ```javascript
     * const my_viewer = document.getElementById('#my_viewer');
     * const tbl = perspective.table("x,y\n1,a\n2,b");
     * my_viewer.load(tbl);
     * ```
     */
    load(
        table: Promise<perspective.JsTable> | perspective.JsTable
    ): Promise<void>;

    /**
     * Redraw this `<perspective-viewer>` and plugin when its dimensions or
     * visibility has been updated.  By default, `<perspective-viewer>` will
     * auto-size when its own dimensions change, so this method need not be
     * called;  when disabled via `setAutoSize(false)` however, this method
     * _must_ be called, and will not respond to dimension or style changes to
     * its parent container otherwise.  `notifyResize()` does not recalculate
     * the current `View`, but all plugins will re-request the data window
     * (which itself may be smaller or larger due to resize).
     *
     * @category Util
     * @param force Whether to re-render, even if the dimenions have not
     * changed.  When set to `false` and auto-size is enabled (the defaults),
     * calling this method will automatically disable auto-size.
     * @returns A `Promise<void>` which resolves when this resize event has
     * finished rendering.
     * @example <caption>Bind `notfyResize()` to browser dimensions</caption>
     *
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * viewer.setAutoSize(false);
     * window.addEventListener("resize", () => viewer.notifyResize());
     * ```
     */
    notifyResize(force): Promise<void>;

    /**
     * Determines the auto-size behavior.  When `true` (the default), this
     * element will re-render itself whenever its own dimensions change,
     * utilizing a `ResizeObserver`;  when `false`, you must explicitly call
     * `notifyResize()` when the element's dimensions have changed.
     *
     * @category Util
     * @param autosize Whether to re-render when this element's dimensions
     * change.
     * @example <caption>Disable auto-size</caption>
     *
     * ```javascript
     * await viewer.setAutoSize(false);
     * ```
     */
    setAutoSize(autosize): void;

    /**
     * Determines the auto-pause behavior.  When `true` (default `false`), this
     * element will enter paused state (deleting it's `View` and ignoring
     * render calls) whenever it is not visible in the browser's viewport,
     * utilizing an `IntersectionObserver`.
     *
     * @category Util
     * @param autopause Whether to re-render when this element's dimensions
     * change.
     * @example <caption>Disable auto-size</caption>
     *
     * ```javascript
     * await viewer.setAutoPause(true);
     * ```
     */
    setAutoPause(autopause): void;

    /**
     * Returns the `perspective.Table()` which was supplied to `load()`
     *
     * @category Data
     * @param wait_for_table Whether to await `load()` if it has not yet been
     * invoked, or fail immediately.
     * @returns A `Promise` which resolves to a `perspective.Table`
     * @example <caption>Share a `Table`</caption>
     *
     * ```javascript
     * const viewers = document.querySelectorAll("perspective-viewer");
     * const [viewer1, viewer2] = Array.from(viewers);
     * const table = await viewer1.getTable();
     * await viewer2.load(table);
     * ```
     */
    getTable(wait_for_table?: boolean): Promise<perspective.JsTable>;

    /**
     * Returns the underlying `perspective.View` currently configured for this
     * `<perspective-viewer>`.  Because ownership of the `perspective.View` is
     * mainainted by the `<perspective-viewer>` it was created by, this `View`
     * may become deleted (invalidated by calling `delete()`) at any time -
     * specifically, it will be deleted whenever the `PerspectiveViewConfig`
     * changes.  Because of this, when using this API, prefer calling
     * `getView()` repeatedly over caching the returned `perspective.View`,
     * especially in `async` contexts.
     *
     * @category Data
     * @returns A `Promise` which ressolves to a `perspective.View`.
     * @example <caption>Collapse grid to root</caption>
     *
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * const view = await viewer.getView();
     * await view.set_depth(0);
     * ```
     */
    getView(): Promise<perspective.JsView>;

    /**
     * Restore this element to a state as generated by a reciprocal call to
     * `save`.  In `json` (default) format, `PerspectiveViewerConfig`'s fields
     * have specific semantics:
     *
     *  - When a key is missing, this field is ignored;  `<perspective-viewer>`
     *    will maintain whatever settings for this field is currently applied.
     *  - When the key is supplied, but the value is `undefined`, the field is
     *    reset to its default value for this current `View`, i.e. the state it
     *    would be in after `load()` resolves.
     *  - When the key is defined to a value, the value is applied for this
     *    field.
     *
     * This behavior is convenient for explicitly controlling current vs desired
     * UI state in a single request, but it does make it a bit inconvenient to
     * use `restore()` to reset a `<perspective-viewer>` to default as you must
     * do so explicitly for each key;  for this case, use `reset()` instead of
     * restore.
     *
     * As noted in `save()`, this configuration state does not include the
     * `Table` or its `Schema`.  In order for `restore()` to work correctly, it
     * must be called on a `<perspective-viewer>` that has a `Table already
     * `load()`-ed, with the same (or a type-compatible superset) `Schema`.
     * It does not need have the same rows, or even be populated.
     *
     * @category Persistence
     * @param config returned by `save()`.  This can be any format returned by
     * `save()`; the specific deserialization is chosen by `typeof config`.
     * @returns A promise which resolves when the changes have been applied and
     * rendered.
     * @example <caption>Restore a viewer from `localStorage`</caption>
     *
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * const token = localStorage.getItem("viewer_state");
     * await viewer.restore(token);
     * ```
     */
    restore(
        config: PerspectiveViewerConfig | string | ArrayBuffer
    ): Promise<void>;

    /**
     * Serialize this element's attribute/interaction state, but _not_ the
     * `perspective.Table` or its `Schema`.  `save()` is designed to be used in
     * conjunction with `restore()` to persist user settings and bookmarks, but
     * the `PerspectiveViewerConfig` object returned in `json` format can also
     * be written by hand quite easily, which is useful for authoring
     * pre-conceived configs.
     *
     * @category Persistence
     * @param format The serialization format - `json` (JavaScript object),
     * `arraybuffer` or `string`.  `restore()` uses the returned config's type
     * to infer format.
     * @returns a serialized element in the chosen format.
     * @example <caption>Save a viewer to `localStorage`</caption>
     *
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * const token = await viewer.save("string");
     * localStorage.setItem("viewer_state", token);
     * ```
     */
    save(): Promise<PerspectiveViewerConfig>;
    save(format: "json"): Promise<PerspectiveViewerConfig>;
    save(format: "arraybuffer"): Promise<ArrayBuffer>;
    save(format: "string"): Promise<string>;
    save(
        format?: "json" | "arraybuffer" | "string"
    ): Promise<PerspectiveViewerConfig | string | ArrayBuffer>;

    /**
     * Flush any pending modifications to this `<perspective-viewer>`.  Since
     * `<perspective-viewer>`'s API is almost entirely `async`, it may take
     * some milliseconds before any method call such as `restore()` affects
     * the rendered element.  If you want to make sure any invoked method which
     * affects the rendered has had its results rendered, call and await
     * `flush()`
     *
     * @category Util
     * @returns {Promise<void>} A promise which resolves when the current
     * pending state changes have been applied and rendered.
     * @example <caption>Flush an unawaited `restore()`</caption>
     *
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * viewer.restore({group_by: ["State"]});
     * await viewer.flush();
     * console.log("Viewer has been rendered with a pivot!");
     * ```
     */
    flush(): Promise<void>;

    /**
     * Reset's this element's view state and attributes to default.  Does not
     * delete this element's `perspective.table` or otherwise modify the data
     * state.
     *
     * @category Persistence
     * @param all Should `expressions` param be reset as well, defaults to
     * @example
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * await viewer.reset();
     * ```
     */
    reset(all): Promise<void>;

    /**
     * Deletes this element and clears it's internal state (but not its
     * user state).  This (or the underlying `perspective.view`'s equivalent
     * method) must be called in order for its memory to be reclaimed, as well
     * as the reciprocal method on the `perspective.table` which this viewer is
     * bound to.
     *
     * @category Util
     */
    delete(): Promise<void>;

    /**
     * Download this element's data as a CSV file.
     *
     * @category UI Action
     * @param flat Whether to use the element's current view
     * config, or to use a default "flat" view.
     */
    download(flat: boolean): Promise<void>;

    /**
     * Copies this element's view data (as a CSV) to the clipboard.  This method
     * must be called from an event handler, subject to the browser's
     * restrictions on clipboard access.  See
     * {@link https://www.w3.org/TR/clipboard-apis/#allow-read-clipboard}.
     *
     * @category UI Action
     * @param flat Whether to use the element's current view
     * config, or to use a default "flat" view.
     * @example
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * const button = document.querySelector("button");
     * button.addEventListener("click", async () => {
     *     await viewer.copy();
     * });
     * ```
     */
    copy(flat: boolean): Promise<void>;

    /**
     * Restyles the elements and to pick up any style changes.  While most of
     * perspective styling is plain CSS and can be updated at any time, some
     * CSS rules are read and cached, e.g. the series colors for
     * `@finos/perspective-viewer-d3fc` which are read from CSS then reapplied
     * as SVG and Canvas attributes.
     *
     * @category Util
     */
    restyleElement(): Promise<void>;

    /**
     * Sets the theme names available via the `<perspective-viewer>` status bar
     * UI.  Typically these will be auto-detected simply by including the
     * theme `.css` in a `<link>` tag;  however, auto-detection can fail if
     * the `<link>` tag is not a same-origin request due to CORS.  For servers
     * configured to allow cross-origin requests, you can use the
     * [`crossorigin` attribute](https://html.spec.whatwg.org/multipage/semantics.html#attr-link-crossorigin)
     * to enable detection, e.g. `<link crossorigin="anonymous" .. >`.  If for
     * whatever reason auto-detection still fails, you may set the themes via
     * this method.  Note the theme `.css` must still be loaded in this case -
     * the `resetThemes()` method only lets the `<perspective-viewer>` know what
     * theme names are available.
     *
     * @category Util
     * @param themes A list of theme names to use, or auto-detect from
     * document's stylesheets if `undefined`.
     * @example
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * await viewer.resetThemes(["Pro Light", "Pro Dark"]);
     * ```
     */
    resetThemes(themes?: Array<string>): Promise<void>;

    /**
     * Gets the edit port, the port number for which `Table` updates from this
     * `<perspective-viewer>` are generated.  This port number will be present
     * in the options object for a `View.on_update()` callback for any update
     * which was originated by the `<perspective-viewer>`/user, which can be
     * used to distinguish server-originated updates from user edits.
     *
     * @category Util
     * @returns A promise which resolves to the current edit port.
     * @example
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * const editport = await viewer.getEditPort();
     * const table = await viewer.getTable();
     * const view = await table.view();
     * view.on_update(obj => {
     *     if (obj.port_id = editport) {
     *         console.log("User edit detected");
     *     }
     * });
     * ```
     */
    getEditPort(): number;

    /**
     * Get render statistics since the last time `getRenderStats()` was called.
     *
     * @category Util
     * @returns A `RenderStats` statistics struct.
     * @example
     * ```javascript
     * const viewer = document.querySelector("perspective-viewer");
     * const stats = viewer.getRenderStats();
     * console.log(stats.virtual_fps);
     * ```
     */
    getRenderStats(): RenderStats;

    /**
     * Determines the render throttling behavior. Can be an integer, for
     * millisecond window to throttle render event; or, if `undefined`,
     * will try to determine the optimal throttle time from this component's
     * render framerate.
     *
     * @category Util
     * @param value an optional throttle rate in milliseconds (integer).  If not
     * supplied, adaptive throttling is calculated from the average plugin
     * render time.
     * @example <caption>Limit FPS to 1 frame per second</caption>
     *
     * ```javascript
     * await viewer.setThrottle(1000);
     * ```
     */
    setThrottle(value?: number): void;

    /**
     * Opens/closes the element's config menu, equivalent to clicking the
     * settings button in the UI.  This method is equivalent to
     * `viewer.restore({settings: force})` when `force` is present, but
     * `restore()` cannot toggle as `toggleConfig()` can, you would need to
     * first read the settings state from `save()` otherwise.
     *
     * Calling `toggleConfig()` may be delayed if an async render is currently
     * in process, and it may only partially render the UI if `load()` has not
     * yet resolved.
     *
     * @category UI Action
     * @param force If supplied, explicitly set the config state to "open"
     * (`true`) or "closed" (`false`).
     * @example
     * ```javascript
     * await viewer.toggleConfig();
     * ```
     */
    toggleConfig(force?: boolean): Promise<void>;

    /**
     * Get the currently active plugin custom element instance, or a specific
     * named instance if requested.  `getPlugin(name)` does not activate the
     * plugin requested, so if this plugin is not active the returned
     * `HTMLElement` will not have a `parentElement`.
     *
     * If no plugins have been registered (via `registerPlugin()`), calling
     * `getPlugin()` will cause `perspective-viewer-plugin` to be registered as
     * a side effect.
     *
     * @category Plugin
     * @param name Optionally a specific plugin name, defaulting to the current
     * active plugin.
     * @returns The active or requested plugin instance.
     */
    getPlugin(name?: string): Promise<HTMLElement>;

    /**
     * Get all plugin custom element instances, in order of registration.
     *
     * If no plugins have been registered (via `registerPlugin()`), calling
     * `getAllPlugins()` will cause `perspective-viewer-plugin` to be registered
     * as a side effect.
     *
     * @category Plugin
     * @returns An `Array` of the plugin instances for this
     * `<perspective-viewer>`.
     */
    getAllPlugins(): Array<HTMLElement>;

    /**
     * Get the raw pointer to this `<perspective-viewer>` WASM model, such that
     * it may be passed back to WASM function calls that take a
     * `PerspectiveViewerElement` as an argument.
     *
     * @category Internal
     * @returns A pointer to this model
     */
    unsafeGetModel(): number;
}
