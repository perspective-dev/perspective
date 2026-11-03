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

import type { HTMLPerspectiveViewerPluginElement } from "./plugin.ts";
import type { PerspectiveViewerElement } from "../../dist/wasm/perspective-viewer.js";
import type React from "react";
import type { ViewerConfigUpdate } from "../../dist/ts-rs/ViewerConfigUpdate.d.ts";
import type { ColumnType, ViewWindow, Filter } from "@perspective-dev/client";
import type { ConfigDefaultsOptions } from "../../dist/ts-rs/ConfigDefaultsOptions.d.ts";
import type { ColumnConfigDefaultsOptions } from "../../dist/ts-rs/ColumnConfigDefaultsOptions.d.ts";
import type { PerspectiveSelectDetail } from "./select-detail.ts";

export { PerspectiveSelectDetail } from "./select-detail.ts";

// DOM extensions

export type HTMLPerspectiveViewerElement = PerspectiveViewerElement &
    PerspectiveViewerElementExt &
    HTMLElement;

export type PerspectiveClickEventDetail = {
    config: ViewerConfigUpdate;
    row: Record<string, any>;
    column_names: Array<string | Array<string>>;
    panel?: string;
};

export type PerspectiveSelectEventDetail = {
    view_window: ViewWindow;
};

export type PerspectiveLayoutUpdateEventDetail = {
    panels: string[];
};

export type PerspectiveActivePanelUpdateEventDetail = {
    panel: string | null;
};

export type PerspectiveColumnStyleChangeEventDetail = Record<
    string,
    Record<string, unknown>
> & {
    panel?: string;
};

export type PerspectiveToggleColumnSettingsEventDetail = {
    open: boolean;
    column_name: string | null;
};

export type PerspectiveConfigUpdateEventDetail = {
    /**
     * Serialize the panel config that triggered this event, ON DEMAND. The
     * serialization is deferred so a config change with no interested listener
     * costs nothing; call `getConfig()` only if you need the config.
     *
     * Valid ONLY synchronously within the event callback — the backing closure
     * is released immediately after dispatch, so stashing `getConfig` and
     * calling it later throws. To read config outside the callback, use
     * `viewer.save()` / `viewer.saveWorkspace()`.
     */
    getConfig(): ViewerConfigUpdate;
};

// JSX / React extensions

type ReactPerspectiveViewerAttributes<T> = React.HTMLAttributes<T>;

type JsxPerspectiveViewerElement = {
    class?: string;
} & React.DetailedHTMLProps<
    ReactPerspectiveViewerAttributes<HTMLPerspectiveViewerElement>,
    HTMLPerspectiveViewerElement
>;

// React <19

declare global {
    namespace JSX {
        interface IntrinsicElements {
            "perspective-viewer": JsxPerspectiveViewerElement;
        }
    }
}

// React >=19

// Why are these `ts-ignore`? React 19 makes choice of JSX runtime in `tsconfig`
// the determination of which runtime this needs to be, but this is chosen
// by the user ... so I'm not sure what the React authors want from me here
// exactly. Divination?

// @ts-ignore
declare module "react/jsx-runtime" {
    namespace JSX {
        interface IntrinsicElements {
            "perspective-viewer": JsxPerspectiveViewerElement;
        }
    }
}

// @ts-ignore
declare module "react/jsx-dev-runtime" {
    namespace JSX {
        interface IntrinsicElements {
            "perspective-viewer": JsxPerspectiveViewerElement;
        }
    }
}

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "perspective-viewer": JsxPerspectiveViewerElement;
        }
    }
}

// Custom Elements extensions

declare global {
    interface Document {
        createElement(
            tagName: "perspective-viewer",
            options?: ElementCreationOptions,
        ): HTMLPerspectiveViewerElement;
        createElement(
            tagName: "perspective-viewer-plugin",
            options?: ElementCreationOptions,
        ): HTMLPerspectiveViewerPluginElement;
        querySelector<E extends Element = Element>(selectors: string): E | null;
        querySelector(
            selectors: "perspective-viewer",
        ): HTMLPerspectiveViewerElement | null;
    }

    interface CustomElementRegistry {
        get(
            tagName: "perspective-viewer",
        ): typeof PerspectiveViewerElement &
            PerspectiveViewerElementExt &
            typeof HTMLElement;
        get(
            tagName: "perspective-viewer-plugin",
        ): typeof HTMLPerspectiveViewerPluginElement;
    }
}

export interface PerspectiveViewerElementExt {
    /**
     * Register a new plugin via its custom element name.  This method is called
     * automatically as a side effect of importing a plugin module, so this
     * method should only typically be called by plugin authors.
     *
     * @category Plugin
     * @param name The `name` of the custom element to register, as supplied
     * to the `customElements.define(name)` method.
     * @example
     * ```javascript
     * customElements.get("perspective-viewer").registerPlugin("my-plugin");
     * ```
     */
    registerPlugin(name: string): Promise<void>;

    /**
     * Merge `defaults` into the `plugin_config` defaults every
     * `<perspective-viewer>` on the page applies.
     *
     * @category Plugin
     * @param defaults Values keyed like `plugin_config`, where `null` removes
     * a default, or `null` to clear the slot.
     * @param options `plugin` limits the defaults to one plugin.
     * @example
     * ```javascript
     * customElements
     *     .get("perspective-viewer")
     *     .setPluginConfigDefaults({ group_pad: 10 });
     * ```
     */
    setPluginConfigDefaults(
        defaults: Record<string, unknown> | null,
        options?: ConfigDefaultsOptions,
    ): void;

    /**
     * Merge `defaults` into the `columns_config` defaults every
     * `<perspective-viewer>` on the page applies.
     *
     * @category Plugin
     * @param defaults Values keyed like one `columns_config` entry, where
     * `null` removes a default, or `null` to clear the slot.
     * @param options `plugin` limits the defaults to one plugin, `type` to
     * columns of one view type.
     * @example
     * ```javascript
     * customElements
     *     .get("perspective-viewer")
     *     .setColumnConfigDefaults(
     *         { date_format: { timeZone: "UTC" } },
     *         { type: "datetime" },
     *     );
     * ```
     */
    setColumnConfigDefaults(
        defaults: Record<string, unknown> | null,
        options?: ColumnConfigDefaultsOptions,
    ): void;

    /**
     * The `plugin_config` defaults set by `setPluginConfigDefaults()`, one
     * entry per slot.
     *
     * @category Plugin
     */
    getPluginConfigDefaults(): Array<{
        plugin?: string;
        defaults: Record<string, unknown>;
    }>;

    /**
     * The `columns_config` defaults set by `setColumnConfigDefaults()`, one
     * entry per slot.
     *
     * @category Plugin
     */
    getColumnConfigDefaults(): Array<{
        plugin?: string;
        type?: ColumnType;
        defaults: Record<string, unknown>;
    }>;

    get_wasm_module(): WebAssembly.Module;

    get_worker_url(): URL;

    /** Fires when a plugin's grid or chart is clicked, with the clicked row and a `config` whose filters reproduce it. */
    addEventListener(
        name: "perspective-click",
        cb: (e: CustomEvent<PerspectiveClickEventDetail>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when a plugin's selection changes, with the configs whose filters to insert and remove. */
    addEventListener(
        name: "perspective-select",
        cb: (e: CustomEvent<PerspectiveSelectDetail>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires on a master panel's selection, before it is applied to the global filter set. */
    addEventListener(
        name: "perspective-global-filter",
        cb: (e: CustomEvent<PerspectiveSelectDetail>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires whenever the global filter set changes, with the new `Filter[]`. */
    addEventListener(
        name: "perspective-global-filter-update",
        cb: (e: CustomEvent<Filter[]>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires after the settings sidebar opens or closes, with the new open state. */
    addEventListener(
        name: "perspective-toggle-settings",
        cb: (e: CustomEvent<boolean>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires before the settings sidebar opens or closes, with the pending open state. */
    addEventListener(
        name: "perspective-toggle-settings-before",
        cb: (e: CustomEvent<boolean>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when the column settings sidebar opens or closes, with the column it shows. */
    addEventListener(
        name: "perspective-toggle-column-settings",
        cb: (
            e: CustomEvent<PerspectiveToggleColumnSettingsEventDetail>,
        ) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires after a panel's view config changes, with a deferred `getConfig()` accessor valid only during dispatch. */
    addEventListener(
        name: "perspective-config-update",
        cb: (e: CustomEvent<PerspectiveConfigUpdateEventDetail>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when a panel's active plugin changes, with the new plugin element as its detail. */
    addEventListener(
        name: "perspective-plugin-update",
        cb: (e: CustomEvent<HTMLPerspectiveViewerPluginElement>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when a panel's per-column style config changes, keyed by column name. */
    addEventListener(
        name: "perspective-column-style-change",
        cb: (e: CustomEvent<PerspectiveColumnStyleChangeEventDetail>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when a panel is added to or removed from the layout, with the placed panel ids in order. */
    addEventListener(
        name: "perspective-layout-update",
        cb: (e: CustomEvent<PerspectiveLayoutUpdateEventDetail>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when the active panel changes, with its id or `null` at zero panels. */
    addEventListener(
        name: "perspective-active-panel-update",
        cb: (e: CustomEvent<PerspectiveActivePanelUpdateEventDetail>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires with the original `pointerdown` as its detail when the status bar is pressed. */
    addEventListener(
        name: "perspective-statusbar-pointerdown",
        cb: (e: CustomEvent<PointerEvent>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when a panel's status indicator is clicked. */
    addEventListener(
        name: "perspective-status-indicator-click",
        cb: (e: CustomEvent<undefined>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires when the agent invokes a tool, with a JSON string of `{name, args}` as its detail. */
    addEventListener(
        name: "perspective-agent-tool",
        cb: (e: CustomEvent<string>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires after a panel's `Table` is deleted and the panel unloaded. */
    addEventListener(
        name: "perspective-table-delete",
        cb: (e: CustomEvent<undefined>) => void,
        options?: { signal: AbortSignal },
    ): void;

    /** Fires before a panel's `Table` is deleted, while its `View` is still live. */
    addEventListener(
        name: "perspective-table-delete-before",
        cb: (e: CustomEvent<undefined>) => void,
        options?: { signal: AbortSignal },
    ): void;

    removeEventListener(name: "perspective-click", cb: any): void;
    removeEventListener(name: "perspective-select", cb: any): void;
    removeEventListener(name: "perspective-global-filter", cb: any): void;
    removeEventListener(
        name: "perspective-global-filter-update",
        cb: any,
    ): void;
    removeEventListener(name: "perspective-toggle-settings", cb: any): void;
    removeEventListener(
        name: "perspective-toggle-settings-before",
        cb: any,
    ): void;
    removeEventListener(
        name: "perspective-toggle-column-settings",
        cb: any,
    ): void;
    removeEventListener(name: "perspective-config-update", cb: any): void;
    removeEventListener(name: "perspective-plugin-update", cb: any): void;
    removeEventListener(name: "perspective-column-style-change", cb: any): void;
    removeEventListener(name: "perspective-layout-update", cb: any): void;
    removeEventListener(name: "perspective-active-panel-update", cb: any): void;
    removeEventListener(
        name: "perspective-statusbar-pointerdown",
        cb: any,
    ): void;
    removeEventListener(
        name: "perspective-status-indicator-click",
        cb: any,
    ): void;
    removeEventListener(name: "perspective-agent-tool", cb: any): void;
    removeEventListener(name: "perspective-table-delete", cb: any): void;
    removeEventListener(name: "perspective-table-delete-before", cb: any): void;
}
