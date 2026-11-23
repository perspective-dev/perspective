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

// The EMPTY STAGE (zero panels): the chrome a user can still drive before
// any table or workspace is restored — the "invisible panel" settings
// button, the settings sidebar (inert plugin menu + placeholders), the theme
// picker, the stage error, and the "New" table menu.

import { test, expect } from "../helpers.ts";
import { armInvariants } from "./harness.ts";

const TABLE = "load-viewer-csv";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

function panel_names(page): Promise<string[]> {
    return page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return viewer.getPanelNames();
    });
}

/// Remove every panel, emptying the element.
async function empty(page) {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        for (const id of viewer.getPanelNames()) {
            // @ts-ignore
            await viewer.removePanel(id);
        }
    });
}

async function open_empty_settings(page) {
    const button = page.locator("perspective-viewer .psp-empty-settings");
    await button.click();
    await expect(
        page.locator("perspective-viewer #settings_panel"),
    ).toBeVisible();
}

test.describe("Empty stage settings button", () => {
    test("sits where a lone panel's tab settings button sits", async ({
        page,
    }) => {
        const tab_button = page
            .locator("perspective-viewer .psp-tab-settings:not(.psp-empty-settings)")
            .first();
        await expect(tab_button).toBeVisible();
        const before = (await tab_button.boundingBox())!;

        await empty(page);
        const button = page.locator("perspective-viewer .psp-empty-settings");
        await expect(button).toBeVisible();
        const after = (await button.boundingBox())!;

        // Same spot, same size, within subpixel rounding.
        expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);

        // No frame or tab is drawn around it.
        await expect(
            page.locator("perspective-viewer regular-layout-frame"),
        ).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer perspective-viewer-tab"),
        ).toHaveCount(0);
    });

    test("opens the sidebar; the sidebar's close button closes it", async ({
        page,
    }) => {
        await empty(page);
        await open_empty_settings(page);
        await expect(
            page.locator("perspective-viewer .psp-empty-settings"),
        ).toHaveCount(0);

        await page.locator("perspective-viewer #settings_close_button").click();
        await expect(
            page.locator("perspective-viewer #settings_panel"),
        ).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer .psp-empty-settings"),
        ).toBeVisible();
    });

    test("toggleConfig() opens the sidebar at zero panels", async ({
        page,
    }) => {
        await empty(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.toggleConfig(true);
        });

        await expect(
            page.locator("perspective-viewer #settings_panel"),
        ).toBeVisible();
    });

    test("is replaced by the first panel's tab without remounting the layout", async ({
        page,
    }) => {
        await empty(page);
        await expect(
            page.locator("perspective-viewer .psp-empty-settings"),
        ).toBeVisible();

        const same_layout = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            const layout = viewer.shadowRoot!.querySelector("regular-layout");
            // @ts-ignore
            await viewer.restore({ table });
            return viewer.shadowRoot!.querySelector("regular-layout") === layout;
        }, TABLE);

        expect(same_layout).toBe(true);
        await expect(
            page.locator("perspective-viewer .psp-empty-settings"),
        ).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer .psp-tab-settings").first(),
        ).toBeVisible();
    });
});

test.describe("Empty stage settings sidebar", () => {
    test("Query, Plugin and Debug tabs show the placeholder", async ({
        page,
    }) => {
        await empty(page);
        await open_empty_settings(page);
        const placeholder = page.locator(
            "perspective-viewer #settings_panel .psp-empty-placeholder",
        );

        for (const tab of [
            "#query_tabbar_tab",
            "#plugin_tabbar_tab",
            "#debug_tabbar_tab",
        ]) {
            await page.locator(`perspective-viewer ${tab}`).click();
            await expect(placeholder).toBeVisible();
            const content = await placeholder.evaluate(
                (el) => getComputedStyle(el, "::before").content,
            );
            expect(content).toBe('"No table loaded"');
        }

        await expect(
            page.locator("perspective-viewer #plugin-tab"),
        ).toHaveCount(0);
    });

    test("plugin menu lists every plugin, is inert, and the first panel draws the default", async ({
        page,
    }) => {
        await empty(page);
        await open_empty_settings(page);

        const selected = page.locator(
            "perspective-viewer #plugin_selector_container > .plugin-select-item",
        );
        const default_plugin = await selected.getAttribute("data-plugin");
        expect(default_plugin).toBeTruthy();

        await selected.click();
        const options = page.locator(
            "perspective-viewer .plugin-selector-options .plugin-select-item",
        );
        const names = await options.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-plugin")),
        );
        expect(names.length).toBeGreaterThan(0);
        expect(names).not.toContain(default_plugin);

        // Pick a non-default plugin: the selector shows it, but nothing
        // else changes — no panel, no error, still the placeholder.
        const pick = names[0]!;
        await options.first().click();
        await expect(selected).toHaveAttribute("data-plugin", pick);
        expect(await panel_names(page)).toEqual([]);
        await expect(
            page.locator("perspective-viewer #status_reconnect.errored"),
        ).toHaveCount(0);

        // The pick does not reach the first panel.
        const plugin = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.restore({ table });
            // @ts-ignore
            return (await viewer.save()).plugin;
        }, TABLE);

        expect(plugin).toBe(default_plugin);
    });

    test("the column settings drawer never mounts", async ({ page }) => {
        await empty(page);
        await open_empty_settings(page);
        await expect(
            page.locator("perspective-viewer #modal_panel"),
        ).toHaveCount(0);
    });
});

test.describe("Empty stage theme", () => {
    test("the status bar theme picker sets the theme the first panel adopts", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.resetThemes(["Pro Light", "Pro Dark"]);
        });

        await empty(page);
        const select = page.locator("perspective-viewer #theme_selector");
        await expect(select).toBeVisible();

        // Data-bound actions are absent on the empty stage.
        for (const id of ["#reset", "#export", "#copy"]) {
            await expect(
                page.locator(`perspective-viewer #status_bar ${id}`),
            ).toHaveCount(0);
        }

        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            const select = viewer.shadowRoot!.querySelector(
                "#theme_selector",
            ) as HTMLSelectElement;
            select.value = "Pro Dark";
            select.dispatchEvent(new Event("input", { bubbles: true }));
        });

        await page.waitForFunction(
            () =>
                document
                    .querySelector("perspective-viewer")!
                    .getAttribute("theme") === "Pro Dark",
        );

        const theme = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.restore({ table });
            // @ts-ignore
            return (await viewer.save()).theme;
        }, TABLE);

        expect(theme).toBe("Pro Dark");
    });
});

test.describe("Empty stage errors", () => {
    async function failing_restore(page, options?: object) {
        return await page.evaluate(async (options) => {
            const viewer = document.querySelector("perspective-viewer")!;
            try {
                // @ts-ignore
                await viewer.restore({}, options);
                return "";
            } catch (e) {
                return String(e);
            }
        }, options);
    }

    test("a rejected restore at zero panels shows on the status indicator", async ({
        page,
    }) => {
        await empty(page);
        const message = await failing_restore(page);
        expect(message).toContain("table");

        await expect(
            page.locator("perspective-viewer #status_reconnect.errored"),
        ).toBeVisible();
        await expect(
            page.locator("perspective-viewer .error-dialog-message"),
        ).toContainText("table");
    });

    test("resetError() clears it", async ({ page }) => {
        await empty(page);
        await failing_restore(page);
        await expect(
            page.locator("perspective-viewer #status_reconnect.errored"),
        ).toBeVisible();

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.resetError();
        });

        await expect(
            page.locator("perspective-viewer #status_reconnect.errored"),
        ).toHaveCount(0);
    });

    test("clicking the indicator dismisses it", async ({ page }) => {
        await empty(page);
        await failing_restore(page);
        const indicator = page.locator(
            "perspective-viewer #status_reconnect.errored",
        );
        await expect(indicator).toBeVisible();
        await indicator.click();
        await expect(indicator).toHaveCount(0);
        expect(await panel_names(page)).toEqual([]);
    });

    test("suppress_errors keeps it off the indicator", async ({ page }) => {
        await empty(page);
        const message = await failing_restore(page, { suppress_errors: true });
        expect(message).toContain("table");
        await expect(
            page.locator("perspective-viewer #status_reconnect.errored"),
        ).toHaveCount(0);
    });

    test("creating a panel clears it", async ({ page }) => {
        await empty(page);
        await failing_restore(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.restore({ table });
        }, TABLE);

        await expect(
            page.locator("perspective-viewer #status_reconnect.errored"),
        ).toHaveCount(0);
    });
});

test.describe("Empty stage table menu", () => {
    test("the New menu opens, closes, and creates the first panel", async ({
        page,
    }) => {
        await empty(page);
        const viewer = page.locator("perspective-viewer");
        await viewer.locator("#status_bar #new_panel").click();
        const menu = page.locator("perspective-new-panel-menu");
        await menu.waitFor();
        await menu.evaluate((el: HTMLElement) => el.blur());
        await expect(menu).toHaveCount(0);
        expect(await panel_names(page)).toEqual([]);

        await viewer.locator("#status_bar #new_panel").click();
        await menu.waitFor();
        await menu
            .locator(".dropdown-menu-item", { hasText: TABLE })
            .first()
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );
    });
});

test.describe("Boots empty: table menu", () => {
    test("load(client) at zero panels shows the New menu", async ({
        page,
    }) => {
        await page.goto("/rust/perspective-viewer/test/html/blank.html");
        await page.waitForFunction(
            () =>
                customElements.get("perspective-viewer") !== undefined &&
                window["WORKER"] !== undefined,
        );

        const new_button = page.locator(
            "perspective-viewer #status_bar #new_panel",
        );
        await expect(new_button).toHaveCount(0);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            const worker = await window["WORKER"];
            await worker.table("x\n1", { name: "empty_stage_table" });
            // @ts-ignore
            await viewer.load(worker);
        });

        await expect(new_button).toBeVisible();
        await new_button.click();
        const menu = page.locator("perspective-new-panel-menu");
        await menu.waitFor();
        await expect(
            menu.locator(".dropdown-menu-item", {
                hasText: "empty_stage_table",
            }),
        ).toBeVisible();
    });
});
