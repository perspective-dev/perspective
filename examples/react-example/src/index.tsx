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

// # [Perspective bootstrapping](https://perspective-dev.github.io/guide/how_to/javascript/importing.html)

// Here we're initializing the WASM interpreter that powers the perspective API
// and viewer, as covered in the [user guide section on bundling](https://perspective-dev.github.io/guide/how_to/javascript/importing.html).
// This example is written assuming that the bundler is configured
// to treat these files as a "file" and returns a path as the default export.
// Use ./build.js as an example. The type stubs are in ./globals.d.ts

import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import perspective_workspace from "@perspective-dev/workspace";
import "@perspective-dev/workspace";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";

import * as React from "react";
import { createRoot } from "react-dom/client";
import {
    PerspectiveViewer,
    PerspectiveWorkspace,
} from "@perspective-dev/react";

import "@perspective-dev/viewer/dist/css/themes.css";
import "@perspective-dev/workspace/dist/css/pro.css";
import "./index.css";

import type * as psp from "@perspective-dev/client";
import type * as pspViewer from "@perspective-dev/viewer";

import SUPERSTORE_ARROW from "superstore-arrow/superstore.lz4.arrow";

import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

await Promise.all([
    perspective.init_server(fetch(SERVER_WASM)),
    perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);

// # Data Source

// Data source creates a static Web Worker instance of Perspective engine, and a
// table creation function which both downloads data and loads it into the
// engine.

const WORKER = await perspective.worker();

async function createNewSuperstoreTable(): Promise<psp.Table> {
    console.warn("Creating new table!");
    const req = fetch(SUPERSTORE_ARROW);
    const resp = await req;
    const buffer = await resp.arrayBuffer();
    return await WORKER.table(buffer);
}

const CONFIG: pspViewer.ViewerConfigUpdate = {
    group_by: ["State"],
};

// # React application

// The React application itself

interface ToolbarState {
    mounted: boolean;
    table?: Promise<psp.Table>;
    config: pspViewer.ViewerConfigUpdate;
    layout: perspective_workspace.PerspectiveWorkspaceConfig;
}

const App: React.FC = () => {
    const [state, setState] = React.useState<ToolbarState>(() => ({
        mounted: true,
        table: createNewSuperstoreTable(),
        layout: {
            detail: { main: null },
            sizes: [],
            viewers: {},
        },
        config: { ...CONFIG },
    }));

    React.useEffect(() => {
        return () => {
            state.table?.then((table) => table?.delete({ lazy: true }));
        };
    }, []);

    const onClickOverwrite = () => {
        state.table?.then((table) => table?.delete({ lazy: true }));
        const table = createNewSuperstoreTable();
        setState({ ...state, table });
    };

    const onClickDelete = () => {
        state.table?.then((table) => table?.delete({ lazy: true }));
        setState({ ...state, table: undefined });
    };

    const onClickToggleMount = () =>
        setState((old) => ({ ...old, mounted: !state.mounted }));

    const onConfigUpdate = (config: pspViewer.ViewerConfigUpdate) => {
        console.log("Config Update Event", config);
        delete config.table;
        setState({ ...state, config });
    };

    const onLayoutUpdate = (
        layout: perspective_workspace.PerspectiveWorkspaceConfig,
    ) => {
        console.log("Layout Update Event", layout);

        // delete config.table;
        setState({ ...state, layout });
    };

    const onClick = (detail: pspViewer.PerspectiveClickEventDetail) => {
        console.log("Click Event,", detail);
    };

    const onSelect = (detail: pspViewer.PerspectiveSelectEventDetail) => {
        console.log("Select Event", detail);
    };

    return (
        <div className="container">
            <div className="toolbar">
                <button onClick={onClickToggleMount}>Toggle Mount</button>
                <button onClick={onClickOverwrite}>Overwrite Superstore</button>
                <button onClick={onClickDelete}>Delete Table</button>
            </div>
            {state.mounted && (
                <>
                    <PerspectiveViewer client={state.table} />
                    <PerspectiveViewer
                        className="my-perspective-viewer"
                        client={state.table}
                        config={state.config}
                        onClick={onClick}
                        onConfigUpdate={onConfigUpdate}
                        onSelect={onSelect}
                    />
                    <PerspectiveWorkspace
                        client={WORKER}
                        layout={state.layout}
                        onLayoutUpdate={onLayoutUpdate}
                    />
                </>
            )}
        </div>
    );
};

createRoot(document.getElementById("root")!).render(<App />);
