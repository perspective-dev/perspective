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
import { TABLE } from "../derived/helpers.ts";

const HIT = {
    kind: "cell",
    row: { State: "Texas" },
    column_names: ["State"],
    value: "Texas",
    row_path: [],
    column_path: [],
    config: { filter: [["State", "==", "Texas"]] },
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function loadHitPlugin(page, plugin_commands: unknown[] | null) {
    await page.evaluate(
        async ({ table, hit, plugin_commands }) => {
            const g = window as any;
            g.__HIT_TESTS__ = [];
            g.__EXECUTED__ = [];
            g.__CONTEXTS__ = [];
            g.__COMMANDS__ = [];
            const BasePlugin = customElements.get("perspective-viewer-plugin")!;
            class HitPlugin extends BasePlugin {
                get_static_config() {
                    return {
                        name: "Hit Plugin",
                        select_mode: "select",
                        config_column_names: [],
                    };
                }

                async draw() {
                    this.textContent = "Hit Plugin";
                }

                async update() {}

                async hit_test(x, y) {
                    g.__HIT_TESTS__.push([x, y]);
                    return hit;
                }

                async execute_command(key, context) {
                    g.__EXECUTED__.push({ key, hit: context.hit });
                }
            }

            if (plugin_commands) {
                (HitPlugin.prototype as any).command_schema = () => ({
                    commands: plugin_commands,
                });
            }

            customElements.define("hit-plugin", HitPlugin);
            (customElements.get("perspective-viewer") as any).registerPlugin(
                "hit-plugin",
            );

            const old = document.querySelector("perspective-viewer") as any;
            await old.delete();
            old.remove();
            const viewer = document.createElement("perspective-viewer") as any;
            document.body.append(viewer);
            await viewer.load(g.__TEST_WORKER__);
            await viewer.restore({ table, plugin: "Hit Plugin" });
            await viewer.flush();
            viewer.addEventListener("perspective-command", (event) => {
                g.__COMMANDS__.push(event.detail);
            });
        },
        { table: TABLE, hit: HIT, plugin_commands },
    );
}

async function declareAppCommand(page) {
    await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer") as any;
        viewer.setCommandSchema((context) => {
            window["__CONTEXTS__"].push(context);
            return {
                commands: [{ kind: "Command", key: "hello", label: "Hello" }],
            };
        });
    });
}

async function openMenu(page, selector: string) {
    await page
        .locator(`perspective-viewer ${selector}`)
        .first()
        .click({ button: "right" });

    const menu = page.locator("perspective-context-menu");
    await menu.waitFor();
    return menu;
}

test.describe("Context menu custom commands with a hit-testing plugin", () => {
    test("no schema means the plugin is never hit-tested", async ({ page }) => {
        await loadHitPlugin(page, null);
        await openMenu(page, "regular-layout-frame");
        expect(await page.evaluate(() => window["__HIT_TESTS__"])).toEqual([]);
    });

    test("a body right-click carries the plugin's hit at the click point", async ({
        page,
    }) => {
        await loadHitPlugin(page, null);
        await declareAppCommand(page);
        await openMenu(page, "regular-layout-frame");
        const result = await page.evaluate(() => {
            const context = window["__CONTEXTS__"].at(-1);
            return {
                hit: context.hit,
                point: context.point,
                tested: window["__HIT_TESTS__"],
            };
        });

        expect(result.hit).toEqual(HIT);
        expect(result.tested).toEqual([[result.point.x, result.point.y]]);
    });

    test("a tab right-click carries no hit", async ({ page }) => {
        await loadHitPlugin(page, null);
        await declareAppCommand(page);
        await openMenu(page, "perspective-viewer-tab");
        const result = await page.evaluate(() => ({
            has_hit: "hit" in window["__CONTEXTS__"].at(-1),
            tested: window["__HIT_TESTS__"],
        }));

        expect(result).toEqual({ has_hit: false, tested: [] });
    });

    test("a status bar right-click carries no hit", async ({ page }) => {
        await loadHitPlugin(page, null);
        await declareAppCommand(page);
        await openMenu(page, "#status_bar");
        const result = await page.evaluate(() => ({
            has_hit: "hit" in window["__CONTEXTS__"].at(-1),
            tested: window["__HIT_TESTS__"],
        }));

        expect(result).toEqual({ has_hit: false, tested: [] });
    });

    test("a plugin command runs execute_command and dispatches no event", async ({
        page,
    }) => {
        await loadHitPlugin(page, [
            { kind: "Command", key: "zoom", label: "Reset Zoom" },
        ]);

        const menu = await openMenu(page, "regular-layout-frame");
        await menu
            .locator(".context-menu-item", { hasText: "Reset Zoom" })
            .click();

        await expect
            .poll(() => page.evaluate(() => window["__EXECUTED__"]))
            .toEqual([{ key: "zoom", hit: HIT }]);

        expect(await page.evaluate(() => window["__COMMANDS__"])).toEqual([]);
    });

    test("app commands render above plugin commands", async ({ page }) => {
        await loadHitPlugin(page, [
            { kind: "Command", key: "zoom", label: "Reset Zoom" },
        ]);

        await declareAppCommand(page);
        const menu = await openMenu(page, "regular-layout-frame");
        const rows = menu.locator(
            ".context-menu:not(.context-menu-submenu) > *",
        );

        await expect(rows.nth(0)).toHaveText("Hello");
        await expect(rows.nth(1)).toHaveText("Reset Zoom");
        await expect(rows.nth(2)).toHaveClass(/context-menu-separator/);
    });
});
