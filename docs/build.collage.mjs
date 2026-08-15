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
import * as path from "node:path";

export const COLLAGE = "collage.png";

/** Ceiling on waiting for the collage's tiles to finish loading. */
const SETTLE_TIMEOUT = 60_000;

const COLLAGE_WIDTH = 1600;
const COLLAGE_ASPECT = 16 / 8;
const COLLAGE_GAP = 2;

const COLLAGE_BG = { light: "#ffffff", dark: "#242526" };

const COLLAGE_SEED = 0x5eed;

function shuffled(items, seed) {
    let state = seed;
    const random = () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }

    return out;
}

function pngSize(file) {
    const fd = fs.openSync(file, "r");
    try {
        const head = Buffer.alloc(24);
        fs.readSync(fd, head, 0, 24, 0);
        return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
    } finally {
        fs.closeSync(fd);
    }
}

function bestFitGrid(count, aspect, width, height) {
    let best;
    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const tileWidth = Math.floor((width - (cols - 1) * COLLAGE_GAP) / cols);

        const tileHeight = Math.round(tileWidth / aspect);
        const contentHeight = rows * tileHeight + (rows - 1) * COLLAGE_GAP;
        if (contentHeight <= height && tileHeight > (best?.tileHeight ?? 0)) {
            best = { cols, rows, tileWidth, tileHeight };
        }
    }

    return (
        best ?? {
            cols: count,
            rows: 1,
            tileWidth: Math.floor(height * aspect),
            tileHeight: height,
        }
    );
}

export async function collage(page, ids, theme, { out, port }) {
    const dir = path.join(out, theme);
    const present = shuffled(
        ids.filter((id) => fs.existsSync(path.join(dir, `${id}.png`))),
        COLLAGE_SEED,
    );

    if (present.length === 0) {
        console.warn(`  ✗ ${theme} collage: no thumbnails to composite.`);
        return;
    }

    const height = Math.round(COLLAGE_WIDTH / COLLAGE_ASPECT);
    const sample = pngSize(path.join(dir, `${present[0]}.png`));
    const { cols, rows, tileWidth, tileHeight } = bestFitGrid(
        present.length,
        sample.width / sample.height,
        COLLAGE_WIDTH,
        height,
    );

    const tiles = present
        .map(
            (id) =>
                `<img src="http://localhost:${port}/projects/${theme}/${id}.png" />`,
        )
        .join("");

    await page.setViewport({ width: COLLAGE_WIDTH, height });
    await page.setContent(
        `<!doctype html><html><head><style>
            html, body { margin: 0; padding: 0; background: ${COLLAGE_BG[theme]}; }
            .collage {
                width: ${COLLAGE_WIDTH}px;
                height: ${height}px;
                display: flex;
                flex-wrap: wrap;
                align-content: center;
                justify-content: center;
                gap: ${COLLAGE_GAP}px;
                overflow: hidden;
            }
            .collage img {
                width: ${tileWidth}px;
                height: ${tileHeight}px;
                /* The tile box shares the screenshots' aspect, so \`cover\`
                   only absorbs the sub-pixel rounding — no visible crop. */
                object-fit: cover;
                display: block;
            }
        </style></head>
        <body><div class="collage">${tiles}</div></body></html>`,
        { waitUntil: "load" },
    );

    const tiles_found = await page.$$eval(".collage img", (x) => x.length);
    if (tiles_found !== present.length) {
        throw new Error(
            `collage page has ${tiles_found} tiles, expected ${present.length}`,
        );
    }

    await page.waitForFunction(
        () =>
            [...document.querySelectorAll(".collage img")].every(
                (x) => x.complete,
            ),
        { timeout: SETTLE_TIMEOUT },
    );

    const broken = await page.$$eval(
        ".collage img",
        (images) => images.filter((x) => x.naturalWidth === 0).length,
    );

    if (broken > 0) {
        throw new Error(`${broken} thumbnail(s) failed to load`);
    }

    fs.writeFileSync(path.join(dir, COLLAGE), await page.screenshot());
    console.log(
        `Collage (${theme}): ${present.length} thumbnails, ${cols}×${rows} ` +
            `grid of ${tileWidth}×${tileHeight} tiles, ` +
            `${COLLAGE_WIDTH}×${height}.`,
    );
}
