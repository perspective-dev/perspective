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

import { test, expect } from "../helpers.ts";
import { ready, saveWorkspace, toggle } from "./helpers.ts";

test.beforeEach(ready);

test.describe("Workspace panel API", () => {
    test("toggleWorkspaceConfig toggles, forces and announces", async ({
        page,
    }) => {
        await page.evaluate(() => {
            window["__toggles__"] = [];
            document
                .querySelector("perspective-viewer")!
                .addEventListener(
                    "perspective-toggle-workspace-settings",
                    (event: any) => window["__toggles__"].push(event.detail),
                );
        });

        const panel = page.locator("perspective-viewer #workspace_panel");
        await toggle(page);
        await expect(panel).toBeVisible();
        await toggle(page, true);
        await expect(panel).toBeVisible();
        await toggle(page);
        await expect(panel).toHaveCount(0);
        await toggle(page, false);
        expect(await page.evaluate(() => window["__toggles__"])).toEqual([
            true,
            false,
        ]);
    });

    test("the panel opens with settings closed and is not saved", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.toggleConfig(false);
        });

        const before = await saveWorkspace(page);
        await toggle(page, true);
        await expect(
            page.locator("perspective-viewer #workspace_panel"),
        ).toBeVisible();

        expect(await saveWorkspace(page)).toEqual(before);
    });
});
