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

import "zx/globals";

let SERVER;

/**
 * Create a Python `tornado` server, deleting and re-creating the virtual env
 * if necessary.
 */
export async function start(path) {
    const ac = new AbortController();
    let proc;
    await $`rm -rf benchmark_venv`;

    if (path !== "master") {
        await $`python3 -m venv benchmark_venv`;
        const $$ = $({
            ac,
            prefix: "source benchmark_venv/bin/activate && ",
            cwd: process.cwd(),
        });

        await $$`pip3 uninstall "perspective-python" -y`;
        await $$`pip3 install tornado "perspective-python==${path}"`;
        proc = $$`python3 src/python/server.py`;
    } else {
        proc = $`python3 src/python/server.py`;
    }

    // Await server start
    let [resolve, sentinel] = (() => {
        let resolve;
        const sentinel = new Promise((x) => {
            resolve = x;
        });

        return [resolve, sentinel];
    })();

    async function await_log(pipe) {
        for await (const _ of proc[pipe]) {
            resolve?.();
            resolve = undefined;
        }
    }

    await_log("stdout");
    await_log("stderr");

    await sentinel;
    SERVER = { ac, proc };
    return SERVER;
}

/**
 * Stop a Python server.
 * @param {*} server
 */
export async function stop(server) {
    server.proc.kill();
    try {
        await server.proc;
    } catch (e) {}

    await server.ac.abort();
    SERVER = undefined;
}

process.on("SIGTERM", async () => {
    try {
        SERVER?.proc?.kill();
        await SERVER?.proc;
        await SERVER?.ac?.abort();
    } catch (e) {}
});
