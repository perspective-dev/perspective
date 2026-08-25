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

import { test, expect, PageView } from "../helpers.ts";

test.describe("Column settings target", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(
            "/rust/perspective-viewer/test/html/superstore-debug.html",
        );
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    test("toggleColumnSettings opens a window column on its Window tab", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                settings: true,
                columns: ["Row ID", "Sales", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });
            await viewer.toggleColumnSettings("w1");
        });

        const sidebar = new PageView(page).columnSettingsSidebar;
        await expect(sidebar.container).toBeVisible();
        expect(await sidebar.getTabs()).toContain("Window");
        await sidebar.openTab("Window");
        await expect(sidebar.nameInput).toBeEnabled();
        await expect(sidebar.nameInput).toHaveValue("w1");
    });

    test("toggleColumnSettings on an unknown column closes the drawer", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            expressions: { expr: "12345" },
            columns: ["Row ID", "expr"],
        });

        const expr =
            await view.settingsPanel.activeColumns.getColumnByName("expr");
        await expr.editBtn.click();
        const sidebar = view.columnSettingsSidebar;
        await expect(sidebar.container).toBeVisible();

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.toggleColumnSettings("no such column");
        });

        await expect(sidebar.container).toBeHidden();
    });
});
