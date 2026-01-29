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

import { test, expect } from "@perspective-dev/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/tools/test/src/html/workspace-test.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Context menu", () => {
    test("shows tables in the New Table submenu", async ({ page }) => {
        await page.evaluate(async () => {
            await window.__WORKER__.table("x\n1\n2\n", {
                name: "test_table_1",
            });

            await window.__WORKER__.table("y\n3\n4\n", {
                name: "test_table_2",
            });
        });

        // Right-click on the workspace to open context menu
        const workspace = page.locator("perspective-workspace");
        await workspace.click({
            button: "right",
            position: { x: 100, y: 100 },
        });

        // Wait for the context menu to appear in the shadow DOM
        const shadowHost = page.locator("perspective-workspace");
        const menu = shadowHost.locator(".lm-Menu").first();
        await expect(menu).toBeVisible();

        // Click on "New Table" to open the submenu
        const newTableItem = menu.locator(
            ".lm-Menu-item:has(.lm-Menu-itemLabel:text('New Table'))",
        );
        await newTableItem.hover();

        // Wait for submenu to appear
        const submenu = shadowHost.locator(".lm-Menu").nth(1);
        await expect(submenu).toBeVisible();

        // Get the submenu content with table entries
        const submenuContent = submenu.locator(".lm-Menu-content");

        // Wait for the table items to be populated (they are added asynchronously)
        // We expect at least our two test tables plus the default "superstore" table
        await expect(submenuContent.locator("> .lm-Menu-item")).toHaveCount(3, {
            timeout: 5000,
        });

        const menuItems = submenuContent.locator("> .lm-Menu-item");
        const itemCount = await menuItems.count();

        // Get the labels of the first items (the tables)
        const labels = [];
        for (let i = 0; i < itemCount; i++) {
            const label = await menuItems
                .nth(i)
                .locator(".lm-Menu-itemLabel")
                .textContent();
            labels.push(label);
        }

        // Verify our test tables appear in the menu
        expect(labels).toContain("test_table_1");
        expect(labels).toContain("test_table_2");
        expect(labels).toContain("superstore");
    });

    test("context menu table entries have correct structure", async ({
        page,
    }) => {
        // Create two tables and load the workspace
        await page.evaluate(async () => {
            await window.__WORKER__.table("a\n1\n", { name: "alpha" });
            await window.__WORKER__.table("b\n2\n", { name: "beta" });
        });

        // Right-click on the workspace
        const workspace = page.locator("perspective-workspace");
        await workspace.click({
            button: "right",
            position: { x: 100, y: 100 },
        });

        // Open the "New Table" submenu
        const shadowHost = page.locator("perspective-workspace");
        const menu = shadowHost.locator(".lm-Menu").first();
        await expect(menu).toBeVisible();

        const newTableItem = menu.locator(
            ".lm-Menu-item:has(.lm-Menu-itemLabel:text('New Table'))",
        );
        await newTableItem.hover();

        const submenu = shadowHost.locator(".lm-Menu").nth(1);
        await expect(submenu).toBeVisible();

        // Verify the DOM structure of table entries
        const submenuContent = submenu.locator(".lm-Menu-content");

        // Wait for table items to be populated
        await expect(submenuContent.locator("> .lm-Menu-item")).toHaveCount(3, {
            timeout: 5000,
        });

        const firstItem = submenuContent.locator("> .lm-Menu-item").first();

        // Check that the menu item has the expected Lumino classes
        await expect(firstItem).toHaveClass(/lm-Menu-item/);

        // Check that it contains a label element
        const labelElement = firstItem.locator(".lm-Menu-itemLabel");
        await expect(labelElement).toBeVisible();

        // Verify the label contains one of our table names
        const labelText = await labelElement.textContent();
        expect(["alpha", "beta", "superstore"]).toContain(labelText);
    });
});
