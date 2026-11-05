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

const tab = (...tabs: string[]) => ({ type: "tab-layout", tabs, selected: 0 });

const split = (orientation: string, sizes: number[], children: any[]) => ({
    type: "split-layout",
    orientation,
    sizes,
    children,
});

const THREE_PANELS = {
    layout: split(
        "horizontal",
        [1 / 3, 1 / 3, 1 / 3],
        [tab("one"), tab("two"), tab("three")],
    ),
    panels: {
        one: { table: TABLE, title: "One", plugin: "Debug" },
        two: { table: TABLE, title: "Two", plugin: "Debug" },
        three: { table: TABLE, title: "Three", plugin: "Debug" },
    },
};

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });

    await page.evaluate(async (config) => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        await viewer.restoreWorkspace(config);
        await viewer.flush();
    }, THREE_PANELS);
});

armInvariants(test);

async function try_restore(page, update) {
    return await page.evaluate(async (update) => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        const before = await viewer.saveWorkspace();
        const names = viewer.getPanelNames();
        let error = null;
        try {
            await viewer.restoreWorkspace(update);
            await viewer.flush();
        } catch (e) {
            error = e.message ?? `${e}`;
        }

        return {
            error,
            before,
            after: await viewer.saveWorkspace(),
            names,
            panels: viewer.getPanelNames(),
        };
    }, update);
}

const INVALID_LAYOUTS: [string, any, string][] = [
    [
        "an unknown panel id",
        split(
            "horizontal",
            [1 / 3, 1 / 3, 1 / 3],
            [tab("one"), tab("two"), tab("nope")],
        ),
        'unknown panel "nope"',
    ],
    [
        "a duplicated panel",
        split(
            "horizontal",
            [0.25, 0.25, 0.5],
            [tab("one"), tab("two"), tab("three", "one")],
        ),
        "more than once",
    ],
    [
        "a sizes length mismatch",
        split("horizontal", [0.5, 0.5], [tab("one"), tab("two"), tab("three")]),
        "has 2 entries for 3 children",
    ],
    [
        "a negative size",
        split(
            "horizontal",
            [1.5, -0.25, -0.25],
            [tab("one"), tab("two"), tab("three")],
        ),
        "contains -0.25",
    ],
    [
        "all-zero sizes",
        split("horizontal", [0, 0, 0], [tab("one"), tab("two"), tab("three")]),
        "sum to zero",
    ],
];

test.describe("restoreWorkspace layout validation", () => {
    for (const [name, layout, message] of INVALID_LAYOUTS) {
        test(`rejects ${name} and changes nothing`, async ({ page }) => {
            const result = await try_restore(page, { layout });
            expect(result.error).toContain("Invalid layout");
            expect(result.error).toContain(message);
            expect(result.after).toEqual(result.before);
            expect(result.panels).toEqual(result.names);
        });
    }

    test("rejects a layout that does not name the incoming panels", async ({
        page,
    }) => {
        const result = await try_restore(page, {
            layout: split("horizontal", [0.5, 0.5], [tab("a"), tab("c")]),
            panels: {
                a: { table: TABLE, plugin: "Debug" },
                b: { table: TABLE, plugin: "Debug" },
            },
        });

        expect(result.error).toContain('unknown panel "c"');
        expect(result.after).toEqual(result.before);
        expect(result.panels).toEqual(result.names);
    });

    test("drops an existing panel the layout omits", async ({ page }) => {
        const layout = split(
            "horizontal",
            [0.5, 0.5],
            [tab("one"), tab("two")],
        );
        const result = await try_restore(page, { layout });
        expect(result.error).toBeNull();
        expect(result.panels).toEqual(["one", "two"]);
        expect(result.after.layout).toEqual(layout);
        expect(Object.keys(result.after.panels).sort()).toEqual(["one", "two"]);
    });

    test("drops an incoming panel the layout omits", async ({ page }) => {
        const layout = split("horizontal", [0.5, 0.5], [tab("a"), tab("b")]);
        const result = await try_restore(page, {
            layout,
            panels: {
                a: { table: TABLE, plugin: "Debug" },
                b: { table: TABLE, plugin: "Debug" },
                c: { table: TABLE, plugin: "Debug" },
            },
        });

        expect(result.error).toBeNull();
        expect(result.panels).toEqual(["a", "b"]);
        expect(result.after.layout).toEqual(layout);
    });

    test("accepts sizes that do not sum to 1", async ({ page }) => {
        const result = await try_restore(page, {
            layout: split(
                "horizontal",
                [1, 2, 1],
                [tab("one"), tab("two"), tab("three")],
            ),
        });

        expect(result.error).toBeNull();
        expect(result.panels).toEqual(result.names);
    });

    test("rearranges the existing panels into a two-over-one grid", async ({
        page,
    }) => {
        const layout = split(
            "vertical",
            [0.55, 0.45],
            [
                split("horizontal", [0.5, 0.5], [tab("two"), tab("three")]),
                tab("one"),
            ],
        );

        const result = await try_restore(page, { layout });
        expect(result.error).toBeNull();
        expect(result.after.layout).toEqual(layout);
        expect(result.panels).toEqual(result.names);
    });

    test("stacks every panel as tabs in one cell", async ({ page }) => {
        const layout = {
            type: "tab-layout",
            tabs: ["three", "one", "two"],
            selected: 2,
        };

        const result = await try_restore(page, { layout });
        expect(result.error).toBeNull();
        expect(result.after.layout).toEqual(layout);
    });

    test("a saved layout round-trips", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")! as any;
            const token = await viewer.saveWorkspace();
            await viewer.restoreWorkspace({ layout: token.layout });
            return { token, after: await viewer.saveWorkspace() };
        });

        expect(result.after.layout).toEqual(result.token.layout);
    });
});
