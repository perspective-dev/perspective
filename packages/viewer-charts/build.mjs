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
import { transform as transformCss } from "lightningcss";
import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";

// TODO: if shader payload ever becomes a measured bottleneck, swap this
// regex minifier for an AST-based tool (e.g. `glsl-minifier`) to get
// identifier mangling on locals/varyings. Uniform/attribute names are
// resolved by string from JS via `getUniformLocation` / `getAttribLocation`,
// so only locals are safe to rename.
const GlslMinify = () => ({
    name: "glsl-minify",
    setup(build) {
        build.onLoad({ filter: /\.glsl$/ }, async (args) => {
            const src = await fs.readFile(args.path, "utf8");
            if (process.env.PSP_DEBUG) {
                return { contents: src, loader: "text" };
            }
            const min = src
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\/\/[^\n]*/g, "")
                .replace(/\s+/g, " ")
                .replace(/\s*([;,(){}\[\]=+\-*/<>!&|^~?])\s*/g, "$1")
                .trim();
            return { contents: min, loader: "text" };
        });
    },
});

// CSS is imported via `import style from "...css"` + the `.css: text`
// loader, so the final bundle embeds the source verbatim as a JS
// string literal — esbuild's own minifier doesn't touch string
// contents. Route `.css` loads through lightningcss so the embedded
// CSS is minified (whitespace collapse, selector shortening, value
// normalisation).
//
// Skipped in `PSP_DEBUG` builds to keep source maps useful.
const LightningCssMinify = () => ({
    name: "lightningcss-minify",
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
            const src = await fs.readFile(args.path);
            if (process.env.PSP_DEBUG) {
                return { contents: src.toString("utf8"), loader: "text" };
            }
            const { code } = transformCss({
                filename: args.path,
                code: src,
                minify: true,
            });
            return { contents: code.toString("utf8"), loader: "text" };
        });
    },
});

const BUILD = [
    {
        entryPoints: ["src/ts/index.ts"],
        define: {
            global: "window",
        },
        plugins: [NodeModulesExternal(), GlslMinify(), LightningCssMinify()],
        format: "esm",
        loader: {
            ".css": "text",
            ".glsl": "text",
        },
        outfile: "dist/esm/perspective-viewer-charts.js",
    },
    {
        entryPoints: ["src/ts/index.ts"],
        define: {
            global: "window",
        },
        plugins: [GlslMinify(), LightningCssMinify()],
        minifyWhitespace: !process.env.PSP_DEBUG,
        minifyIdentifiers: !process.env.PSP_DEBUG,
        mangleProps: process.env.PSP_DEBUG ? false : /^[_#]/,
        format: "esm",
        loader: {
            ".css": "text",
            ".glsl": "text",
        },
        outfile: "dist/cdn/perspective-viewer-charts.js",
    },
];

async function build_all() {
    await Promise.all(BUILD.map(build)).catch(() => process.exit(1));
    try {
        execSync("tsc", { stdio: "inherit" });
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

build_all();
