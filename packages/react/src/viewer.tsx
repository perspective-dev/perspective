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

import * as React from "react";
import type * as psp from "@perspective-dev/client";
import type * as pspViewer from "@perspective-dev/viewer";
import { usePspListener } from "./utils";

function PerspectiveViewerImpl(props: PerspectiveViewerProps) {
    const [viewer, setViewer] =
        React.useState<pspViewer.HTMLPerspectiveViewerElement | null>(null);

    React.useEffect(() => {
        return () => {
            viewer?.delete();
        };
    }, [viewer]);

    React.useEffect(() => {
        if (!viewer) {
            return;
        }

        let cancelled = false;
        (async () => {
            if (!props.client) {
                await viewer.eject();
                return;
            }

            await viewer.load(props.client);
            if (cancelled || !props.config) {
                return;
            }

            if ("panels" in props.config) {
                await viewer.restoreWorkspace(props.config);
            } else {
                await viewer.restore(props.config);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [viewer, props.client, JSON.stringify(props.config)]);

    usePspListener(viewer, "perspective-click", props.onClick);
    usePspListener(viewer, "perspective-select", props.onSelect);
    usePspListener(
        viewer,
        "perspective-config-update",
        props.onConfigUpdate,
        (e) => e.detail.getConfig(),
    );

    return (
        <perspective-viewer
            ref={setViewer}
            id={props.id}
            className={props.className}
            hidden={props.hidden}
            slot={props.slot}
            style={props.style}
            tabIndex={props.tabIndex}
            title={props.title}
        />
    );
}

/**
 * Props for the {@link PerspectiveViewer} component.
 */
export interface PerspectiveViewerProps {
    /**
     * The viewer's data source, forwarded to the element's `load()` method
     * whenever it changes.
     *
     * - A `Table` (or `Promise<Table>`) displays that table directly.
     * - A `Client` (e.g. from `perspective.worker()` or a WebSocket
     *   connection to a remote server) connects the viewer to every table
     *   hosted by that client; the table each panel displays is chosen by
     *   {@link PerspectiveViewerProps.config} or interactively by the user.
     * - `undefined` calls `eject()`, returning the viewer to an unloaded
     *   state without unmounting it.
     *
     * The component does not take ownership of the `Table` — delete it
     * yourself when it is no longer needed, e.g.
     * `table.delete({ lazy: true })`.
     */
    client?: psp.Client | Promise<psp.Client> | psp.Table | Promise<psp.Table>;

    /**
     * Declarative viewer state — group-bys, splits, filters, sorts,
     * expressions, plugin and plugin config — applied with the element's
     * `restore()` method whenever it (or
     * {@link PerspectiveViewerProps.client}) changes. A config with a
     * `panels` property is treated as a multi-panel workspace layout and
     * applied with `restoreWorkspace()` instead.
     *
     * Configs are compared structurally, so passing a fresh-but-equal object
     * literal on each render does not re-apply. Combine with
     * {@link PerspectiveViewerProps.onConfigUpdate} to use the viewer as a
     * controlled component.
     */
    config?: pspViewer.ViewerConfigUpdate | pspViewer.WorkspaceConfigUpdate;

    /**
     * Called with the viewer's complete configuration whenever the user
     * reconfigures it through its UI (the element's
     * `"perspective-config-update"` Custom Event). Use this to persist the
     * user's view or reflect it back through
     * {@link PerspectiveViewerProps.config}.
     */
    onConfigUpdate?: (config: pspViewer.ViewerConfigUpdate) => void;

    /**
     * Called when the user clicks a datapoint (the element's
     * `"perspective-click"` Custom Event), with the clicked row's data and a
     * filter config which would select it.
     */
    onClick?: (data: pspViewer.PerspectiveClickEventDetail) => void;

    /**
     * Called when the user selects or deselects a datapoint or row (the
     * element's `"perspective-select"` Custom Event).
     */
    onSelect?: (data: pspViewer.PerspectiveSelectEventDetail) => void;

    // Applicable props from `React.HTMLAttributes`, which we cannot extend
    // directly because Perspective changes the signature of `onClick`.

    /** Forwarded to the element's `class` attribute. */
    className?: string | undefined;

    /** Forwarded to the element's `hidden` attribute. */
    hidden?: boolean | undefined;

    /** Forwarded to the element's `id` attribute. */
    id?: string | undefined;

    /** Forwarded to the element's `slot` attribute. */
    slot?: string | undefined;

    /** Forwarded to the element's inline `style`. */
    style?: React.CSSProperties | undefined;

    /** Forwarded to the element's `tabindex` attribute. */
    tabIndex?: number | undefined;

    /** Forwarded to the element's `title` attribute. */
    title?: string | undefined;
}

/**
 * A declarative React wrapper for the `<perspective-viewer>` Custom Element.
 *
 * `<PerspectiveViewer>` manages the element's imperative lifecycle: it
 * `load()`s the {@link PerspectiveViewerProps.client}, `restore()`s the
 * {@link PerspectiveViewerProps.config} whenever either changes, subscribes
 * the `on*` callback props to the element's Custom Events, and `delete()`s
 * the viewer (freeing its WebAssembly resources) on unmount. Tables and
 * clients are created outside the component and are yours to manage — a
 * `Table` passed as `client` survives unmount and can be shown again by a
 * later mount.
 *
 * The component is memoized, so re-rendering a parent with unchanged props
 * does not touch the viewer.
 *
 * @example
 * ```tsx
 * const WORKER = await perspective.worker();
 * const TABLE = WORKER.table(
 *     fetch("superstore.lz4.arrow").then((resp) => resp.arrayBuffer()),
 *     { name: "superstore" },
 * );
 *
 * const App: React.FC = () => {
 *     const [config, setConfig] = React.useState<pspViewer.ViewerConfigUpdate>({
 *         group_by: ["State"],
 *         plugin: "Y Bar",
 *     });
 *
 *     return (
 *         <PerspectiveViewer
 *             client={TABLE}
 *             config={config}
 *             onConfigUpdate={setConfig}
 *         />
 *     );
 * };
 * ```
 */
export const PerspectiveViewer: React.FC<PerspectiveViewerProps> = React.memo(
    PerspectiveViewerImpl,
);
