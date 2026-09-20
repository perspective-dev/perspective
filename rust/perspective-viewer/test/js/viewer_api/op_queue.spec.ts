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

test.describe("op queue", () => {
    test("unawaited restores land in call order", async ({ page }) => {
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const first = viewer.restore({ group_by: ["State"] });
            const second = viewer.restore({ split_by: ["Category"] });
            const third = viewer.restore({ group_by: ["Region"] });
            await Promise.all([first, second, third]);
            return await viewer.save();
        });

        expect(config.group_by).toEqual(["Region"]);
        expect(config.split_by).toEqual(["Category"]);
    });

    test("a restore covered by a later one resolves with it", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const first = viewer.restore({ group_by: ["State"] });
            const second = viewer.restore({
                group_by: ["Region"],
                sort: [["Sales", "desc"]],
            });

            const settled = await Promise.allSettled([first, second]);
            const config = await viewer.save();
            return {
                statuses: settled.map((x) => x.status),
                group_by: config.group_by,
                sort: config.sort,
            };
        });

        expect(result.statuses).toEqual(["fulfilled", "fulfilled"]);
        expect(result.group_by).toEqual(["Region"]);
        expect(result.sort).toEqual([["Sales", "desc"]]);
    });

    test("a covering restore that fails rejects the one it covered", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const before = await viewer.save();
            const first = viewer.restore(
                { group_by: ["State"] },
                { suppress_errors: true },
            );

            const second = viewer.restore(
                { group_by: ["Not A Column"] },
                { suppress_errors: true },
            );

            const settled = await Promise.allSettled([first, second]);
            const after = await viewer.save();
            return {
                statuses: settled.map((x) => x.status),
                before: before.group_by,
                after: after.group_by,
            };
        });

        expect(result.statuses).toEqual(["rejected", "rejected"]);
        expect(result.after).toEqual(result.before);
    });

    test("restores with partially overlapping fields both apply", async ({
        page,
    }) => {
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const first = viewer.restore({
                group_by: ["State"],
                sort: [["Sales", "desc"]],
            });

            const second = viewer.restore({
                group_by: ["Region"],
                split_by: ["Category"],
            });

            await Promise.all([first, second]);
            return await viewer.save();
        });

        expect(config.group_by).toEqual(["Region"]);
        expect(config.split_by).toEqual(["Category"]);
        expect(config.sort).toEqual([["Sales", "desc"]]);
    });

    test("a restore made during a slow load applies after it", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const table = await viewer.getTable();
            let release: (x: unknown) => void = () => {};
            const slow = new Promise((resolve) => {
                release = resolve;
            });

            const order: string[] = [];
            const load = viewer.load(slow).then(() => order.push("load"));
            const restore = viewer
                .restore({ group_by: ["State"] })
                .then(() => order.push("restore"));

            await new Promise((x) => setTimeout(x, 50));
            const pending = order.length;
            release(table);
            await Promise.all([load, restore]);
            const config = await viewer.save();
            return { pending, order, group_by: config.group_by };
        });

        expect(result.pending).toBe(0);
        expect(result.order).toEqual(["load", "restore"]);
        expect(result.group_by).toEqual(["State"]);
    });

    test("a later load supersedes an earlier one that has not resolved", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const table = await viewer.getTable();
            let release: (x: unknown) => void = () => {};
            const slow = new Promise((resolve) => {
                release = resolve;
            });

            const first = viewer.load(slow);
            const second = viewer.load(table);
            release(table);
            const settled = await Promise.allSettled([first, second]);
            const loaded = await viewer.getTable();
            return {
                statuses: settled.map((x) => x.status),
                same: (await loaded.get_name()) === (await table.get_name()),
            };
        });

        expect(result.statuses).toEqual(["fulfilled", "fulfilled"]);
        expect(result.same).toBe(true);
    });

    test("every commit a restore or load makes is described before it renders", async ({
        page,
    }) => {
        const warnings: string[] = [];
        page.on("console", (msg) => {
            if (msg.text().includes("was not described")) {
                warnings.push(msg.text());
            }
        });

        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const table = await viewer.getTable();
            await viewer.restore({
                group_by: ["State"],
                columns: ["Sales", "x"],
                expressions: { x: '"Sales" * 2' },
            });

            await viewer.restore({ plugin: "Debug", split_by: ["Category"] });
            await viewer.load(table);
            await viewer.restore({ group_by: ["Region"] });
            await viewer.flush();
        });

        expect(warnings).toEqual([]);
    });

    test("the busy indicator is on while an op is queued and off once it settles", async ({
        page,
    }) => {
        const indicator = page.locator(
            "perspective-viewer span#status_updating",
        );
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({ settings: true });
            const table = await viewer.getTable();
            const slow = new Promise((resolve) => {
                (window as any).__RELEASE__ = () => resolve(table);
            });

            (window as any).__LOAD__ = viewer.load(slow);
        });

        await expect(indicator).toHaveClass(/updating/);
        await page.evaluate(async () => {
            (window as any).__RELEASE__();
            await (window as any).__LOAD__;
            await (
                document.querySelector("perspective-viewer")! as any
            ).flush();
        });

        await expect(indicator).not.toHaveClass(/updating/);
    });
});
