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
import "/node_modules/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
import "/node_modules/@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js";

import perspective from "/node_modules/@perspective-dev/client/dist/cdn/perspective.js";

const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
const video = document.getElementById("video");
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const WORKER = await perspective.worker();

async function poll(table, tdata) {
    context.drawImage(video, 0, 0, WIDTH, HEIGHT);
    const data = context.getImageData(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < data.data.byteLength / 4; i++) {
        const r = data.data[i * 4];
        const g = data.data[i * 4 + 1];
        const b = data.data[i * 4 + 2];
        const color = 255 - (0.21 * r + 0.72 * g + 0.07 * b);
        tdata.color[i] = color;
    }

    await table.update(tdata);
    setTimeout(() => poll(table, tdata), 50);
}

async function init_tables() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
        });

        video.srcObject = stream;
        video.play();
    }

    const tdata = { index: [], color: [] };
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
        tdata.index[i] = i;
        tdata.color[i] = 0;
    }

    const table = await WORKER.table(tdata, { index: "index" });
    poll(table, tdata);
    return table;
}

async function init_layouts() {
    const req = await fetch("layouts.json");
    return await req.json();
}

const INIT_TASK = [init_tables(), init_layouts()];

const [table, layouts] = await Promise.all(INIT_TASK);
const settings = !/(iPad|iPhone|iPod)/g.test(navigator.userAgent);
const select = document.querySelector("select");
const viewer = document.querySelector("perspective-viewer");
viewer.load(table);
await viewer.restore({ settings, ...layouts[0] });
const regular_table = document
    .querySelector("perspective-viewer-datagrid")
    .shadowRoot.querySelector("regular-table");

regular_table.scrollTop =
    regular_table.scrollHeight / 2 - regular_table.clientHeight / 2;

regular_table.scrollLeft =
    regular_table.scrollWidth / 2 - regular_table.clientWidth / 2;

for (const layout of layouts) {
    const option = document.createElement("option");
    option.value = layout.title;
    option.textContent = layout.title;
    select.appendChild(option);
}

select.addEventListener("change", async (event) => {
    const layout = layouts.find((x) => x.title === event.target.value);
    await viewer.restore(layout);
});
