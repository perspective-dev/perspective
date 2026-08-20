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
    shadowDragCancel,
    shadowDragReleaseInGap,
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
    // Cancel — drag starts but no drop occurs.
    // These verify the panel returns to its original state with no side-effects.
    test.describe("cancel", () => {
        test("drag inactive column and cancel (dragend with no drop)", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });
            await shadowDragCancel(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
            );

            const config = await view.save();
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag active column and cancel (dragend with no drop)", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({
                settings: true,
                columns: ["Sales", "Profit"],
            });

            await shadowDragCancel(
                page,
                view.container.locator(ACTIVE_DRAG).first(),
            );

            const config = await view.save();
            expect(config.columns).toEqual(["Sales", "Profit"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag inactive column over wrong target (status bar) then cancel", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });

            // Hover over the status bar which is not a valid drop target.
            await shadowDragCancel(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
                view.container.locator("#status_bar"),
            );

            const config = await view.save();
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag inactive column over Group By then cancel before drop", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });
            await shadowDragCancel(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
                view.container.locator("#group_by"),
            );

            const config = await view.save();
            expect(config.group_by).toEqual([]);
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag inactive column over Split By then cancel before drop", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });
            await shadowDragCancel(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
                view.container.locator("#split_by"),
            );
            const config = await view.save();
            expect(config.split_by).toEqual([]);
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag inactive column over Sort then cancel before drop", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });
            await shadowDragCancel(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
                view.container.locator("#sort"),
            );
            const config = await view.save();
            expect(config.sort).toEqual([]);
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag inactive column over Filter then cancel before drop", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });
            await shadowDragCancel(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
                view.container.locator("#filter"),
            );
            const config = await view.save();
            expect(config.filter).toEqual([]);
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag inactive column over Group By, release in gap below it", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });
            await shadowDragReleaseInGap(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
                view.container.locator("#group_by"),
                view.container.locator("#split_by"),
            );

            await expect(view.container.locator("#top_panel")).not.toHaveClass(
                /dragdrop-highlight/,
            );

            await expect(
                view.container.locator("#active-columns"),
            ).not.toHaveClass(/dragdrop-highlight/);

            const config = await view.save();
            expect(config.group_by).toEqual([]);
            expect(config.split_by).toEqual([]);
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag active column over Sort, release in gap below it", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({
                settings: true,
                columns: ["Sales", "Profit"],
            });

            await shadowDragReleaseInGap(
                page,
                view.container.locator(ACTIVE_DRAG).first(),
                view.container.locator("#sort"),
                view.container.locator("#filter"),
            );

            await expect(view.container.locator("#top_panel")).not.toHaveClass(
                /dragdrop-highlight/,
            );

            await expect(
                view.container.locator("#active-columns"),
            ).not.toHaveClass(/dragdrop-highlight/);

            const config = await view.save();
            expect(config.sort).toEqual([]);
            expect(config.columns).toEqual(["Sales", "Profit"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag inactive column outside component (simulate drop outside browser)", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({ settings: true, columns: ["Sales"] });

            // Start a drag then immediately cancel — no hover over any target.
            await shadowDragCancel(
                page,
                view.container.locator(INACTIVE_DRAG).first(),
            );

            const config = await view.save();
            expect(config.columns).toEqual(["Sales"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });

        test("drag active column outside component (simulate drop outside browser)", async ({
            page,
        }) => {
            const view = new PageView(page);
            await view.restore({
                settings: true,
                columns: ["Sales", "Profit"],
            });

            await shadowDragCancel(
                page,
                view.container.locator(ACTIVE_DRAG).first(),
            );

            const config = await view.save();
            expect(config.columns).toEqual(["Sales", "Profit"]);
            const contents = await getSettingsPanelContents(page);
            await compareContentsToSnapshot(contents);
        });
    });
});
