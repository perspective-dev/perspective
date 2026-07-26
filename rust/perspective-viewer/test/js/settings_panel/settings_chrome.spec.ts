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

// `#app_panel` settings-pane chrome (`.plan/SETTINGS_PANE_SKIP_PLAN.md`):
// with settings CLOSED the SplitPanel must render NO divider and NO empty
// leading pane (the phantom pair was interactable, pinned to the container
// edge), and toggling the sidebar must reconcile the main pane IN PLACE —
// the `<regular-layout>` and the datagrid's `regular-table` are
// identity-stable across toggles. Runs on `basic-test.html` (real datagrid
// plugin) so the regular-table invariant is checkable.

import { test, expect } from "../helpers.ts";
import { armLayoutCanary, assertCoherent } from "../multi_panel/harness.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function setSettings(page, open: boolean): Promise<void> {
    await page.evaluate(async (open) => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        await viewer.restore({ settings: open });
    }, open);
}

/// Direct-child chrome of the `#app_panel` SplitPanel — a skipped pane must
/// take BOTH its `SplitPanelChild` wrapper and its divider with it.
function chrome(page) {
    return {
        dividers: page.locator("#app_panel > .split-panel-divider"),
        panes: page.locator("#app_panel > .split-panel-child"),
    };
}

async function widths(page): Promise<{ app: number; main: number }> {
    return await page.evaluate(() => {
        const shadow =
            document.querySelector("perspective-viewer")!.shadowRoot!;
        return {
            app: shadow.querySelector("#app_panel")!.getBoundingClientRect()
                .width,
            main: shadow
                .querySelector("#main_column_container")!
                .getBoundingClientRect().width,
        };
    });
}

/// Drag the settings divider by `dx` CSS pixels (negative = left, which
/// WIDENS the right-docked sidebar under `reverse` orientation).
async function dragDivider(page, dx: number): Promise<void> {
    const divider = page.locator("#app_panel > .split-panel-divider");
    const box = (await divider.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) {
        await page.mouse.move(x + (dx * i) / 4, y);
    }

    await page.mouse.up();
}

async function settingsPaneWidth(page): Promise<number> {
    const box = await page
        .locator("#app_panel > .split-panel-child")
        .boundingBox();
    return box!.width;
}

test.describe("Settings pane chrome", () => {
    test("closed: no divider, no empty pane, main column spans the stage", async ({
        page,
    }) => {
        const { dividers, panes } = chrome(page);
        await expect(dividers).toHaveCount(0);
        await expect(panes).toHaveCount(0);

        const { app, main } = await widths(page);
        expect(Math.abs(app - main)).toBeLessThanOrEqual(1);
    });

    test("open: exactly one divider and one settings pane; close removes both", async ({
        page,
    }) => {
        await setSettings(page, true);
        const { dividers, panes } = chrome(page);
        await expect(dividers).toHaveCount(1);
        await expect(panes).toHaveCount(1);

        await setSettings(page, false);
        await expect(dividers).toHaveCount(0);
        await expect(panes).toHaveCount(0);

        const { app, main } = await widths(page);
        expect(Math.abs(app - main)).toBeLessThanOrEqual(1);
    });

    test("toggling preserves regular-layout AND regular-table identity", async ({
        page,
    }) => {
        await armLayoutCanary(page);

        // The datagrid's elements must survive the toggles as the SAME
        // instances — a remount here would tear down the regular-table.
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            const datagrid = viewer.querySelector(
                "perspective-viewer-datagrid",
            )! as any;
            const table =
                datagrid.querySelector("regular-table") ??
                datagrid.shadowRoot?.querySelector("regular-table");
            (globalThis as any).__PSP_DATAGRID_CANARY = { datagrid, table };
        });

        for (let i = 0; i < 3; i++) {
            await setSettings(page, true);
            await expect(chrome(page).dividers).toHaveCount(1);
            await setSettings(page, false);
            await expect(chrome(page).dividers).toHaveCount(0);
        }

        await assertCoherent(page);
        const identity = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            const canary = (globalThis as any).__PSP_DATAGRID_CANARY;
            const datagrid = viewer.querySelector(
                "perspective-viewer-datagrid",
            ) as any;
            const table =
                datagrid?.querySelector("regular-table") ??
                datagrid?.shadowRoot?.querySelector("regular-table");
            return {
                same_datagrid: canary.datagrid === datagrid,
                same_table: canary.table != null && canary.table === table,
                connected: !!datagrid?.isConnected && !!table?.isConnected,
            };
        });

        expect(identity).toEqual({
            same_datagrid: true,
            same_table: true,
            connected: true,
        });
    });

    test("dragged sidebar width is remembered across close/reopen", async ({
        page,
    }) => {
        await setSettings(page, true);
        const w0 = await settingsPaneWidth(page);
        await dragDivider(page, -80);

        // The deferred presize pump commits the width asynchronously.
        await expect
            .poll(async () => Math.abs((await settingsPaneWidth(page)) - w0))
            .toBeGreaterThan(40);

        const w1 = await settingsPaneWidth(page);
        await setSettings(page, false);
        await setSettings(page, true);
        await expect
            .poll(async () => Math.abs((await settingsPaneWidth(page)) - w1))
            .toBeLessThanOrEqual(2);
    });

    test("closing settings mid-drag ends the drag cleanly", async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on("pageerror", (err) => errors.push(err.message));
        await setSettings(page, true);

        // Start a drag but do NOT release.
        const divider = page.locator("#app_panel > .split-panel-divider");
        const box = (await divider.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 30, y);
        await expect
            .poll(() => page.evaluate(() => document.body.style.cursor))
            .toBe("col-resize");

        // Close BY CONFIGURATION mid-drag: the pane (and its divider)
        // unrender, and dropping the drag must restore the global cursor
        // WITHOUT waiting for a pointerup that may never come.
        await setSettings(page, false);
        await expect
            .poll(() => page.evaluate(() => document.body.style.cursor))
            .toBe("");

        await expect(chrome(page).dividers).toHaveCount(0);

        // The stray release must be harmless, and a fresh open + drag must
        // work end-to-end.
        await page.mouse.move(x - 60, y);
        await page.mouse.up();
        await setSettings(page, true);
        const w0 = await settingsPaneWidth(page);
        await dragDivider(page, -50);
        await expect
            .poll(async () => Math.abs((await settingsPaneWidth(page)) - w0))
            .toBeGreaterThan(20);

        expect(errors).toEqual([]);
    });
});
