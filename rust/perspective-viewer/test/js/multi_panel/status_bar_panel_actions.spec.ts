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

async function panelNames(page): Promise<string[]> {
    return await page.evaluate(() => {
        // @ts-ignore
        return document.querySelector("perspective-viewer")!.getPanelNames();
    });
}

async function waitForPanelCount(page, count: number): Promise<void> {
    await page.waitForFunction(
        (n) =>
            // @ts-ignore
            document.querySelector("perspective-viewer")!.getPanelNames()
                .length === n,
        count,
    );
}

const TABLE_ITEMS =
    '[data-label="new-from-table"] + .dropdown-group-container .dropdown-menu-item';
const PANEL_ITEMS =
    '[data-label="new-from-panel"] + .dropdown-group-container .dropdown-menu-item';

async function openNewMenu(page) {
    const viewer = page.locator("perspective-viewer");
    await viewer.locator("#status_bar #new_panel").click();
    const menu = page.locator("perspective-new-panel-menu");
    await menu.waitFor();
    return menu;
}

async function pickNewTable(page, table: string): Promise<void> {
    const menu = await openNewMenu(page);
    await menu.locator(TABLE_ITEMS, { hasText: table }).click();
    await expect(menu).toHaveCount(0);
}

async function pickNewPanel(page, label: string): Promise<void> {
    const menu = await openNewMenu(page);
    await menu.locator(PANEL_ITEMS, { hasText: label }).click();
    await expect(menu).toHaveCount(0);
}

async function savePanel(page, name: string) {
    return await page.evaluate(async (name) => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        return await viewer.save({ panel: name });
    }, name);
}

test.describe("Status bar panel actions", () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({
                settings: true,
                group_by: ["State"],
                columns: ["Sales", "Profit"],
            });
        });
    });

    test("New from Panel adds a panel with the picked panel's exact config", async ({
        page,
    }) => {
        const [source] = await panelNames(page);
        await pickNewPanel(page, source);
        await waitForPanelCount(page, 2);
        await assertCoherent(page);

        const [dup] = (await panelNames(page)).filter((n) => n !== source);
        expect(await savePanel(page, dup)).toEqual(
            await savePanel(page, source),
        );
    });

    test("New opens a hosted-table dropdown; a pick adds a default-config panel on that table", async ({
        page,
    }) => {
        const [source] = await panelNames(page);
        await pickNewTable(page, TABLE);
        await waitForPanelCount(page, 2);
        await assertCoherent(page);

        const [fresh] = (await panelNames(page)).filter((n) => n !== source);
        const config = await savePanel(page, fresh);
        expect(config.table).toBe(TABLE);
        expect(config.group_by).toEqual([]);
    });

    test("New from Panel copies the picked panel, not the active one", async ({
        page,
    }) => {
        await pickNewTable(page, TABLE);
        await waitForPanelCount(page, 2);
        const names = await panelNames(page);
        const fresh = names[1];
        await page.evaluate(async (name) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore(
                { columns: ["Quantity"], settings: true },
                { panel: name },
            );
        }, fresh);

        await pickNewPanel(page, fresh);
        await waitForPanelCount(page, 3);
        await assertCoherent(page);

        const [dup] = (await panelNames(page)).filter(
            (n) => !names.includes(n),
        );
        expect((await savePanel(page, dup)).columns).toEqual(["Quantity"]);
    });

    test("New menu items use the shared inverted hover", async ({ page }) => {
        const viewer = page.locator("perspective-viewer");
        await viewer.locator("#status_bar #new_panel").click();
        const menu = page.locator("perspective-new-panel-menu");
        await menu.waitFor();
        const item = menu.locator(TABLE_ITEMS, { hasText: TABLE });
        await item.hover();
        const styles = await item.evaluate((el) => {
            const host = (el.getRootNode() as ShadowRoot).host;
            return {
                item_bg: getComputedStyle(el).backgroundColor,
                item_fg: getComputedStyle(el).color,
                host_fg: getComputedStyle(host).color,
                host_bg: getComputedStyle(host).backgroundColor,
                cursor: getComputedStyle(el).cursor,
            };
        });

        expect(styles.item_bg).toEqual(styles.host_fg);
        expect(styles.item_fg).toEqual(styles.host_bg);
        expect(styles.cursor).toEqual("pointer");
        await menu.evaluate((el: HTMLElement) => el.blur());
        await expect(menu).toHaveCount(0);
    });

    test("Dropdown dismisses on blur without adding a panel", async ({
        page,
    }) => {
        const viewer = page.locator("perspective-viewer");
        await viewer.locator("#status_bar #new_panel").click();
        const menu = page.locator("perspective-new-panel-menu");
        await menu.waitFor();
        await menu.evaluate((el: HTMLElement) => el.blur());
        await expect(menu).toHaveCount(0);
        expect((await panelNames(page)).length).toBe(1);
    });

    test("Both sections carry their intl labels and list every entry", async ({
        page,
    }) => {
        await pickNewTable(page, TABLE);
        await waitForPanelCount(page, 2);
        const names = await panelNames(page);
        const menu = await openNewMenu(page);
        const labels = await menu
            .locator(".dropdown-group-label")
            .evaluateAll((els) =>
                els.map((el) => getComputedStyle(el, "::before").content),
            );

        expect(labels).toEqual(['"New from Table"', '"New from Panel"']);
        await expect(menu.locator(TABLE_ITEMS)).toHaveText([TABLE]);
        await expect(menu.locator(PANEL_ITEMS)).toHaveText(names);
        await menu.evaluate((el: HTMLElement) => el.blur());
        await expect(menu).toHaveCount(0);
    });
});
