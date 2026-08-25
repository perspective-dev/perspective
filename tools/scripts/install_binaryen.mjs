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
import { getWorkspaceRoot, getWorkspacePackageJson } from "./workspace.mjs";

import "zx/globals";

const pkg = getWorkspacePackageJson();
const binaryen = pkg.binaryen;

/// Native Binaryen release binaries (`rust/bundle` shells out to `wasm-opt`;
/// the `wasm-opt` crate is unmaintained at Binaryen 116 and the `binaryen`
/// npm package's wasm-under-Node build is ~10x slower than native).
function base() {
    return path.resolve(getWorkspaceRoot(), ".binaryen").replace(/\\/g, "/");
}

function platform() {
    const arch = { arm64: "arm64", x64: "x86_64" }[os.arch()];
    const system = {
        Darwin: "macos",
        Linux: "linux",
        Windows_NT: "windows",
    }[os.type()];

    if (!arch || !system) {
        throw new Error(`No Binaryen release for ${os.type()}/${os.arch()}`);
    }

    // Linux arm64 releases use the `aarch64` spelling.
    return system === "linux" && arch === "arm64"
        ? "aarch64-linux"
        : `${arch}-${system}`;
}

function version_check() {
    const marker = path.join(base(), "VERSION");
    return (
        fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === binaryen
    );
}

async function toolchain_install() {
    console.log(`-- Installing Binaryen ${binaryen}`);
    const url = `https://github.com/WebAssembly/binaryen/releases/download/${binaryen}/binaryen-${binaryen}-${platform()}.tar.gz`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${response.status} fetching ${url}`);
    }

    const tarball = path.join(os.tmpdir(), `binaryen-${binaryen}.tar.gz`);
    fs.writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));
    fs.rmSync(base(), { recursive: true, force: true });
    fs.mkdirSync(base(), { recursive: true });

    // Strip the `binaryen-version_NNN/` prefix so the layout is stable at
    // `.binaryen/bin/wasm-opt` regardless of pinned version.
    $.sync`tar -xzf ${tarball} -C ${base()} --strip-components=1`;
    fs.rmSync(tarball, { force: true });
    fs.writeFileSync(path.join(base(), "VERSION"), binaryen);
    console.log(`-- Binaryen ${binaryen} installed`);
}

if (!process.env.PSP_SKIP_BINARYEN_INSTALL) {
    if (version_check()) {
        console.log(`-- Binaryen ${binaryen} already installed`);
    } else {
        await toolchain_install();
    }
}
