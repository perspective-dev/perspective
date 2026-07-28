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

// Full-stack panel ADDITION coverage (`.plan/WORKSPACE_TEST_PLAN.md` §2.2):
// every add path (context-menu Duplicate / New, `addPanel`, `restoreWorkspace`,
// upsert `restore`) must land as exactly ONE layout commit, with the model,
// tree, frame geometry and plugin projection coherent — not merely the right
// `getPanelNames().length`, which stayed green through both the
// element-replacement and NaN-sizes regressions.

import { test, expect } from "../helpers.ts";
import {
    armInvariants,
    armCommitCounter,
    readCommitCount,
    assertCoherent,
    treeSlots,
    type LayoutTree,
} from "./harness.ts";

const TABLE = "load-viewer-csv";

const SPLIT_CONFIG = {
    layout: {
        type: "split-layout",
        orientation: "horizontal",
        sizes: [0.5, 0.5],
        children: [
            { type: "tab-layout", tabs: ["one"], selected: 0 },
            { type: "tab-layout", tabs: ["two"], selected: 0 },
        ],
    },
    panels: {
        one: { table: TABLE, title: "One", group_by: ["State"] },
        two: { table: TABLE, title: "Two", columns: ["Sales", "Profit"] },
    },
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

// Structural invariants (I1 element identity / I2 tree sanity / I3
// model-layout-DOM coherence) gate every passing test's end state - see
// `harness.ts` and `.plan/WORKSPACE_TEST_PLAN.md`.
armInvariants(test);

async function panelNames(page): Promise<string[]> {
    return await page.evaluate(() => {
        // @ts-ignore
        return document.querySelector("perspective-viewer")!.getPanelNames();
    });
}

async function layoutTree(page): Promise<LayoutTree> {
    return await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        return (
            viewer.shadowRoot!.querySelector("regular-layout") as any
        ).save();
    });
}

/// Remove every panel, leaving the empty stage (the `load(client)`-style
/// boot base for the from-empty cases).
async function emptyElement(page): Promise<void> {
    await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        for (const id of viewer.getPanelNames()) {
            await viewer.removePanel(id);
        }
    });
}

test.describe("Adding panels, full-stack", () => {
    test("Duplicate commits ONCE and splits the stage in half", async ({
        page,
    }) => {
        await armCommitCounter(page);
        const [source] = await panelNames(page);
        const viewer = page.locator("perspective-viewer");
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        await menu
            .locator(".context-menu-item", { hasText: "Duplicate" })
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 2,
        );

        await assertCoherent(page);
        expect(await readCommitCount(page)).toBe(1);

        // An equal horizontal split of the two panels.
        const tree = await layoutTree(page);
        expect(tree.type).toBe("split-layout");
        expect((tree as any).sizes).toEqual([0.5, 0.5]);
        expect(treeSlots(tree).length).toBe(2);

        // The duplicate carries the source panel's exact config.
        const [dup] = (await panelNames(page)).filter((n) => n !== source);
        const [source_config, dup_config] = await page.evaluate(
            async ([a, b]) => {
                const viewer = document.querySelector(
                    "perspective-viewer",
                )! as any;
                return [
                    await viewer.save({ panel: a }),
                    await viewer.save({ panel: b }),
                ];
            },
            [source, dup],
        );

        expect(dup_config).toEqual(source_config);
    });

    test("'New' from the menu commits ONCE and is coherent", async ({
        page,
    }) => {
        await armCommitCounter(page);
        const viewer = page.locator("perspective-viewer");
        await viewer
            .locator("perspective-viewer-plugin")
            .first()
            .click({ button: "right" });

        const menu = page.locator("perspective-context-menu");
        await menu.waitFor();
        const new_item = menu.locator(".context-menu-item.has-submenu", {
            hasText: "New",
        });

        await new_item.hover();
        await new_item
            .locator(".context-menu-submenu .context-menu-item", {
                hasText: TABLE,
            })
            .click();

        await page.waitForFunction(
            () =>
                // @ts-ignore
                document.querySelector("perspective-viewer")!.getPanelNames()
                    .length === 2,
        );

        await assertCoherent(page);
        expect(await readCommitCount(page)).toBe(1);
        const tree = await layoutTree(page);
        expect((tree as any).sizes).toEqual([0.5, 0.5]);
    });

    test("addPanel commits ONCE and is coherent", async ({ page }) => {
        await armCommitCounter(page);
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.addPanel({ table, columns: ["Sales"] });
        }, TABLE);

        await assertCoherent(page);
        expect(await readCommitCount(page)).toBe(1);
        expect((await panelNames(page)).length).toBe(2);
        const tree = await layoutTree(page);
        expect((tree as any).sizes).toEqual([0.5, 0.5]);
    });

    test("restoreWorkspace from empty lands the whole tree in ONE commit", async ({
        page,
    }) => {
        await emptyElement(page);
        await armCommitCounter(page);
        await page.evaluate(async (config) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restoreWorkspace(config);
        }, SPLIT_CONFIG);

        await assertCoherent(page);

        // The saved tree mounts as ONE `restore` commit — restored panels
        // must never transit synthetic equal-split inserts.
        expect(await readCommitCount(page)).toBe(1);
        // Panel ids are GENERATED (the config's `panels` keys are
        // restore-time aliases) — assert the structure, not the names.
        const tree = await layoutTree(page);
        expect((tree as any).sizes).toEqual([0.5, 0.5]);
        expect(treeSlots(tree).length).toBe(2);
    });

    test("upsert restore() on an empty element places one panel in ONE commit", async ({
        page,
    }) => {
        await emptyElement(page);
        await armCommitCounter(page);

        // The blocks/editable boot path: `restore({table})` against an empty
        // element creates and places the first panel.
        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restore({ table, title: "First" });
        }, TABLE);

        await assertCoherent(page);
        expect(await readCommitCount(page)).toBe(1);
        expect((await panelNames(page)).length).toBe(1);
    });
});
