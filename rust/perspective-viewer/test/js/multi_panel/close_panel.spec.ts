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
import {
    armInvariants,
    armCommitCounter,
    readCommitCount,
    assertCoherent,
    treeSlots,
} from "./harness.ts";

const TABLE = "load-viewer-csv";

const SPLIT_CONFIG = {
    layout: {
        type: "split-layout",
        orientation: "horizontal",
        sizes: [0.5, 0.5],
        children: [
            { type: "tab-layout", tabs: ["one"], selected: 0 },
            { type: "tab-layout", tabs: ["two"], selected: 0 },
        ],
    },
    panels: {
        one: { table: TABLE, title: "One" },
        two: { table: TABLE, title: "Two", group_by: ["Category"] },
    },
};

const STACK_CONFIG = {
    layout: { type: "tab-layout", tabs: ["one", "two"], selected: 1 },
    panels: {
        one: { table: TABLE, title: "One" },
        two: { table: TABLE, title: "Two" },
    },
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

async function restoreWorkspace(page, config): Promise<void> {
    await page.evaluate(async (config) => {
        // @ts-ignore
        await document
            .querySelector("perspective-viewer")!
            .restoreWorkspace(config);
    }, config);
}

async function panelNames(page): Promise<string[]> {
    return await page.evaluate(() => {
        // @ts-ignore
        return document.querySelector("perspective-viewer")!.getPanelNames();
    });
}

/// `restoreWorkspace` REPLACES the panel set with freshly-GENERATED panel
/// ids (the config's `panels` keys are restore-time aliases, not ids) -
/// resolve the live ids from the committed tree, whose slot order follows
/// the config's layout order.
async function slotIds(page): Promise<string[]> {
    return treeSlots(
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            return (
                viewer.shadowRoot!.querySelector("regular-layout") as any
            ).save();
        }),
    );
}

async function menuClose(page, slot: string): Promise<void> {
    await page
        .locator(`perspective-viewer-plugin[slot="${slot}"]`)
        .click({ button: "right" });
    const menu = page.locator("perspective-context-menu");
    await menu.waitFor();
    await menu.locator(".context-menu-item", { hasText: "Close" }).click();
}

test.describe("Closing panels via the UI", () => {
    test("context-menu Close commits ONCE and disposes the panel", async ({
        page,
    }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const [one, two] = await slotIds(page);
        await armCommitCounter(page);
        await menuClose(page, one);
        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );

        await assertCoherent(page);
        expect(await readCommitCount(page)).toBe(1);
        expect(await panelNames(page)).toEqual([two]);

        // The closed panel's plugin element left the light DOM.
        expect(
            await page.locator(`perspective-viewer > [slot="${one}"]`).count(),
        ).toBe(0);
    });

    test("the tab × button closes its own panel", async ({ page }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const [one, two] = await slotIds(page);

        // The close button occupies the settings button's spot, so it only
        // renders while the settings sidebar is OPEN (see `panel_tab.rs`).
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({ settings: true });
        });

        await page
            .locator(`perspective-viewer-tab[slot="tab-${one}"] .psp-tab-close`)
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );

        await assertCoherent(page);
        expect(await panelNames(page)).toEqual([two]);
    });

    test("closing the ACTIVE panel retargets activation to a survivor", async ({
        page,
    }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const [one, two] = await slotIds(page);
        await page.evaluate((id) => {
            // @ts-ignore
            document.querySelector("perspective-viewer")!.setActivePanel(id);
        }, one);

        await menuClose(page, one);
        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );

        await assertCoherent(page);
        const active = await page.evaluate(() => {
            // @ts-ignore
            return document
                .querySelector("perspective-viewer")!
                .getActivePanel();
        });

        expect(active).toBe(two);
    });

    test("the LAST panel's Close menu item is disabled", async ({ page }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const [one, two] = await slotIds(page);
        await menuClose(page, one);
        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );

        // A lone panel can't be closed to zero from the UI (API-only).
        await page
            .locator(`perspective-viewer-plugin[slot="${two}"]`)
            .click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await expect(
            menu.locator(".context-menu-item.disabled", { hasText: "Close" }),
        ).toHaveCount(1);

        await page.keyboard.press("Escape");
    });

    test("closing a stack's visible member reveals the survivor", async ({
        page,
    }) => {
        await restoreWorkspace(page, STACK_CONFIG);
        const [one, two] = await slotIds(page);

        // `selected: 1` — the visible (projected) member is the second tab.
        await menuClose(page, two);
        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );

        await assertCoherent(page);
        expect(await panelNames(page)).toEqual([one]);
    });

    test("closing a panel DURING its own create settles coherent (no deadline resurrection)", async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on("pageerror", (err) => errors.push(err.message));

        // Start `addPanel`, catch the new id from the (synchronous) model
        // create, and remove it while its restore/first-draw is still in
        // flight. The staging deadline (500ms) must NOT re-insert it.
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const before = new Set(viewer.getPanelNames());
            const pending = viewer.addPanel({ table });
            let fresh: string | undefined;
            for (let i = 0; i < 100 && fresh === undefined; i++) {
                fresh = viewer
                    .getPanelNames()
                    .find((n: string) => !before.has(n));

                if (fresh === undefined) {
                    await new Promise((x) => setTimeout(x, 5));
                }
            }

            if (fresh !== undefined) {
                await viewer.removePanel(fresh);
            }

            await pending.catch(() => {});
        }, TABLE);

        await assertCoherent(page);
        expect((await panelNames(page)).length).toBe(1);

        // Outlast the staging deadline — the removed panel must stay gone.
        await page.waitForTimeout(800);
        await assertCoherent(page);
        expect((await panelNames(page)).length).toBe(1);
        expect(errors).toEqual([]);
    });
});
