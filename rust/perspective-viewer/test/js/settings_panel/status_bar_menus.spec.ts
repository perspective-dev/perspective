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

import { test, expect } from "../helpers.ts";

test.describe("Status bar export and copy menus", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/rust/perspective-viewer/test/html/superstore.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }

            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ plugin: "Debug", settings: true });
            await viewer.flush();
        });
    });

    test("export opens on click, lists compressed arrow formats, closes on Escape", async ({
        page,
    }) => {
        const viewer = page.locator("perspective-viewer");
        await viewer.locator("#status_bar #export").click();
        const menu = page.locator("perspective-export-menu");
        await expect(menu).toBeVisible();
        await expect(menu.locator("input")).toHaveValue("untitled");
        const items = await menu.locator("code").allTextContents();
        expect(items).toEqual(
            expect.arrayContaining([
                "untitled.arrow",
                "untitled.lz4.arrow",
                "untitled.zstd.arrow",
                "untitled.all.lz4.arrow",
                "untitled.all.zstd.arrow",
            ]),
        );

        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
    });

    test("copy opens on click and closes on an outside click", async ({
        page,
    }) => {
        const viewer = page.locator("perspective-viewer");
        await viewer.locator("#status_bar #copy").click();
        const menu = page.locator("perspective-copy-menu");
        await expect(menu).toBeVisible();
        expect(await menu.locator("code").count()).toBeGreaterThan(0);
        await page.mouse.click(5, 5);
        await expect(menu).toHaveCount(0);
    });

    test("the opening click leaves the export menu focused, and blur() dismisses it", async ({
        page,
    }) => {
        const viewer = page.locator("perspective-viewer");
        await viewer.locator("#status_bar #export").click();
        const menu = page.locator("perspective-export-menu");
        await expect(menu).toBeVisible();
        const focus = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            const host = viewer.querySelector("perspective-export-menu")!;
            return {
                open: host.matches(":popover-open"),
                focused: document.activeElement === host,
            };
        });

        expect(focus).toEqual({ open: true, focused: true });
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            (viewer.querySelector("perspective-export-menu") as any).blur();
        });

        await expect(menu).toHaveCount(0);
    });

    test("export and copy still open after the New menu was used", async ({
        page,
    }) => {
        const viewer = page.locator("perspective-viewer");
        await viewer.locator("#status_bar #new_panel").click();
        await expect(page.locator("perspective-new-panel-menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await viewer.locator("#status_bar #copy").click();
        await expect(page.locator("perspective-copy-menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await viewer.locator("#status_bar #export").click();
        await expect(page.locator("perspective-export-menu")).toBeVisible();
    });
});
