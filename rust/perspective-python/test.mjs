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

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { getPyodideDistDir } from "@perspective-dev/scripts/pyodide.mjs";
import { getEmscriptenWheelPath } from "@perspective-dev/scripts/workspace.mjs";

// avoid executing this script directly, instead run `pnpm run test` from the workspace root
// to pass extra arguments to pytest, run (with perspective-python focused):
//
// pnpm run test -k "my_cool_test"
const execOpts = { stdio: "inherit" };
if (process.env.PSP_PYODIDE) {
    const pyodideDistDir = getPyodideDistDir();
    if (!fs.existsSync(pyodideDistDir)) {
        console.error(
            `Error: Pyodide distribution not found at ${pyodideDistDir}\n\nRun: pnpm -w run install_pyodide\n\n`,
        );
        process.exit(1);
    }
    const emscriptenWheel = getEmscriptenWheelPath();
    if (!fs.existsSync(emscriptenWheel)) {
        console.error(
            `Error: Emscripten wheel not found at ${emscriptenWheel}\n\nRun: pnpm run build\n\n`,
        );
        process.exit(1);
    }
    execFileSync(
        "pytest",
        [
            "pyodide-tests/",
            "--runner=playwright",
            "--runtime=chrome",
            `--dist-dir=${pyodideDistDir}`,
            `--perspective-emscripten-wheel=${emscriptenWheel}`,
            "--verbose",
            "--timeout=300",
            // with --timeout_method=signal, tests hang.  seems like the
            // pytest-pyodide webserver fixture does not shut down
            "--timeout_method=thread",
            ...process.argv.slice(2),
        ],
        execOpts,
    );
} else {
    execFileSync(
        "pytest",
        [
            "perspective/tests",
            "-W error",
            "--timeout=300",
            ...process.argv.slice(2),
        ],
        execOpts,
    );
}
