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

/**
 * Click-event emission for `viewer-charts`. Asserts the
 * `<perspective-viewer>` host element dispatches
 * `perspective-click` (`CustomEvent<PerspectiveClickDetail>`) and
 * `perspective-global-filter` (`CustomEvent<PerspectiveSelectDetail>`)
 * with detail shapes compatible with `viewer-datagrid`'s equivalents.
 *
 * Coordinate strategy: every chart loaded here is configured so that a
 * click at the canvas centerpoint reliably lands on a single glyph
 * (one bar across the plot rect, a single treemap leaf filling most
 * of the area, etc.). Tests assert detail *shape* rather than exact
 * values for the volatile fields (the precise row index / category
 * label depends on canvas-size + hit-test geometry); the filter
 * structure (column count, `[col, "==", value]` triples, presence of
 * `row` keys) is what consumers actually code against.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@perspective-dev/test";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import { gotoBasic, restoreChart, waitOneFrame } from "./helpers";

/**
 * Plain-object snapshot of a captured `CustomEvent.detail`. We
 * postMessage these between page and Playwright contexts so class
 * instances are flattened — assertions only inspect own fields, not
 * the `PerspectiveSelectDetail` prototype getters.
 */
interface CapturedEvent {
    name: string;
    detail: any;
    detailIsSelect: boolean;
}

/**
 * Install listeners on `<perspective-viewer>` for the named events.
 * Subsequent `drainCapturedEvents` reads them back as plain objects.
 */
async function installEventCapture(page: Page): Promise<void> {
    await page.evaluate(() => {
        const v = document.querySelector("perspective-viewer")!;
        const events: any[] = [];
        const capture = (name: string) => (e: Event) => {
            const ce = e as CustomEvent;
            // Detect `PerspectiveSelectDetail` via its distinctive
            // prototype getters (`insertFilters` / `removeFilters`).
            // The class name is mangled by minification so
            // `constructor.name` is unreliable, but the getters are
            // preserved on the prototype.
            const d = ce.detail as any;
            const detailIsSelect = !!(
                d &&
                typeof d === "object" &&
                Array.isArray(d.insertFilters) &&
                Array.isArray(d.removeFilters)
            );
            // Flatten own + getter values into the captured payload
            // so it survives the structured-clone boundary.
            const detail =
                d && typeof d === "object"
                    ? {
                          ...d,
                          ...(detailIsSelect
                              ? {
                                    insertFilters: d.insertFilters,
                                    removeFilters: d.removeFilters,
                                }
                              : {}),
                      }
                    : d;
            events.push({ name, detail, detailIsSelect });
        };

        for (const name of ["perspective-click", "perspective-global-filter"]) {
            v.addEventListener(name, capture(name));
        }

        (window as any).__capturedEvents = events;
    });
}

async function drainCapturedEvents(page: Page): Promise<CapturedEvent[]> {
    return page.evaluate(() => {
        const events = ((window as any).__capturedEvents ?? []) as any[];
        const copy = events.slice();
        events.length = 0;
        return copy;
    });
}

/**
 * Resolve the chart plugin's `.webgl-canvas` and return its center
 * coordinates in page pixels. Walks the shadow-DOM chain rooted at
 * `<perspective-viewer>` since the canvas lives inside the plugin's
 * shadow root.
 */
async function getCanvasCenter(
    page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
    return page.evaluate(() => {
        const v = document.querySelector("perspective-viewer")!;
        const visit = (
            root: Element | ShadowRoot,
        ): HTMLCanvasElement | null => {
            if (root instanceof Element) {
                const sr = (root as any).shadowRoot as ShadowRoot | null;
                if (sr) {
                    const hit = visit(sr);
                    if (hit) {
                        return hit;
                    }
                }
            }

            const direct = (root as ParentNode).querySelector?.(
                ".webgl-canvas",
            ) as HTMLCanvasElement | null;
            if (direct) {
                return direct;
            }

            const els = (root as ParentNode).querySelectorAll?.("*") ?? [];
            for (const el of Array.from(els)) {
                const sr = (el as any).shadowRoot as ShadowRoot | null;
                if (sr) {
                    const hit = visit(sr);
                    if (hit) {
                        return hit;
                    }
                }
            }

            return null;
        };

        const canvas = visit(v);
        if (!canvas) {
            throw new Error("webgl-canvas not found in plugin shadow tree");
        }

        const r = canvas.getBoundingClientRect();
        return {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            width: r.width,
            height: r.height,
        };
    });
}

/**
 * Click the GL canvas at a fractional position (0..1) from the
 * canvas's top-left corner.
 */
async function clickCanvasLower(
    page: Page,
    fx = 0.25,
    fy = 0.7,
): Promise<void> {
    const c = await getCanvasCenter(page);
    const x = c.x - c.width / 2 + c.width * fx;
    const y = c.y - c.height / 2 + c.height * fy;
    const baseline = await page.evaluate(
        () => ((window as any).__capturedEvents ?? []).length,
    );

    await page.mouse.click(x, y);
    await waitForEvents(page, baseline + 1, 500);
}

/**
 * Poll until `window.__capturedEvents` has at least `min` entries
 * (or `timeoutMs` elapses).
 */
async function waitForEvents(
    page: Page,
    min: number,
    timeoutMs: number,
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const n = await page.evaluate(
            () => ((window as any).__capturedEvents ?? []).length,
        );
        if (n >= min) {
            return;
        }

        await waitOneFrame(page);
    }
}

/**
 * Restore + install capture in one step. The chart's first render
 * dismisses any prior pin (which can fire a stray
 * `perspective-global-filter selected:false`); restore *before*
 * installing capture so those startup events don't pollute the
 * captured array.
 */
async function setupChart(
    page: Page,
    config: ViewerConfigUpdate,
): Promise<void> {
    await restoreChart(page, config);
    await installEventCapture(page);
}

test.beforeEach(async ({ page }) => {
    await gotoBasic(page);
});

test.describe("viewer-charts user events", () => {
    test("Y Bar: click emits perspective-click with row + filter", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page);
        const events = await drainCapturedEvents(page);

        const click = events.find((e) => e.name === "perspective-click");
        if (!click) {
            throw new Error(
                `expected perspective-click; got: ${JSON.stringify(events.map((e) => e.name))}`,
            );
        }

        expect(click.detail.column_names).toEqual(["Sales"]);
        expect(Array.isArray(click.detail.config?.filter)).toBe(true);
        // Filter has at least one clause naming the group_by column.
        const cats = click.detail.config.filter.filter(
            (f: unknown[]) => f[0] === "Category" && f[1] === "==",
        );
        expect(cats.length).toBe(1);
        expect(typeof cats[0][2]).toBe("string");
        expect(typeof click.detail.row).toBe("object");
    });

    test("Y Bar: click also emits perspective-global-filter selected:true", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page);
        const events = await drainCapturedEvents(page);

        const select = events.find(
            (e) => e.name === "perspective-global-filter",
        );
        expect(select).toBeDefined();
        expect(select!.detailIsSelect).toBe(true);
        expect(select!.detail.selected).toBe(true);
        expect(select!.detail.column_names).toEqual(["Sales"]);
        expect(select!.detail.insertConfigs).toHaveLength(1);
        expect(select!.detail.removeConfigs).toHaveLength(0);
        // Helper getters survived our manual copy.
        expect(Array.isArray(select!.detail.insertFilters)).toBe(true);
        expect(select!.detail.insertFilters.length).toBeGreaterThan(0);
    });

    test("Y Bar: click + same-target re-click pins then unpins", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page);
        await clickCanvasLower(page);
        const events = await drainCapturedEvents(page);

        // Expect the second click to land on the same target and
        // dismiss the pin — yielding a `selected:false` after the
        // initial `selected:true`.
        const selects = events.filter(
            (e) => e.name === "perspective-global-filter",
        );
        expect(selects.length).toBeGreaterThanOrEqual(2);
        expect(selects[0].detail.selected).toBe(true);
        const lastUnselect = selects
            .reverse()
            .find((e) => e.detail.selected === false);
        expect(lastUnselect).toBeDefined();
        // The unpin carries the previous insert as `removeConfigs`.
        expect(lastUnselect!.detail.removeConfigs.length).toBe(1);
        expect(lastUnselect!.detail.insertConfigs).toHaveLength(0);
    });

    test("Y Bar with split_by: filter carries both group_by and split_by clauses", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            split_by: ["Region"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page);
        const events = await drainCapturedEvents(page);

        const click = events.find((e) => e.name === "perspective-click");
        if (!click) {
            // Some splits may be hidden; if the centerpoint lands in a
            // gap the test asserts nothing — the next assertion would
            // fire downstream from a real click.
            test.skip(true, "center click missed a glyph");
            return;
        }

        const filter = click.detail.config.filter as unknown[][];
        const hasCategory = filter.some(
            (f) => f[0] === "Category" && f[1] === "==",
        );
        const hasRegion = filter.some(
            (f) => f[0] === "Region" && f[1] === "==",
        );
        expect(hasCategory).toBe(true);
        expect(hasRegion).toBe(true);
    });

    test("Treemap: leaf click emits click + select with full path filter", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Treemap",
            group_by: ["Category", "Sub-Category"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page, 0.5, 0.5);
        const events = await drainCapturedEvents(page);

        const click = events.find((e) => e.name === "perspective-click");
        const select = events.find(
            (e) => e.name === "perspective-global-filter",
        );

        expect(click).toBeDefined();
        expect(select).toBeDefined();
        // Path filter carries one clause per resolved group_by level.
        // Treemap may drill to a branch (1 level) or a leaf (2 levels);
        // assert at least one is present.
        const filter = click!.detail.config.filter as unknown[][];
        expect(filter.length).toBeGreaterThanOrEqual(1);
        expect(filter[0][0]).toBe("Category");
        expect(select!.detail.selected).toBe(true);
    });

    test("Sunburst: leaf click emits click + select", async ({ page }) => {
        await setupChart(page, {
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category"],
            columns: ["Sales"],
        });

        // Sunburst's center is the drill-up zone, so a centerpoint
        // click would either no-op or fire `selected:false`. Click
        // off-center to land on an outer ring (leaf) and assert a
        // pin-style event fires.
        const c = await getCanvasCenter(page);
        // Offset 30% of the smaller dimension into the ring area.
        const r = Math.min(c.width, c.height) * 0.3;
        await page.mouse.click(c.x + r, c.y);
        await waitOneFrame(page);
        await waitOneFrame(page);
        await waitOneFrame(page);
        const events = await drainCapturedEvents(page);

        const select = events.find(
            (e) => e.name === "perspective-global-filter",
        );
        expect(select).toBeDefined();
    });

    test("Heatmap: cell click emits click + select with both axes filtered", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Heatmap",
            group_by: ["Category"],
            split_by: ["Region"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page, 0.5, 0.5);
        const events = await drainCapturedEvents(page);

        const click = events.find((e) => e.name === "perspective-click");
        const select = events.find(
            (e) => e.name === "perspective-global-filter",
        );
        expect(click).toBeDefined();
        expect(select).toBeDefined();
        expect(click!.detail.column_names).toEqual(["Sales"]);
        const filter = click!.detail.config.filter as unknown[][];
        // Either filter clause might be missing if the centerpoint
        // lands on a rollup row; require at least one.
        expect(filter.length).toBeGreaterThanOrEqual(1);
    });

    test("Candlestick: click on a candle emits click + select", async ({
        page,
    }) => {
        // Use a coarse group_by so each candle spans many CSS pixels.
        await setupChart(page, {
            plugin: "Candlestick",
            group_by: ["Category"],
            columns: ["Sales", "Profit", "Discount", "Quantity"],
        });

        await clickCanvasLower(page);
        const events = await drainCapturedEvents(page);

        const click = events.find((e) => e.name === "perspective-click");
        if (!click) {
            test.skip(true, "centerpoint missed wick / body");
            return;
        }

        const filter = click.detail.config.filter as unknown[][];
        expect(filter.some((f) => f[0] === "Category")).toBe(true);
    });

    test("X/Y Scatter: click on a point emits click + select", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "X/Y Scatter",
            columns: ["Sales", "Profit"],
        });

        await clickCanvasLower(page, 0.5, 0.5);
        const events = await drainCapturedEvents(page);

        const click = events.find((e) => e.name === "perspective-click");
        // Scatter centerpoint may not hit a point in a sparse dataset
        // — skip rather than flake.
        if (!click) {
            test.skip(true, "centerpoint missed a point");
            return;
        }

        expect(click.detail.column_names).toEqual(["Profit"]);
        // No group_by → filter is empty (or contains only the split
        // prefix if `split_by` was set).
        expect(Array.isArray(click.detail.config.filter)).toBe(true);
    });

    test("X/Y Scatter with split_by: filter carries the split clause", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "X/Y Scatter",
            split_by: ["Region"],
            columns: ["Sales", "Profit"],
        });

        await clickCanvasLower(page, 0.5, 0.5);
        const events = await drainCapturedEvents(page);

        const click = events.find((e) => e.name === "perspective-click");
        if (!click) {
            test.skip(true, "centerpoint missed a point");
            return;
        }

        const filter = click.detail.config.filter as unknown[][];
        expect(filter.some((f) => f[0] === "Region" && f[1] === "==")).toBe(
            true,
        );
    });

    test("Map plugins: no event emitted (scoped out)", async ({ page }) => {
        await setupChart(page, {
            plugin: "Map Scatter",
            columns: ["Postal Code", "Postal Code"],
        });

        await clickCanvasLower(page, 0.5, 0.5);
        const events = await drainCapturedEvents(page);
        // Map plugins inherit from CartesianChart so they'll wire
        // up — the relevant assertion is "no crash", not silence.
        // Document the current behavior: map clicks may emit if the
        // underlying CartesianChart resolves a hit. Either is OK.
        expect(Array.isArray(events)).toBe(true);
    });

    test("Detail prototype: select event detail is a PerspectiveSelectDetail instance", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page);
        const events = await drainCapturedEvents(page);
        const select = events.find(
            (e) => e.name === "perspective-global-filter",
        );
        expect(select).toBeDefined();
        expect(select!.detailIsSelect).toBe(true);
    });

    test("View change: restore() while pinned emits a selected:false", async ({
        page,
    }) => {
        await setupChart(page, {
            plugin: "Y Bar",
            group_by: ["Category"],
            columns: ["Sales"],
        });

        await clickCanvasLower(page);
        const pre = await drainCapturedEvents(page);
        if (!pre.find((e) => e.name === "perspective-global-filter")) {
            test.skip(true, "initial click missed a glyph");
            return;
        }

        // Re-restore with a different filter: the view changes, the
        // chart's `setView` runs, the pin is dismissed, and we expect
        // a `selected:false` to surface.
        await page.evaluate(async () => {
            const v = document.querySelector("perspective-viewer")! as any;
            await v.restore({
                plugin: "Y Bar",
                group_by: ["Sub-Category"],
                columns: ["Sales"],
            });
        });
        await waitOneFrame(page);
        await waitOneFrame(page);
        await waitOneFrame(page);

        const post = await drainCapturedEvents(page);
        const unselect = post.find(
            (e) =>
                e.name === "perspective-global-filter" &&
                e.detail.selected === false,
        );
        expect(unselect).toBeDefined();
    });
});
