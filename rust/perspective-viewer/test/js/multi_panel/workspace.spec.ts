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

const TABLE = "load-viewer-csv";

/// A two-panel side-by-side whole-element config.
const SPLIT_CONFIG = {
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
        one: { table: TABLE, title: "One", group_by: ["State"] },
        two: {
            table: TABLE,
            title: "Two",
            columns: ["Sales", "Profit"],
        },
    },
};

/// A two-panel stack with the SECOND tab selected.
const STACK_CONFIG = {
    layout: {
        type: "tab-layout",
        tabs: ["one", "two"],
        selected: 1,
    },
    panels: {
        one: { table: TABLE, title: "One" },
        two: { table: TABLE, title: "Two", group_by: ["Category"] },
    },
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function restore(page, config) {
    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        await viewer.restore(config);
    }, config);
}

async function save(page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return await viewer.save();
    });
}

async function panel_names(page): Promise<string[]> {
    return await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return viewer.getPanelNames();
    });
}

test.describe("Multi-panel restore", () => {
    test("restore a whole-element config with a split layout", async ({
        page,
    }) => {
        await restore(page, SPLIT_CONFIG);
        const names = await panel_names(page);
        expect(names.length).toBe(2);

        const token = await save(page);
        expect(Object.keys(token.panels).length).toBe(2);
        expect(token.layout.type).toBe("split-layout");
        expect(token.layout.children.length).toBe(2);

        // Panel configs round-trip (ids are regenerated, so compare values).
        const configs = Object.values(token.panels) as any[];
        const by_title = Object.fromEntries(configs.map((c) => [c.title, c]));
        expect(by_title["One"].group_by).toEqual(["State"]);
        expect(by_title["Two"].columns).toEqual(["Sales", "Profit"]);
    });

    test("restore a stack honors the selected tab", async ({ page }) => {
        await restore(page, STACK_CONFIG);
        const token = await save(page);
        expect(token.layout.type).toBe("tab-layout");
        expect(token.layout.selected).toBe(1);
        expect(token.layout.tabs.length).toBe(2);
    });

    test("restore(save()) is symmetric", async ({ page }) => {
        await restore(page, SPLIT_CONFIG);
        const one = await save(page);
        await restore(page, one);
        const two = await save(page);

        expect(two.layout.type).toBe(one.layout.type);
        expect(two.layout.children.length).toBe(one.layout.children.length);
        const strip_ids = (token) =>
            Object.values(token.panels).map((c: any) => c.title);
        expect(strip_ids(two).sort()).toEqual(strip_ids(one).sort());
    });

    test("re-restore replaces the panel set", async ({ page }) => {
        await restore(page, SPLIT_CONFIG);
        expect((await panel_names(page)).length).toBe(2);
        await restore(page, STACK_CONFIG);
        expect((await panel_names(page)).length).toBe(2);
        await restore(page, {
            layout: { type: "tab-layout", tabs: ["solo"], selected: 0 },
            panels: { solo: { table: TABLE, title: "Solo" } },
        });
        expect((await panel_names(page)).length).toBe(1);
    });
});

test.describe("Multi-panel API", () => {
    test("addPanel appends a live panel which round-trips its config", async ({
        page,
    }) => {
        const before = await panel_names(page);
        const config = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            const id = await viewer.addPanel({
                table,
                group_by: ["Region"],
                title: "Added",
            });
            // @ts-ignore
            return await viewer.savePanel(id);
        }, TABLE);

        expect((await panel_names(page)).length).toBe(before.length + 1);
        expect(config.group_by).toEqual(["Region"]);
        expect(config.title).toBe("Added");
    });

    test("removePanel disposes a panel; the last panel is protected", async ({
        page,
    }) => {
        await restore(page, SPLIT_CONFIG);
        const names = await panel_names(page);
        expect(names.length).toBe(2);

        await page.evaluate((name) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            viewer.removePanel(name);
        }, names[0]);

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );

        // Removing the last panel is a no-op.
        const last = await panel_names(page);
        await page.evaluate((name) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            viewer.removePanel(name);
        }, last[0]);

        await page.waitForTimeout(100);
        expect((await panel_names(page)).length).toBe(1);
    });

    test("resetPanel resets only the named panel", async ({ page }) => {
        await restore(page, SPLIT_CONFIG);
        const names = await panel_names(page);

        const save_panel = (id) =>
            page.evaluate(async (id) => {
                const viewer = document.querySelector("perspective-viewer")!;
                // @ts-ignore
                return await viewer.savePanel(id);
            }, id);

        // Identify the grouped panel ("One") by config, not insertion order.
        const configs = await Promise.all(names.map(save_panel));
        const target = names[configs.findIndex((c) => c.title === "One")];
        const other = names.find((x) => x !== target);
        const other_before = await save_panel(other);

        await page.evaluate(async (id) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.resetPanel(null, id);
        }, target);

        // The named panel's config resets, the other is untouched.
        const target_after = await save_panel(target);
        expect(target_after.group_by).toEqual([]);
        expect(await save_panel(other)).toEqual(other_before);

        // An unknown panel name rejects.
        const error = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            try {
                // @ts-ignore
                await viewer.resetPanel(null, "no-such-panel");
                return null;
            } catch (e) {
                return e.message ?? String(e);
            }
        });

        expect(error).not.toBeNull();
    });

    test("setActivePanel retargets getActivePanel", async ({ page }) => {
        await restore(page, SPLIT_CONFIG);
        const names = await panel_names(page);
        await page.evaluate((name) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            viewer.setActivePanel(name);
        }, names[1]);

        await page.waitForFunction(
            (name) =>
                // @ts-ignore
                document
                    .querySelector("perspective-viewer")!
                    .getActivePanel() === name,
            names[1],
        );
    });
});

test.describe("Panel context menu", () => {
    test("right-click opens the panel menu; Duplicate adds a panel", async ({
        page,
    }) => {
        await restore(page, SPLIT_CONFIG);
        const viewer = page.locator("perspective-viewer");
        // This harness page registers no plugins, so panels render the
        // built-in `<perspective-viewer-plugin>` (Debug); the context-menu
        // listener accepts a right-click anywhere inside a panel frame.
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        // The menu is a body-mounted `<perspective-context-menu>` portal
        // (like the Copy/Export menus), NOT a viewer descendant.
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await expect(menu.locator(".context-menu-item")).toContainText([
            "New",
            "Duplicate",
            "Reset",
            "Export",
            "Copy",
            "Maximize",
            "Master",
            "Close",
        ]);

        await menu
            .locator(".context-menu-item", { hasText: "Duplicate" })
            .click();
        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 3,
        );
    });

    test("'New' sub-menu lists all tables; selecting one binds a new panel", async ({
        page,
    }) => {
        await restore(page, SPLIT_CONFIG);
        // A second named table on the same client.
        await page.evaluate(async () => {
            // @ts-ignore
            await window.__TEST_WORKER__.table("x,y\n1,2", {
                name: "second-table",
            });
        });

        const viewer = page.locator("perspective-viewer");
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const new_item = menu.locator(".context-menu-item.has-submenu", {
            hasText: "New",
        });

        await new_item.hover();
        const submenu = new_item.locator(".context-menu-submenu");
        // Single client — a flat list of its hosted table names, no headers.
        await expect(submenu.locator(".context-menu-item")).toContainText([
            TABLE,
            "second-table",
        ]);

        await expect(submenu.locator(".context-menu-header")).toHaveCount(0);
        await submenu
            .locator(".context-menu-item", { hasText: "second-table" })
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 3,
        );

        // The new panel is active and bound to the selected table.
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return await viewer.savePanel(viewer.getActivePanel());
        });

        expect(config.table).toBe("second-table");
    });

    test("'New' sub-menu groups tables by client when several are loaded", async ({
        page,
    }) => {
        await restore(page, SPLIT_CONFIG);
        // Load a table from a SECOND client into the active panel, so the
        // element has two loaded clients.
        await page.evaluate(async () => {
            const { default: perspective } = await import(
                "/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
            );

            const worker = await perspective.worker();
            const table = await worker.table("a,b\n3,4", {
                name: "other-client-table",
            });

            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.load(table);
        });

        const viewer = page.locator("perspective-viewer");
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const new_item = menu.locator(".context-menu-item.has-submenu", {
            hasText: "New",
        });

        await new_item.hover();
        const submenu = new_item.locator(".context-menu-submenu");
        // Two clients — a header row per client, tables grouped beneath.
        await expect(submenu.locator(".context-menu-header")).toHaveCount(2);
        await expect(submenu.locator(".context-menu-item")).toContainText([
            TABLE,
            "other-client-table",
        ]);

        // "other-client-table" exists ONLY on the second client, so a
        // successful bind proves the sub-menu targeted the right client.
        await submenu
            .locator(".context-menu-item", { hasText: "other-client-table" })
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 3,
        );

        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return await viewer.savePanel(viewer.getActivePanel());
        });

        expect(config.table).toBe("other-client-table");
    });

    test("Reset only resets the target panel", async ({ page }) => {
        await restore(page, SPLIT_CONFIG);
        const viewer = page.locator("perspective-viewer");
        const plugin = viewer.locator("perspective-viewer-plugin").first();
        const slot = await plugin.getAttribute("slot");

        const save_panel = (id) =>
            page.evaluate(async (id) => {
                const viewer = document.querySelector("perspective-viewer")!;
                // @ts-ignore
                return await viewer.savePanel(id);
            }, id);

        const other = await page.evaluate((slot) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return viewer.getPanelNames().find((x) => x !== slot);
        }, slot);

        const target_before = await save_panel(slot);
        const other_before = await save_panel(other);

        await plugin.click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu.locator(".context-menu-item", { hasText: "Reset" }).click();

        // The right-clicked panel's config resets...
        await page.waitForFunction(
            async ({ slot, before }) => {
                const viewer = document.querySelector("perspective-viewer")!;
                // @ts-ignore
                const config = await viewer.savePanel(slot);
                return JSON.stringify(config) !== before;
            },
            { slot, before: JSON.stringify(target_before) },
        );

        // ...and the other panel's config is untouched.
        const other_after = await save_panel(other);
        expect(other_after).toEqual(other_before);
    });

    test("Close removes the panel via the menu", async ({ page }) => {
        await restore(page, SPLIT_CONFIG);
        const viewer = page.locator("perspective-viewer");
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu.locator(".context-menu-item", { hasText: "Close" }).click();
        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );
    });
});
