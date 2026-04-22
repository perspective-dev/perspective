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

import { random_row } from "../data/random.js";
import { LAYOUTS } from "../data/layouts.js";
import { getPerspectiveTheme } from "./theme.js";

let TABLE: any;
let VIEWER: any;
let FREQ = 100;
let REALTIME_PAUSED = true;
let selectedId = "sparkgrid";

function update(table: any, viewer: any) {
    if (!REALTIME_PAUSED && FREQ <= 189.9) {
        const viewport_height = document.documentElement.clientHeight;
        if (viewport_height - window.scrollY > 0) {
            const arr = [];
            for (let i = 0; i < 10; i++) {
                arr.push(random_row());
            }
            table.update(arr);
        }
    }

    setTimeout(() => update(table, viewer), FREQ);
}

function select(viewer: any, id: string, extra: any = {}) {
    selectedId = id;
    viewer.restore({ ...LAYOUTS[id], ...extra });
}

async function startStreaming(perspective: any, viewer: any) {
    const data = [];
    for (let x = 0; x < 1000; x++) {
        data.push(random_row());
    }

    const worker = await perspective.worker();
    const tbl = worker.table(data, { index: "id" });
    setTimeout(async () => {
        const table = await tbl;
        update(table, viewer);
    });

    return tbl;
}

export async function initDemo(container: HTMLElement) {
    const [perspectiveMod] = await Promise.all([
        import("../data/worker.js"),
        import("@perspective-dev/viewer"),
        import("@perspective-dev/viewer-datagrid"),
        import("@perspective-dev/viewer-charts"),
    ]);

    const wrapper = document.createElement("div");
    wrapper.className = "demo";

    const viewer = document.createElement("perspective-viewer") as any;
    viewer.className = "nosuperstore";
    wrapper.appendChild(viewer);

    const visButtons = document.createElement("div");
    visButtons.className = "demo__vis-buttons";

    for (const key of Object.keys(LAYOUTS)) {
        const btn = document.createElement("div");
        btn.className = "demo__vis-button";
        if (key === selectedId) {
            btn.classList.add("demo__vis-button--active");
        }
        btn.id = key;
        btn.textContent = key;
        btn.addEventListener("mouseover", () => {
            visButtons
                .querySelectorAll(".demo__vis-button")
                .forEach((b) => b.classList.remove("demo__vis-button--active"));
            btn.classList.add("demo__vis-button--active");
            select(viewer, key);
        });
        visButtons.appendChild(btn);
    }

    wrapper.appendChild(visButtons);

    const timeControls = document.createElement("div");
    timeControls.className = "demo__time-controls";

    const freqLabel = document.createElement("span");
    freqLabel.textContent =
        FREQ >= 189 ? "paused" : `${((1000 / FREQ) * 10).toFixed(0)} msg/s`;
    timeControls.appendChild(freqLabel);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "demo__freq-slider";
    slider.setAttribute(
        "aria-label",
        "Demo update rate in messages per second",
    );
    slider.value = String(Math.round((FREQ - 190) * (5 / -9)));
    slider.addEventListener("input", () => {
        FREQ = (-9 / 5) * Number(slider.value) + 190;
        freqLabel.textContent =
            FREQ >= 189 ? "paused" : `${((1000 / FREQ) * 10).toFixed(0)} msg/s`;
    });
    timeControls.appendChild(slider);

    wrapper.appendChild(timeControls);
    container.appendChild(wrapper);

    REALTIME_PAUSED = false;

    if (TABLE === undefined) {
        TABLE = await startStreaming(perspectiveMod, viewer);
    }

    VIEWER = viewer;
    VIEWER.load(TABLE);
    select(viewer, selectedId, { theme: getPerspectiveTheme() });
}
