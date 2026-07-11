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

// Regression spec for the STUCK "updating" spinner

import { test, expect } from "@perspective-dev/test";
import { PageView } from "@perspective-dev/test";
import type { Page } from "@playwright/test";
import { INACTIVE_DRAG, localDrag } from "../dragdrop/dragdrop_test_utils";

const TABLE = "load-viewer-csv";

async function goto(page: Page, path: string) {
    await page.goto(path);
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

async function open_settings(page: Page, selector = "perspective-viewer") {
    await page.evaluate(async (sel) => {
        await (document.querySelector(sel) as any).toggleConfig(true);
    }, selector);
}

async function assert_settled(page: Page, selector = "perspective-viewer") {
    await page.evaluate(async (sel) => {
        await (document.querySelector(sel) as any).flush();
    }, selector);

    const status = page.locator(`${selector} #status_reconnect`);
    await expect(status).not.toHaveClass(/updating/);
    await page.waitForTimeout(400);
    await expect(status).not.toHaveClass(/updating/);
}

test.describe("StatusIndicator 'updating' settles", () => {
    test("after a drag/drop config commit (T1)", async ({ page }) => {
        await goto(
            page,
            "/rust/perspective-viewer/test/html/column-settings-enabled.html",
        );
        const view = new PageView(page);
        await view.restore({ settings: true, columns: ["Sales", "Profit"] });

        const configUpdated = await view.getEventListener(
            "perspective-config-update",
        );
        const source = view.container.locator(INACTIVE_DRAG).first();
        const target = view.container.locator("#group_by");
        await localDrag(page, source, target);
        await configUpdated();

        const config = await view.save();
        expect(config.group_by).toEqual(["Category"]);
        await assert_settled(page);
    });

    test("after a burst of un-awaited config commits (T2)", async ({
        page,
    }) => {
        await goto(page, "/rust/perspective-viewer/test/html/superstore.html");
        await open_settings(page);
        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const groups = ["State", "City", "Region", "Category"];
            for (let i = 0; i < 8; i++) {
                void viewer.restore({ group_by: [groups[i % groups.length]] });
            }
        });

        await assert_settled(page);
    });

    test("after a deferred-draw restore, before and after load (T3)", async ({
        page,
    }) => {
        await goto(page, "/rust/perspective-viewer/test/html/superstore.html");
        await page.evaluate(async () => {
            const viewer = document.createElement("perspective-viewer") as any;
            viewer.setAttribute("id", "deferred");
            viewer.style.cssText =
                "position:absolute;top:0;left:0;width:400px;height:300px;";
            document.body.appendChild(viewer);
            await viewer.restore({ group_by: ["State"] });
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("#deferred") as any;
            const table = await (window as any).__TEST_WORKER__.table(
                "x,y\n1,2\n3,4",
                { name: "deferred-table" },
            );
            await viewer.load(table);
        });

        await open_settings(page, "#deferred");
        await assert_settled(page, "#deferred");
    });

    test("after a table-binding restore (commit_table_defaults) (T4)", async ({
        page,
    }) => {
        await goto(page, "/rust/perspective-viewer/test/html/superstore.html");
        await open_settings(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ table, group_by: ["State"] });
        }, TABLE);

        await assert_settled(page);
    });

    test("across panel switches (T5)", async ({ page }) => {
        await goto(page, "/rust/perspective-viewer/test/html/superstore.html");
        await open_settings(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.addPanel({ table, group_by: ["Region"] });
        }, TABLE);

        const names = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return viewer.getPanelNames();
        });

        for (const name of [names[1], names[0], names[1]]) {
            await page.evaluate(
                (name) =>
                    (
                        document.querySelector("perspective-viewer") as any
                    ).setActivePanel(name),
                name,
            );
            await assert_settled(page);
        }
    });

    test("after an errored run is reset (T6)", async ({ page }) => {
        await goto(page, "/rust/perspective-viewer/test/html/superstore.html");
        await open_settings(page);
        const status = page.locator("perspective-viewer #status_reconnect");
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            try {
                await viewer.restore({
                    expressions: { broken: 'upper("Sales")' },
                });
            } catch {
                // The restore run fails; error state is the expectation.
            }
        });

        await expect(status).toHaveClass(/errored/, { timeout: 10_000 });
        await assert_settled(page);
    });

    test("a hidden (paused) commit still dispatches config-update and flush resolves (T7)", async ({
        page,
    }) => {
        await goto(page, "/rust/perspective-viewer/test/html/superstore.html");
        await open_settings(page);
        const view = new PageView(page);
        const configUpdated = await view.getEventListener(
            "perspective-config-update",
            { timeout: 10_000 },
        );

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            viewer.style.display = "none";
            await new Promise((x) => setTimeout(x, 100));
            await viewer.restore({ group_by: ["Region"] });
        });

        expect(await configUpdated()).toBe(true);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.flush();
            viewer.style.display = "";
        });

        await assert_settled(page);
    });

    test("a view-SKIP commit still dispatches config-update (T8)", async ({
        page,
    }) => {
        await goto(page, "/rust/perspective-viewer/test/html/superstore.html");
        await open_settings(page);
        const view = new PageView(page);
        await view.restore({ group_by: ["State"], title: "A" });
        await assert_settled(page);
        const configUpdated = await view.getEventListener(
            "perspective-config-update",
            { timeout: 10_000 },
        );
        await view.restore({ group_by: ["State"], title: "B" });
        expect(await configUpdated()).toBe(true);
        expect((await view.save()).title).toBe("B");
        await assert_settled(page);
    });
});
