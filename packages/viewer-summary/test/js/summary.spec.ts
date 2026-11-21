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

import { expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

interface TileInfo {
    label: string;
    text: string;
    top: number;
    left: number;
    width: number;
    value_size: number;
    marks: number;
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
                marks: tile.querySelectorAll(".breakdown .mark").length,
                color: getComputedStyle(tile).color,
            };
        });
    });
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
            "Central · Sales",
            "East · Sales",
            "South · Sales",
            "West · Sales",
        ]);

        expect(tiles.map((x) => x.marks)).toEqual([0, 0, 0, 0]);
    });

    test("rollup split_by draws a breakdown under the total", async ({
        page,
    }) => {
        await restore(page, {
            plugin: "Summary",
            columns: ["Sales"],
            split_by: ["Region"],
            split_rollup_mode: "rollup",
        });

        const tiles = await read_tiles(page);
        expect(tiles.map((x) => x.label)).toEqual(["Sales"]);
        expect(tiles[0].marks).toEqual(4);
        expect(tiles[0].text).toEqual(
            (await formatted_totals(page, ["Sales"]))[0],
        );
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
