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

import * as tar from "tar";
import fs from "fs";
import path from "path";
import url from "node:url";

import "zx/globals";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_PATH = path.join(__dirname, "../../results.tar.gz");

export default async function run() {
    if (fs.existsSync(RESULTS_PATH)) {
        console.log("\nReplacing results.tar.gz");
    } else {
        console.log("\nCreating results.tar.gz");
    }

    const cwd = path.join(__dirname, "..", "..");
    await new Promise((x) =>
        tar.create(
            {
                cwd,
                gzip: true,
                file: RESULTS_PATH,
                sync: false,
                portable: true,
                noMtime: true,
                strip: 2,
                filter: (path, stat) => {
                    stat.mtime = null;
                    stat.atime = null;
                    stat.ctime = null;
                    // stat.birthtime = null;
                    return !path.endsWith(".DS_Store");
                },
            },
            [
                ...glob.sync("dist/snapshots/**/*.txt", { cwd }),
                ...glob.sync("dist/snapshots/**/*.html", { cwd }),
                // Image baselines for visual-regression specs. Without
                // these, CI has no Playwright PNG comparison target and
                // every `toHaveScreenshot` call fails.
                ...glob.sync("dist/snapshots/**/*.png", { cwd }),
            ],
            x,
        ),
    );
}
