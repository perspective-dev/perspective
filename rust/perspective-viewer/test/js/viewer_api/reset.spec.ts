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

import { test, compareContentsToSnapshot } from "../helpers.ts";

import { DataGrid } from "@perspective-dev/test/src/js/models/plugins/datagrid.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/tools/test/src/html/superstore-test.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Reset", () => {
    // Regression: a soft reset after a plugin swap used to leave the
    // restored default plugin without its preserved `columns_config`.
    // The old `reset_all` snapshotted the *active* plugin's bucket
    // (Y Bar — empty), then `plugin.restore({}, Some(empty))` overwrote
    // the per-plugin bucket that `commit_plugin_idx` had just restored
    // on the default (Datagrid) plugin. The first (and only) post-reset
    // draw rendered Profit cells unformatted. Routing reset through
    // `restore_and_render`'s two-pass materialized restore fixes it.
    test("soft reset restores columns_config after plugin swap", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            await viewer.getTable();
            await viewer.restore({
                plugin: "Datagrid",
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
            await viewer.restore({ plugin: "Y Bar" });
            await viewer.reset();
        });

        const datagrid = new DataGrid(page);
        const contents = await datagrid.regularTable.table.innerHTML();
        await compareContentsToSnapshot(contents);
    });
});
