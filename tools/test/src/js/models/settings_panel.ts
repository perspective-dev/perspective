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

import { Locator, Page, expect, test } from "@playwright/test";
import { PageView } from "./page";

type ViewParameter = "groupby" | "splitby" | "orderby" | "where";

async function autocompleteSelect(page: Page, input: Locator, name: string) {
    await input.pressSequentially(name);
    await page.locator("perspective-dropdown .selected").first().waitFor();
    await input.press("Enter");
}

export class SettingsPanel {
    pageView: PageView;
    container: Locator;
    closeButton: Locator;
    activeColumns: ActiveColumns;
    inactiveColumns: InactiveColumns;
    addExpressionButton: Locator;
    pluginSelector: Locator;
    groupbyInput: Locator;
    splitbyInput: Locator;
    orderbyInput: Locator;
    whereInput: Locator;

    constructor(view: PageView) {
        this.pageView = view;
        const viewer = view.container;
        this.container = viewer.locator("#settings_panel");
        this.closeButton = viewer.locator("#settings_close_button");
        this.activeColumns = new ActiveColumns(this.pageView);
        this.inactiveColumns = new InactiveColumns(this.pageView);
        this.addExpressionButton = viewer.locator("#add-expression");
        this.pluginSelector = viewer.locator("#plugin_selector_container");
        this.groupbyInput = viewer.locator("#group_by input");
        this.splitbyInput = viewer.locator("#split_by input");
        this.orderbyInput = viewer.locator("#sort input");
        this.whereInput = viewer.locator("#filter input");
    }

    /**
     * Creates and saves a new expression column.
     * @param expr
     */
    async createNewExpression(
        name: string,
        expr: string,
        successAssertion: boolean = true
    ) {
        await this.activeColumns.scrollToBottom();
        await this.addExpressionButton.click();
        let sidebar = this.pageView.columnSettingsSidebar;
        let exprEditor = sidebar.attributesTab.expressionEditor;
        await exprEditor.container.waitFor({
            state: "visible",
        });
        await sidebar.nameInput.waitFor({
            state: "visible",
        });
        expect(await exprEditor.textarea.isVisible()).toBe(true);
        expect(await sidebar.nameInput.isVisible()).toBe(true);

        await sidebar.nameInput.focus();
        await sidebar.nameInput.clear();
        await sidebar.nameInput.type(name, { delay: 100 });
        await sidebar.nameInput.press("Enter");
        await sidebar.nameInput.blur();

        await exprEditor.textarea.focus();
        await exprEditor.textarea.clear();
        await exprEditor.textarea.type(expr, { delay: 100 });
        await exprEditor.textarea.blur();

        let saveBtn = this.pageView.page.locator(
            "#psp-expression-editor-button-save"
        );
        if (successAssertion) {
            expect(await saveBtn.isDisabled()).toBe(false);
            await saveBtn.click();
            const col = await this.inactiveColumns.getColumnByName(name);
            await col.container.first().waitFor();
        } else {
            expect(await saveBtn.isDisabled()).toBe(true);
        }
    }
    /**
     * Renames an inactive expression column.
     * @param name
     * @param expr
     */
    async renameExpression(column: ColumnSelector, name: string) {
        await this.pageView.assureColumnSettingsOpen(column);
        let sidebar = this.pageView.columnSettingsSidebar;
        await sidebar.nameInput.waitFor({
            state: "visible",
        });
        expect(await sidebar.nameInput.isVisible()).toBe(true);

        await sidebar.nameInput.focus();
        await sidebar.nameInput.clear();
        await sidebar.nameInput.type(name, { delay: 100 });

        await expect(sidebar.attributesTab.saveBtn).toBeEnabled();
        await sidebar.attributesTab.saveBtn.click();
    }

    async editExpression(column: ColumnSelector, newExpression: string) {
        await this.pageView.assureColumnSettingsOpen(column);
        let sidebar = this.pageView.columnSettingsSidebar;
        await sidebar.openTab("Attributes");
        let exprEditor = sidebar.attributesTab.expressionEditor;
        expect(await exprEditor.textarea.isVisible()).toBe(true);
        await exprEditor.textarea.focus();
        await exprEditor.textarea.clear();
        await exprEditor.textarea.type(newExpression, { delay: 100 });
        await exprEditor.textarea.blur();
        let saveBtn = this.pageView.page.locator(
            "#psp-expression-editor-button-save"
        );
        expect(await saveBtn.isDisabled()).toBe(false);
        await saveBtn.click();
    }
    /**
     * Shorthand for setViewParamter("groupby", name)
     */
    async groupby(name: string) {
        return await this.setViewParameter("groupby", name);
    }
    /**
     * Shorthand for setViewParamter("splitby", name)
     */
    async splitby(name: string) {
        return await this.setViewParameter("splitby", name);
    }
    /**
     * Shorthand for setViewParamter("orderby", name)
     */
    async orderby(name: string) {
        return await this.setViewParameter("orderby", name);
    }
    /**
     * Shorthand for setViewParamter("where", name)
     */
    async where(name: string) {
        return await this.setViewParameter("where", name);
    }
    /**
     * Sets a view parameter ("groupby", "splitby", "orderby", or "where") to the specified column name.
     * @param type
     * @param name
     */
    async setViewParameter(type: ViewParameter, name: string) {
        let locator: Locator;
        switch (type) {
            case "groupby":
                locator = this.groupbyInput;
                break;
            case "orderby":
                locator = this.orderbyInput;
                break;
            case "splitby":
                locator = this.splitbyInput;
                break;
            case "where":
                locator = this.whereInput;
                break;
            default:
                throw "Invalid type passed!";
        }
        await autocompleteSelect(this.pageView.page, locator, name);
    }

    async removeViewParameter(type: ViewParameter, name: string) {
        let locator: Locator;
        switch (type) {
            case "groupby":
                locator = this.container.locator("#group_by .pivot-column");
                break;
            case "orderby":
                locator = this.container.locator("#sort .pivot-column");
                break;
            case "splitby":
                locator = this.container.locator("#split_by .pivot-column");
                break;
            case "where":
                locator = this.container.locator("#filter .pivot-column");
                break;
            default:
                throw "Invalid type passed!";
        }
        await locator
            .filter({ hasText: name })
            .first()
            .locator(".row_close")
            .click();
    }

    /**
     * Selects a plugin by it's display name, i.e. the innerText of the .plugin-select-item
     * @param name
     */
    async selectPlugin(name: string) {
        await this.pluginSelector.click();
        await this.pluginSelector.locator(`[data-plugin="${name}"]`).click();
    }
}

export class ColumnSelector {
    active: boolean;
    activeBtn: Locator;
    name: Locator;
    container: Locator;
    editBtn: Locator;
    aggSelector: Locator;

    constructor(container: Locator, active: boolean) {
        this.container = container;
        this.active = active;
        this.name = container.locator("div .column_name");
        this.aggSelector = container.locator("select");
        this.editBtn = container.locator("div .expression-edit-button");
        this.activeBtn = container.locator(".is_column_active");
    }
}

export type ColumnType =
    | "integer"
    | "float"
    | "string"
    | "date"
    | "datetime"
    | "numeric"
    | "calendar";

// TODO: Consolidate this and InactiveColumns into a super class
export class ActiveColumns {
    view: PageView;
    page: Page;
    container: Locator;
    topPanel: Locator;
    columnSelector: Locator;
    newColumnInput: Locator;

    constructor(view: PageView) {
        this.page = view.page;
        this.view = view;
        this.container = view.container.locator("#active-columns");
        this.topPanel = view.container.locator("#top_panel");
        this.columnSelector = view.container.locator(
            "#active-columns :not(.top-panel) .column-selector-column"
        );
        this.newColumnInput = view.container.locator(
            ".column-selector-column .column-empty input"
        );
    }

    getFirstVisibleColumn() {
        return new ColumnSelector(this.columnSelector.first(), true);
    }

    async getColumnByName(name: string, exact: boolean = false) {
        let locators = this.columnSelector.filter({
            hasText: name,
        });

        let locator: Locator;
        if (exact) {
            locator = (await locators.all()).filter(
                async (l) => (await l.innerText()) === name
            )[0];
        } else {
            locator = locators.first();
        }

        return new ColumnSelector(locator, true);
    }

    /**
     * Gets the first visible column matching the passed in type.
     * @param type - A string to denote the type. Use "numeric" to mean "integer or float" and "calendar" to denote "date or datetime"
     */
    getColumnByType(type: ColumnType) {
        let page = this.view.page;
        let has: Locator;
        switch (type) {
            case "numeric":
                has = page.locator(".float").or(page.locator(".integer"));
                break;
            case "calendar":
                has = page.locator(".date").or(page.locator(".datetime"));
                break;
            default:
                has = page.locator(`.${type}`);
                break;
        }
        return new ColumnSelector(
            this.columnSelector.filter({ has }).first(),
            true
        );
    }

    async visibleColumns() {
        let all = await this.columnSelector.all();
        let mapped = all.map((locator) => {
            return new ColumnSelector(locator, true);
        });
        return mapped;
    }

    async scrollToTop() {
        this.container.focus();
        await this.container.evaluate((node) => (node.scrollTop = 0));
    }
    async scrollToBottom() {
        this.container.focus();
        await this.container.evaluate(
            (node) => (node.scrollTop = node.scrollHeight)
        );
    }

    async toggleColumn(name: string) {
        let has = this.view.page.getByText(name);
        this.columnSelector
            .filter({ has })
            .locator(".is_column_active")
            .click();
    }
    /**
     * This function will use the empty input column to activate a column.
     * During this process, it will scroll ActiveColumns to the bottom.
     * @param name
     */
    async activateColumn(name: string) {
        await this.scrollToBottom();
        await this.newColumnInput.waitFor({ state: "visible" });
        await autocompleteSelect(this.page, this.newColumnInput, name);
        let addedColumn = this.columnSelector.filter({ hasText: name }).first();
        return new ColumnSelector(addedColumn!, true);
    }
}

export class InactiveColumns {
    view: PageView;
    container: Locator;
    columnSelector: Locator;

    constructor(view: PageView) {
        this.view = view;
        this.container = view.container.locator("#sub-columns");
        this.columnSelector = this.container.locator(".column-selector-column");
    }

    async getColumnByName(name: string) {
        await this.container.waitFor({ state: "visible", timeout: 1000 });
        let locator = this.columnSelector.filter({ hasText: name });
        return new ColumnSelector(locator, true);
    }
    async visibleColumns() {
        let all = await this.columnSelector.all();
        let mapped = all.map((locator) => {
            return new ColumnSelector(locator, false);
        });
        return mapped;
    }
    /**
     * This function will click the toggle next to the inactive column,
     * making it the only active column.
     * @param name
     */
    async toggleColumn(name: string) {
        this.columnSelector
            .filter({ has: this.container.getByText(name) })
            .locator(".is_column_active")
            .click();
    }
    /**
     * Gets the first visible column matching the passed in type.
     * @param type - A string to denote the type. Use "numeric" to mean "integer or float" and "calendar" to denote "date or datetime"
     */
    getColumnByType(
        type:
            | "integer"
            | "float"
            | "string"
            | "date"
            | "datetime"
            | "numeric"
            | "calendar"
    ) {
        let page = this.view.page;
        let has: Locator;
        switch (type) {
            case "numeric":
                has = page.locator(".float").or(page.locator(".integer"));
                break;
            case "calendar":
                has = page.locator(".date").or(page.locator(".datetime"));
                break;
            default:
                has = page.locator(`.${type}`);
                break;
        }
        return new ColumnSelector(
            this.columnSelector.filter({ has }).first(),
            true
        );
    }
}
