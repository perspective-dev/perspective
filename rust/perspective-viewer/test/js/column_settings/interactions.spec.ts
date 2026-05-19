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

import { PageView, ColumnSelector, test, expect } from "../helpers.ts";

test.describe.configure({ mode: "parallel" });

type SidebarState =
    | {
          open: true;
          tabs: string[];
          selectedTab: string;
          type: string | "expression";
          snapshot: string;
      }
    | { open: false };

type Action =
    | "open"
    | "activate"
    | "deactivate"
    | "reorder"
    | "aggregate"
    | "deaggregate"
    | "groupby"
    | "splitby"
    | "orderby"
    | "where";

// Given an initial state and a list of possible actions, expect the given outputs.
// Each action will be tested against the three methods - button click,
// drag'n'drop, and text input - according to what is possible.
// For instance, it's impossible to button click a column into a query position,
// so this will be skipped.
type TestSpec = {
    initial_state: { open: boolean; active: boolean; columns?: string[] };
    actions: Action[];
    outputs: {
        table_col?: ExpectedState;
        expr_col?: ExpectedState;
    };
};
type ExpectedState =
    | { closed: true }
    | { unchanged: true }
    | ({ tabs: string[]; selectedTab: string } & { type?: string });

// Note: impossible states are not encoded here.
const TEST_SPEC: Record<string, TestSpec> = {
    "Open - Active": {
        initial_state: {
            open: false,
            active: true,
        },
        actions: ["open"],
        outputs: {
            table_col: {
                tabs: ["Style"],
                selectedTab: "Style",
            },
            expr_col: {
                tabs: ["Style", "Attributes"],
                selectedTab: "Style",
            },
        },
    },
    "Open - Inactive": {
        initial_state: {
            open: false,
            active: false,
        },
        actions: ["open"],
        outputs: {
            // The Style tab requires the column to be in
            // `view_config.columns` (see `column_settings_sidebar.rs`
            // `show_styles`); inactive expression columns only see
            // Attributes.
            expr_col: {
                tabs: ["Attributes"],
                selectedTab: "Attributes",
            },
        },
    },
    Deactivate: {
        initial_state: {
            open: true,
            active: true,
        },
        actions: ["deactivate"],
        outputs: {
            table_col: {
                closed: true,
            },
            // Deactivating drops the column from `view_config.columns`,
            // which removes the Style tab; the sidebar stays open on
            // the expression with only Attributes left.
            expr_col: {
                tabs: ["Attributes"],
                selectedTab: "Attributes",
            },
        },
    },
    Activate: {
        initial_state: {
            open: true,
            active: false,
        },
        actions: ["activate"],
        outputs: {
            expr_col: {
                tabs: ["Style", "Attributes"],
                selectedTab: "Attributes",
            },
        },
    },
    "Reorder - Active": {
        initial_state: {
            open: true,
            active: true,
        },
        actions: ["reorder"],
        outputs: {
            table_col: {
                unchanged: true,
            },
            expr_col: {
                unchanged: true,
            },
        },
    },
    Aggregate: {
        initial_state: {
            open: true,
            active: true,
        },
        actions: ["aggregate"],
        outputs: {
            table_col: {
                unchanged: true,
                type: "integer",
            },
            expr_col: {
                unchanged: true,
                type: "integer",
            },
        },
    },
    Deaggregate: {
        initial_state: {
            open: true,
            active: true,
        },
        actions: ["deaggregate"],
        outputs: {
            table_col: {
                unchanged: true,
                type: "string",
            },
            expr_col: {
                unchanged: true,
                type: "string",
            },
        },
    },
    "Groupby - Active": {
        initial_state: {
            open: true,
            active: true,
        },
        actions: ["groupby"],
        outputs: {
            expr_col: {
                unchanged: true,
                type: "integer",
            },
            table_col: {
                unchanged: true,
                type: "integer",
            },
        },
    },
    "Splitby - Active": {
        initial_state: {
            open: true,
            active: true,
        },
        actions: ["splitby"],
        outputs: {
            expr_col: {
                unchanged: true,
            },
            table_col: {
                unchanged: true,
            },
        },
    },
    "Filter - Active": {
        initial_state: { open: true, active: true },
        actions: ["orderby", "where"],
        outputs: {
            expr_col: { unchanged: true },
            table_col: { unchanged: true },
        },
    },
    "Query - Inactive": {
        initial_state: {
            open: true,
            active: false,
        },
        actions: ["groupby", "splitby", "orderby", "where"],
        outputs: {
            expr_col: {
                unchanged: true,
            },
        },
    },
};

/** Restores the viewer to a simple state and returns the columnSettingsSidebar's innerHTML */
async function open(
    view: PageView,
    initial_state: TestSpec["initial_state"],
    expr: boolean,
): Promise<[ColumnSelector, SidebarState]> {
    const { active, open, columns } = initial_state;

    // expr_value is a string to keep things consistent between aggregate values
    const expr_name = "expr";
    const expr_value = "'hello'";

    let view_columns = columns ? [...columns] : ["Category", "City"];
    if (active && expr) {
        view_columns.push(expr_name);
    }

    const viewer_settings = {
        settings: true,
        columns: view_columns,
        expressions: { [expr_name]: expr_value },
    };

    await view.restore(viewer_settings);

    await view.page.evaluate((viewer_settings) => {
        console.log(viewer_settings);
    }, viewer_settings);

    let selector = active
        ? await view.settingsPanel.activeColumns.getColumnByName(
              expr ? expr_name : view_columns[0],
          )
        : expr
          ? await view.settingsPanel.inactiveColumns.getColumnByName(expr_name)
          : view.settingsPanel.inactiveColumns.getColumnByType("string");

    let state: SidebarState;
    if (open) {
        await selector.editBtn.click();
        state = {
            open: true,
            tabs: await view.columnSettingsSidebar.getTabs(),
            selectedTab: await view.columnSettingsSidebar.getSelectedTab(),
            type: await view.columnSettingsSidebar.getType(),
            snapshot: await view.columnSettingsSidebar.container.innerHTML(),
        };
    } else {
        state = { open: false };
    }
    return [selector, state];
}

async function checkOutput(
    view: PageView,
    expected: ExpectedState,
    initial_state: SidebarState,
) {
    const POSSIBLE_TABS = ["Style", "Attributes"];

    const check_tabs = async (
        selectedTab: string,
        tabs: string[],
        unexpected_tabs: string[],
    ) => {
        if (selectedTab === "") {
            await view.columnSettingsSidebar.container
                .locator(".settings_tab.selected_tab .tab-title")
                .first()
                .waitFor();
        } else {
            await view.columnSettingsSidebar.container
                .locator(`.settings_tab.selected_tab #${selectedTab}`)
                .waitFor();
        }

        for (let tab of tabs) {
            if (tab === "") {
                await view.columnSettingsSidebar.container
                    .locator(`.tab-title`)
                    .first()
                    .waitFor();
            } else {
                await view.columnSettingsSidebar.container
                    .locator(`#${tab}`)
                    .waitFor();
            }
        }
        for (let tab of unexpected_tabs) {
            await view.columnSettingsSidebar.tabTitle
                .locator(`#${tab}`)
                .waitFor({ state: "hidden" });
        }
    };

    if ("type" in expected) {
        await view.columnSettingsSidebar.container
            .locator(`.type-icon.${expected.type}`)
            .waitFor();
    }
    if ("unchanged" in expected) {
        if (!initial_state.open) {
            await expect(view.columnSettingsSidebar.container).toBeHidden({
                timeout: 1000,
            });
        } else {
            const unexpected_tabs = POSSIBLE_TABS.filter(
                (t) => !initial_state.tabs.includes(t),
            );
            await check_tabs(
                initial_state.selectedTab,
                initial_state.tabs,
                unexpected_tabs,
            );
        }
    } else if ("closed" in expected) {
        await expect(view.columnSettingsSidebar.container).toBeHidden({
            timeout: 1000,
        });
    } else {
        const unexpected_tabs = POSSIBLE_TABS.filter(
            (t) => !expected.tabs.includes(t),
        );
        await check_tabs(expected.selectedTab, expected.tabs, unexpected_tabs);
    }
}

test.beforeEach(async ({ page }) => {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

/**  These tests perform interactions on the viewer column selector and check for the intended behavior on the column settings sidebar.
 * They all start with the assumption that the sidebar is open.
 * NOTE: if we ever allow styles from an inactive tab, then these tests will need to accomodate for it.
 */
test.describe("Column Settings State on Interaction", () => {
    const excluded_actions: Record<string, Action[]> = {
        button: [
            "reorder",
            "aggregate",
            "groupby",
            "splitby",
            "orderby",
            "where",
        ],
        text: ["reorder", "open", "deactivate", "deaggregate"],
        dnd: ["open", "deactivate", "groupby", "splitby"],
    };

    for (const [name, spec] of Object.entries(TEST_SPEC)) {
        for (const [col_type, expected_output] of Object.entries(
            spec.outputs,
        )) {
            const expr = col_type === "expr_col";
            for (const action of spec.actions) {
                const name_prefix = `${name} - ${col_type} - ${action}`;

                if (!excluded_actions["button"].includes(action)) {
                    test(`${name_prefix} - Button`, async ({ page }) => {
                        let pageView = new PageView(page);
                        const [selector, snapshot_state] = await open(
                            pageView,
                            spec.initial_state,
                            expr,
                        );
                        switch (action) {
                            case "open": {
                                await selector.editBtn.click();
                                break;
                            }
                            case "activate": {
                                await selector.activeBtn.click();
                                break;
                            }
                            case "deactivate": {
                                await selector.activeBtn.click();
                                break;
                            }
                            case "deaggregate": {
                                await pageView.settingsPanel.groupby("Row ID");
                                await pageView.settingsPanel.removeViewParameter(
                                    "groupby",
                                    "Row ID",
                                );
                                break;
                            }
                            default: {
                                test.fail(true, "Unreachable");
                            }
                        }
                        await checkOutput(
                            pageView,
                            expected_output,
                            snapshot_state,
                        );
                    });
                }

                if (!excluded_actions["text"].includes(action)) {
                    test(`${name_prefix} - Text`, async ({ page }) => {
                        let pageView = new PageView(page);
                        const [selector, snapshot_state] = await open(
                            pageView,
                            spec.initial_state,
                            expr,
                        );
                        let selector_name = await selector.name.innerText();
                        switch (action) {
                            case "activate": {
                                await pageView.settingsPanel.activeColumns.activateColumn(
                                    selector_name,
                                );
                                break;
                            }
                            case "groupby": {
                                await pageView.settingsPanel.groupby(
                                    selector_name,
                                );
                                break;
                            }
                            case "splitby": {
                                await pageView.settingsPanel.splitby(
                                    selector_name,
                                );
                                break;
                            }
                            case "orderby": {
                                await pageView.settingsPanel.orderby(
                                    selector_name,
                                );
                                break;
                            }
                            case "where": {
                                await pageView.settingsPanel.where(
                                    selector_name,
                                );
                                break;
                            }
                            case "aggregate": {
                                await pageView.settingsPanel.groupby("Row ID");
                                break;
                            }
                            default: {
                                test.fail(true, "Unreachable");
                            }
                        }
                        await checkOutput(
                            pageView,
                            expected_output,
                            snapshot_state,
                        );
                    });
                }
                if (!excluded_actions["dnd"].includes(action)) {
                    test(`${name_prefix} - Drag'n'Drop`, async ({ page }) => {
                        let pageView = new PageView(page);
                        const [selector, snapshot_state] = await open(
                            pageView,
                            spec.initial_state,
                            expr,
                        );
                        switch (action) {
                            case "activate": {
                                await selector.container.dragTo(
                                    pageView.settingsPanel.activeColumns.columnSelector.last(),
                                );
                                break;
                            }
                            case "reorder": {
                                await selector.container.dragTo(
                                    pageView.settingsPanel.activeColumns.columnSelector.nth(
                                        1,
                                    ),
                                );
                                break;
                            }
                            case "groupby": {
                                await selector.container.dragTo(
                                    pageView.settingsPanel.groupbyInput,
                                );
                                break;
                            }
                            case "splitby": {
                                await selector.container.dragTo(
                                    pageView.settingsPanel.splitbyInput,
                                );
                                break;
                            }
                            case "orderby": {
                                await selector.container.dragTo(
                                    pageView.settingsPanel.orderbyInput,
                                );
                                break;
                            }
                            case "where": {
                                await selector.container.dragTo(
                                    pageView.settingsPanel.whereInput,
                                );
                                break;
                            }
                            case "aggregate": {
                                const aggregator =
                                    pageView.settingsPanel.inactiveColumns.columnSelector.first();
                                await aggregator.dragTo(
                                    pageView.settingsPanel.groupbyInput,
                                );
                                break;
                            }
                            case "deaggregate": {
                                let aggregator =
                                    pageView.settingsPanel.inactiveColumns.columnSelector.first();
                                await aggregator.dragTo(
                                    pageView.settingsPanel.groupbyInput,
                                );
                                aggregator = page
                                    .locator("#group_by .pivot-column")
                                    .first();
                                await aggregator.dragTo(
                                    pageView.settingsPanel.activeColumns.container
                                        .locator(".column-selector-column")
                                        .first(),
                                );
                            }
                        }
                        await checkOutput(
                            pageView,
                            expected_output,
                            snapshot_state,
                        );
                    });
                }
            }
        }
    }
});

test.describe("Unique Behaviors", () => {
    for (const destination of ["groupby", "splitby"]) {
        test(`${destination} - Single Active Column - table_col`, async ({
            page,
        }) => {
            const view = new PageView(page);
            const [selector, state_snapshot] = await open(
                view,
                { open: true, active: true, columns: ["City"] },
                false,
            );

            await selector.container.dragTo(
                destination === "groupby"
                    ? view.settingsPanel.groupbyInput
                    : view.settingsPanel.splitbyInput,
            );
            await checkOutput(
                view,
                destination == "groupby"
                    ? {
                          unchanged: true,
                          type: "integer",
                      }
                    : { unchanged: true },
                state_snapshot,
            );
        });
        test(`${destination} - Multiple Active Columns - table_col`, async ({
            page,
        }) => {
            const view = new PageView(page);
            const [selector, state_snapshot] = await open(
                view,
                { open: true, active: true, columns: ["City", "State"] },
                false,
            );

            await selector.container.dragTo(
                destination === "groupby"
                    ? view.settingsPanel.groupbyInput
                    : view.settingsPanel.splitbyInput,
            );
            // Dragging a table column onto group_by/split_by removes
            // it from `view_config.columns` (so `show_styles` is false
            // → no Style tab); a non-expression column has no
            // Attributes tab either, so the sidebar closes.
            await checkOutput(view, { closed: true }, state_snapshot);
        });
    }

    test("Datagrid - switching between date and datetime should rerender", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            settings: true,
            plugin: "Datagrid",
            columns: ["date", "datetime"],
            expressions: { date: "date(0,0,0)", datetime: "now()" },
        });
        const date = await view.settingsPanel.activeColumns.getColumnByName(
            "date",
            true,
        );
        await date.editBtn.click();
        await view.columnSettingsSidebar.openTab("Style");
        const dateSnapshot =
            await view.columnSettingsSidebar.styleTab.container.innerHTML();
        const datetime = await view.settingsPanel.activeColumns.getColumnByName(
            "datetime",
            true,
        );
        await datetime.editBtn.click();
        const datetimeSnapshot =
            await view.columnSettingsSidebar.styleTab.container.innerHTML();
        expect(datetimeSnapshot).not.toEqual(dateSnapshot);
    });
});
