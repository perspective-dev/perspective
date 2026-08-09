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
import { armInvariants } from "./harness.ts";

const TABLE = "load-viewer-csv";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

async function record(page) {
    await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        const log: { type: string; detail: any }[] = [];
        window["__LAYOUT_LOG__"] = log;
        for (const type of [
            "perspective-layout-update",
            "perspective-active-panel-update",
        ]) {
            viewer.addEventListener(type, (e: Event) =>
                log.push({ type, detail: (e as CustomEvent).detail }),
            );
        }
    });
}

async function drain(page) {
    await page.evaluate(async () => {
        // @ts-ignore
        await document.querySelector("perspective-viewer")!.flush();
        await new Promise((x) => setTimeout(x, 50));
    });
}

async function layoutEvents(page) {
    return page.evaluate(() =>
        (window["__LAYOUT_LOG__"] ?? []).filter(
            (e) => e.type === "perspective-layout-update",
        ),
    );
}

async function activeEvents(page) {
    return page.evaluate(() =>
        (window["__LAYOUT_LOG__"] ?? []).filter(
            (e) => e.type === "perspective-active-panel-update",
        ),
    );
}

async function panelNames(page): Promise<string[]> {
    return page.evaluate(() =>
        // @ts-ignore
        document.querySelector("perspective-viewer")!.getPanelNames(),
    );
}

async function activePanel(page): Promise<string | null> {
    return page.evaluate(() =>
        // @ts-ignore
        document.querySelector("perspective-viewer")!.getActivePanel(),
    );
}

test.describe("layout events", () => {
    test("addPanel fires one layout-update matching getPanelNames", async ({
        page,
    }) => {
        await record(page);
        await page.evaluate(async (table) => {
            // @ts-ignore
            await document.querySelector("perspective-viewer")!.addPanel({
                table,
                title: "Added",
            });
        }, TABLE);

        await drain(page);
        const events = await layoutEvents(page);
        expect(events).toHaveLength(1);
        expect(events[0].detail.panels).toEqual(await panelNames(page));
    });

    test("removePanel fires one layout-update, empty at zero panels", async ({
        page,
    }) => {
        const ids = await panelNames(page);
        await record(page);
        await page.evaluate(async (id) => {
            // @ts-ignore
            await document.querySelector("perspective-viewer")!.removePanel(id);
        }, ids[0]);

        await drain(page);
        const events = await layoutEvents(page);
        expect(events).toHaveLength(1);
        expect(events[0].detail.panels).toEqual([]);
        expect(await panelNames(page)).toEqual([]);
    });

    test("restoreWorkspace coalesces to exactly one event", async ({
        page,
    }) => {
        await page.evaluate(async (table) => {
            // @ts-ignore
            await document
                .querySelector("perspective-viewer")!
                .restoreWorkspace({
                    layout: {
                        type: "tab-layout",
                        tabs: ["a", "b", "c"],
                        selected: 0,
                    },
                    panels: {
                        a: { table },
                        b: { table },
                        c: { table },
                    },
                });
        }, TABLE);

        await drain(page);
        await record(page);

        await page.evaluate(async (table) => {
            // @ts-ignore
            await document
                .querySelector("perspective-viewer")!
                .restoreWorkspace({
                    layout: {
                        type: "tab-layout",
                        tabs: ["x", "y"],
                        selected: 0,
                    },
                    panels: { x: { table }, y: { table } },
                });
        }, TABLE);

        await drain(page);
        const events = await layoutEvents(page);
        expect(events).toHaveLength(1);
        expect(events[0].detail.panels).toHaveLength(2);
    });

    test("an inert load(client) places no panel and fires no event", async ({
        page,
    }) => {
        await page.evaluate(async () => {
            // @ts-ignore
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            for (const id of viewer.getPanelNames()) {
                // @ts-ignore
                await viewer.removePanel(id);
            }
        });

        await drain(page);
        await record(page);
        await page.evaluate(async () => {
            const worker = (window as any).__TEST_WORKER__;
            // @ts-ignore
            await document.querySelector("perspective-viewer")!.load(worker);
        });

        await drain(page);
        expect(await layoutEvents(page)).toHaveLength(0);
        expect(await panelNames(page)).toEqual([]);
    });

    test("setActivePanel fires active-panel-update and NOT layout-update", async ({
        page,
    }) => {
        const first = (await panelNames(page))[0];
        const second = await page.evaluate(async (table) => {
            // @ts-ignore
            return document.querySelector("perspective-viewer")!.addPanel({
                table,
                title: "Second",
            });
        }, TABLE);

        await drain(page);
        expect(await activePanel(page)).toEqual(first);
        await record(page);
        await page.evaluate(async (id) => {
            // @ts-ignore
            await document
                .querySelector("perspective-viewer")!
                .setActivePanel(id);
        }, second);

        await drain(page);
        expect(await layoutEvents(page)).toHaveLength(0);
        const active = await activeEvents(page);
        expect(active).toHaveLength(1);
        expect(active[0].detail.panel).toEqual(second);
    });

    test("re-entrant addPanel from a handler does not panic", async ({
        page,
    }) => {
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            let reentered = false;
            viewer.addEventListener("perspective-layout-update", () => {
                if (!reentered) {
                    reentered = true;
                    // @ts-ignore
                    viewer.addPanel({ table, title: "Reentrant" });
                }
            });

            // @ts-ignore
            await viewer.addPanel({ table, title: "Outer" });
        }, TABLE);

        await drain(page);
        const names = await panelNames(page);
        expect(names.length).toBeGreaterThanOrEqual(3);
    });
});
