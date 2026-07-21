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

import type { ConsoleMessage, Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import {
    assertPlotNeverBlank,
    calibratePlotBaseline,
    captureFrames,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

const SCATTER = {
    plugin: "X/Y Scatter",
    columns: ["Quantity", "Postal Code"],
};

const TABLE_NAME = "load-viewer-csv";
const TOGGLE_COUNT = 12;

function collectLeakErrors(page: Page): string[] {
    const hits: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
        hits.push(m.text());
    });

    page.on("pageerror", (e: Error) => {
        hits.push(String(e));
    });

    return hits;
}

async function toggleSecondViewer(page: Page, cfg: object): Promise<void> {
    await page.evaluate(
        async ({ cfg, tableName }) => {
            const worker = (window as any).__TEST_WORKER__;
            const v = document.createElement("perspective-viewer");
            document.body.appendChild(v);
            await v.load(worker);
            await v.restore({ ...(cfg as any), table: tableName });
        },
        { cfg, tableName: TABLE_NAME },
    );

    await waitOneFrame(page);
    await waitOneFrame(page);
    await page.evaluate(() => {
        document.querySelector("perspective-viewer[data-toggle]")?.remove();
    });
}

async function toggleSecondViewerRacingInit(
    page: Page,
    cfg: object,
): Promise<void> {
    await page.evaluate(
        async ({ cfg, tableName }) => {
            const worker = (window as any).__TEST_WORKER__;
            const v = document.createElement("perspective-viewer");
            document.body.appendChild(v);
            await v.load(worker);
            v.restore({ ...(cfg as any), table: tableName }).catch(() => {});
            await new Promise<void>((resolve) =>
                setTimeout(() => {
                    v.remove();
                    resolve();
                }, 0),
            );
        },
        { cfg, tableName: TABLE_NAME },
    );

    await waitOneFrame(page);
}

test.describe("WebGL context leak", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
        await restoreChart(page, SCATTER);
    });

    test("repeated full toggles never evict the first chart's context", async ({
        page,
    }) => {
        // test.setTimeout(180_000);
        const leakErrors = collectLeakErrors(page);
        const baseline = await calibratePlotBaseline(page);
        expect(baseline).toBeGreaterThan(0);
        const threshold = Math.max(1, Math.floor(baseline * 0.5));
        for (let i = 0; i < TOGGLE_COUNT; i++) {
            await toggleSecondViewer(page, SCATTER);
        }

        // Force the first viewer to re-render through its own renderer.
        // If its context had been evicted by a leak, the worker can no
        // longer paint it and the plot region comes back blank.
        await restoreChart(page, SCATTER);
        const frames = await captureFrames(page, async () => {
            await waitOneFrame(page);
            await waitOneFrame(page);
        });

        assertPlotNeverBlank(frames, threshold);
        expect(leakErrors).toEqual([]);
    });

    test("toggling during renderer init never leaks a context", async ({
        page,
    }) => {
        // test.setTimeout(180_000);
        const leakErrors = collectLeakErrors(page);
        const baseline = await calibratePlotBaseline(page);
        expect(baseline).toBeGreaterThan(0);
        const threshold = Math.max(1, Math.floor(baseline * 0.5));
        for (let i = 0; i < TOGGLE_COUNT; i++) {
            await toggleSecondViewerRacingInit(page, SCATTER);
        }

        await restoreChart(page, SCATTER);
        const frames = await captureFrames(page, async () => {
            await waitOneFrame(page);
            await waitOneFrame(page);
        });

        assertPlotNeverBlank(frames, threshold);
        expect(leakErrors).toEqual([]);
    });
});
