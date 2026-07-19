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

import * as path from "path";
import * as fs from "fs";
import { get } from "http";
import { spawn } from "child_process";
import "zx/globals";

const PACKAGE_ROOT = path.join(__dirname, "..", "..", "..");

const SERVER_LOG_PATH = path.join(PACKAGE_ROOT, "dist", "jupyter-server.log");

/**
 * Kill the Jupyterlab process created by the tests.
 */
export const kill_jlab = () => {
    console.log("\n-- Cleaning up Jupyterlab process");
    $`ps aux | grep -i '[j]upyter-lab --no-browser' | awk '{print $2}' | xargs kill -9 && echo "[perspective-jupyterlab] JupyterLab process terminated"`;
};

/**
 * Block until the Jupyterlab server is ready.
 */
const wait_for_jlab = async function () {
    let num_errors = 0;
    let loaded = false;

    while (!loaded) {
        get(
            `http://127.0.0.1:${process.env.__JUPYTERLAB_PORT__}/lab?`,
            (res) => {
                if (res.statusCode !== 200) {
                    throw new Error(`${res.statusCode} not 200!`);
                }

                console.log(
                    `Jupyterlab server has started on ${process.env.__JUPYTERLAB_PORT__}`,
                );
                loaded = true;
            },
        ).on("error", (err) => {
            if (num_errors > 50) {
                kill_jlab();
                throw new Error(`Could not launch Jupyterlab: ${err}`);
            }

            num_errors++;
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
    }
};

export function start_jlab() {
    /*
     * Spawn the Jupyterlab server.
     */
    try {
        // Does not alter the global env, only the env for this process
        process.env.JUPYTER_CONFIG_DIR = path.join(
            PACKAGE_ROOT,
            "test",
            "config",
            "jupyter",
        );
        process.env.JUPYTERLAB_SETTINGS_DIR = path.join(
            PACKAGE_ROOT,
            "test",
            "config",
            "jupyter",
            "user_settings",
        );

        // Start jupyterlab with a root to dist/esm where the notebooks will be.
        process.chdir(path.join(PACKAGE_ROOT, "dist", "esm"));

        console.log("Spawning Jupyterlab process");

        fs.mkdirSync(path.dirname(SERVER_LOG_PATH), { recursive: true });
        const log_stream = fs.createWriteStream(SERVER_LOG_PATH, {
            flags: "w",
        });

        // Jupyterlab is spawned with the default $PYTHONPATH of the shell it
        // is running in. For local testing during devlopment you may need to
        // run it with the $PYTHONPATH set to ./python/perspective
        const proc = spawn(
            "jupyter",
            [
                "lab",
                "--no-browser",
                "--log-level=INFO",
                `--port=${process.env.__JUPYTERLAB_PORT__}`,
                `--config=${process.env.JUPYTER_CONFIG_DIR}/jupyter_notebook_config.json`,
            ],
            {
                env: {
                    ...process.env,

                    // https://github.com/microsoft/playwright/issues/24516
                    NODE_OPTIONS: undefined,
                },
                // stdio: "inherit",
            },
        );

        proc.stdout?.pipe(log_stream);
        proc.stderr?.pipe(log_stream);

        // Wait for Jupyterlab to start up
        return wait_for_jlab().then(() => {
            return proc;
        });
    } catch (e) {
        console.error(e);
        kill_jlab();
        process.exit(1);
    }
}
