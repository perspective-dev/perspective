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

import { WasmPlugin } from "@perspective-dev/esbuild-plugin/wasm.js";
import { WorkerPlugin } from "@perspective-dev/esbuild-plugin/worker.js";
import { build } from "@perspective-dev/esbuild-plugin/build.js";
import * as path from "node:path";
import { bundleAsync as bundleCss } from "lightningcss";
import * as fs from "node:fs";
import * as url from "node:url";
import {
    resolveNPM,
    inlineUrlVisitor,
} from "@perspective-dev/viewer/tools.mjs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

// The anywidget bundle is `PerspectiveWidget._esm`/`._css`, loaded by anywidget
// from the python package at import time. Emit it (wasm inlined) directly into
// the python package's static dir. The `perspective-anywidget.*` filenames
// must match `perspective/widget/__init__.py`, the maturin `include`, the
// `Cargo.toml` (sdist) `include`, and `tools/scripts/repack_wheel.mjs`.
const STATIC = path.resolve(
    __dirname,
    "..",
    "..",
    "rust",
    "perspective-python",
    "perspective",
    "widget",
    "static",
);

const ANYWIDGET_BUILD = {
    entryPoints: ["src/js/index.js"],
    plugins: [WasmPlugin(true), WorkerPlugin({ inline: true })],
    outfile: path.join(STATIC, "perspective-anywidget.js"),
    format: "esm",
    define: {
        global: "window",
    },
    loader: {
        ".css": "text",
        ".html": "text",
        ".ttf": "file",
    },
};

async function build_css(filename, outfile) {
    const { code } = await bundleCss({
        filename,
        minify: true,
        visitor: inlineUrlVisitor(filename),
        resolver: resolveNPM(import.meta.url),
    });

    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    fs.writeFileSync(outfile, code);
}

async function build_all() {
    fs.mkdirSync(STATIC, { recursive: true });
    await build_css(
        path.resolve(__dirname, "src/css/index.css"),
        path.join(STATIC, "perspective-anywidget.css"),
    );

    await build(ANYWIDGET_BUILD).catch(() => process.exit(1));
}

build_all();
