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

import { PerspectiveViewer } from "@perspective-dev/react";

import perspective_viewer from "@perspective-dev/viewer";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";

import * as perspective from "@perspective-dev/client";

import "@perspective-dev/viewer/dist/css/themes.css";
import "./index.css";

// @ts-ignore
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm?url";

// @ts-ignore
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url";

await Promise.all([
    perspective.init_server(fetch(SERVER_WASM)),
    perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);

const CLIENT = await perspective.worker();

/// The merged `<perspective-viewer>` whole-element config: a `regular-layout`
/// tree + a per-panel `ViewerConfig` map. (Formerly
/// `@perspective-dev/workspace`'s `PerspectiveWorkspaceConfig`.)
interface MultiPanelConfig {
    layout?: Record<string, unknown>;
    panels: Record<string, Record<string, unknown>>;
}

/// Append a panel, re-deriving an even horizontal split of one stack per
/// panel. (Formerly `Workspace.addViewer`.)
function addPanel(
    config: MultiPanelConfig,
    panel: Record<string, unknown>,
    id: string,
): MultiPanelConfig {
    const panels = { ...config.panels, [id]: panel };
    const ids = Object.keys(panels);
    return {
        layout: {
            type: "split-layout",
            orientation: "horizontal",
            sizes: ids.map(() => 1 / ids.length),
            children: ids.map((k) => ({
                type: "tab-layout",
                tabs: [k],
                selected: 0,
            })),
        },
        panels,
    };
}

interface WorkspaceState {
    config: MultiPanelConfig;
    mounted: boolean;
}

interface WorkspaceAppProps {
    config: MultiPanelConfig;
    onSpecial?: () => void;
}

const WorkspaceApp: React.FC<WorkspaceAppProps> = (props) => {
    const [state, setState] = React.useState<WorkspaceState>({
        config: props.config,
        mounted: true,
    });

    const onClickAddViewer = () => {
        const name = window.crypto.randomUUID();
        const data = `a,b,c\n${Math.random()},${Math.random()},${Math.random()}`;
        CLIENT.table(data, { name });
        const config = addPanel(
            state.config,
            {
                table: name,
                title: name,
            },
            name,
        );

        setState({
            ...state,
            config,
        });
    };

    const onClickToggleMount = () =>
        setState((old) => ({ ...old, mounted: !state.mounted }));

    React.useEffect(() => {
        setState((s) => ({
            ...s,
            config: props.config,
        }));
    }, [props.config]);

    return (
        <div className="workspace-container">
            <div className="workspace-toolbar">
                <button className="toggle-mount" onClick={onClickToggleMount}>
                    Toggle Mount
                </button>
                <button className="add-viewer" onClick={onClickAddViewer}>
                    Add Viewer
                </button>
                {props.onSpecial && (
                    <button className="special" onClick={props.onSpecial}>
                        Special Third Button
                    </button>
                )}
            </div>
            {state.mounted && (
                <PerspectiveViewer
                    client={CLIENT}
                    config={state.config as unknown as ViewerConfigUpdate}
                />
            )}
        </div>
    );
};

/// Renders the app with a default empty workspace (a multi-panel viewer always
/// has at least one — empty — seed panel).
export const EmptyWorkspace: React.FC = () => {
    return <WorkspaceApp config={{ panels: {} }} />;
};

export const SingleView: React.FC<{ name: string }> = ({ name }) => {
    const _table = CLIENT.table("a,b,c\n1,2,3", { name });
    const config: MultiPanelConfig = {
        layout: {
            type: "tab-layout",
            tabs: [name],
            selected: 0,
        },
        panels: {
            [name]: {
                table: name,
                columns: ["a", "b", "c"],
                title: name,
            },
        },
    };

    return <WorkspaceApp config={config} />;
};
