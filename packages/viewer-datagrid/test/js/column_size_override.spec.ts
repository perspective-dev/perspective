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

const TABLE = "load-viewer-csv";

async function goto_ready(page: any) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

async function restore(page: any, config: any) {
    await page.evaluate(async (config: any) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore(config);
        await viewer.flush();
    }, config);
}

async function saved_columns_config(page: any) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        return (await viewer.save()).columns_config;
    });
}

async function header_width(page: any, name: string, selector = "") {
    return await page.evaluate(
        async ({ name, selector }: any) => {
            const datagrid = document.querySelector(
                `${selector} perspective-viewer-datagrid`.trim(),
            ) as any;

            const ths = [
                ...datagrid.regular_table.querySelectorAll(
                    "thead tr:last-of-type th",
                ),
            ];

            const th = ths.find(
                (th: Element) => th.textContent?.trim() === name,
            );

            return th ? Math.round(th.getBoundingClientRect().width) : null;
        },
        { name, selector },
    );
}

function resize_handle(page: any, index: number) {
    return page
        .locator(
            "perspective-viewer-datagrid regular-table thead tr:last-of-type th .rt-column-resize",
        )
        .nth(index);
}

async function wait_for_override(page: any, name: string, present: boolean) {
    await page.waitForFunction(
        async ({ name, present }: any) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const token = await viewer.save();
            const value = token.columns_config?.[name]?.column_size_override;
            return present ? value !== undefined : value === undefined;
        },
        { name, present },
    );
}

test.describe("column_size_override", () => {
    test("applies on the first paint of a fresh viewer", async ({ page }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const cls = customElements.get(
                "perspective-viewer-datagrid",
            ) as any;
            (window as any).__DRAWS__ = 0;
            const orig = cls.prototype.draw;
            cls.prototype.draw = function (...args: any[]) {
                (window as any).__DRAWS__ += 1;
                return orig.apply(this, args);
            };
        });

        await page.evaluate(
            async ({ tableName }: any) => {
                const viewer = document.createElement(
                    "perspective-viewer",
                ) as any;
                viewer.id = "boot-probe";
                viewer.style.cssText =
                    "position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;";
                document.body.appendChild(viewer);
                await viewer.load((window as any).__TEST_WORKER__);
                await viewer.restore({
                    table: tableName,
                    columns: ["Ship Mode", "Region"],
                    columns_config: {
                        "Ship Mode": { column_size_override: 60 },
                    },
                });

                await viewer.flush();
            },
            { tableName: TABLE },
        );

        expect(await header_width(page, "Ship Mode", "#boot-probe")).toEqual(
            60,
        );

        const draws = await page.evaluate(() => (window as any).__DRAWS__);
        expect(draws).toEqual(1);
    });

    test("survives a group_by change that resets auto sizes", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Ship Mode", "Sales"],
            columns_config: { "Ship Mode": { column_size_override: 60 } },
        });

        expect(await header_width(page, "Ship Mode")).toEqual(60);
        await restore(page, { group_by: ["Region"] });
        expect(await header_width(page, "Ship Mode")).toEqual(60);
        await restore(page, { group_by: [] });
        expect(await header_width(page, "Ship Mode")).toEqual(60);
        expect(await saved_columns_config(page)).toEqual({
            "Ship Mode": { column_size_override: 60 },
        });
    });

    test("maps row headers correctly in flat rollup mode", async ({ page }) => {
        await goto_ready(page);
        await restore(page, {
            group_by: ["Region"],
            group_rollup_mode: "flat",
            columns: ["Ship Mode", "Sales"],
            columns_config: { Sales: { column_size_override: 60 } },
        });

        expect(await header_width(page, "Sales")).toEqual(60);
        expect(await header_width(page, "Ship Mode")).toBeGreaterThan(60);
    });

    test("a drag persists exactly the dragged column's key", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Ship Mode", "Region", "Category"],
            columns_config: {
                Region: { column_size_override: 60 },
                Category: { column_size_override: 70 },
            },
        });

        const pos = (await resize_handle(page, 0).boundingBox())!;
        await page.mouse.move(pos.x + 2, pos.y + 5);
        await page.mouse.down();
        await page.mouse.move(pos.x - 120, pos.y + 5);
        await page.mouse.up();
        await wait_for_override(page, "Ship Mode", true);

        const config = await saved_columns_config(page);
        expect(config["Ship Mode"].column_size_override).toBeGreaterThan(0);
        expect(config.Region).toEqual({ column_size_override: 60 });
        expect(config.Category).toEqual({ column_size_override: 70 });
    });

    test("a widening drag persists too", async ({ page }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Region", "Category"],
            columns_config: { Region: { column_size_override: 60 } },
        });

        const pos = (await resize_handle(page, 0).boundingBox())!;
        await page.mouse.move(pos.x + 2, pos.y + 5);
        await page.mouse.down();
        await page.mouse.move(pos.x + 100, pos.y + 5);
        await page.mouse.up();
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const token = await viewer.save();
            return token.columns_config?.Region?.column_size_override > 100;
        });

        expect(await header_width(page, "Region")).toBeGreaterThan(100);
    });

    test("a double-click reset removes exactly that column's key", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Ship Mode", "Region", "Category"],
            columns_config: {
                Region: { column_size_override: 40 },
                Category: { column_size_override: 70 },
            },
        });

        const pos = (await resize_handle(page, 1).boundingBox())!;
        await page.mouse.dblclick(pos.x + 2, pos.y + 5);
        await wait_for_override(page, "Region", false);
        expect(await saved_columns_config(page)).toEqual({
            Category: { column_size_override: 70 },
        });

        expect(await header_width(page, "Region")).toBeGreaterThan(40);
        expect(await header_width(page, "Category")).toEqual(70);
    });

    test("a drag still persists after the plugin is swapped away and back", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, { columns: ["Ship Mode", "Region", "Category"] });
        const drag = async (dx: number) => {
            const pos = (await resize_handle(page, 1).boundingBox())!;
            await page.mouse.move(pos.x + 2, pos.y + 5);
            await page.mouse.down();
            for (let i = 1; i <= 4; i++) {
                await page.mouse.move(pos.x + 2 + (dx / 4) * i, pos.y + 5);
            }

            await page.mouse.up();
        };

        await drag(40);
        await wait_for_override(page, "Region", true);
        const first = (await saved_columns_config(page)).Region
            .column_size_override;

        await restore(page, { plugin: "Y Bar" });
        await restore(page, {
            plugin: "Datagrid",
            columns: ["Ship Mode", "Region", "Category"],
        });

        expect(await header_width(page, "Region")).toEqual(Math.round(first));
        await page.waitForTimeout(600);
        await drag(40);
        await page.waitForFunction(async (first: number) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const token = await viewer.save();
            return token.columns_config?.Region?.column_size_override > first;
        }, first);

        const second = (await saved_columns_config(page)).Region
            .column_size_override;
        expect(await header_width(page, "Region")).toEqual(Math.round(second));
    });

    test.skip("an override on a column outside the initial viewport applies when scrolled into view", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns_config: { Profit: { column_size_override: 60 } },
        });

        expect(await header_width(page, "Profit")).toBeNull();
        await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            datagrid.regular_table.scrollLeft = 100000;
            await new Promise((x) => setTimeout(x, 300));
            await datagrid.regular_table.flush();
        });

        expect(await header_width(page, "Profit")).toEqual(60);
    });
});
