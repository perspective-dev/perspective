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

// Regression spec for the stacked-chart tab-activation artifact
// (`PLUGIN_DRAW_INVARIANT_PLAN.md`): activating a tab used to FULL-`draw()`
// both sides of the switch — and a chart `draw()` is a fetch plus a
// multi-blit repaint (`resetAllZooms` emits an intermediate frame before
// `loadAndRender`'s complete one), painted over a canvas the hidden-tab
// 0×0 resize had cleared. Under the invariant, `plugin.draw` fires iff
// there is a NEW `View` — activation dispatches `resize()` only, and the
// hidden panel's `resize()` self-guards.

import { expect, test } from "@perspective-dev/test";
import type { Page } from "@playwright/test";
import { gotoBasic, waitOneFrame } from "./helpers";

const TABLE = "load-viewer-csv";

/// Two charts stacked in one tab-layout.
async function setupStack(page: Page): Promise<void> {
    await page.evaluate(
        async ({ table }) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({
                layout: {
                    type: "tab-layout",
                    tabs: ["one", "two"],
                    selected: 0,
                },
                panels: {
                    one: {
                        table,
                        plugin: "X/Y Scatter",
                        columns: ["Sales", "Profit"],
                        group_by: ["State"],
                    },
                    two: {
                        table,
                        plugin: "Y Bar",
                        columns: ["Sales"],
                        group_by: ["Category"],
                    },
                },
            });
            await viewer.flush();
        },
        { table: TABLE },
    );
}

/// Install draw/update/resize counters on every chart plugin element.
async function hookDispatchCounters(page: Page): Promise<void> {
    await page.evaluate(() => {
        const calls: Record<string, number> = {};
        (window as any).__DISPATCH_CALLS__ = calls;
        // One custom element per chart type: `perspective-viewer-charts-*`.
        const plugins = (
            Array.from(document.querySelectorAll("*")) as any[]
        ).filter((e) =>
            e.tagName.toLowerCase().startsWith("perspective-viewer-charts-"),
        );
        if (plugins.length === 0) {
            throw new Error("no chart plugin elements found to hook");
        }

        for (const p of plugins) {
            const slot = p.getAttribute("slot");
            for (const m of ["draw", "update", "resize"]) {
                const orig = p[m].bind(p);
                p[m] = async (...args: any[]) => {
                    calls[`${slot}.${m}`] = (calls[`${slot}.${m}`] ?? 0) + 1;
                    return await orig(...args);
                };
            }
        }
    });
}

/// Click the tab that is NOT currently selected (activating its panel) and
/// let the switch settle.
async function toggleTab(page: Page): Promise<void> {
    const before = await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer") as any;
        const active = viewer.getActivePanel();
        const tabs = Array.from(
            document.querySelectorAll('[slot^="tab-"]'),
        ) as HTMLElement[];
        const target = tabs.find(
            (t) => t.getAttribute("slot") !== `tab-${active}`,
        )!;
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(
            new PointerEvent("pointerdown", {
                bubbles: true,
                composed: true,
                clientX: rect.x + rect.width / 2,
                clientY: rect.y + rect.height / 2,
            }),
        );
        return active;
    });

    // Non-vacuous: the click must have actually switched the active panel.
    await page.waitForFunction(
        (before) =>
            (
                document.querySelector("perspective-viewer") as any
            ).getActivePanel() !== before,
        before,
    );

    for (let i = 0; i < 5; i++) {
        await waitOneFrame(page);
    }

    await page.evaluate(async () => {
        await (document.querySelector("perspective-viewer") as any).flush();
    });
}

test.describe("Tab-stack chart activation", () => {
    test("tab toggles dispatch zero draw()s and zero update()s", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await gotoBasic(page);
        await setupStack(page);
        await hookDispatchCounters(page);

        for (let i = 0; i < 4; i++) {
            await toggleTab(page);
        }

        const calls = await page.evaluate(
            () => (window as any).__DISPATCH_CALLS__,
        );

        // `plugin.draw` ⇔ new `View`; a tab switch constructs none — and
        // the update path stays silent too. The activation chrome nudge is
        // `resize()`, which the VISIBLE panel serves from retained worker
        // state (one blit) and the HIDDEN panel's guard no-ops.
        for (const [k, count] of Object.entries(calls)) {
            if (k.endsWith(".draw")) {
                expect(count, k).toBe(0);
            }

            if (k.endsWith(".update")) {
                expect(count, k).toBe(0);
            }
        }

        // The activations did repaint (the chrome dispatch ran).
        const resizes = Object.entries(calls)
            .filter(([k]) => k.endsWith(".resize"))
            .reduce((sum, [, n]) => sum + (n as number), 0);
        expect(resizes).toBeGreaterThanOrEqual(4);
    });

    test("a repeat plugin restore after a swap does not draw again", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await gotoBasic(page);
        await setupStack(page);
        await hookDispatchCounters(page);

        // Control for the invariant's other half: a plugin swap owes the
        // fresh element its FIRST paint of the bound `View` (the
        // `promote_first_paint` witness path) — exactly one `draw()`.
        const active = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const active = viewer.getActivePanel();
            await viewer.restorePanel({ plugin: "Y Line" }, active);
            await viewer.flush();
            return active;
        });

        // The swapped-in element is NEW (hooks don't survive the swap), so
        // count via the swap target's own method — hook the new element
        // post-swap and assert a SECOND no-op restore doesn't draw again.
        await hookDispatchCounters(page);
        await page.evaluate(async (active) => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restorePanel({ plugin: "Y Line" }, active);
            await viewer.flush();
        }, active);

        const calls = await page.evaluate(
            () => (window as any).__DISPATCH_CALLS__,
        );

        for (const [k, count] of Object.entries(calls)) {
            if (k.endsWith(".draw")) {
                expect(count, k).toBe(0);
            }
        }
    });
});
