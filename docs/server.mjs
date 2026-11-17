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

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cwd_static_file_handler } from "@perspective-dev/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;
const ASSETS = [
    `${__dirname}/dist`,
    `${__dirname}/static`,
    `${__dirname}/../node_modules`,
];

/** Whether `pathname` names a directory under any asset root. */
function is_directory(pathname) {
    return ASSETS.some((root) => {
        try {
            const target = path.join(root, decodeURIComponent(pathname));
            return fs.statSync(target).isDirectory();
        } catch {
            return false;
        }
    });
}

http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (is_directory(url.pathname)) {
        if (!url.pathname.endsWith("/")) {
            response.writeHead(302, {
                Location: `${url.pathname}/${url.search}`,
            });

            response.end();
            return;
        }

        request.url = `${url.pathname}index.html${url.search}`;
    }

    return cwd_static_file_handler(request, response, ASSETS);
}).listen(PORT, () => console.log(`Serving docs on http://localhost:${PORT}`));
