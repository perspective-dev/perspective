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

import fs from "fs";
import { WebSocketServer } from "@perspective-dev/client";
import { dist_examples } from "./index.mjs";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

await dist_examples(`${__dirname}/dist`);

const template = (body) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
</head>
<body>
    <ul id="list">
        ${body}
    </ul>
</body>
</html>
`;

const prod_template = (name) => `
<li>
    <a href="src/${name}/index.html">local</a>
    <a href="dist/${name}/index.html">dist</a>
    ${name}
</li>
`;

const dev_template = (name) => `
<li>
    <a href="src/${name}/index.html">local</a>
    ${name}
</li>
`;

const gists = [
    "duckdb",
    "fractal",
    "raycasting",
    "evictions",
    "streaming",
    "covid",
    "movies",
    "superstore",
    "olympics",
    "editable",
    "file",
    "magic",
    "nypd",
    "webcam",
];

const lis = [];
for (const key of fs.readdirSync("src")) {
    if (gists.indexOf(key) >= 0) {
        lis.push(prod_template(key));
    } else {
        lis.push(dev_template(key));
    }
}

fs.writeFileSync("dist/index.html", template(lis.join("\n")));

new WebSocketServer({ assets: [__dirname, "dist", "../../"] });
