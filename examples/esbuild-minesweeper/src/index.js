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

import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";

import "@perspective-dev/viewer/dist/css/themes.css";
import "./index.css";

import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

import { MINES, Minesweeper, WIDTH } from "./game.js";
import { workspace } from "./workspace.js";

const STATUS = {
    ready: "Reveal any square to start",
    playing: "Playing",
    won: "Cleared!",
    lost: "Boom",
};

await perspective_viewer.init({
    server: fetch(SERVER_WASM),
    viewer: fetch(CLIENT_WASM),
});

const viewer = document.getElementById("viewer");
const mines_left = document.getElementById("mines-left");
const status = document.getElementById("status");

const worker = await perspective.worker();
const game = await Minesweeper.create(worker);

function square_index({ panel, location, hit }) {
    if (panel === "board" && hit?.kind === "cell") {
        return Number(hit.row_path[0]) * WIDTH + Number(hit.column_path[0]);
    } else if (panel === "flags" && location !== "datagrid-cell" && hit?.id) {
        return Number(hit.id[0]);
    }

    return undefined;
}

function command_schema(context) {
    const cell = context.location === "datagrid-cell";
    const menu = context.location === "context-menu";
    const disabled = !game.live;
    const index = square_index(context);
    const square = index === undefined ? undefined : game.square(index);
    const commands = [];
    if (square === "hidden") {
        commands.push({
            kind: "Command",
            key: "reveal",
            label: cell ? "" : "Reveal",
            title: "Reveal",
            disabled,
        });

        if (menu) {
            commands.push({
                kind: "Command",
                key: "flag",
                label: "Flag",
                disabled,
            });
        }
    } else if (square === "flagged") {
        commands.push({
            kind: "Command",
            key: "flag",
            label: cell ? "" : "Unflag",
            title: "Unflag",
            icon: "flag",
            disabled,
        });
    } else if (square === "mine" && cell) {
        commands.push({
            kind: "Command",
            key: "mine",
            label: "",
            title: "Mine",
            icon: "mine",
            disabled: true,
        });
    }

    if (menu) {
        commands.push({ kind: "Command", key: "new-game", label: "New game" });
    }

    return { commands };
}

async function render() {
    mines_left.textContent = String(MINES - game.flags);
    status.textContent = STATUS[game.state];
    document.body.dataset.state = game.state;
    await viewer.invalidate();
}

async function run(key, index) {
    if (key === "new-game") {
        await game.new_game();
    } else if (key === "reveal" && index !== undefined) {
        await game.reveal(index);
    } else if (key === "flag" && index !== undefined) {
        await game.toggle_flag(index);
    }

    await render();
}

await viewer.load(worker);
await viewer.setCommandSchema(command_schema, {
    scopes: ["context-menu", "datagrid-cell", "datagrid-row"],
});

await viewer.restoreWorkspace(workspace());
await render();

viewer.addEventListener("perspective-command", (event) => {
    const { key, context } = event.detail;
    run(key, square_index(context));
});

document
    .getElementById("new-game")
    .addEventListener("click", () => run("new-game"));
