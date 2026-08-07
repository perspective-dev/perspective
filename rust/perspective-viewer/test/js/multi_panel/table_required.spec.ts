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

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async () => {
        await document.querySelector("perspective-viewer")!.restore({
            plugin: "Debug",
        });
    });
});

test.describe("panel creation requires a table", () => {
    test("addPanel without a table rejects and does not mutate the layout", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const before = viewer.getPanelNames();
            let error = null;
            try {
                await viewer.addPanel({ group_by: ["State"] });
            } catch (e) {
                error = e.message ?? `${e}`;
            }

            return { error, before, after: viewer.getPanelNames() };
        });

        expect(result.error).toContain("table");
        expect(result.after).toEqual(result.before);
    });

    test("restoreWorkspace rejects a table-less panel entry", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const before = viewer.getPanelNames();
            let error = null;
            try {
                await viewer.restoreWorkspace({
                    panels: { one: { group_by: ["State"] } },
                });
            } catch (e) {
                error = e.message ?? `${e}`;
            }

            return { error, before, after: viewer.getPanelNames() };
        });

        expect(result.error).toContain("table");
        expect(result.after).toEqual(result.before);
    });

    test("restoreWorkspace with an empty panels map is the zero-panel stage", async ({
        page,
    }) => {
        const panels = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restoreWorkspace({ panels: {} });
            return viewer.getPanelNames();
        });

        expect(panels).toEqual([]);
    });
});
