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

const HIT_TEST = {
    frame: {
        start_row: 0,
        start_col: 0,
        paths: ["State"],
        column_paths: [["State"]],
        data: { State: ["Texas"], __ID__: [[7]] },
    },
    ref: { y: 0, x: 0 },
};

const HIT = {
    kind: "cell",
    y: 0,
    x: 0,
    id: [7],
    row_path: [],
    column_path: [],
    column_names: ["State"],
    value: "Texas",
    config: { filter: [["Row ID", "==", 7]] },
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function loadHitPlugin(page) {
    await page.evaluate(
        async ({ table, hit }) => {
            const g = window as any;
            g.__HIT_TESTS__ = [];
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
        { table: TABLE, hit: HIT_TEST },
    );
}

async function declareAppCommand(page, options?: Record<string, unknown>) {
    await page.evaluate(async (options) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.setCommandSchema((context) => {
            window["__CONTEXTS__"].push(context);
            return {
                commands: [{ kind: "Command", key: "hello", label: "Hello" }],
            };
        }, options);
    }, options);
}

async function loadCountingPlugin(page) {
    await page.evaluate(async (table) => {
        const g = window as any;
        g.__CONTEXTS__ = [];
        g.__COMMANDS__ = [];
        g.__UPDATES__ = 0;
        g.__UPDATES_BY_PANEL__ = {};
        const BasePlugin = customElements.get("perspective-viewer-plugin")!;
        class CountingPlugin extends BasePlugin {
            get_static_config() {
                return {
                    name: "Counting Plugin",
                    select_mode: "select",
                    config_column_names: [],
                };
            }

            async draw() {
                this.textContent = "Counting Plugin";
            }

            async update() {
                g.__UPDATES__ += 1;
                const panel = this.getAttribute("slot");
                g.__UPDATES_BY_PANEL__[panel] =
                    (g.__UPDATES_BY_PANEL__[panel] ?? 0) + 1;
            }
        }

        customElements.define("counting-plugin", CountingPlugin);
        (customElements.get("perspective-viewer") as any).registerPlugin(
            "counting-plugin",
        );

        const old = document.querySelector("perspective-viewer") as any;
        await old.delete();
        old.remove();
        const viewer = document.createElement("perspective-viewer") as any;
        document.body.append(viewer);
        await viewer.load(g.__TEST_WORKER__);
        await viewer.restore({ table, plugin: "Counting Plugin" });
        await viewer.flush();
    }, TABLE);
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
    test("a body right-click hit-tests the plugin without a schema", async ({
        page,
    }) => {
        await loadHitPlugin(page);
        await openMenu(page, "regular-layout-frame");
        expect(await page.evaluate(() => window["__HIT_TESTS__"].length)).toBe(
            1,
        );
    });

    test("a body right-click carries the plugin's hit at the click point", async ({
        page,
    }) => {
        await loadHitPlugin(page);
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
        await loadHitPlugin(page);
        await declareAppCommand(page);
        await openMenu(page, "perspective-viewer-tab");
        const result = await page.evaluate(() => ({
            has_hit: "hit" in window["__CONTEXTS__"].at(-1),
            tested: window["__HIT_TESTS__"],
        }));

        expect(result).toEqual({ has_hit: false, tested: [] });
    });

    test("a status bar right-click carries no hit", async ({ page }) => {
        await loadHitPlugin(page);
        await declareAppCommand(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ settings: true });
            await viewer.flush();
        });

        await openMenu(page, "#status_bar");
        const result = await page.evaluate(() => ({
            has_hit: "hit" in window["__CONTEXTS__"].at(-1),
            tested: window["__HIT_TESTS__"],
        }));

        expect(result).toEqual({ has_hit: false, tested: [] });
    });

    test("invalidate coalesces one task's calls into one update per panel", async ({
        page,
    }) => {
        await loadCountingPlugin(page);
        await declareAppCommand(page, { scopes: ["datagrid-row"] });
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            window["__UPDATES__"] = 0;
            await Promise.all([
                viewer.invalidate(),
                viewer.invalidate(),
                viewer.invalidate(),
            ]);
        });

        expect(await page.evaluate(() => window["__UPDATES__"])).toBe(1);
    });

    test("invalidate with a panel updates only that panel", async ({
        page,
    }) => {
        await loadCountingPlugin(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.addPanel({ table, plugin: "Counting Plugin" });
            await viewer.flush();
        }, TABLE);

        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const [first, second] = viewer.getPanelNames();
            window["__UPDATES_BY_PANEL__"] = {};
            await viewer.invalidate({ panel: second });
            return {
                first: window["__UPDATES_BY_PANEL__"][first] ?? 0,
                second: window["__UPDATES_BY_PANEL__"][second] ?? 0,
            };
        });

        expect(result).toEqual({ first: 0, second: 1 });
    });

    test("a changed schema or scope updates every panel once", async ({
        page,
    }) => {
        await loadCountingPlugin(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const schema = () => ({ commands: [] });
            window["__UPDATES__"] = 0;
            await viewer.setCommandSchema(schema, { scopes: ["datagrid-row"] });
            await viewer.setCommandSchema(schema, { scopes: ["datagrid-row"] });
            window["__UPDATES_AFTER_SAME__"] = window["__UPDATES__"];

            await viewer.setCommandSchema(schema, {
                scopes: ["datagrid-row", "datagrid-cell"],
            });
        });

        const counts = await page.evaluate(() => ({
            same: window["__UPDATES_AFTER_SAME__"],
            total: window["__UPDATES__"],
        }));

        expect(counts).toEqual({ same: 1, total: 2 });
    });
});
