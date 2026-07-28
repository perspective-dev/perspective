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

// Regression spec for the activation host-theme mirror. The host `theme`
// attribute is DERIVED state — always the active panel's own theme, else the
// registry default. `retarget_active`'s mirror once captured that value
// eagerly and stamped it from a spawned future, so a `restore({theme})`
// racing an unawaited `load()` (the docs-site boot pattern) set the pin and
// stamped the host in between — and the stale default then clobbered the
// host ~1ms later, leaving light chrome around a dark panel.

import { test, expect } from "../helpers.ts";
import { armInvariants } from "./harness.ts";

const TABLE = "load-viewer-csv";
const VIEWER_COUNT = 10;

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

armInvariants(test);

test(`unawaited load + restore({theme}) holds the host theme attribute across ${VIEWER_COUNT} viewers`, async ({
    page,
}) => {
    test.setTimeout(120_000);
    const results = await page.evaluate(
        async ({ tableName, count }) => {
            const worker = (window as any).__TEST_WORKER__;
            const out: {
                i: number;
                immediate: string | null;
                settled: string | null;
                saved: string | undefined;
            }[] = [];
            const viewers: any[] = [];
            for (let i = 0; i < count; i++) {
                const table = await worker.open_table(tableName);
                const v = document.createElement("perspective-viewer") as any;
                document.body.appendChild(v);
                viewers.push(v);
                while (v.getAttribute("theme") === null) {
                    await new Promise((x) => setTimeout(x, 5));
                }

                v.load(table);
                await v.restore({ theme: "Pro Dark", columns: ["Sales"] });
                out.push({
                    i,
                    immediate: v.getAttribute("theme"),
                    settled: null,
                    saved: undefined,
                });
            }

            // The stale-capture clobber landed ~1ms after `restore`
            // resolved; it surfaces only after settle.
            await new Promise((x) => setTimeout(x, 250));
            for (let i = 0; i < count; i++) {
                out[i].settled = viewers[i].getAttribute("theme");
                out[i].saved = (await viewers[i].save()).theme;
            }

            return out;
        },
        { tableName: TABLE, count: VIEWER_COUNT },
    );

    for (const { i, immediate, settled, saved } of results) {
        expect
            .soft(immediate, `viewer ${i} immediately after restore`)
            .toBe("Pro Dark");
        expect.soft(settled, `viewer ${i} after 250ms settle`).toBe("Pro Dark");
        expect.soft(saved, `viewer ${i} save().theme`).toBe("Pro Dark");
    }
});

test("tab activation re-derives the host theme from the newly-active panel", async ({
    page,
}) => {
    await page.evaluate(async (table) => {
        const viewer = document.querySelector("perspective-viewer")! as any;
        await viewer.resetThemes(["Pro Light", "Pro Dark"]);
        await viewer.restoreWorkspace({
            layout: { type: "tab-layout", tabs: ["one", "two"], selected: 0 },
            panels: {
                one: { table, title: "One", theme: "Pro Dark" },
                two: { table, title: "Two" },
            },
        });
    }, TABLE);

    // `restoreWorkspace` regenerates panel ids; resolve them from the tree
    // (slot order follows the config's layout order).
    const [one, two] = await page.evaluate(() => {
        const viewer = document.querySelector("perspective-viewer")!;
        const tree = (
            viewer.shadowRoot!.querySelector("regular-layout") as any
        ).save();
        return tree.tabs;
    });

    const hostTheme = () =>
        page.evaluate(() =>
            document.querySelector("perspective-viewer")!.getAttribute("theme"),
        );

    await expect.poll(hostTheme).toBe("Pro Dark");
    await page.locator(`perspective-viewer-tab[slot="tab-${two}"]`).click();
    await expect.poll(hostTheme).toBe("Pro Light");
    await page.locator(`perspective-viewer-tab[slot="tab-${one}"]`).click();
    await expect.poll(hostTheme).toBe("Pro Dark");
});
