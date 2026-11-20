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
import type { Page } from "@playwright/test";
import {
    TABLE,
    addTable,
    hostedTables,
    restoreWorkspace,
    ready,
} from "./helpers.ts";

test.beforeEach(ready);

const CONFIG = {
    panels: { one: { table: TABLE, plugin: "Debug" } },
    active: "one",
    derived_tables: {
        "Region Totals": { table: TABLE, group_by: ["Region"] },
    },
};

async function openNewMenu(page: Page) {
    await page.locator("perspective-viewer").locator("#new_panel").click();
    return page.locator("perspective-new-panel-menu, .new-panel-menu").first();
}

test.describe("the New menu marks derived tables", () => {
    test("a derived row is marked and a base row is not", async ({ page }) => {
        await restoreWorkspace(page, CONFIG);
        const menu = await openNewMenu(page);
        await expect(
            menu.locator(".dropdown-menu-item", { hasText: "Region Totals" }),
        ).toHaveClass(/is-derived/);

        await expect(
            menu.locator(".dropdown-menu-item", { hasText: TABLE }),
        ).not.toHaveClass(/is-derived/);
    });

    test("delete is offered at zero consumers", async ({ page }) => {
        await restoreWorkspace(page, CONFIG);
        const menu = await openNewMenu(page);
        await menu
            .locator(".dropdown-menu-item", { hasText: "Region Totals" })
            .locator(".derived_delete")
            .click();

        await expect
            .poll(async () => await hostedTables(page))
            .not.toContain("Region Totals");
    });

    test("delete is withheld while a panel reads it", async ({ page }) => {
        await restoreWorkspace(page, {
            panels: { one: { table: "Region Totals", plugin: "Debug" } },
            active: "one",
            derived_tables: {
                "Region Totals": { table: TABLE, group_by: ["Region"] },
            },
        });

        const menu = await openNewMenu(page);
        const row = menu.locator(".dropdown-menu-item", {
            hasText: "Region Totals",
        });

        await expect(row.locator(".derived_delete")).toHaveCount(0);
        await expect(row.locator(".derived_consumers")).toHaveText("1");
    });
});

test.describe("the New menu tracks the hosted set while open", () => {
    test("a deleted row leaves the open menu", async ({ page }) => {
        await restoreWorkspace(page, CONFIG);
        const menu = await openNewMenu(page);
        const row = menu.locator(".dropdown-menu-item", {
            hasText: "Region Totals",
        });

        await row.locator(".derived_delete").click();
        await expect(row).toHaveCount(0);
        await expect(
            menu.locator(".dropdown-menu-item", { hasText: TABLE }),
        ).toHaveCount(1);

        expect(await hostedTables(page)).not.toContain("Region Totals");
    });

    test("a table created while open appears", async ({ page }) => {
        await restoreWorkspace(page, CONFIG);
        const menu = await openNewMenu(page);
        await expect(
            menu.locator(".dropdown-menu-item", { hasText: TABLE }),
        ).toHaveCount(1);

        await addTable(page, "latecomer");
        await expect(
            menu.locator(".dropdown-menu-item", { hasText: "latecomer" }),
        ).toHaveCount(1);
    });
});

async function openSettings(page: Page) {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore({ plugin: "Debug", settings: true });
        await viewer.flush();
    });
}

async function addTables(page: Page, names: string[]) {
    await page.evaluate(async (names) => {
        const worker = window["__TEST_WORKER__"];
        await Promise.all(
            names.map((name) => worker.table({ x: [1] }, { name })),
        );
    }, names);
}

async function panelTables(page: Page): Promise<string[]> {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        const config = await viewer.saveWorkspace();
        return Object.values(config.panels).map((panel: any) => panel.table);
    });
}

test.describe("the New menu fits the viewport", () => {
    test("300 tables keep it under its button and inside the viewport with the last table clickable", async ({
        page,
    }) => {
        const names = Array.from(
            { length: 300 },
            (_, i) => `t_${String(i).padStart(3, "0")}`,
        );

        await addTables(page, names);
        await openSettings(page);
        await page.locator("perspective-viewer #status_bar #new_panel").click();
        const menu = page.locator("perspective-new-panel-menu");
        await menu
            .locator(".dropdown-menu-item", { hasText: "t_299" })
            .waitFor({ state: "attached" });

        const button = (await page
            .locator("perspective-viewer #status_bar #new_panel")
            .locator("xpath=..")
            .boundingBox())!;

        const viewport = page.viewportSize()!;
        await expect
            .poll(async () => {
                const box = (await menu.boundingBox())!;
                return box.y + box.height;
            })
            .toBeLessThanOrEqual(viewport.height);

        const box = (await menu.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(button.y + button.height - 2);
        expect(box.y).toBeLessThanOrEqual(button.y + button.height + 2);
        await menu
            .locator(".dropdown-menu-item", { hasText: "t_299" })
            .click({ timeout: 5000 });

        await expect.poll(() => panelTables(page)).toContain("t_299");
    });

    test("a short table list is not height-limited", async ({ page }) => {
        await openSettings(page);
        await page.locator("perspective-viewer #status_bar #new_panel").click();
        const menu = page.locator("perspective-new-panel-menu");
        await expect(menu.locator(".dropdown-menu-item").first()).toBeVisible();
        const style = await menu.evaluate((el: HTMLElement) => ({
            max_height: el.style.maxHeight,
            overflow: getComputedStyle(el).overflowY,
        }));

        expect(style).toEqual({ max_height: "", overflow: "visible" });
    });

    test("a 200-character table name is truncated at 320px with its full name in the title", async ({
        page,
    }) => {
        const name = "lorem_ipsum_dolor_".repeat(12).slice(0, 200);
        await addTables(page, [name]);
        await openSettings(page);
        await page.locator("perspective-viewer #status_bar #new_panel").click();
        const menu = page.locator("perspective-new-panel-menu");
        const label = menu.locator(".dropdown-menu-label", { hasText: name });
        await expect(label).toHaveAttribute("title", name);
        const box = (await menu.boundingBox())!;
        expect(box.width).toBeLessThanOrEqual(320.5);
        const truncated = await label.evaluate(
            (el) => el.scrollWidth > el.clientWidth,
        );

        expect(truncated).toBe(true);
    });
});
