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
        one: { table: TABLE, title: "One" },
        two: { table: TABLE, title: "Two", group_by: ["Category"] },
    },
};

const THIRDS_CONFIG = {
    layout: {
        type: "split-layout",
        orientation: "horizontal",
        sizes: [1 / 3, 1 / 3, 1 / 3],
        children: [
            { type: "tab-layout", tabs: ["one"], selected: 0 },
            { type: "tab-layout", tabs: ["two"], selected: 0 },
            { type: "tab-layout", tabs: ["three"], selected: 0 },
        ],
    },
    panels: {
        one: { table: TABLE, title: "One" },
        two: { table: TABLE, title: "Two" },
        three: { table: TABLE, title: "Three" },
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

armInvariants(test);

async function restoreWorkspace(page, config): Promise<void> {
    await page.evaluate(async (config) => {
        // @ts-ignore
        await document
            .querySelector("perspective-viewer")!
            .restoreWorkspace(config);
    }, config);
}

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

/// `restoreWorkspace` REPLACES the panel set with freshly-GENERATED panel
/// ids (the config's `panels` keys are restore-time aliases, not ids) -
/// resolve the live ids from the committed tree, whose slot order follows
/// the config's layout order.
async function slotIds(page): Promise<string[]> {
    return treeSlots(await layoutTree(page));
}

/// A layout tree with slot names replaced by their traversal INDEX -
/// restore round-trips regenerate ids by design, so only the id-agnostic
/// structure is comparable.
function normalizeTree(tree: LayoutTree): LayoutTree {
    const ids = treeSlots(tree);
    const index = new Map(ids.map((id, i) => [id, `#${i}`]));
    const walk = (node: LayoutTree): LayoutTree =>
        node.type === "tab-layout"
            ? { ...node, tabs: node.tabs.map((t) => index.get(t)!) }
            : { ...node, children: node.children.map(walk) };

    return walk(tree);
}

test.describe("Removing panels via the API", () => {
    test("removePanel commits ONCE, disposes and renormalizes", async ({
        page,
    }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const [one, two] = await slotIds(page);
        await armCommitCounter(page);
        await page.evaluate(async (id) => {
            // @ts-ignore
            await document.querySelector("perspective-viewer")!.removePanel(id);
        }, one);

        await assertCoherent(page);
        expect(await readCommitCount(page)).toBe(1);
        expect(await panelNames(page)).toEqual([two]);
        expect(treeSlots(await layoutTree(page))).toEqual([two]);

        // Disposal reaches the light DOM.
        expect(
            await page.locator(`perspective-viewer > [slot="${one}"]`).count(),
        ).toBe(0);
    });

    test("removePanel(active) retargets activation to a survivor", async ({
        page,
    }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const [one, two] = await slotIds(page);
        await page.evaluate(async (id) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            viewer.setActivePanel(id);
            await viewer.removePanel(id);
        }, one);

        await assertCoherent(page);
        const active = await page.evaluate(() => {
            // @ts-ignore
            return document
                .querySelector("perspective-viewer")!
                .getActivePanel();
        });

        expect(active).toBe(two);
    });

    test("removePanel to zero is coherent; addPanel revives the stage", async ({
        page,
    }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            for (const id of viewer.getPanelNames()) {
                await viewer.removePanel(id);
            }
        });

        await assertCoherent(page);
        expect(await panelNames(page)).toEqual([]);

        await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.addPanel({ table });
        }, TABLE);

        await assertCoherent(page);
        expect((await panelNames(page)).length).toBe(1);
    });

    test("restoreWorkspace shrink disposes the removed panels", async ({
        page,
    }) => {
        await restoreWorkspace(page, THIRDS_CONFIG);
        const prev = await slotIds(page);
        expect(prev.length).toBe(3);

        await restoreWorkspace(page, SPLIT_CONFIG);
        await assertCoherent(page);
        const names = await panelNames(page);
        expect(names.length).toBe(2);

        // Every replaced panel's plugin element left the light DOM.
        for (const id of prev.filter((id) => !names.includes(id))) {
            expect(
                await page
                    .locator(`perspective-viewer > [slot="${id}"]`)
                    .count(),
            ).toBe(0);
        }

        const tree = await layoutTree(page);
        expect((tree as any).sizes).toEqual([0.5, 0.5]);
    });

    test("restoreWorkspace(saveWorkspace()) round-trip is tree-stable", async ({
        page,
    }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const before = await layoutTree(page);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            await viewer.restoreWorkspace(await viewer.saveWorkspace());
        });

        await assertCoherent(page);

        // The round-trip REPLACES the panels (fresh generated ids), so the
        // tree is comparable only modulo ids.
        expect(normalizeTree(await layoutTree(page))).toEqual(
            normalizeTree(before),
        );

        expect((await panelNames(page)).length).toBe(2);
    });
});
