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

import { test, expect, PageView, ColumnSettingsSidebar } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

export async function checkTab(
    columnSettingsSidebar: ColumnSettingsSidebar,
    active: boolean,
    expression: boolean,
    hasStyles: boolean = true,
) {
    await columnSettingsSidebar.container.waitFor({
        state: "visible",
    });
    let titles = await columnSettingsSidebar.tabTitle.all();
    if (active) {
        if (expression) {
            if (hasStyles) {
                expect(titles.length).toBe(2);
                expect(await titles[0].getAttribute("id")).toBe("Style");
                expect(await titles[1].getAttribute("id")).toBe("Attributes");
            } else {
                expect(titles.length).toBe(1);
                expect(await titles[0].getAttribute("id")).toBe("Attributes");
            }
        } else {
            expect(titles.length).toBe(1);
            expect(await titles[0].getAttribute("id")).toBe("Style");
        }
    } else {
        if (expression) {
            expect(titles.length).toBe(1);
            expect(await titles[0].getAttribute("id")).toBe("Attributes");
        } else {
            test.fail(
                true,
                "No settings exist for non-expression, inactive columns!",
            );
        }
    }
}

test.describe("Column Settings Sidebar", () => {
    test("edit button > opens sidebar for active table and expression columns", async ({
        page,
    }) => {
        let view = new PageView(page);
        let settingsPanel = await view.openSettingsPanel();
        let inactiveColumns = settingsPanel.inactiveColumns;
        let activeColumns = settingsPanel.activeColumns;

        await settingsPanel.createNewExpression("expr", "true");
        await inactiveColumns.container.waitFor({
            state: "visible",
        });
        let exprCol = await activeColumns.activateColumn("expr");
        let firstCol = await activeColumns.getFirstVisibleColumn();

        firstCol.editBtn.waitFor();
        await firstCol.editBtn.click();
        await checkTab(view.columnSettingsSidebar, true, false);

        await activeColumns.scrollToBottom();
        exprCol.editBtn.waitFor();
        await exprCol.editBtn.click();
        await checkTab(view.columnSettingsSidebar, true, true);
    });
    test("edit button > opens sidebar for inactive expression columns", async ({
        page,
    }) => {
        let view = new PageView(page);
        let settingsPanel = await view.openSettingsPanel();
        let inactiveColumns = settingsPanel.inactiveColumns;
        let activeColumns = settingsPanel.activeColumns;

        await settingsPanel.createNewExpression("expr", "true");
        let exprCol = await inactiveColumns.getColumnByName("expr");
        await activeColumns.toggleColumn("Row ID");
        let rowId = await inactiveColumns.getColumnByName("Row ID");
        expect(exprCol).toBeDefined();
        expect(rowId).toBeDefined();

        await exprCol.editBtn.waitFor();
        await rowId.editBtn.waitFor({ state: "detached", timeout: 1000 });

        await view.assureColumnSettingsClosed();
        await exprCol.editBtn.click();
        await checkTab(view.columnSettingsSidebar, false, true);
    });
    test("tabs > switches between style and attributes tabs", async ({
        page,
    }) => {
        let view = new PageView(page);
        let settingsPanel = await view.openSettingsPanel();
        let sidebar = view.columnSettingsSidebar;
        let activeColumns = settingsPanel.activeColumns;
        let inactiveColumns = settingsPanel.inactiveColumns;

        await settingsPanel.createNewExpression("expr", "'string'");
        await activeColumns.activateColumn("expr");
        let col = await activeColumns.getColumnByName("expr");
        await inactiveColumns.container.waitFor({ state: "hidden" });
        await activeColumns.scrollToBottom();
        await view.assureColumnSettingsOpen(col);
        await checkTab(sidebar, true, true, true);
        let tabs = await sidebar.tabTitle.all();
        await tabs[1].click();
        await sidebar.attributesTab.container.waitFor();
        await tabs[0].click();
        await sidebar.styleTab.container.waitFor();
    });

    test("state > persists sidebar when table data updates", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            // @ts-ignore
            let table = await window.__TEST_WORKER__.table({ x: [0] });
            // @ts-ignore
            window.__TEST_TABLE__ = table;
            let viewer = document.querySelector("perspective-viewer");
            await viewer?.load(table);
        });

        let view = new PageView(page);
        let settingsPanel = await view.openSettingsPanel();
        let col = settingsPanel.activeColumns.getFirstVisibleColumn();
        await col.editBtn.click();
        await view.columnSettingsSidebar.container.waitFor();
        await page.evaluate(() => {
            // @ts-ignore
            window.__TEST_TABLE__.update({ x: [1] });
        });

        await page.waitForFunction(() => {
            return (
                document
                    .querySelector("perspective-viewer-datagrid")
                    ?.shadowRoot?.querySelectorAll("tbody tr").length! >= 1
            );
        });

        await expect(view.columnSettingsSidebar.container).toBeVisible();
    });

    test("layout > constrains width with long expression text", async ({
        page,
    }) => {
        let view = new PageView(page);

        const MAX_WIDTH = 350;
        let checkWidth = async () => {
            let width = await view.columnSettingsSidebar.container.evaluate(
                (sidebar) => sidebar.getBoundingClientRect().width,
            );
            expect(width).toEqual(MAX_WIDTH);
        };

        let settings = await view.openSettingsPanel();
        await settings.activeColumns.scrollToBottom();
        await settings.addExpressionButton.click();
        let editor = view.columnSettingsSidebar.attributesTab.expressionEditor;
        await editor.textarea.focus();
        await editor.textarea.clear();

        await editor.textarea.type(
            "'0000000000000000000000000000000000000000000000000000000000",
        );
        await checkWidth();
        await editor.textarea.clear();
        await checkWidth();
    });

    test("tabs > preserves selected tab when toggling and saving expression", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            expressions: {
                expr: "1234",
            },
            columns: ["Row ID"],
            settings: true,
        });

        const col =
            await view.settingsPanel.inactiveColumns.getColumnByName("expr");
        await col.editBtn.click();
        await view.columnSettingsSidebar.openTab("Attributes");
        await checkTab(view.columnSettingsSidebar, false, true);
        const selectedTab = async () => {
            return await view.columnSettingsSidebar.selectedTab
                .locator(".tab-title")
                .getAttribute("id");
        };

        expect(await selectedTab()).toBe("Attributes");
        await col.activeBtn.click();
        await view.columnSettingsSidebar.container
            .locator(".tab-title#Style")
            .waitFor({ state: "visible" });

        await checkTab(view.columnSettingsSidebar, true, true, true);
        expect(await selectedTab()).toBe("Attributes");
        await view.columnSettingsSidebar.attributesTab.expressionEditor.textarea.clear();
        await view.columnSettingsSidebar.attributesTab.expressionEditor.textarea.type(
            "'new expr value'",
        );

        await view.columnSettingsSidebar.attributesTab.saveBtn.click();
        expect(await selectedTab()).toBe("Attributes");
    });

    test("color range > resets to default when switching to a different number column", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            plugin: "Datagrid",
            columns: ["Row ID", "Postal Code"],
            settings: true,
        });

        const defaultNegColor = "#ff471e";

        let settingsPanel = await view.openSettingsPanel();

        let activeColumns = settingsPanel.activeColumns;
        let firstCol = await activeColumns.getColumnByName("Row ID");
        let secondCol = await activeColumns.getColumnByName("Postal Code");

        // edit first number column
        await firstCol.editBtn.waitFor();
        await firstCol.editBtn.click();
        await checkTab(view.columnSettingsSidebar, true, false, false);

        // expect style tab is selected
        const selectedTab = async () => {
            return await view.columnSettingsSidebar.selectedTab
                .locator(".tab-title")
                .getAttribute("id");
        };
        expect(await selectedTab()).toBe("Style");
        const getFgColorNeg = async () => {
            return view.columnSettingsSidebar.styleTab.container.locator(
                "input.neg_fg_color",
            );
        };

        let fgColorNeg = await getFgColorNeg();
        expect(fgColorNeg).toBeTruthy();
        expect(fgColorNeg).toBeVisible();
        expect(fgColorNeg).toBeEditable();
        expect(fgColorNeg).toHaveValue(defaultNegColor);

        // change -ve color from default
        await fgColorNeg.fill("#ffff00");

        let negColorValue = await fgColorNeg.inputValue();
        expect(negColorValue).toBe("#ffff00");

        // edit second number column
        await secondCol.editBtn.waitFor();
        await secondCol.editBtn.click();

        // expect -ve color input on color range is present
        fgColorNeg = await getFgColorNeg();

        expect(fgColorNeg).toBeVisible();

        // expect -ve color input updates and switches back to default
        negColorValue = await fgColorNeg.inputValue();
        expect(negColorValue).toBe(defaultNegColor);

        // edit first number column
        await firstCol.editBtn.waitFor();
        await firstCol.editBtn.click();

        // expect -ve color input on color range is present
        fgColorNeg = await getFgColorNeg();

        expect(fgColorNeg).toBeVisible();

        // expect -ve color input updates and switches back to the changed value
        negColorValue = await fgColorNeg.inputValue();
        expect(negColorValue).toBe("#ffff00");
    });
});
