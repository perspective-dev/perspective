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

import { WebSocketServer, table } from "@perspective-dev/client";
import { read_stdin, open_browser } from "./utils.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { program } from "commander";
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import * as url from "node:url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

const _require = createRequire(import.meta.url);

/**
 * Convert data from one format to another.
 *
 * @param {*} filename
 * @param {*} options
 */
async function convert(filename, options) {
    let file;
    if (filename) {
        file = fs.readFileSync(filename).toString();
    } else {
        file = await read_stdin();
    }
    try {
        file = JSON.parse(file);
    } catch {}
    let tbl = await table(file);
    let view = await tbl.view();
    let out;
    options.format = options.format || "arrow";
    if (options.format === "csv") {
        out = await view.to_csv();
    } else if (options.format === "columns") {
        out = JSON.stringify(await view.to_columns());
    } else if (options.format === "json") {
        out = JSON.stringify(await view.to_json());
    } else {
        out = await view.to_arrow();
    }
    if (options.format === "arrow") {
        if (options.output) {
            fs.writeFileSync(options.output, Buffer.from(out), "binary");
        } else {
            console.log(Buffer.from(out).toString());
        }
    } else {
        if (options.output) {
            fs.writeFileSync(options.output, out);
        } else {
            console.log(out);
        }
    }
    view.delete();
    tbl.delete();
}

/**
 * Host a Perspective on a web server.
 *
 * @param {*} filename
 * @param {*} options
 */
export async function host(filename, options) {
    let files = [process.cwd(), path.join(__dirname, "..", "html")];
    if (options.assets) {
        files = [options.assets, ...files];
    }
    const server = new WebSocketServer({
        assets: files,
        port: options.port,
    });

    let file;
    if (filename) {
        file = await table(fs.readFileSync(filename).toString(), {
            name: "data_source_one",
        });
    } else {
        file = await read_stdin();
    }
    if (options.open) {
        const context = await chromium.launchPersistentContext("", {
            channel: "chrome",
            headless: false,
            viewport: null,
            args: [
                "--incognito",
                "--noerrdialogs",
                "--disable-translate",
                "--no-first-run",
                "--fast",
                "--fast-start",
                "--disable-infobars",
                "--window-size=1200,800",
                "--disable-features=TranslateUI",
                "--disk-cache-dir=/dev/null",
                `--app=http://localhost:${options.port}/`,
            ],
        });

        const page = context.pages()[0];
        page.on("close", () => {
            context.close();
            process.exit(0);
        });
    }

    return server;
}

program
    .version(
        JSON.parse(
            fs
                .readFileSync(path.join(__dirname, "..", "..", "package.json"))
                .toString(),
        ).version,
    )
    .description(
        "A convenient command-line client for Perspective.js.  Can convert between Perspective supported format, or host a local web server.",
    )
    .action(() => program.help());

program
    .command("convert [filename]")
    .description(
        "Convert a file into a new format.  Reads from STDIN if no filename is provided.",
    )
    .option(
        "-f, --format <format>",
        "Which output format to use:  arrow, csv, columns, json.",
        /^(arrow|json|columns|csv)$/i,
        "arrow",
    )
    .option(
        "-o, --output <filename>",
        "Filename to write to.  If not supplied, writes to STDOUT.",
    )
    .action(convert);

program
    .command("host [filename]")
    .description(
        "Host a file on a local Websocket/HTTP server using a server-side Perspective.  Reads from STDIN if no filename is provided",
    )
    .option(
        "-p, --port <port>",
        "Which port to bind to.",
        (x) => parseInt(x),
        8080,
    )
    .option("-a, --assets <path>", "Host from a working directory")
    .option("-o, --open", "Open a browser automagically.")
    .action(host);

if (_require.main.path.endsWith("perspective-cli")) {
    if (!process.argv.slice(2).length) {
        program.help();
    } else {
        program.parse(process.argv);
    }
}
