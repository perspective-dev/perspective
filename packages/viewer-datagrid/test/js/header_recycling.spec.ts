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

// regular-table recycles header `<th>` elements across roles when the
// header row count changes. Stale role classes must be cleared by whichever
// style pass claims the recycled cell - regression coverage for the
// menu-row classes bleeding into group header rows (visible as menu-button
// styling on group cells' content spans).

import { test, expect } from "@perspective-dev/test";
import type { Page } from "@playwright/test";

async function await_ready(page: Page): Promise<void> {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

test.describe("header th recycling", () => {
    test("menu-row classes do not leak into group header rows", async ({
        page,
    }) => {
        await await_ready(page);
        const restore = async (config: Record<string, unknown>) =>
            await page.evaluate(async (config) => {
                const viewer = document.querySelector(
                    "perspective-viewer",
                )! as any;
                await viewer.restore(config);
                await viewer.flush();
            }, config);

        // With settings open, grow `split_by` by 2 in one step: the menu
        // row's `<th>`s (which carry `psp-menu-enabled`) are recycled into
        // a group header row.
        await restore({
            plugin: "Datagrid",
            columns: ["Sales", "Profit"],
            group_by: ["Region"],
            split_by: ["Category"],
            settings: true,
        });
        await restore({
            settings: true,
            split_by: ["Category", "Ship Mode", "Segment"],
        });

        const leaked = await page.evaluate(() => {
            const datagrid = document
                .querySelector("perspective-viewer")!
                .querySelector("perspective-viewer-datagrid") as any;
            return Array.from(
                datagrid.shadowRoot.querySelectorAll(
                    "regular-table thead .psp-header-group",
                ),
            )
                .filter(
                    (el: any) =>
                        el.classList.contains("psp-menu-enabled") ||
                        el.classList.contains("psp-menu-open"),
                )
                .map((el: any) => el.className);
        });

        expect(leaked).toStrictEqual([]);
    });
});
