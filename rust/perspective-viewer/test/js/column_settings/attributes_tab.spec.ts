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

import { test, expect, PageView } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-debug.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Attributes Tab", () => {
    test("Expression column name becomes editable when attributes tab is open", async ({
        page,
    }) => {
        let view = new PageView(page);
        await view.restore({
            settings: true,
            expressions: { expr: "12345" },
            columns: ["expr"],
        });

        let expr =
            await view.settingsPanel.activeColumns.getColumnByName("expr");

        await expr.editBtn.click();
        let input = view.columnSettingsSidebar.nameInput;
        await view.columnSettingsSidebar.openTab("Style");
        await expect(input).toBeDisabled();
        await view.columnSettingsSidebar.openTab("Attributes");
        await expect(input).toBeEnabled();
    });

    test("Empty expression names", async ({ page }) => {
        // Setup
        let expr_value = "12345";
        let view = new PageView(page);
        await view.openSettingsPanel();
        await view.settingsPanel.createNewExpression("", expr_value);
        // Empty text matches expression
        let input = view.columnSettingsSidebar.nameInput;
        expect(await input.evaluate((input) => input!.value)).toBe("");
        expect(await input.evaluate((input) => input!.placeholder)).toBe(
            expr_value,
        );
        // Reopening the column shows an empty header with placeholder text that matches
        await view.columnSettingsSidebar.closeBtn.click();
        let expr =
            await view.settingsPanel.inactiveColumns.getColumnByName(
                expr_value,
            );
        await expr.editBtn.click();
        expect(await input.evaluate((input) => input!.value)).toBe("");
        expect(await input.evaluate((input) => input!.placeholder)).toBe(
            expr_value,
        );
        // Expression alias is the expression on serialization
        let config = await view.save();
        expect(config.expressions?.[expr_value]).toBe(expr_value);
    });

    test("Expression names do not overlap existing columns", async ({
        page,
    }) => {
        // Expressions should have an error state and be unsavable when the name matches an existing column
        let view = new PageView(page);
        await view.restore({
            expressions: { expr: "12345" },
            columns: ["expr", "Row ID"],
            settings: true,
        });
        let expr =
            await view.settingsPanel.activeColumns.getColumnByName("expr");
        await expr.editBtn.click();
        await view.columnSettingsSidebar.openTab("Attributes");
        let input = view.columnSettingsSidebar.nameInput;
        await input.clear();
        await input.type("Row ID", { delay: 100 });
        await expect(view.columnSettingsSidebar.nameInputWrapper).toHaveClass(
            /invalid/,
        );
        await expect(
            view.columnSettingsSidebar.attributesTab.saveBtn,
        ).toBeDisabled();
    });

    test("Tab Button Click enters 4 spaces.", async ({ page }) => {
        let view = new PageView(page);
        await view.restore({
            expressions: { expr: "12345" },
            columns: ["expr", "Row ID"],
            settings: true,
        });
        let expr =
            await view.settingsPanel.activeColumns.getColumnByName("expr");
        await expr.editBtn.click();
        await view.columnSettingsSidebar.openTab("Attributes");

        let sidebar = view.columnSettingsSidebar;
        let attributesTab = sidebar.attributesTab;

        let textarea = attributesTab.expressionEditor.textarea;

        await textarea.type("foo", { delay: 100 });
        expect(await textarea.evaluate((input) => input!.value)).toStrictEqual(
            "foo12345",
        );

        await page.keyboard.press("Tab");
        const expected = await textarea.evaluate((input) => input!.value);

        expect(expected).toContain("\t");

        const caretPosition = await textarea.evaluate(
            (input) => input!.selectionStart,
        );
        expect(caretPosition).toBe(4); // length of foo + length of '\t' = 4;
    });

    test("Reset button", async ({ page }) => {
        let view = new PageView(page);
        await view.restore({
            expressions: { expr: "12345" },
            columns: ["expr", "Row ID"],
            settings: true,
        });
        let expr =
            await view.settingsPanel.activeColumns.getColumnByName("expr");
        await expr.editBtn.click();
        await view.columnSettingsSidebar.openTab("Attributes");

        let sidebar = view.columnSettingsSidebar;
        let attributesTab = sidebar.attributesTab;

        await expect(attributesTab.resetBtn).toBeDisabled();

        await sidebar.nameInput.type("foo", { delay: 100 });
        await expect(attributesTab.resetBtn).toBeEnabled();
        await attributesTab.resetBtn.click();
        expect(
            await sidebar.nameInput.evaluate((input) => input!.value),
        ).toStrictEqual("expr");

        let textarea = attributesTab.expressionEditor.textarea;
        await textarea.type("foo", {
            delay: 100,
        });
        await expect(attributesTab.resetBtn).toBeEnabled();
        await attributesTab.resetBtn.click();
        expect(await textarea.evaluate((input) => input!.value)).toStrictEqual(
            "12345",
        );
    });

    test("Delete button", async ({ page }) => {
        let view = new PageView(page);
        await view.restore({
            expressions: { expr: "12345" },
            columns: ["expr", "Row ID"],
            settings: true,
        });
        let expr =
            await view.settingsPanel.activeColumns.getColumnByName("expr");
        await expr.editBtn.click();
        await view.columnSettingsSidebar.openTab("Attributes");
        let attributesTab = view.columnSettingsSidebar.attributesTab;

        await expect(attributesTab.deleteBtn).toBeDisabled();
        await expr.activeBtn.click();

        expr = await view.settingsPanel.inactiveColumns.getColumnByName("expr");
        await expect(attributesTab.deleteBtn).toBeEnabled();
        await attributesTab.deleteBtn.click();
        await expect(attributesTab.container).toBeHidden();

        let config = await view.save();
        expect(config?.expressions).toStrictEqual({});
    });

    test("Rename empty header as expression value", async ({ page }) => {
        let view = new PageView(page);
        let settingsPanel = await view.openSettingsPanel();
        await settingsPanel.createNewExpression("", "1234");
        await view.columnSettingsSidebar.nameInput.type("1234");
        await expect(
            view.columnSettingsSidebar.nameInputWrapper,
        ).not.toHaveClass("invalid");
        // NOTE: Currently when you rename a column as the contents of its placeholder,
        // it gets serialized with the expression name. This confuses the components and it deserializes
        // as if it had an empty header.
        // Changing this behavior may require changing the way we serialize expressions.
        // For this to work, an expression should have a unique ID. API might look like this:
        // `const settings = {expressions: {"SOME_ID": {name: "foobar", expr: "123"}, "ANOTHER_ID": {expr: "'i have no name'"}}};`
        // We could then change the ColumnLocator struct to look like this:
        // `enum ColumnLocator {TableColumn(String), ExprColumn(Option<String>), NewExpr()}`
    });
});
