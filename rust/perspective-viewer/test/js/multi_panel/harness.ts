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

// Workspace structural invariants (see `.plan/WORKSPACE_TEST_PLAN.md` §1).
// Each helper asserts a layer the model-level APIs cannot see, locking the
// failure classes of the panel-materialization arc:
//
// - I1 `armLayoutCanary`/`assertLayoutStable`: the `<regular-layout>` ELEMENT
//   is never replaced (a Yew unkeyed list diff once recreated it, silently
//   re-booting an EMPTY layout with no listeners).
// - I2 `assertTreeSane`: `layout.save()` sizes are finite, positive and
//   normalized (an insert into an empty split once poisoned the tree with
//   `NaN` sizes that rendered plausibly).
// - I3 `assertCoherent`: model panel set ≡ layout tree ≡ frame geometry ≡
//   slotted plugin projection (a duplicate once committed into an empty tree,
//   orphaning the original panel from the layout while the model kept both —
//   and the two frames rendered pixel-superimposed).
//
// `armInvariants(test)` retrofits I1+I2+I3 onto a whole spec file; the
// invariants then gate EVERY test's end state.

import type { Page, TestType } from "@playwright/test";
import { expect } from "../helpers.ts";

/// `regular-layout`'s serialized tree.
export type LayoutTree =
    | {
          type: "split-layout";
          orientation: "horizontal" | "vertical";
          sizes: number[];
          children: LayoutTree[];
      }
    | { type: "tab-layout"; tabs: string[]; selected?: number };

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/// One viewer's structural snapshot, gathered in a single `evaluate`.
interface CoherenceSnapshot {
    names: string[];
    tree: LayoutTree | null;
    stage: Rect | null;
    frames: { name: string | null; rect: Rect; display: string }[];
    plugins: { slot: string; rect: Rect; visible: boolean }[];
    canary: "stable" | "replaced" | "unarmed";
}

/// Every slot name in a layout tree, in traversal order.
export function treeSlots(tree: LayoutTree | null): string[] {
    if (tree == null) {
        return [];
    }

    if (tree.type === "tab-layout") {
        return [...tree.tabs];
    }

    return tree.children.flatMap(treeSlots);
}

/// The visible member of every stack: `tabs[selected ?? 0]`. Hidden stack
/// members legally have an unprojected (hidden) plugin.
function visibleSlots(tree: LayoutTree | null): string[] {
    if (tree == null) {
        return [];
    }

    if (tree.type === "tab-layout") {
        const selected = tree.selected ?? 0;
        return tree.tabs[selected] != null ? [tree.tabs[selected]] : [];
    }

    return tree.children.flatMap(visibleSlots);
}

/// Group slots by their containing `tab-layout` (stack) — same-stack frames
/// legally overlap (they share a cell); any other overlap is a bug.
function stackGroups(tree: LayoutTree | null): string[][] {
    if (tree == null) {
        return [];
    }

    if (tree.type === "tab-layout") {
        return [[...tree.tabs]];
    }

    return tree.children.flatMap(stackGroups);
}

/// I2 — every `sizes` entry finite and positive, per-split sum ≈ 1, arity
/// matches, no duplicate or empty slots. The empty root split (zero panels)
/// is legal.
export function assertTreeSane(tree: LayoutTree | null): void {
    expect(tree, "layout.save() returned no tree").not.toBeNull();
    const slots: string[] = [];
    const walk = (node: LayoutTree, is_root: boolean) => {
        if (node.type === "tab-layout") {
            expect(
                node.tabs.length,
                "empty tab-layout in tree",
            ).toBeGreaterThan(0);
            if (node.selected != null) {
                expect(node.selected).toBeGreaterThanOrEqual(0);
                expect(node.selected).toBeLessThan(node.tabs.length);
            }

            slots.push(...node.tabs);
            return;
        }

        expect(node.sizes.length, "sizes/children arity mismatch").toBe(
            node.children.length,
        );

        if (node.children.length === 0) {
            expect(is_root, "empty split below the root").toBe(true);
            return;
        }

        let total = 0;
        for (const size of node.sizes) {
            expect(Number.isFinite(size), `non-finite size ${size}`).toBe(true);
            expect(size, "non-positive size").toBeGreaterThan(0);
            total += size;
        }

        expect(Math.abs(total - 1), "sizes not normalized").toBeLessThan(1e-6);
        for (const child of node.children) {
            walk(child, false);
        }
    };

    walk(tree!, true);
    expect(new Set(slots).size, "duplicate slot in tree").toBe(slots.length);
}

/// I1 — record the layout element instance(s) present now; `assertCoherent`
/// (and `assertLayoutStable`) later require the SAME instance, still
/// connected.
export async function armLayoutCanary(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("perspective-viewer")).some((v) =>
            v.shadowRoot?.querySelector("regular-layout"),
        ),
    );

    await page.evaluate(() => {
        const canaries = new Map<Element, Element>();
        for (const viewer of document.querySelectorAll("perspective-viewer")) {
            const layout = viewer.shadowRoot?.querySelector("regular-layout");
            if (layout) {
                canaries.set(viewer, layout);
            }
        }

        (globalThis as any).__PSP_LAYOUT_CANARIES = canaries;
    });
}

function snapshotInPage(): CoherenceSnapshot[] {
    const toRect = (r: DOMRect): any => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
    });

    const canaries: Map<Element, Element> | undefined = (globalThis as any)
        .__PSP_LAYOUT_CANARIES;

    return Array.from(document.querySelectorAll("perspective-viewer")).map(
        (viewer: any) => {
            const layout = viewer.shadowRoot?.querySelector(
                "regular-layout",
            ) as any;

            const recorded = canaries?.get(viewer);
            const canary =
                recorded === undefined
                    ? "unarmed"
                    : recorded === layout && layout?.isConnected
                      ? "stable"
                      : "replaced";

            const frames = Array.from(
                layout?.querySelectorAll("regular-layout-frame") ?? [],
            ).map((f: any) => ({
                name: f.getAttribute("name"),
                rect: toRect(f.getBoundingClientRect()),
                display: getComputedStyle(f).display,
            }));

            const plugins = Array.from(viewer.children)
                .filter((el: any) => {
                    const slot = el.getAttribute("slot");
                    return slot && !slot.startsWith("tab-");
                })
                .map((el: any) => ({
                    slot: el.getAttribute("slot"),
                    rect: toRect(el.getBoundingClientRect()),
                    visible: el.offsetParent != null,
                }));

            return {
                names: viewer.getPanelNames?.() ?? [],
                tree: layout?.save?.() ?? null,
                stage: layout ? toRect(layout.getBoundingClientRect()) : null,
                frames,
                plugins,
                canary,
            };
        },
    );
}

function intersectionArea(a: Rect, b: Rect): number {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return Math.max(0, w) * Math.max(0, h);
}

function rectsEqual(a: Rect, b: Rect, tol: number): boolean {
    return (
        Math.abs(a.left - b.left) <= tol &&
        Math.abs(a.top - b.top) <= tol &&
        Math.abs(a.right - b.right) <= tol &&
        Math.abs(a.bottom - b.bottom) <= tol
    );
}

function contains(outer: Rect, inner: Rect, tol: number): boolean {
    return (
        inner.left >= outer.left - tol &&
        inner.top >= outer.top - tol &&
        inner.right <= outer.right + tol &&
        inner.bottom <= outer.bottom + tol
    );
}

/// I1 alone — the layout element was not replaced.
export async function assertLayoutStable(page: Page): Promise<void> {
    const snaps = await page.evaluate(snapshotInPage);
    for (const snap of snaps) {
        expect(snap.canary, "<regular-layout> element was REPLACED").not.toBe(
            "replaced",
        );
    }
}

/// I1 + I2 + I3 at a SETTLE point. Polls first until every viewer's model
/// panel set equals its layout tree's slot set — staged panels are the only
/// legal difference, and they must drain within the staging deadline — then
/// asserts structure and geometry.
export async function assertCoherent(page: Page): Promise<void> {
    const deadline = Date.now() + 2000;
    let snaps = await page.evaluate(snapshotInPage);
    const settled = (s: CoherenceSnapshot) =>
        [...s.names].sort().join(" ") === treeSlots(s.tree).sort().join(" ");

    while (!snaps.every(settled) && Date.now() < deadline) {
        await new Promise((x) => setTimeout(x, 50));
        snaps = await page.evaluate(snapshotInPage);
    }

    for (const snap of snaps) {
        // I1 — element identity.
        expect(snap.canary, "<regular-layout> element was REPLACED").not.toBe(
            "replaced",
        );

        // Model ≡ tree (staged set drained).
        expect(
            [...snap.names].sort(),
            "model panel set != layout tree slots",
        ).toEqual(treeSlots(snap.tree).sort());

        // I2 — tree data sanity.
        assertTreeSane(snap.tree);

        if (snap.names.length === 0) {
            continue;
        }

        // Every slot has a placed frame inside the stage.
        const frames = new Map(snap.frames.map((f) => [f.name, f]));
        for (const slot of treeSlots(snap.tree)) {
            const frame = frames.get(slot);
            expect(frame, `no frame for panel [${slot}]`).toBeTruthy();
            expect(frame!.display, `frame [${slot}] not placed`).not.toBe(
                "none",
            );

            expect(
                frame!.rect.width,
                `frame [${slot}] has no width`,
            ).toBeGreaterThan(1);

            expect(
                frame!.rect.height,
                `frame [${slot}] has no height`,
            ).toBeGreaterThan(1);

            expect(
                contains(snap.stage!, frame!.rect, 2),
                `frame [${slot}] outside the stage`,
            ).toBe(true);
        }

        // Frames overlap ONLY within a stack (where they must coincide) —
        // any cross-stack overlap is the superimposition bug class.
        const groups = stackGroups(snap.tree);
        const group_of = new Map<string, number>();
        groups.forEach((group, i) =>
            group.forEach((slot) => group_of.set(slot, i)),
        );

        const slots = treeSlots(snap.tree);
        for (let i = 0; i < slots.length; i++) {
            for (let j = i + 1; j < slots.length; j++) {
                const [a, b] = [frames.get(slots[i])!, frames.get(slots[j])!];
                if (group_of.get(slots[i]) === group_of.get(slots[j])) {
                    expect(
                        rectsEqual(a.rect, b.rect, 2),
                        `stack members [${slots[i]}]/[${slots[j]}] diverge`,
                    ).toBe(true);
                } else {
                    expect(
                        intersectionArea(a.rect, b.rect),
                        `frames [${slots[i]}]/[${slots[j]}] overlap`,
                    ).toBeLessThan(25);
                }
            }
        }

        // Every VISIBLE panel's plugin is slotted, projected and inside its
        // frame; hidden stack members are legally unprojected.
        const visible = new Set(visibleSlots(snap.tree));
        for (const slot of visible) {
            const plugin = snap.plugins.find(
                (p) => p.slot === slot && p.visible,
            );
            expect(
                plugin,
                `no projected plugin for visible panel [${slot}]`,
            ).toBeTruthy();

            expect(
                contains(frames.get(slot)!.rect, plugin!.rect, 3),
                `plugin [${slot}] escapes its frame`,
            ).toBe(true);
        }
    }
}

/// Retrofit I1+I2+I3 onto a spec file: arm the canary after the file's own
/// `beforeEach` (registration order), and gate every PASSING test's end
/// state on full coherence. Call AFTER the file's `test.beforeEach`.
export function armInvariants(test: TestType<any, any>): void {
    test.beforeEach(async ({ page }) => {
        await armLayoutCanary(page);
    });

    test.afterEach(async ({ page }, testInfo) => {
        if (testInfo.status === "passed") {
            await assertCoherent(page);
        }
    });
}

/// Count `regular-layout-update` events (layout COMMITS) from now on. Most
/// actions must commit exactly once — extra commits are redundant layout
/// churn, zero is a silently-dropped mutation.
export async function armCommitCounter(page: Page): Promise<void> {
    await page.evaluate(() => {
        const g = globalThis as any;
        g.__PSP_COMMITS = 0;
        for (const viewer of document.querySelectorAll("perspective-viewer")) {
            viewer.shadowRoot
                ?.querySelector("regular-layout")
                ?.addEventListener("regular-layout-update", () => {
                    g.__PSP_COMMITS += 1;
                });
        }
    });
}

export async function readCommitCount(page: Page): Promise<number> {
    return await page.evaluate(() => (globalThis as any).__PSP_COMMITS ?? 0);
}
