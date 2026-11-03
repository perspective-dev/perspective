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

import { NodeModulesExternal } from "@perspective-dev/esbuild-plugin/external.js";
import { build } from "@perspective-dev/esbuild-plugin/build.js";
import { bundle as bundleCss } from "lightningcss";
import * as fs from "node:fs";
import { inlineUrlVisitor } from "../../rust/perspective-viewer/tools.mjs";

import "zx/globals";

const BUILD = [
    {
        define: {
            global: "window",
        },
        entryPoints: ["src/ts/index.ts"],
        plugins: [NodeModulesExternal()],
        format: "esm",
        loader: {
            ".css": "text",
            ".html": "text",
        },
        outfile: "dist/esm/perspective-viewer-datagrid.js",
    },
    {
        define: {
            global: "window",
        },
        entryPoints: ["src/ts/index.ts"],
        plugins: [],
        format: "esm",
        loader: {
            ".css": "text",
            ".html": "text",
        },
        outfile: "dist/cdn/perspective-viewer-datagrid.js",
    },
];

async function compile_css() {
    fs.mkdirSync("dist/css", { recursive: true });
    const { code: datagridCode } = bundleCss({
        filename: "./src/css/perspective-viewer-datagrid.css",
        minify: true,
        visitor: inlineUrlVisitor("./src/css/perspective-viewer-datagrid.css"),
    });
    fs.writeFileSync("dist/css/perspective-viewer-datagrid.css", datagridCode);

    const { code: toolbarCode } = bundleCss({
        filename: "./src/css/toolbar.css",
        minify: true,
        visitor: inlineUrlVisitor("./src/css/toolbar.css"),
    });
    fs.writeFileSync(
        "dist/css/perspective-viewer-datagrid-toolbar.css",
        toolbarCode,
    );
}

async function build_all() {
    await compile_css();
    await Promise.all(BUILD.map(build)).catch(() => process.exit(1));
    try {
        await $`tsc --project ./tsconfig.json`.stdio(
            "inherit",
            "inherit",
            "inherit",
        );
    } catch (e) {
        console.error(e.stdout);
        process.exit(1);
    }
}

build_all();
