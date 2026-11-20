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

import { test, expect, openWorkspaceTab } from "../helpers.ts";
import { TABLE, ready, saveWorkspace } from "./helpers.ts";

test.beforeEach(async ({ page }) => {
    await ready({ page });
    await openWorkspaceTab(page, "json");
    await page
        .locator("perspective-viewer #workspace-json-editor textarea")
        .waitFor();
});

test.describe("Workspace panel JSON tab", () => {
    test("shows the workspace config", async ({ page }) => {
        const textarea = page.locator(
            "perspective-viewer #workspace-json-editor textarea",
        );

        await expect
            .poll(async () => JSON.parse((await textarea.inputValue()) || "{}"))
            .toEqual(await saveWorkspace(page));
    });

    test("applying an edit replaces the panel set and keeps the tab", async ({
        page,
    }) => {
        const textarea = page.locator(
            "perspective-viewer #workspace-json-editor textarea",
        );

        await expect(textarea).not.toHaveValue("");
        const config = JSON.parse(await textarea.inputValue());
        const id = Object.keys(config.panels)[0];
        config.panels[id].group_by = ["State"];
        config.panels.second = { table: TABLE, plugin: "Debug" };
        config.layout = undefined;
        await textarea.fill(JSON.stringify(config, null, 2));
        await page.locator("perspective-viewer #workspace-json-apply").click();

        await expect
            .poll(async () => Object.keys((await saveWorkspace(page)).panels))
            .toEqual([id, "second"].sort());

        expect((await saveWorkspace(page)).panels[id].group_by).toEqual([
            "State",
        ]);

        await expect(textarea).toBeVisible();
        await expect(
            page.locator("perspective-viewer #workspace-json-apply"),
        ).toBeDisabled();
    });

    test("invalid JSON changes nothing and an unknown table is reported", async ({
        page,
    }) => {
        const textarea = page.locator(
            "perspective-viewer #workspace-json-editor textarea",
        );

        await expect(textarea).not.toHaveValue("");
        const before = await saveWorkspace(page);
        const error = page.locator("perspective-viewer #workspace-json-error");
        await textarea.fill("{ not json");
        await page.locator("perspective-viewer #workspace-json-apply").click();
        await expect(error).not.toBeEmpty();
        expect(await saveWorkspace(page)).toEqual(before);

        const config = structuredClone(before);
        config.panels[Object.keys(config.panels)[0]].table = "no-such-table";
        await textarea.fill(JSON.stringify(config, null, 2));
        await page.locator("perspective-viewer #workspace-json-apply").click();
        await expect(error).toContainText("Unknown table");
    });
});
