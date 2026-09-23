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

import { PageView, test, expect } from "../helpers.ts";
import type { Page } from "@playwright/test";

test.describe("Pivot column settings", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(
            "/rust/perspective-viewer/test/html/superstore-debug.html",
        );

        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    async function restore(page: Page, config: Record<string, unknown>) {
        await page.evaluate(async (config) => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer!.restore({ settings: true, ...config });
        }, config);
    }

    function pill(view: PageView, axis: "group_by" | "split_by") {
        return view.settingsPanel.container
            .locator(`#${axis} .pivot-column`)
            .first();
    }

    for (const axis of ["group_by", "split_by"] as const) {
        test(`${axis} pill opens the Style tab for a date column`, async ({
            page,
        }) => {
            const view = new PageView(page);
            await restore(page, { columns: ["Sales"], [axis]: ["Order Date"] });
            await pill(view, axis).locator(".expression-edit-button").click();

            const sidebar = view.columnSettingsSidebar;
            await expect(sidebar.container).toBeVisible();
            await expect(sidebar.nameInput).toHaveValue("Order Date");
            await expect.poll(() => sidebar.getSelectedTab()).toBe("Style");
        });

        test(`${axis} pill has no button when the type has no controls`, async ({
            page,
        }) => {
            const view = new PageView(page);
            await restore(page, { columns: ["Sales"], [axis]: ["State"] });
            await expect(pill(view, axis)).toBeVisible();
            await expect(
                pill(view, axis).locator(".expression-edit-button"),
            ).toHaveCount(0);
        });

        test(`${axis} pill indicator clears when the sidebar closes`, async ({
            page,
        }) => {
            const view = new PageView(page);
            await restore(page, { columns: ["Sales"], [axis]: ["Order Date"] });

            const button = pill(view, axis).locator(".expression-edit-button");
            await button.click();
            await expect(button).toHaveClass(/is-editing/);

            await view.columnSettingsSidebar.closeBtn.click();
            await expect(view.columnSettingsSidebar.container).toBeHidden();
            await expect(button).not.toHaveClass(/is-editing/);
        });

        test(`${axis} pill configures the aggregate type when also active`, async ({
            page,
        }) => {
            const view = new PageView(page);
            await restore(page, {
                columns: ["State"],
                group_by: ["City"],
                [axis]: ["State"],
                aggregates: { State: "count" },
            });

            await pill(view, axis).locator(".expression-edit-button").click();

            const sidebar = view.columnSettingsSidebar;
            await expect(sidebar.container).toBeVisible();
            await expect(sidebar.nameInput).toHaveValue("State");
            await expect(sidebar.typeIcon).toHaveClass(/integer/);
        });
    }
});
