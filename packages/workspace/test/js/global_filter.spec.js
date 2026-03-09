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

import { test, expect } from "@playwright/test";
import {
    compareLightDOMContents,
    compareShadowDOMContents,
} from "@perspective-dev/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/tools/test/src/html/workspace-test.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
    await page.evaluate(async () => {
        const { PerspectiveSelectDetail } = await import(
            "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js"
        );
        window.PerspectiveSelectDetail = PerspectiveSelectDetail;
    });
});

function tests(context, compare) {
    test("treemap filters work", async ({ page }) => {
        const config = {
            viewers: {
                One: {
                    table: "superstore",
                    name: "Test",
                    group_by: ["State"],
                    columns: ["Sales"],
                    plugin: "Treemap",
                },
                Two: { table: "superstore", name: "One" },
            },
            master: {
                widgets: ["One"],
            },
            detail: {
                main: {
                    currentIndex: 0,
                    type: "tab-area",
                    widgets: ["Two"],
                },
            },
        };

        const cfg = await page.evaluate(async (config) => {
            const workspace = document.getElementById("workspace");
            await workspace.restore(config);
            await workspace.flush();
            const timer = Promise.withResolvers();
            workspace.addEventListener("workspace-layout-update", (x) => {
                timer.resolve();
            });

            document
                .querySelector("perspective-viewer-d3fc-treemap")
                .shadowRoot.querySelector("g.treemap > g")
                .dispatchEvent(new Event("click"));

            await timer.promise;
            return await workspace.save();
        }, config);

        expect(cfg.viewers.Two.filter).toEqual([["State", "==", "Alabama"]]);
        return compare(page, `${context}-treemap-filters-work.txt`);
    });

    test("Datagrid filters work", async ({ page }) => {
        const config = {
            viewers: {
                One: {
                    table: "superstore",
                    name: "Test",
                    group_by: ["State"],
                    columns: ["Sales"],
                    plugin: "Datagrid",
                },
                Two: { table: "superstore", name: "One" },
            },
            master: {
                widgets: ["One"],
            },
            detail: {
                main: {
                    currentIndex: 0,
                    type: "tab-area",
                    widgets: ["Two"],
                },
            },
        };

        async function awaitConfigChange() {
            return await page.evaluate(async () => {
                let resolve;
                const timer = new Promise((x) => {
                    resolve = x;
                });

                workspace.addEventListener("workspace-layout-update", resolve);
                await timer;
                workspace.removeEventListener(
                    "workspace-layout-update",
                    resolve,
                );

                return await workspace.save();
            });
        }

        await page.evaluate(async (config) => {
            const workspace = document.getElementById("workspace");
            await workspace.restore(config);
            await workspace.flush();
        }, config);

        let cfgPromise = awaitConfigChange();
        await page
            .locator(".workspace-master-widget perspective-viewer-datagrid")
            .locator("tbody tr:nth-child(6) th:last-of-type")
            .click();

        let cfg = await cfgPromise;
        expect(cfg.viewers.Two.filter).toEqual([["State", "==", "Colorado"]]);

        cfgPromise = awaitConfigChange();
        await page
            .locator(".workspace-master-widget perspective-viewer-datagrid")
            .locator("tbody tr:nth-child(6) th:last-of-type")
            .click();

        cfg = await cfgPromise;
        expect(cfg.viewers.Two.filter).toEqual([]);

        return compare(page, `${context}-datagrid-filters-work.txt`);
    });

    test("removeConfigs removes a programmatically applied filter from slave viewers", async ({
        page,
    }) => {
        const config = {
            viewers: {
                One: {
                    table: "superstore",
                    name: "Test",
                    group_by: ["State"],
                    columns: ["Sales"],
                    plugin: "Datagrid",
                },
                Two: { table: "superstore", name: "One" },
            },
            master: {
                widgets: ["One"],
            },
            detail: {
                main: {
                    currentIndex: 0,
                    type: "tab-area",
                    widgets: ["Two"],
                },
            },
        };

        async function awaitConfigChange() {
            return await page.evaluate(async () => {
                let resolve;
                const timer = new Promise((x) => {
                    resolve = x;
                });

                workspace.addEventListener("workspace-layout-update", resolve);
                await timer;
                workspace.removeEventListener(
                    "workspace-layout-update",
                    resolve,
                );

                return await workspace.save();
            });
        }

        await page.evaluate(async (config) => {
            const workspace = document.getElementById("workspace");
            await workspace.restore(config);
            await workspace.flush();
        }, config);

        // Apply a filter for "Category" via programmatic dispatch.
        // "Category" is not in the master's group_by/split_by/filter, so it
        // would not be cleared by the candidates mechanism on deselect.
        let cfgPromise = awaitConfigChange();
        await page.evaluate(async () => {
            const masterViewer = document.querySelector(
                ".workspace-master-widget",
            );
            masterViewer.dispatchEvent(
                new CustomEvent("perspective-select", {
                    bubbles: true,
                    composed: true,
                    detail: new PerspectiveSelectDetail(
                        true,
                        {},
                        ["Category"],
                        [],
                        [{ filter: [["Category", "==", "Furniture"]] }],
                    ),
                }),
            );
        });

        let cfg = await cfgPromise;
        expect(cfg.viewers.Two.filter).toEqual([
            ["Category", "==", "Furniture"],
        ]);

        // Use removeConfigs to explicitly clear the Category filter from
        // slave viewers.
        cfgPromise = awaitConfigChange();
        await page.evaluate(async () => {
            const masterViewer = document.querySelector(
                ".workspace-master-widget",
            );
            masterViewer.dispatchEvent(
                new CustomEvent("perspective-select", {
                    bubbles: true,
                    composed: true,
                    detail: new PerspectiveSelectDetail(
                        true,
                        {},
                        [],
                        [{ filter: [["Category", "==", "Furniture"]] }],
                        [],
                    ),
                }),
            );
        });

        cfg = await cfgPromise;
        expect(cfg.viewers.Two.filter).toEqual([]);
    });

    test("removeConfigs preserves other slave filters while clearing targeted column", async ({
        page,
    }) => {
        const config = {
            viewers: {
                One: {
                    table: "superstore",
                    name: "Test",
                    group_by: ["State"],
                    columns: ["Sales"],
                    plugin: "Datagrid",
                },
                Two: { table: "superstore", name: "One" },
            },
            master: {
                widgets: ["One"],
            },
            detail: {
                main: {
                    currentIndex: 0,
                    type: "tab-area",
                    widgets: ["Two"],
                },
            },
        };

        async function awaitConfigChange() {
            return await page.evaluate(async () => {
                let resolve;
                const timer = new Promise((x) => {
                    resolve = x;
                });

                workspace.addEventListener("workspace-layout-update", resolve);
                await timer;
                workspace.removeEventListener(
                    "workspace-layout-update",
                    resolve,
                );

                return await workspace.save();
            });
        }

        await page.evaluate(async (config) => {
            const workspace = document.getElementById("workspace");
            await workspace.restore(config);
            await workspace.flush();
        }, config);

        // Apply filters for both "Category" and "Segment" via programmatic
        // dispatch.
        let cfgPromise = awaitConfigChange();
        await page.evaluate(async () => {
            const masterViewer = document.querySelector(
                ".workspace-master-widget",
            );
            masterViewer.dispatchEvent(
                new CustomEvent("perspective-select", {
                    bubbles: true,
                    composed: true,
                    detail: new PerspectiveSelectDetail(
                        true,
                        {},
                        ["Category", "Segment"],
                        [],
                        [
                            {
                                filter: [
                                    ["Category", "==", "Furniture"],
                                    ["Segment", "==", "Consumer"],
                                ],
                            },
                        ],
                    ),
                }),
            );
        });

        let cfg = await cfgPromise;
        expect(cfg.viewers.Two.filter).toEqual([
            ["Category", "==", "Furniture"],
            ["Segment", "==", "Consumer"],
        ]);

        // Remove only "Category"; "Segment" filter should be preserved.
        cfgPromise = awaitConfigChange();
        await page.evaluate(async () => {
            const masterViewer = document.querySelector(
                ".workspace-master-widget",
            );
            masterViewer.dispatchEvent(
                new CustomEvent("perspective-select", {
                    bubbles: true,
                    composed: true,
                    detail: new PerspectiveSelectDetail(
                        true,
                        {},
                        [],
                        [{ filter: [["Category", "==", "Furniture"]] }],
                        [],
                    ),
                }),
            );
        });

        cfg = await cfgPromise;
        // Category is cleared, Segment is preserved.
        expect(cfg.viewers.Two.filter).toEqual([["Segment", "==", "Consumer"]]);
    });

    test("Child classes of datagrid behave the same way", async ({ page }) => {
        const config = {
            viewers: {
                One: {
                    table: "superstore",
                    name: "Test",
                    group_by: ["State"],
                    columns: ["Sales"],
                    plugin: "My Datagrid",
                },
                Two: { table: "superstore", name: "One" },
            },
            master: {
                widgets: ["One"],
            },
            detail: {
                main: {
                    currentIndex: 0,
                    type: "tab-area",
                    widgets: ["Two"],
                },
            },
        };

        await page.evaluate(async () => {
            class MyGrid extends customElements.get(
                "perspective-viewer-datagrid",
            ) {
                get name() {
                    return "My Datagrid";
                }
            }
            customElements.define("my-grid", MyGrid);
            customElements.get("perspective-viewer").registerPlugin("my-grid");
        });

        async function awaitConfigChange() {
            return await page.evaluate(async () => {
                let resolve;
                const timer = new Promise((x) => {
                    resolve = x;
                });

                workspace.addEventListener("workspace-layout-update", resolve);
                await timer;
                workspace.removeEventListener(
                    "workspace-layout-update",
                    resolve,
                );

                return await workspace.save();
            });
        }

        await page.evaluate(async (config) => {
            const workspace = document.getElementById("workspace");
            await workspace.restore(config);
            await workspace.flush();
        }, config);

        let cfgPromise = awaitConfigChange();
        await page
            .locator(".workspace-master-widget my-grid")
            .locator("tbody tr:nth-child(6) th:last-of-type")
            .click();
        let cfg = await cfgPromise;

        expect(cfg.viewers.Two.filter).toEqual([["State", "==", "Colorado"]]);

        cfgPromise = awaitConfigChange();
        await page
            .locator(".workspace-master-widget my-grid")
            .locator("tbody tr:nth-child(6) th:last-of-type")
            .click({
                delay: 10,
            });
        cfg = await cfgPromise;

        // console.log("OLD", cfg.viewers.Two.filter);
        // await page.evaluate(async () => {
        //     await new Promise((r) => setTimeout(r, 5000));
        // });
        // cfg = await page.evaluate(async () => {
        //     const cfg = await workspace.save();
        //     console.log("NEW", JSON.stringify(cfg.viewers.Two.filter));
        //     return cfg;
        // });

        expect(cfg.viewers.Two.filter).toEqual([]);

        return compare(page, `${context}-my-datagrid-filters-work.txt`);
    });
}

test.describe("Workspace global filters", () => {
    test.describe("Light DOM", () => {
        tests("light-dom", compareLightDOMContents);
    });

    test.describe("Shadow DOM", () => {
        tests("shadow-dom", compareShadowDOMContents);
    });
});
