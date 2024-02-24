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
import { build } from "@finos/perspective-esbuild-plugin/build.js";
import { PerspectiveEsbuildPlugin } from "@finos/perspective-esbuild-plugin";

import { NodeModulesExternal } from "@finos/perspective-esbuild-plugin/external.js";

const cpy_mod = import("cpy");

const IS_DEBUG =
    !!process.env.PSP_DEBUG || process.argv.indexOf("--debug") >= 0;

const BUILD = [
    {
        entryPoints: ["src/ts/perspective.ts"],
        format: "esm",
        target: "es2022",
        plugins: [
            PerspectiveEsbuildPlugin({
                wasm: { inline: true },
                worker: { inline: true },
            }),
        ],
        outfile: "dist/esm/perspective.inline.js",
    },
    {
        entryPoints: ["src/ts/perspective.ts"],
        // entryNames: "[dir]/perspective-test-out",
        format: "esm",
        target: "es2022",
        plugins: [PerspectiveEsbuildPlugin()],
        outdir: "dist/cdn",
    },
    // {
    //     entryPoints: ["src/ts/perspective.slim.ts"],
    //     entryNames: "[dir]/perspective-slim",
    //     assetNames: "[dir]/perspective-slim.[name]",
    //     format: "esm",
    //     target: "es2022",
    //     plugins: [PerspectiveEsbuildPlugin()],
    //     outdir: "dist/cdn",
    // },
    {
        entryPoints: ["src/ts/node.ts"],
        format: "esm",
        platform: "node",
        inject: ["src/ts/shim.ts"],
        plugins: [
            PerspectiveEsbuildPlugin({ wasm: { inline: true } }),
            NodeModulesExternal(),
        ],
        outfile: "dist/node/perspective.mjs",
    },
];

const INHERIT = {
    stdio: "inherit",
    stderr: "inherit",
};

function get_host() {
    return /host\: (.+?)$/gm.exec(execSync(`rustc -vV`).toString())[1];
}

async function build_all() {
    // Rust
    const release_flag = IS_DEBUG ? "" : "--release";
    execSync(
        `cargo bundle --target=${get_host()} --release -- perspective ${release_flag} --features=export-init`,
        INHERIT
    );

    // JavaScript
    // execSync("npx tsc --project tsconfig.json", INHERIT);
    const { default: cpy } = await cpy_mod;
    await cpy(["../../cpp/perspective/dist/web/*"], "dist/pkg/web");
    await cpy(["../../cpp/perspective/dist/node/*"], "dist/pkg/node");

    await Promise.all(BUILD.map(build)).catch(() => process.exit(1));
    // // legacy compat
    // await cpy("target/themes/*", "dist/css");
    // await cpy("dist/pkg/*", "dist/esm");
}

build_all();

// const cpy_mod = import("cpy");
// const {
//     NodeModulesExternal,
// } = require("@finos/perspective-esbuild-plugin/external");
// const { build } = require("@finos/perspective-esbuild-plugin/build");
// const {
//     PerspectiveEsbuildPlugin,
// } = require("@finos/perspective-esbuild-plugin");

// const BUILD = [
//     {
//         define: {
//             global: "window",
//         },
//         format: "esm",
//         entryPoints: ["src/js/perspective.browser.js"],
//         plugins: [NodeModulesExternal()],
//         external: ["*.wasm", "*.worker.js"],
//         outfile: "dist/esm/perspective.js",
//     },
//     {
//         entryPoints: ["src/js/perspective.node.js"],
//         platform: "node",
//         plugins: [
//             PerspectiveEsbuildPlugin({ wasm: { inline: true } }),
//             NodeModulesExternal(),
//         ],
//         outfile: "dist/cjs/perspective.node.js",
//     },
//     {
//         define: {
//             global: "window",
//         },
//         format: "esm",
//         entryPoints: ["src/js/perspective.browser.js"],
//         plugins: [PerspectiveEsbuildPlugin()],
//         outfile: "dist/cdn/perspective.js",
//     },
//     {
//         define: {
//             global: "window",
//         },
//         format: "esm",
//         entryPoints: ["src/js/perspective.browser.js"],
//         plugins: [
//             PerspectiveEsbuildPlugin({
//                 wasm: { inline: true },
//                 worker: { inline: true },
//             }),
//         ],
//         outfile: "dist/esm/perspective.inline.js",
//     },
// ];

// async function build_all() {
//     const { default: cpy } = await cpy_mod;
//     await cpy(["../../cpp/perspective/dist/web/*"], "dist/pkg/web");
//     await cpy(["../../cpp/perspective/dist/node/*"], "dist/pkg/node");
//     await Promise.all(BUILD.map(build)).catch(() => process.exit(1));
// }

// build_all();
