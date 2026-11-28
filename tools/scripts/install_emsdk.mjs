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

import path from "path";
import os from "os";
import fs from "fs";
import * as dotenv from "dotenv";
import { getWorkspaceRoot, getWorkspacePackageJson } from "./workspace.mjs";

import "zx/globals";

const pkg = getWorkspacePackageJson();

const emscripten = pkg.emscripten;

dotenv.config({ path: "./.perspectiverc", quiet: true });

function base() {
    return path.resolve(getWorkspaceRoot(), ".emsdk").replace(/\\/g, "/");
}

function emsdk_checkout() {
    $.sync`git clone https://github.com/emscripten-core/emsdk.git ${base()}`;
}

function emsdk(...args) {
    const basedir = base();
    const suffix = os.type() == "Windows_NT" ? ".bat" : "";
    const emsdkBin = path.join(basedir, "emsdk" + suffix).replace(/\\/g, "/");
    $.sync`${emsdkBin} ${args}`;
}

function toolchain_install() {
    console.log(`-- Installing Emscripten ${emscripten}`);
    $.sync({ cwd: ".emsdk" })`git pull`;
    emsdk("install", emscripten);
    emsdk("activate", emscripten);
    console.log(`-- Emscripten ${emscripten} installed`);
}

// Install the `tsc` Emscripten pins for `--emit-tsd` into its own `node_modules`, because emsdk's `npm ci --production` omits that devDependency and Emscripten then falls back to the workspace `tsc` on `PATH`, whose TypeScript 7 rejects the `--outFile` it passes.
function emscripten_tsc_install() {
    const root = path.join(base(), "upstream", "emscripten");
    const manifest = JSON.parse(
        fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );

    const range = manifest.devDependencies.typescript;
    const prefix = path.join(root, "node_modules", ".psp-tsc");
    const bin = path.join(root, "node_modules", ".bin");
    const target = "../.psp-tsc/node_modules/typescript/bin/tsc";
    console.log(`-- Installing Emscripten's typescript@${range}`);
    $.sync`npm install --no-save --no-package-lock --ignore-scripts --prefix ${prefix} typescript@${range}`;
    fs.mkdirSync(bin, { recursive: true });
    if (os.type() == "Windows_NT") {
        fs.writeFileSync(
            path.join(bin, "tsc.cmd"),
            `@node "%~dp0\\${target.replace(/\//g, "\\")}" %*\r\n`,
        );
    } else {
        fs.rmSync(path.join(bin, "tsc"), { force: true });
        fs.symlinkSync(target, path.join(bin, "tsc"));
    }
}

function repo_check() {
    return fs.existsSync(path.join(base(), "emsdk_env.sh"));
}

if (!process.env.PSP_SKIP_EMSDK_INSTALL) {
    // if a stale toolchain is still activated in the shell, these vars break
    // emsdk install in a confusing way.  ensure they are unset
    for (let ev of ["EMSDK", "EMSDK_NODE", "EMSDK_PYTHON", "SSL_CERT_FILE"]) {
        delete process.env[ev];
    }

    if (!repo_check()) {
        emsdk_checkout();
    }

    toolchain_install();
    emscripten_tsc_install();
}
