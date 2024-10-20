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

import * as fs from "node:fs";
import sh from "../../tools/perspective-scripts/sh.mjs";
import * as url from "url";
import * as TOML from "@iarna/toml";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);
const pkg = JSON.parse(
    fs.readFileSync(__dirname + "/package.json", { encoding: "utf-8" })
);

let flags = "--release";
let features = [];
if (!!process.env.PSP_DEBUG) {
    flags = "";
}

const python_version = process.env.PSP_PYTHON_VERSION || "3.12";
const is_pyodide = !!process.env.PSP_PYODIDE;

const version = pkg.version.replace(/-(rc|alpha|beta)\.\d+/, (x) =>
    x.replace("-", "").replace(".", "")
);

fs.mkdirSync(`./perspective_python-${version}.data`, { recursive: true });

const cwd = process.cwd();
const cmd = sh();

if (is_pyodide) {
    const emsdkdir = sh.path`${__dirname}/../../.emsdk`;
    const { emscripten } = JSON.parse(
        fs.readFileSync(sh.path`${__dirname}/../../package.json`)
    );
    cmd.sh`cd ${emsdkdir}`.sh`. ./emsdk_env.sh`
        .sh`./emsdk activate ${emscripten}`.sh`cd ${cwd}`;
}

// if not windows
if (process.platform !== "win32") {
    cmd.env({
        PSP_ROOT_DIR: "../..",
    });
}

const build_wheel = !!process.env.PSP_BUILD_WHEEL || is_pyodide;
const build_sdist = !!process.env.PSP_BUILD_SDIST;

if (build_wheel) {
    let target = "";
    if (is_pyodide) {
        target = `--target=wasm32-unknown-emscripten -i${python_version}`;
    } else if (
        process.env.PSP_ARCH === "x86_64" &&
        process.platform === "darwin"
    ) {
        target = "--target=x86_64-apple-darwin";
    } else if (
        process.env.PSP_ARCH === "aarch64" &&
        process.platform === "darwin"
    ) {
        target = "--target=aarch64-apple-darwin";
    } else if (
        process.env.PSP_ARCH === "x86_64" &&
        process.platform === "linux"
    ) {
        target =
            "--target=x86_64-unknown-linux-gnu --compatibility manylinux_2_28";
    } else if (
        process.env.PSP_ARCH === "aarch64" &&
        process.platform === "linux"
    ) {
        target = "--target=aarch64-unknown-linux-gnu";
    }

    if (!!process.env.PSP_BUILD_VERBOSE) {
        flags += " -vv";
    }

    if (process.env.CONDA_BUILD === "1") {
        console.log("Building with Conda flags and features");
        if (process.env.PYTHON) {
            console.log(`interpreter: ${process.env.PYTHON}`);
            flags += ` --interpreter=${process.env.PYTHON}`;
        } else {
            console.warn(
                "Expected PYTHON to be set in CONDA_BUILD environment, but it isn't.  maturin will likely detect the wrong Python."
            );
        }

        // we need to generate proto.rs using conda's protoc, which is set in
        // the environment.  we use the unstable "versioned" python abi
        features.push(["generate-proto"]);
    } else {
        // standard for in-repo builds.  a different set will be standard in the sdist
        const standard_features = ["abi3", "generate-proto", "protobuf-src"];
        console.log("Building with standard flags and features");
        features.push(...standard_features);
    }

    cmd.sh(`maturin build ${flags} --features=${features.join(",")} ${target}`);
}

const old = fs.readFileSync("./pyproject.toml");

if (build_sdist) {
    const toml = TOML.parse(old);
    console.log(toml);
    delete toml.tool.maturin["data"];
    fs.writeFileSync("./pyproject.toml", TOML.stringify(toml));
    cmd.sh(`maturin sdist`);
}

if (!build_wheel && !build_sdist) {
    cmd.sh(`maturin develop ${flags}`);
}

cmd.runSync();

if (build_sdist) {
    fs.writeFileSync("./pyproject.toml", old);
}
