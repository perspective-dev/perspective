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

import { PageView, expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

const INACTIVE_DRAG =
    "#sub-columns .column-selector-column:not(.column-selector-column-hidden) .column-selector-draggable";

interface TileInfo {
    label: string;
    text: string;
    top: number;
    left: number;
    width: number;
    value_size: number;
    color: string;
}

async function goto_ready(page: Page): Promise<void> {
    await page.goto("/tools/test/src/html/summary-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

async function restore(page: Page, config: Record<string, unknown>) {
    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore(config);
        await viewer.flush();
    }, config);
}

async function resize(page: Page, width: number, height: number) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.resize();
        await viewer.flush();
    });
}

async function read_tiles(page: Page): Promise<TileInfo[]> {
    return await page.evaluate(() => {
        const plugin = document.querySelector("perspective-viewer-summary")!;

        return [...plugin.shadowRoot!.querySelectorAll(".tile")].map((tile) => {
            const rect = tile.getBoundingClientRect();
            const value = tile.querySelector(".value")!;
            return {
                label: tile.querySelector(".label")!.textContent ?? "",
                text: value.textContent ?? "",
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                width: rect.width,
                value_size: parseFloat(getComputedStyle(value).fontSize),
                color: getComputedStyle(tile).color,
            };
        });
    });
}

interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

async function read_hierarchy(page: Page): Promise<{
    groups: (Box & { label: string })[];
    tiles: (Box & { label: string })[];
}> {
    return await page.evaluate(() => {
        const plugin = document.querySelector("perspective-viewer-summary")!;
        const box = (elem: Element) => {
            const rect = elem.getBoundingClientRect();
            return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            };
        };

        return {
            groups: [
                ...plugin.shadowRoot!.querySelectorAll(".group:not(.headless)"),
            ].map((group) => ({
                label: group.querySelector(".group-header")!.textContent ?? "",
                ...box(group),
            })),
            tiles: [...plugin.shadowRoot!.querySelectorAll(".tile")].map(
                (tile) => ({
                    label: tile.querySelector(".label")!.textContent ?? "",
                    ...box(tile),
                }),
            ),
        };
    });
}

function contains(outer: Box, inner: Box): boolean {
    return (
        inner.left >= outer.left - 0.5 &&
        inner.top >= outer.top - 0.5 &&
        inner.right <= outer.right + 0.5 &&
        inner.bottom <= outer.bottom + 0.5
    );
}

async function plugin_width(page: Page): Promise<number> {
    return await page.evaluate(
        () =>
            document
                .querySelector("perspective-viewer-summary")!
                .getBoundingClientRect().width,
    );
}

async function formatted_totals(page: Page, columns: string[]) {
    return await page.evaluate(async (columns) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        const view = await viewer.getView();
        const data = await view.to_columns();
        const formatter = new Intl.NumberFormat(
            navigator.languages as string[],
            {
                style: "decimal",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            },
        );

        return columns.map((x) => formatter.format(data[x][0]));
    }, columns);
}

test.describe("Summary plugin", () => {
    test.beforeEach(async ({ page }) => {
        await goto_ready(page);
    });

    test("draws one tile per column from the total row", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return await viewer.save();
        });

        expect(saved.group_rollup_mode).toEqual("total");
        const tiles = await read_tiles(page);
        expect(tiles.map((x) => x.label)).toEqual(["Sales", "Profit"]);
        expect(tiles.map((x) => x.text)).toEqual(
            await formatted_totals(page, ["Sales", "Profit"]),
        );
    });

    test("grid shape follows the panel aspect ratio", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit", "Quantity", "Discount"],
        });

        await resize(page, 1600, 180);
        const wide = await read_tiles(page);
        expect(new Set(wide.map((x) => x.top)).size).toEqual(1);

        await resize(page, 300, 1000);
        const tall = await read_tiles(page);
        expect(new Set(tall.map((x) => x.left)).size).toEqual(1);
    });

    test("every row of tiles fills the panel width", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit", "Quantity", "Discount", "Row ID"],
        });

        await resize(page, 900, 700);
        const tiles = await read_tiles(page);
        const width = await plugin_width(page);
        const rows = new Map<number, number[]>();
        for (const tile of tiles) {
            rows.set(tile.top, [...(rows.get(tile.top) ?? []), tile.width]);
        }

        for (const widths of rows.values()) {
            const total = widths.reduce((a, b) => a + b, 0) + widths.length - 1;
            expect(Math.abs(total - width)).toBeLessThan(2);
        }
    });

    test("value text grows with the panel", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
        });

        await resize(page, 600, 400);
        const small = await read_tiles(page);
        await resize(page, 1400, 1000);
        const large = await read_tiles(page);
        expect(large[0].value_size).toBeGreaterThan(small[0].value_size * 1.5);
        expect(small[0].value_size).toEqual(small[1].value_size);
    });

    test("flat split_by draws a tile per split value", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales"],
            split_by: ["Region"],
            split_rollup_mode: "flat",
        });

        const tiles = await read_tiles(page);
        expect(tiles.map((x) => x.label)).toEqual([
            "Central\nSales",
            "East\nSales",
            "South\nSales",
            "West\nSales",
        ]);
    });

    test("rollup split_by draws the total beside each split value", async ({
        page,
    }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales"],
            split_by: ["Region"],
            split_rollup_mode: "rollup",
        });

        const tiles = await read_tiles(page);
        expect(tiles.map((x) => x.label).sort()).toEqual([
            "Central\nSales",
            "East\nSales",
            "Sales",
            "South\nSales",
            "West\nSales",
        ]);

        const total = tiles.find((x) => x.label === "Sales")!;
        expect(total.text).toEqual(
            (await formatted_totals(page, ["Sales"]))[0],
        );
    });

    test("a column's label_position overrides the plugin's", async ({
        page,
    }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
            plugin_config: { label_position: "left" },
            columns_config: { Profit: { label_position: "none" } },
        });

        const labels = await page.evaluate(() => {
            const plugin = document.querySelector(
                "perspective-viewer-summary",
            )!;
            return [...plugin.shadowRoot!.querySelectorAll(".tile")].map(
                (tile) => {
                    const label = tile.querySelector(".label")!;
                    const value = tile.querySelector(".value")!;
                    const display = getComputedStyle(label).display;
                    return {
                        display,
                        beside:
                            display !== "none" &&
                            label.getBoundingClientRect().right <=
                                value.getBoundingClientRect().left,
                    };
                },
            );
        });

        expect(labels).toEqual([
            { display: "block", beside: true },
            { display: "none", beside: false },
        ]);
    });

    test("grid_columns and grid_rows fix the grid shape", async ({ page }) => {
        const columns = ["Sales", "Profit", "Quantity", "Discount"];
        await resize(page, 1600, 180);
        await restore(page, {
            plugin: "Summary",
            columns,
            plugin_config: { grid_columns: 1 },
        });

        const stacked = await read_tiles(page);
        expect(new Set(stacked.map((x) => x.left)).size).toEqual(1);
        expect(new Set(stacked.map((x) => x.top)).size).toEqual(4);

        await resize(page, 300, 1000);
        await restore(page, {
            plugin: "Summary",
            columns,
            plugin_config: { grid_columns: 0, grid_rows: 1 },
        });

        const row = await read_tiles(page);
        expect(new Set(row.map((x) => x.top)).size).toEqual(1);
    });

    test("label-bar anchors positive and negative bars alike", async ({
        page,
    }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Neg Sales"],
            expressions: { "Neg Sales": '-"Sales"' },
            columns_config: {
                Sales: { fg_mode: "label-bar", fg_gradient: 10000000 },
                "Neg Sales": { fg_mode: "label-bar", fg_gradient: 10000000 },
            },
        });

        const positions = await page.evaluate(() => {
            const plugin = document.querySelector(
                "perspective-viewer-summary",
            )!;
            return [...plugin.shadowRoot!.querySelectorAll(".tile")].map(
                (tile) => getComputedStyle(tile).backgroundPositionX,
            );
        });

        expect(positions).toEqual(["0%", "0%"]);
    });

    test("applies the column's Datagrid style keys", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales"],
            columns_config: {
                Sales: {
                    fg_color:
                        "linear-gradient(to right, #ff0000 0%, #00ff00 100%)",
                    number_format: {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                    },
                },
            },
        });

        const [tile] = await read_tiles(page);
        expect(tile.color).toEqual("rgb(0, 255, 0)");
        expect(tile.text).not.toContain(".");
    });

    test("an unset align follows the column type", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "State", "Profit"],
            aggregates: { State: "dominant" },
            columns_config: { Profit: { align: "top" } },
        });

        const aligns = await page.evaluate(() => {
            const plugin = document.querySelector(
                "perspective-viewer-summary",
            )!;
            return [...plugin.shadowRoot!.querySelectorAll(".tile")].map(
                (tile) => {
                    const style = (tile as HTMLElement).style;
                    return [
                        style.getPropertyValue("--psp-summary--h"),
                        style.getPropertyValue("--psp-summary--v"),
                    ];
                },
            );
        });

        expect(aligns).toEqual([
            ["flex-end", "center"],
            ["flex-start", "center"],
            ["center", "flex-start"],
        ]);
    });

    test("the plugin align control shows no default", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            settings: true,
            columns: ["Sales", "Profit"],
        });

        const view = new PageView(page);
        await view.container.locator("#plugin_tabbar_tab").click();
        const tab = view.container.locator("#plugin-tab");
        const font = tab.locator("details.control-group", {
            has: page.locator("#font-group-label"),
        });

        await font.waitFor({ state: "visible" });
        if (!(await font.evaluate((el: HTMLDetailsElement) => el.open))) {
            await font.locator("summary").click();
        }

        const grid = font.locator("#align-alignment");
        await expect(grid.locator("button")).toHaveCount(9);
        await expect(grid.locator(".is-default")).toHaveCount(0);
    });

    test("dropping a column on the total group_by keeps total", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            plugin: "Summary",
            settings: true,
            columns: ["Sales"],
        });

        const source = view.container.locator(INACTIVE_DRAG).first();
        const target = view.container.locator("#group_by");
        await source.dragTo(target, { steps: 100 });
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.flush();
        });

        const config = await view.save();
        expect(config.plugin).toEqual("Summary");
        expect(config.group_rollup_mode).toEqual("total");
        expect(config.group_by).toEqual([]);
    });

    test("restoring a group_by keeps total", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales"],
            group_by: ["Region"],
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return await viewer.save();
        });

        expect(saved.group_rollup_mode).toEqual("total");
        expect(saved.group_by).toEqual([]);
        expect((await read_tiles(page)).map((x) => x.label)).toEqual(["Sales"]);
    });

    test("hierarchy nests split_by tiles in a group per split value", async ({
        page,
    }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
            split_by: ["Region"],
            split_rollup_mode: "flat",
            plugin_config: { layout_mode: "hierarchy" },
        });

        const { groups, tiles } = await read_hierarchy(page);
        expect(groups.map((x) => x.label)).toEqual([
            "Central",
            "East",
            "South",
            "West",
        ]);

        expect(tiles.map((x) => x.label).sort()).toEqual([
            "Profit",
            "Profit",
            "Profit",
            "Profit",
            "Sales",
            "Sales",
            "Sales",
            "Sales",
        ]);

        for (const group of groups) {
            expect(tiles.filter((x) => contains(group, x)).length).toEqual(2);
        }
    });

    test("hierarchy puts rollup totals outside every group", async ({
        page,
    }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
            split_by: ["Region"],
            split_rollup_mode: "rollup",
            plugin_config: { layout_mode: "hierarchy" },
        });

        const { groups, tiles } = await read_hierarchy(page);
        expect(groups.length).toEqual(4);
        expect(tiles.length).toEqual(10);
        const outside = tiles.filter(
            (tile) => !groups.some((group) => contains(group, tile)),
        );

        expect(outside.map((x) => x.label).sort()).toEqual(["Profit", "Sales"]);
    });

    test("hierarchy splits rollup totals from the groups", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
            split_by: ["Region"],
            split_rollup_mode: "rollup",
            plugin_config: { layout_mode: "hierarchy" },
        });

        const parts = await page.evaluate(() => {
            const plugin = document.querySelector(
                "perspective-viewer-summary",
            )!;
            const root = plugin.shadowRoot!.querySelector("#tiles")!;
            return [...root.children].map((child) => ({
                headless: child.classList.contains("headless"),
                tiles: child.querySelectorAll(":scope > .group-body > .tile")
                    .length,
                groups: child.querySelectorAll(".group:not(.headless)").length,
            }));
        });

        expect(parts).toEqual([
            { headless: true, tiles: 2, groups: 0 },
            { headless: true, tiles: 0, groups: 4 },
        ]);

        const { groups, tiles } = await read_hierarchy(page);
        const totals = tiles.filter(
            (tile) => !groups.some((group) => contains(group, tile)),
        );

        const above = totals.every((tile) =>
            groups.every((group) => tile.bottom <= group.top + 0.5),
        );

        const before = totals.every((tile) =>
            groups.every((group) => tile.right <= group.left + 0.5),
        );

        expect(above || before).toBe(true);
        const extent = (boxes: Box[]) =>
            above
                ? Math.max(...boxes.map((x) => x.right)) -
                  Math.min(...boxes.map((x) => x.left))
                : Math.max(...boxes.map((x) => x.bottom)) -
                  Math.min(...boxes.map((x) => x.top));

        expect(Math.abs(extent(totals) - extent(groups))).toBeLessThan(1);
    });

    test("grid_columns fixes the tiles inside each hierarchy group", async ({
        page,
    }) => {
        await resize(page, 1600, 400);
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit", "Quantity"],
            split_by: ["Region"],
            split_rollup_mode: "flat",
            plugin_config: { layout_mode: "hierarchy", grid_columns: 1 },
        });

        const { groups, tiles } = await read_hierarchy(page);
        for (const group of groups) {
            const inner = tiles.filter((x) => contains(group, x));
            expect(inner.length).toEqual(3);
            expect(new Set(inner.map((x) => Math.round(x.left))).size).toEqual(
                1,
            );
        }
    });

    test("value text follows its box without a resize call", async ({
        page,
    }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
        });

        const before = (await read_tiles(page))[0].value_size;
        await page.evaluate(async () => {
            const plugin = document.querySelector(
                "perspective-viewer-summary",
            ) as HTMLElement;

            plugin.style.width = `${plugin.clientWidth / 3}px`;
            plugin.style.height = `${plugin.clientHeight / 3}px`;
            await new Promise((x) => requestAnimationFrame(x));
        });

        const after = await read_tiles(page);
        expect(after[0].value_size).toBeLessThan(before);
        expect(after[0].value_size).toEqual(after[1].value_size);
    });

    test("exports label and value lines as text", async ({ page }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales", "Profit"],
        });

        const text = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return await viewer.export({ method: "plugin" });
        });

        const [sales, profit] = await formatted_totals(page, [
            "Sales",
            "Profit",
        ]);

        expect(text).toEqual(`Sales\t${sales}\nProfit\t${profit}`);
    });
});
