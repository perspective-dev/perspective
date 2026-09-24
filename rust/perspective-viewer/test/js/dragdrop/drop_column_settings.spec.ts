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

import { test, expect } from "@perspective-dev/test";
import { compareContentsToSnapshot } from "@perspective-dev/test";
import { PageView } from "@perspective-dev/test";
import {
    ACTIVE_DRAG,
    getSettingsPanelContents,
    INACTIVE_DRAG,
    localDrag,
} from "./dragdrop_test_utils";

test.beforeEach(async ({ page }) => {
    await page.goto(
        "/rust/perspective-viewer/test/html/column-settings-enabled.html",
    );
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Drag and Drop", () => {
    test.describe("drop with Column Settings Sidebar open", () => {
        test("inactive to active while sidebar is open on the active column", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });

            // Open the sidebar on the current active column.
            const activeCol =
                view.settingsPanel.activeColumns.getFirstVisibleColumn();

            await activeCol.editBtn.click();
            await view.columnSettingsSidebar.container.waitFor({
                state: "visible",
            });

            const configUpdated = await view.getEventListener(
                "perspective-config-update",
            );

            const source = view.container.locator(INACTIVE_DRAG).first();
            const target = activeCol.container;
            await localDrag(page, source, target);
            await configUpdated();
            const config = await view.save();
            expect(config.columns).toEqual(["Category", "Sales"]);
            await expect(view.container.locator("#add-expression")).toHaveClass(
                /dragdrop-hover/,
            );

            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("active to Group By while sidebar is open on the dragged column", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({
                settings: true,
                columns: ["Category", "Profit"],
            });

            // Open the sidebar on the first active column (Sales).
            const activeCol =
                view.settingsPanel.activeColumns.getFirstVisibleColumn();
            await activeCol.editBtn.click();
            await view.columnSettingsSidebar.container.waitFor({
                state: "visible",
            });

            const configUpdated = await view.getEventListener(
                "perspective-config-update",
            );

            const source = view.container.locator(ACTIVE_DRAG).first();
            const target = view.container.locator("#group_by");
            await localDrag(page, source, target);
            await configUpdated();
            const config = await view.save();
            expect(config.group_by).toEqual(["Category"]);
            expect(config.columns).toEqual(["Profit"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        // TODO

        test("inactive to Group By while sidebar is open on a different column", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({
                settings: true,
                columns: ["Sales", "Profit"],
            });

            // Open sidebar on first active column.
            const activeCol =
                view.settingsPanel.activeColumns.getFirstVisibleColumn();
            await activeCol.editBtn.click();
            await view.columnSettingsSidebar.container.waitFor({
                state: "visible",
            });

            const configUpdated = await view.getEventListener(
                "perspective-config-update",
            );

            const source = view.container.locator(INACTIVE_DRAG).first();
            const target = view.container.locator("#group_by");
            await localDrag(page, source, target);
            await configUpdated();
            const config = await view.save();
            expect(config.group_by).toEqual(["Category"]);
            expect(config.columns).toEqual(["Sales", "Profit"]);
            await expect(view.container.locator("#add-expression")).toHaveClass(
                /dragdrop-hover/,
            );

            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("inactive to Split By while sidebar is open", async ({ page }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });

            const activeCol =
                view.settingsPanel.activeColumns.getFirstVisibleColumn();
            await activeCol.editBtn.click();
            await view.columnSettingsSidebar.container.waitFor({
                state: "visible",
            });

            const configUpdated = await view.getEventListener(
                "perspective-config-update",
            );

            const source = view.container.locator(INACTIVE_DRAG).first();
            const target = view.container.locator("#split_by");
            await localDrag(page, source, target);
            await configUpdated();
            const config = await view.save();
            expect(config.split_by).toEqual(["Category"]);
            expect(config.columns).toEqual(["Sales"]);
            await expect(view.container.locator("#add-expression")).toHaveClass(
                /dragdrop-hover/,
            );

            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("inactive to Filter while sidebar is open", async ({ page }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });

            const activeCol =
                view.settingsPanel.activeColumns.getFirstVisibleColumn();
            await activeCol.editBtn.click();
            await view.columnSettingsSidebar.container.waitFor({
                state: "visible",
            });

            const configUpdated = await view.getEventListener(
                "perspective-config-update",
            );

            const source = view.container.locator(INACTIVE_DRAG).first();
            const target = view.container.locator("#filter");
            await localDrag(page, source, target);
            await configUpdated();
            const config = await view.save();
            expect(config.filter).toEqual([["Category", "==", null]]);
            expect(config.columns).toEqual(["Sales"]);
            await expect(view.container.locator("#add-expression")).toHaveClass(
                /dragdrop-hover/,
            );

            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("inactive to Sort while sidebar is open", async ({ page }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });

            const activeCol =
                view.settingsPanel.activeColumns.getFirstVisibleColumn();
            await activeCol.editBtn.click();
            await view.columnSettingsSidebar.container.waitFor({
                state: "visible",
            });

            const configUpdated = await view.getEventListener(
                "perspective-config-update",
            );

            const source = view.container.locator(INACTIVE_DRAG).first();
            const target = view.container.locator("#sort");
            await localDrag(page, source, target);
            await configUpdated();
            const config = await view.save();
            expect(config.sort).toEqual([["Category", "asc"]]);
            expect(config.columns).toEqual(["Sales"]);
            await expect(view.container.locator("#add-expression")).toHaveClass(
                /dragdrop-hover/,
            );

            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });
    });
});
