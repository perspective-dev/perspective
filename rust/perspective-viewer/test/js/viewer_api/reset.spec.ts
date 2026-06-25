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

// Uses test-only plugins ("Debug Styled" / "Debug Alt") declared in the
// viewer test module so this spec does not depend on the descendant
// `@perspective-dev/viewer-datagrid` / `-charts` packages.
test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-debug.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Reset", () => {
    test("soft reset restores columns_config after plugin swap", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.restore({
                plugin: "Debug Styled",
                columns: ["Profit"],
                columns_config: {
                    Profit: {
                        number_format: {
                            style: "currency",
                            currency: "USD",
                        },
                    },
                },
            });

            await viewer.restore({ plugin: "Debug Alt" });
            await viewer.reset();
            await viewer.flush();

            // The active plugin is slotted into the viewer's light DOM, not
            // its shadow root.
            const plugin = viewer.querySelector(
                "perspective-viewer-debug-styled",
            ) as any;

            const config = await viewer.save();
            return {
                active_plugin: config.plugin,
                saved_columns_config: config.columns_config,
                applied_columns_config: plugin?._restored_columns_config,
            };
        });

        // Soft reset reverts to the default plugin ...
        expect(result.active_plugin).toBe("Debug Styled");

        // ... the preserved `columns_config` is re-applied to that plugin
        // (the plugin's own `restore()` saw it) ...
        expect(result.applied_columns_config).toMatchObject({
            Profit: {
                number_format: {
                    style: "currency",
                    currency: "USD",
                },
            },
        });

        // ... and it survives the round-trip back out through `save()`.
        expect(result.saved_columns_config).toMatchObject({
            Profit: {
                number_format: {
                    style: "currency",
                    currency: "USD",
                },
            },
        });
    });
});
