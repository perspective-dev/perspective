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

import type { HTMLPerspectiveViewerPluginElement } from "./plugin";
import type { PerspectiveViewerElement } from "../../dist/wasm/perspective-viewer.js";
import type React from "react";
import type { ViewerConfigUpdate } from "./ts-rs/ViewerConfigUpdate.js";
import type {
    ViewWindow,
    ViewConfigUpdate,
    Filter,
} from "@perspective-dev/client";

export class PerspectiveSelectDetail {
    selected: boolean;
    row: Record<string, unknown>;
    column_names?: string[];
    removeConfigs: ViewConfigUpdate[];
    insertConfigs: ViewConfigUpdate[];

    constructor(
        selected: boolean,
        row: Record<string, unknown>,
        column_names: string[],
        removeConfigs: ViewConfigUpdate[],
        insertConfigs: ViewConfigUpdate[],
    ) {
        this.selected = selected;
        this.row = row;
        this.column_names = column_names;
        this.removeConfigs = removeConfigs;
        this.insertConfigs = insertConfigs;
    }

    get removeFilters(): Filter[] {
        return this.removeConfigs.flatMap((x) => x.filter ?? []);
    }

    get insertFilters(): Filter[] {
        return this.insertConfigs.flatMap((x) => x.filter ?? []);
    }
}
import type {
    ExportDropDownMenuElement,
    CopyDropDownMenuElement,
} from "../../dist/wasm/perspective-viewer.d.ts";

// DOM extensions

export type HTMLPerspectiveViewerElement = PerspectiveViewerElement &
    PerspectiveViewerElementExt &
    HTMLElement;

export interface HTMLPerspectiveViewerExportMenuElement
    extends HTMLElement,
        ExportDropDownMenuElement {}

export interface HTMLPerspectiveViewerCopyMenuElement
    extends HTMLElement,
        CopyDropDownMenuElement {}

export type PerspectiveClickEventDetail = {
    config: ViewerConfigUpdate;
    row: Record<string, any>;
    column_names: Array<string | Array<string>>;
};

export type PerspectiveSelectEventDetail = {
    view_window: ViewWindow;
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

    addEventListener(
        name: "perspective-click",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    addEventListener(
        name: "perspective-select",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    addEventListener(
        name: "perspective-toggle-settings",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    addEventListener(
        name: "perspective-toggle-settings-before",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    addEventListener(
        name: "perspective-config-update",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    addEventListener(
        name: "perspective-statusbar-pointerdown",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    addEventListener(
        name: "perspective-table-delete",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    addEventListener(
        name: "perspective-table-delete-before",
        cb: (e: CustomEvent) => void,
        options?: { signal: AbortSignal },
    ): void;

    removeEventListener(name: "perspective-click", cb: any): void;
    removeEventListener(name: "perspective-select", cb: any): void;
    removeEventListener(name: "perspective-toggle-settings", cb: any): void;
    removeEventListener(
        name: "perspective-toggle-settings-before",
        cb: any,
    ): void;
    removeEventListener(name: "perspective-config-update", cb: any): void;
    removeEventListener(
        name: "perspective-statusbar-pointerdown",
        cb: any,
    ): void;
    removeEventListener(name: "perspective-table-delete", cb: any): void;
    removeEventListener(name: "perspective-table-delete-before", cb: any): void;
}
