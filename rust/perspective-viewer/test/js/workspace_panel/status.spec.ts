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
import { TABLE, ready } from "./helpers.ts";

test.beforeEach(ready);

test.describe("Workspace status icon", () => {
    test("a non-active panel's state reaches the icon", async ({ page }) => {
        const status = page.locator("perspective-viewer span#status");
        await expect(status).toHaveClass(/connected/);
        const names = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const active = viewer.getActivePanel();
            const pending = await viewer.addPanel(
                { table: "status-later" },
                { wait_for_table: true },
            );

            await viewer.setActivePanel(active);
            return { active, pending, table };
        }, TABLE);

        expect(names.pending).not.toBe(names.active);
        await expect(status).toHaveClass(/pending/);

        await page.evaluate(async () => {
            await window["__TEST_WORKER__"].table("x\n1", {
                name: "status-later",
            });
        });

        await expect(status).toHaveClass(/connected/);
    });

    test("the icon is clickable at zero panels with a loaded client", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            for (const id of viewer.getPanelNames()) {
                await viewer.removePanel(id);
            }
        });

        await expect(
            page.locator("perspective-viewer span#status"),
        ).toHaveClass(/connected/);

        await page.locator("perspective-viewer #status_reconnect").click();
        await expect(
            page.locator("perspective-viewer #workspace_panel"),
        ).toBeVisible();

        await expect(
            page.locator(`perspective-viewer .ws-table[data-table="${TABLE}"]`),
        ).toBeVisible();
    });
});
