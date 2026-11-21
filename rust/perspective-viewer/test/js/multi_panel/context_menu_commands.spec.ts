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

async function declareCommands(
    page,
    commands: unknown[],
    options?: Record<string, unknown>,
) {
    await page.evaluate(
        async ({ commands, options }) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            window["__CONTEXTS__"] = [];
            window["__COMMANDS__"] = [];
            await viewer.setCommandSchema((context) => {
                window["__CONTEXTS__"].push(context);
                return { commands };
            }, options);

            viewer.addEventListener("perspective-command", (event) => {
                window["__COMMANDS__"].push(event.detail);
            });
        },
        { commands, options },
    );
}

const FRAME = {
    start_row: 10,
    start_col: 2,
    paths: ["Sales", "Quantity"],
    column_paths: [["Sales", "Quantity"]],
    data: {
        Sales: [1.5, 2.5],
        Quantity: [3, 4],
        __ID__: [[10], [11]],
        __ROW_PATH__: [[], []],
    },
};

async function queryCommands(
    page,
    location: string,
    refs: unknown[],
    frame: unknown = FRAME,
) {
    return await page.evaluate(
        ({ location, refs, frame }) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const plugin = viewer.querySelector("perspective-viewer-plugin");
            try {
                return {
                    results: viewer.queryCommands(
                        plugin,
                        location,
                        frame,
                        refs,
                    ),
                };
            } catch (err) {
                return { error: `${(err as Error).message ?? err}` };
            }
        },
        { location, refs, frame },
    );
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

async function expectBuiltinOnly(menu) {
    await expect(menu.locator(TOP_LEVEL).nth(0)).toHaveText("Panel Settings");
    await expect(menu.locator(".context-menu-separator")).toHaveCount(1);
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
        await expect(rows.nth(2)).toHaveText("Panel Settings");
        await expect(rows.nth(3)).toHaveClass(/context-menu-separator/);
        await expect(rows.nth(4)).toContainText("New");
    });

    test("an empty command list adds no rows above the built-in items", async ({
        page,
    }) => {
        await declareCommands(page, []);
        const menu = await openMenu(page);
        await expectBuiltinOnly(menu);
        await expect(menu.locator(TOP_LEVEL).nth(2)).toContainText("New");
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

    test("a command's title is its item's tooltip, absent without one", async ({
        page,
    }) => {
        await declareCommands(page, [
            { ...HELLO, title: "Say hello" },
            { kind: "Command", key: "bye", label: "Bye" },
        ]);

        const menu = await openMenu(page);
        const hello = menu.locator(".context-menu-item", { hasText: "Hello" });
        const bye = menu.locator(".context-menu-item", { hasText: "Bye" });
        await expect(hello).toHaveAttribute("title", "Say hello");
        await expect(bye).not.toHaveAttribute("title");
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
        await expectBuiltinOnly(menu);
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
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ settings: true });
            await viewer.flush();
        });

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
        await expectBuiltinOnly(menu);
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
        await expectBuiltinOnly(menu);
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
        await expectBuiltinOnly(menu);
        await expect(
            menu.locator(".context-menu-item", { hasText: "Duplicate" }),
        ).toBeVisible();
    });

    test("a schema scoped without the context menu adds nothing to the menu", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO], { scopes: ["datagrid-row"] });
        const menu = await openMenu(page);
        await expectBuiltinOnly(menu);
        expect(await page.evaluate(() => window["__CONTEXTS__"].length)).toBe(
            0,
        );
    });

    test("an unknown scope rejects", async ({ page }) => {
        const message = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            try {
                await viewer.setCommandSchema(() => ({ commands: [] }), {
                    scopes: ["legend"],
                });

                return "";
            } catch (err) {
                return `${(err as Error).message ?? err}`;
            }
        });

        expect(message).not.toBe("");
    });

    test("queryCommands resolves a cell against the frame without calling the engine", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO], {
            scopes: ["context-menu", "datagrid-cell"],
        });

        const { results } = await queryCommands(page, "datagrid-cell", [
            { y: 11, x: 3 },
        ]);

        expect(results).toHaveLength(1);
        const [{ context, commands }] = results;
        expect(commands).toEqual([HELLO]);
        expect(context.location).toBe("datagrid-cell");
        expect(context.table).toBe(TABLE);
        expect(context.plugin).toBe("Debug");
        expect(typeof context.panel).toBe("string");
        expect(Array.isArray(context.view_config.columns)).toBe(true);
        expect("point" in context).toBe(false);
        expect(context.hit).toEqual({
            kind: "cell",
            y: 11,
            x: 3,
            id: [11],
            row_path: [],
            column_path: [],
            column_names: ["Quantity"],
            value: 4,
            config: { filter: [["Row ID", "==", 11]] },
        });

        expect(context.hit).not.toHaveProperty("row");
    });

    test("queryCommands derives row and column hits from the ref's axes", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO], {
            scopes: ["datagrid-row", "datagrid-cell"],
        });

        const row = await queryCommands(page, "datagrid-row", [{ y: 10 }]);
        expect(row.results[0].context.hit).toMatchObject({
            kind: "row",
            y: 10,
            id: [10],
            column_names: [],
        });

        expect(row.results[0].context.hit).not.toHaveProperty("value");
        const column = await queryCommands(page, "datagrid-cell", [{ x: 2 }]);
        expect(column.results[0].context.hit).toMatchObject({
            kind: "column",
            x: 2,
            column_names: ["Sales"],
        });

        expect(column.results[0].context.hit).not.toHaveProperty("id");
    });

    test("queryCommands adds group and split clauses to the hit filter", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                group_by: ["Region"],
                split_by: ["Category"],
                columns: ["Sales"],
                filter: [["State", "==", "Texas"]],
            });

            await viewer.flush();
        });

        await declareCommands(page, [HELLO], { scopes: ["datagrid-cell"] });
        const { results } = await queryCommands(
            page,
            "datagrid-cell",
            [{ y: 1, x: 0 }],
            {
                start_row: 0,
                start_col: 0,
                paths: ["Furniture|Sales"],
                column_paths: [["Furniture"], ["Sales"]],
                data: {
                    "Furniture|Sales": [100, 20],
                    __ID__: [[], ["Central"]],
                    __ROW_PATH__: [[], ["Central"]],
                },
            },
        );

        expect(results[0].context.hit).toEqual({
            kind: "cell",
            y: 1,
            x: 0,
            id: ["Central"],
            row_path: ["Central"],
            column_path: ["Furniture"],
            column_names: ["Sales"],
            value: 20,
            config: {
                filter: [
                    ["State", "==", "Texas"],
                    ["Region", "==", "Central"],
                    ["Category", "==", "Furniture"],
                ],
            },
        });
    });

    test("queryCommands selects a flat row by the table's index, a grouped row by its path", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO], { scopes: ["datagrid-row"] });
        const { results } = await queryCommands(page, "datagrid-row", [
            { y: 11 },
            { x: 2 },
        ]);

        expect(results[0].context.hit.config).toEqual({
            filter: [["Row ID", "==", 11]],
        });

        expect(results[1].context.hit.config).toEqual({ filter: [] });
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ group_by: ["Region"], columns: ["Sales"] });
            await viewer.flush();
        });

        const grouped = await queryCommands(page, "datagrid-row", [{ y: 1 }], {
            start_row: 0,
            start_col: 0,
            paths: ["Sales"],
            column_paths: [["Sales"]],
            data: {
                Sales: [30, 20],
                __ID__: [[], ["Central"]],
                __ROW_PATH__: [[], ["Central"]],
            },
        });

        expect(grouped.results[0].context.hit.config).toEqual({
            filter: [["Region", "==", "Central"]],
        });
    });

    test("queryCommands carries the panel's expressions in the hit config", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                expressions: { Double: '"Sales" * 2' },
                filter: [["Double", ">", 0]],
                columns: ["Sales"],
            });

            await viewer.flush();
        });

        await declareCommands(page, [HELLO], { scopes: ["datagrid-cell"] });
        const { results } = await queryCommands(page, "datagrid-cell", [
            { y: 11, x: 3 },
        ]);

        expect(results[0].context.hit.config).toEqual({
            filter: [
                ["Double", ">", 0],
                ["Row ID", "==", 11],
            ],
            expressions: { Double: '"Sales" * 2' },
        });
    });

    test("queryCommands rejects an empty ref and a ref outside the frame", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO], { scopes: ["datagrid-cell"] });
        const empty = await queryCommands(page, "datagrid-cell", [{}]);
        expect(empty.error).toBeTruthy();
        const outside = await queryCommands(page, "datagrid-cell", [
            { y: 9, x: 2 },
        ]);

        expect(outside.error).toBeTruthy();
    });

    test("queryCommands returns undefined out of scope without calling the schema", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO]);
        const { results } = await queryCommands(page, "datagrid-row", [
            { y: 10 },
        ]);

        expect(results).toBeUndefined();
        expect(await page.evaluate(() => window["__CONTEXTS__"].length)).toBe(
            0,
        );

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setCommandSchema(null);
        });

        const none = await queryCommands(page, "context-menu", [{ y: 10 }]);
        expect(none.results).toBeUndefined();
    });

    test("queryCommands yields empty commands when the schema throws", async ({
        page,
        consoleLogs,
    }) => {
        consoleLogs.expectedLogs.push(
            "error",
            /Ignoring the command schema of the app/,
        );

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setCommandSchema(
                () => {
                    throw new Error("schema failed");
                },
                { scopes: ["datagrid-row"] },
            );
        });

        const { results } = await queryCommands(page, "datagrid-row", [
            { y: 10 },
            { y: 11 },
        ]);

        expect(results.map((r) => r.commands)).toEqual([[], []]);
    });

    test("invokeCommand dispatches perspective-command with the given context", async ({
        page,
    }) => {
        await declareCommands(page, [HELLO], { scopes: ["datagrid-row"] });
        const result = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const context = { location: "datagrid-row", marker: 42 };
            viewer.invokeCommand("hello", context);
            const detail = window["__COMMANDS__"][0];
            return { key: detail.key, same: detail.context === context };
        });

        expect(result).toEqual({ key: "hello", same: true });
    });

    test("invalidate rejects an unknown panel", async ({ page }) => {
        const message = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            try {
                await viewer.invalidate({ panel: "nope" });
                return "";
            } catch (err) {
                return `${(err as Error).message ?? err}`;
            }
        });

        expect(message).toContain("No panel named");
    });

    test("showCommandMenu offers the commands and dispatches a pick with the context", async ({
        page,
    }) => {
        await declareCommands(page, [], { scopes: ["datagrid-row"] });
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            window["__MENU_CLOSED__"] = false;
            viewer
                .showCommandMenu(
                    { location: "datagrid-row", marker: 7 },
                    [
                        { kind: "Command", key: "buy", label: "Buy" },
                        { kind: "Command", key: "sell", label: "Sell" },
                    ],
                    { x: 200, y: 200 },
                )
                .then(() => {
                    window["__MENU_CLOSED__"] = true;
                });
        });

        const menu = page.locator("perspective-command-menu");
        await menu.waitFor();
        await expect(menu.locator(".context-menu-item")).toHaveCount(2);
        await menu.locator(".context-menu-item", { hasText: "Sell" }).click();
        await expect.poll(() => commandCount(page)).toBe(1);
        const result = await page.evaluate(() => ({
            key: window["__COMMANDS__"][0].key,
            marker: window["__COMMANDS__"][0].context.marker,
            closed: window["__MENU_CLOSED__"],
        }));

        expect(result).toEqual({ key: "sell", marker: 7, closed: true });
        await expect(menu).toHaveCount(0);
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
