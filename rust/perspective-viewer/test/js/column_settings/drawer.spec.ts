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

// Column-settings drawer window geometry: the pin/unpin CSS-positioning
// flip (floating overlay <-> docked flex sibling) and the plugin-resize
// contract every docked-drawer mount transition owes — pin toggle,
// drawer open/close, and config-driven locator invalidation. Tab-agnostic:
// nothing here depends on which drawer tab is selected.
test.describe("Column settings drawer", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(
            "/rust/perspective-viewer/test/html/superstore-debug.html",
        );
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });
    });

    async function restoreDebugStyled(page: Page) {
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer");
            await viewer.restore({
                plugin: "Debug Styled",
                settings: true,
                columns: ["Row ID", "Sales"],
            });
        });
    }

    // Count geometry notifications on the active plugin - `presize()`
    // from the staged sweep and/or `resize()` from the reactive
    // finalizer. The plugin's `resize`/`presize` resolve through the
    // prototype chain to non-assignable properties, so a plain
    // `plugin.resize = fn` is silently rejected - shadow with an own
    // `defineProperty` data property instead.
    async function wrapGeometryCounter(page: Page) {
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer");
            const plugin = viewer.getPlugin();
            window["__geometry_calls__"] = 0;
            for (const method of ["resize", "presize"]) {
                const orig = plugin[method];
                if (typeof orig === "function") {
                    Object.defineProperty(plugin, method, {
                        configurable: true,
                        value: (...args) => {
                            window["__geometry_calls__"]++;
                            return orig.apply(plugin, args);
                        },
                    });
                }
            }
        });
    }

    const pollGeometryCalls = (page: Page) =>
        expect
            .poll(() => page.evaluate(() => window["__geometry_calls__"]))
            .toBeGreaterThan(0);

    const resetGeometryCalls = (page: Page) =>
        page.evaluate(() => {
            window["__geometry_calls__"] = 0;
        });

    test("pin button docks the drawer into the layout and back", async ({
        page,
    }) => {
        await restoreDebugStyled(page);
        await page.click("#add-expression");

        // Stage a draft first - the pin toggle must NOT remount the
        // drawer (which would wipe it).
        await page.fill("input.sidebar_header_title", "my draft");

        const modal_style = async () =>
            await page.evaluate(() => {
                const root =
                    document.querySelector("perspective-viewer").shadowRoot;
                const modal = root.querySelector("#modal_panel");
                return {
                    position: getComputedStyle(modal).position,
                    pinned: modal.classList.contains("pinned"),
                    width: modal.getBoundingClientRect().width,
                };
            });

        const floating = await modal_style();
        expect(floating.position).toBe("absolute");
        expect(floating.pinned).toBe(false);

        // Pin: the drawer becomes a static flex sibling and stops spanning
        // the whole main area.
        await page.click("#column_settings_pin_button");
        await expect(page.locator("#modal_panel")).toHaveClass(/pinned/);
        const pinned = await modal_style();
        expect(pinned.position).toBe("static");
        expect(pinned.pinned).toBe(true);
        expect(pinned.width).toBeLessThan(floating.width);

        // The staged draft survived the toggle - no remount.
        await expect(page.locator("input.sidebar_header_title")).toHaveValue(
            "my draft",
        );

        // Unpin restores the overlay.
        await page.click("#column_settings_pin_button");
        await expect(page.locator("#modal_panel")).not.toHaveClass(/pinned/);
        const restored = await modal_style();
        expect(restored.position).toBe("absolute");
        expect(restored.pinned).toBe(false);
    });

    test("pin toggle notifies the plugin of its new dimensions", async ({
        page,
    }) => {
        await restoreDebugStyled(page);
        await page.click("#add-expression");
        await wrapGeometryCounter(page);
        await page.click("#column_settings_pin_button");
        await expect(page.locator("#modal_panel")).toHaveClass(/pinned/);
        await pollGeometryCalls(page);
        await resetGeometryCalls(page);
        await page.click("#column_settings_pin_button");
        await expect(page.locator("#modal_panel")).not.toHaveClass(/pinned/);
        await pollGeometryCalls(page);
    });

    test("closing and reopening a pinned drawer notifies the plugin", async ({
        page,
    }) => {
        await restoreDebugStyled(page);
        await page.click("#add-expression");
        await page.click("#column_settings_pin_button");
        await expect(page.locator("#modal_panel")).toHaveClass(/pinned/);
        await wrapGeometryCounter(page);

        // Closing a DOCKED drawer frees its flex span - the plugin must be
        // notified of the grown main panel.
        await page.click("#column_settings_close_button");
        await expect(page.locator("#modal_panel")).toBeHidden();
        await pollGeometryCalls(page);
        await resetGeometryCalls(page);

        // Reopening mounts the drawer directly into pinned mode - the
        // plugin must be notified of the shrunk main panel.
        await page.click("#add-expression");
        await expect(page.locator("#modal_panel")).toHaveClass(/pinned/);
        await pollGeometryCalls(page);
    });

    test("removing the open column closes a pinned drawer and notifies the plugin", async ({
        page,
    }) => {
        // "Debug Styled" declares `can_render_column_styles`, so table
        // columns get an ENABLED edit button (a Style tab).
        await restoreDebugStyled(page);

        // force: the hover-reveal border overlay intercepts pointer events
        // (same workaround as the `PageView` model's `editBtn`).
        await page.click(
            '#active-columns .column-selector-column:has-text("Sales") .expression-edit-button:not(.disabled)',
            { force: true },
        );
        await page.click("#column_settings_pin_button");
        await expect(page.locator("#modal_panel")).toHaveClass(/pinned/);
        await wrapGeometryCounter(page);

        // Removing the open column from `columns` (the active row's
        // leading deactivate toggle) changes the view config, invalidating
        // the drawer's locator - the docked drawer unmounts via the
        // session snapshot (never through `UpdateColumnSettings`) and the
        // plugin must still receive a geometry pass for the grown main
        // panel.
        await page.click(
            '#active-columns .column-selector-column:has-text("Sales") span.shift-alt-icon',
            { force: true },
        );

        await expect(page.locator("#modal_panel")).toBeHidden();
        await pollGeometryCalls(page);
    });
});
