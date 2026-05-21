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
     * Draw under the assumption that the `ViewConfig` has not changed since
     * the previous call to `draw()`, but the underlying data has.  Defaults to
     * dispatch to `draw()`.
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
     * and the underlying data has not.
     */
    resize(view: View): Promise<void>;

    /**
     * Notify the plugin that the style environment has changed.  Useful for
     * plugins which read CSS styles via `window.getComputedStyle()`.
     */
    restyle(): void;

    /**
     * Restore this plugin to a state previously returned by `save()`.
     */
    restore(config: any): void;

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
