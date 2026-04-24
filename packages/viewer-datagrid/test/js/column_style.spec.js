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

async function test_column(page, selector, container_class) {
    const { x, y } = await page.evaluate(async (selector) => {
        const viewer = document.querySelector("perspective-viewer");
        await viewer.getTable();
        await viewer.toggleConfig();
        window.__events__ = [];
        viewer.addEventListener("perspective-config-update", (evt) => {
            window.__events__.push(evt);
        });

        const header_button = viewer
            .querySelector("perspective-viewer-datagrid")
            .shadowRoot.querySelector(
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer").restore({
                plugin: "Datagrid",
            });
        });

        const { x, y } = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            // Await the table load
            await viewer.getTable();

            // Open the config panel
            await viewer.toggleConfig();

            // Register a listener for `perspective-config-update` event
            window.__events__ = [];
            viewer.addEventListener("perspective-config-update", (evt) => {
                console.log(evt.type, evt.detail);
                window.__events__.push(evt);
            });
            viewer.addEventListener(
                "perspective-column-style-change",
                (evt) => {
                    // console.log(evt.type, evt.detail);
                    window.__events__.push(evt);
                },
            );

            // Find the column config menu button
            const header_button = viewer
                .querySelector("perspective-viewer-datagrid")
                .shadowRoot.querySelector(
                    "regular-table thead tr:last-child th",
                );

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
            const bar_button = style_menu.querySelector("select");

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
            const viewer = document.querySelector("perspective-viewer");
            // Await the plugin rendering
            await viewer.flush();

            // Count the events;
            return window.__events__.length;
        });

        // Expect 1 event
        expect(count).toEqual(2);
    });

    test("Pulse styling works", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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

    test("Pulse styling works when settings panel is open", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer").restore({
                plugin: "Datagrid",
            });
        });

        const contents = await test_column(page, "", "tab-section");
        await compareContentsToSnapshot(contents);
    });

    test("Column style menu opens for string columns", async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            await document.querySelector("perspective-viewer").restore({
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
    // background `ColorRange` and gradient `Number` max) when
    // `number_bg_mode` is set to `gradient`.
    // ──────────────────────────────────────────────────────────────────
    test("Sidebar surfaces gradient controls when bg_mode = gradient", async ({
        page,
    }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            const viewer = document.querySelector("perspective-viewer");
            const editBtn = viewer
                .querySelector("perspective-viewer-datagrid")
                .shadowRoot.querySelector(
                    "#psp-column-edit-buttons th.psp-menu-enabled:nth-child(2) span",
                );

            const rect = editBtn.getBoundingClientRect();
            return {
                x: Math.floor(rect.left + rect.width / 2),
                y: Math.floor(rect.top + rect.height / 2),
            };
        });

        await page.mouse.click(x, y);

        // The schema for `Profit` with bg_mode=gradient should emit a
        // `ColorRange` (background-pos/neg) and a `Number` field for
        // `bg_gradient`. Both are tab-section children in the StyleTab.
        await page
            .locator("perspective-viewer #column_settings_sidebar")
            .waitFor();

        const sidebar_locator = page.locator(
            "perspective-viewer #column_settings_sidebar #style-tab",
        );

        // Background ColorRange ids derive from the `label`
        // ("background") in the Datagrid schema.
        await sidebar_locator.locator(".pos_bg_color").waitFor();
        await sidebar_locator.locator(".neg_bg_color").waitFor();

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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
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
});
