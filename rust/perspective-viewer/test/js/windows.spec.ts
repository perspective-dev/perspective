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

import { test, expect } from "./helpers.ts";

test.describe("Window columns", () => {
    test.beforeEach(async function init({ page }) {
        await page.goto(
            "/rust/perspective-viewer/test/html/superstore-inline.html",
        );

        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    test("restore({windows}) renders and save() round-trips", async ({
        page,
    }) => {
        const windows = {
            cumsum: {
                column: "Sales",
                aggregate: "sum",
                order_by: ["Row ID", "asc"],
                partition_by: ["Region"],
                cumulative: true,
            },
        };

        const saved = await page.evaluate(async (windows) => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                columns: ["Row ID", "Sales", "cumsum"],
                sort: [["Row ID", "asc"]],
                windows,
            });
            return await viewer.save();
        }, windows);

        expect(saved.windows).toEqual(windows);
        expect(saved.columns).toEqual(["Row ID", "Sales", "cumsum"]);

        // The window column materializes real values in the rendered view.
        const has_values = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const view = await viewer.getView();
            const cols = await view.to_columns();
            return (
                cols["cumsum"].length > 0 &&
                cols["cumsum"].every((x) => typeof x === "number")
            );
        });
        expect(has_values).toBe(true);
    });

    test("window column works as a group_by aggregate through the viewer", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                group_by: ["Region"],
                columns: ["cumsum"],
                aggregates: { cumsum: "max" },
                windows: {
                    cumsum: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        partition_by: ["Region"],
                        cumulative: true,
                    },
                },
            });
            const view = await viewer.getView();
            const json = await view.to_json();
            return json.length;
        });

        // TOTAL row + one row per Region
        expect(result).toBe(5);
    });

    test("create a window column from the New Column button", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");

            // A small active set - with every column active, the
            // virtualized active list leaves `#add-expression` below the
            // scroll fold, unrendered.
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID"],
            });
        });

        await page.click("#add-expression");
        await page.click("#Window");

        // The form opens with EMPTY slots (an invalid draft, Save gated) -
        // stage a source and order by, then name and save. Op and frame
        // keep their defaults (`sum`, `cumulative`).
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Row ID")',
            "#window-source",
        );
        await page.fill("#window-order-by .column-empty-input", "Row ID");
        await page.press("#window-order-by .column-empty-input", "Enter");
        await page.fill("input.sidebar_header_title", "my window");
        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return Object.keys(saved.windows ?? {}).length === 1;
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });

        expect(Object.keys(saved.windows)).toEqual(["my window"]);
        expect(saved.windows["my window"].aggregate).toBe("sum");
        expect(saved.windows["my window"].cumulative).toBeUndefined();
    });

    test("order by is optional - an empty slot saves a natural-order window", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "Sales"],
            });
        });

        await page.click("#add-expression");
        await page.click("#Window");

        // Source only - the empty order slot means natural (pkey/rowid)
        // order, so the draft validates without it.
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Sales")',
            "#window-source",
        );
        await page.fill("input.sidebar_header_title", "nat");
        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return Object.keys(saved.windows ?? {}).length === 1;
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(saved.windows["nat"].order_by).toBeUndefined();
        expect(saved.windows["nat"].cumulative).toBeUndefined();
    });

    test("edit an existing window column via its edit button", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });
        });

        // Open the editor from the active column's edit affordance, then
        // switch the op.
        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");
        await page.selectOption(
            "#window-source .aggregate-selector-wrapper select",
            "avg",
        );
        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return saved.windows?.["w1"]?.aggregate === "avg";
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });

        expect(saved.windows["w1"].aggregate).toBe("avg");
    });

    test("delete an unused window column from the editor", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });
        });

        // Unused windows list in the inactive section with an enabled edit
        // button; delete is enabled because the column is unused.
        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#psp-expression-editor-button-delete");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return Object.keys(saved.windows ?? {}).length === 0;
        });
    });

    test("drops into window editor slots stage without committing", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "Sales"],
            });
        });

        await page.click("#add-expression");
        await page.click("#Window");

        // Drag the active "Sales" column into the source slot; fill order
        // by via the slot's AUTOCOMPLETE text input (EmptyColumn).
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Sales")',
            "#window-source",
        );
        await page.fill("#window-order-by .column-empty-input", "Row ID");
        await page.press("#window-order-by .column-empty-input", "Enter");

        // STAGED: nothing committed yet, and the drag origins are intact.
        const before = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(before.windows ?? {}).toEqual({});
        expect(before.columns).toEqual(["Row ID", "Sales"]);

        // The op selector lives in the source pill's aggregate-selector
        // space - the only op control in the UI.
        await page.selectOption(
            "#window-source .aggregate-selector-wrapper select",
            "avg",
        );

        await page.fill("input.sidebar_header_title", "dragged window");
        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return Object.keys(saved.windows ?? {}).length === 1;
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });

        expect(saved.windows["dragged window"]).toEqual({
            column: "Sales",
            aggregate: "avg",
            order_by: ["Row ID", "asc"],
        });
        expect(saved.columns).toEqual(["Row ID", "Sales"]);
    });

    test("partition drop zone appends staged partition columns", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "Sales", "Region"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });
        });

        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");

        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Region")',
            "#window-partition-by",
        );
        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return (saved.windows?.["w1"]?.partition_by?.length ?? 0) === 1;
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(saved.windows["w1"].partition_by).toEqual(["Region"]);

        // Region remains active - staged drops never remove their origin.
        expect(saved.columns).toEqual(["Row ID", "Sales", "Region"]);
    });

    test("window columns pass commit validation when referenced by later updates", async ({
        page,
    }) => {
        // Drops in the column/config selectors commit updates that NAME an
        // already-defined window - the same shape as these two-step
        // restores, which regressed when `validate_names` did not include
        // windows in its allowed set.
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                columns: ["Row ID"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });

            // manual `columns` referencing the window, as a separate update
            await viewer.restore({ columns: ["Row ID", "w1"] });

            // and every config-selector drop zone
            await viewer.restore({
                group_by: ["w1"],
                sort: [["w1", "desc"]],
                filter: [["w1", ">", 0]],
            });
            return await viewer.save();
        });

        expect(saved.columns).toEqual(["Row ID", "w1"]);
        expect(saved.group_by).toEqual(["w1"]);
        expect(saved.sort).toEqual([["w1", "desc"]]);
    });

    test("slot pill drags to another slot as a move", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "Sales"],
            });
        });

        await page.click("#add-expression");
        await page.click("#Window");
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Sales")',
            "#window-source",
        );

        // Move: the source pill drags into the order by slot, which fills
        // while the source slot returns to its empty autocomplete state.
        await page.dragAndDrop(
            "#window-source .column-selector-draggable",
            "#window-order-by",
        );

        await expect(
            page.locator("#window-order-by .column-selector-draggable"),
        ).toContainText("Sales");
        await expect(
            page.locator("#window-source .column-empty-input"),
        ).toBeVisible();
        await expect(page.locator(".window-editor-error")).toContainText(
            "Missing Column",
        );
    });

    test("partition pill moved to a slot does not duplicate", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        partition_by: ["Region"],
                        cumulative: true,
                    },
                },
            });
        });

        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");

        // Regression: pre-fix this drop ADDED to order by while leaving the
        // partition pill in place, duplicating the column across slots.
        await page.dragAndDrop(
            "#window-partition-by .pivot-column-draggable",
            "#window-order-by",
        );

        await expect(
            page.locator("#window-partition-by .pivot-column-draggable"),
        ).toHaveCount(0);

        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return saved.windows?.["w1"]?.order_by?.[0] === "Region";
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(saved.windows["w1"].order_by).toEqual(["Region", "asc"]);
        expect(saved.windows["w1"].partition_by ?? []).toEqual([]);
    });

    test("slot pill dropped on its own slot is a no-op", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                    },
                },
            });
        });

        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");
        await page.dragAndDrop(
            "#window-source .column-selector-draggable",
            "#window-source",
        );

        await expect(
            page.locator("#window-source .column-selector-draggable"),
        ).toContainText("Sales");
        await expect(page.locator(".window-editor-error")).toHaveCount(0);

        // A no-op drop leaves the draft equal to the saved spec, so the
        // change-gated Save stays disabled and the saved config is intact.
        await expect(
            page.locator("#psp-expression-editor-button-save"),
        ).toBeDisabled();

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(saved.windows["w1"].column).toBe("Sales");
    });

    test("slot pill dropped on a committing zone commits the zone and resets the draft", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        partition_by: ["Region"],
                        cumulative: true,
                    },
                },
            });
        });

        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");
        await page.dragAndDrop(
            "#window-partition-by .pivot-column-draggable",
            "#group_by",
        );

        // The committing zone applies immediately; the SAVED window is
        // untouched, while the staged origin-removal stays visible in the
        // editor (the editor's draft is only reset when the saved spec
        // itself changes). The removal commits with the editor's Save,
        // like every other staged edit.
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return (saved.group_by ?? []).length === 1;
        });

        const after = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(after.group_by).toEqual(["Region"]);
        expect(after.windows["w1"].partition_by).toEqual(["Region"]);
        await expect(
            page.locator("#window-partition-by .pivot-column-draggable"),
        ).toHaveCount(0);
    });

    test("op selector only offers type-valid ops for the source column", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "Region", "Sales"],
            });
        });

        await page.click("#add-expression");
        await page.click("#Window");

        // A string source hides the numeric-only ops and coerces the
        // orphaned default ("sum") to "count" - no inline error.
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Region")',
            "#window-source",
        );

        const select = page.locator(
            "#window-source .aggregate-selector-wrapper select",
        );
        await expect(select).toHaveValue("count");
        expect(await select.locator("option").allTextContents()).toEqual([
            "count",
            "min",
            "max",
            "lag",
            "lead",
        ]);
        // No error at all: the coerced op is valid for the string source,
        // and the empty order slot is a valid natural-order draft.
        await expect(page.locator(".window-editor-error")).toHaveCount(0);

        // A numeric source restores the full op list; the user's (still
        // valid) op choice is preserved.
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Sales")',
            "#window-source",
        );

        await expect(select).toHaveValue("count");
        expect(await select.locator("option").allTextContents()).toEqual([
            "sum",
            "avg",
            "count",
            "min",
            "max",
            "stddev",
            "var",
            "lag",
            "lead",
            "diff",
            "rate",
            "ema",
        ]);
    });

    test("drawer width is trap-doored across editor tab switches", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "Sales"],
            });
        });

        // The new-column drawer offers Attributes (expression) + Window.
        await page.click("#add-expression");
        const sidebar = page.locator("#column_settings_sidebar");
        const width = async () => (await sidebar.boundingBox()).width;

        const w1 = await width();
        await page.click("#Window");
        await expect.poll(width).toBeGreaterThanOrEqual(w1);

        // Returning to the first tab must not shrink the drawer - the
        // shared trap-door holds the high-water mark.
        const w2 = await width();
        await page.click("#Attributes");
        await expect.poll(width).toBeGreaterThanOrEqual(w2);
    });

    test("drawer holds its width when a staged slot empties", async ({
        page,
    }) => {
        // The longest Table column name in the inline superstore fixture,
        // made ACTIVE so it can be dragged (the inactive list is
        // virtualized) - slots take Table columns only, so an expression
        // alias cannot serve as the long pill here.
        const LONG = "Sub-Category";
        await page.evaluate(async (LONG) => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", LONG],
            });
        }, LONG);

        await page.click("#add-expression");
        await page.click("#Window");
        const sidebar = page.locator("#column_settings_sidebar");
        const width = async () => (await sidebar.boundingBox()).width;
        const before = await width();

        // The pill (name + op selector + chrome) expands the drawer; the
        // expansion happens in the editor's own render (the draft is still
        // invalid), so only the DOM-level observer can see it.
        await page.dragAndDrop(
            `.column-selector-draggable:has-text("${LONG}")`,
            "#window-source",
        );
        await expect.poll(width).toBeGreaterThanOrEqual(before);
        const expanded = await width();

        // Emptying the slot must NOT revert the drawer to natural width.
        await page.click("#window-source .row_close");
        await expect(
            page.locator("#window-source .column-selector-draggable"),
        ).toHaveCount(0);
        await page.waitForTimeout(200);
        expect(await width()).toBe(expanded);
    });

    test("slots reject expression and window columns", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "expr1", "w1"],
                expressions: { expr1: '"Sales" + 1' },
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });
        });

        await page.click("#add-expression");
        await page.click("#Window");

        // Only true Table columns may fill slots - expression aliases and
        // other window columns would create dependency cycles. The drop is
        // a no-op (the hover shows the invalid-X overlay).
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("expr1")',
            "#window-source",
        );
        await expect(
            page.locator("#window-source .column-selector-draggable"),
        ).toHaveCount(0);
        await expect(
            page.locator("#window-source .column-empty-input"),
        ).toBeVisible();

        await page.dragAndDrop(
            '.column-selector-draggable:has-text("w1")',
            "#window-order-by",
        );
        await expect(
            page.locator("#window-order-by .column-selector-draggable"),
        ).toHaveCount(0);

        // A Table column still lands.
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Row ID")',
            "#window-order-by",
        );
        await expect(
            page.locator("#window-order-by .column-selector-draggable"),
        ).toContainText("Row ID");
    });

    test("order pill's sort icon toggles direction, staged until Save", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });
        });

        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");

        const icon = page.locator("#window-order-by .sort-icon");
        await expect(icon).toHaveClass(/asc/);
        await icon.click();
        await expect(icon).toHaveClass(/desc/);

        // STAGED: the saved config still has the ascending order.
        const before = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(before.windows["w1"].order_by).toEqual(["Row ID", "asc"]);

        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return saved.windows?.["w1"]?.order_by?.[1] === "desc";
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(saved.windows["w1"].order_by).toEqual(["Row ID", "desc"]);
    });

    test("descending order round-trips restore/save and the editor", async ({
        page,
    }) => {
        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "desc"],
                        cumulative: true,
                    },
                },
            });
            return await viewer.save();
        });
        expect(saved.windows["w1"].order_by).toEqual(["Row ID", "desc"]);

        // The editor initializes its pill from the saved direction.
        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");
        await expect(page.locator("#window-order-by .sort-icon")).toHaveClass(
            /desc/,
        );
    });

    test("pin button docks the drawer into the layout and back", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "Sales"],
            });
        });

        await page.click("#add-expression");
        await page.click("#Window");

        // Stage a draft first - the pin toggle must NOT remount the editor
        // (which would wipe it).
        await page.dragAndDrop(
            '.column-selector-draggable:has-text("Sales")',
            "#window-source",
        );

        const modal_style = async () =>
            await page.evaluate(() => {
                const root =
                    document.querySelector("perspective-viewer").shadowRoot;
                const modal = root.querySelector("#modal_panel");
                return {
                    position: getComputedStyle(modal).position,
                    pinned: modal.classList.contains("pinned"),
                    width: modal.getBoundingClientRect().width,
                };
            });

        const floating = await modal_style();
        expect(floating.position).toBe("absolute");
        expect(floating.pinned).toBe(false);

        // Pin: the drawer becomes a static flex sibling and stops spanning
        // the whole main area.
        await page.click("#column_settings_pin_button");
        const pinned = await modal_style();
        expect(pinned.position).toBe("static");
        expect(pinned.pinned).toBe(true);
        expect(pinned.width).toBeLessThan(floating.width);

        // The staged draft survived the toggle - no remount.
        await expect(
            page.locator("#window-source .column-selector-draggable"),
        ).toContainText("Sales");

        // Unpin restores the overlay.
        await page.click("#column_settings_pin_button");
        const restored = await modal_style();
        expect(restored.position).toBe("absolute");
        expect(restored.pinned).toBe(false);
    });

    test("frame type dropdown selects a Rows frame", async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                settings: true,
                columns: ["Row ID", "w1"],
                windows: {
                    w1: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });
        });

        await page.click(
            ".column-selector-column .expression-edit-button:not(.disabled)",
        );
        await page.click("#Window");

        // The radio group is now a dropdown; picking "Rows" reveals the
        // frame-size parameter input.
        await page.selectOption("#window-frame-type", "Rows");
        const param = page.locator("#window-editor-container input.parameter");
        await param.fill("5");

        // Number fields cannot hold an invalid value - clearing resets to
        // the default 1.
        await param.fill("");
        await expect(param).toHaveValue("1");

        await param.fill("5");
        await page.click("#psp-expression-editor-button-save");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer");
            const saved = await viewer.save();
            return saved.windows?.["w1"]?.rows === 5;
        });

        const saved = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            return await viewer.save();
        });
        expect(saved.windows["w1"].rows).toBe(5);
    });

    test("restore merges windows; explicit empty object clears them", async ({
        page,
    }) => {
        const [kept, cleared] = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug",
                columns: ["Row ID", "w"],
                windows: {
                    w: {
                        column: "Sales",
                        aggregate: "sum",
                        order_by: ["Row ID", "asc"],
                        cumulative: true,
                    },
                },
            });

            // `restore` is an update: an omitted `windows` key keeps them
            await viewer.restore({ sort: [["Row ID", "desc"]] });
            const kept = await viewer.save();

            await viewer.restore({ columns: ["Row ID"], windows: {} });
            const cleared = await viewer.save();
            return [kept, cleared];
        });

        expect(Object.keys(kept.windows ?? {}).length).toBe(1);
        expect(cleared.windows ?? {}).toEqual({});
    });
});
