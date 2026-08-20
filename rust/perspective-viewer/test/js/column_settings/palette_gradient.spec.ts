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

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-debug.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function columnsConfig(view: PageView): Promise<Record<string, any>> {
    const config = (await view.save()) as any;
    return config.columns_config ?? {};
}

function parseStops(css: string): Array<[string, number]> {
    expect(css).toMatch(/^linear-gradient\(to right, /);
    return [...css.matchAll(/(#[0-9a-f]{6}) ([\d.]+)%/g)].map((m) => [
        m[1],
        parseFloat(m[2]) / 100,
    ]);
}

function parseColors(css: string): string[] {
    expect(css).toMatch(/^linear-gradient\(to right, /);
    expect(css).not.toContain("%");
    return [...css.matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0]);
}

async function pluginColumnsConfig(
    view: PageView,
): Promise<Record<string, any>> {
    return await view.page.evaluate(() => {
        const plugin = document.querySelector(
            "perspective-viewer-debug-styled",
        ) as any;
        return plugin?._restored_columns_config ?? {};
    });
}

function field(view: PageView, key: string) {
    return view.columnSettingsSidebar.container.locator(
        "fieldset.style-control",
        { has: view.page.locator(`#${key}-label`) },
    );
}

function stopsField(view: PageView, key: string) {
    return field(view, key).locator(".gradient-stops-selector");
}

async function openStyleTab(view: PageView, column: string) {
    await view.restore({
        settings: true,
        plugin: "Debug Styled",
        columns: [column],
    });

    const col = await view.settingsPanel.activeColumns.getColumnByName(column);
    await view.assureColumnSettingsOpen(col);
    await view.columnSettingsSidebar.container.waitFor({ state: "visible" });
}

test.describe("GradientStops control", () => {
    test("renders declared defaults and does not serialize them", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const selector = stopsField(view, "gradient");

        await expect(selector).toBeVisible();
        await expect(selector.locator(".gradient-stop-handle")).toHaveCount(2);
        expect((await columnsConfig(view))["Sales"]?.gradient).toBeUndefined();
    });

    test("double-click inserts a sampled stop; removing it strips back to default", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const selector = stopsField(view, "gradient");

        const bar = selector.locator(".gradient-stops-bar");
        const box = (await bar.boundingBox())!;
        await bar.dblclick({ position: { x: box.width / 2, y: 4 } });

        const handles = selector.locator(".gradient-stop-handle");
        await expect(handles).toHaveCount(3);

        const stops = parseStops(
            (await columnsConfig(view))["Sales"]?.gradient,
        );
        expect(stops).toHaveLength(3);
        const offsets = stops.map(([, offset]) => offset);
        expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
        expect(offsets[1]).toBeGreaterThan(0.35);
        expect(offsets[1]).toBeLessThan(0.65);

        const middle = handles.nth(1);
        await middle.hover();
        await middle.locator(".gradient-stop-remove").click();
        await expect(handles).toHaveCount(2);
        expect((await columnsConfig(view))["Sales"]?.gradient).toBeUndefined();
    });

    test("stop color edits serialize the canonical string and reset-to-default strips", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const selector = stopsField(view, "gradient");

        await selector
            .locator(".gradient-stop-handle input[type=color]")
            .first()
            .fill("#00ff00");

        expect((await columnsConfig(view))["Sales"]?.gradient).toBe(
            "linear-gradient(to right, #00ff00 0%, #ff471e 100%)",
        );

        await selector.locator("span.reset-default-style").click();
        expect((await columnsConfig(view))["Sales"]?.gradient).toBeUndefined();
    });

    test("dragging a stop emits once with a rounded, sorted offset", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const selector = stopsField(view, "gradient");

        const bar = selector.locator(".gradient-stops-bar");
        const box = (await bar.boundingBox())!;
        const grip = selector.locator(".gradient-stop-grip").first();
        const gripBox = (await grip.boundingBox())!;

        await page.mouse.move(
            gripBox.x + gripBox.width / 2,
            gripBox.y + gripBox.height / 2,
        );

        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 4, box.y + 4, { steps: 4 });
        await page.mouse.up();

        const css = (await columnsConfig(view))["Sales"]?.gradient;
        const stops = parseStops(css);
        expect(stops).toHaveLength(2);
        expect(stops[0][1]).toBeGreaterThan(0.15);
        expect(stops[0][1]).toBeLessThan(0.35);

        expect(css).toMatch(/#[0-9a-f]{6} \d+(\.\d)?%, #ff471e 100%\)$/);
    });

    test("double-clicking a grip equalizes the stop between its neighbors", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");
        await view.restore({
            columns_config: {
                Sales: {
                    gradient:
                        "linear-gradient(to right, #111111 0%, #222222 10%, #333333 100%)",
                },
            },
        } as any);

        const selector = stopsField(view, "gradient");
        await selector.locator(".gradient-stop-grip").nth(1).dblclick();

        expect((await columnsConfig(view))["Sales"]?.gradient).toBe(
            "linear-gradient(to right, #111111 0%, #222222 50%, #333333 100%)",
        );
    });

    test("restore() accepts any CSS form and drives the widget; save() is canonical", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        await view.restore({
            columns_config: {
                Sales: {
                    gradient:
                        "linear-gradient(#111, RGB(34, 34, 34), #333333 100%)",
                },
            },
        } as any);

        const selector = stopsField(view, "gradient");

        await expect(selector.locator(".gradient-stop-handle")).toHaveCount(3);
        await expect(
            selector.locator(".gradient-stop-handle input[type=color]").nth(1),
        ).toHaveValue("#222222");

        expect((await columnsConfig(view))["Sales"]?.gradient).toBe(
            "linear-gradient(to right, #111111 0%, #222222 50%, #333333 100%)",
        );

        expect((await pluginColumnsConfig(view))["Sales"]?.gradient).toBe(
            "linear-gradient(to right, #111111 0%, #222222 50%, #333333 100%)",
        );
    });

    test("a malformed gradient rejects restore()", async ({ page }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const error = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            try {
                await viewer.restore({
                    columns_config: {
                        Sales: { gradient: "linear-gradient(red, blue)" },
                    },
                } as any);
                return null;
            } catch (e) {
                return String(e);
            }
        });

        expect(error).toContain("gradient");
        expect((await columnsConfig(view))["Sales"]?.gradient).toBeUndefined();
    });
});

test.describe("Restricted GradientStops (sign-split)", () => {
    test("renders two fixed stops: inert grips, locks for remove, no insertion", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const selector = stopsField(view, "fg_colors");
        await expect(selector).toBeVisible();
        await expect(selector.locator(".gradient-stop-handle")).toHaveCount(2);

        const grips = selector.locator(".gradient-stop-grip");
        await expect(grips).toHaveCount(2);
        await expect(grips.first()).toHaveClass(/disabled/);
        await expect(grips.nth(1)).toHaveClass(/disabled/);
        const locks = selector.locator(".gradient-stop-lock");
        await expect(locks).toHaveCount(2);
        await expect(selector.locator(".gradient-stop-remove")).toHaveCount(0);
        await expect(selector.locator(".color-label")).toHaveCount(0);

        await locks.first().click();
        await expect(selector.locator(".gradient-stop-handle")).toHaveCount(2);

        const bar = selector.locator(".gradient-stops-bar");
        const box = (await bar.boundingBox())!;
        const gripBox = (await grips.first().boundingBox())!;
        await page.mouse.move(
            gripBox.x + gripBox.width / 2,
            gripBox.y + gripBox.height / 2,
        );

        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 4 });
        await page.mouse.up();
        expect((await columnsConfig(view))["Sales"]?.fg_colors).toBeUndefined();

        await bar.dblclick({ position: { x: box.width / 2, y: 4 } });
        await expect(selector.locator(".gradient-stop-handle")).toHaveCount(2);
        expect((await columnsConfig(view))["Sales"]?.fg_colors).toBeUndefined();
    });

    test("color edits emit the string with verbatim 0/100% positions, first stop negative", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const selector = stopsField(view, "fg_colors");
        await selector
            .locator(".gradient-stop-handle input[type=color]")
            .first()
            .fill("#00ff00");

        expect((await columnsConfig(view))["Sales"]?.fg_colors).toBe(
            "linear-gradient(to right, #00ff00 0%, #2771a8 100%)",
        );

        await selector.locator("span.reset-default-style").click();
        expect((await columnsConfig(view))["Sales"]?.fg_colors).toBeUndefined();
    });

    test("Load fits a longer named gradient to the pair: end colors at 0/100%", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.page.addStyleTag({
            content: `perspective-viewer {
                --psp-user--gradient-1: linear-gradient(#111111, #222222, #333333);
            }`,
        });

        await openStyleTab(view, "Sales");
        const controls = field(view, "fg_colors").locator(
            ".named-value-controls",
        );
        await controls.locator("select").selectOption("1");

        expect((await columnsConfig(view))["Sales"]?.fg_colors).toBe(
            "linear-gradient(to right, #111111 0%, #333333 100%)",
        );

        const selector = stopsField(view, "fg_colors");
        await expect(selector.locator(".gradient-stop-handle")).toHaveCount(2);
        await expect(selector.locator(".gradient-stop-lock")).toHaveCount(2);
    });

    test("an over-length restored value renders fully and is prunable", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");
        await view.restore({
            columns_config: {
                Sales: {
                    fg_colors:
                        "linear-gradient(to right, #111111 0%, #222222 50%, #333333 100%)",
                },
            },
        } as any);

        const selector = stopsField(view, "fg_colors");
        const handles = selector.locator(".gradient-stop-handle");
        await expect(handles).toHaveCount(3);
        await expect(
            selector.locator(".gradient-stop-grip.disabled"),
        ).toHaveCount(3);

        const middle = handles.nth(1);
        await expect(middle.locator(".gradient-stop-remove")).not.toHaveClass(
            /disabled/,
        );
        await middle.locator(".gradient-stop-remove").click();
        await expect(handles).toHaveCount(2);

        await expect(selector.locator(".gradient-stop-remove")).toHaveCount(0);
        await expect(selector.locator(".gradient-stop-lock")).toHaveCount(2);
    });
});

test.describe("Palette control", () => {
    async function enableSeriesMode(view: PageView) {
        const sidebar = view.columnSettingsSidebar.container;
        const modeField = sidebar.locator("fieldset.style-control", {
            has: view.page.locator("#string_color_mode-label"),
        });

        await modeField.locator("select").selectOption("series");
        await expect(sidebar.locator(".palette-selector")).toBeVisible();
    }

    test("replaces the single color picker in series mode", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "State");

        const sidebar = view.columnSettingsSidebar.container;
        await expect(sidebar.locator(".palette-selector")).toHaveCount(0);
        await enableSeriesMode(view);
        await expect(sidebar.locator(".palette-swatch")).toHaveCount(3);

        const config = (await columnsConfig(view))["State"];
        expect(config.string_color_mode).toBe("series");
        expect(config.palette).toBeUndefined();
    });

    test("add / edit / remove emit whole-list strings; reset strips", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "State");
        await enableSeriesMode(view);

        const sidebar = view.columnSettingsSidebar.container;
        const swatches = sidebar.locator(".palette-swatch");

        await sidebar.locator(".palette-add").click();
        await expect(swatches).toHaveCount(4);
        expect((await columnsConfig(view))["State"]?.palette).toBe(
            "linear-gradient(to right, #2771a8, #8b86ff, #ff471e, #ff471e)",
        );

        const added = swatches.nth(3).locator("input[type=color]");
        await expect(added).toBeFocused();
        await added.fill("#0000ff");
        await expect(swatches).toHaveCount(4);
        expect((await columnsConfig(view))["State"]?.palette).toBe(
            "linear-gradient(to right, #2771a8, #8b86ff, #ff471e, #0000ff)",
        );

        await swatches.nth(0).locator("input[type=color]").fill("#00ff00");
        expect(
            parseColors((await columnsConfig(view))["State"]?.palette)[0],
        ).toBe("#00ff00");

        await swatches.nth(0).hover();
        await swatches.nth(0).locator(".palette-swatch-remove").click();
        await expect(swatches).toHaveCount(3);
        expect((await columnsConfig(view))["State"]?.palette).toBe(
            "linear-gradient(to right, #8b86ff, #ff471e, #0000ff)",
        );

        await sidebar
            .locator(".palette-selector span.reset-default-style")
            .click();
        await expect(swatches).toHaveCount(3);
        expect((await columnsConfig(view))["State"]?.palette).toBeUndefined();
    });

    test("switching modes drops the key the new mode gates out", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "State");
        const sidebar = view.columnSettingsSidebar.container;
        const modeField = sidebar.locator("fieldset.style-control", {
            has: page.locator("#string_color_mode-label"),
        });

        await modeField.locator("select").selectOption("background");
        const colorField = sidebar.locator("fieldset.style-control", {
            has: page.locator("#color-label"),
        });
        await colorField.locator("input[type=color]").fill("#ff0000");
        expect((await columnsConfig(view))["State"]).toEqual({
            string_color_mode: "background",
            color: "#ff0000",
        });

        await modeField.locator("select").selectOption("series");
        expect((await columnsConfig(view))["State"]).toEqual({
            string_color_mode: "series",
        });
        await expect(colorField).toHaveCount(0);

        await sidebar.locator(".palette-add").click();
        const config = (await columnsConfig(view))["State"];
        expect(config.color).toBeUndefined();
        expect(config.palette).toBe(
            "linear-gradient(to right, #2771a8, #8b86ff, #ff471e, #ff471e)",
        );
        expect(
            (await pluginColumnsConfig(view))["State"].color,
        ).toBeUndefined();

        await modeField.locator("select").selectOption("background");
        expect((await columnsConfig(view))["State"]).toEqual({
            string_color_mode: "background",
        });
        await expect(colorField.locator("input[type=color]")).toHaveValue(
            "#2771a8",
        );
    });

    test("the add tile respects the schema's max", async ({ page }) => {
        const view = new PageView(page);
        await openStyleTab(view, "State");
        await enableSeriesMode(view);

        const sidebar = view.columnSettingsSidebar.container;
        const swatches = sidebar.locator(".palette-swatch");
        const add = sidebar.locator(".palette-add");
        for (let i = 3; i < 6; i++) {
            await add.click();
            await expect(
                swatches.nth(i).locator("input[type=color]"),
            ).toBeFocused();
        }

        await expect(swatches).toHaveCount(6);
        await expect(add).toHaveCount(0);
    });

    test("dragging a swatch previews the order and commits on release; a press is a click", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "State");
        await enableSeriesMode(view);

        const sidebar = view.columnSettingsSidebar.container;
        const swatches = sidebar.locator(".palette-swatch");
        const shownOrder = () =>
            swatches.evaluateAll((els) =>
                els.map((el) => el.querySelector("input")!.value),
            );
        const center = async (index: number) => {
            const box = (await swatches.nth(index).boundingBox())!;
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        };

        const pressed = await center(1);
        await page.mouse.move(pressed.x, pressed.y);
        await page.mouse.down();
        await page.mouse.move(pressed.x + 2, pressed.y + 1);
        await page.mouse.up();
        await expect(
            swatches.nth(1).locator("input[type=color]"),
        ).toBeFocused();
        await expect(sidebar.locator(".dragging")).toHaveCount(0);
        expect((await columnsConfig(view))["State"]?.palette).toBeUndefined();

        const from = await center(0);
        const to = await center(2);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x + 8, to.y, { steps: 6 });
        await expect(swatches.nth(2)).toHaveClass(/dragging/);
        expect(await shownOrder()).toEqual(["#8b86ff", "#ff471e", "#2771a8"]);
        expect((await columnsConfig(view))["State"]?.palette).toBeUndefined();

        const mid = await center(1);
        await page.mouse.move(mid.x - 2, mid.y, { steps: 4 });
        expect(await shownOrder()).toEqual(["#8b86ff", "#2771a8", "#ff471e"]);
        await page.mouse.move(to.x + 8, to.y, { steps: 4 });
        expect(await shownOrder()).toEqual(["#8b86ff", "#ff471e", "#2771a8"]);

        await page.mouse.up();
        await expect(sidebar.locator(".dragging")).toHaveCount(0);
        expect((await columnsConfig(view))["State"]?.palette).toBe(
            "linear-gradient(to right, #8b86ff, #ff471e, #2771a8)",
        );
        expect(await shownOrder()).toEqual(["#8b86ff", "#ff471e", "#2771a8"]);

        const own = await center(1);
        await page.mouse.move(own.x, own.y);
        await page.mouse.down();
        await page.mouse.move(own.x + 6, own.y, { steps: 4 });
        await expect(swatches.nth(1)).toHaveClass(/dragging/);
        expect(await shownOrder()).toEqual(["#8b86ff", "#ff471e", "#2771a8"]);
        await page.mouse.up();
        expect((await columnsConfig(view))["State"]?.palette).toBe(
            "linear-gradient(to right, #8b86ff, #ff471e, #2771a8)",
        );
    });

    test("restore() drives the widget and rejects a positioned palette", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "State");
        await view.restore({
            columns_config: {
                State: {
                    string_color_mode: "series",
                    palette: "linear-gradient(#123456, #654321)",
                },
            },
        } as any);

        const sidebar = view.columnSettingsSidebar.container;
        const swatches = sidebar.locator(".palette-swatch");
        await expect(swatches).toHaveCount(2);
        await expect(swatches.nth(0).locator("input[type=color]")).toHaveValue(
            "#123456",
        );
        await expect(swatches.nth(1).locator("input[type=color]")).toHaveValue(
            "#654321",
        );

        expect((await columnsConfig(view))["State"]?.palette).toBe(
            "linear-gradient(to right, #123456, #654321)",
        );

        const error = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            try {
                await viewer.restore({
                    columns_config: {
                        State: {
                            string_color_mode: "series",
                            palette:
                                "linear-gradient(to right, #123456 0%, #654321 100%)",
                        },
                    },
                } as any);
                return null;
            } catch (e) {
                return String(e);
            }
        });

        expect(error).toContain("palette");
    });
});

test.describe("Named values (var() references + the workspace palette)", () => {
    const TABLE = "load-viewer-csv";
    const GRADIENT_1 = "linear-gradient(to right, #123456 0%, #654321 100%)";
    const PALETTE_1 = "linear-gradient(to right, #112233, #445566, #778899)";
    const COLOR_1 = "#abcdef";

    async function addPageEntries(view: PageView) {
        await view.page.addStyleTag({
            content: `perspective-viewer {
                --psp-user--gradient-1: linear-gradient(#123456, #654321);
                --psp-user--palette-1: linear-gradient(90deg, #112233, #445566, #778899);
                --psp-user--color-1: rgb(171, 205, 239);
            }`,
        });
    }

    async function restoreWorkspace(view: PageView, config: unknown) {
        return await view.page.evaluate(async (config) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            try {
                await viewer.restoreWorkspace(config);
                return null;
            } catch (e) {
                return String(e);
            }
        }, config);
    }

    function idFree(workspace: any) {
        return {
            palette: workspace.palette,
            panels: Object.values(workspace.panels),
        };
    }

    async function saveWorkspace(
        view: PageView,
        options?: { full_palette?: boolean },
    ): Promise<any> {
        return await view.page.evaluate(async (options) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return await viewer.saveWorkspace(options);
        }, options);
    }

    function firstPanel(workspace: any): any {
        return Object.values(workspace.panels)[0];
    }

    test("page-authored references resolve on restore(); save() is literal, saveWorkspace() references a self-contained palette", async ({
        page,
    }) => {
        const view = new PageView(page);
        await addPageEntries(view);
        await openStyleTab(view, "Sales");
        await view.restore({
            columns_config: {
                Sales: {
                    gradient: "var(--psp-user--gradient-1)",
                    color: "var(--psp-user--color-1)",
                },
            },
        } as any);

        const delivered = (await pluginColumnsConfig(view))["Sales"];
        expect(delivered.gradient).toBe(GRADIENT_1);
        expect(delivered.color).toBe(COLOR_1);
        const saved = (await columnsConfig(view))["Sales"];
        expect(saved.gradient).toBe(GRADIENT_1);
        expect(saved.color).toBe(COLOR_1);

        const workspace = await saveWorkspace(view);
        expect(workspace.palette).toEqual({
            "--psp-user--gradient-1": GRADIENT_1,
            "--psp-user--color-1": COLOR_1,
        });
        expect(firstPanel(workspace).columns_config.Sales).toEqual({
            gradient: "var(--psp-user--gradient-1)",
            color: "var(--psp-user--color-1)",
        });

        const selector = stopsField(view, "gradient");
        await expect(selector.locator(".gradient-stop-handle")).toHaveCount(2);
        await expect(selector.locator(".gradient-stop-grip")).toHaveCount(2);
        await expect(
            selector.locator(".gradient-stop-handle input[type=color]").first(),
        ).toBeEnabled();

        const controls = field(view, "gradient").locator(
            ".named-value-controls",
        );
        await expect(controls.locator("select option")).toHaveText([
            "Load",
            "1",
        ]);
        await expect(controls.locator(".named-value-pin")).toBeVisible();
    });

    test("a reference of the wrong kind rejects restore(); an unresolvable one renders the default", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        const error = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            try {
                await viewer.restore(
                    {
                        columns_config: {
                            Sales: { gradient: "var(--psp-user--palette-1)" },
                        },
                    },
                    { suppress_errors: true },
                );
                return null;
            } catch (e) {
                return String(e);
            }
        });

        expect(error).toContain("gradient");

        await view.restore({
            columns_config: {
                Sales: { gradient: "var(--psp-user--gradient-missing)" },
            },
        } as any);

        expect(
            (await pluginColumnsConfig(view))["Sales"]?.gradient,
        ).toBeUndefined();
        expect((await columnsConfig(view))["Sales"]?.gradient).toBeUndefined();
        expect((await saveWorkspace(view)).palette).toBeUndefined();
        await expect(
            stopsField(view, "gradient").locator(".gradient-stop-handle"),
        ).toHaveCount(2);
    });

    test("restoreWorkspace({palette}) defines, resolves and round-trips named values", async ({
        page,
    }) => {
        const view = new PageView(page);
        const palette = {
            "--psp-user--gradient-heat": "linear-gradient(#123456, #654321)",
            "--psp-user--palette-brand":
                "linear-gradient(90deg, #112233, #445566, #778899)",
            "--psp-user--color-hot": "RGB(171, 205, 239)",
            "--psp-user--color-spare": "#010203",
        };

        const error = await restoreWorkspace(view, {
            palette,
            layout: { type: "tab-layout", tabs: ["main"], selected: 0 },
            panels: {
                main: {
                    table: TABLE,
                    plugin: "Debug Styled",
                    columns: ["Sales", "State"],
                    columns_config: {
                        Sales: {
                            gradient: "var(--psp-user--gradient-heat)",
                            color: "var(--psp-user--color-hot)",
                        },
                        State: {
                            string_color_mode: "series",
                            palette: "var(--psp-user--palette-brand)",
                        },
                    },
                },
            },
        });

        expect(error).toBeNull();

        const delivered = await pluginColumnsConfig(view);
        expect(delivered.Sales.gradient).toBe(GRADIENT_1);
        expect(delivered.Sales.color).toBe(COLOR_1);
        expect(delivered.State.palette).toBe(PALETTE_1);

        const hostVar = await page.evaluate(() =>
            getComputedStyle(document.querySelector("perspective-viewer")!)
                .getPropertyValue("--psp-user--palette-brand")
                .trim(),
        );

        expect(hostVar).toBe(PALETTE_1);

        const workspace = await saveWorkspace(view);
        expect(workspace.palette).toEqual({
            "--psp-user--gradient-heat": GRADIENT_1,
            "--psp-user--palette-brand": PALETTE_1,
            "--psp-user--color-hot": COLOR_1,
        });
        expect(
            (await saveWorkspace(view, { full_palette: true })).palette,
        ).toEqual({
            "--psp-user--gradient-heat": GRADIENT_1,
            "--psp-user--palette-brand": PALETTE_1,
            "--psp-user--color-hot": COLOR_1,
            "--psp-user--color-spare": "#010203",
        });
        expect(firstPanel(workspace).columns_config.Sales.gradient).toBe(
            "var(--psp-user--gradient-heat)",
        );
        expect(firstPanel(workspace).columns_config.State.palette).toBe(
            "var(--psp-user--palette-brand)",
        );

        const saved = await columnsConfig(view);
        expect(saved.Sales.gradient).toBe(GRADIENT_1);
        expect(saved.State.palette).toBe(PALETTE_1);

        expect(await restoreWorkspace(view, workspace)).toBeNull();
        expect(idFree(await saveWorkspace(view))).toEqual(idFree(workspace));

        expect(
            await restoreWorkspace(view, { ...workspace, palette: undefined }),
        ).toBeNull();
        const cleared = await page.evaluate(() =>
            getComputedStyle(document.querySelector("perspective-viewer")!)
                .getPropertyValue("--psp-user--palette-brand")
                .trim(),
        );

        expect(cleared).toBe("");
        expect(
            (await pluginColumnsConfig(view)).State?.palette,
        ).toBeUndefined();
        expect((await saveWorkspace(view)).palette).toBeUndefined();
    });

    test("a malformed palette entry rejects restoreWorkspace() before any change", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");
        const before = await saveWorkspace(view);

        const cases: Array<[Record<string, string>, string]> = [
            [{ "--psp-charts--gradient": "#ff0000" }, "--psp-charts--gradient"],
            [{ "--psp-user--other-1": "#ff0000" }, "--psp-user--other-1"],
            [
                {
                    "--psp-user--palette-1":
                        "linear-gradient(#000 0%, #fff 100%)",
                },
                "--psp-user--palette-1",
            ],
            [{ "--psp-user--color-1": "red" }, "red"],
        ];

        for (const [palette, needle] of cases) {
            const error = await restoreWorkspace(view, {
                ...before,
                palette,
            });

            expect(error).toContain(needle);
        }

        expect(await saveWorkspace(view)).toEqual(before);
    });

    test("the palette is the set of in-use values: named deterministically, deduplicated, revised as fields change", async ({
        page,
    }) => {
        const view = new PageView(page);
        await openStyleTab(view, "Sales");

        expect((await saveWorkspace(view)).palette).toBeUndefined();
        await expect(
            field(view, "gradient").locator(".named-value-controls"),
        ).toHaveCount(0);

        const selector = stopsField(view, "gradient");
        const input = selector
            .locator(".gradient-stop-handle input[type=color]")
            .first();
        await input.fill("#00ff00");
        let workspace = await saveWorkspace(view);
        expect(workspace.palette).toEqual({
            "--psp-user--gradient-1":
                "linear-gradient(to right, #00ff00 0%, #ff471e 100%)",
        });
        expect(firstPanel(workspace).columns_config.Sales.gradient).toBe(
            "var(--psp-user--gradient-1)",
        );

        const controls = field(view, "gradient").locator(
            ".named-value-controls",
        );
        await expect(controls.locator("select option")).toHaveText([
            "Load",
            "1",
        ]);

        await input.fill("#0000ff");
        expect((await saveWorkspace(view)).palette).toEqual({
            "--psp-user--gradient-1":
                "linear-gradient(to right, #0000ff 0%, #ff471e 100%)",
        });

        await view.restore({
            columns: ["Sales", "Profit", "Quantity"],
            columns_config: {
                Sales: {
                    gradient:
                        "linear-gradient(to right, #0000ff 0%, #ff471e 100%)",
                },
                Profit: { gradient: "linear-gradient(#111, #222)" },
                Quantity: { gradient: "linear-gradient(#111, #222)" },
            },
        } as any);

        workspace = await saveWorkspace(view);
        expect(workspace.palette).toEqual({
            "--psp-user--gradient-1":
                "linear-gradient(to right, #111111 0%, #222222 100%)",
            "--psp-user--gradient-2":
                "linear-gradient(to right, #0000ff 0%, #ff471e 100%)",
        });
        expect(firstPanel(workspace).columns_config.Profit.gradient).toBe(
            "var(--psp-user--gradient-1)",
        );
        expect(firstPanel(workspace).columns_config.Quantity.gradient).toBe(
            "var(--psp-user--gradient-1)",
        );

        const profit =
            await view.settingsPanel.activeColumns.getColumnByName("Profit");
        await view.assureColumnSettingsOpen(profit);
        const profitControls = field(view, "gradient").locator(
            ".named-value-controls",
        );
        await expect(profitControls.locator("select option")).toHaveText([
            "Load",
            "1",
            "2",
        ]);
        await profitControls.locator("select").selectOption("2");
        await expect(profitControls.locator("select")).toHaveValue("");
        await expect(
            stopsField(view, "gradient")
                .locator(".gradient-stop-handle input[type=color]")
                .first(),
        ).toBeEnabled();
        expect((await columnsConfig(view))["Profit"]?.gradient).toBe(
            "linear-gradient(to right, #0000ff 0%, #ff471e 100%)",
        );

        workspace = await saveWorkspace(view);
        expect(firstPanel(workspace).columns_config.Profit.gradient).toBe(
            "var(--psp-user--gradient-1)",
        );

        await expect(profitControls.locator(".named-value-pin")).toBeVisible();
        await profitControls.locator(".named-value-pin").click();
        await expect(profitControls.locator(".named-value-pin")).toHaveCount(0);

        expect(await restoreWorkspace(view, workspace)).toBeNull();
        expect(idFree(await saveWorkspace(view))).toEqual(idFree(workspace));

        await view.restore({ columns_config: null } as any);
        expect((await saveWorkspace(view)).palette).toBeUndefined();
        const full = await saveWorkspace(view, { full_palette: true });
        expect(full.palette).toEqual({
            "--psp-user--gradient-1":
                "linear-gradient(to right, #0000ff 0%, #ff471e 100%)",
            "--psp-user--gradient-2":
                "linear-gradient(to right, #111111 0%, #222222 100%)",
        });

        expect(
            await restoreWorkspace(view, { ...full, palette: undefined }),
        ).toBeNull();
        expect(
            (await saveWorkspace(view, { full_palette: true })).palette,
        ).toBeUndefined();
    });

    test("the loader offers theme entries and applies them as editable literals; max is honored", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.page.addStyleTag({
            content: `perspective-viewer {
                --psp-user--palette-1: linear-gradient(#111111, #222222, #333333, #444444, #555555, #666666);
            }`,
        });

        await openStyleTab(view, "State");
        const sidebar = view.columnSettingsSidebar.container;
        const modeField = sidebar.locator("fieldset.style-control", {
            has: page.locator("#string_color_mode-label"),
        });

        await modeField.locator("select").selectOption("series");
        const controls = field(view, "palette").locator(
            ".named-value-controls",
        );
        await expect(controls.locator("select option")).toHaveText([
            "Load",
            "1",
        ]);
        await expect(controls.locator(".named-value-pin")).toHaveCount(0);

        await controls.locator("select").selectOption("1");
        const swatches = sidebar.locator(".palette-swatch");
        await expect(swatches).toHaveCount(6);
        await expect(
            swatches.first().locator("input[type=color]"),
        ).toBeEnabled();
        await expect(sidebar.locator(".palette-add")).toHaveCount(0);
        await expect(controls.locator("select")).toHaveValue("");

        const SIX =
            "linear-gradient(to right, #111111, #222222, #333333, #444444, #555555, #666666)";
        expect((await columnsConfig(view))["State"]?.palette).toBe(SIX);
        let workspace = await saveWorkspace(view);
        expect(workspace.palette).toEqual({ "--psp-user--palette-1": SIX });
        expect(firstPanel(workspace).columns_config.State.palette).toBe(
            "var(--psp-user--palette-1)",
        );

        await swatches.first().locator("input[type=color]").fill("#00ff00");
        await expect(controls.locator("select option")).toHaveText([
            "Load",
            "2",
            "1",
        ]);
        workspace = await saveWorkspace(view);
        expect(Object.keys(workspace.palette)).toEqual([
            "--psp-user--palette-2",
        ]);
        expect(firstPanel(workspace).columns_config.State.palette).toBe(
            "var(--psp-user--palette-2)",
        );
    });
});
