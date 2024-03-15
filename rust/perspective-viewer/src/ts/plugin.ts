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

// import type * as perspective from "@finos/perspective";

/**
 * The `IPerspectiveViewerPlugin` interface defines the necessary API for a
 * `<perspective-viewer>` plugin, which also must be an `HTMLElement` via the
 * Custom Elements API or otherwise.  Rather than implement this API from
 * scratch however, the simplest way is to inherit from
 * `<perspective-viewer-plugin>`, which implements `IPerspectiveViewerPlugin`
 * with non-offensive default implementations, where only the `draw()` and
 * `name()` methods need be overridden to get started with a simple plugin.
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
 *     get name() {
 *         return "My Plugin";
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
     * The name for this plugin, which is used as both it's unique key for use
     * as a parameter for the `plugin` field of a `ViewerConfig`, and as the
     * display name for this plugin in the `<perspective-viewer>` UI.
     */
    get name(): string;

    /**
     * Select mode determines how column add/remove buttons behave for this
     * plugin.  `"select"` mode exclusively selects the added column, removing
     * other columns.  `"toggle"` mode toggles the column on or off (dependent
     * on column state), leaving existing columns alone.
     */
    get select_mode(): string | undefined;

    /**
     * The minimum number of columns required for this plugin to operate.
     * This mostly affects drag/drop and column remove button behavior,
     * preventing the use from applying configs which violate this min.
     *
     * While this option can technically be `undefined` (as in the case of
     * `@finos/perspective-viewer-datagrid`), doing so currently has nearly
     * identical behavior to 1.
     */
    get min_config_columns(): number | undefined;

    /**
     * The named column labels, if desired.  Named columns behave differently
     * in drag/drop mode than unnamed columns, having replace/swap behavior
     * rather than insert.  If provided, the length of `config_column_names`
     * _must_ be `>= min_config_columns`, as this is assumed by the drag/drop
     * logic.
     */
    get config_column_names(): string[] | undefined;

    /**
     * The load priority of the plugin. If the plugin shares priority with another,
     * the first to load has a higher priority.
     *
     * A larger number has a higher priority.
     *
     * The plugin with the highest priority will be loaded by default by the Perspective viewer.
     * If you would like to instead begin with a lower priority plugin, choose it explicitly with
     * a `HTMLPerspectiveViewerPluginElement.restore` call.
     */
    get priority(): number | undefined;

    /**
     * Given a column's grouping (determined by indexing it in `plugin.config_column_names`)
     * and its view type, determines whether or not to render column styles in the settings sidebar.
     * Implementing this function and `column_style_config` allows the plugin to interface with the viewer's column configuration API.
     */
    can_render_column_styles?: (view_type: string, group: string) => boolean;

    /**
     * Determines which column configuration controls are populated in the viewer.
     * Corresponds to the data the plugin will recieve on save.
     * Implementing this function and `can_render_column_styles` allows the plugin to interface with the viewer's column configuration API.
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
    // draw(view: perspective.View): Promise<void>;

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
    // update(view: perspective.View): Promise<void>;

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
    resize(): Promise<void>;

    /**
     * Notify the plugin that the style environment has changed.  Useful for
     * plugins which read CSS styles via `window.getComputedStyle()`.
     */
    restyle(): Promise<void>;

    /**
     * Save this plugin's state to a JSON-serializable value.  While this value
     * can be anything, it should work reciprocally with `restore()` to return
     * this plugin's renderer to the same state, though potentially with a
     * different `View`.
     *
     * `save()` should be used for user-persistent settings that are
     * data-agnostic, so the user can have persistent view during refresh or
     * reload.  For example, `@finos/perspective-viewer-d3fc` uses
     * `plugin_config` to remember the user-repositionable legend coordinates.
     */
    save(): Promise<any>;

    /**
     * Restore this plugin to a state previously returned by `save()`.
     */
    restore(config: any): Promise<void>;

    /**
     * Free any resources acquired by this plugin and prepare to be deleted.
     */
    delete(): Promise<void>;
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

    get name(): string {
        return "Debug";
    }

    get select_mode(): "select" | "toggle" {
        return "select";
    }

    get min_config_columns(): number | undefined {
        return undefined;
    }

    get config_column_names(): string[] | undefined {
        return undefined;
    }

    get priority(): number {
        return 0;
    }

    can_render_column_styles(): boolean {
        return false;
    }

    column_style_config(): any {
        {
        }
    }

    async update(view): Promise<void> {
        return this.draw(view);
    }

    async draw(view): Promise<void> {
        this.style.backgroundColor = "#fff";
        const csv = await view.to_csv();
        const css = `margin:0;overflow:scroll;position:absolute;width:100%;height:100%`;
        this.innerHTML = `<pre style='${css}'>${csv}</pre>`;
    }

    async clear(): Promise<void> {
        this.innerHTML = "";
    }

    async resize(): Promise<void> {
        // Not Implemented
    }

    async restyle(): Promise<void> {
        // Not Implemented
    }

    async save(): Promise<any> {
        // Not Implemented
    }

    async restore(): Promise<void> {
        // Not Implemented
    }

    async delete(): Promise<void> {
        // Not Implemented
    }
}

if (
    document.createElement("perspective-viewer-plugin").constructor ===
    HTMLElement
) {
    window.customElements.define(
        "perspective-viewer-plugin",
        HTMLPerspectiveViewerPluginElement
    );
}
