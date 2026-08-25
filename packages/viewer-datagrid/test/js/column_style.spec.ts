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

import { test, expect } from "@perspective-dev/test";
import { compareContentsToSnapshot } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

async function test_column(
    page: Page,
    selector: string,
    container_class: string,
): Promise<string> {
    const { x, y } = await page.evaluate(async (selector) => {
        const viewer = document.querySelector("perspective-viewer")!;
        await viewer.getTable();
        await viewer.toggleConfig();
        (window as any).__events__ = [];
        viewer.addEventListener("perspective-config-update", (evt) => {
            (window as any).__events__.push(evt);
        });

        const header_button = (
            viewer.querySelector("perspective-viewer-datagrid") as any
        ).shadowRoot.querySelector(
            "regular-table thead tr:last-child th" + selector,
        );

        const rect = header_button.getBoundingClientRect();
        return {
            x: Math.floor(rect.left + rect.width / 2),
            y: Math.floor(rect.top + (3 * rect.height) / 4),
        };
    }, selector);

    await page.mouse.click(x, y);
    const column_style_selector = `#column-style-container.${container_class}`;
    await page.waitForSelector(column_style_selector);

    await new Promise((x) => setTimeout(x, 3000));

    return await page
        .locator(`perspective-viewer ${column_style_selector}`)
        .innerHTML();
}

test.describe("Column Style Tests", () => {
    test.skip("perspective-config-update event is fired when column style is changed", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                plugin: "Datagrid",
            });
        });

        const { x, y } = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // Await the table load
            await viewer.getTable();

            // Open the config panel
            await viewer.toggleConfig();

            // Register a listener for `perspective-config-update` event
            (window as any).__events__ = [];
            viewer.addEventListener("perspective-config-update", (evt) => {
                console.log(evt.type, evt.detail);
                (window as any).__events__.push(evt);
            });
            viewer.addEventListener(
                "perspective-column-style-change",
                (evt) => {
                    // console.log(evt.type, evt.detail);
                    (window as any).__events__.push(evt);
                },
            );

            // Find the column config menu button
            const header_button = (
                viewer.querySelector("perspective-viewer-datagrid") as any
            ).shadowRoot.querySelector("regular-table thead tr:last-child th");

            // Get the button coords (slightly lower than center
            // because of the location of the menu button within
            // this element)
            const rect = header_button.getBoundingClientRect();
            return {
                x: Math.floor(rect.left + rect.width / 2),
                y: Math.floor(rect.top + (3 * rect.height) / 4),
            };
        });

        // Click the menu button
        await page.mouse.click(x, y);

        // Await the style menu existing on the page
        const style_menu = await page.waitForSelector(
            "#column-style-container",
        );

        const { x: xx, y: yy } = await page.evaluate(async (style_menu) => {
            // Find the 'bar' button
            const bar_button = style_menu.querySelector("select")!;

            // Get its coords
            const rect = bar_button.getBoundingClientRect();
            return {
                x: Math.floor(rect.left + rect.width / 2),
                y: Math.floor(rect.top + rect.height / 2),
            };
        }, style_menu);

        // Click the button
        await page.mouse.click(xx, yy);

        const count = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // Await the plugin rendering
            await viewer.flush();

            // Count the events;
            return (window as any).__events__.length;
        });

        // Expect 1 event
        expect(count).toEqual(2);
    });

    test.skip("Pulse styling works", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Sales"],
                columns_config: {
                    Sales: {
                        datagrid_number_style: { number_bg_mode: "pulse" },
                    },
                },
            });

            const table = await viewer.getTable();
            await table.update([{ "Row ID": 1, Sales: 2 }]);
            await viewer.resize();
            await table.update([{ "Row ID": 1, Sales: 3 }]);
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test.skip("Pulse styling works when settings panel is open", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Sales"],
                settings: true,
                columns_config: {
                    Sales: {
                        datagrid_number_style: { number_bg_mode: "pulse" },
                    },
                },
            });

            const table = await viewer.getTable();
            await table.update([{ "Row ID": 1, Sales: 2 }]);
            await viewer.resize();
            await table.update([{ "Row ID": 1, Sales: 3 }]);
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("Column style menu opens for numeric columns", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                plugin: "Datagrid",
            });
        });

        const contents = await test_column(page, "", "tab-section");
        await compareContentsToSnapshot(contents);
    });

    test("Column style label-bar", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                columns_config: {
                    "Row ID": {
                        number_fg_mode: "label-bar",
                    },
                },
                plugin: "Datagrid",
                settings: true,
                sort: [["Order ID", "desc"]],
                columns: ["Row ID", "Order ID"],
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("Column style label-bar on an expression column", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                columns_config: {
                    test: {
                        number_fg_mode: "label-bar",
                    },
                },
                plugin: "Datagrid",
                settings: true,
                expressions: { test: `"Row ID" + 100` },
                sort: [["Order ID", "desc"]],
                columns: ["test", "Row ID", "Order ID"],
            });
        });

        await page.pause();
        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("Column style menu opens for string columns", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer")!.restore({
                plugin: "Datagrid",
            });
        });

        const contents = await test_column(
            page,
            ":nth-child(2)",
            "string-column-style-container",
        );

        await compareContentsToSnapshot(contents);
    });

    // ──────────────────────────────────────────────────────────────────
    // Foreground rendering modes against a float column that contains
    // negatives ("Profit"), so the pos/neg color split has signal in
    // both halves of the range.
    // ──────────────────────────────────────────────────────────────────
    test("Bar foreground on float column with negatives", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Profit"],
                columns_config: {
                    Profit: { number_fg_mode: "bar" },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("Label-bar foreground on float column with negatives", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Profit"],
                columns_config: {
                    Profit: { number_fg_mode: "label-bar" },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("Label-bar foreground + gradient background on float column", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Profit"],
                columns_config: {
                    Profit: {
                        number_fg_mode: "label-bar",
                        number_bg_mode: "gradient",
                    },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    // ──────────────────────────────────────────────────────────────────
    // Sidebar should re-query schema and surface extra controls (the
    // `number_bg_mode` is set to `gradient`.
    // ──────────────────────────────────────────────────────────────────
    test("Sidebar surfaces gradient controls when bg_mode = gradient", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Profit"],
                settings: true,
                columns_config: {
                    Profit: { number_bg_mode: "gradient" },
                },
            });
        });

        const { x, y } = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            const editBtn = (
                viewer.querySelector("perspective-viewer-datagrid") as any
            ).shadowRoot.querySelector(
                "#psp-column-edit-buttons th.psp-menu-enabled:nth-child(2) span",
            );

            const rect = editBtn.getBoundingClientRect();
            return {
                x: Math.floor(rect.left + rect.width / 2),
                y: Math.floor(rect.top + rect.height / 2),
            };
        });

        await page.mouse.click(x, y);

        await page
            .locator("perspective-viewer #column_settings_sidebar")
            .waitFor();

        const sidebar_locator = page.locator(
            "perspective-viewer #column_settings_sidebar #style-tab",
        );

        const bg_field = sidebar_locator.locator("fieldset.style-control", {
            has: page.locator("#bg_colors-label"),
        });

        await bg_field.locator(".gradient-stops-selector").waitFor();
        await expect(bg_field.locator(".gradient-stop-handle")).toHaveCount(3);

        // Snapshot the sidebar's style-tab DOM as a holistic check.
        const contents = await sidebar_locator.innerHTML();
        await compareContentsToSnapshot(contents);
    });

    // ──────────────────────────────────────────────────────────────────
    // At least one columns_config setting from each column type renders
    // a visible change in the grid when applied.
    // ──────────────────────────────────────────────────────────────────
    test("float number_format use_grouping renders in grid", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Sales"],
                columns_config: {
                    Sales: {
                        number_format: { use_grouping: "always" },
                    },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("integer number_format notation renders in grid", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID"],
                columns_config: {
                    "Row ID": {
                        number_format: { notation: "compact" },
                    },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("string format renders in grid", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "State"],
                columns_config: {
                    State: { format: "bold" },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("date date_format renders in grid", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Order Date"],
                columns_config: {
                    "Order Date": {
                        date_format: {
                            date_style: "full",
                            time_style: "medium",
                        },
                    },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    test("datetime date_format renders in grid", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                // Order Date is a datetime in basic-test fixture.
                columns: ["Row ID", "Order Date"],
                columns_config: {
                    "Order Date": {
                        date_format: {
                            date_style: "long",
                            time_style: "long",
                        },
                    },
                },
            });
        });

        const contents = await page
            .locator(`perspective-viewer-datagrid regular-table`)
            .innerHTML();

        await compareContentsToSnapshot(contents);
    });

    // Regression: a single `restore()` carrying both `plugin_config` and
    // `columns_config` used to drop `columns_config` because
    // `restore_and_render` combined them with a short-circuiting `||`.
    // Asserting via `save()` keeps the test independent of any plugin's
    // rendering choices.
    test("first restore applies columns_config when plugin_config is also set", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Row ID", "Sales"],
                plugin_config: { edit_mode: "EDIT" },
                columns_config: {
                    Sales: { number_bg_mode: "pulse" },
                },
            });
            return await viewer.save();
        });

        expect(saved.plugin_config).toEqual({ edit_mode: "EDIT" });
        expect(saved.columns_config).toEqual({
            Sales: { number_bg_mode: "pulse" },
        });
    });

    test("first restore applies columns_config + plugin_config without an explicit plugin", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                columns: ["Row ID", "Sales"],
                plugin_config: { edit_mode: "EDIT" },
                columns_config: {
                    Sales: { number_bg_mode: "pulse" },
                },
            });
            return await viewer.save();
        });

        expect(saved.plugin_config).toEqual({ edit_mode: "EDIT" });
        expect(saved.columns_config).toEqual({
            Sales: { number_bg_mode: "pulse" },
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────

    async function gradient_cells(
        page: Page,
        columns_config: Record<string, unknown>,
    ): Promise<Array<{ text: string; bg: string }>> {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        return await page.evaluate(async (columns_config) => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Profit"],
                sort: [["Profit", "asc"]],
                columns_config,
            } as any);

            await viewer.flush();
            await new Promise((x) => setTimeout(x, 100));
            const tds = Array.from(
                (
                    viewer.querySelector("perspective-viewer-datagrid") as any
                ).shadowRoot.querySelectorAll("regular-table tbody td"),
            );

            return tds.map((td: any) => ({
                text: td.textContent.trim(),
                bg: td.style.backgroundColor,
            }));
        }, columns_config);
    }

    test("string series mode cycles the theme's --psp-datagrid--series-N--color palette", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const { cells, palette } = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                columns: ["Category"],
                columns_config: { Category: { string_color_mode: "series" } },
            } as any);

            await viewer.flush();
            await new Promise((x) => setTimeout(x, 100));
            const style = getComputedStyle(viewer);
            const palette: string[] = [];
            for (let i = 1; ; i++) {
                const raw = style
                    .getPropertyValue(`--psp-datagrid--series-${i}--color`)
                    .trim();
                if (!raw) {
                    break;
                }

                const probe = document.createElement("div");
                probe.style.color = raw;
                document.body.appendChild(probe);
                palette.push(getComputedStyle(probe).color);
                probe.remove();
            }

            const tds = Array.from(
                (
                    viewer.querySelector("perspective-viewer-datagrid") as any
                ).shadowRoot.querySelectorAll("regular-table tbody td"),
            );

            return {
                palette,
                cells: tds.map((td: any) => ({
                    text: td.textContent.trim(),
                    bg: td.style.backgroundColor,
                })),
            };
        });

        expect(palette.length).toBeGreaterThan(1);
        const filled = cells.filter((c) => c.text !== "");
        expect(filled.length).toBeGreaterThan(0);
        for (const cell of filled) {
            expect(palette).toContain(cell.bg);
        }

        expect(filled[0].bg).toBe(palette[0]);
        const by_value = new Map<string, string>();
        for (const cell of filled) {
            const prior = by_value.get(cell.text);
            expect(prior === undefined || prior === cell.bg).toBe(true);
            by_value.set(cell.text, cell.bg);
        }
    });

    test("bg gradient renders full-scale end colors beyond the domain", async ({
        page,
    }) => {
        const cells = await gradient_cells(page, {
            Profit: {
                number_bg_mode: "gradient",
                bg_gradient: 100,
                bg_colors:
                    "linear-gradient(to right, #ff0000 0%, #ffffff 50%, #0000ff 100%)",
            },
        });

        const saturated = cells.filter(
            (c) =>
                c.text !== "" &&
                Math.abs(parseFloat(c.text.replace(/,/g, ""))) > 100,
        );
        expect(saturated.length).toBeGreaterThan(0);
        for (const cell of saturated) {
            expect(cell.bg).toEqual(
                cell.text.startsWith("-") ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)",
            );
        }
    });

    test("bg gradient samples interior stops", async ({ page }) => {
        const cells = await gradient_cells(page, {
            Profit: {
                number_bg_mode: "gradient",
                bg_gradient: 1e12,
                bg_colors:
                    "linear-gradient(to right, #ff0000 0%, #123456 50%, #0000ff 100%)",
            },
        });

        const filled = cells.filter((c) => c.text !== "");
        expect(filled.length).toBeGreaterThan(0);
        for (const cell of filled) {
            expect(cell.bg).toEqual("rgb(18, 52, 86)");
        }
    });

    test("bg_colors under color mode renders the END colors by sign", async ({
        page,
    }) => {
        const cells = await gradient_cells(page, {
            Profit: {
                number_bg_mode: "color",
                bg_colors: "linear-gradient(#ff0000, #123456, #0000ff)",
            },
        });

        const negatives = cells.filter((c) => c.text.startsWith("-"));
        const positives = cells.filter(
            (c) => !c.text.startsWith("-") && c.text !== "",
        );

        expect(negatives.length).toBeGreaterThan(0);
        expect(positives.length).toBeGreaterThan(0);
        for (const cell of negatives) {
            expect(cell.bg).toEqual("rgb(255, 0, 0)");
        }

        for (const cell of positives) {
            expect(cell.bg).toEqual("rgb(0, 0, 255)");
        }
    });

    test("color input node is replaced on column switch and stale events write nothing", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.restore({
                plugin: "Datagrid",
                group_by: ["State"],
                settings: true,
            });
            await viewer.flush();
        });

        const open_editor = async (nth: number) => {
            const target = await page.evaluate(async (nth) => {
                const viewer = document.querySelector("perspective-viewer")!;
                const datagrid = viewer.querySelector(
                    "perspective-viewer-datagrid",
                ) as any;
                const rt = datagrid.shadowRoot.querySelector("regular-table");
                const ths = Array.from(
                    rt.querySelectorAll(
                        "#psp-column-edit-buttons th.psp-menu-enabled",
                    ),
                ) as any[];
                const th = ths[nth];
                const meta = rt.getMeta(th);
                const rect = th.getBoundingClientRect();
                return {
                    column: meta?.column_header?.[0],
                    x: Math.floor(rect.left + rect.width / 2),
                    y: Math.floor(rect.top + rect.height / 2),
                };
            }, nth);

            await page.mouse.click(target.x, target.y);
            await page
                .locator(
                    "perspective-viewer #column_settings_sidebar #style-tab input[type=color]",
                )
                .first()
                .waitFor();
            return target.column;
        };

        const col_a = await open_editor(2);
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            const root = (viewer.shadowRoot ?? viewer) as any;
            (window as any).__held_input__ = root.querySelector(
                "#column_settings_sidebar #style-tab input[type=color]",
            );
        });

        const col_b = await open_editor(4);
        expect(col_b).not.toEqual(col_a);

        // The old column's input node must have been REPLACED, which
        // dismisses any open native color chooser bound to it.
        const held = await page.evaluate(() => {
            const input = (window as any).__held_input__;
            const viewer = document.querySelector("perspective-viewer")!;
            const root = (viewer.shadowRoot ?? viewer) as any;
            const current = root.querySelector(
                "#column_settings_sidebar #style-tab input[type=color]",
            );
            const same_node = input === current;
            input.value = "#aa00aa";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return { same_node, connected: input.isConnected };
        });

        expect(held.same_node).toEqual(false);
        expect(held.connected).toEqual(false);

        // The stale event must not have written ANY column's config.
        await new Promise((x) => setTimeout(x, 300));
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.flush();
            return (await viewer.save()).columns_config ?? {};
        });

        expect(JSON.stringify(saved)).not.toContain("#aa00aa");

        // Sanity: the CURRENT column's input still works and writes the
        // currently-open column.
        await page
            .locator(
                "perspective-viewer #column_settings_sidebar #style-tab input[type=color]",
            )
            .first()
            .evaluate((el: any) => {
                el.value = "#00ff00";
                el.dispatchEvent(new Event("input", { bubbles: true }));
            });

        await new Promise((x) => setTimeout(x, 300));
        const saved2 = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.flush();
            return (await viewer.save()).columns_config ?? {};
        });

        expect(saved2[col_b]?.fg_colors).toMatch(
            /^linear-gradient\(to right, #00ff00 0%, #[0-9a-f]{6} 100%\)$/,
        );
        expect(saved2[col_a]).toBeUndefined();
    });

    test("repeated restore with plugin_config + columns_config is stable", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const [first, second] = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            const payload = {
                plugin: "Datagrid",
                columns: ["Row ID", "Sales"],
                plugin_config: { edit_mode: "EDIT" },
                columns_config: {
                    Sales: { number_bg_mode: "pulse" },
                },
            };
            await viewer.restore(payload);
            const first = await viewer.save();
            await viewer.restore(payload);
            const second = await viewer.save();
            return [first, second];
        });

        expect(first.plugin_config).toEqual({ edit_mode: "EDIT" });
        expect(first.columns_config).toEqual({
            Sales: { number_bg_mode: "pulse" },
        });
        expect(second.plugin_config).toEqual(first.plugin_config);
        expect(second.columns_config).toEqual(first.columns_config);
    });
});
