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

/// Two visible panels: "one" (the master candidate), "two" (the detail).
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
        two: { table: TABLE, title: "Two", columns: ["Sales", "Profit"] },
    },
};

/// Three visible panels (nested splits — a stack would auto-pause its hidden
/// tabs): "one" + "two" masters, "three" the detail.
const TRI_CONFIG = {
    layout: {
        type: "split-layout",
        orientation: "horizontal",
        sizes: [0.5, 0.5],
        children: [
            { type: "tab-layout", tabs: ["one"], selected: 0 },
            {
                type: "split-layout",
                orientation: "vertical",
                sizes: [0.5, 0.5],
                children: [
                    { type: "tab-layout", tabs: ["two"], selected: 0 },
                    { type: "tab-layout", tabs: ["three"], selected: 0 },
                ],
            },
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

async function restore(page, config) {
    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        await viewer.restore(config);
    }, config);
}

async function save(page) {
    return await page.evaluate(async () => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return await viewer.save();
    });
}

async function save_panel(page, id) {
    return await page.evaluate(async (id) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        return await viewer.savePanel(id);
    }, id);
}

async function id_by_title(page, title): Promise<string> {
    return await page.evaluate(async (title) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        for (const id of viewer.getPanelNames()) {
            // @ts-ignore
            if ((await viewer.savePanel(id)).title === title) {
                return id;
            }
        }

        throw new Error(`No panel titled "${title}"`);
    }, title);
}

async function num_rows(page, id): Promise<number> {
    return await page.evaluate(async (id) => {
        const viewer = document.querySelector("perspective-viewer")!;
        // @ts-ignore
        const view = await viewer.getViewPanel(id);
        return await view.num_rows();
    }, id);
}

/// Poll until the panel's CURRENT view reports `rows` (the overlay re-render
/// is async — a locked run swaps the bound view).
function wait_rows(page, id, rows) {
    return page.waitForFunction(
        async ({ id, rows }) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            const view = await viewer.getViewPanel(id);
            return (await view.num_rows()) === rows;
        },
        { id, rows },
    );
}

function wait_rows_below(page, id, bound) {
    return page.waitForFunction(
        async ({ id, bound }) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            const view = await viewer.getViewPanel(id);
            return (await view.num_rows()) < bound;
        },
        { id, bound },
    );
}

async function dispatch_select(page, detail) {
    await page.evaluate((detail) => {
        const viewer = document.querySelector("perspective-viewer")!;
        viewer.dispatchEvent(
            new CustomEvent("perspective-global-filter", { detail }),
        );
    }, detail);
}

/// Dispatch the click event every plugin dispatches for a body-cell click.
async function dispatch_click(page, detail) {
    await page.evaluate((detail) => {
        const viewer = document.querySelector("perspective-viewer")!;
        viewer.dispatchEvent(new CustomEvent("perspective-click", { detail }));
    }, detail);
}

/// Toggle the master/detail role via the panel context menu, like a user.
async function toggle_master(page, id, label: "Master" | "Detail") {
    await page
        .locator(`perspective-viewer [slot="${id}"]`)
        .click({ button: "right" });
    const menu = page.locator("perspective-context-menu");
    await menu.waitFor();
    await menu.locator(".context-menu-item", { hasText: label }).click();
}

test.describe("Global filters: broadcast sources", () => {
    test("a master's select event filters details invisibly; the master is immune", async ({
        page,
    }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["one"] });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);

        await dispatch_select(page, {
            panel: master,
            selected: true,
            insertFilters: [["State", "==", "Texas"]],
        });

        await wait_rows_below(page, detail, baseline);

        expect(await num_rows(page, master)).toBe(baseline);

        const token = await save(page);
        expect(token.global_filters).toEqual([["State", "==", "Texas"]]);
        expect(token.masters).toEqual([master]);
        expect((await save_panel(page, detail)).filter).toEqual([]);
        expect((await save_panel(page, master)).filter).toEqual([]);
    });

    test("a master's plain click broadcasts, subtracting its own filters", async ({
        page,
    }) => {
        const config = structuredClone(SPLIT_CONFIG) as any;
        config.panels.one.filter = [["Region", "==", "East"]];
        await restore(page, { ...config, masters: ["one"] });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);
        await dispatch_click(page, {
            panel: master,
            row: { Region: "East", State: "New York" },
            column_names: ["Sales"],
            config: {
                filter: [
                    ["Region", "==", "East"],
                    ["State", "==", "New York"],
                ],
            },
        });

        await wait_rows_below(page, detail, baseline);
        expect((await save(page)).global_filters).toEqual([
            ["State", "==", "New York"],
        ]);
    });

    test("a flat master's click falls back to the clicked cell", async ({
        page,
    }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["one"] });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);
        await dispatch_click(page, {
            panel: master,
            row: { State: "Texas", Sales: 55 },
            column_names: ["State"],
            config: { filter: [] },
        });

        await wait_rows_below(page, detail, baseline);
        expect((await save(page)).global_filters).toEqual([
            ["State", "==", "Texas"],
        ]);
    });

    test("events from non-masters are ignored", async ({ page }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["one"] });
        const detail = await id_by_title(page, "Two");

        await dispatch_click(page, {
            panel: detail,
            row: { State: "Texas" },
            column_names: ["State"],
            config: { filter: [["State", "==", "Texas"]] },
        });

        await page.waitForTimeout(100);
        expect((await save(page)).global_filters ?? []).toEqual([]);
    });
});

test.describe("Global filters: replace semantics", () => {
    test("a second selection replaces the first; deselect clears", async ({
        page,
    }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["one"] });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);

        await dispatch_select(page, {
            panel: master,
            selected: true,
            insertFilters: [["State", "==", "Texas"]],
        });

        await wait_rows_below(page, detail, baseline);
        const texas_rows = await num_rows(page, detail);
        await dispatch_select(page, {
            panel: master,
            selected: true,
            insertFilters: [["State", "==", "California"]],
        });

        await page.waitForFunction(
            async ({ id, texas_rows }) => {
                const viewer = document.querySelector("perspective-viewer")!;
                // @ts-ignore
                const view = await viewer.getViewPanel(id);
                const rows = await view.num_rows();
                return rows !== texas_rows;
            },
            { id: detail, texas_rows },
        );

        expect((await save(page)).global_filters).toEqual([
            ["State", "==", "California"],
        ]);

        // Deselect restores the unfiltered view.
        await dispatch_select(page, { panel: master, selected: false });
        await wait_rows(page, detail, baseline);
        expect((await save(page)).global_filters ?? []).toEqual([]);
    });

    test("two masters merge; demote drops only its own contribution; close drops the closed master's", async ({
        page,
    }) => {
        await restore(page, { ...TRI_CONFIG, masters: ["one", "two"] });
        const m1 = await id_by_title(page, "One");
        const m2 = await id_by_title(page, "Two");
        const detail = await id_by_title(page, "Three");
        const baseline = await num_rows(page, detail);

        await dispatch_select(page, {
            panel: m1,
            selected: true,
            insertFilters: [["Region", "==", "East"]],
        });

        await wait_rows_below(page, detail, baseline);
        const east_rows = await num_rows(page, detail);

        await dispatch_select(page, {
            panel: m2,
            selected: true,
            insertFilters: [["Category", "==", "Furniture"]],
        });

        await wait_rows_below(page, detail, east_rows);
        expect((await save(page)).global_filters).toEqual([
            ["Region", "==", "East"],
            ["Category", "==", "Furniture"],
        ]);

        await toggle_master(page, m1, "Detail");
        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return (await viewer.save()).global_filters?.length === 1;
        });

        expect((await save(page)).global_filters).toEqual([
            ["Category", "==", "Furniture"],
        ]);

        await wait_rows_below(page, m1, baseline);
        await page.evaluate((id) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            viewer.removePanel(id);
        }, m2);

        await wait_rows(page, detail, baseline);
        const token = await save(page);
        expect(token.global_filters ?? []).toEqual([]);
        expect(token.masters ?? []).toEqual([]);
    });
});

test.describe("Global filters: chips + lifecycle", () => {
    test("chips render; × removes a clause; Clear removes all", async ({
        page,
    }) => {
        await restore(page, {
            ...SPLIT_CONFIG,
            masters: ["one"],
            active: "one",
        });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);

        await dispatch_select(page, {
            panel: master,
            selected: true,
            insertFilters: [
                ["State", "==", "Texas"],
                ["Category", "==", "Furniture"],
            ],
        });

        await wait_rows_below(page, detail, baseline);
        const viewer = page.locator("perspective-viewer");
        const chips = viewer.locator("#global_filter_bar .global-filter-chip");
        await expect(chips).toHaveCount(2);
        const texas_and_furniture = await num_rows(page, detail);
        await chips.first().locator(".global-filter-chip-remove").click();

        await expect(chips).toHaveCount(1);
        await page.waitForFunction(
            async ({ id, prev }) => {
                const v = document.querySelector("perspective-viewer")!;
                // @ts-ignore
                return (await (await v.getViewPanel(id)).num_rows()) > prev;
            },
            { id: detail, prev: texas_and_furniture },
        );

        await viewer
            .locator("#global_filter_bar .global-filter-bar-clear")
            .click();
        await wait_rows(page, detail, baseline);
        expect((await save(page)).global_filters ?? []).toEqual([]);
    });

    test("a panel added while a filter is active is filtered on first paint", async ({
        page,
    }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["one"] });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);

        await dispatch_select(page, {
            panel: master,
            selected: true,
            insertFilters: [["State", "==", "Texas"]],
        });

        await wait_rows_below(page, detail, baseline);
        const filtered = await num_rows(page, detail);

        const added = await page.evaluate(async (table) => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return await viewer.addPanel({ table, title: "Added" });
        }, TABLE);

        await wait_rows(page, added, filtered);
        expect((await save_panel(page, added)).filter).toEqual([]);
    });

    test("reset clears the filter set but keeps master roles", async ({
        page,
    }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["one"] });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);

        await dispatch_select(page, {
            panel: master,
            selected: true,
            insertFilters: [["State", "==", "Texas"]],
        });

        await wait_rows_below(page, detail, baseline);
        await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            await viewer.reset();
        });

        await wait_rows(page, detail, baseline);
        const token = await save(page);
        expect(token.global_filters ?? []).toEqual([]);
        expect(token.masters).toEqual([master]);
    });

    test("perspective-global-filter-update samples every change", async ({
        page,
    }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["one"] });
        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const baseline = await num_rows(page, detail);

        await page.evaluate(() => {
            (window as any).__GF_EVENTS__ = [];
            document
                .querySelector("perspective-viewer")!
                .addEventListener("perspective-global-filter-update", ((
                    e: CustomEvent,
                ) => {
                    (window as any).__GF_EVENTS__.push(e.detail);
                }) as EventListener);
        });

        await dispatch_select(page, {
            panel: master,
            selected: true,
            insertFilters: [["State", "==", "Texas"]],
        });

        await wait_rows_below(page, detail, baseline);
        await dispatch_select(page, { panel: master, selected: false });
        await wait_rows(page, detail, baseline);

        const events = await page.evaluate(() => (window as any).__GF_EVENTS__);

        expect(events).toEqual([[["State", "==", "Texas"]], []]);
    });
});

test.describe("Global filters: persistence", () => {
    test("masters + filters round-trip; restored masters are immune; the next selection replaces the restored set", async ({
        page,
    }) => {
        await restore(page, {
            ...SPLIT_CONFIG,
            masters: ["one"],
            global_filters: [["State", "==", "Texas"]],
        });

        const master = await id_by_title(page, "One");
        const detail = await id_by_title(page, "Two");
        const master_rows = await num_rows(page, master);
        const detail_rows = await num_rows(page, detail);
        expect(detail_rows).toBeLessThan(master_rows);
        const token = await save(page);
        expect(token.masters).toEqual([master]);
        expect(token.global_filters).toEqual([["State", "==", "Texas"]]);
        await restore(page, token);
        const master2 = await id_by_title(page, "One");
        const detail2 = await id_by_title(page, "Two");
        expect((await save(page)).masters).toEqual([master2]);
        await wait_rows(page, detail2, detail_rows);
        expect(await num_rows(page, master2)).toBe(master_rows);
        await dispatch_select(page, {
            panel: master2,
            selected: true,
            insertFilters: [["Region", "==", "East"]],
        });

        await page.waitForFunction(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            const token = await viewer.save();
            return (
                JSON.stringify(token.global_filters) ===
                JSON.stringify([["Region", "==", "East"]])
            );
        });
    });

    test("an unknown master id warns and is dropped", async ({ page }) => {
        await restore(page, { ...SPLIT_CONFIG, masters: ["no-such-panel"] });
        expect((await save(page)).masters ?? []).toEqual([]);
    });
});
