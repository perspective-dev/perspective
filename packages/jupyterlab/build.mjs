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
import { execSync } from "node:child_process";
import {
    resolveNPM,
    inlineUrlVisitor,
} from "../../rust/perspective-viewer/tools.mjs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

const LAB_BUILD = {
    entryPoints: ["src/js/index.js"],
    define: {
        global: "window",
    },
    plugins: [WasmPlugin(true), WorkerPlugin({ inline: true })],
    external: ["@jupyter*", "@lumino*"],
    format: "esm",
    loader: {
        ".css": "text",
        ".html": "text",
        ".ttf": "file",
    },
    outfile: "dist/esm/perspective-jupyterlab.js",
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
    fs.mkdirSync("dist/css", { recursive: true });

    await build_css(
        path.resolve(__dirname, "src/css/index.css"),
        path.resolve(__dirname, "dist/css/perspective-jupyterlab.css"),
    );

    await build(LAB_BUILD).catch(() => process.exit(1));

    fs.cpSync("src/css", "dist/css/src", { recursive: true });
    execSync("jupyter labextension build .", {
        stdio: "inherit",
    });
    fs.copyFileSync("install.json", "dist/install.json");

    const pkg = JSON.parse(fs.readFileSync("../../package.json").toString());
    const labext_dest = `../../rust/perspective-python/perspective_python-${pkg.version}.data/data/share/jupyter/labextensions/@perspective-dev/jupyterlab`;
    fs.cpSync("dist/cjs", labext_dest, { recursive: true });
    fs.copyFileSync("install.json", path.join(labext_dest, "install.json"));

    // jlab_start.ts serves dist/esm as the JupyterLab root; widget.spec.mjs
    // notebooks read test.arrow from cwd
    fs.cpSync("test/arrow", "dist/esm", { recursive: true });
}

build_all();
