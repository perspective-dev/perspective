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
import { TABLE, restoreWorkspace } from "../derived/helpers.ts";
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

const HELLO = { kind: "Command", key: "hello", label: "Hello" };

const TOP_LEVEL = ".context-menu:not(.context-menu-submenu) > *";

async function declareCommands(page, commands: unknown[]) {
    await page.evaluate((commands) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        window["__CONTEXTS__"] = [];
        window["__COMMANDS__"] = [];
        viewer.setCommandSchema((context) => {
            window["__CONTEXTS__"].push(context);
            return { commands };
        });

        viewer.addEventListener("perspective-command", (event) => {
            window["__COMMANDS__"].push(event.detail);
        });
    }, commands);
}

async function openMenu(page, selector = "perspective-viewer-plugin") {
    await page
        .locator(`perspective-viewer ${selector}`)
        .first()
        .click({ button: "right" });

    const menu = page.locator("perspective-context-menu");
    await menu.waitFor();
    return menu;
}

async function commandCount(page): Promise<number> {
    return await page.evaluate(() => window["__COMMANDS__"].length);
}

test.describe("Context menu custom commands", () => {
    test("a declared command renders above the built-in items", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO]);
        const menu = await openMenu(page);
        const rows = menu.locator(TOP_LEVEL);
        await expect(rows.nth(0)).toHaveText("Hello");
        await expect(rows.nth(1)).toHaveClass(/context-menu-separator/);
        await expect(rows.nth(2)).toContainText("New");
    });

    test("an empty command list adds no separator", async ({ page }) => {
        await declareCommands(page, []);
        const menu = await openMenu(page);
        await expect(menu.locator(".context-menu-separator")).toHaveCount(0);
        await expect(menu.locator(TOP_LEVEL).nth(0)).toContainText("New");
    });

    test("a disabled command dispatches nothing", async ({ page }) => {
        await declareCommands(page, [{ ...HELLO, disabled: true }]);
        const menu = await openMenu(page);
        const item = menu.locator(".context-menu-item", { hasText: "Hello" });
        await expect(item).toHaveClass(/disabled/);
        await item.click({ force: true });
        await expect(menu).toHaveCount(1);
        expect(await commandCount(page)).toBe(0);
    });

    test("a group renders a submenu whose command dispatches its key", async ({
        page,
    }) => {
        await declareCommands(page, [
            {
                kind: "Group",
                key: "trading",
                label: "Trading",
                commands: [{ kind: "Command", key: "buy", label: "Buy" }],
            },
        ]);

        const menu = await openMenu(page);
        const group = menu.locator(".context-menu-item.has-submenu", {
            hasText: "Trading",
        });

        await group.hover();
        await group
            .locator(".context-menu-submenu .context-menu-item", {
                hasText: "Buy",
            })
            .click();

        await expect.poll(() => commandCount(page)).toBe(1);
        const key = await page.evaluate(() => window["__COMMANDS__"][0].key);
        expect(key).toBe("buy");
    });

    test("an empty group is omitted", async ({ page }) => {
        await declareCommands(page, [
            { kind: "Group", key: "empty", label: "Empty", commands: [] },
        ]);

        const menu = await openMenu(page);
        await expect(menu.locator(".context-menu-separator")).toHaveCount(0);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Empty" }),
        ).toHaveCount(0);
    });

    test("picking a command dispatches perspective-command with the schema's context", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO]);
        const menu = await openMenu(page);
        await menu.locator(".context-menu-item", { hasText: "Hello" }).click();
        await expect.poll(() => commandCount(page)).toBe(1);
        await expect(menu).toHaveCount(0);
        const result = await page.evaluate(() => {
            const detail = window["__COMMANDS__"][0];
            return {
                key: detail.key,
                same: detail.context === window["__CONTEXTS__"].at(-1),
            };
        });

        expect(result).toEqual({ key: "hello", same: true });
    });

    test("the context describes the right-clicked panel, not the active one", async ({
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
                one: { table: TABLE, plugin: "Debug", group_by: ["Region"] },
                two: { table: TABLE, plugin: "Debug" },
            },
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setActivePanel("two");
        });

        await declareCommands(page, [HELLO]);
        const box = (await page
            .locator('perspective-viewer perspective-viewer-plugin[slot="one"]')
            .boundingBox())!;

        await openMenu(page, 'perspective-viewer-plugin[slot="one"]');
        const { point, ...context } = await page.evaluate(() => {
            const context = window["__CONTEXTS__"].at(-1);
            return {
                location: context.location,
                panel: context.panel,
                table: context.table,
                plugin: context.plugin,
                group_by: context.view_config.group_by,
                has_hit: "hit" in context,
                point: context.point,
            };
        });

        expect(context).toEqual({
            location: "context-menu",
            panel: "one",
            table: TABLE,
            plugin: "Debug",
            group_by: ["Region"],
            has_hit: false,
        });

        expect(Math.abs(point.x - (box.x + box.width / 2))).toBeLessThan(2);
        expect(Math.abs(point.y - (box.y + box.height / 2))).toBeLessThan(2);
    });

    test("a status bar right-click describes the active panel", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO]);
        await openMenu(page, "#status_bar");
        const context = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return {
                panel: window["__CONTEXTS__"].at(-1).panel,
                active: viewer.getActivePanel(),
            };
        });

        expect(context.panel).toBe(context.active);
    });

    test("the schema survives restore and reset", async ({ page }) => {
        await declareCommands(page, [HELLO]);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ group_by: ["Region"] });
            await viewer.reset(true);
            await viewer.flush();
        });

        const menu = await openMenu(page);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Hello" }),
        ).toBeVisible();
    });

    test("a null schema removes the commands", async ({ page }) => {
        await declareCommands(page, [HELLO]);
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            viewer.setCommandSchema(null);
        });

        const menu = await openMenu(page);
        await expect(menu.locator(".context-menu-separator")).toHaveCount(0);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Hello" }),
        ).toHaveCount(0);
    });

    test("a later schema replaces the earlier one", async ({ page }) => {
        await declareCommands(page, [HELLO]);
        await declareCommands(page, [
            { kind: "Command", key: "bye", label: "Goodbye" },
        ]);

        const menu = await openMenu(page);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Goodbye" }),
        ).toBeVisible();

        await expect(
            menu.locator(".context-menu-item", { hasText: "Hello" }),
        ).toHaveCount(0);
    });

    test("a throwing schema still opens the built-in menu", async ({
        page,
        consoleLogs,
    }) => {
        consoleLogs.expectedLogs.push(
            "error",
            /Ignoring the command schema of the app/,
        );

        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            viewer.setCommandSchema(() => {
                throw new Error("schema failed");
            });
        });

        const menu = await openMenu(page);
        await expect(menu.locator(".context-menu-separator")).toHaveCount(0);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Duplicate" }),
        ).toBeVisible();
    });

    test("an unknown command kind still opens the built-in menu", async ({
        page,
        consoleLogs,
    }) => {
        consoleLogs.expectedLogs.push(
            "error",
            /Ignoring the command schema of the app/,
        );

        await declareCommands(page, [{ kind: "Bogus", key: "x", label: "X" }]);
        const menu = await openMenu(page);
        await expect(menu.locator(".context-menu-separator")).toHaveCount(0);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Duplicate" }),
        ).toBeVisible();
    });

    test("a non-function schema is rejected", async ({ page }) => {
        const message = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            try {
                viewer.setCommandSchema({ commands: [] });
                return "";
            } catch (err) {
                return `${(err as Error).message ?? err}`;
            }
        });

        expect(message).toContain("expects a function");
    });
});
