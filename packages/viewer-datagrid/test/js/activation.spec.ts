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

// Regression spec for the activation two-frame artifact
// (SESSION_CONFIG_COHERENCE_PLAN.md §4, I5 audit gap): activating a panel
// used to flip the `active` class in an async render pass while the
// datagrid's edit column-header `<tr>` arrived via a separately-scheduled,
// throttled draw — so a paint could show the `:host(.active)` EDIT chrome
// against the pre-activation DOM ("EDIT on the wrong row"). The class is
// now stamped inside the locked dispatch immediately before the ONE
// transactional draw per affected panel, so:
//
//  - The class and the row count may disagree only for the duration of
//    that single draw (class stamps at dispatch start, DOM commits at draw
//    end) — but the EDIT chrome can never paint on a row that is not a
//    genuine edit-buttons row, at ANY frame (the row ids are assigned by
//    the style pass of the same draw that creates/removes the row).
//  - Once the activation settles, class ⟺ edit row, for every panel.
//  - Activation costs `resize()` repaints only — ZERO `draw()`s (a `draw`
//    would imply a new `View` — `PLUGIN_DRAW_INVARIANT_PLAN.md`) and zero
//    update-path draws.

import { expect, test } from "@perspective-dev/test";

const TABLE = "load-viewer-csv";

test.describe("Panel activation", () => {
    test("activation paints EDIT chrome only on a real edit row, via resize with zero draws", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await page.goto("/tools/test/src/html/basic-test.html");
        await page.evaluate(async () => {
            while (!(window as any)["__TEST_PERSPECTIVE_READY__"]) {
                await new Promise((x) => setTimeout(x, 10));
            }
        });

        const result = await page.evaluate(
            async ({ tableName }) => {
                const v = document.querySelector("perspective-viewer") as any;
                await v.restore({
                    plugin: "Datagrid",
                    columns: ["Sales", "Profit"],
                });
                await v.addPanel({
                    plugin: "Datagrid",
                    table: tableName,
                    columns: ["State", "Sales"],
                });
                await v.toggleConfig(true);
                await v.flush();

                const plugins = Array.from(
                    document.querySelectorAll("perspective-viewer-datagrid"),
                ) as any[];
                const theadOf = (p: any) =>
                    (p.shadowRoot ?? p).querySelector("thead") as HTMLElement;

                // Count draws/updates/resizes per panel through the activation.
                const calls: Record<string, number> = {};
                for (const p of plugins) {
                    const slot = p.getAttribute("slot");
                    for (const m of ["draw", "update", "resize"]) {
                        const orig = p[m].bind(p);
                        p[m] = async (...args: any[]) => {
                            calls[`${slot}.${m}`] =
                                (calls[`${slot}.${m}`] ?? 0) + 1;
                            return await orig(...args);
                        };
                    }
                }

                // Per-rAF invariant sampler: at EVERY animation frame, a `<tr>`
                // painting the EDIT `::before` chrome must be a genuine
                // edit-buttons row — i.e. one with no title text (the extra row
                // the data listener emits is all-empty cells). EDIT rendered on
                // a row carrying column names is the wrong-row artifact.
                const violations: string[] = [];
                let sampling = true;
                const sample = () => {
                    for (const p of plugins) {
                        const thead = theadOf(p);
                        if (!thead) {
                            continue;
                        }

                        for (const tr of Array.from(thead.children)) {
                            const spans = tr.querySelectorAll(
                                "th span:not(.rt-column-resize)",
                            );
                            const hasEdit = Array.from(spans).some((s) =>
                                getComputedStyle(
                                    s,
                                    "::before",
                                ).content.includes("Edit"),
                            );
                            const text = (tr.textContent ?? "").trim();
                            if (hasEdit && text !== "") {
                                violations.push(
                                    `${p.getAttribute("slot")}: EDIT chrome on ` +
                                        `a title row ("${text.slice(0, 40)}")`,
                                );
                            }
                        }
                    }

                    if (sampling) {
                        requestAnimationFrame(sample);
                    }
                };

                requestAnimationFrame(sample);

                // Steady-state coherence: after an activation settles, the
                // `active` class and the edit row must agree on every panel.
                const raf = () =>
                    new Promise((x) =>
                        requestAnimationFrame(() => x(undefined)),
                    );
                const settle = async (tag: string) => {
                    for (let i = 0; i < 10; i++) {
                        await raf();
                    }

                    await v.flush();
                    for (const p of plugins) {
                        const active = p.classList.contains("active");
                        const rows = theadOf(p)?.children?.length ?? -1;
                        if ((active && rows !== 2) || (!active && rows !== 1)) {
                            violations.push(
                                `${tag} settled ${p.getAttribute("slot")}: ` +
                                    `active=${active} theadRows=${rows}`,
                            );
                        }
                    }
                };

                await settle("initial");

                // Activate the inactive panel via its TAB (the UI path that
                // exhibited the artifact), then the other way via the API.
                const names = await v.getPanelNames();
                const target = names.find(
                    (n: string) => n !== v.getActivePanel(),
                );
                const tab = document.querySelector(
                    `[slot="tab-${target}"]`,
                ) as HTMLElement;
                const rect = tab.getBoundingClientRect();
                const down = new PointerEvent("pointerdown", {
                    bubbles: true,
                    composed: true,
                    clientX: rect.x + rect.width / 2,
                    clientY: rect.y + rect.height / 2,
                });
                tab.dispatchEvent(down);
                await settle("tab-activate");

                await v.setActivePanel(names.find((n: string) => n !== target));
                await settle("api-activate");

                sampling = false;
                return { violations, calls };
            },
            { tableName: TABLE },
        );

        expect(result.violations).toEqual([]);

        // Activation is CHROME-only: `plugin.draw` would imply a new `View`
        // (`PLUGIN_DRAW_INVARIANT_PLAN.md` — it fires iff the pipeline
        // REBUILT, never on activation), and the update path stays silent
        // too — each affected panel repaints via `resize()`, which its
        // style listeners ride to rebuild the EDIT chrome atomically with
        // the stamped `active` class.
        for (const [k, count] of Object.entries(result.calls)) {
            if (k.endsWith(".draw")) {
                expect(count, k).toBe(0);
            }

            if (k.endsWith(".update")) {
                expect(count, k).toBe(0);
            }

            if (k.endsWith(".resize")) {
                expect(count, k).toBeGreaterThanOrEqual(1);
            }
        }
    });
});
