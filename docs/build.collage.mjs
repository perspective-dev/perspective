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

const COLLAGE_SEED = 0xdeadbeef;

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

/// Pick the column count whose natural tile aspect lands closest to filling the
/// frame, then stretch the rows so the grid covers it exactly.
function bestFitGrid(count, aspect, width, height) {
    let best;
    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const tileWidth = Math.floor((width - (cols - 1) * COLLAGE_GAP) / cols);
        if (tileWidth <= 0) {
            break;
        }

        const natural =
            rows * Math.round(tileWidth / aspect) + (rows - 1) * COLLAGE_GAP;

        const drift = Math.abs(natural - height);
        if (best === undefined || drift < best.drift) {
            best = { cols, rows, tileWidth, drift };
        }
    }

    const { cols, rows, tileWidth } = best;
    return {
        cols,
        rows,
        tileWidth,
        tileHeight: Math.ceil((height - (rows - 1) * COLLAGE_GAP) / rows),
    };
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

    const cells = cols * rows;
    const tiles = Array.from(
        { length: cells },
        (_, i) =>
            `<img src="http://localhost:${port}/projects/${theme}/${present[i % present.length]}.png" />`,
    ).join("");

    await page.setViewport({ width: COLLAGE_WIDTH, height });
    await page.setContent(
        `<!doctype html><html><head><style>
            html, body { margin: 0; padding: 0; background: ${COLLAGE_BG[theme]}; }
            .collage {
                width: ${COLLAGE_WIDTH}px;
                height: ${height}px;
                display: grid;
                grid-template-columns: repeat(${cols}, 1fr);
                grid-auto-rows: ${tileHeight}px;
                gap: ${COLLAGE_GAP}px;
                overflow: hidden;
            }
            .collage img {
                width: 100%;
                height: ${tileHeight}px;
                /* Rows are stretched to fill the frame exactly, so \`cover\`
                   absorbs the difference from the screenshots' own aspect. */
                object-fit: cover;
                display: block;
            }
        </style></head>
        <body><div class="collage">${tiles}</div></body></html>`,
        { waitUntil: "load" },
    );

    const tiles_found = await page.$$eval(".collage img", (x) => x.length);
    if (tiles_found !== cells) {
        throw new Error(
            `collage page has ${tiles_found} tiles, expected ${cells}`,
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
        `Collage (${theme}): ${present.length} thumbnails in ${cells} cells, ` +
            `${cols}×${rows} grid of ${tileWidth}×${tileHeight} tiles, ` +
            `${COLLAGE_WIDTH}×${height}.`,
    );
}
