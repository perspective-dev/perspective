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

    test("the Format toggle switches between indented and compact JSON", async ({
        page,
    }) => {
        const textarea = page.locator(
            "perspective-viewer #workspace-json-editor textarea",
        );

        const toggle = page.locator(
            "perspective-viewer #workspace-json-formatted",
        );

        await expect(textarea).not.toHaveValue("");
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        const indented = await textarea.inputValue();
        expect(indented).toContain("\n");

        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await expect(textarea).not.toHaveValue(/\n/);
        expect(JSON.parse(await textarea.inputValue())).toEqual(
            JSON.parse(indented),
        );

        const editor = page.locator(
            "perspective-viewer #workspace-json-editor #editor",
        );

        await expect(editor).toHaveClass(/wordwrap/);
        const widths = await editor.evaluate((elem) => {
            const content = (x: Element) => {
                const style = getComputedStyle(x);
                return (
                    x.clientWidth -
                    parseFloat(style.paddingLeft) -
                    parseFloat(style.paddingRight)
                );
            };

            return [
                content(elem.querySelector("#textarea_editable")!),
                content(elem.querySelector("#content")!),
            ];
        });

        expect(widths[0]).toBe(widths[1]);
        const height = await editor.evaluate(
            (elem) => elem.querySelector("#content")!.scrollHeight,
        );

        expect(height).toBeGreaterThan(40);
        const scrolled = await editor.evaluate((elem) => {
            elem.parentElement!.style.maxHeight = "60px";
            elem.scrollTop = 30;
            return elem.scrollTop;
        });

        expect(scrolled).toBeGreaterThan(0);

        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        await expect(textarea).toHaveValue(indented);
        await expect(editor).not.toHaveClass(/wordwrap/);
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
