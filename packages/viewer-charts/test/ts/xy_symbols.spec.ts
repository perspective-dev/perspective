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

import {
    PageView as PspViewer,
    compareNodes,
    expect,
    test,
} from "@perspective-dev/test";
import { SymbolPair } from "@perspective-dev/test/src/js/models/column_settings";
import { Page } from "@playwright/test";

const symbols = [
    "circle",
    "cross",
    "diamond",
    "square",
    "star",
    "triangle",
    "wye",
];

async function checkSymbolsSection(
    page: Page,
    columnName: string,
    searchVal: [string, string, string],
    editVal: string,
) {
    // setup viewer
    const viewer = new PspViewer(page);
    const settingsPanel = await viewer.openSettingsPanel();
    const symbolsEditor = viewer.columnSettingsSidebar.styleTab.symbolsEditor;
    const symbolColumn = settingsPanel.container.locator(
        "div[data-label=Symbol]",
    );
    await settingsPanel.selectPlugin("X/Y Scatter");
    await symbolColumn.waitFor();
    const colInput = symbolColumn.locator("input");
    await colInput.type(columnName);
    await page
        .locator("perspective-dropdown .selected")
        .first() // NOTE: There probably shouldn't actually be more than one.
        .waitFor();
    await colInput.press("Enter");

    const editBtn = symbolColumn.locator(".expression-edit-button");
    await editBtn.waitFor();
    await editBtn.click();

    // setup symbols
    await symbolsEditor.container.waitFor();
    const key = symbolsEditor.container.locator(".column_name");
    const keyInput = symbolsEditor.container.locator("input");
    const valSelect = symbolsEditor.container.locator("select");
    const value = symbolsEditor.container.locator("option[selected]");

    const setKey = async (inputIdx, keyIdx, val) => {
        await keyInput.nth(inputIdx).clear();
        await keyInput.nth(inputIdx).type(val);
        await page.locator("perspective-dropdown .selected").waitFor();
        await keyInput.nth(inputIdx).press("Enter");
        expect((await key.nth(keyIdx).textContent())?.toLowerCase()).toContain(
            val.toLowerCase(),
        );
    };

    const setValue = async (i, val) => {
        await valSelect.nth(i).selectOption(val);
        expect(await value.nth(i).textContent()).toBe(val);
    };

    // add
    expect(await symbolsEditor.getSymbolPairs()).toStrictEqual([]);
    for (let i = 0; i < 3; i++) {
        await setKey(0, i, searchVal[i]);
        await setValue(i, symbols[i + 1]);
        expect(await symbolsEditor.getPairsLength()).toBe(i + 2);
    }

    // edit
    await symbolsEditor.container.locator(".column_name").first().dblclick();
    await setKey(0, 0, editVal);
    expect(
        await symbolsEditor.container
            .locator(".column_name")
            .first()
            .textContent(),
    ).toContain(editVal);

    // remove
    for (let i = 0; i < 3; i++) {
        await symbolsEditor.container
            .locator(".is_column_active")
            .nth(2 - i)
            .dispatchEvent("click"); // pointer is way off
        expect(await symbolsEditor.getPairsLength()).toBe(3 - i);
    }
}

test.describe("X/Y Scatter", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    test.skip("Symbols column - Datetime values", async ({ page }) => {
        await checkSymbolsSection(page, "Order Date", ["0", "1", "2"], "9");
    });

    test.skip("Symbols column - Numeric values", async ({ page }) => {
        await checkSymbolsSection(page, "Discount", ["0", "1", "2"], "7");
    });

    test.skip("Symbols column - String values", async ({ page }) => {
        await checkSymbolsSection(page, "State", ["A", "B", "C"], "D");
    });

    test.fixme("Symbols column - Expression values", async ({ page }) => {});
});
