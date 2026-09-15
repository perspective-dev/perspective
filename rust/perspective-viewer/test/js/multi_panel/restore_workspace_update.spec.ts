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
        one: { table: TABLE, title: "One", plugin: "Debug" },
        two: { table: TABLE, title: "Two", plugin: "Debug" },
    },
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await restore(page, SPLIT_CONFIG);
});

armInvariants(test);

async function restore(page, config) {
    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        await viewer.restoreWorkspace(config);
        // @ts-ignore
        await viewer.flush();
    }, config);
}

async function save(page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return await viewer.saveWorkspace();
    });
}

async function panel_names(page): Promise<string[]> {
    return await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return viewer.getPanelNames();
    });
}

async function num_rows(page, id): Promise<number> {
    return await page.evaluate(async (id) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        const view = await viewer.getView({ panel: id });
        return await view.num_rows();
    }, id);
}

async function host_property(page, name): Promise<string> {
    return await page.evaluate((name) => {
        const viewer = document.querySelector("perspective-viewer")!;
        return getComputedStyle(viewer).getPropertyValue(name).trim();
    }, name);
}

async function active_state(page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        return {
            // @ts-ignore
            active: viewer.getActivePanel(),
            // @ts-ignore
            settings: (await viewer.save()).settings,
        };
    });
}

test.describe("restoreWorkspace update semantics", () => {
    test("global_filters alone keeps the panels and filters them", async ({
        page,
    }) => {
        const names = await panel_names(page);
        const before = await num_rows(page, names[0]);
        await restore(page, { global_filters: [["Region", "==", "West"]] });
        expect(await panel_names(page)).toEqual(names);
        expect(await num_rows(page, names[0])).toBeLessThan(before);
        expect(await num_rows(page, names[1])).toBeLessThan(before);
        expect((await save(page)).global_filters).toEqual([
            ["Region", "==", "West"],
        ]);

        await restore(page, { palette: {} });
        expect((await save(page)).global_filters).toEqual([
            ["Region", "==", "West"],
        ]);

        await restore(page, { global_filters: null });
        expect(await panel_names(page)).toEqual(names);
        expect(await num_rows(page, names[0])).toBe(before);
        expect((await save(page)).global_filters).toBeUndefined();
    });

    test("palette alone keeps the panels; null clears it", async ({ page }) => {
        const names = await panel_names(page);
        await restore(page, {
            palette: { "--psp-user--color-hot": "#ff0000" },
        });

        expect(await panel_names(page)).toEqual(names);
        expect(await host_property(page, "--psp-user--color-hot")).toBe(
            "#ff0000",
        );

        await restore(page, { global_filters: [] });
        expect(await host_property(page, "--psp-user--color-hot")).toBe(
            "#ff0000",
        );

        await restore(page, { palette: null });
        expect(await host_property(page, "--psp-user--color-hot")).toBe("");
        expect(await panel_names(page)).toEqual(names);
    });

    test("layout alone re-arranges the existing panels by id", async ({
        page,
    }) => {
        const names = await panel_names(page);
        await restore(page, {
            layout: { type: "tab-layout", tabs: names, selected: 1 },
        });

        expect(await panel_names(page)).toEqual(names);
        const token = await save(page);
        expect(token.layout.type).toBe("tab-layout");
        expect(token.layout.tabs).toEqual(names);
        expect(token.layout.selected).toBe(1);
    });

    test("masters alone promotes and null demotes existing panels", async ({
        page,
    }) => {
        const names = await panel_names(page);
        await restore(page, { masters: [names[0]] });
        expect((await save(page)).masters).toEqual([names[0]]);
        expect(await panel_names(page)).toEqual(names);

        await restore(page, { masters: null });
        expect((await save(page)).masters).toBeUndefined();
    });

    test("a master is immune to a global_filters-only update", async ({
        page,
    }) => {
        const names = await panel_names(page);
        const before = await num_rows(page, names[0]);
        await restore(page, { masters: [names[0]] });
        await restore(page, { global_filters: [["Region", "==", "West"]] });
        expect(await num_rows(page, names[0])).toBe(before);
        expect(await num_rows(page, names[1])).toBeLessThan(before);
    });

    test("active alone opens the settings on that panel; null closes them", async ({
        page,
    }) => {
        const names = await panel_names(page);
        await restore(page, { active: names[1] });
        expect(await active_state(page)).toEqual({
            active: names[1],
            settings: true,
        });

        await restore(page, { global_filters: [] });
        expect(await active_state(page)).toEqual({
            active: names[1],
            settings: true,
        });

        await restore(page, { active: null });
        expect((await active_state(page)).settings).toBe(false);
        expect(await panel_names(page)).toEqual(names);
    });

    test("panels present still replaces every panel", async ({ page }) => {
        const names = await panel_names(page);
        await restore(page, {
            panels: { only: { table: TABLE, title: "Only", plugin: "Debug" } },
        });

        const after = await panel_names(page);
        expect(after.length).toBe(1);
        expect(names).not.toContain(after[0]);
        const token = await save(page);
        expect(Object.values(token.panels).map((p: any) => p.title)).toEqual([
            "Only",
        ]);
    });
});
