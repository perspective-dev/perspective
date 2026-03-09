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
import { PerspectiveEsbuildPlugin } from "@perspective-dev/esbuild-plugin";
import { NodeModulesExternal } from "@perspective-dev/esbuild-plugin/external.js";
import * as fs from "node:fs";
import { BuildCss } from "@prospective.co/procss/target/cjs/procss.js";
import { compress } from "pro_self_extracting_wasm";

const IS_DEBUG =
    !!process.env.PSP_DEBUG || process.argv.indexOf("--debug") >= 0;

const INHERIT = {
    stdio: "inherit",
    stderr: "inherit",
};

function get_host() {
    return /host\: (.+?)$/gm.exec(execSync(`rustc -vV`).toString())[1];
}
async function build_all() {
    execSync(
        `cargo bundle --target=${get_host()} -- perspective_viewer ${
            IS_DEBUG ? "" : "--release"
        }`,
        INHERIT,
    );

    await compress(
        "dist/wasm/perspective-viewer.wasm",
        "dist/wasm/perspective-viewer.wasm",
    );

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
            plugins: [PerspectiveEsbuildPlugin()],
            loader: { ".wasm": "binary" },
            outfile: "dist/esm/perspective-viewer.inline.js",
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
            plugins: [PerspectiveEsbuildPlugin()],
            loader: { ".wasm": "file" },
            outfile: "dist/cdn/perspective-viewer.js",
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

    // Generate themes. `cargo` is not a great tool for this as there's no
    // simple way to find the output artifact.
    function add(builder, path) {
        builder.add(path, fs.readFileSync(`./src/themes/${path}`).toString());
    }

    fs.mkdirSync("./dist/css/intl", { recursive: true });
    const builder = new BuildCss("./src/themes");
    add(builder, "variables.less");
    add(builder, "intl.less");
    add(builder, "icons.less");
    add(builder, "pro.less");
    add(builder, "pro-dark.less");
    add(builder, "botanical.less");
    add(builder, "monokai.less");
    add(builder, "solarized.less");
    add(builder, "solarized-dark.less");
    add(builder, "vaporwave.less");
    add(builder, "gruvbox.less");
    add(builder, "gruvbox-dark.less");
    add(builder, "dracula.less");
    add(builder, "themes.less");
    for (const [name, css] of builder.compile()) {
        fs.writeFileSync(`dist/css/${name}`, css);
    }

    const intl_builder = new BuildCss("./src/themes/intl");
    add(intl_builder, "intl/de.less");
    add(intl_builder, "intl/es.less");
    add(intl_builder, "intl/fr.less");
    add(intl_builder, "intl/ja.less");
    add(intl_builder, "intl/pt.less");
    add(intl_builder, "intl/zh.less");
    for (const [name, css] of intl_builder.compile()) {
        fs.writeFileSync(`dist/css/intl/${name}`, css);
    }
}

build_all();
