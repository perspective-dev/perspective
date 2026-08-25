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

const VIEWPORT = { width: 800, height: 600 };

const LOAD_TIMEOUT = 180_000;
const STREAMING = (id) => id.startsWith("market-");

async function screenshot(page, id, theme, { out, port }) {
    const file = path.join(out, theme, `${id}.png`);
    if (fs.existsSync(file)) {
        return "skipped";
    }

    await page.goto(`http://localhost:${port}/index.html`, {
        waitUntil: "networkidle2",
    });

    await page.evaluate(async () => {
        while (!window.__loadProject) {
            await new Promise((x) => setTimeout(x, 20));
        }

        globalThis.__PERSPECTIVE_SCREENSHOT__ = true;
    });

    await page.evaluate(() => {
        document.querySelector(".sidebar__collapse")?.click();
    });

    await page.evaluate((project) => window.__loadProject(project), id);
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer");
        while (viewer.getPanelNames().length === 0) {
            await new Promise((x) => setTimeout(x, 50));
        }

        await viewer.restore({ settings: false });
        await viewer.flush();
    });

    if (STREAMING(id)) {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const table = await viewer.getTable();
            let last = -1;
            let stable = 0;
            while (stable < 2) {
                const size = await table.size();
                stable = size === last ? stable + 1 : 0;
                last = size;
                await new Promise((x) => setTimeout(x, 500));
            }

            await viewer.flush();
        });
    }

    const stage = await page.$("perspective-viewer");
    fs.writeFileSync(file, await stage.screenshot());
    return "wrote";
}

export async function screenshotTheme(page, ids, theme, { out, port }) {
    fs.mkdirSync(path.join(out, theme), { recursive: true });
    await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: theme },
    ]);

    await page.setViewport(VIEWPORT);
    let wrote = 0;
    let failed = 0;
    for (const id of ids) {
        let timer;
        try {
            const result = await Promise.race([
                screenshot(page, id, theme, { out, port }),
                new Promise((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error("timed out")),
                        LOAD_TIMEOUT,
                    );
                }),
            ]);

            if (result === "wrote") {
                wrote++;
            }
        } catch (e) {
            failed++;
            console.warn(`  ✗ ${theme}/${id}: ${e.message ?? e}`);
        } finally {
            clearTimeout(timer);
        }
    }

    return { wrote, failed };
}
