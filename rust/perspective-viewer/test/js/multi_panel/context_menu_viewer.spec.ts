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
import { TABLE, restoreWorkspace, saveWorkspace } from "../derived/helpers.ts";
import { armInvariants } from "./harness.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

async function openSettings(page) {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore({ settings: true });
        await viewer.flush();
    });
}

async function twoPanelsSecondActive(page) {
    await restoreWorkspace(page, {
        panels: {
            one: { table: TABLE, plugin: "Debug" },
            two: { table: TABLE, plugin: "Debug", group_by: ["Region"] },
        },
    });

    await openSettings(page);
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.setActivePanel("two");
    });
}

test.describe("Viewer-wide context menu", () => {
    test("a right-click leaves the active panel and offers Panel Settings", async ({
        page,
    }) => {
        await restoreWorkspace(page, {
            layout: {
                type: "split-layout",
                orientation: "horizontal",
                sizes: [0.5, 0.5],
                children: [
                    { type: "tab-layout", tabs: ["one"], selected: 0 },
                    { type: "tab-layout", tabs: ["two"], selected: 0 },
                ],
            },
            panels: {
                one: { table: TABLE, plugin: "Debug" },
                two: { table: TABLE, plugin: "Debug" },
            },
        });

        await openSettings(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setActivePanel("two");
        });

        await page
            .locator('perspective-viewer perspective-viewer-plugin[slot="one"]')
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        expect(
            await page.evaluate(() =>
                (
                    document.querySelector("perspective-viewer") as any
                ).getActivePanel(),
            ),
        ).toBe("two");

        await menu
            .locator(".context-menu-item", { hasText: "Panel Settings" })
            .click();

        await expect
            .poll(async () =>
                page.evaluate(() =>
                    (
                        document.querySelector("perspective-viewer") as any
                    ).getActivePanel(),
                ),
            )
            .toBe("one");
    });

    test("a status bar right-click targets the active panel", async ({
        page,
    }) => {
        await twoPanelsSecondActive(page);
        await page
            .locator("perspective-viewer #status_bar")
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item", { hasText: "Duplicate" })
            .click();

        await expect
            .poll(
                async () =>
                    Object.keys((await saveWorkspace(page)).panels).length,
            )
            .toBe(3);

        const saved = await saveWorkspace(page);
        const copy: any = Object.entries(saved.panels).find(
            ([k]) => k !== "one" && k !== "two",
        )![1];

        expect(copy.group_by).toEqual(["Region"]);
    });

    test("a settings sidebar right-click targets the active panel", async ({
        page,
    }) => {
        await twoPanelsSecondActive(page);
        await page
            .locator("perspective-viewer #settings_panel")
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu.locator(".context-menu-item", { hasText: "Close" }).click();
        await expect
            .poll(async () => Object.keys((await saveWorkspace(page)).panels))
            .toEqual(["one"]);
    });

    test("a right-click on an editable input opens no menu", async ({
        page,
    }) => {
        await openSettings(page);
        await page
            .locator("perspective-viewer #settings_panel")
            .click({ button: "right" });

        await expect(page.locator("perspective-context-menu")).toHaveCount(1);
        await page.keyboard.press("Escape");
        await expect(page.locator("perspective-context-menu")).toHaveCount(0);
        await page.locator("perspective-viewer #debug_tabbar_tab").click();
        const textarea = page.locator(
            "perspective-viewer #debug-panel-editor textarea",
        );

        await textarea.waitFor();
        await textarea.click({ button: "right" });
        await expect(page.locator("perspective-context-menu")).toHaveCount(0);
    });

    test("a right-click inside the open menu does not stack menus", async ({
        page,
    }) => {
        await page
            .locator("perspective-viewer perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item", { hasText: "Duplicate" })
            .click({ button: "right" });

        await expect(page.locator("perspective-context-menu")).toHaveCount(1);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Duplicate" }),
        ).toBeVisible();
    });

    test("a right-click outside every frame targets the active panel", async ({
        page,
    }) => {
        await twoPanelsSecondActive(page);
        const box = (await page
            .locator("perspective-viewer #main_panel_container")
            .boundingBox())!;

        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
            button: "right",
        });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await expect(
            menu.locator(".context-menu-item", { hasText: "Duplicate" }),
        ).toBeVisible();
    });
});
