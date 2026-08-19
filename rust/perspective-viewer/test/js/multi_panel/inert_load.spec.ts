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

const SECOND_CLIENT = async (name: string) => {
    const { default: perspective } = await import(
        "/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
    );

    const worker = await perspective.worker();
    await worker.table("a,b\n1,2", { name });
    const viewer = document.querySelector("perspective-viewer")!;
    // @ts-ignore  Client payload — registered inertly, no panel rebind.
    await viewer.load(worker);
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

test.describe("Inert load(Client)", () => {
    test("loading a second Client does not blank the active panel", async ({
        page,
    }) => {
        const before = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return (await viewer.save()).table;
        });
        expect(before).toBe(TABLE);
        await page.evaluate(SECOND_CLIENT, "other-table");
        const after = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            return (await viewer.save()).table;
        });
        expect(after).toBe(TABLE);
    });

    test("a panel federates its table to a second loaded client", async ({
        page,
    }) => {
        await page.evaluate(SECOND_CLIENT, "other-table");
        const config = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer")!;
            // @ts-ignore
            const id = await viewer.addPanel({ table: "other-table" });
            // @ts-ignore
            return await viewer.save({ panel: id });
        });
        expect(config.table).toBe("other-table");
    });
});

// `load(Promise)` can't classify its payload synchronously, so it RESERVES
// the first panel for exactly this call pattern; when the payload proves to
// be a `Client` (inert), the reserved panel is dropped in the epilogue —
// UNLESS a racing `restore()` claimed it (`in_flight_config_runs`). The
// docs-site gallery hit the unguarded drop: blank overlay, zero panels, an
// uncaught "No panel named" from the mid-flight restore.
test.describe("Reserved panel vs. `load(Promise<Client>)`", () => {
    test("unawaited load(Promise<Client>) + restore({table}) keeps the claimed panel", async ({
        page,
    }) => {
        const result = await page.evaluate(async (tableName) => {
            const worker = (window as any).__TEST_WORKER__;
            const v = document.createElement("perspective-viewer") as any;
            document.body.appendChild(v);
            v.load(Promise.resolve(worker));
            let restoreError: string | null = null;
            try {
                await v.restore({
                    table: tableName,
                    columns: ["Sales"],
                    settings: true,
                });
            } catch (e) {
                restoreError = String(e);
            }

            // The reserved-panel drop lands in `load`'s async epilogue,
            // after `restore` resolves.
            await new Promise((x) => setTimeout(x, 250));
            let saved: any = null;
            let saveError: string | null = null;
            try {
                saved = await v.save();
            } catch (e) {
                saveError = String(e);
            }

            return {
                restoreError,
                saveError,
                panels: v.getPanelNames(),
                table: saved?.table,
            };
        }, TABLE);

        expect(result.restoreError).toBeNull();
        expect(result.saveError).toBeNull();
        expect(result.panels.length).toBe(1);
        expect(result.table).toBe(TABLE);
    });

    test("unawaited load(Promise<Client>) with NO restore still drops the reserved panel", async ({
        page,
    }) => {
        const panels = await page.evaluate(async () => {
            const worker = (window as any).__TEST_WORKER__;
            const v = document.createElement("perspective-viewer") as any;
            document.body.appendChild(v);
            await v.load(Promise.resolve(worker));
            await new Promise((x) => setTimeout(x, 250));
            return v.getPanelNames();
        });

        expect(panels).toEqual([]);
    });

    test("unawaited load(Promise<Client>) + table-less restore evicts the claimed panel and fails the load", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const worker = (window as any).__TEST_WORKER__;
            const v = document.createElement("perspective-viewer") as any;
            document.body.appendChild(v);
            const load = v.load(Promise.resolve(worker)).then(
                () => "",
                (e: unknown) => String(e),
            );

            await v.restore({ theme: "Pro Dark" });
            const loadError = await load;
            await new Promise((x) => setTimeout(x, 250));
            return { panels: v.getPanelNames(), loadError };
        });

        expect(result.loadError).toContain("table");
        expect(result.panels).toEqual([]);
    });
});
