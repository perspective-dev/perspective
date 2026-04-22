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

import * as fs from "fs";
import { get_examples, LOCAL_EXAMPLES } from "./examples.js";
import * as url from "url";
import * as path from "node:path";
import { execSync } from "child_process";

const version = JSON.parse(fs.readFileSync("./package.json")).version;
const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

// TODO jsdelivr has slightly different logic for trailing '/' that causes
// the wasm assets to not load correctly when using aliases, hence we must link
// directly to the assets.
const replacements = {
    "/node_modules/": `https://cdn.jsdelivr.net/npm/`,
    "@perspective-dev/client/dist/cdn/perspective.js": `@perspective-dev/client@${version}/dist/cdn/perspective.js`,
    "@perspective-dev/viewer/dist/cdn/perspective-viewer.js": `@perspective-dev/viewer@${version}/dist/cdn/perspective-viewer.js`,
    "@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js": `@perspective-dev/viewer-datagrid@${version}/dist/cdn/perspective-viewer-datagrid.js`,
    "@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js": `@perspective-dev/viewer-charts@${version}/dist/cdn/perspective-viewer-charts.js`,
    "@perspective-dev/workspace/dist/cdn/perspective-workspace.js": `@perspective-dev/workspace@${version}/dist/cdn/perspective-workspace.js`,
    "@perspective-dev/server/dist/cdn/perspective.cpp.wasm": `@perspective-dev/client@${version}/dist/cdn/perspective.cpp.wasm`,
    "@perspective-dev/viewer/dist/cdn/perspective.rx.wasm": `@perspective-dev/viewer@${version}/dist/cdn/perspective.rx.wasm`,
    "@perspective-dev/client/dist/cdn/perspective.worker.js": `@perspective-dev/client@${version}/dist/cdn/perspective.worker.js`,
};

export async function dist_examples(
    outpath = `${__dirname}/../../docs/static/blocks`,
) {
    execSync(`mkdir -p ${outpath}`, { stdio: "inherit" });
    const readme = generate_readme();
    let existing = fs.readFileSync(`${__dirname}/../../README.md`).toString();
    existing = existing.replace(
        /<\!\-\- Examples \-\->([\s\S]+?)<\!\-\- Examples \-\->/gm,
        `<!-- Examples -->\n${readme}\n<!-- Examples -->`,
    );

    fs.writeFileSync(`${__dirname}/../../README.md`, existing);
    for (const name of LOCAL_EXAMPLES) {
        // Copy
        if (fs.existsSync(`${__dirname}/src/${name}`)) {
            // Copy
            for (const filename of fs.readdirSync(`${__dirname}/src/${name}`)) {
                execSync(`mkdir -p ${outpath}/${name}`, { stdio: "inherit" });
                if (
                    filename.endsWith(".mjs") ||
                    filename.endsWith(".js") ||
                    filename.endsWith(".html")
                ) {
                    let filecontents = fs
                        .readFileSync(`${__dirname}/src/${name}/${filename}`)
                        .toString();
                    for (const pattern of Object.keys(replacements)) {
                        filecontents = filecontents.replace(
                            new RegExp(pattern, "g"),
                            replacements[pattern],
                        );
                    }
                    fs.writeFileSync(
                        `${outpath}/${name}/${filename}`,
                        filecontents,
                    );
                } else if (filename !== ".git") {
                    execSync(
                        `cp ${__dirname}/src/${name}/${filename} ${outpath}/${name}/${filename}`,
                        { stdio: "inherit" },
                    );
                }
            }

            // build
            if (fs.existsSync(path.join(outpath, name, "build.mjs"))) {
                console.log("Building " + name);
                const script = `${outpath}/${name}/build.mjs`;
                execSync(`node ${script}`, { stdio: "inherit" });
            }
        }
    }
}

function partition(input, spacing) {
    let output = [];
    for (let i = 0; i < input.length; i += spacing) {
        output[output.length] = input.slice(i, i + spacing);
    }

    return output;
}

function generate_readme() {
    const all = get_examples();
    return `<table><tbody>${partition(all, 3)
        .map(
            (row) =>
                `<tr>${row
                    .map((y) => `<td>${y.name}</td>`)
                    .join("")}</tr><tr>${row
                    .map(
                        (y) =>
                            `<td><a href="${y.url}"><img height="125" src="${y.img}" /></a></td>`,
                    )
                    .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
}
