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

import {
    test,
    getSvgContentString,
    compareSVGContentsToSnapshot,
    PageView,
} from "@perspective-dev/test";

import EXAMPLES from "../../src/components/ExampleGallery/features";

test.describe.configure({ mode: "parallel" });

test.describe("Examples", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("docs/template.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    for (const idx in EXAMPLES.default) {
        const example = EXAMPLES.default[idx];
        test(`${idx} - ${example.name}`, async ({ page }) => {
            const { config } = example;
            const new_config = Object.assign(
                {
                    plugin: "Datagrid",
                    group_by: [],
                    expressions: {},
                    split_by: [],
                    sort: [],
                    aggregates: {},
                },
                config,
            );
            await page.evaluate(async (config) => {
                const viewer = document.querySelector("perspective-viewer");
                viewer?.addEventListener("perspective-config-update", (e) => {
                    window.__CONFIG_UPDATED__ = true;
                    console.log(e);
                });
                await viewer.reset();
                await viewer.restore(config);
            }, new_config);

            if (Object.keys(config).length !== 0) {
                await page.evaluate(async () => {
                    while (!window["__CONFIG_UPDATED__"]) {
                        await new Promise((x) => setTimeout(x, 10));
                    }
                });
            }

            let selector = "";
            if (new_config.plugin === "Datagrid") {
                selector = "perspective-viewer-datagrid";
            } else if (new_config.plugin === "Map Scatter") {
                selector = "perspective-viewer-openlayers-scatter";
            } else {
                const plugin = new_config.plugin
                    .replace(/[-\/\s]/gi, "")
                    .toLowerCase();
                selector = `perspective-viewer-charts-${plugin}`;
            }

            await compareSVGContentsToSnapshot(page, selector, [
                `${idx}-${example.name}.txt`,
            ]);
        });
    }
});

test.beforeEach(async ({ page }) => {
    await page.goto("docs/template.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});
test("test svgs", async ({ page }) => {
    const viewer = new PageView(page);
    await viewer.restore({ plugin: "X/Y Scatter" });
    const contents = await getSvgContentString(
        "perspective-viewer-charts-xyscatter",
    )(page);
    console.log(contents);
});
