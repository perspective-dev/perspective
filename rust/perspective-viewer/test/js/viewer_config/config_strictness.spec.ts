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

import { test, expect, PageView } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore-debug.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function restoreError(page, method: string, config: unknown) {
    return await page.evaluate(
        async ({ method, config }) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            try {
                await viewer[method](config);
                return null;
            } catch (e) {
                return e.message ?? `${e}`;
            }
        },
        { method, config },
    );
}

test.describe("config strictness", () => {
    test("restore accepts a valid config stamped by an older release", async ({
        page,
    }) => {
        const error = await restoreError(page, "restore", {
            version: "5.5.0",
            plugin: "Debug",
            group_by: ["State"],
        });

        expect(error).toBeNull();
    });

    test("restore rejects an unknown key", async ({ page }) => {
        const error = await restoreError(page, "restore", {
            plugin: "Debug",
            "row-pivots": ["State"],
        });

        expect(error).toContain("row-pivots");
        expect(error).not.toContain("perspective-migrate");
    });

    test("a rejected config names the release that saved it", async ({
        page,
    }) => {
        const error = await restoreError(page, "restore", {
            version: "4.4.1",
            plugin: "Debug",
            "row-pivots": ["State"],
        });

        expect(error).toContain("row-pivots");
        expect(error).toContain("4.4.1");
        expect(error).toContain("perspective-migrate");
    });

    test("restore rejects a workspace config", async ({ page }) => {
        const error = await restoreError(page, "restore", {
            layout: null,
            panels: {},
        });

        expect(error).toContain("panels");
    });

    test("restore rejects the legacy expressions array", async ({ page }) => {
        const error = await restoreError(page, "restore", {
            plugin: "Debug",
            expressions: ['"Sales" + 1'],
        });

        expect(error).not.toBeNull();
    });

    test("addPanel rejects an unknown key", async ({ page }) => {
        const error = await restoreError(page, "addPanel", {
            table: "superstore",
            selectable: true,
        });

        expect(error).toContain("selectable");
    });

    test("restoreWorkspace rejects a lumino workspace", async ({ page }) => {
        const error = await restoreError(page, "restoreWorkspace", {
            sizes: [1],
            detail: { main: null },
            viewers: {
                one: { version: "4.5.2", plugin: "Debug", table: "superstore" },
            },
        });

        expect(error).toContain("viewers");
        expect(error).toContain("4.5.2");
        expect(error).toContain("perspective-migrate");
    });

    test("restoreWorkspace names the release that saved a rejected panel", async ({
        page,
    }) => {
        const error = await restoreError(page, "restoreWorkspace", {
            layout: { type: "tab-layout", tabs: ["one"] },
            panels: {
                one: {
                    version: "5.0.0",
                    table: "superstore",
                    plugin: "Debug",
                    settings: true,
                },
            },
        });

        expect(error).toContain("settings");
        expect(error).toContain("5.0.0");
    });

    test("an unversioned date_format takes the inheriting meaning", async ({
        page,
    }) => {
        const view = new PageView(page);
        await view.restore({
            plugin: "Debug Format",
            columns: ["Order Date"],
            columns_config: {
                "Order Date": { date_format: { dateStyle: "long" } },
            },
        } as any);

        const config = (await view.save()) as any;
        expect(config.columns_config["Order Date"].date_format).toEqual({
            dateStyle: "long",
        });
    });

    test("a config saved by this build restores", async ({ page }) => {
        const error = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({ plugin: "Debug", group_by: ["State"] });
            const saved = await viewer.save();
            try {
                await viewer.restore(saved);
                return null;
            } catch (e) {
                return e.message ?? `${e}`;
            }
        });

        expect(error).toBeNull();
    });
});
