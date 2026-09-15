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

async function getViewError(page, options): Promise<string | null> {
    return await page.evaluate(async (options) => {
        const viewer = document.querySelector("perspective-viewer") as any;
        try {
            await viewer.getView(options);
            return null;
        } catch (e) {
            return e.message ?? String(e);
        }
    }, options);
}

async function hideUntilPaused(page): Promise<void> {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        viewer.style.display = "none";
        for (let i = 0; i < 200; i++) {
            try {
                await viewer.getView();
            } catch (e) {
                return;
            }

            await new Promise((x) => setTimeout(x, 10));
        }

        throw new Error("Viewer never paused");
    });
}

test.describe("getView modes", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/rust/perspective-viewer/test/html/superstore.html");
        await page.evaluate(async () => {
            while (!window["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ plugin: "Debug", group_by: ["Region"] });
            await viewer.flush();
        });
    });

    test("live is the default and reads the bound View", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const view = await viewer.getView();
            const live = await viewer.getView({ mode: "live" });
            return {
                rows: await view.num_rows(),
                group_by: (await live.get_config()).group_by,
            };
        });

        expect(result.rows).toBeGreaterThan(0);
        expect(result.group_by).toEqual(["Region"]);
    });

    test("unknown panel rejects with the panel name", async ({ page }) => {
        expect(await getViewError(page, { panel: "nope" })).toBe(
            'No panel named "nope"',
        );
    });

    test("live rejects with the panel name while auto-paused", async ({
        page,
    }) => {
        await hideUntilPaused(page);
        const id = await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return viewer.getActivePanel();
        });

        expect(await getViewError(page, { mode: "live" })).toBe(
            `No View for panel "${id}"`,
        );

        expect(await getViewError(page, { panel: id })).toBe(
            `No View for panel "${id}"`,
        );
    });

    test("clone resolves while auto-paused with the panel's config", async ({
        page,
    }) => {
        await hideUntilPaused(page);
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const view = await viewer.getView({ mode: "clone" });
            const config = await view.get_config();
            const rows = await view.num_rows();
            await view.delete();
            return { rows, group_by: config.group_by };
        });

        expect(result.rows).toBeGreaterThan(0);
        expect(result.group_by).toEqual(["Region"]);
    });

    test("auto falls back to a clone while auto-paused and to live when visible", async ({
        page,
    }) => {
        await hideUntilPaused(page);
        const paused = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const view = await viewer.getView({ mode: "auto" });
            const rows = await view.num_rows();
            await view.delete();
            return rows;
        });

        expect(paused).toBeGreaterThan(0);
        const visible = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            viewer.style.display = "";
            for (let i = 0; i < 200; i++) {
                try {
                    await viewer.getView({ mode: "live" });
                    break;
                } catch (e) {
                    await new Promise((x) => setTimeout(x, 10));
                }
            }

            await viewer.flush();
            const auto = await viewer.getView({ mode: "auto" });
            const live = await viewer.getView({ mode: "live" });
            return {
                rows: await auto.num_rows(),
                same:
                    (await auto.get_config()).group_by.join() ===
                    (await live.get_config()).group_by.join(),
            };
        });

        expect(visible.rows).toBeGreaterThan(0);
        expect(visible.same).toBe(true);
    });

    test("clone survives a restore that rebuilds the live View", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const live = await viewer.getView({ mode: "live" });
            const clone = await viewer.getView({ mode: "clone" });
            await viewer.restore({ group_by: ["State"] });
            await viewer.flush();
            let live_error = null;
            try {
                await live.num_rows();
            } catch (e) {
                live_error = e.message ?? String(e);
            }

            const clone_config = await clone.get_config();
            const clone_rows = await clone.num_rows();
            await clone.delete();
            return {
                live_error,
                clone_rows,
                clone_group_by: clone_config.group_by,
            };
        });

        expect(result.live_error).not.toBeNull();
        expect(result.clone_rows).toBeGreaterThan(0);
        expect(result.clone_group_by).toEqual(["Region"]);
    });

    test("clone applies the element's global filter", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const all = await viewer.getView({ mode: "clone" });
            const all_rows = await all.num_rows();
            await all.delete();
            await viewer.restoreWorkspace({
                global_filters: [["Region", "==", "West"]],
            });
            await viewer.flush();
            const filtered = await viewer.getView({ mode: "clone" });
            const config = await filtered.get_config();
            const filtered_rows = await filtered.num_rows();
            await filtered.delete();
            return { all_rows, filtered_rows, filter: config.filter };
        });

        expect(result.filtered_rows).toBeLessThan(result.all_rows);
        expect(result.filter).toEqual([["Region", "==", "West"]]);
    });
});
