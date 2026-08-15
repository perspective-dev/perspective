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

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { COLLAGE, collage } from "./build.collage.mjs";
import { screenshotTheme } from "./build.screenshot.mjs";

const [NODE_MAJOR] = process.versions.node.split(".").map(Number);
if (NODE_MAJOR < 20) {
    console.error(
        `build.projects.mjs requires Node >= 20 (found ${process.version}) — ` +
            "the dataset unzip step fails on older runtimes with " +
            '"malloc is not a function". Run `nvm use 22` and rebuild.',
    );

    process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "static/projects");
const DIST_OUT = path.join(__dirname, "dist/projects");
const PORT = 8129;

/** One pass per `prefers-color-scheme` value (see `build.screenshot.mjs`). */
const THEMES = ["light", "dark"];

const perspective = await import(
    "@perspective-dev/client/dist/esm/perspective.node.js"
);

const DATA = path.join(__dirname, "static/data");
const DIST_DATA = path.join(__dirname, "dist/data");

const NYPD_URL =
    "https://rawcdn.githack.com/new-york-civil-liberties-union/NYPD-Misconduct-Complaint-Database-Updated/f6cea944b347c96eb26b76323013640dff4b3d00/CCRB%20Complaint%20Database%20Raw%2004.28.2023.zip?min=1";

const OLYMPICS_DATASET =
    "heesoo37/120-years-of-olympic-history-athletes-and-results";

const EVICTIONS_URL =
    "https://data.sfgov.org/resource/5cei-gny5.csv?$limit=50000";

const MOVIES_URL = "https://vega.github.io/editor/data/movies.json";

const MOVIES_SCHEMA = {
    Title: "string",
    "US Gross": "float",
    "Worldwide Gross": "float",
    "US DVD Sales": "float",
    "Production Budget": "float",
    "Release Date": "date",
    "MPAA Rating": "string",
    "Running Time min": "integer",
    Distributor: "string",
    Source: "string",
    "Major Genre": "string",
    "Creative Type": "string",
    Director: "string",
    "Rotten Tomatoes Rating": "integer",
    "IMDB Rating": "float",
    "IMDB Votes": "integer",
};

async function csvToArrow(csv) {
    const table = await perspective.default.table(csv);
    const view = await table.view();
    const arrow = new Uint8Array(await view.to_arrow());
    await view.delete();
    await table.delete();
    return arrow;
}

async function csvZipToArrow(zipBytes) {
    const zipReader = new ZipReader(new Uint8ArrayReader(zipBytes));
    const entries = await zipReader.getEntries();
    const csv = await entries[0].getData(new TextWriter());
    await zipReader.close();
    return csvToArrow(csv);
}

async function buildEvictionsArrow(out) {
    const response = await fetch(EVICTIONS_URL);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    fs.writeFileSync(out, await csvToArrow(await response.text()));
}

/**
 * `movies.json` dates are "Jun 12 1998"-style, which the engine's date
 * parser rejects — normalize to ISO. Component-wise, so the local-time
 * `Date` parse cannot shift a day.
 */
function isoDate(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const pad = (x) => String(x).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function buildMoviesArrow(out) {
    const response = await fetch(MOVIES_URL);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const rows = (await response.json()).map((row) => ({
        ...row,
        "Release Date": isoDate(row["Release Date"]),
    }));

    const table = await perspective.default.table(MOVIES_SCHEMA);
    await table.update(rows);
    const view = await table.view();
    const arrow = new Uint8Array(await view.to_arrow());
    await view.delete();
    await table.delete();
    fs.writeFileSync(out, arrow);
}

async function buildNypdArrow(out) {
    const response = await fetch(NYPD_URL);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    fs.writeFileSync(out, await csvZipToArrow(bytes));
}

async function buildOlympicsArrow(out) {
    execSync(`cd ${DATA} && kaggle datasets download -d ${OLYMPICS_DATASET}`, {
        stdio: "inherit",
    });

    const zipPath = path.join(DATA, `${OLYMPICS_DATASET.split("/")[1]}.zip`);
    try {
        const bytes = new Uint8Array(fs.readFileSync(zipPath));
        fs.writeFileSync(out, await csvZipToArrow(bytes));
    } finally {
        fs.rmSync(zipPath, { force: true });
    }
}

async function prepareDataset(name, build) {
    fs.mkdirSync(DATA, { recursive: true });
    const cached = path.join(DATA, name);
    if (!fs.existsSync(cached)) {
        try {
            await build(cached);
            console.log(`Wrote ${name}`);
        } catch (e) {
            fs.rmSync(cached, { force: true });
            console.warn(
                `  ✗ ${name}: ${e.message ?? e} — its Projects will 404.`,
            );

            return;
        }
    }

    fs.mkdirSync(DIST_DATA, { recursive: true });
    fs.copyFileSync(cached, path.join(DIST_DATA, name));
}

function copyRecursive(src, dest) {
    if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            copyRecursive(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

async function run() {
    fs.mkdirSync(OUT, { recursive: true });
    if (!fs.existsSync(path.join(__dirname, "dist/index.js"))) {
        console.error("Run `node build.config.mjs` first — dist/ is missing.");
        process.exit(1);
    }

    await prepareDataset("olympics.arrow", buildOlympicsArrow);
    await prepareDataset("nypdccrb.arrow", buildNypdArrow);
    await prepareDataset("evictions.arrow", buildEvictionsArrow);
    await prepareDataset("movies.arrow", buildMoviesArrow);

    const server = new perspective.WebSocketServer({
        port: PORT,
        assets: [
            path.join(__dirname, "dist"),
            path.join(__dirname, "static"),
            path.join(__dirname, "../node_modules"),
        ],
    });

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/index.html`, {
        waitUntil: "networkidle2",
    });

    const ids = await page.evaluate(async () => {
        while (!window.__projectIds) {
            await new Promise((x) => setTimeout(x, 20));
        }

        return window.__projectIds();
    });

    console.log(`${ids.length} projects × ${THEMES.length} themes`);
    const target = { out: OUT, port: PORT };
    let wrote = 0;
    let failed = 0;
    for (const theme of THEMES) {
        const result = await screenshotTheme(page, ids, theme, target);
        wrote += result.wrote;
        failed += result.failed;
        try {
            await collage(page, ids, theme, target);
        } catch (e) {
            console.warn(`  ✗ ${theme}/${COLLAGE}: ${e.message ?? e}`);
        }
    }

    await browser.close();
    await server.close();
    copyRecursive(OUT, DIST_OUT);
    console.log(`Thumbnails: ${wrote} written, ${failed} failed.`);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
