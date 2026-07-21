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

const TABLE = "load-viewer-csv";

/// A two-panel side-by-side whole-element config.
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

/// A two-panel config designating the first panel a master (filter source).
const MASTER_CONFIG = {
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
        two: { table: TABLE, title: "Two" },
    },
    masters: ["one"],
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

async function save(page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return await viewer.save();
    });
}

async function saveWorkspace(page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return await viewer.saveWorkspace();
    });
}

async function restoreWorkspace(page, config) {
    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        await viewer.restoreWorkspace(config);
    }, config);
}

/// Await `restoreWorkspace` inside the page, reporting whether it REJECTED —
/// so the "no `panels`" error can be asserted without unhandled rejections.
async function restoreWorkspaceThrew(page, config): Promise<boolean> {
    return await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")!;
        try {
            // @ts-ignore
            await viewer.restoreWorkspace(config);
            return false;
        } catch (_e) {
            return true;
        }
    }, config);
}

async function panel_names(page): Promise<string[]> {
    return await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return viewer.getPanelNames();
    });
}

test.describe("saveWorkspace / restoreWorkspace", () => {
    test("saveWorkspace always emits the whole-element format for one panel", async ({
        page,
    }) => {
        // On load there is a single seed panel with the `TABLE` loaded.
        const ws = await saveWorkspace(page);
        expect(ws.version).toBeTruthy();
        expect(ws.panels).toBeDefined();
        expect(Object.keys(ws.panels).length).toBe(1);

        // Panel entries are `PanelViewerConfig`s (no top-level `plugin`).
        expect(ws.plugin).toBeUndefined();
        const only = Object.values(ws.panels)[0] as any;
        expect(only.table).toBe(TABLE);
    });

    test("saveWorkspace differs from save() on a single panel", async ({
        page,
    }) => {
        // `save()` on one panel emits a flat `ViewerConfig` (a `plugin`, no
        // `panels`); `saveWorkspace()` always emits a `WorkspaceConfig` (a
        // `panels` map, no top-level `plugin`).
        const flat = await save(page);
        expect(flat.plugin).toBeTruthy();
        expect(flat.panels).toBeUndefined();

        const ws = await saveWorkspace(page);
        expect(ws.panels).toBeDefined();
        expect(ws.plugin).toBeUndefined();
    });

    test("restoreWorkspace builds a multi-panel layout", async ({ page }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        expect((await panel_names(page)).length).toBe(2);

        const ws = await saveWorkspace(page);
        expect(Object.keys(ws.panels).length).toBe(2);
        expect(ws.layout.type).toBe("split-layout");
        expect(ws.layout.children.length).toBe(2);

        // Panel configs round-trip (ids are regenerated, so compare by value).
        const by_title = Object.fromEntries(
            (Object.values(ws.panels) as any[]).map((c) => [c.title, c]),
        );
        expect(by_title["One"].group_by).toEqual(["State"]);
        expect(by_title["Two"].columns).toEqual(["Sales", "Profit"]);
    });

    test("restoreWorkspace(saveWorkspace()) is symmetric", async ({ page }) => {
        await restoreWorkspace(page, SPLIT_CONFIG);
        const one = await saveWorkspace(page);
        await restoreWorkspace(page, one);
        const two = await saveWorkspace(page);

        expect(two.layout.type).toBe(one.layout.type);
        expect(two.layout.children.length).toBe(one.layout.children.length);
        const titles = (ws) =>
            (Object.values(ws.panels) as any[]).map((c) => c.title).sort();
        expect(titles(two)).toEqual(titles(one));
    });

    test("saveWorkspace preserves master (filter-source) roles", async ({
        page,
    }) => {
        await restoreWorkspace(page, MASTER_CONFIG);
        const ws = await saveWorkspace(page);

        // One master, remapped to the fresh id of the "One" panel.
        expect(ws.masters.length).toBe(1);
        expect(ws.panels[ws.masters[0]].title).toBe("One");
    });

    test("restoreWorkspace rejects a config without a panels map", async ({
        page,
    }) => {
        const threw = await restoreWorkspaceThrew(page, {
            layout: { type: "tab-layout", tabs: ["x"], selected: 0 },
        });

        expect(threw).toBe(true);
        // The viewer is untouched — still the single seed panel.
        expect((await panel_names(page)).length).toBe(1);
    });
});
