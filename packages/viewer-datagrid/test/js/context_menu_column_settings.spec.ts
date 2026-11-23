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

const GRID = "perspective-viewer-datagrid regular-table";
const COLUMN_ITEM = /\w['"] Settings/;

async function setup(page: Page, config: Record<string, unknown>) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.restore({ plugin: "Datagrid", ...config });
        await viewer.flush();
        (window as any).__TOGGLES__ = [];
        viewer.addEventListener(
            "perspective-toggle-column-settings",
            (event: CustomEvent) =>
                (window as any).__TOGGLES__.push(event.detail),
        );
    }, config);
}

test.describe("Datagrid context menu column settings", () => {
    test("a cell's context menu opens its column's settings", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] });
        const cell = page
            .locator(`${GRID} tbody tr`)
            .first()
            .locator("td")
            .nth(1);

        await cell.click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item", { hasText: COLUMN_ITEM })
            .click();

        await expect
            .poll(async () =>
                page.evaluate(() => (window as any).__TOGGLES__.at(-1)),
            )
            .toEqual({ open: true, column_name: "Sales" });
    });

    test("column settings open the closed settings sidebar in the same frame", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"], settings: false });
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            const states: string[] = [];
            (window as any).__FRAMES__ = states;
            const sample = () => {
                const state = [
                    viewer.hasAttribute("settings"),
                    viewer.querySelector("#column_settings_sidebar") !== null ||
                        viewer.shadowRoot?.querySelector(
                            "#column_settings_sidebar",
                        ) != null,
                ].join(",");

                if (states.at(-1) !== state) {
                    states.push(state);
                }

                requestAnimationFrame(sample);
            };

            requestAnimationFrame(sample);
        });

        const cell = page
            .locator(`${GRID} tbody tr`)
            .first()
            .locator("td")
            .nth(1);

        await cell.click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu.locator(".context-menu-item", { hasText: "Sales" }).click();

        await expect(
            page.locator("perspective-viewer #column_settings_sidebar"),
        ).toHaveCount(1);

        await expect
            .poll(async () =>
                page.evaluate(async () => {
                    const viewer = document.querySelector(
                        "perspective-viewer",
                    ) as any;
                    return (await viewer.save()).settings;
                }),
            )
            .toBe(true);

        expect(await page.evaluate(() => (window as any).__FRAMES__)).toEqual([
            "false,false",
            "true,true",
        ]);
    });

    test("a divider separates column settings from the panel commands", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"] });
        const cell = page
            .locator(`${GRID} tbody tr`)
            .first()
            .locator("td")
            .nth(1);

        await cell.click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const rows = await menu
            .locator(".context-menu-item, .context-menu-separator")
            .evaluateAll((elems) =>
                elems.map((elem) =>
                    elem.classList.contains("context-menu-separator")
                        ? null
                        : (elem.textContent ?? "").trim(),
                ),
            );

        const divider = rows.indexOf(null);
        expect(rows[divider - 2]).toContain("Sales");
        expect(rows[divider - 1]).toEqual("Panel Settings");
        expect(rows[divider + 1]).toMatch(/^New/);
    });

    test("Panel Settings opens the settings sidebar", async ({ page }) => {
        await setup(page, { columns: ["State", "Sales"], settings: false });
        const cell = page
            .locator(`${GRID} tbody tr`)
            .first()
            .locator("td")
            .nth(1);

        await cell.click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item", { hasText: "Panel Settings" })
            .click();

        await expect
            .poll(async () =>
                page.evaluate(async () => {
                    const viewer = document.querySelector(
                        "perspective-viewer",
                    ) as any;
                    return (await viewer.save()).settings;
                }),
            )
            .toBe(true);
    });

    test("settings items hide when the sidebar already shows them", async ({
        page,
    }) => {
        await setup(page, { columns: ["State", "Sales"], settings: true });
        const cell = page
            .locator(`${GRID} tbody tr`)
            .first()
            .locator("td")
            .nth(1);

        await cell.click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await expect(
            menu.locator(".context-menu-item", { hasText: "Panel Settings" }),
        ).toHaveCount(0);

        const column = menu.locator(".context-menu-item", {
            hasText: "Sales",
        });

        await expect(column).toHaveCount(1);
        await column.click();
        await expect
            .poll(async () =>
                page.evaluate(() => (window as any).__TOGGLES__.at(-1)),
            )
            .toEqual({ open: true, column_name: "Sales" });

        await cell.click({ button: "right" });
        await menu.waitFor();
        await expect(
            menu.locator(".context-menu-item", { hasText: "Settings" }),
        ).toHaveCount(0);

        await expect(
            menu.locator(".context-menu-item, .context-menu-separator").first(),
        ).not.toHaveClass(/context-menu-separator/);
    });

    test("a row header's context menu has no column settings", async ({
        page,
    }) => {
        await setup(page, { columns: ["Sales"], group_by: ["State"] });
        const header = page
            .locator(`${GRID} tbody tr`)
            .nth(1)
            .locator("th:not(.psp-tree-spacer)")
            .first();

        await header.click({ button: "right" });
        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await expect(
            menu.locator(".context-menu-item", { hasText: "Duplicate" }),
        ).toBeVisible();

        await expect(
            menu.locator(".context-menu-item", { hasText: COLUMN_ITEM }),
        ).toHaveCount(0);

        await expect(
            menu.locator(".context-menu-item, .context-menu-separator").first(),
        ).not.toHaveClass(/context-menu-separator/);
    });
});
