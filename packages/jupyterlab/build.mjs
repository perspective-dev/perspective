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
import { bundleAsync as bundleCss, composeVisitors } from "lightningcss";
import * as fs from "node:fs";
import * as url from "node:url";
// import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import {
    resolveNPM,
    inlineUrlVisitor,
} from "@perspective-dev/viewer/tools.mjs";

// const _require = createRequire(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

const NBEXTENSION_PATH = path.resolve(
    __dirname,
    "..",
    "..",
    "python",
    "perspective",
    "perspective",
    "nbextension",
    "static",
);

const TEST_BUILD = {
    entryPoints: ["src/js/psp_widget.js"],
    define: {
        global: "window",
    },
    plugins: [WasmPlugin(true), WorkerPlugin({ inline: true })],
    globalName: "PerspectiveLumino",
    format: "esm",
    loader: {
        ".html": "text",
        ".ttf": "file",
        ".css": "text",
    },
    external: ["@perspective-dev/viewer"],
    outfile: "dist/esm/lumino.js",
};

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

const NB_BUILDS = [
    // {
    //     entryPoints: ["src/js/notebook/extension.js"],
    //     define: {
    //         global: "window",
    //     },
    //     plugins: [
    //         WasmPlugin(true),
    //         WorkerPlugin({ inline: true }),
    //         AMDLoader([]),
    //     ],
    //     loader: {
    //         ".ttf": "file",
    //         ".css": "text",
    //     },
    //     external: ["@jupyter*", "@lumino*"],
    //     format: "cjs",
    //     outfile: path.join(NBEXTENSION_PATH, "extension.js"),
    // },
    // {
    //     entryPoints: ["src/js/notebook/index.js"],
    //     define: {
    //         global: "window",
    //     },
    //     plugins: [
    //         WasmPlugin(true),
    //         WorkerPlugin({ inline: true }),
    //         AMDLoader(["@jupyter-widgets/base"]),
    //     ],
    //     external: ["@jupyter*"],
    //     format: "cjs",
    //     loader: {
    //         ".ttf": "file",
    //         ".css": "text",
    //     },
    //     outfile: path.join(NBEXTENSION_PATH, "index.js"),
    // },
];

const IS_TEST = process.argv.some((x) => x === "--test");
const BUILD = IS_TEST
    ? [LAB_BUILD, ...NB_BUILDS, TEST_BUILD]
    : [LAB_BUILD, ...NB_BUILDS];

async function build_all() {
    fs.mkdirSync("dist/css", { recursive: true });
    const filename = path.resolve(__dirname, "src/css/index.css");
    const { code } = await bundleCss({
        filename,
        minify: true,
        visitor: inlineUrlVisitor(filename),
        resolver: resolveNPM(import.meta.url),
    });

    fs.writeFileSync("dist/css/perspective-jupyterlab.css", code);
    await Promise.all(BUILD.map(build)).catch(() => process.exit(1));
    fs.cpSync("src/css", "dist/css/src", { recursive: true });
    execSync("jupyter labextension build .", {
        stdio: "inherit",
    });

    const pkg = JSON.parse(fs.readFileSync("../../package.json").toString());
    const labext_dest = `../../rust/perspective-python/perspective_python-${pkg.version}.data/data/share/jupyter/labextensions/@perspective-dev/jupyterlab`;
    fs.cpSync("dist/cjs", labext_dest, { recursive: true });
    if (IS_TEST) {
        fs.cpSync("test/arrow", "dist/esm", { recursive: true });
    }
}

build_all();
