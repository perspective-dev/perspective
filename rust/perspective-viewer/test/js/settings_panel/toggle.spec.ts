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

import {
    test,
    expect,
    compareContentsToSnapshot,
    getShadowContents,
} from "../helpers.ts";

const get_contents = getShadowContents;

test.describe("Settings Panel", () => {
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

    test("toggle > opens when settings is true", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.getTable();
            await viewer.restore({ settings: true });
        });

        const contents = await get_contents(page);
        await compareContentsToSnapshot(contents);
    });

    test("toggle > stays closed when settings is false", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.getTable();
            await viewer.restore({ settings: false });
        });

        const contents = await get_contents(page);
        await compareContentsToSnapshot(contents);
    });
});

test.describe("Settings Panel no-op force", () => {
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

    test("toggle > toggleConfig(false) while closed is a no-op", async ({
        page,
    }) => {
        const state = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.getTable();
            await viewer.toggleConfig(false);
            return {
                settings: (await viewer.save()).settings,
                attribute: viewer.hasAttribute("settings"),
            };
        });

        expect(state).toEqual({ settings: false, attribute: false });
        const after = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.toggleConfig();
            return {
                settings: (await viewer.save()).settings,
                attribute: viewer.hasAttribute("settings"),
            };
        });

        expect(after).toEqual({ settings: true, attribute: true });
    });

    test("toggle > toggleConfig(true) while open is a no-op", async ({
        page,
    }) => {
        const state = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.getTable();
            await viewer.toggleConfig(true);
            await viewer.toggleConfig(true);
            return {
                settings: (await viewer.save()).settings,
                attribute: viewer.hasAttribute("settings"),
            };
        });

        expect(state).toEqual({ settings: true, attribute: true });
    });

    test("toggle > restoreWorkspace without `active` leaves settings closed and toggleable", async ({
        page,
    }) => {
        const state = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const table = await viewer.getTable();
            const name = await table.get_name();
            await viewer.restoreWorkspace({
                layout: { type: "tab-layout", tabs: ["p0"], selected: 0 },
                panels: { p0: { table: name, plugin: "Debug" } },
            });

            const before = {
                settings: (await viewer.save()).settings,
                attribute: viewer.hasAttribute("settings"),
            };

            await viewer.toggleConfig();
            return {
                before,
                after: {
                    settings: (await viewer.save()).settings,
                    attribute: viewer.hasAttribute("settings"),
                },
            };
        });

        expect(state.before).toEqual({ settings: false, attribute: false });
        expect(state.after).toEqual({ settings: true, attribute: true });
    });
});
