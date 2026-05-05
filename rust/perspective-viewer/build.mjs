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

import { execSync } from "child_process";
import { build } from "@perspective-dev/esbuild-plugin/build.js";
import { WorkerPlugin } from "@perspective-dev/esbuild-plugin/worker.js";
import { NodeModulesExternal } from "@perspective-dev/esbuild-plugin/external.js";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    bundle as bundleCss,
    composeVisitors,
    bundleAsync as bundleAsyncCss,
} from "lightningcss";
import { compress } from "pro_self_extracting_wasm";
import { get_host, inlineUrlVisitor, resolveNPM } from "./tools.mjs";

const IS_DEBUG =
    !!process.env.PSP_DEBUG || process.argv.indexOf("--debug") >= 0;

const INHERIT = {
    stdio: "inherit",
    stderr: "inherit",
};

export async function build_all() {
    if (!process.env.PSP_SKIP_WASM) {
        execSync(
            `cargo bundle --target=${get_host()} -- perspective_viewer ${IS_DEBUG ? "" : "--release"}`,
            INHERIT,
        );

        await compress(
            "dist/wasm/perspective-viewer.wasm",
            "dist/wasm/perspective-viewer.wasm",
        );
    }

    // JavaScript
    const BUILD = [
        // WASM assets inlined into a single monolithic `.js` file. No special
        // loades required, this version of Perspective should be the easiest
        // to use but also the least performant at load time.
        // {
        //     'Import via `<script type="module">`': true,
        //     "Requires WASM bootstrap": false,
        //     "Load as binary": false,
        //     "Bundler friendly": true,
        // },
        {
            entryPoints: ["src/ts/perspective-viewer.inline.ts"],
            format: "esm",
            loader: { ".wasm": "binary" },
            outfile: "dist/esm/perspective-viewer.inline.js",
            plugins: [
                WorkerPlugin({
                    inline: !process.env.PSP_DEBUG,
                    // plugins: [GlslMinify(), LightningCssMinify()],
                    // loader: {
                    //     ".css": "text",
                    //     ".glsl": "text",
                    // },
                }),
            ],
        },
        // No WASM assets inlined or linked.
        // {
        //     'Import via `<script type="module">`': true, // *****
        //     "Requires WASM bootstrap": true,
        //     "Load as binary": true,
        //     "Bundler friendly": true,
        // },
        {
            entryPoints: ["src/ts/perspective-viewer.ts"],
            format: "esm",
            external: ["*.wasm"],
            outdir: "dist/esm",
            plugins: [
                WorkerPlugin({
                    inline: true,
                    // plugins: [GlslMinify(), LightningCssMinify()],
                    // loader: {
                    //     ".css": "text",
                    //     ".glsl": "text",
                    // },
                }),
            ],
        },
        // WASM assets linked to relative path via `fetch()`. This efficiently
        // loading build is great for `<script>` tags but will give many
        // bundlers trouble.
        // {
        //     'Import via `<script type="module">`': true,
        //     "Requires WASM bootstrap": false,
        //     "Load as binary": true,
        //     "Bundler friendly": false,
        // },
        {
            entryPoints: ["src/ts/perspective-viewer.cdn.ts"],
            format: "esm",
            loader: { ".wasm": "file" },
            outfile: "dist/cdn/perspective-viewer.js",
            plugins: [
                WorkerPlugin({
                    inline: true,
                    // plugins: [GlslMinify(), LightningCssMinify()],
                    // loader: {
                    //     ".css": "text",
                    //     ".glsl": "text",
                    // },
                }),
            ],
        },
    ];

    await Promise.all(BUILD.map(build)).catch(() => process.exit(1));

    // This is dumb.  `splitting` param for `esbuild` outputs a `__require`/
    // `__exports`/`__esModule` polyfill and does not tree-shake it;  this <1kb
    // file blocks downloading of the wasm asset until after alot of JavaScript has
    // parsed due to this multi-step download+eval.  Luckily `esbuild` is quite fast
    // enough to just run another build to inline this one file `chunk.js`.
    const POSTBUILD = [
        {
            entryPoints: ["dist/cdn/perspective-viewer.js"],
            format: "esm",
            plugins: [NodeModulesExternal()],
            external: ["*.wasm", "*.worker.js", "*.main.js"],
            outdir: "dist/cdn",
            allowOverwrite: true,
        },
    ];

    await Promise.all(POSTBUILD.map(build)).catch(() => process.exit(1));

    // Typecheck
    execSync("tsc --project tsconfig.json", INHERIT);

    // Generate themes via lightningcss bundling.
    fs.mkdirSync("./dist/css/intl", { recursive: true });
    const themes = [
        "icons",
        "intl",
        "pro",
        "pro-dark",
        "botanical",
        "monokai",
        "phosphor",
        "solarized",
        "solarized-dark",
        "vaporwave",
        "gruvbox",
        "gruvbox-dark",
        "dracula",
        "themes",
    ];

    for (const name of themes) {
        const filename = `./src/themes/${name}.css`;
        const { code } = await bundleAsyncCss({
            filename,
            minify: true,
            visitor: inlineUrlVisitor(filename),
            resolver: resolveNPM(import.meta.url),
        });

        fs.writeFileSync(`dist/css/${name}.css`, code);
    }

    const intl_langs = ["de", "es", "fr", "ja", "pt", "zh"];
    for (const lang of intl_langs) {
        const filename = `./src/themes/intl/${lang}.css`;
        const { code } = await bundleAsyncCss({
            filename,
            minify: true,
            visitor: inlineUrlVisitor(filename),
        });

        fs.writeFileSync(`dist/css/intl/${lang}.css`, code);
    }
}

build_all();
