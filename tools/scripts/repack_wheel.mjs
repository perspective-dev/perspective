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

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { getWorkspacePackageJson } from "./workspace.mjs";

const pkg = getWorkspacePackageJson();

const wheel_file = fs.readdirSync(".").filter((x) => x.endsWith(".whl"))[0];
execSync(`wheel unpack ${wheel_file}`);
const pkg_name = wheel_file.split("-").slice(0, 2).join("-");
const version = pkg.version.replace(/-(rc|alpha|beta)\.\d+/, (x) =>
    x.replace("-", "").replace(".", ""),
);

const dest = `${pkg_name}/perspective_python-${version}.data`;
const src = `rust/perspective-python/perspective_python-${version}.data`;
fs.cpSync(src, dest, {
    recursive: true,
});

// The anywidget bundle is built by `@perspective-dev/anywidget` after the
// wheel itself, so the maturin `include` misses it; inject it here with the
// labextension.
fs.mkdirSync(`${pkg_name}/perspective/widget/static`, { recursive: true });
for (const asset of ["perspective-anywidget.js", "perspective-anywidget.css"]) {
    fs.cpSync(
        `rust/perspective-python/perspective/widget/static/${asset}`,
        `${pkg_name}/perspective/widget/static/${asset}`,
    );
}

execSync(`wheel pack ${pkg_name}`);
