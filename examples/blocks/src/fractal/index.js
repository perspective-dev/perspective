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

function generate_mandelbrot(params) {
    return `
// color
var resolution := ${params.resolution};
var xmin := ${params.xmin};
var xmax := ${params.xmax};
var ymin := ${params.ymin};
var ymax := ${params.ymax};
var iterations := ${params.iterations};

var x := floor("index" / resolution);
var y := "index" % resolution;
var c := iterations;

var cx := xmin + ((xmax - xmin) * x) / (resolution - 1);
var cy := ymin + ((ymax - ymin) * y) / (resolution - 1);

var vx := 0;
var vy := 0;
var vxx := 0;
var vyy := 0;
var vxy := 0;

for (var ii := 0; ii < iterations; ii += 1) {
    if (vxx + vyy <= float(4)) {
        vxy := vx * vy;
        vxx := vx * vx;
        vyy := vy * vy;
        vx := vxx - vyy + cx;
        vy := vxy + vxy + cy;
        c -= 1;
    }
};

c`;
}

function generate_layout(params) {
    return {
        plugin: "Heatmap",
        table: "raw_data",
        settings: true,
        group_by: [`floor("index" / ${params.resolution})`],
        split_by: [`"index" % ${params.resolution}`],
        columns: ["color"],
        expressions: {
            color: generate_mandelbrot(params).trim(),
            [`floor("index" / ${params.resolution})`]: `floor("index" / ${params.resolution})`,
            [`"index" % ${params.resolution}`]: `"index" % ${params.resolution}`,
        },
    };
}

async function generate_data(table) {
    const run = document.getElementById("run");
    let json = new Array(Math.pow(resolution, 2));
    for (let x = 0; x < resolution; ++x) {
        for (let y = 0; y < resolution; ++y) {
            const index = x * resolution + y;
            json[index] = {
                index,
            };
        }
    }

    await table.replace(json);
    run.innerHTML = `Run`;
}

// GUI

function get_gui_params() {
    return ["xmin", "xmax", "ymin", "ymax", "resolution", "iterations"].reduce(
        (acc, x) => {
            acc[x] = window[x].valueAsNumber;
            return acc;
        },
        {},
    );
}

function make_range(x, y, name) {
    x.addEventListener("input", () => {
        window.run.disabled = false;
        x.value = Math.min(x.valueAsNumber, y.valueAsNumber - 0.1);
    });

    y.addEventListener("input", () => {
        window.run.disabled = false;
        y.value = Math.max(x.valueAsNumber + 0.1, y.valueAsNumber);
    });
}

const make_run_click_callback = (worker, state) => async () => {
    if (window.run.innerHTML.trim() !== "Run") {
        window.run.innerHTML = "Run";
        return;
    }

    window.run.disabled = true;
    if (!state.table) {
        state.table = await worker.table(
            {
                index: "integer",
            },
            {
                name: "raw_data",
            },
        );

        window.viewer.load(worker);
    }

    const run = document.getElementById("run");
    const params = get_gui_params();
    const new_size = Math.pow(params.resolution, 2);
    if (!state.size || state.size !== new_size) {
        let json = { index: new Array(new_size) };
        for (let x = 0; x < new_size; ++x) {
            json.index[x] = x;
        }

        state.table.replace(json);
    }

    state.size = new_size;
    run.innerHTML = `Run`;
    window.viewer.restore(generate_layout(params));
};

function set_runnable() {
    window.run.disabled = false;
}

const heatmap_plugin = await window.viewer.getPlugin("Heatmap");
heatmap_plugin.max_cells = 100000;
make_range(xmin, xmax, "X");
make_range(ymin, ymax, "Y");
window.resolution.addEventListener("input", set_runnable);
window.iterations.addEventListener("input", set_runnable);

run.addEventListener(
    "click",
    make_run_click_callback(await perspective.worker(), {}),
);

run.dispatchEvent(new Event("click"));
