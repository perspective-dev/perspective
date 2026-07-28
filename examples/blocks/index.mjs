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

const superstore_version = JSON.parse(
    fs.readFileSync(`${__dirname}/node_modules/superstore-arrow/package.json`),
).version;

export function rewrite_cdn_urls(filecontents) {
    return filecontents
        .replace(
            /\/node_modules\/@perspective-dev\/([A-Za-z0-9_-]+)\//g,
            (_, pkg) =>
                `https://cdn.jsdelivr.net/npm/@perspective-dev/${pkg}@${version}/`,
        )
        .replace(
            /\/node_modules\/superstore-arrow\//g,
            `https://cdn.jsdelivr.net/npm/superstore-arrow@${superstore_version}/`,
        )
        .replace(/\/node_modules\//g, `https://cdn.jsdelivr.net/npm/`);
}

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
                    const filecontents = rewrite_cdn_urls(
                        fs
                            .readFileSync(`${__dirname}/src/${name}/${filename}`)
                            .toString(),
                    );
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
