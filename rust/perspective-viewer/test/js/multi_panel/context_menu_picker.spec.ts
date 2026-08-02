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
//
// The context menu's Export/Copy format pickers swap in at the SAME vdom
// position as the menu's `PortalModal`, whose host element and adopted
// surface sheet are create-time-only. Unkeyed, Yew reused the menu's
// component: the picker rendered inside the recycled
// `<perspective-context-menu>` host with the context-menu sheet instead of
// its own `<perspective-export-menu>`/`<perspective-copy-menu>` host with
// the dropdown-menu sheet. The stages are now keyed by host tag; these
// specs pin the host identity and its surface-sheet `:host` chrome.

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

    // The picker must have its OWN host — the menu stage's host is gone.
    await expect(page.locator("perspective-context-menu")).toHaveCount(0);
    await expect(
        picker.locator(".dropdown-group-container").first(),
    ).toBeVisible();

    // `:host` chrome only the dropdown-menu surface sheet provides — without
    // it the host computes `display: inline` / `padding: 0px`.
    const style = await picker.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { display: cs.display, padding: cs.padding };
    });

    expect(style).toEqual({ display: "flex", padding: "8px" });

    // Blur-dismissal still ends the menu session on the fresh host.
    await picker.evaluate((el: HTMLElement) => el.blur());
    await expect(picker).toHaveCount(0);
}

test.describe("Context menu styling", () => {
    // The menu's item hover must use the SAME theme keys as the Copy/Export
    // pickers it spawns: the inverted `--psp--color`/`--psp--background-color`
    // pair, which land on the host as computed `color`/`background-color` via
    // the shared modal selector groups.
    test("item hover uses the dropdown-menu inverted theme keys", async ({
        page,
    }) => {
        await page
            .locator("perspective-viewer perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const item = menu.locator(".context-menu-item", {
            hasText: "Duplicate",
        });

        await item.hover();
        const styles = await item.evaluate((el) => {
            const host = (el.getRootNode() as ShadowRoot).host;
            const item_style = getComputedStyle(el);
            const host_style = getComputedStyle(host);
            return {
                item: {
                    background: item_style.backgroundColor,
                    color: item_style.color,
                },
                host: {
                    background: host_style.backgroundColor,
                    color: host_style.color,
                },
            };
        });

        expect(styles.item.background).toEqual(styles.host.color);
        expect(styles.item.color).toEqual(styles.host.background);

        await menu.evaluate((el: HTMLElement) => el.blur());
        await expect(menu).toHaveCount(0);
        await assertCoherent(page);
    });

    // The submenu flyout is a CHILD of its hovered (inverted) parent item —
    // un-hovered submenu rows must show the normal foreground, not the
    // parent's inherited inverted one (which matches the flyout's own
    // background).
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
    // Record whether the viewer suppressed the native menu. Our own
    // `preventDefault()` runs AFTER the flag is read and only keeps headed
    // runs from opening a real browser menu.
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

        // Control: the unmodified right-click still opens the panel menu.
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

        // Control: unmodified right-click opens the panel menu. The tab's
        // handler `stopPropagation()`s, so the document probe records
        // nothing for it.
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
