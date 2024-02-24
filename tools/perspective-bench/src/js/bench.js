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

const fs = require("fs");
const cp = require("child_process");
const path = require("path");

/**
 * Convert a list to arrow and write it to disk. `@finos/perspective` is
 * imported in this scope to prevent interpreter-wide side effects of the
 * library from impacting forked processes, based on an observation that some
 * runs inline had anomalies across many observations that couldn't be explained
 * by contemporary system load.
 * @param {Array} obs_records an array of records to persist
 */
async function persist_to_arrow(obs_records) {
    const psp = await import("@finos/perspective");
    const table = await psp.table({
        version: "string",
        time: "float",
        version_idx: "integer",
        benchmark: "string",
    });

    const view = await table.view();
    await table.update(obs_records);
    const arrow = await view.to_arrow();
    if (!fs.existsSync(path.join(__dirname, "../../dist/"))) {
        fs.mkdirSync(path.join(__dirname, "../../dist/"));
    }

    fs.writeFileSync(
        path.join(__dirname, "../../dist/benchmark-js.arrow"),
        Buffer.from(arrow),
        "binary"
    );

    fs.writeFileSync(
        path.join(__dirname, "../../dist/benchmark.html"),
        fs.readFileSync(path.join(__dirname, "../html/benchmark.html")),
        "binary"
    );
}

/**
 * Run the benchmarks in a forked process and colelct the observations.
 * @param {{version: string, i: number}} version the versions spec to send to
 * the child process.
 * @returns an array of observation records for this version.
 */
async function benchmark_version(version) {
    let obs_records = [];
    const worker = cp.fork("./src/js/worker.js");
    let cont;
    worker.on("message", (details) => {
        if (details.finished) {
            cont();
        } else {
            obs_records = obs_records.concat(details.obs_records);
        }
    });

    worker.send(version);
    await new Promise((r) => {
        cont = r;
    });

    worker.kill();
    return obs_records;
}

async function main() {
    const pkg_path = path.join(__dirname, "../../package.json");
    const pkg_json = fs.readFileSync(pkg_path);
    const pkg_deps = Object.keys(JSON.parse(pkg_json).dependencies);
    const versions = ["@finos/perspective", ...pkg_deps];

    let obs_records = [];
    for (let i = 0; i < versions.length; i++) {
        const batch = await benchmark_version({ path: versions[i], i });
        obs_records = obs_records.concat(batch);
    }

    await persist_to_arrow(obs_records);
}

main();
