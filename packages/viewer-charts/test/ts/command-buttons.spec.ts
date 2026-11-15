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

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import { gotoBasic, restoreChart, waitPinnedTooltip } from "./helpers";

const BUTTONS = ".webgl-tooltip .psp-command-button";

async function setupChart(page: Page, scopes: string[]): Promise<void> {
    await restoreChart(page, {
        plugin: "Y Bar",
        group_by: ["Category"],
        columns: ["Sales"],
    });

    await page.evaluate(async (scopes) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.flush();
        (window as any).__CONTEXTS__ = [];
        (window as any).__COMMANDS__ = [];
        (window as any).__LABEL__ = "Open";
        (window as any).__TITLE__ = undefined;
        viewer.addEventListener("perspective-command", (event) => {
            (window as any).__COMMANDS__.push(event.detail);
        });

        await viewer.setCommandSchema(
            (context) => {
                (window as any).__CONTEXTS__.push(context);
                return {
                    commands: [
                        {
                            kind: "Command",
                            key: "open",
                            label: (window as any).__LABEL__,
                            ...((window as any).__TITLE__
                                ? { title: (window as any).__TITLE__ }
                                : {}),
                        },
                    ],
                };
            },
            { scopes },
        );
    }, scopes);
}

async function pinBar(page: Page) {
    const canvas = page.locator("perspective-viewer .webgl-canvas").first();
    const box = (await canvas.boundingBox())!;
    await canvas.click({
        position: { x: box.width * 0.25, y: box.height * 0.7 },
    });

    return await waitPinnedTooltip(page, 5000);
}

async function readButtons(page: Page): Promise<string[]> {
    return await page.evaluate((selector) => {
        const host = document.querySelector(
            'perspective-viewer > [slot]:not([slot^="tab-"])',
        );

        return [...(host?.shadowRoot?.querySelectorAll(selector) ?? [])].map(
            (b) => b.textContent ?? "",
        );
    }, BUTTONS);
}

async function readButtonTitles(page: Page): Promise<string[]> {
    return await page.evaluate((selector) => {
        const host = document.querySelector(
            'perspective-viewer > [slot]:not([slot^="tab-"])',
        );

        return [...(host?.shadowRoot?.querySelectorAll(selector) ?? [])].map(
            (b) => (b as HTMLElement).title,
        );
    }, BUTTONS);
}

test.beforeEach(async ({ page }) => {
    await gotoBasic(page);
});

test.describe("viewer-charts command buttons", () => {
    test("a pinned tooltip shows the schema's buttons and a click invokes with the mark's hit", async ({
        page,
    }) => {
        await setupChart(page, ["chart-tooltip"]);
        expect(await pinBar(page)).not.toBeNull();
        expect(await readButtons(page)).toEqual(["Open"]);
        const context = await page.evaluate(() =>
            (window as any).__CONTEXTS__.at(-1),
        );

        expect(context.location).toBe("chart-tooltip");
        expect(context.hit.kind).toBe("cell");
        expect(context.hit.column_names).toEqual(["Sales"]);
        expect(context.hit.row_path).toHaveLength(1);
        await page.evaluate((selector) => {
            const host = document.querySelector(
                'perspective-viewer > [slot]:not([slot^="tab-"])',
            )!;

            (host.shadowRoot!.querySelector(selector) as HTMLElement).click();
        }, BUTTONS);

        const detail = await page.evaluate(
            () => (window as any).__COMMANDS__[0],
        );

        expect(detail.key).toBe("open");
        expect(detail.context.hit.config).toEqual({
            filter: [["Category", "==", context.hit.row_path[0]]],
        });
    });

    test("a title is the button's tooltip and the label its text", async ({
        page,
    }) => {
        await setupChart(page, ["chart-tooltip"]);
        expect(await pinBar(page)).not.toBeNull();
        expect(await readButtonTitles(page)).toEqual(["Open"]);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            (window as any).__TITLE__ = "Open the order";
            await viewer.invalidate();
        });

        expect(await readButtonTitles(page)).toEqual(["Open the order"]);
        expect(await readButtons(page)).toEqual(["Open"]);
    });

    test("a pinned tooltip and its buttons survive a table update", async ({
        page,
    }) => {
        await setupChart(page, ["chart-tooltip"]);
        const before = await pinBar(page);
        expect(before).not.toBeNull();
        const category = await page.evaluate(
            () => (window as any).__CONTEXTS__.at(-1).hit.row_path[0],
        );

        await page.evaluate(
            async ({ category, selector }) => {
                const host = document.querySelector(
                    'perspective-viewer > [slot]:not([slot^="tab-"])',
                )!;

                (host.shadowRoot!.querySelector(selector) as any).__MARK__ =
                    true;

                const viewer = document.querySelector(
                    "perspective-viewer",
                ) as any;

                const table = await viewer.getTable();
                const view = await table.view({
                    columns: ["Row ID", "Sales"],
                    filter: [["Category", "==", category]],
                });

                const [row] = await view.to_json({ end_row: 1 });
                await view.delete();
                (window as any).__QUERIES__ = (
                    window as any
                ).__CONTEXTS__.length;
                await table.update([
                    { "Row ID": row["Row ID"], Sales: row.Sales + 1_000_000 },
                ]);
            },
            { category, selector: BUTTONS },
        );

        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as any).__CONTEXTS__.length >
                        (window as any).__QUERIES__,
                ),
            )
            .toBe(true);

        const state = await page.evaluate((selector) => {
            const host = document.querySelector(
                'perspective-viewer > [slot]:not([slot^="tab-"])',
            )!;

            const button = host.shadowRoot!.querySelector(selector) as any;
            return {
                kept: button?.__MARK__ === true,
                tooltips:
                    host.shadowRoot!.querySelectorAll(".webgl-tooltip").length,
            };
        }, BUTTONS);

        expect(state).toEqual({ kept: true, tooltips: 1 });
        const after = await waitPinnedTooltip(page, 1000);
        expect(after).not.toEqual(before);
        await page.evaluate((selector) => {
            const host = document.querySelector(
                'perspective-viewer > [slot]:not([slot^="tab-"])',
            )!;

            (host.shadowRoot!.querySelector(selector) as HTMLElement).click();
        }, BUTTONS);

        const detail = await page.evaluate(
            () => (window as any).__COMMANDS__[0],
        );

        expect(detail.context.hit.row_path).toEqual([category]);
    });

    test("a press that spans a re-pin still clicks the button", async ({
        page,
    }) => {
        await setupChart(page, ["chart-tooltip"]);
        expect(await pinBar(page)).not.toBeNull();
        const category = await page.evaluate(
            () => (window as any).__CONTEXTS__.at(-1).hit.row_path[0],
        );

        const box = await page.evaluate((selector) => {
            const host = document.querySelector(
                'perspective-viewer > [slot]:not([slot^="tab-"])',
            )!;

            const rect = host
                .shadowRoot!.querySelector(selector)!
                .getBoundingClientRect();

            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }, BUTTONS);

        await page.mouse.move(box.x, box.y);
        await page.mouse.down();
        await page.evaluate(async (category) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const table = await viewer.getTable();
            const view = await table.view({
                columns: ["Row ID", "Sales"],
                filter: [["Category", "==", category]],
            });

            const [row] = await view.to_json({ end_row: 1 });
            await view.delete();
            (window as any).__QUERIES__ = (window as any).__CONTEXTS__.length;
            await table.update([
                { "Row ID": row["Row ID"], Sales: row.Sales + 1_000_000 },
            ]);
        }, category);

        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as any).__CONTEXTS__.length >
                        (window as any).__QUERIES__,
                ),
            )
            .toBe(true);

        await page.mouse.up();
        expect(
            await page.evaluate(() => (window as any).__COMMANDS__.length),
        ).toBe(1);
    });

    test("the hover tooltip shows no buttons", async ({ page }) => {
        await setupChart(page, ["chart-tooltip"]);
        const canvas = page.locator("perspective-viewer .webgl-canvas").first();
        const box = (await canvas.boundingBox())!;
        await canvas.hover({
            position: { x: box.width * 0.25, y: box.height * 0.7 },
        });

        await page.waitForTimeout(200);
        expect(await readButtons(page)).toEqual([]);
        expect(await waitPinnedTooltip(page, 200)).toBeNull();
    });

    test("a pinned tooltip without the chart-tooltip scope shows no buttons", async ({
        page,
    }) => {
        await setupChart(page, ["context-menu"]);
        expect(await pinBar(page)).not.toBeNull();
        expect(await readButtons(page)).toEqual([]);
        expect(
            await page.evaluate(() => (window as any).__CONTEXTS__.length),
        ).toBe(0);
    });

    test("tooltip_commands false hides the buttons and the schema offers it only in scope", async ({
        page,
    }) => {
        await setupChart(page, ["context-menu"]);
        const keys = async () =>
            await page.evaluate(() => {
                const plugin = document.querySelector(
                    'perspective-viewer > [slot]:not([slot^="tab-"])',
                ) as any;

                const walk = (fields: any[]): string[] =>
                    fields.flatMap((f) =>
                        f.kind === "Group" ? walk(f.fields) : [f.key],
                    );

                return walk(plugin.plugin_config_schema({}).fields);
            });

        expect(await keys()).not.toContain("tooltip_commands");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setCommandSchema(
                () => ({
                    commands: [{ kind: "Command", key: "open", label: "Open" }],
                }),
                { scopes: ["chart-tooltip"] },
            );

            await viewer.restore({
                plugin_config: { tooltip_commands: false },
            });
            await viewer.flush();
        });

        expect(await keys()).toContain("tooltip_commands");
        expect(await pinBar(page)).not.toBeNull();
        expect(await readButtons(page)).toEqual([]);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ plugin_config: { tooltip_commands: true } });
            await viewer.flush();
        });

        expect(await readButtons(page)).toEqual(["Open"]);
    });

    test("invalidate re-renders a pinned tooltip's buttons and keeps the pin", async ({
        page,
    }) => {
        await setupChart(page, ["chart-tooltip"]);
        const cells = await pinBar(page);
        expect(await readButtons(page)).toEqual(["Open"]);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            (window as any).__LABEL__ = "Close";
            await viewer.invalidate();
        });

        expect(await readButtons(page)).toEqual(["Close"]);
        expect(await waitPinnedTooltip(page, 1000)).toEqual(
            expect.arrayContaining(cells!.slice(0, 2)),
        );
    });
});
