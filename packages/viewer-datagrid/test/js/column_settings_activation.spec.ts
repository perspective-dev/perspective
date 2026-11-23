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

import { expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

const TABLE = "load-viewer-csv";
const DRAWER = "perspective-viewer #column_settings_sidebar";

async function setup(page: Page): Promise<[string, string]> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    return await page.evaluate(async (table) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore({
            plugin: "Datagrid",
            columns: ["State", "Sales"],
            settings: true,
        });

        await viewer.addPanel({
            plugin: "Datagrid",
            table,
            columns: ["State", "Sales"],
        });

        await viewer.flush();
        const [first, second] = await viewer.getPanelNames();
        await viewer.toggleColumnSettings("Sales", { panel: first });
        await viewer.flush();
        return [first, second];
    }, TABLE);
}

async function indicators(page: Page): Promise<Record<string, number>> {
    return await page.evaluate(() =>
        Object.fromEntries(
            Array.from(
                document.querySelectorAll("perspective-viewer-datagrid"),
            ).map((plugin) => [
                plugin.getAttribute("slot") ?? "",
                (plugin.shadowRoot ?? plugin).querySelectorAll(".psp-menu-open")
                    .length,
            ]),
        ),
    );
}

async function active_panel(page: Page): Promise<string> {
    return await page.evaluate(() =>
        (document.querySelector("perspective-viewer") as any).getActivePanel(),
    );
}

test.describe("Column settings and panel activation", () => {
    test("activating another panel closes the column settings", async ({
        page,
    }) => {
        const [first, second] = await setup(page);
        await expect(page.locator(DRAWER)).toHaveCount(1);
        await expect
            .poll(async () => (await indicators(page))[first])
            .toBeGreaterThan(0);

        await page.evaluate(async (second) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.setActivePanel(second);
            await viewer.flush();
        }, second);

        expect(await active_panel(page)).toBe(second);
        await expect(page.locator(DRAWER)).toHaveCount(0);
        await expect
            .poll(async () => indicators(page))
            .toEqual({ [first]: 0, [second]: 0 });
    });

    test("Panel Settings on another panel closes the column settings", async ({
        page,
    }) => {
        const [first, second] = await setup(page);
        await expect
            .poll(async () => (await indicators(page))[first])
            .toBeGreaterThan(0);

        await page
            .locator(
                `perspective-viewer-datagrid[slot="${second}"] regular-table tbody tr`,
            )
            .first()
            .locator("td")
            .nth(1)
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item", { hasText: "Panel Settings" })
            .click();

        await expect.poll(async () => active_panel(page)).toBe(second);
        await expect(page.locator(DRAWER)).toHaveCount(0);
        await expect
            .poll(async () => indicators(page))
            .toEqual({ [first]: 0, [second]: 0 });
    });

    test("closing the active panel closes its column settings", async ({
        page,
    }) => {
        const [first, second] = await setup(page);
        await expect(page.locator(DRAWER)).toHaveCount(1);
        await page.evaluate(async (first) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.removePanel(first);
            await viewer.flush();
        }, first);

        expect(await active_panel(page)).toBe(second);
        await expect(page.locator(DRAWER)).toHaveCount(0);
        await expect
            .poll(async () => indicators(page))
            .toEqual({ [second]: 0 });
    });
});
