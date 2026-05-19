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

test.describe("View Lifecycle", () => {
    test("conflation > silences view-not-found during rapid restore", async ({
        page,
    }) => {
        await page.goto(
            "/rust/perspective-viewer/test/html/superstore_lazy_viewer.html",
        );

        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        let vnf = false;
        page.on("console", (msg) => {
            if (msg.type() === "error") {
                if (msg.text().includes("View not found")) {
                    vnf = true;
                }
            }
        });

        await page.evaluate(async () => {
            const worker = window.__TEST_WORKER__;
            let resolve;
            let is_paused = false;
            const BasePlugin = customElements.get("perspective-viewer-plugin");
            class PausePlugin extends BasePlugin {
                get_static_config() {
                    return {
                        name: "pause-plugin",
                        select_mode: "select",
                        config_column_names: [],
                    };
                }

                async draw(view) {
                    if (is_paused) {
                        await new Promise((x) => {
                            resolve = x;
                        });
                    }

                    const size = await view.num_rows();
                    this.textContent = `Rows: ${size}`;
                }
            }

            customElements.define("pause-plugin", PausePlugin);
            const Viewer = customElements.get("perspective-viewer");
            Viewer.registerPlugin("pause-plugin");

            // use a new viewer because only new viewers get loaded with the registered plugin
            const viewer = document.createElement("perspective-viewer");
            document.body.append(viewer);
            worker.table("a,b,c\n1,2,3", { name: "A" });

            await viewer.load(worker);
            await viewer.restore({ table: "A", plugin: "pause-plugin" });
            is_paused = true;

            // Change in 4.1.0 - empty restore now does not render
            const restore_task = viewer.restore({
                plugin: "pause-plugin",
            });

            while (!resolve) {
                await new Promise((x) => setTimeout(x, 0));
            }

            await new Promise((x) => setTimeout(x, 0));
            resolve();
            resolve = undefined;
            is_paused = false;
            await restore_task;
        });

        expect(vnf).toBeFalsy();
    });
});
