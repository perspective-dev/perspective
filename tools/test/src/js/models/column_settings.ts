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

import { Locator, expect } from "@playwright/test";
import { PageView } from "./page";
import { Type } from "@perspective-dev/client";

export class ColumnSettingsSidebar {
    view: PageView;
    container: Locator;
    attributesTab: AttributesTab;
    styleTab: StyleTab;
    closeBtn: Locator;
    tabTitle: Locator;
    nameInputWrapper: Locator;
    nameInput: Locator;
    selectedTab: Locator;
    typeIcon: Locator;

    constructor(view: PageView) {
        this.view = view;
        const viewer = view.container;
        this.container = viewer.locator("#column_settings_sidebar");
        this.attributesTab = new AttributesTab(this.container);
        this.styleTab = new StyleTab(this.container);
        this.closeBtn = viewer.locator("#column_settings_close_button");
        // Tab DOM now uses `.settings_tab` / `.settings_tab.selected_tab`
        // (see `containers/tab_list.rs`); the previous `.tab-padding`
        // filler span was removed, so no `:not(.tab-padding)` filter is
        // needed. These class names are shared with the viewer's query
        // tabbar (`#query_tabbar_tab`), so the locators are scoped to
        // `this.container` (the sidebar root) to avoid strict-mode
        // collisions across the two tab implementations.
        this.tabTitle = this.container.locator(".settings_tab .tab-title");
        this.nameInputWrapper = view.container.locator(
            ".sidebar_header_contents",
        );
        this.nameInput = view.container.locator("input.sidebar_header_title");
        this.selectedTab = this.container.locator(
            ".settings_tab.selected_tab",
        );
        this.typeIcon = this.container.locator(".type-icon");
    }

    async openTab(name: string) {
        let locator = this.container.locator("#" + name);
        await locator.click({ timeout: 1000 });
        await this.container
            .locator(`.settings_tab.selected_tab #${name}`)
            .waitFor({ timeout: 1000 });
    }

    async getTabs(): Promise<string[]> {
        return await this.tabTitle.allInnerTexts();
    }

    async getSelectedTab(): Promise<string> {
        return await this.selectedTab.innerText();
    }

    async getType(): Promise<Type | "expression"> {
        const classList = await this.typeIcon.evaluate((icon) =>
            Array.from(icon.classList),
        );
        for (const ty of [
            "string",
            "boolean",
            "float",
            "integer",
            "date",
            "datetime",
        ]) {
            if (classList.includes(ty)) {
                return <Type>ty;
            }
        }
        if (classList.includes("expression")) {
            return "expression";
        }
        throw new Error("Unable to get a matching type for the column!");
    }
}

export class AttributesTab {
    container: Locator;
    expressionEditor: ExpressionEditor;
    saveBtn: Locator;
    resetBtn: Locator;
    deleteBtn: Locator;

    constructor(parent: Locator) {
        this.container = parent.locator("#attributes-tab");
        this.expressionEditor = new ExpressionEditor(this.container);
        this.saveBtn = this.container.locator(
            "#psp-expression-editor-button-save",
        );
        this.resetBtn = this.container.locator(
            "#psp-expression-editor-button-reset",
        );
        this.deleteBtn = this.container.locator(
            "#psp-expression-editor-button-delete",
        );
    }
}

export class ExpressionEditor {
    container: Locator;
    content: Locator;
    textarea: Locator;

    constructor(parent: Locator) {
        this.container = parent.locator("#editor-container");
        this.content = this.container.locator("#content");
        this.textarea = this.container.locator("textarea");
    }
}

export class StyleTab {
    container: Locator;
    contents: Locator;
    symbolsEditor: SymbolsEditor;

    constructor(parent: Locator) {
        this.container = parent.locator("#style-tab");
        this.contents = parent.locator(".style_contents");
        this.symbolsEditor = new SymbolsEditor(this.container);
    }
}
export class SymbolsEditor {
    container: Locator;
    pairsList: Locator;

    constructor(parent: Locator) {
        this.container = parent.locator("#attributes-symbols");
        this.pairsList = this.container.locator("ul");
    }
    async getSymbolPairs() {
        const names = await this.pairsList
            .locator(".column_name")
            .allInnerTexts();
        const symbols = await this.pairsList
            .locator("option[selected]")
            .allInnerTexts();
        const zipped: SymbolPair[] = [];
        for (let i = 0; i < names.length; i++) {
            zipped.push(new SymbolPair(names[i], symbols[i]));
        }
        return zipped;
    }
    async getPairsLength() {
        return (await this.pairsList.locator("li").all()).length;
    }
}
export class SymbolPair {
    key: String;
    value: String;
    constructor(key: String, value: String) {
        this.key = key;
        this.value = value;
    }
}
