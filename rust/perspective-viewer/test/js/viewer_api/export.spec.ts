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

async function load(page) {
    await page.goto("/rust/perspective-viewer/test/html/blank.html");
    await page.waitForFunction(() => "WORKER" in window);
    const viewer = page.locator("perspective-viewer");
    await viewer.evaluate(async (viewer) => {
        const table = (await window.WORKER).table("a,b,c\n1,2,3\n4,5,6");
        await viewer.load(table);
        await viewer.flush();
    });
    return viewer;
}

test.describe("Viewer Export", () => {
    test("export > defaults to CSV", async ({ page }) => {
        const viewer = await load(page);
        const result = await viewer.evaluate((viewer) => viewer.export());
        expect(typeof result).toBe("string");
        expect(result).toBe('"a","b","c"\n1,2,3\n4,5,6\n');
    });

    test("export > csv method", async ({ page }) => {
        const viewer = await load(page);
        const result = await viewer.evaluate((viewer) =>
            viewer.export({ method: "csv" }),
        );
        expect(result).toBe('"a","b","c"\n1,2,3\n4,5,6\n');
    });

    test("export > json method", async ({ page }) => {
        const viewer = await load(page);
        const result = await viewer.evaluate(async (viewer) =>
            JSON.stringify(await viewer.export({ method: "json" })),
        );

        const parsed = JSON.parse(result as string);
        expect(parsed).toEqual({ a: [1, 4], b: [2, 5], c: [3, 6] });
    });

    test("export > ndjson method", async ({ page }) => {
        const viewer = await load(page);
        const result = await viewer.evaluate((viewer) =>
            viewer.export({ method: "ndjson" }),
        );

        const lines = (result as string)
            .trim()
            .split("\n")
            .map((l) => JSON.parse(l));

        expect(lines).toEqual([
            { a: 1, b: 2, c: 3 },
            { a: 4, b: 5, c: 6 },
        ]);
    });

    test("export > arrow method returns ArrayBuffer", async ({ page }) => {
        const viewer = await load(page);
        const byteLength = await viewer.evaluate(async (viewer) => {
            const result = await viewer.export({ method: "arrow" });
            return (result as ArrayBuffer).byteLength;
        });

        expect(byteLength).toBeGreaterThan(0);
    });
});

test.describe("Viewer Export UTF8", () => {
    test("export > json to csv round-trip", async ({ page }) => {
        await page.goto("/rust/perspective-viewer/test/html/blank.html");
        await page.waitForFunction(() => "WORKER" in window);
        const viewer = page.locator("perspective-viewer");
        await viewer.evaluate(async (viewer) => {
            const table = (await window.WORKER).table([
                {
                    年月: "2023/01/01",
                    轄區分局: "第四分局",
                    路口名稱: "南屯區",
                    路口名稱split: "五權西路與環中路口",
                    A1: 0.0,
                    A2: 3.0,
                    A3: 130.0,
                    總件數: 18.0,
                    死亡人數: 0.0,
                    受傷人數: null,
                    主要肇因: "未注意車前狀態",
                },
                {
                    年月: "2023/01/01",
                    轄區分局: "第六分局",
                    路口名稱: "西屯區",
                    路口名稱split: "中清聯絡道與環中路口",
                    A1: 0.0,
                    A2: 2.0,
                    A3: 100.0,
                    總件數: 15.0,
                    死亡人數: 0.0,
                    受傷人數: null,
                    主要肇因: "未注意車前狀態",
                },
            ]);

            await viewer.load(table);
            await viewer.flush();
        });

        const result = await viewer.evaluate((viewer) =>
            viewer.export({ method: "csv" }),
        );
        expect(result).toBe(
            `"年月","轄區分局","路口名稱","路口名稱split","A1","A2","A3","總件數","死亡人數","主要肇因","受傷人數"\n2023-01-01,"第四分局","南屯區","五權西路與環中路口",0,3,130,18,0,"未注意車前狀態",\n2023-01-01,"第六分局","西屯區","中清聯絡道與環中路口",0,2,100,15,0,"未注意車前狀態",\n`,
        );
    });
});
