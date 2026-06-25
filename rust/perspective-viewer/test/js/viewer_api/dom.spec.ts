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

import { test, expect, compareContentsToSnapshot } from "../helpers.ts";

const RESULT = {
    aggregates: {},
    columns: [
        "Row ID",
        "Order ID",
        "Order Date",
        "Ship Date",
        "Ship Mode",
        "Customer ID",
        "Segment",
        "Country",
        "City",
        "State",
        "Postal Code",
        "Region",
        "Product ID",
        "Category",
        "Sub-Category",
        "Sales",
        "Quantity",
        "Discount",
        "Profit",
    ],
    columns_config: {},
    expressions: {},
    filter: [],
    group_by: [],
    plugin: "Debug",
    plugin_config: {},
    settings: false,
    sort: [],
    split_by: [],
    table: "load-viewer-csv",
    theme: "Pro Light",
    title: null,
    group_rollup_mode: "rollup",
};

test.beforeEach(async ({ page }) => {
    await page.goto(
        "/node_modules/@perspective-dev/viewer/test/html/superstore.html",
    );
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
    await page.evaluate(async () => {
        await document.querySelector("perspective-viewer")!.restore({
            plugin: "Debug",
        });
    });
});

test.describe("DOM API", () => {
    test.describe("restore with table name > sets default plugin and columns", () => {
        test("await order > resolves correctly when fully awaited", async ({
            page,
        }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer")!;
                old.parentElement!.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load((window as any).__TEST_WORKER__);
                await viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });

        test("await order > resolves correctly when load is not awaited", async ({
            page,
        }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer")!;
                old.parentElement!.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                viewer.load((window as any).__TEST_WORKER__);
                await viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });

        test("await order > resolves correctly when restore is not awaited", async ({
            page,
        }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer")!;
                old.parentElement!.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load((window as any).__TEST_WORKER__);
                viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });

        test("await order > resolves correctly when neither load nor restore is awaited", async ({
            page,
        }) => {
            const x = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer")!;
                old.parentElement!.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                viewer.load((window as any).__TEST_WORKER__);
                viewer.restore({ table: "load-viewer-csv" });
                return await viewer.save();
            });

            delete x.version;
            expect(x).toEqual(RESULT);
        });
    });

    test.describe("load and restore before DOM append", () => {
        test("append > renders correctly when fully awaited", async ({
            page,
        }) => {
            const contents = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer")!;
                old.parentElement!.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load((window as any).__TEST_WORKER__);
                await viewer.restore({ table: "load-viewer-csv" });
                document.body.appendChild(viewer);
                await viewer.flush();
                return document.body.innerHTML;
            });

            await compareContentsToSnapshot(contents);
        });

        test("append > renders correctly when restore is not awaited", async ({
            page,
        }) => {
            const contents = await page.evaluate(async () => {
                const old = document.querySelector("perspective-viewer")!;
                old.parentElement!.removeChild(old);
                const viewer = document.createElement("perspective-viewer");
                await viewer.load((window as any).__TEST_WORKER__);
                viewer.restore({ table: "load-viewer-csv" });
                document.body.appendChild(viewer);
                await viewer.flush();
                return document.body.innerHTML;
            });

            await compareContentsToSnapshot(contents);
        });
    });
});

// Regression: `<perspective-workspace>.addViewer({ columns_config })` was
// losing the `columns_config` because the workspace awaits `viewer.restore`
// while the viewer is still detached from the DOM (the Lumino widget hasn't
// attached yet, so `onAfterAttach` hasn't fired). On that code path:
//   (a) `create_view`'s `reset_clean` early-return could leave `view_schema`
//       unpopulated in some interleavings, and
//   (b) `query_column_config_schema` then returned an EMPTY schema, which the
//       strip-on-write in `update_columns_configs` treats as "no allowed
//       keys" — dropping every entry in the incoming `columns_config`.
// These tests reproduce the workspace's call sequence (createElement →
// load(client) → restore(config) → appendChild) with non-trivial
// `columns_config` / `plugin_config` payloads. They use the test-only
// "Debug Styled" plugin (declared in the viewer test module), which — like a
// real plugin — declares a non-empty `column_config_schema` /
// `plugin_config_schema`. An empty-schema plugin would make the regression
// untestable: the strip would drop the keys whether or not the bug is present.
test.describe("restore with config payload before DOM append", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(
            "/rust/perspective-viewer/test/html/superstore-debug.html",
        );

        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    test("save > columns_config round-trips when fully awaited", async ({
        page,
    }) => {
        const config = await page.evaluate(async () => {
            const old = document.querySelector("perspective-viewer")!;
            old.parentElement!.removeChild(old);
            const viewer = document.createElement("perspective-viewer");
            await viewer.load((window as any).__TEST_WORKER__);
            await viewer.restore({
                table: "load-viewer-csv",
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

            document.body.appendChild(viewer);
            await viewer.flush();
            return await viewer.save();
        });

        expect(config.columns_config).toMatchObject({
            Profit: {
                number_format: {
                    style: "currency",
                    currency: "USD",
                },
            },
        });
    });

    test("save > columns_config round-trips when restore is not awaited", async ({
        page,
    }) => {
        const config = await page.evaluate(async () => {
            const old = document.querySelector("perspective-viewer")!;
            old.parentElement!.removeChild(old);
            const viewer = document.createElement("perspective-viewer");
            await viewer.load((window as any).__TEST_WORKER__);
            viewer.restore({
                table: "load-viewer-csv",
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

            document.body.appendChild(viewer);
            await viewer.flush();
            return await viewer.save();
        });

        expect(config.columns_config).toMatchObject({
            Profit: {
                number_format: {
                    style: "currency",
                    currency: "USD",
                },
            },
        });
    });

    test("save > plugin_config round-trips when fully awaited", async ({
        page,
    }) => {
        const config = await page.evaluate(async () => {
            const old = document.querySelector("perspective-viewer")!;
            old.parentElement!.removeChild(old);
            const viewer = document.createElement("perspective-viewer");
            await viewer.load((window as any).__TEST_WORKER__);
            await viewer.restore({
                table: "load-viewer-csv",
                plugin: "Debug Styled",
                columns: ["Profit"],
                plugin_config: { edit_mode: "EDIT" },
            });
            document.body.appendChild(viewer);
            await viewer.flush();
            return await viewer.save();
        });

        expect(config.plugin_config).toMatchObject({ edit_mode: "EDIT" });
    });

    test("columns_config is applied to the plugin on first render", async ({
        page,
    }) => {
        const applied = await page.evaluate(async () => {
            const old = document.querySelector("perspective-viewer")!;
            old.parentElement!.removeChild(old);
            const viewer = document.createElement("perspective-viewer");
            await viewer.load((window as any).__TEST_WORKER__);
            await viewer.restore({
                table: "load-viewer-csv",
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

            document.body.appendChild(viewer);
            await viewer.flush();
            const plugin = viewer.querySelector(
                "perspective-viewer-debug-styled",
            ) as any;
            return plugin?._restored_columns_config;
        });

        expect(applied).toMatchObject({
            Profit: {
                number_format: {
                    style: "currency",
                    currency: "USD",
                },
            },
        });
    });
});
