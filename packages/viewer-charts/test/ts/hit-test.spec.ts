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

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import { gotoBasic, restoreChart } from "./helpers";

async function setupChart(
    page: Page,
    config: ViewerConfigUpdate,
): Promise<void> {
    await restoreChart(page, config);
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.flush();
        (window as any).__CONTEXTS__ = [];
        viewer.setCommandSchema((context) => {
            (window as any).__CONTEXTS__.push(context);
            return { commands: [] };
        });
    });
}

async function rightClickCanvas(page: Page, fx: number, fy: number) {
    const canvas = page.locator("perspective-viewer .webgl-canvas").first();
    const box = (await canvas.boundingBox())!;
    await canvas.click({
        button: "right",
        position: { x: box.width * fx, y: box.height * fy },
    });

    await page.locator("perspective-context-menu").waitFor();
    return await page.evaluate(() => (window as any).__CONTEXTS__.at(-1));
}

test.beforeEach(async ({ page }) => {
    await gotoBasic(page);
});

test.describe("viewer-charts hit_test", () => {
    test("Y Bar: a bar reports a mark with its group path and filter", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        const { hit } = await rightClickCanvas(page, 0.25, 0.7);
        expect(hit.kind).toBe("mark");
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit.row_path).toHaveLength(1);
        expect(typeof hit.row_path[0]).toBe("string");
        expect(hit.column_path).toEqual([]);
        expect(hit.config).toEqual({
            filter: [["Category", "==", hit.row_path[0]]],
        });

        expect(typeof hit.row).toBe("object");
    });

    test("Treemap: a leaf reports a mark with its group path", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Treemap",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        const { hit } = await rightClickCanvas(page, 0.5, 0.5);
        expect(hit.kind).toBe("mark");
        expect(hit.column_names).toEqual(["Sales"]);
        expect(hit.row_path).toHaveLength(1);
        expect(hit.config).toEqual({
            filter: [["Category", "==", hit.row_path[0]]],
        });
    });

    test("Y Bar: the axis margin reports no hit", async ({ page }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        const context = await rightClickCanvas(page, 0.5, 0.995);
        expect("hit" in context).toBe(false);
    });

    test("a right-click does not emit perspective-click", async ({ page }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        await page.evaluate(() => {
            const viewer = document.querySelector("perspective-viewer")!;
            (window as any).__CLICKS__ = 0;
            viewer.addEventListener("perspective-click", () => {
                (window as any).__CLICKS__ += 1;
            });
        });

        await rightClickCanvas(page, 0.25, 0.7);
        expect(await page.evaluate(() => (window as any).__CLICKS__)).toBe(0);
    });
});
