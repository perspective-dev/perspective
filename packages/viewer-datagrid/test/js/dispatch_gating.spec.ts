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

// Regression spec for the source-gated dispatch amendment
// (PLUGIN_DRAW_INVARIANT_PLAN.md, "Amendment: source-gated dispatch"
// 2026-07-16), tests B1–B4:
//
//  - B1 (the motivating bug): an initial `restore()` carrying a
//    `plugin_config` used to render TWICE — the restore run's `draw`, then
//    a stray `update` ~25ms later. The datagrid's `restore()` called
//    `toggle_edit_mode`, which echoed
//    `restorePanel({plugin_config: {edit_mode}})` back into the host — an
//    inert restore whose run reconciled `Unchanged` and repainted anyway.
//    The echo is now gated to user gestures, so boot is exactly ONE `draw`.
//  - B2: the public no-op-restore refresh affordance is PRESERVED —
//    `viewer.restore({})` on a drawn viewer still repaints, via `update`
//    (`RunOrigin::Public`, update source 6).
//  - B3: a genuinely-changed `plugin_config` restore on a drawn viewer
//    delivers exactly one `update` (source 3), never a `draw`.
//  - B4: the toolbar-click request path stays alive — clicking the edit
//    button persists the mode into the host config (`save()` round-trip)
//    and repaints.
//  - B6 (the raycasting escape, captured-theme revision): a boot restore
//    CARRYING a `theme` renders once — the first paint already captures
//    the stamped theme, so the restyle tail (`needs_restyle()`) must
//    no-op; a GENUINE theme change on the drawn viewer still restyles.

import { expect, test } from "@perspective-dev/test";

const TABLE = "load-viewer-csv";

// Patch draw/update/resize counters onto the datagrid element prototype,
// bucketed per instance. Prototype-level (not instance-level) so hooks are
// in place BEFORE a freshly-created viewer constructs its plugin element.
async function hook_dispatch_counters(page: any) {
    await page.evaluate(async () => {
        const cls = customElements.get("perspective-viewer-datagrid") as any;
        const counters = ((window as any).__DISPATCH_COUNTS__ = new Map());
        for (const m of ["draw", "update", "resize", "restyle"]) {
            const orig = cls.prototype[m];
            cls.prototype[m] = function (...args: any[]) {
                if (!counters.has(this)) {
                    counters.set(this, {
                        draw: 0,
                        update: 0,
                        resize: 0,
                        restyle: 0,
                    });
                }

                counters.get(this)[m] += 1;
                return orig.apply(this, args);
            };
        }
    });
}

// Read the counter bucket for the datagrid inside `viewer_selector`.
async function read_counts(page: any, viewer_selector: string) {
    return await page.evaluate(async (sel: string) => {
        const viewer = document.querySelector(sel) as any;
        const counters = (window as any).__DISPATCH_COUNTS__ as Map<any, any>;
        for (const [elem, counts] of counters.entries()) {
            if (elem.parentElement === viewer) {
                return counts;
            }
        }

        return { draw: 0, update: 0, resize: 0, restyle: 0 };
    }, viewer_selector);
}

async function goto_ready(page: any) {
    await page.goto("/tools/test/src/html/basic-test.html");
    await page.evaluate(async () => {
        while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
}

// The stray post-restore `update` arrived asynchronously (a second run
// queued on the draw lock), so settle past `flush()` before reading.
async function settle(page: any) {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer") as any;
        await viewer.flush();
        await new Promise((x) => setTimeout(x, 500));
    });
}

test.describe("Plugin dispatch gating (PLUGIN_DRAW_INVARIANT amendment)", () => {
    test("B1: initial restore with plugin_config draws exactly once, no echo update", async ({
        page,
    }) => {
        await goto_ready(page);
        await hook_dispatch_counters(page);

        // A FRESH viewer bootstrapped like the "editable" example:
        // load(worker) then restore({table, plugin_config}). The harness
        // viewer keeps the default id; the fresh one gets `#boot-probe`.
        await page.evaluate(
            async ({ tableName }: any) => {
                const viewer = document.createElement(
                    "perspective-viewer",
                ) as any;
                viewer.id = "boot-probe";
                viewer.style.cssText =
                    "position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;";
                document.body.appendChild(viewer);
                await viewer.load((window as any).__TEST_WORKER__);
                await viewer.restore({
                    table: tableName,
                    plugin_config: { edit_mode: "EDIT" },
                });
                await viewer.flush();
                await new Promise((x) => setTimeout(x, 500));
            },
            { tableName: TABLE },
        );

        const counts = await read_counts(page, "#boot-probe");
        expect(counts.draw).toEqual(1);
        expect(counts.update).toEqual(0);

        // The mode itself must still land (the apply path works echo-less).
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("#boot-probe") as any;
            return await viewer.save();
        });
        expect(config.plugin_config.edit_mode).toEqual("EDIT");
    });

    test("B2: public no-op restore({}) still repaints via update", async ({
        page,
    }) => {
        await goto_ready(page);
        await hook_dispatch_counters(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({});
        });

        await settle(page);
        const counts = await read_counts(page, "perspective-viewer");
        expect(counts.update).toEqual(1);
        expect(counts.draw).toEqual(0);
    });

    test("B3: a genuinely changed plugin_config restore delivers exactly one update", async ({
        page,
    }) => {
        await goto_ready(page);
        await hook_dispatch_counters(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.restore({ plugin_config: { edit_mode: "EDIT" } });
        });

        await settle(page);
        const counts = await read_counts(page, "perspective-viewer");
        expect(counts.update).toEqual(1);
        expect(counts.draw).toEqual(0);
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return await viewer.save();
        });
        expect(config.plugin_config.edit_mode).toEqual("EDIT");
    });

    test("B6: theme-carrying boot restore draws once; a genuine theme change still restyles", async ({
        page,
    }) => {
        await goto_ready(page);
        await hook_dispatch_counters(page);

        // A fresh viewer bootstrapped like the raycasting example: the
        // restore config CARRIES a theme. The first paint captures the
        // stamped theme, so the own-theme restyle tail must no-op — one
        // `draw`, no `update`, and at most the single first-MOUNT restyle
        // (which precedes the draw; the buggy tail added a second).
        await page.evaluate(
            async ({ tableName }: any) => {
                const viewer = document.createElement(
                    "perspective-viewer",
                ) as any;
                viewer.id = "theme-probe";
                viewer.style.cssText =
                    "position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;";
                document.body.appendChild(viewer);
                await viewer.load((window as any).__TEST_WORKER__);
                await viewer.restore({ table: tableName, theme: "Pro Dark" });
                await viewer.flush();
                await new Promise((x) => setTimeout(x, 500));
            },
            { tableName: TABLE },
        );

        const boot = await read_counts(page, "#theme-probe");
        expect(boot.draw).toEqual(1);
        expect(boot.update).toEqual(0);
        expect(boot.restyle).toBeLessThanOrEqual(1);

        // A GENUINE theme change on the now-drawn viewer: the captured CSS
        // is stale, so the tail restyles (restyle + update), never draws.
        await page.evaluate(async () => {
            const viewer = document.querySelector("#theme-probe") as any;
            await viewer.restore({ theme: "Pro Light" });
            await viewer.flush();
            await new Promise((x) => setTimeout(x, 500));
        });

        const changed = await read_counts(page, "#theme-probe");
        expect(changed.draw).toEqual(1);
        expect(changed.restyle).toEqual(boot.restyle + 1);
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("#theme-probe") as any;
            return await viewer.save();
        });
        expect(config.theme).toEqual("Pro Light");
    });

    test("B4: toolbar click persists edit_mode into the host config and repaints", async ({
        page,
    }) => {
        await goto_ready(page);
        // The toolbar mounts with the settings/status chrome.
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            await viewer.toggleConfig(true);
            await viewer.flush();
        });

        await hook_dispatch_counters(page);
        await page.evaluate(async () => {
            const toolbar = document.querySelector(
                "perspective-viewer-datagrid-toolbar",
            ) as any;
            const button = toolbar.shadowRoot.querySelector(
                "#edit_mode",
            ) as HTMLElement;
            button.dispatchEvent(new Event("click"));
        });

        await settle(page);
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            return await viewer.save();
        });
        expect(config.plugin_config.edit_mode).toEqual("EDIT");

        // The request path's repaint: the echoed restorePanel carries a
        // genuinely NEW mode → `Unchanged + changed → update`.
        const counts = await read_counts(page, "perspective-viewer");
        expect(counts.update).toBeGreaterThanOrEqual(1);
        expect(counts.draw).toEqual(0);
    });
});
