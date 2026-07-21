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
 * Props for the `<PerspectiveViewer>` component.
 */
export interface PerspectiveViewerProps {
    client?: psp.Client | Promise<psp.Client> | psp.Table | Promise<psp.Table>;
    config?: pspViewer.ViewerConfigUpdate | pspViewer.WorkspaceConfigUpdate;
    onConfigUpdate?: (config: pspViewer.ViewerConfigUpdate) => void;
    onClick?: (data: pspViewer.PerspectiveClickEventDetail) => void;
    onSelect?: (data: pspViewer.PerspectiveSelectEventDetail) => void;

    // Applicable props from `React.HTMLAttributes`, which we cannot extend
    // directly because Perspective changes the signature of `onClick`.
    className?: string | undefined;
    hidden?: boolean | undefined;
    id?: string | undefined;
    slot?: string | undefined;
    style?: React.CSSProperties | undefined;
    tabIndex?: number | undefined;
    title?: string | undefined;
}

/**
 * A React wrapper component for `<perspective-viewer>` Custom Element.
 */
export const PerspectiveViewer: React.FC<PerspectiveViewerProps> = React.memo(
    PerspectiveViewerImpl,
);
