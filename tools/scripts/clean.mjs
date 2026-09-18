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

import { clean, get_scope } from "./sh_perspective.mjs";
import { execSync } from "child_process";
import * as fs from "node:fs";

const PACKAGES = get_scope();
const JS_PKGS = [];
const RUST_PKGS = [];

const CRATE_NAMES = fs.readdirSync("rust");

for (const pkg of PACKAGES) {
    if (pkg === "perspective-server") {
        console.log("-- Cleaning perspective-server");
        clean("rust/perspective-server/dist");
    } else if (CRATE_NAMES.indexOf(pkg) > -1) {
        RUST_PKGS.push(pkg);
    } else {
        JS_PKGS.push(pkg);
    }
}

if (JS_PKGS.length > 0 || RUST_PKGS.length > 0) {
    console.log(`-- Cleaning ${JS_PKGS.join(", ")} via pnpm`);
    const flags = JS_PKGS.concat(RUST_PKGS)
        .map((x) => `--filter @perspective-dev/${x} --filter ${x} --if-present`)
        .join(" ");

    execSync(`pnpm run ${flags} clean`, { stdio: "inherit" });
}

if (RUST_PKGS.length > 0) {
    if (process.env.PACKAGE?.length > 1) {
        console.log(`-- Cleaning ${RUST_PKGS.join(", ")} via cargo`);
        execSync(`cargo clean ${RUST_PKGS.map((x) => `-p ${x}`).join(" ")}`);
    } else {
        console.log(`-- Cleaning all crates via cargo`);
        execSync(`cargo clean`);
    }
}

clean("docs/build", "docs/python", "docs/obj");
