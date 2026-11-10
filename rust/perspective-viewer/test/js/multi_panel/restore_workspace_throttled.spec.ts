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
import { test, expect } from "../helpers.ts";
import { armInvariants, treeSlots, type LayoutTree } from "./harness.ts";

const TABLE = "load-viewer-csv";
const THROTTLE_RATE = 8;
const STACKS = 4;
const PER_STACK = 3;

function workspace(prefix: string) {
    const names = Array.from(
        { length: STACKS * PER_STACK },
        (_, i) => `${prefix}-${i}`,
    );

    const layout: LayoutTree = {
        type: "split-layout",
        orientation: "horizontal",
        sizes: Array(STACKS).fill(1 / STACKS),
        children: Array.from({ length: STACKS }, (_, i) => ({
            type: "tab-layout",
            tabs: names.slice(i * PER_STACK, (i + 1) * PER_STACK),
            selected: 0,
        })),
    };

    return {
        layout,
        panels: Object.fromEntries(
            names.map((id) => [
                id,
                {
                    table: TABLE,
                    title: id,
                    plugin: "Debug",
                    group_by: ["Region"],
                    columns: ["Sales"],
                },
            ]),
        ),
    };
}

async function throttle(page: Page, rate: number) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    return cdp;
}

function collect_errors(page: Page) {
    const errors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            errors.push(msg.text());
        }
    });

    page.on("pageerror", (error) => errors.push(error.message));
    return errors;
}

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

test.describe("restoreWorkspace under CPU throttling", () => {
    test.skip(
        ({ browserName }) => browserName !== "chromium",
        "CDP CPU throttling is a Chromium-only API",
    );

    test("restoreWorkspace right after load() keeps every panel", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        const errors = collect_errors(page);
        const cdp = await throttle(page, THROTTLE_RATE);
        const expected = workspace("panel");
        const result = await page.evaluate(async (config) => {
            const worker = (window as any).__TEST_WORKER__;
            const viewer = document.createElement("perspective-viewer") as any;
            document.body.appendChild(viewer);
            await viewer.load(worker);
            let error: string | null = null;
            try {
                await viewer.restoreWorkspace(config, {
                    wait_for_table: false,
                });
            } catch (e) {
                error = String(e);
            }

            await viewer.flush();
            const saved = await viewer.saveWorkspace();
            return {
                error,
                names: viewer.getPanelNames(),
                panels: Object.keys(saved.panels),
                layout: saved.layout,
            };
        }, expected);

        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        expect(result.error).toBeNull();
        expect(result.names.sort()).toEqual(
            Object.keys(expected.panels).sort(),
        );

        expect(result.panels.sort()).toEqual(
            Object.keys(expected.panels).sort(),
        );

        expect(treeSlots(result.layout)).toEqual(treeSlots(expected.layout));
        expect(errors.filter((e) => e.includes("Panel disposed"))).toEqual([]);
    });

    test("a second restoreWorkspace replaces every panel", async ({ page }) => {
        test.setTimeout(120_000);
        const errors = collect_errors(page);
        const cdp = await throttle(page, THROTTLE_RATE);
        const first = workspace("first");
        const second = workspace("second");
        const result = await page.evaluate(
            async ([first, second]) => {
                const worker = (window as any).__TEST_WORKER__;
                const viewer = document.createElement(
                    "perspective-viewer",
                ) as any;
                document.body.appendChild(viewer);
                await viewer.load(worker);
                let error: string | null = null;
                try {
                    await viewer.restoreWorkspace(first, {
                        wait_for_table: false,
                    });

                    await viewer.restoreWorkspace(second, {
                        wait_for_table: false,
                    });
                } catch (e) {
                    error = String(e);
                }

                await viewer.flush();
                const saved = await viewer.saveWorkspace();
                return {
                    error,
                    names: viewer.getPanelNames(),
                    panels: Object.keys(saved.panels),
                    layout: saved.layout,
                };
            },
            [first, second],
        );

        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        expect(result.error).toBeNull();
        expect(result.names.sort()).toEqual(Object.keys(second.panels).sort());
        expect(result.panels.sort()).toEqual(Object.keys(second.panels).sort());

        expect(treeSlots(result.layout)).toEqual(treeSlots(second.layout));
        expect(errors.filter((e) => e.includes("Panel disposed"))).toEqual([]);
    });

    test("a layout-only restoreWorkspace keeps the panel set", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        const errors = collect_errors(page);
        const cdp = await throttle(page, THROTTLE_RATE);
        const initial = workspace("panel");
        const reversed = {
            layout: {
                ...initial.layout,
                children: [...(initial.layout as any).children].reverse(),
            } as LayoutTree,
        };

        const result = await page.evaluate(
            async ([initial, reversed]) => {
                const worker = (window as any).__TEST_WORKER__;
                const viewer = document.createElement(
                    "perspective-viewer",
                ) as any;
                document.body.appendChild(viewer);
                await viewer.load(worker);
                let error: string | null = null;
                try {
                    await viewer.restoreWorkspace(initial, {
                        wait_for_table: false,
                    });

                    await viewer.restoreWorkspace(reversed);
                } catch (e) {
                    error = String(e);
                }

                await viewer.flush();
                const saved = await viewer.saveWorkspace();
                return {
                    error,
                    names: viewer.getPanelNames(),
                    panels: Object.keys(saved.panels),
                    layout: saved.layout,
                };
            },
            [initial, reversed],
        );

        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        expect(result.error).toBeNull();
        expect(result.names.sort()).toEqual(Object.keys(initial.panels).sort());

        expect(result.panels.sort()).toEqual(
            Object.keys(initial.panels).sort(),
        );

        expect(treeSlots(result.layout)).toEqual(treeSlots(reversed.layout));
        expect(errors.filter((e) => e.includes("Panel disposed"))).toEqual([]);
    });
});
