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
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import { expect, test } from "@perspective-dev/test";
import {
    calibratePlotBaseline,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

const UPLOAD_CRASH = /loadAndRender failed|reading 'axis'|reading 'chartType'/i;

const EMPTY_FILTER: [string, string, number][] = [["Row ID", "<", 0]];

const PLAIN_CONFIG: ViewerConfigUpdate = {
    plugin: "Y Line",
    columns: ["Profit"],
    group_by: ["Order Date"],
};

const SPLIT_CONFIG: ViewerConfigUpdate = {
    plugin: "Y Bar",
    columns: ["Profit", "Sales"],
    group_by: ["Order Date"],
    split_by: ["Ship Mode"],
};

function collectUploadCrashes(page: Page): string[] {
    const hits: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
        if (UPLOAD_CRASH.test(m.text())) {
            hits.push(m.text());
        }
    });

    page.on("pageerror", (e: Error) => {
        if (UPLOAD_CRASH.test(String(e))) {
            hits.push(String(e));
        }
    });

    return hits;
}

test.describe("empty view (regression)", () => {
    test.beforeEach(async ({ page }) => {
        await gotoBasic(page);
    });

    for (const [name, config] of [
        ["plain", PLAIN_CONFIG],
        ["split", SPLIT_CONFIG],
    ] as const) {
        test(`${name} chart draws an empty-filtered view without crashing`, async ({
            page,
        }) => {
            const errors = collectUploadCrashes(page);
            await restoreChart(page, { ...config, filter: EMPTY_FILTER });
            await waitOneFrame(page);
            expect(errors).toEqual([]);
        });

        test(`${name} chart recovers when the empty filter is relaxed`, async ({
            page,
        }) => {
            const errors = collectUploadCrashes(page);
            await restoreChart(page, { ...config, filter: [] });
            await restoreChart(page, { ...config, filter: EMPTY_FILTER });
            await restoreChart(page, { ...config, filter: [] });
            const pixels = await calibratePlotBaseline(page);
            expect(pixels).toBeGreaterThan(0);
            expect(errors).toEqual([]);
            const saved = await page.evaluate(async () => {
                const viewer = document.querySelector("perspective-viewer")!;
                return await (viewer as any).save();
            });
            expect(saved.plugin).toEqual(config.plugin);
        });
    }
});
