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

// The panel-count chrome (`single`/`multi` frame classes, tab
// closable/draggable) must flip ON THE LAYOUT COMMIT that changes the
// placed-panel count — with NO further interaction. It once stayed stale
// after a first Duplicate/New (both tabs kept `single` chrome) because the
// chrome derives from `inserted.len()` at render time, `reconcile` grows
// `inserted` AFTER that render, and the commit's `LayoutUpdated` only
// re-rendered on a hidden-tab delta — which a side-by-side insert never
// produces. Fixed by a rendered-count staleness check in
// `on_layout_updated`.

import { test, expect } from "../helpers.ts";
import { armInvariants, assertCoherent } from "./harness.ts";

const TABLE = "load-viewer-csv";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

function singleFrames(page) {
    return page.locator("regular-layout-frame.single");
}

function frames(page) {
    return page.locator("regular-layout-frame");
}

test.describe("Panel-count chrome", () => {
    test("Duplicate flips single→multi with no further interaction", async ({
        page,
    }) => {
        await expect(singleFrames(page)).toHaveCount(1);

        const viewer = page.locator("perspective-viewer");
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item", { hasText: "Duplicate" })
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 2,
        );

        // The flip must arrive with the commit itself — deliberately NO
        // clicks/activation between the menu action and these assertions.
        await expect(frames(page)).toHaveCount(2);
        await expect(singleFrames(page)).toHaveCount(0);
        await assertCoherent(page);
    });

    test("'New' flips single→multi with no further interaction", async ({
        page,
    }) => {
        await expect(singleFrames(page)).toHaveCount(1);

        const viewer = page.locator("perspective-viewer");
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const new_item = menu.locator(".context-menu-item.has-submenu", {
            hasText: "New",
        });

        await new_item.hover();
        await new_item
            .locator(".context-menu-submenu .context-menu-item", {
                hasText: TABLE,
            })
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 2,
        );

        await expect(frames(page)).toHaveCount(2);
        await expect(singleFrames(page)).toHaveCount(0);
        await assertCoherent(page);
    });

    test("addPanel flips single→multi; removePanel flips the survivor back", async ({
        page,
    }) => {
        await expect(singleFrames(page)).toHaveCount(1);
        const added = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            return await viewer.addPanel({ table });
        }, TABLE);

        await expect(frames(page)).toHaveCount(2);
        await expect(singleFrames(page)).toHaveCount(0);

        await page.evaluate(async (id) => {
            // @ts-ignore
            await document.querySelector("perspective-viewer")!.removePanel(id);
        }, added);

        await expect(frames(page)).toHaveCount(1);
        await expect(singleFrames(page)).toHaveCount(1);
        await assertCoherent(page);
    });
});
