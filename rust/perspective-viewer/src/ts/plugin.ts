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

import type { View } from "@perspective-dev/client";
import { PluginStaticConfig } from "./ts-rs/PluginStaticConfig.js";

/**
 * The `IPerspectiveViewerPlugin` interface defines the necessary API for a
 * `<perspective-viewer>` plugin, which also must be an `HTMLElement` via the
 * Custom Elements API or otherwise.  Rather than implement this API from
 * scratch however, the simplest way is to inherit from
 * `<perspective-viewer-plugin>`, which implements `IPerspectiveViewerPlugin`
 * with non-offensive default implementations, where only the `draw()` and
 * `get_static_config()` methods need be overridden to get started with a
 * simple plugin.
 *
 * Note that plugins are frozen once a `<perspective-viewer>` has been
 * instantiated, so generally new plugin code must be executed at the module
 * level (if packaged as a library), or during application init to ensure global
 * availability of a plugin.
 *
 * ## Dispatch contract
 *
 * The host dispatches each method for exactly one reason, and never
 * defensively — implementations may rely on these meanings:
 *
 * - `draw(view)` — `view` is NEW to this plugin: a new engine `View` was
 *   constructed, or this plugin was freshly selected and owes its first
 *   render. Safe to reset zoom/scroll/selection state.
 * - `update(view)` — same `View`, but a plugin-visible input genuinely
 *   changed: new data (`View.on_update`), an effective view-config delta
 *   without a rebuild, a *changed* plugin/columns config just delivered
 *   via `restore()`, changed CSS just applied via `restyle()`, a
 *   render-limits change, or an explicit public `viewer.restore()` call
 *   (the no-op-restore refresh affordance). Host-internal operations that
 *   change none of these dispatch nothing.
 * - `resize(view)` — geometry or visibility changed (including panel
 *   activation); repaint from retained state, no data or CSS re-read.
 * - `restyle()` — the effective theme genuinely changed; when a
 *   `draw`/`update` is part of the same operation, `restyle()` is called
 *   immediately BEFORE it, so one render pass paints in the new theme.
 * - `restore()`/`save()` — state transfer only. Plugins must NOT render
 *   from `restore()` (a changed restore is always followed by exactly one
 *   `update`) and must NOT call host APIs from inside it — a
 *   `restore()` echo re-enters the host's public surface and forces
 *   a redundant render (the classic double-render-on-load bug).
 *
 * Rendering methods (`draw`, `update`, `resize`, `render`, `clear`) and
 * `delete` are serialized per element — the host never overlaps them, and
 * each call runs to completion before the next begins.
 *
 * @example
 * ```javascript
 * const BasePlugin = customElements.get("perspective-viewer-plugin");
 * class MyPlugin extends BasePlugin {
 *     get_static_config() {
 *         return { name: "My Plugin", config_column_names: [] };
 *     }
 *     async draw(view) {
 *         const count = await view.num_rows();
 *         this.innerHTML = `View has ${count} rows`;
 *     }
 * }
 *
 * customElements.define("my-plugin", MyPlugin);
 * const Viewer = customElements.get("perspective-viewer");
 * Viewer.registerPlugin("my-plugin");
 * ```
 * @noInheritDoc
 */
export interface IPerspectiveViewerPlugin {
    /**
     * Static plugin configuration. Called exactly once per plugin at
     * registration time and cached; the result must be stable for the
     * lifetime of the application.
     */
    get_static_config(): PluginStaticConfig;

    /**
     * Determines which column configuration controls are populated in the viewer.
     * Corresponds to the data the plugin will recieve on save. Only
     * invoked when `can_render_column_styles` is `true` in the static
     * config.
     */
    column_style_config?: (view_type: string, group: string) => any;

    /**
     * Render this plugin using the provided `View`.  While there is no
     * provision to cancel a render in progress per se, calling a method on
     * a `View` which has been deleted will throw an exception.
     *
     * The host invokes `draw` ONLY when `view` is NEW to this plugin — a
     * new engine `View` was constructed for a config change, or this plugin
     * element was freshly selected and owes its first render of the bound
     * `View` — so implementations may treat it as "new data shape" and
     * reset zoom/scroll/selection-domain state. Repaints of the same
     * `View` arrive as `update()` (data or style refresh) or `resize()`
     * (geometry/chrome), never `draw()`.
     *
     * @example
     * ```
     * async draw(view: perspective.View): Promise<void> {
     *     const csv = await view.to_csv();
     *     this.innerHTML = `<pre>${csv}</pre>`;
     * }
     * ```
     */
    draw(view: View): Promise<void>;

    /**
     * Draw under the assumption that the `View` has not changed since the
     * previous call to `draw()`, but some plugin-visible input has.
     * Defaults to dispatch to `draw()`.
     *
     * @example
     * ```javascript
     * async update(view: perspective.View): Promise<void> {
     *     return this.draw(view);
     * }
     * ```
     */
    update(view: View): Promise<void>;

    /**
     * Clear this plugin, though it is up to the discretion of the plugin
     * author to determine what this means.  Defaults to resetting this
     * element's `innerHTML`, so be sure to override if you want custom
     * behavior.
     *
     * @example
     * ```javascript
     * async clear(): Promise<void> {
     *     this.innerHTML = "";
     * }
     * ```
     */
    clear(): Promise<void>;

    /**
     * Like `update()`, but for when the dimensions of the plugin have changed
     * and the underlying data has not — a repaint from retained state,
     * invoked ONLY when geometry or visibility changed: box resizes,
     * presize sweeps, and the panel-ACTIVATION chrome nudge (multi-panel),
     * so implementations should repaint activation-dependent chrome here
     * and no-op while hidden (`offsetParent == null`).
     */
    resize(view: View): Promise<void>;

    /**
     * Notify the plugin that the style environment has changed.  Useful for
     * plugins which read CSS styles via `window.getComputedStyle()` — this
     * is the ONLY point at which a plugin is expected to (re-)read them
     * (besides its first `draw()`), so implementations may cache computed
     * styles between `restyle()` calls.
     */
    restyle(): void;

    /**
     * Restore this plugin to a state previously returned by `save()`.
     *
     * State transfer ONLY — implementations must not render from
     * `restore()` (the host follows a restore that genuinely changed
     * plugin state with exactly one `update()` in the same serialized
     * sequence), and must not call host `<perspective-viewer>` APIs from
     * inside it: an echoed `restore()` re-enters the host's public
     * surface where it is indistinguishable from a user call and forces a
     * redundant render. Host API calls to persist plugin state belong to
     * genuine user-gesture handlers (e.g. a toolbar click), never to the
     * `restore()` delivery path.
     */
    restore(config: any): void;

    /**
     * OPTIONAL — clear any visible user selection state (highlighted rows,
     * pinned tooltips) WITHOUT emitting selection events. The host
     * `<perspective-viewer>` invokes this when an element-level global
     * filter contributed by this plugin's selection is removed from the
     * global filter bar, so the selection visual can't outlive the filter
     * it produced. Called under the host's per-panel render serialization
     * (like `draw`), so implementations may redraw. Plugins without a
     * selection UI may omit it.
     */
    deselect?(): Promise<void>;

    /**
     * Free any resources acquired by this plugin and prepare to be deleted.
     */
    delete(): void;
}

/**
 * The `<perspective-viewer-plugin>` element, the default perspective plugin
 * which is registered and activated automcatically when a
 * `<perspective-viewer>` is loaded without plugins.  While you will not
 * typically instantiate this class directly, it is simple enough to function
 * as a good "default" plugin implementation which can be extended to create
 * custom plugins.
 *
 * @example
 * ```javascript
 * class MyPlugin extends customElements.get("perspective-viewer-plugin") {
 *    // Custom plugin overrides
 * }
 * ```
 * @noInheritDoc
 */
export class HTMLPerspectiveViewerPluginElement
    extends HTMLElement
    implements IPerspectiveViewerPlugin
{
    constructor() {
        super();
    }

    get_static_config(): PluginStaticConfig {
        return {
            name: "Debug",
            select_mode: "select",
            config_column_names: [],
        };
    }

    column_style_config(): any {
        return {};
    }

    async update(view: View): Promise<void> {
        return this.draw(view);
    }

    async draw(view: View): Promise<void> {
        this.style.backgroundColor = "#fff";
        const csv = await view.to_csv();
        const css = `margin:0;overflow:scroll;position:absolute;width:100%;height:100%`;
        this.innerHTML = `<pre style='${css}'>${csv}</pre>`;
    }

    async clear(): Promise<void> {
        this.innerHTML = "";
    }

    async resize(view: View): Promise<void> {
        // Not Implemented
    }

    restyle() {
        // Not Implemented
    }

    restore(): void {
        // Not Implemented
    }

    async delete(): Promise<void> {
        // Not Implemented
    }

    get supports_streaming(): boolean {
        return false;
    }
}
