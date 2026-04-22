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

import "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
import "/node_modules/@perspective-dev/workspace/dist/cdn/perspective-workspace.js";
import "/node_modules/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
import "/node_modules/@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js";
import "/node_modules/@perspective-dev/viewer-openlayers/dist/cdn/perspective-viewer-openlayers.js";

import perspective from "/node_modules/@perspective-dev/client/dist/cdn/perspective.js";

let DATA_URL = "nypdccrb.arrow";

let LAYOUTS = localStorage.getItem("layouts")
    ? JSON.parse(localStorage.getItem("layouts"))
    : undefined;

const worker = await perspective.worker();
const theme_style_node = document.createElement("style");
document.head.appendChild(theme_style_node);
let DARK_THEME;
let LIGHT_THEME;

function toggle_theme() {
    if (theme_style_node.dataset.theme === "Pro Light") {
        theme_style_node.textContent = DARK_THEME;
        document.body.classList.add("dark");
        window.theme.textContent = "Light Theme";
        for (const view of document.querySelectorAll("perspective-viewer")) {
            view.setAttribute("theme", "Pro Dark");
            view.restyleElement();
        }

        theme_style_node.dataset.theme = "Pro Dark";
    } else {
        theme_style_node.textContent = LIGHT_THEME;
        document.body.classList.remove("dark");
        window.theme.textContent = "Dark Theme";
        for (const view of document.querySelectorAll("perspective-viewer")) {
            view.setAttribute("theme", "Pro Light");
            view.restyleElement();
        }
        theme_style_node.dataset.theme = "Pro Light";
    }
}

async function fetch_progress(url) {
    window.message.textContent = "Downloading...";
    const response = await fetch(url);
    const ab = await new Response(await response.blob()).arrayBuffer();
    window.message.style.display = "none";
    return ab;
}

DARK_THEME = await fetch(
    "/node_modules/@perspective-dev/workspace/dist/css/pro-dark.css",
).then((x) => x.text());

LIGHT_THEME = await fetch(
    "/node_modules/@perspective-dev/workspace/dist/css/pro.css",
).then((x) => x.text());

document.body.innerHTML = `
        <style>
        </style>
        <div id='buttons'>
            <span id="message"></span>
            <select id="layouts"></select>
            <button id="save_as">Save As</button>
            <input id="name_input" style="display: none"></input>
            <button id="save" style="display: none">Save</button>
            <button id="cancel" style="display: none">Cancel</button>
            <button id="theme" style="float: right">Light Theme</button>
            <button id="copy" style="float: right">Debug to Clipboard</button>
            <button id="reset" style="float: right">Reset LocalStorage</button>
            <a href="https://github.com/texodus/nypd-ccrb">NYCLU/CCRB Data</a>
            <a href="https://github.com/perspective-dev/perspective">Built With Perspective</a>
        </div>
        <perspective-workspace id='workspace'></perspective-workspace>
    `.trim();

toggle_theme();

window.workspace.addEventListener(
    "workspace-new-view",
    ({ detail: { widget } }) => {
        widget.viewer.setAttribute("theme", theme_style_node.dataset.theme);
    },
);

window.workspace.addTable(
    "ccrb",
    (async () => worker.table(await fetch_progress(DATA_URL)))(),
    // worker.table(await fetch_progress(DATA_URL))
);

if (LAYOUTS == undefined) {
    LAYOUTS = await (await fetch("./layout.json")).json();
}

const layout_names = Object.keys(LAYOUTS);
let selected_layout = LAYOUTS[layout_names[0]];
await window.workspace.restore(selected_layout);

function set_layout_options() {
    const layout_names = Object.keys(LAYOUTS);
    window.layouts.innerHTML = "";
    for (const layout of layout_names) {
        window.layouts.innerHTML += `<option${
            layout === selected_layout ? " selected='true'" : ""
        }>${layout}</option>`;
    }
}

set_layout_options();

window.name_input.value = layout_names[0];
window.layouts.addEventListener("change", async () => {
    if (window.layouts.value.trim().length === 0) {
        return;
    }

    window.workspace.innerHTML = "";
    await window.workspace.restore(LAYOUTS[window.layouts.value]);
    window.name_input.value = window.layouts.value;
});

window.save_as.addEventListener("click", async () => {
    window.save_as.style.display = "none";
    window.save.style.display = "inline-block";
    window.cancel.style.display = "inline-block";
    window.name_input.style.display = "inline-block";
    window.copy.style.display = "none";
    window.layouts.style.display = "none";
});

function cancel() {
    window.save_as.style.display = "inline-block";
    window.save.style.display = "none";
    window.cancel.style.display = "none";
    window.name_input.style.display = "none";
    window.copy.style.display = "inline-block";
    window.layouts.style.display = "inline-block";
}

window.cancel.addEventListener("click", cancel);

window.reset.addEventListener("click", () => {
    localStorage.clear();
    window.reset.innerText = "Reset!";
    setTimeout(() => {
        window.reset.innerText = "Reset LocalStorage";
    }, 1000);
});

window.save.addEventListener("click", async () => {
    const token = await window.workspace.save();
    const new_name = window.name_input.value;
    LAYOUTS[new_name] = token;
    set_layout_options();
    window.layouts.value = new_name;
    window.save_as.innerText = "Saved!";
    setTimeout(() => {
        window.save_as.innerText = "Save As";
    }, 1000);
    localStorage.setItem("layouts", JSON.stringify(LAYOUTS));
    cancel();
});

window.copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(LAYOUTS));
    window.copy.innerText = "Copied!";
    setTimeout(() => {
        window.copy.innerText = "Debug to Clipboard";
    }, 1000);
});

window.theme.addEventListener("click", toggle_theme);
