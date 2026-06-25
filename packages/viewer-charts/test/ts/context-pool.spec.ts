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
    calibrateAllBaselines,
    gotoBasic,
    restoreChart,
    waitOneFrame,
} from "./helpers";

const SCATTER = {
    plugin: "X/Y Scatter",
    columns: ["Quantity", "Postal Code"],
};

const TABLE_NAME = "load-viewer-csv";

const VIEWER_COUNT = 18;

const LEAK_SIGNATURE =
    /too many active webgl contexts|context is lost|present failed|transferToImageBitmap/i;

function collectLeakErrors(page: Page): string[] {
    const hits: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
        if (LEAK_SIGNATURE.test(m.text())) {
            hits.push(m.text());
        }
    });

    page.on("pageerror", (e: Error) => {
        if (LEAK_SIGNATURE.test(String(e))) {
            hits.push(String(e));
        }
    });

    return hits;
}

test.describe("Pooled blit WebGL contexts", () => {
    test("more simultaneous charts than the context cap all render", async ({
        page,
    }) => {
        test.setTimeout(240_000);
        await gotoBasic(page);
        const leakErrors = collectLeakErrors(page);

        await restoreChart(page, SCATTER);
        await page.evaluate(() => {
            const plugin = (
                document.querySelector("perspective-viewer") as any
            ).getPlugin();
            plugin.constructor.setBlitMode("blit");
            plugin.delete();
        });
        await restoreChart(page, SCATTER);

        for (let i = 1; i < VIEWER_COUNT; i++) {
            await page.evaluate(
                async ({ cfg, tableName }) => {
                    const worker = (window as any).__TEST_WORKER__;
                    const table = await worker.open_table(tableName);
                    const v = document.createElement("perspective-viewer");
                    document.body.appendChild(v);
                    await (v as any).load(table);
                    await (v as any).restore(cfg);
                },
                { cfg: SCATTER, tableName: TABLE_NAME },
            );
        }

        await waitOneFrame(page);
        await waitOneFrame(page);

        const baselines = await calibrateAllBaselines(page);
        expect(baselines.length).toBe(VIEWER_COUNT);
        const ref = Math.max(...baselines);
        expect(ref).toBeGreaterThan(0);

        for (let i = 0; i < baselines.length; i++) {
            expect(
                baselines[i],
                `viewer ${i} of ${VIEWER_COUNT} rendered ${baselines[i]} ` +
                    `plot pixels (ref ${ref}) — likely an evicted context`,
            ).toBeGreaterThanOrEqual(ref * 0.5);
        }

        expect(leakErrors).toEqual([]);
    });
});
