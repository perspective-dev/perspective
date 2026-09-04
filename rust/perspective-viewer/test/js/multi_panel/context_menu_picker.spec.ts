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

// Panel context-menu behaviors: picker host identity, theme-key styling,
// and the shift+right-click native-menu passthrough.

import { test, expect } from "../helpers.ts";
import { armInvariants, assertCoherent } from "./harness.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

async function openPicker(page, label: string) {
    await page
        .locator("perspective-viewer perspective-viewer-plugin")
        .first()
        .click({ button: "right" });

    const menu = page.locator("perspective-context-menu");
    await menu.waitFor();
    await menu.locator(".context-menu-item", { hasText: label }).click();
}

async function assertPickerSurface(page, tag: string) {
    const picker = page.locator(tag);
    await picker.waitFor();
    await expect(page.locator("perspective-context-menu")).toHaveCount(0);
    await expect(
        picker.locator(".dropdown-group-container").first(),
    ).toBeVisible();

    const style = await picker.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { display: cs.display, padding: cs.padding };
    });

    expect(style).toEqual({ display: "flex", padding: "8px" });
    await picker.evaluate((el: HTMLElement) => el.blur());
    await expect(picker).toHaveCount(0);
}

test.describe("Context menu styling", () => {
    test("submenu items keep the normal foreground under a hovered parent", async ({
        page,
    }) => {
        await page
            .locator("perspective-viewer perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const new_item = menu.locator(".context-menu-item.has-submenu", {
            hasText: "New",
        });

        await new_item.hover();
        const sub_item = new_item.locator(
            ".context-menu-submenu .context-menu-item",
            { hasText: "load-viewer-csv" },
        );

        await sub_item.waitFor();
        const styles = await sub_item.evaluate((el) => {
            const host = (el.getRootNode() as ShadowRoot).host;
            return {
                sub: getComputedStyle(el).color,
                host: getComputedStyle(host).color,
                parent: getComputedStyle(el.closest(".has-submenu")!).color,
            };
        });

        expect(styles.sub).toEqual(styles.host);
        expect(styles.sub).not.toEqual(styles.parent);

        await menu.evaluate((el: HTMLElement) => el.blur());
        await expect(menu).toHaveCount(0);
        await assertCoherent(page);
    });
});

test.describe("Shift+right-click passthrough", () => {
    async function armContextMenuProbe(page) {
        await page.evaluate(() => {
            (window as any).__ctx_prevented = [];
            document.addEventListener("contextmenu", (e) => {
                (window as any).__ctx_prevented.push(e.defaultPrevented);
                e.preventDefault();
            });
        });
    }

    function preventedFlags(page) {
        return page.evaluate(() => (window as any).__ctx_prevented);
    }

    test("on a panel body the native menu passes through", async ({ page }) => {
        await armContextMenuProbe(page);
        const plugin = page
            .locator("perspective-viewer perspective-viewer-plugin")
            .first();

        await plugin.click({ button: "right", modifiers: ["Shift"] });
        expect(await preventedFlags(page)).toEqual([false]);
        await expect(page.locator("perspective-context-menu")).toHaveCount(0);
        await plugin.click({ button: "right" });
        await page.locator("perspective-context-menu").waitFor();
        expect(await preventedFlags(page)).toEqual([false, true]);
        await assertCoherent(page);
    });

    test("on a panel tab the native menu passes through", async ({ page }) => {
        await armContextMenuProbe(page);
        const tab = page.locator("perspective-viewer-tab").first();
        await tab.click({ button: "right", modifiers: ["Shift"] });
        expect(await preventedFlags(page)).toEqual([false]);
        await expect(page.locator("perspective-context-menu")).toHaveCount(0);
        await tab.click({ button: "right" });
        await page.locator("perspective-context-menu").waitFor();
        expect(await preventedFlags(page)).toEqual([false]);
        await assertCoherent(page);
    });
});

test.describe("Context menu Export/Copy pickers", () => {
    test("Export picker opens in its own themed host with the dropdown-menu surface", async ({
        page,
    }) => {
        await openPicker(page, "Export");
        await assertPickerSurface(page, "perspective-export-menu");
        await assertCoherent(page);
    });

    test("Copy picker opens in its own themed host with the dropdown-menu surface", async ({
        page,
    }) => {
        await openPicker(page, "Copy");
        await assertPickerSurface(page, "perspective-copy-menu");
        await assertCoherent(page);
    });
});
