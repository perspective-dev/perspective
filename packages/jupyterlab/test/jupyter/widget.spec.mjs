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

import { API_VERSION, expect } from "@perspective-dev/test";
import path from "path";
import {
    default_body,
    add_and_execute_cell,
    assert_no_error_in_cell,
    assert_python_eventually,
    execute_all_cells,
    test_jupyter,
    describe_jupyter,
} from "./utils.mjs";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const getEditMode = async (viewer) => {
    return await viewer.evaluate(async (viewer) => {
        return (await viewer.save()).plugin_config.edit_mode;
    });
};

describe_jupyter(
    () => {
        test_jupyter(
            "Open arrow and csv from file browser",
            [],
            async ({ page }) => {
                // Lumino tab ids (`#tab-key-N-M`) shift with the installed
                // extension set — select the File Browser by accessible name,
                // and only click if not already selected (a click on the
                // active tab collapses the sidebar).
                const file_browser = page.getByRole("tab", {
                    name: /File Browser/,
                });

                if (
                    (await file_browser.getAttribute("aria-selected")) !==
                    "true"
                ) {
                    await file_browser.click();
                }

                // The `data-file-type="arrow"` attribute is itself part of
                // the labextension contract (`addFileType`), and Perspective
                // is `defaultFor` arrow so a double-click opens it with the
                // Perspective factory. (The right-click → "Open With" →
                // "Perspective-Arrow" path proved flaky under lumino's
                // hover-submenu timing and tests jlab core, not this
                // extension.)
                await page
                    .locator(`.jp-DirListing-item[data-file-type="arrow"]`)
                    .dblclick();

                const num_columns = await page
                    .locator("regular-table thead tr")
                    .first()
                    .evaluate((tr) => tr.childElementCount);

                expect(num_columns).toEqual(14);
                await expect(
                    page.locator("regular-table tbody tr"),
                ).toHaveCount(5);
            },
        );

        // Basics
        test_jupyter(
            "Loads data",
            [
                "w = perspective.widget.PerspectiveWidget(arrow_data, columns=['f64', 'str', 'datetime'])",
                "w",
            ],
            async ({ page }) => {
                await default_body(page);

                // Poll — the viewer draws once between `load()` and the
                // trait `restore()` in the anywidget frontend, so the first
                // paint can briefly show all columns.
                await expect
                    .poll(() =>
                        page
                            .locator("regular-table thead tr")
                            .first()
                            .evaluate((tr) => tr.childElementCount),
                    )
                    .toEqual(3);

                await expect(
                    page.locator("regular-table tbody tr"),
                ).toHaveCount(5);
            },
        );

        test_jupyter(
            "Loads updates",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table, columns=['f64', 'str', 'datetime'])",
                ].join("\n"),
                "w",
                "table.update(arrow_data)",
            ],
            async ({ page }) => {
                await default_body(page);

                // Poll — the viewer draws once between `load()` and the trait
                // `restore()` in the anywidget frontend, so the first paint can
                // briefly show all columns before collapsing to the configured
                // three (see "Loads data").
                await expect
                    .poll(() =>
                        page
                            .locator("regular-table thead tr")
                            .first()
                            .evaluate((tr) => tr.childElementCount),
                    )
                    .toEqual(3);

                await expect(
                    page.locator("regular-table tbody tr"),
                ).toHaveCount(10);
            },
        );

        test_jupyter(
            "Loads a table",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table, columns=['f64', 'str', 'datetime'])",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                await default_body(page);

                // Poll — the viewer draws once between `load()` and the trait
                // `restore()` in the anywidget frontend, so the first paint can
                // briefly show all columns before collapsing to the configured
                // three (see "Loads data").
                await expect
                    .poll(() =>
                        page
                            .locator("regular-table thead tr")
                            .first()
                            .evaluate((tr) => tr.childElementCount),
                    )
                    .toEqual(3);

                await expect(
                    page.locator("regular-table tbody tr"),
                ).toHaveCount(5);
            },
        );

        test_jupyter(
            "Loads AsyncTable",
            [
                `
import asyncio
server = perspective.Server()
sync_client = server.new_local_client()
sync_client.table({"Income": [5,4,3,2,1], "Expense": [4,3,2,1,1], "Profit": [1,1,1,1,0]}, name="Microstore")
proxy_sess = perspective.ProxySession(sync_client, lambda msg: asyncio.create_task(async_client.handle_response(msg)))

async_client = perspective.AsyncClient(proxy_sess.handle_request_async)
async_table = await async_client.open_table("Microstore")`,
                "w = perspective.widget.PerspectiveWidget(async_table)",
                "w",
            ],
            async ({ page }) => {
                await default_body(page);
                const num_columns = await page
                    .locator("regular-table thead tr")
                    .first()
                    .evaluate((tr) => tr.childElementCount);

                expect(num_columns).toEqual(3);
                await expect(
                    page.locator("regular-table tbody tr"),
                ).toHaveCount(5);
            },
        );

        test_jupyter(
            "Loads updates to AsyncTable",
            [
                [
                    `
import asyncio
server = perspective.Server()
sync_client = server.new_local_client()
sync_table = sync_client.table(arrow_data)
proxy_sess = perspective.ProxySession(sync_client, lambda msg: asyncio.create_task(async_client.handle_response(msg)))

async_client = perspective.AsyncClient(proxy_sess.handle_request_async)
async_table = await async_client.open_table(sync_table.get_name())`,
                    "w = perspective.widget.PerspectiveWidget(async_table, columns=['f64', 'str', 'datetime'])",
                ].join("\n"),
                "w",
                "sync_table.update(arrow_data)",
            ],
            async ({ page }) => {
                await default_body(page);

                // Poll — the viewer draws once between `load()` and the trait
                // `restore()` in the anywidget frontend, so the first paint can
                // briefly show all columns before collapsing to the configured
                // three (see "Loads data").
                await expect
                    .poll(() =>
                        page
                            .locator("regular-table thead tr")
                            .first()
                            .evaluate((tr) => tr.childElementCount),
                    )
                    .toEqual(3);

                await expect(
                    page.locator("regular-table tbody tr"),
                ).toHaveCount(10);
            },
        );
        // Restore

        test_jupyter(
            "Loads with settings=False",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table, columns=['f64', 'str', 'datetime'], settings=False)",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);
                const settings = await viewer.evaluate(async (viewer) => {
                    return (await viewer.save()).settings;
                });

                expect(settings).toEqual(false);
            },
        );

        test_jupyter(
            "Loads with edit_mode=EDIT",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table, plugin_config={'edit_mode': 'EDIT'})",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);
                const edit_mode = await getEditMode(viewer);
                expect(edit_mode).toEqual("EDIT");
            },
        );

        test_jupyter(
            "Editable Toggle - from Python",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table)",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);
                // Default (READ_ONLY) plugin_config serializes as `{}` —
                // only non-default values appear in `save()`.
                let edit_mode = await getEditMode(viewer);
                expect(edit_mode).toBeUndefined();

                await add_and_execute_cell(
                    page,
                    'w.plugin_config = {"edit_mode": "EDIT"}',
                );

                await expect.poll(() => getEditMode(viewer)).toEqual("EDIT");
            },
        );

        test_jupyter(
            "Editable Toggle - from JS",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table)",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);
                // Default (READ_ONLY) plugin_config serializes as `{}` —
                // only non-default values appear in `save()`.
                let edit_mode = await getEditMode(viewer);
                expect(edit_mode).toBeUndefined();

                await viewer.evaluate(async (viewer) => {
                    const toolbar = viewer.querySelector(
                        "perspective-viewer-datagrid-toolbar",
                    );
                    toolbar.shadowRoot.querySelector("span#edit_mode").click();
                });

                await expect.poll(() => getEditMode(viewer)).toEqual("EDIT");
            },
        );

        test_jupyter(
            "Everything Else - Toggle from Python",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table)",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);
                let config = await viewer.evaluate(async (viewer) => {
                    return await viewer.save();
                });

                // Check default config
                expect(config).toEqual({
                    version: API_VERSION,
                    columns_config: {},
                    aggregates: {},
                    columns: [
                        "ui8",
                        "i8",
                        "ui16",
                        "i16",
                        "ui32",
                        "i32",
                        "ui64",
                        "i64",
                        "f32",
                        "f64",
                        "bool",
                        "str",
                        "date",
                        "datetime",
                    ],
                    expressions: {},
                    filter: [],
                    group_by: [],
                    group_rollup_mode: "rollup",
                    plugin: "Datagrid",
                    // Default plugin_config serializes empty — only
                    // non-default values appear in `save()`.
                    plugin_config: {},
                    settings: true,
                    sort: [],
                    split_by: [],
                    table: expect.any(String),
                    theme: "Pro Light",
                    title: null,
                });

                await add_and_execute_cell(
                    page,
                    `
w.plugin = "X Bar"
w.columns = ["ui8"]
w.filter = [["i8", "<", 50]]
w.group_by = ["date"]
w.split_by = ["bool"]
w.sort = [["date", "asc"]]
w.theme = "Pro Dark"`,
                );

                // Poll — the python trait changes propagate over the comm.
                await expect
                    .poll(() =>
                        viewer.evaluate(async (viewer) => await viewer.save()),
                    )
                    .toEqual({
                        version: API_VERSION,
                        columns_config: {},
                        aggregates: {},
                        columns: ["ui8"],
                        expressions: {},
                        filter: [["i8", "<", 50]],
                        group_by: ["date"],
                        // Chart plugins only support "flat" rollup mode
                        group_rollup_mode: "flat",
                        plugin: "X Bar",
                        plugin_config: {},
                        settings: true,
                        sort: [["date", "asc"]],
                        split_by: ["bool"],
                        table: expect.any(String),
                        theme: "Pro Dark",
                        title: null,
                    });
            },
        );

        test_jupyter(
            "Everything Else - Toggle from JS",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table)",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);
                const config = await viewer.evaluate(async (viewer) => {
                    return await viewer.save();
                });

                // Check default config
                expect(config).toEqual({
                    version: API_VERSION,
                    columns_config: {},
                    aggregates: {},
                    columns: [
                        "ui8",
                        "i8",
                        "ui16",
                        "i16",
                        "ui32",
                        "i32",
                        "ui64",
                        "i64",
                        "f32",
                        "f64",
                        "bool",
                        "str",
                        "date",
                        "datetime",
                    ],
                    expressions: {},
                    filter: [],
                    group_by: [],
                    group_rollup_mode: "rollup",
                    plugin: "Datagrid",
                    // Default plugin_config serializes empty — only
                    // non-default values appear in `save()`.
                    plugin_config: {},
                    settings: true,
                    sort: [],
                    split_by: [],
                    table: expect.any(String),
                    theme: "Pro Light",
                    title: null,
                });

                // Await the restore (and flush) so the viewer has fully applied
                // the config and fired `perspective-config-update` — which is
                // what drives the frontend's `sync_to_python` comm push — before
                // the Python assert cell below runs. Firing the restore and
                // asserting immediately races the JS -> comm -> kernel trait
                // round-trip and fails on a slow CI runner.
                await viewer.evaluate(async (viewer, version) => {
                    await viewer.restore({
                        version,
                        columns: ["ui8"],
                        filter: [["i8", "<", "50"]],
                        group_by: ["date"],
                        plugin: "X Bar",
                        settings: false,
                        sort: [["date", "asc"]],
                        split_by: ["bool"],
                        theme: "Pro Dark",
                        title: null,
                    });
                    await viewer.flush();

                    return "";
                }, API_VERSION);

                // Poll the Python side: the JS `restore()` above syncs back to
                // the traits asynchronously and the kernel only applies the
                // comm between cell executions, so a one-shot assert races the
                // round-trip on a slow CI runner (see `assert_python_eventually`).
                const passed = await assert_python_eventually(
                    page,
                    `
assert w.plugin == "X Bar"
assert w.columns == ["ui8"]
assert w.filter == [["i8", "<", "50"]]
assert w.group_by == ["date"]
assert w.split_by == ["bool"]
assert w.plugin_config == {}
assert w.settings == False
assert w.sort == [["date", "asc"]]
assert w.theme == "Pro Dark"`,
                );
                // Diagnostic: if the python traits never caught up, capture what
                // the JS viewer holds vs. what python holds so the failure
                // artifact shows the divergence directly (JS restored fine but
                // the JS->python sync dropped it, vs. the restore never stuck).
                if (!passed) {
                    try {
                        const js = await viewer.evaluate(
                            async (v) => await v.save(),
                        );
                        await add_and_execute_cell(
                            page,
                            `print("PSP_DIAG JS_PLUGIN=${js.plugin} JS_THEME=${js.theme} JS_SETTINGS=${js.settings}"` +
                                ` + " PY_PLUGIN=" + repr(w.plugin) + " PY_THEME=" + repr(w.theme) + " PY_SETTINGS=" + repr(w.settings))`,
                        );
                    } catch (e) {}
                }
                expect(passed).toBe(true);
            },
        );

        test_jupyter(
            "Edit from frontend - end to end",
            [
                'w = perspective.widget.PerspectiveWidget({"a": [True, False, True], "b": ["abc", "def", "ghi"]}, index="b", plugin_config={"edit_mode": "EDIT"})',
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);

                // assert in python or else
                let error_cells_dont_exist = await assert_no_error_in_cell(
                    page,
                    [
                        `assert w.table.view().to_columns() == {'a': [True, False, True], 'b': ['abc', 'def', 'ghi']}`,
                        `"Passed"`,
                    ].join("\n"),
                );
                expect(error_cells_dont_exist).toBe(true);

                // Toggle some values in the frontend
                const bools = await page.$$(".psp-bool-type");

                // do synchronous
                for (let bool of bools) {
                    await bool.click();
                }

                // now check again
                error_cells_dont_exist = await assert_no_error_in_cell(
                    page,
                    [
                        `assert w.table.view().to_columns() == {'a': [False, True, False], 'b': ['abc', 'def', 'ghi']}`,
                        `"Passed"`,
                    ].join("\n"),
                );

                expect(error_cells_dont_exist).toBe(true);
            },
        );

        test_jupyter("Restores from saved config", [], async ({ page }) => {
            await execute_all_cells(page);
            const no_error = await assert_no_error_in_cell(
                page,
                `
server = perspective.Server()
client = server.new_local_client()
table = client.table(arrow_data)
w = perspective.widget.PerspectiveWidget(table, columns=["f64", "str"], group_by=["bool"])
config = w.save()
w2 = perspective.widget.PerspectiveWidget(table, **config)
assert w2.columns == ["f64", "str"]
assert w2.group_by == ["bool"]
"Passed"`,
            );
            expect(no_error).toBe(true);
        });

        test_jupyter(
            "Toggles to datagrid and back regression",
            [
                "w = perspective.widget.PerspectiveWidget(arrow_data, columns=['f64', 'str', 'datetime'])",
                "w",
            ],
            async ({ page }) => {
                await default_body(page);
                const num_columns = await page
                    .locator("regular-table thead tr")
                    .first()
                    .evaluate((tr) => tr.childElementCount);

                async function toggle(plugin) {
                    await page.locator(".plugin-select-item").click();
                    await page
                        .locator("#plugin_selector_container.open")
                        .waitFor();

                    await page
                        .locator(`[data-plugin=${plugin}].plugin-select-item`)
                        .click();

                    await page
                        .locator("#plugin_selector_container:not(.open)")
                        .waitFor();

                    await page.evaluate(async () => {
                        await document
                            .querySelector("perspective-viewer")
                            .flush();
                    });
                }

                await toggle('"X/Y Line"');
                await toggle("Datagrid");
                await toggle('"X/Y Line"');
                await toggle("Datagrid");

                // expect(num_columns).toEqual(3);
                await expect(
                    page.locator("regular-table tbody tr"),
                ).toHaveCount(5);
            },
        );

        // *************************
        // anywidget-specific (Phase 3)
        // *************************

        // The same widget displayed in two cells: each `render()` gets its own
        // `client_id`/`Client`, and both stay in sync through the shared model
        // traits — a python edit reflects in both views.
        test_jupyter(
            "Two views of one widget stay in sync",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table, columns=['f64', 'str', 'datetime'])",
                ].join("\n"),
                "w",
                "w",
            ],
            async ({ page }) => {
                await execute_all_cells(page);
                const viewers = page.locator(
                    ".jp-OutputArea-output perspective-viewer",
                );
                await expect(viewers).toHaveCount(2);
                for (const v of await viewers.all()) {
                    await v.evaluate(async (viewer) => await viewer.flush());
                }

                await add_and_execute_cell(page, 'w.group_by = ["date"]');

                for (let i = 0; i < 2; i++) {
                    await expect
                        .poll(() =>
                            viewers
                                .nth(i)
                                .evaluate(
                                    async (viewer) =>
                                        (await viewer.save()).group_by,
                                ),
                        )
                        .toEqual(["date"]);
                }
            },
        );

        // `binding_mode="client-server"` copies the server table into an
        // in-page wasm client (`table(remote_view)`); rows render and *updates*
        // stream across the view->table binding.
        test_jupyter(
            "binding_mode client-server renders and streams updates",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table, columns=['f64', 'str', 'datetime'], binding_mode='client-server')",
                ].join("\n"),
                "w",
                "table.update(arrow_data)",
            ],
            async ({ page }) => {
                await default_body(page);
                await expect
                    .poll(() =>
                        page.locator("regular-table tbody tr").count(),
                    )
                    .toEqual(10);
            },
        );

        // Traits mutated after construction but before the widget is displayed
        // must be applied by the initial `restore()` (the restore-before-
        // load-complete path).
        test_jupyter(
            "Traits set before display are restored on first render",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table)",
                ].join("\n"),
                'w.group_by = ["date"]\nw.columns = ["f64", "str"]',
                "w",
            ],
            async ({ page }) => {
                const viewer = await default_body(page);
                await expect
                    .poll(() =>
                        viewer.evaluate(
                            async (v) => (await v.save()).group_by,
                        ),
                    )
                    .toEqual(["date"]);
                const columns = await viewer.evaluate(
                    async (v) => (await v.save()).columns,
                );
                expect(columns).toEqual(["f64", "str"]);
            },
        );

        // Re-displaying the widget in additional cells remounts fresh views
        // (each remount tears down its predecessor via the returned destroy fn:
        // `hangup` + `terminate` + listener removal). No console/page errors,
        // and a subsequent python edit applies exactly once (no leaked
        // `change:` listeners).
        test_jupyter(
            "Re-execution remounts cleanly without leaks",
            [
                [
                    "server = perspective.Server()",
                    "client = server.new_local_client()",
                    "table = client.table(arrow_data)",
                    "w = perspective.widget.PerspectiveWidget(table, columns=['f64', 'str', 'datetime'])",
                ].join("\n"),
                "w",
            ],
            async ({ page }) => {
                const errors = [];
                page.on("pageerror", (e) => errors.push(String(e)));
                page.on("console", (m) => {
                    if (m.type() === "error") errors.push(m.text());
                });

                await default_body(page);
                for (let i = 0; i < 2; i++) {
                    await add_and_execute_cell(page, "w");
                }

                const last = page
                    .locator(".jp-OutputArea-output perspective-viewer")
                    .last();
                await last.evaluate(async (v) => await v.flush());
                await expect(
                    last.locator("regular-table tbody tr"),
                ).toHaveCount(5);

                await add_and_execute_cell(page, 'w.theme = "Pro Dark"');
                await expect
                    .poll(() =>
                        last.evaluate(async (v) => (await v.save()).theme),
                    )
                    .toEqual("Pro Dark");

                expect(errors).toEqual([]);
            },
        );

        // *************************
        // UTILS
        // *************************
        test_jupyter(
            "Run in Cell - Assert in Cell working",
            [],
            async ({ page }) => {
                await execute_all_cells(page);

                // assert_no_error_in_cell runs add_and_execute_cell internally so only need to check one
                const error_cells_dont_exist = await assert_no_error_in_cell(
                    page,
                    "raise Exception('anything')",
                );
                expect(error_cells_dont_exist).toBe(false);
            },
        );
    },
    { name: "Simple", root: path.join(__dirname, "..", "..") },
);
// });
