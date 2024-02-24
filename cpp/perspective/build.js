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

const { execSync } = require("child_process");
const os = require("os");
const path = require("path");

const stdio = "inherit";
const env = process.env.PSP_DEBUG ? "debug" : "release";
const cwd = path.join(process.cwd(), "dist", env);

delete process.env.NODE;

function bootstrap(file) {
    execSync(`cargo run -p perspective-bootstrap -- ${file}`, {
        cwd: path.join(process.cwd(), "..", "..", "rust", "perspective-viewer"),
        stdio,
    });
}

try {
    execSync(`mkdirp ${cwd}`, { stdio });
    process.env.CLICOLOR_FORCE = 1;
    execSync(`emcmake cmake ${__dirname} -Wno-dev -DCMAKE_BUILD_TYPE=${env}`, {
        cwd,
        stdio,
    });

    execSync(`emmake make -j${process.env.PSP_NUM_CPUS || os.cpus().length}`, {
        cwd,
        stdio,
    });

    execSync(`cpy web/**/* ../web`, { cwd, stdio });
    execSync(`cpy node/**/* ../node`, { cwd, stdio });
    bootstrap(`../../cpp/perspective/dist/web/perspective-server.wasm`);
    bootstrap(`../../cpp/perspective/dist/node/perspective-server.wasm`);
} catch (e) {
    console.error(e);
    process.exit(1);
}
