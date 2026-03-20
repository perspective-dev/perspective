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

import { test, expect, compareContentsToSnapshot } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
    await page.evaluate(async () => {
        await document.querySelector("perspective-viewer").restore({
            plugin: "Debug",
        });
    });
});

test.describe("Memory Leaks", () => {
    // This originally has a timeout of 120000
    test("elements > no leak on repeated element recreation", async ({
        page,
    }) => {
        let viewer = await page.$("perspective-viewer");
        await page.evaluate(async (viewer) => {
            window.__TABLE__ = await viewer.getTable();
            await viewer.reset();
        }, viewer);

        // From a helpful blog
        // https://media-codings.com/articles/automatically-detect-memory-leaks-with-puppeteer
        await page.evaluate(() => window.gc?.());
        const heap1 = await page.evaluate(
            () => performance.memory.usedJSHeapSize,
        );

        for (var i = 0; i < 500; i++) {
            await page.evaluate(async () => {
                const element = document.querySelector("perspective-viewer");
                await element.delete();
                document.body.innerHTML =
                    "<perspective-viewer></perspective-viewer>";

                const new_element =
                    document.querySelector("perspective-viewer");

                await new_element.load(Promise.resolve(window.__TABLE__));
            });
        }

        // TODO this is very generous memory allowance suggests we
        // leak ~0.1% per instance.
        // TODO: Not yet sure how to access window.gc() in Playwright
        await page.evaluate(() => window.gc?.());
        const heap2 = await page.evaluate(
            () => performance.memory.usedJSHeapSize,
        );

        expect((heap2 - heap1) / heap1).toBeLessThan(1);

        const contents = await page.evaluate(async () => {
            const element = document.querySelector("perspective-viewer");
            await element.toggleConfig();
            return element.innerHTML;
        });

        await compareContentsToSnapshot(contents);
    });

    test("views > no leak on repeated group_by changes", async ({ page }) => {
        let viewer = await page.$("perspective-viewer");
        await page.evaluate(async (viewer) => {
            window.__TABLE__ = await viewer.getTable();
            await viewer.reset();
        }, viewer);

        await page.evaluate(() => window.gc?.());
        const heap1 = await page.evaluate(
            () => performance.memory.usedJSHeapSize,
        );

        for (var i = 0; i < 500; i++) {
            await page.evaluate(async (element) => {
                await element.reset();
                let pivots = [
                    "State",
                    "City",
                    "Segment",
                    "Ship Mode",
                    "Region",
                    "Category",
                ];
                let start = Math.floor(Math.random() * pivots.length);
                let length = Math.ceil(Math.random() * (pivots.length - start));
                await element.restore({
                    group_by: pivots.slice(start, length),
                });
            }, viewer);
        }

        await page.evaluate(() => window.gc?.());
        const heap2 = await page.evaluate(
            () => performance.memory.usedJSHeapSize,
        );
        expect((heap2 - heap1) / heap1).toBeLessThan(0.5);

        const contents = await page.evaluate(async (viewer) => {
            await viewer.restore({ group_by: ["State"] });
            await viewer.toggleConfig();
            return viewer.innerHTML;
        }, viewer);

        await compareContentsToSnapshot(contents);
    });

    test("views > no leak on repeated filter changes", async ({ page }) => {
        let viewer = await page.$("perspective-viewer");
        await page.evaluate(async (viewer) => {
            window.__TABLE__ = await viewer.getTable();
            await viewer.reset();
        }, viewer);

        await page.evaluate(() => window.gc?.());
        const heap1 = await page.evaluate(
            () => performance.memory.usedJSHeapSize,
        );

        for (var i = 0; i < 500; i++) {
            await page.evaluate(async (element) => {
                await element.reset();
                await element.restore({
                    filter: [["Sales", ">", Math.random() * 100 + 100]],
                });
            }, viewer);
        }

        await page.evaluate(() => window.gc?.());
        const heap2 = await page.evaluate(
            () => performance.memory.usedJSHeapSize,
        );
        expect((heap2 - heap1) / heap1).toBeLessThan(0.5);

        const contents = await page.evaluate(async (viewer) => {
            await viewer.restore({
                filter: [["Sales", "<", 10]],
            });
            await viewer.toggleConfig();
            return viewer.innerHTML;
        }, viewer);

        await compareContentsToSnapshot(contents);
    });
});
