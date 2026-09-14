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

import type { Page } from "@playwright/test";

import { test, expect } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        await viewer.restore({ plugin: "Debug", settings: true });
    });

    await page.locator("perspective-viewer #debug_tabbar_tab").click();
    await page
        .locator("perspective-viewer #debug-panel-editor textarea")
        .waitFor();
});

async function applyEdit(page: Page, edit: (config: any) => void) {
    const textarea = page.locator(
        "perspective-viewer #debug-panel-editor textarea",
    );

    const config = JSON.parse(await textarea.inputValue());
    edit(config);
    await textarea.fill(JSON.stringify(config, null, 2));
    await page.locator("perspective-viewer #debug-panel-apply").click();
    return textarea;
}

test.describe("DebugPanel validation", () => {
    test("an un-hosted table is a validation error and leaves the panel bound", async ({
        page,
    }) => {
        const textarea = await applyEdit(page, (config) => {
            config.table = "no-such-table";
        });

        await expect(
            page.locator("perspective-viewer #debug-panel-error"),
        ).toContainText('Unknown table "no-such-table"');

        const state = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const table = await viewer.getTable();
            return {
                table: (await viewer.save()).table,
                bound: await table.get_name(),
            };
        });

        expect(state.table).toBe("load-viewer-csv");
        expect(state.bound).toBe("load-viewer-csv");
        expect(await textarea.inputValue()).toContain("no-such-table");
        await expect(
            page.locator("perspective-viewer span#status"),
        ).not.toHaveClass(/pending|uninitialized|errored/);
    });

    test("a rejected config keeps the edit and its error in the panel", async ({
        page,
    }) => {
        const textarea = await applyEdit(page, (config) => {
            config.columns = ["no-such-column"];
        });

        await expect(
            page.locator("perspective-viewer #debug-panel-error"),
        ).toContainText("no-such-column");

        expect(await textarea.inputValue()).toContain("no-such-column");
        await expect(
            page.locator("perspective-viewer #debug-panel-apply"),
        ).toBeEnabled();

        const columns = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            return (await viewer.save()).columns;
        });

        expect(columns).not.toContain("no-such-column");
        await expect(
            page.locator("perspective-viewer span#status"),
        ).not.toHaveClass(/errored/);
    });

    test("a valid config applies and the editor refreshes to the applied config", async ({
        page,
    }) => {
        const textarea = await applyEdit(page, (config) => {
            config.group_by = ["State"];
        });

        await expect(
            page.locator("perspective-viewer #debug-panel-apply"),
        ).toBeDisabled();

        await expect(
            page.locator("perspective-viewer #debug-panel-error"),
        ).toHaveCount(0);

        const groupBy = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            return (await viewer.save()).group_by;
        });

        expect(groupBy).toEqual(["State"]);
        expect(JSON.parse(await textarea.inputValue()).group_by).toEqual([
            "State",
        ]);
    });
});
