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

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

async function openMenuNearRightEdge(page) {
    const box = (await page
        .locator("perspective-viewer #main_panel_container")
        .boundingBox())!;

    const x = box.x + box.width - 8;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y, { button: "right" });
    const menu = page.locator("perspective-context-menu");
    await menu.waitFor();
    return { menu, x, y };
}

async function twoFrames(page) {
    await page.evaluate(
        () =>
            new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
    );
}

test.describe("Context menu at the viewport edge", () => {
    test("the menu stays left of a right-edge cursor after its tables load", async ({
        page,
    }) => {
        const { menu, x } = await openMenuNearRightEdge(page);
        const viewport_width = page.viewportSize()!.width;
        await menu
            .locator(".context-menu-submenu .dropdown-menu-item")
            .first()
            .waitFor({ state: "attached" });

        await twoFrames(page);
        const box = (await menu.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(viewport_width);
        expect(box.x + box.width).toBeLessThanOrEqual(x + 1);
        await twoFrames(page);
        const again = (await menu.boundingBox())!;
        expect(again.x).toEqual(box.x);
    });

    test("the New flyout opens on the side with room near the right edge", async ({
        page,
    }) => {
        const { menu } = await openMenuNearRightEdge(page);
        const viewport_width = page.viewportSize()!.width;
        const new_item = menu.locator(".context-menu-item.has-submenu", {
            hasText: "New",
        });

        await new_item.hover();
        const flyout = menu.locator(".context-menu-submenu");
        await expect(flyout).toBeVisible();
        const menu_box = (await menu.boundingBox())!;
        const box = (await flyout.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(viewport_width);
        expect(box.x + box.width).toBeLessThanOrEqual(menu_box.x + 1);
    });
});

async function declareCommands(page, commands: unknown[]) {
    await page.evaluate(async (commands) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        window["__COMMANDS__"] = [];
        viewer.addEventListener("perspective-command", (event) => {
            window["__COMMANDS__"].push(event.detail.key);
        });

        await viewer.setCommandSchema(() => ({ commands }));
    }, commands);
}

async function expectInsideViewport(page, locator) {
    const viewport = page.viewportSize()!;
    const box = (await locator.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test.describe("Context menu taller than the viewport", () => {
    test("60 commands opened near the bottom edge stay inside the viewport with the last clickable", async ({
        page,
    }) => {
        const commands = Array.from({ length: 60 }, (_, i) => ({
            kind: "Command",
            key: `command_${i}`,
            label: `Command ${String(i).padStart(2, "0")}`,
        }));

        await declareCommands(page, commands);
        const viewport = page.viewportSize()!;
        await page.mouse.click(viewport.width / 2, viewport.height - 8, {
            button: "right",
        });

        const menu = page.locator("perspective-context-menu");
        await expect(menu).toBeVisible();
        await twoFrames(page);
        await expectInsideViewport(page, menu);
        await menu
            .locator(".context-menu-item", { hasText: "Command 59" })
            .click({ timeout: 5000 });

        await expect
            .poll(() => page.evaluate(() => window["__COMMANDS__"]))
            .toContain("command_59");
    });

    test("the New flyout with 300 tables stays inside the viewport with its last table clickable", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            const worker = window["__TEST_WORKER__"];
            await Promise.all(
                Array.from({ length: 300 }, (_, i) =>
                    worker.table(
                        { x: [1] },
                        { name: `t_${String(i).padStart(3, "0")}` },
                    ),
                ),
            );
        });

        const viewport = page.viewportSize()!;
        await page.mouse.click(viewport.width / 2, viewport.height / 2, {
            button: "right",
        });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item.has-submenu", { hasText: "New" })
            .hover();

        const flyout = menu.locator(".context-menu-submenu");
        await expect(flyout).toBeVisible();
        const last = flyout.locator(".dropdown-menu-item", {
            hasText: "t_299",
        });

        await last.waitFor({ state: "attached" });
        await twoFrames(page);
        await expectInsideViewport(page, flyout);
        await last.click({ timeout: 5000 });
        await expect
            .poll(() =>
                page.evaluate(async () => {
                    const viewer = document.querySelector(
                        "perspective-viewer",
                    ) as any;

                    const config = await viewer.saveWorkspace();
                    return Object.values(config.panels).map(
                        (panel: any) => panel.table,
                    );
                }),
            )
            .toContain("t_299");
    });

    test("a flyout nested in a flyout opens beside it and is clickable", async ({
        page,
    }) => {
        await declareCommands(page, [
            {
                kind: "Group",
                key: "outer",
                label: "Outer",
                commands: [
                    { kind: "Command", key: "sibling", label: "Sibling" },
                    {
                        kind: "Group",
                        key: "inner",
                        label: "Inner",
                        commands: [
                            { kind: "Command", key: "leaf", label: "Leaf" },
                        ],
                    },
                ],
            },
        ]);

        const viewport = page.viewportSize()!;
        await page.mouse.click(viewport.width / 2, viewport.height / 2, {
            button: "right",
        });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const outer_row = menu.locator(".context-menu-item.has-submenu", {
            hasText: "Outer",
        });

        await outer_row.hover();
        const outer = outer_row.locator("> .context-menu-submenu");
        await expect(outer).toBeVisible();
        const inner_row = outer.locator(".context-menu-item.has-submenu");
        await inner_row.hover();
        const inner = inner_row.locator("> .context-menu-submenu");
        await expect(inner).toBeVisible();
        const outer_box = (await outer.boundingBox())!;
        const inner_box = (await inner.boundingBox())!;
        expect(await outer.evaluate((el) => el.scrollLeft)).toBe(0);
        expect(inner_box.x).toBeGreaterThanOrEqual(
            outer_box.x + outer_box.width - 2,
        );

        await expectInsideViewport(page, inner);
        const unclipped = await inner.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const hit = (el.getRootNode() as ShadowRoot).elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
            );

            return el.contains(hit);
        });

        expect(unclipped).toBe(true);
        await inner
            .locator(".context-menu-item", { hasText: "Leaf" })
            .click({ timeout: 5000 });

        await expect
            .poll(() => page.evaluate(() => window["__COMMANDS__"]))
            .toContain("leaf");
    });
});
