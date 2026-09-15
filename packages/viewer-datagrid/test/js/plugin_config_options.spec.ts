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

async function goto_ready(page: any) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

async function restore_plugin_config(page: any, plugin_config: any) {
    await page.evaluate(async (plugin_config: any) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore({ plugin_config });
        await viewer.flush();
    }, plugin_config);
}

async function saved_plugin_config(page: any) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        return (await viewer.save()).plugin_config;
    });
}

async function row_zebra_flags(page: any, count: number) {
    return await page.evaluate(async (count: number) => {
        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const rows = [...datagrid.regular_table.querySelectorAll("tbody tr")];
        return rows
            .slice(0, count)
            .map((tr: Element) => tr.classList.contains("psp-zebra"));
    }, count);
}

function leaf_specs(fields: any[]): any[] {
    return fields.flatMap((f) =>
        f.kind === "Group"
            ? leaf_specs(f.fields)
            : f.kind === "Font"
              ? [f, f.size, f.bold, f.italic].filter((x) => x !== undefined)
              : [f],
    );
}

function leaf_keys(fields: any[]): string[] {
    return leaf_specs(fields).map((f) => f.key);
}

function leaf_defaults(fields: any[]): Record<string, unknown> {
    return Object.fromEntries(
        leaf_specs(fields).map((f) => [f.key, f.default]),
    );
}

async function restore(page: any, config: any) {
    await page.evaluate(async (config: any) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore(config);
        await viewer.flush();
    }, config);
}

async function column_cell_styles(page: any, count: number) {
    return await page.evaluate(async (count: number) => {
        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const rows = [...datagrid.regular_table.querySelectorAll("tbody tr")];
        return rows.slice(0, count).map((tr: Element) =>
            [...tr.children].map((cell: Element) => {
                const computed = getComputedStyle(cell);
                return {
                    font_family: computed.fontFamily,
                    font_size: computed.fontSize,
                    text_align: computed.textAlign,
                    vertical_align: computed.verticalAlign,
                    wrapped: cell.querySelector(".psp-wrap") !== null,
                };
            }),
        );
    }, count);
}

async function label_bar_placement(page: any) {
    return await page.evaluate(async () => {
        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const row = datagrid.regular_table.querySelector("tbody tr");
        return [...row.children].map((cell: Element) => {
            const label = getComputedStyle(cell, "::after");
            const sizer = getComputedStyle(cell, "::before");
            return {
                label_bar: cell.classList.contains("psp-color-mode-label-bar"),
                justify: label.justifyContent,
                align: label.alignItems,
                padding: [sizer.paddingLeft, label.paddingLeft],
            };
        });
    });
}

async function row_heights(page: any, count: number) {
    return await page.evaluate(async (count: number) => {
        const datagrid = document.querySelector(
            "perspective-viewer-datagrid",
        ) as any;

        const rows = [...datagrid.regular_table.querySelectorAll("tbody tr")];
        return rows
            .slice(0, count)
            .map((tr: Element) =>
                Math.round(tr.getBoundingClientRect().height),
            );
    }, count);
}

test.describe("Datagrid plugin_config text and row options", () => {
    test("zebra_rows stripes alternate blocks of rows with zebra_color", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore_plugin_config(page, {
            zebra_rows: 2,
            zebra_color: "#ff0000",
        });

        expect(await row_zebra_flags(page, 6)).toEqual([
            false,
            false,
            true,
            true,
            false,
            false,
        ]);

        const background = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const td = datagrid.regular_table.querySelector(
                "tbody tr:nth-child(3) td",
            );

            return getComputedStyle(td).backgroundColor;
        });

        expect(background).toEqual("rgb(255, 0, 0)");
        expect(await saved_plugin_config(page)).toEqual({
            zebra_rows: 2,
            zebra_color: "#ff0000",
        });
    });

    test("zebra_color leaves the config when zebra_rows returns to 0", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore_plugin_config(page, {
            zebra_rows: 3,
            zebra_color: "#00ff00",
        });

        await restore_plugin_config(page, { zebra_rows: 0 });
        expect(await saved_plugin_config(page)).toEqual({});
        expect(await row_zebra_flags(page, 6)).toEqual([
            false,
            false,
            false,
            false,
            false,
            false,
        ]);
    });

    test("row_height sizes body rows and round-trips", async ({ page }) => {
        await goto_ready(page);
        await restore_plugin_config(page, { row_height: 40 });
        const heights = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const rows = [
                ...datagrid.regular_table.querySelectorAll("tbody tr"),
            ].slice(0, 3);

            return rows.map((tr: Element) =>
                Math.round(tr.getBoundingClientRect().height),
            );
        });

        expect(heights).toEqual([40, 40, 40]);
        expect(await saved_plugin_config(page)).toEqual({ row_height: 40 });
    });

    test("font_family and font_size apply to the grid", async ({ page }) => {
        await goto_ready(page);
        await restore_plugin_config(page, {
            font_family: "monospace",
            font_size: 20,
        });

        const style = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const td = datagrid.regular_table.querySelector("tbody td");
            const computed = getComputedStyle(td);
            return {
                font_family: computed.fontFamily,
                font_size: computed.fontSize,
            };
        });

        expect(style).toEqual({ font_family: "monospace", font_size: "20px" });
        expect(await saved_plugin_config(page)).toEqual({
            font_family: "monospace",
            font_size: 20,
        });

        await restore_plugin_config(page, { font_family: "inherit" });
        expect(await saved_plugin_config(page)).toEqual({ font_size: 20 });
    });

    test("word_wrap boxes only override-column cells and keeps rows fixed", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                columns: ["Ship Mode", "Region"],
                columns_config: {
                    "Ship Mode": { column_size_override: 60 },
                },
                plugin_config: { word_wrap: true },
            });

            await viewer.flush();
        });

        const state = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const table = datagrid.regular_table;
            const rows = [...table.querySelectorAll("tbody tr")].slice(0, 4);
            return {
                wrapped: rows.map(
                    (tr: Element) =>
                        tr.children[0].querySelector(".psp-wrap") !== null,
                ),
                unwrapped: rows.map(
                    (tr: Element) =>
                        tr.children[1].querySelector(".psp-wrap") !== null,
                ),
                heights: rows.map((tr: Element) =>
                    Math.round(tr.getBoundingClientRect().height),
                ),
                lines: table.style.getPropertyValue(
                    "--psp-datagrid--wrap-lines",
                ),
            };
        });

        expect(state.wrapped).toEqual([true, true, true, true]);
        expect(state.unwrapped).toEqual([false, false, false, false]);
        expect(new Set(state.heights).size).toEqual(1);
        expect(state.lines).toEqual("1");
        expect(await saved_plugin_config(page)).toEqual({ word_wrap: true });
    });

    test("word_wrap with a taller row_height clamps to the lines that fit", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                columns: ["Ship Mode"],
                columns_config: {
                    "Ship Mode": { column_size_override: 60 },
                },
                plugin_config: {
                    word_wrap: true,
                    row_height: 60,
                    font_size: 12,
                },
            });

            await viewer.flush();
        });

        const state = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const table = datagrid.regular_table;
            const rows = [...table.querySelectorAll("tbody tr")].slice(0, 4);
            return {
                heights: rows.map((tr: Element) =>
                    Math.round(tr.getBoundingClientRect().height),
                ),
                lines: table.style.getPropertyValue(
                    "--psp-datagrid--wrap-lines",
                ),
            };
        });

        expect(state.heights).toEqual([60, 60, 60, 60]);
        expect(state.lines).toEqual("4");
    });

    test("a column narrowed by dragging wraps after that single drag", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                columns: ["Ship Mode", "Region"],
                plugin_config: { word_wrap: true },
            });

            await viewer.flush();
        });

        const handle = page
            .locator(
                "perspective-viewer-datagrid regular-table thead tr:last-of-type th .rt-column-resize",
            )
            .first();

        const pos = (await handle.boundingBox())!;
        await page.mouse.move(pos.x + 2, pos.y + 5);
        await page.mouse.down();
        await page.mouse.move(pos.x - 120, pos.y + 5);
        await page.mouse.up();
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const token = await viewer.save();
            return (
                token.columns_config?.["Ship Mode"]?.column_size_override !==
                undefined
            );
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.flush();
        });

        const wrapped = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const rows = [
                ...datagrid.regular_table.querySelectorAll("tbody tr"),
            ].slice(0, 3);

            return rows.map(
                (tr: Element) =>
                    tr.children[0].querySelector(".psp-wrap") !== null,
            );
        });

        expect(wrapped).toEqual([true, true, true]);
    });

    test("double-clicking a narrowed column's handle unboxes it and restores auto width", async ({
        page,
    }) => {
        await goto_ready(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                columns: ["Ship Mode", "Region"],
                columns_config: {
                    "Ship Mode": { column_size_override: 60 },
                },
                plugin_config: { word_wrap: true },
            });

            await viewer.flush();
        });

        const handle = page
            .locator(
                "perspective-viewer-datagrid regular-table thead tr:last-of-type th .rt-column-resize",
            )
            .first();

        const pos = (await handle.boundingBox())!;
        await page.mouse.dblclick(pos.x + 2, pos.y + 5);
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const token = await viewer.save();
            return (
                token.columns_config?.["Ship Mode"]?.column_size_override ===
                undefined
            );
        });

        const state = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.flush();
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const rows = [
                ...datagrid.regular_table.querySelectorAll("tbody tr"),
            ].slice(0, 3);

            return {
                boxed: rows.map(
                    (tr: Element) =>
                        tr.children[0].querySelector(".psp-wrap") !== null,
                ),
                width: Math.round(
                    rows[0].children[0].getBoundingClientRect().width,
                ),
            };
        });

        expect(state.boxed).toEqual([false, false, false]);
        expect(state.width).toBeGreaterThan(60);
    });

    test("plugin_config_schema gates zebra_color on the supplied zebra_rows", async ({
        page,
    }) => {
        await goto_ready(page);
        const keys = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            return {
                off: datagrid.plugin_config_schema({}, { zebra_rows: 0 })
                    .fields,
                on: datagrid.plugin_config_schema({}, { zebra_rows: 1 }).fields,
            };
        });

        expect(leaf_keys(keys.off)).not.toContain("zebra_color");
        expect(leaf_keys(keys.on)).toContain("zebra_color");
        expect(leaf_keys(keys.on)).toEqual(
            expect.arrayContaining([
                "edit_mode",
                "scroll_lock",
                "column_menus",
                "font_family",
                "font_size",
                "word_wrap",
                "align",
                "row_height",
                "zebra_rows",
            ]),
        );
    });

    test("column_menus hides the header edit row while settings are open", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            settings: true,
            columns: ["Ship Mode", "Sales"],
        });
        const header = async () =>
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                const thead = datagrid.regular_table.querySelector("thead");
                return {
                    rows: thead.children.length,
                    menus: thead.querySelectorAll(".psp-menu-enabled").length,
                    ids: [...thead.children].map((tr: Element) => tr.id),
                };
            });

        expect(await header()).toEqual({
            rows: 2,
            menus: 2,
            ids: ["psp-column-titles", "psp-column-edit-buttons"],
        });

        await restore_plugin_config(page, { column_menus: false });
        expect(await header()).toEqual({
            rows: 1,
            menus: 0,
            ids: [""],
        });

        expect(await saved_plugin_config(page)).toEqual({
            column_menus: false,
        });

        await restore_plugin_config(page, { column_menus: true });
        expect(await header()).toEqual({
            rows: 2,
            menus: 2,
            ids: ["psp-column-titles", "psp-column-edit-buttons"],
        });

        expect(await saved_plugin_config(page)).toEqual({});
    });

    test("column_menus off still marks the selected column on the toggle event itself", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            settings: true,
            columns: ["Ship Mode", "Sales"],
            plugin_config: { column_menus: false },
        });

        const toggle = async (column: string) =>
            await page.evaluate(async (column: string) => {
                const viewer = document.querySelector(
                    "perspective-viewer",
                ) as any;

                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                const fired = new Promise<void>((resolve) =>
                    viewer.addEventListener(
                        "perspective-toggle-column-settings",
                        () => resolve(),
                        { once: true },
                    ),
                );

                const pending = viewer.toggleColumnSettings(column);

                await fired;
                const table = datagrid.regular_table;
                const rows = table.querySelectorAll("tbody tr").length;
                const marked = [
                    ...table.querySelectorAll("tbody td.psp-menu-open"),
                ].map((td: Element) => table.getMeta(td).column_header.at(-1));

                const titles = [
                    ...table.querySelectorAll(
                        "thead tr:first-of-type th.psp-menu-open",
                    ),
                ].map((th: Element) => th.textContent);

                await pending;
                return {
                    rows,
                    marked: [...new Set(marked)],
                    titles,
                    count: marked.length,
                };
            }, column);

        const opened = await toggle("Sales");
        expect(opened.marked).toEqual(["Sales"]);
        expect(opened.count).toEqual(opened.rows);
        expect(opened.titles).toEqual(["Sales"]);

        const closed = await toggle("Sales");
        expect(closed.count).toEqual(0);
        expect(closed.titles).toEqual([]);
    });

    test("align overrides the type default for every column", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, { columns: ["Ship Mode", "Sales"] });
        expect(
            (await column_cell_styles(page, 1))[0].map((c: any) => [
                c.text_align,
                c.vertical_align,
            ]),
        ).toEqual([
            ["left", "middle"],
            ["right", "middle"],
        ]);

        await restore_plugin_config(page, { align: "center" });
        expect(
            (await column_cell_styles(page, 1))[0].map((c: any) => [
                c.text_align,
                c.vertical_align,
            ]),
        ).toEqual([
            ["center", "middle"],
            ["center", "middle"],
        ]);

        expect(await saved_plugin_config(page)).toEqual({ align: "center" });
        await restore_plugin_config(page, { align: "bottom-left" });
        expect(
            (await column_cell_styles(page, 1))[0].map((c: any) => [
                c.text_align,
                c.vertical_align,
            ]),
        ).toEqual([
            ["left", "bottom"],
            ["left", "bottom"],
        ]);

        await restore_plugin_config(page, null);
        expect(
            (await column_cell_styles(page, 1))[0].map((c: any) => [
                c.text_align,
                c.vertical_align,
            ]),
        ).toEqual([
            ["left", "middle"],
            ["right", "middle"],
        ]);

        expect(await saved_plugin_config(page)).toEqual({});
    });

    test("label-bar labels follow grid and column alignment", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Sales"],
            columns_config: { Sales: { fg_mode: "label-bar" } },
        });

        expect(await label_bar_placement(page)).toEqual([
            {
                label_bar: true,
                justify: "flex-end",
                align: "center",
                padding: ["5px", "5px"],
            },
        ]);

        await restore_plugin_config(page, { align: "top-left" });
        expect(
            (await label_bar_placement(page)).map((c: any) => [
                c.justify,
                c.align,
            ]),
        ).toEqual([["flex-start", "flex-start"]]);

        await restore(page, {
            columns_config: {
                Sales: { fg_mode: "label-bar", align: "bottom-center" },
            },
        });

        expect(
            (await label_bar_placement(page)).map((c: any) => [
                c.justify,
                c.align,
            ]),
        ).toEqual([["center", "flex-end"]]);

        await restore_plugin_config(page, null);
        expect(
            (await label_bar_placement(page)).map((c: any) => [
                c.justify,
                c.align,
            ]),
        ).toEqual([["center", "flex-end"]]);
    });

    test("align moves text within the row, in default and pinned rows", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Ship Mode", "Sales"],
            columns_config: { Sales: { align: "bottom-right" } },
            plugin_config: { align: "top-left" },
        });

        const text_top = async () =>
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                const tr = datagrid.regular_table.querySelector("tbody tr");
                const range = document.createRange();
                return [...tr.children].map((cell: Element) => {
                    range.selectNodeContents(cell);
                    const cell_box = cell.getBoundingClientRect();
                    const text_box = range.getBoundingClientRect();
                    return {
                        top: Math.round(text_box.top - cell_box.top),
                        bottom: Math.round(cell_box.bottom - text_box.bottom),
                    };
                });
            });

        let [row] = await column_cell_styles(page, 1);
        expect(row.map((c: any) => c.vertical_align)).toEqual([
            "top",
            "bottom",
        ]);

        let offsets = await text_top();
        expect(offsets[0].top).toBeLessThan(offsets[0].bottom);
        expect(offsets[1].top).toBeGreaterThan(offsets[1].bottom);
        expect(await saved_plugin_config(page)).toEqual({
            align: "top-left",
        });

        await restore(page, { plugin_config: { row_height: 48 } });
        expect(await row_heights(page, 3)).toEqual([48, 48, 48]);
        offsets = await text_top();
        expect(offsets[0].top).toBeLessThan(offsets[0].bottom);
        expect(offsets[1].top).toBeGreaterThan(offsets[1].bottom);

        await restore(page, {
            columns_config: null,
            plugin_config: null,
        });

        await restore(page, { plugin_config: { row_height: 48 } });

        [row] = await column_cell_styles(page, 1);
        expect(row.map((c: any) => c.vertical_align)).toEqual([
            "middle",
            "middle",
        ]);

        offsets = await text_top();
        expect(Math.abs(offsets[0].top - offsets[0].bottom)).toBeLessThan(3);
        expect(await saved_plugin_config(page)).toEqual({ row_height: 48 });
    });

    test("a column's font_size leaves every other column's vertical offset alone", async ({
        page,
    }) => {
        await goto_ready(page);
        const columns_config = {
            "Ship Mode": {
                column_size_override: 200,
                align: "top",
                word_wrap: true,
            },
            Category: { align: "top-left" },
        };

        await restore(page, {
            columns: ["Category", "Ship Mode"],
            columns_config,
            plugin_config: { row_height: 40 },
        });

        const offsets = async () =>
            await page.evaluate(async () => {
                const datagrid = document.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;

                const tr = datagrid.regular_table.querySelector("tbody tr");
                const range = document.createRange();
                return [...tr.children].map((cell: Element) => {
                    range.selectNodeContents(cell);
                    const cell_box = cell.getBoundingClientRect();
                    const text_box = range.getBoundingClientRect();
                    return {
                        top: Math.round(text_box.top - cell_box.top),
                        bottom: Math.round(cell_box.bottom - text_box.bottom),
                    };
                });
            });

        const before = await offsets();
        expect(before[0].top).toBeLessThan(before[0].bottom);
        await restore(page, {
            columns_config: {
                ...columns_config,
                Category: { align: "top-left", font_size: 20 },
            },
        });

        const after = await offsets();
        expect(after[1]).toEqual(before[1]);
        expect(after[0].top).toBeLessThan(after[0].bottom);
        expect(new Set(await row_heights(page, 3)).size).toEqual(1);
    });

    test("a column's font settings override the grid's for its body cells only", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Ship Mode", "Sales"],
            plugin_config: { font_size: 14, align: "center" },
            columns_config: {
                Sales: {
                    font_family: "monospace",
                    font_size: 30,
                    align: "left",
                },
            },
        });

        const [row] = await column_cell_styles(page, 1);
        expect(row[0].font_size).toEqual("14px");
        expect(row[0].text_align).toEqual("center");
        expect(row[0].font_family).not.toEqual("monospace");
        expect(row[1]).toEqual({
            font_family: "monospace",
            font_size: "30px",
            text_align: "left",
            vertical_align: "middle",
            wrapped: false,
        });

        const header_font = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const ths = [
                ...datagrid.regular_table.querySelectorAll(
                    "thead tr:last-of-type th",
                ),
            ];

            return getComputedStyle(ths[ths.length - 1]).fontSize;
        });

        expect(header_font).toEqual("14px");
        expect(new Set(await row_heights(page, 5)).size).toEqual(1);
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return (await viewer.save()).columns_config;
        });

        expect(saved).toEqual({
            Sales: {
                font_family: "monospace",
                font_size: 30,
                align: "left",
            },
        });
    });

    test("bold and italic apply grid-wide, per column on any type, and link renders anchors", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Ship Mode", "Sales", "Region"],
            plugin_config: { bold: true },
            columns_config: {
                Sales: { italic: true },
                Region: { bold: false, link: true },
            },
        });

        const state = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const tr = datagrid.regular_table.querySelector("tbody tr");
            return [...tr.children].map((cell: Element) => {
                const computed = getComputedStyle(cell);
                return {
                    weight: computed.fontWeight,
                    style: computed.fontStyle,
                    anchor: cell.querySelector("a") !== null,
                };
            });
        });

        expect(state.map((c: any) => c.weight)).toEqual(["700", "700", "400"]);
        expect(state.map((c: any) => c.style)).toEqual([
            "normal",
            "italic",
            "normal",
        ]);

        expect(state.map((c: any) => c.anchor)).toEqual([false, false, true]);
        expect(await saved_plugin_config(page)).toEqual({ bold: true });
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return (await viewer.save()).columns_config;
        });

        expect(saved).toEqual({
            Sales: { italic: true },
            Region: { bold: false, link: true },
        });
    });

    test("a column's font_size larger than the row keeps rows at the theme height", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, { columns: ["Ship Mode", "Sales"] });
        const before = await row_heights(page, 5);
        await restore(page, {
            columns_config: { Sales: { font_size: 40 } },
        });

        expect(await row_heights(page, 5)).toEqual(before);
        await restore(page, { columns_config: {} });
        expect(await row_heights(page, 5)).toEqual(before);
    });

    test("a column's word_wrap overrides the grid's in both directions", async ({
        page,
    }) => {
        await goto_ready(page);
        await restore(page, {
            columns: ["Ship Mode", "Region"],
            columns_config: {
                "Ship Mode": { column_size_override: 60, word_wrap: true },
                Region: { column_size_override: 60 },
            },
        });

        let rows = await column_cell_styles(page, 3);
        expect(rows.map((r: any) => r[0].wrapped)).toEqual([true, true, true]);
        expect(rows.map((r: any) => r[1].wrapped)).toEqual([
            false,
            false,
            false,
        ]);

        await restore(page, {
            columns_config: {
                "Ship Mode": { column_size_override: 60, word_wrap: false },
                Region: { column_size_override: 60 },
            },
            plugin_config: { word_wrap: true },
        });

        rows = await column_cell_styles(page, 3);
        expect(rows.map((r: any) => r[0].wrapped)).toEqual([
            false,
            false,
            false,
        ]);

        expect(rows.map((r: any) => r[1].wrapped)).toEqual([true, true, true]);
    });

    test("column_config_schema's font group defaults to the grid's plugin_config", async ({
        page,
    }) => {
        await goto_ready(page);
        const defaults = await page.evaluate(async () => {
            const datagrid = document.querySelector(
                "perspective-viewer-datagrid",
            ) as any;

            const viewer = document.querySelector("perspective-viewer") as any;
            const schema = (plugin_config: any) =>
                viewer
                    .restore({ plugin_config })
                    .then(() => viewer.flush())
                    .then(
                        () =>
                            datagrid.column_config_schema(
                                "string",
                                undefined,
                                "Ship Mode",
                                null,
                                {},
                            ).fields,
                    );

            return {
                base: await schema({}),
                custom: await schema({
                    font_family: "monospace",
                    font_size: 18,
                    word_wrap: true,
                    align: "bottom-right",
                }),
            };
        });

        const pick = (fields: any[]) => {
            const all = leaf_defaults(fields);
            return {
                font_family: all.font_family,
                font_size: all.font_size,
                word_wrap: all.word_wrap,
                align: all.align,
            };
        };

        expect(pick(defaults.base)).toEqual({
            font_family: "inherit",
            font_size: expect.any(Number),
            word_wrap: false,
            align: undefined,
        });

        expect(pick(defaults.custom)).toEqual({
            font_family: "monospace",
            font_size: 18,
            word_wrap: true,
            align: "bottom-right",
        });

        expect(leaf_keys(defaults.base)).toEqual(
            expect.arrayContaining([
                "column_size_override",
                "font_family",
                "font_size",
                "word_wrap",
                "align",
                "fg_mode",
                "bg_mode",
            ]),
        );
    });
});
