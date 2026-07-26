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

// Reactive named-table binding: a panel's `table` config is a live function
// of the client's hosted-tables set. A name that isn't hosted yet PENDS
// (no error) and binds when the table is created; a bound table deleted
// under the viewer is released (its `View` closed, so a lazy delete can
// complete and the name recreated) and rebinds when the name reappears.

import { test, expect } from "../helpers.ts";

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Reactive table lifecycle", () => {
    test("restore({table}) before the table exists pends, then binds on creation", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const worker = (window as any).__TEST_WORKER__;
            const v = document.createElement("perspective-viewer") as any;
            document.body.appendChild(v);
            await v.load(worker);
            let restoreError: string | null = null;
            try {
                await v.restore({
                    table: "lifecycle-t1",
                    columns: ["a"],
                    group_by: ["b"],
                });
            } catch (e) {
                restoreError = String(e);
            }

            const pendingSave = await v.save();

            // Creating the table must complete the bind reactively.
            await worker.table("a,b\n1,x\n2,y", { name: "lifecycle-t1" });
            let bound = null;
            for (let i = 0; i < 100 && !bound; i++) {
                bound = await v.getTable().catch(() => null);
                if (!bound) {
                    await new Promise((x) => setTimeout(x, 50));
                }
            }

            await v.flush();
            const boundSave = await v.save();
            return {
                restoreError,
                pendingTable: pendingSave.table,
                boundTable: boundSave.table,
                groupBy: boundSave.group_by,
                bound: !!bound,
            };
        });

        expect(result.restoreError).toBeNull();
        expect(result.pendingTable).toBe("lifecycle-t1");
        expect(result.bound).toBe(true);
        expect(result.boundTable).toBe("lifecycle-t1");
        expect(result.groupBy).toEqual(["b"]);
    });

    test("a lazily-deleted table is released and rebinds on re-creation", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const worker = (window as any).__TEST_WORKER__;
            const table = await worker.table("a,b\n1,x\n2,y", {
                name: "lifecycle-t2",
            });

            const v = document.createElement("perspective-viewer") as any;
            document.body.appendChild(v);
            await v.load(worker);
            await v.restore({ table: "lifecycle-t2", columns: ["a"] });
            await v.flush();

            // Deleting under the live viewer must release its `View` so the
            // lazy delete completes and the NAME becomes recreatable. NOT
            // awaited — the promise only resolves once the last view closes,
            // which is exactly what this test is probing.
            const lazyDelete = table.delete({ lazy: true });
            lazyDelete.catch(() => {});
            let recreated = null;
            let recreateError: string | null = null;
            for (let i = 0; i < 100 && !recreated; i++) {
                try {
                    recreated = await worker.table("a,b\n3,z", {
                        name: "lifecycle-t2",
                    });
                } catch (e) {
                    recreateError = String(e);
                    await new Promise((x) => setTimeout(x, 50));
                }
            }

            if (!recreated) {
                return { recreated: false, recreateError };
            }

            // ... and the panel rebinds to the NEW table.
            let bound = null;
            for (let i = 0; i < 100 && !bound; i++) {
                bound = await v.getTable().catch(() => null);
                if (!bound) {
                    await new Promise((x) => setTimeout(x, 50));
                }
            }

            await v.flush();
            const save = await v.save();
            return {
                recreated: true,
                recreateError: null,
                rebound: !!bound,
                table: save.table,
            };
        });

        expect(result.recreateError).toBeNull();
        expect(result.recreated).toBe(true);
        expect(result.rebound).toBe(true);
        expect(result.table).toBe("lifecycle-t2");
    });

    test("delete() of an errored viewer resolves", async ({ page }) => {
        const deleteError = await page.evaluate(async () => {
            const v = document.createElement("perspective-viewer") as any;
            document.body.appendChild(v);
            try {
                await v.load(Promise.reject(new Error("boom")));
            } catch {}

            try {
                await v.delete();
                return null;
            } catch (e) {
                return String(e);
            }
        });

        expect(deleteError).toBeNull();
    });
});
