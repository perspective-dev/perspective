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

import type * as psp from "@perspective-dev/client";
import type * as psp_viewer from "@perspective-dev/viewer";
import type * as pspWorkspace from "@perspective-dev/workspace";
import { PerspectiveWorkspaceConfig } from "@perspective-dev/workspace";
import * as utils from "./utils";
import * as React from "react";

export interface NewViewEventDetail {
    config: psp_viewer.ViewerConfigUpdate;
    widget: pspWorkspace.PerspectiveViewerWidget;
}

export interface ToggleGloalFilterEventDetail {
    widget: pspWorkspace.PerspectiveViewerWidget;
    isGlobalFilter: boolean;
}

export interface PerspectiveWorkspaceProps
    extends React.HTMLAttributes<HTMLElement> {
    client: psp.Client | Promise<psp.Client>;
    layout: PerspectiveWorkspaceConfig;
    onLayoutUpdate?: (layout: PerspectiveWorkspaceConfig) => void;
    onNewView?: (detail: NewViewEventDetail) => void;
    onToggleGlobalFilter?: (detail: ToggleGloalFilterEventDetail) => void;
}

const PerspectiveWorkspaceImpl = React.forwardRef<
    pspWorkspace.HTMLPerspectiveWorkspaceElement | undefined,
    PerspectiveWorkspaceProps
>(
    (
        {
            client,
            layout,
            onLayoutUpdate,
            onNewView,
            onToggleGlobalFilter,
            ...htmlAttributes
        },
        ref,
    ) => {
        const [workspace, setWorkspace] =
            React.useState<pspWorkspace.HTMLPerspectiveWorkspaceElement>();

        React.useImperativeHandle(ref, () => workspace, [workspace]);
        React.useEffect(() => {
            if (workspace && layout) {
                workspace.restore(layout);
            }
        }, [workspace, layout]);

        React.useEffect(() => {
            if (workspace && client) {
                workspace.load(client);
            }
        }, [workspace, client]);

        utils.usePspListener(workspace, "workspace-new-view", onNewView);
        utils.usePspListener(
            workspace,
            "workspace-layout-update",
            onLayoutUpdate
                ? ({ layout }: { layout: PerspectiveWorkspaceConfig }) =>
                      workspace?.save().then((x) => onLayoutUpdate(x))
                : undefined,
        );

        utils.usePspListener(
            workspace,
            "workspace-toggle-global-filter",
            onToggleGlobalFilter,
        );

        return (
            <perspective-workspace
                ref={(r) => setWorkspace(r ?? undefined)}
                {...htmlAttributes}
            ></perspective-workspace>
        );
    },
);

export const PerspectiveWorkspace = React.memo(PerspectiveWorkspaceImpl);
