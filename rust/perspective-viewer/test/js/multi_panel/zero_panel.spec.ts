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
import { armInvariants } from "./harness.ts";

const TABLE = "load-viewer-csv";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

// Structural invariants (I1 element identity / I2 tree sanity / I3
// model-layout-DOM coherence) gate every passing test's end state - see
// `harness.ts` and `.plan/WORKSPACE_TEST_PLAN.md`.
armInvariants(test);

function panel_names(page): Promise<string[]> {
    return page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return viewer.getPanelNames();
    });
}

/// Remove every panel, emptying the element.
async function empty(page) {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        for (const id of viewer.getPanelNames()) {
            // @ts-ignore
            await viewer.removePanel(id);
        }
    });
}

test.describe("Zero panels", () => {
    test("removePanel can empty the element", async ({ page }) => {
        await empty(page);
        expect(await panel_names(page)).toEqual([]);

        const active = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return viewer.getActivePanel();
        });
        expect(active).toBeNull();
        await expect(
            page.locator("perspective-viewer perspective-viewer-plugin"),
        ).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer regular-layout-frame"),
        ).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer regular-layout"),
        ).toHaveCount(1);
    });

    test("restore from empty creates and activates a panel", async ({
        page,
    }) => {
        await empty(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.restore({ table }, { panel: "solo" });
        }, TABLE);

        expect(await panel_names(page)).toEqual(["solo"]);
        const active = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return viewer.getActivePanel();
        });
        expect(active).toBe("solo");
    });

    test("addPanel from empty activates the new panel", async ({ page }) => {
        await empty(page);
        const id = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return await viewer.addPanel({ table });
        }, TABLE);

        expect(await panel_names(page)).toEqual([id]);
        const active = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return viewer.getActivePanel();
        });
        expect(active).toBe(id);
    });

    test("panel-scoped read methods reject with no active panel", async ({
        page,
    }) => {
        await empty(page);
        const rejected = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            try {
                // @ts-ignore
                await viewer.getTable();
                return false;
            } catch {
                return true;
            }
        });
        expect(rejected).toBe(true);
    });

    test("settings sidebar binds to the first panel created from empty", async ({
        page,
    }) => {
        await empty(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.restore({ table }, { panel: "solo" });
            // @ts-ignore
            await viewer.restore({ settings: true });
        }, TABLE);

        await expect(
            page.locator("perspective-viewer #settings_panel"),
        ).toBeVisible();
    });

    test("empty stage offers a New context menu that creates the first panel", async ({
        page,
    }) => {
        await empty(page);
        await page
            .locator("perspective-viewer #main_panel_container")
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const new_item = menu.locator(".context-menu-item.has-submenu", {
            hasText: "New",
        });

        await new_item.hover();
        const submenu = new_item.locator(".context-menu-submenu");
        await submenu.locator(".context-menu-item", { hasText: TABLE }).click();
        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 1,
        );

        await expect(
            page.locator("perspective-viewer perspective-viewer-plugin"),
        ).toBeVisible();
    });

    test("re-adding after empty yields a working layout", async ({ page }) => {
        await empty(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.restore({ table }, { panel: "a" });
            // @ts-ignore
            await viewer.addPanel({ table });
        }, TABLE);

        expect((await panel_names(page)).length).toBe(2);

        await page
            .locator("perspective-viewer perspective-viewer-plugin")
            .first()
            .click({ button: "right" });
        await expect(page.locator("perspective-context-menu")).toBeVisible();
    });
});

test.describe("Boots empty", () => {
    async function goto_blank(page) {
        await page.goto("/rust/perspective-viewer/test/html/blank.html");
        await page.waitForFunction(
            () =>
                customElements.get("perspective-viewer") !== undefined &&
                window["WORKER"] !== undefined,
        );
    }

    test("an unconfigured element has zero panels and no frame", async ({
        page,
    }) => {
        await goto_blank(page);
        const names = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return viewer.getPanelNames();
        });
        expect(names).toEqual([]);
        await expect(
            page.locator("perspective-viewer regular-layout-frame"),
        ).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer regular-layout"),
        ).toHaveCount(1);
    });

    test("load(client) is inert — no phantom panel", async ({ page }) => {
        await goto_blank(page);
        const names = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            const worker = await window["WORKER"];
            // @ts-ignore
            await viewer.load(worker);
            // @ts-ignore
            return viewer.getPanelNames();
        });
        // A `Client`-only load registers the client but creates no panel.
        expect(names).toEqual([]);
    });
});
