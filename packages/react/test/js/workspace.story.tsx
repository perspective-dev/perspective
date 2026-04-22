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
import "@perspective-dev/workspace";

import {
    HTMLPerspectiveWorkspaceElement,
    PerspectiveWorkspaceConfig,
} from "@perspective-dev/workspace";

import * as React from "react";

import { PerspectiveWorkspace } from "@perspective-dev/react";

import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
import "@perspective-dev/workspace";
import * as Workspace from "@perspective-dev/workspace";

import * as perspective from "@perspective-dev/client";

import "@perspective-dev/viewer/dist/css/themes.css";
import "@perspective-dev/workspace/dist/css/pro.css";
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

interface WorkspaceState {
    layout: PerspectiveWorkspaceConfig;
    mounted: boolean;
}

interface WorkspaceAppProps {
    layout: PerspectiveWorkspaceConfig;
    onSpecial?: () => void;
}

const WorkspaceApp: React.FC<WorkspaceAppProps> = (props) => {
    const [state, setState] = React.useState<WorkspaceState>({
        layout: props.layout,
        mounted: true,
    });

    const onClickAddViewer = () => {
        const name = window.crypto.randomUUID();
        const data = `a,b,c\n${Math.random()},${Math.random()},${Math.random()}`;
        CLIENT.table(data, { name });
        const nextId = Workspace.genId(state.layout);
        const layout = Workspace.addViewer(
            state.layout,
            {
                table: name,
                title: name,
            },
            nextId,
        );

        setState({
            ...state,
            layout,
        });
    };

    const onClickToggleMount = () =>
        setState((old) => ({ ...old, mounted: !state.mounted }));

    const onLayoutUpdate = (layout: PerspectiveWorkspaceConfig) => {
        setState({ ...state, layout });
    };

    React.useEffect(() => {
        setState((s) => ({
            ...s,
            layout: props.layout,
        }));
    }, [props.layout]);

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
                <PerspectiveWorkspace
                    client={CLIENT}
                    layout={state.layout}
                    onLayoutUpdate={onLayoutUpdate}
                />
            )}
        </div>
    );
};

/// Renders the app with a default empty workspace
export const EmptyWorkspace: React.FC = () => {
    return (
        <WorkspaceApp
            layout={{ sizes: [1], viewers: {}, detail: { main: null } }}
        />
    );
};

export const SingleView: React.FC<{ name: string }> = ({ name }) => {
    const _table = CLIENT.table("a,b,c\n1,2,3", { name });
    const layout: PerspectiveWorkspaceConfig = {
        sizes: [1],
        detail: {
            main: {
                type: "tab-area",
                currentIndex: 0,
                widgets: [name],
            },
        },
        viewers: {
            [name]: {
                table: name,
                columns: ["a", "b", "c"],
                title: name,
            },
        },
    };

    return <WorkspaceApp layout={layout} />;
};
