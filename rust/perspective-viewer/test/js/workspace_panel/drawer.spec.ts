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
import { iconRect, ready, toggle } from "./helpers.ts";

test.beforeEach(ready);

test.describe("Workspace panel drawer", () => {
    test("the status icon toggles the panel and keeps its position", async ({
        page,
    }) => {
        const icon = page.locator("perspective-viewer #status_reconnect");
        const panel = page.locator("perspective-viewer #workspace_panel");
        await expect(icon).toHaveCount(1);
        const closed = await iconRect(page);

        await icon.click();
        await expect(panel).toBeVisible();
        await expect(icon).toHaveCount(1);
        await expect(
            page.locator(
                "perspective-viewer #workspace_panel_header #status_reconnect",
            ),
        ).toHaveCount(1);

        expect(await iconRect(page)).toEqual(closed);

        await page.locator("perspective-viewer #workspace_pin_button").click();
        await expect(
            page.locator("perspective-viewer #workspace_drawer"),
        ).toHaveClass(/pinned/);

        expect(await iconRect(page)).toEqual(closed);

        await icon.click();
        await expect(panel).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer #status_bar #status_reconnect"),
        ).toHaveCount(1);

        expect(await iconRect(page)).toEqual(closed);
    });

    test("pinning docks the drawer without remounting the layout", async ({
        page,
    }) => {
        await toggle(page, true);
        const drawer = page.locator("perspective-viewer #workspace_drawer");
        const state = () =>
            page.evaluate(() => {
                const root =
                    document.querySelector("perspective-viewer")!.shadowRoot!;
                const drawer = root.querySelector("#workspace_drawer")!;
                const layout = root.querySelector("regular-layout")! as any;
                return {
                    position: getComputedStyle(drawer).position,
                    mark: layout.__mark__,
                    width: root
                        .querySelector("#main_panel_container")!
                        .getBoundingClientRect().width,
                };
            });

        await page.evaluate(() => {
            const root =
                document.querySelector("perspective-viewer")!.shadowRoot!;
            (root.querySelector("regular-layout")! as any).__mark__ =
                "original";
        });

        const floating = await state();
        expect(floating.position).toBe("absolute");
        expect(floating.mark).toBe("original");

        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")! as any;
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

        await page.locator("perspective-viewer #workspace_pin_button").click();
        await expect(drawer).toHaveClass(/pinned/);
        const pinned = await state();
        expect(pinned.position).toBe("static");
        expect(pinned.mark).toBe("original");
        expect(pinned.width).toBeLessThan(floating.width);
        await expect
            .poll(() => page.evaluate(() => window["__geometry_calls__"]))
            .toBeGreaterThan(0);

        await page.evaluate(() => {
            window["__geometry_calls__"] = 0;
        });

        await toggle(page, false);
        await expect(drawer).toHaveCount(0);
        await expect
            .poll(() => page.evaluate(() => window["__geometry_calls__"]))
            .toBeGreaterThan(0);

        await toggle(page, true);
        await expect(drawer).toHaveClass(/pinned/);
        const reopened = await state();
        expect(reopened.mark).toBe("original");
        expect(reopened.width).toBeCloseTo(pinned.width, 0);
    });

    test("the panel outlives a settings close, which removes its opener", async ({
        page,
    }) => {
        await toggle(page, true);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.toggleConfig(false);
        });

        const panel = page.locator("perspective-viewer #workspace_panel");
        await expect(panel).toBeVisible();
        await page
            .locator(
                "perspective-viewer #workspace_panel_header #status_reconnect",
            )
            .click();

        await expect(panel).toHaveCount(0);
        await expect(
            page.locator("perspective-viewer #status_reconnect"),
        ).toHaveCount(0);
    });
});
