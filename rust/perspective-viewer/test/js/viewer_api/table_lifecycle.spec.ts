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
                await v.restore(
                    {
                        table: "lifecycle-t1",
                        columns: ["a"],
                        group_by: ["b"],
                    },
                    { wait_for_table: true },
                );
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

    test("restore({table}) on a bound panel to an un-hosted name unbinds it, then binds the new table with the new config", async ({
        page,
    }) => {
        const pending = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const before = await viewer.save();
            let restoreError: string | null = null;
            try {
                await viewer.restore(
                    {
                        table: "lifecycle-t4",
                        columns: ["x"],
                        group_by: ["y"],
                    },
                    { wait_for_table: true },
                );
            } catch (e) {
                restoreError = String(e);
            }

            const pendingSave = await viewer.save();
            const pendingTable = await viewer.getTable().catch(() => null);
            return {
                beforeTable: before.table,
                restoreError,
                pendingTable: pendingSave.table,
                pendingColumns: pendingSave.columns,
                unbound: pendingTable === null,
            };
        });

        await expect(
            page.locator("perspective-viewer span#status"),
        ).toHaveClass(/pending/);

        const result = await page.evaluate(async () => {
            const worker = (window as any).__TEST_WORKER__;
            const viewer = document.querySelector("perspective-viewer") as any;
            await worker.table("x,y\n1,a\n2,b", { name: "lifecycle-t4" });
            let bound = null;
            for (let i = 0; i < 100 && !bound; i++) {
                bound = await viewer.getTable().catch(() => null);
                if (!bound) {
                    await new Promise((x) => setTimeout(x, 50));
                }
            }

            await viewer.flush();
            const boundSave = await viewer.save();
            return {
                boundTable: boundSave.table,
                columns: boundSave.columns,
                groupBy: boundSave.group_by,
            };
        });

        expect(pending.beforeTable).toBe("load-viewer-csv");
        expect(pending.restoreError).toBeNull();
        expect(pending.pendingTable).toBe("lifecycle-t4");
        expect(pending.pendingColumns).toEqual(["x"]);
        expect(pending.unbound).toBe(true);
        await expect(
            page.locator("perspective-viewer span#status.pending"),
        ).toHaveCount(0);
        expect(result.boundTable).toBe("lifecycle-t4");
        expect(result.columns).toEqual(["x"]);
        expect(result.groupBy).toEqual(["y"]);
    });

    test("restore({table}) on a bound panel to a hosted table with a different schema applies the config to the new table only", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const worker = (window as any).__TEST_WORKER__;
            await worker.table("x,y\n1,a\n2,b", { name: "lifecycle-t5" });
            const viewer = document.querySelector("perspective-viewer") as any;
            let restoreError: string | null = null;
            try {
                await viewer.restore({
                    table: "lifecycle-t5",
                    columns: ["x"],
                    group_by: ["y"],
                });
            } catch (e) {
                restoreError = String(e);
            }

            await viewer.flush();
            const save = await viewer.save();
            const table = await viewer.getTable();
            return {
                restoreError,
                table: save.table,
                columns: save.columns,
                groupBy: save.group_by,
                boundName: await table.get_name(),
            };
        });

        expect(result.restoreError).toBeNull();
        expect(result.table).toBe("lifecycle-t5");
        expect(result.columns).toEqual(["x"]);
        expect(result.groupBy).toEqual(["y"]);
        expect(result.boundName).toBe("lifecycle-t5");
    });

    test("restore({table}) to an un-hosted name rejects by default and leaves the panel bound", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            let restoreError: string | null = null;
            try {
                await viewer.restore({
                    table: "lifecycle-t6",
                    columns: ["x"],
                });
            } catch (e) {
                restoreError = String(e);
            }

            const table = await viewer.getTable().catch(() => null);
            return {
                restoreError,
                table: (await viewer.save()).table,
                bound: table ? await table.get_name() : null,
            };
        });

        expect(result.restoreError).toContain('Unknown table "lifecycle-t6"');
        expect(result.table).toBe("load-viewer-csv");
        expect(result.bound).toBe("load-viewer-csv");
        await expect(
            page.locator("perspective-viewer span#status"),
        ).toHaveClass(/errored/);
    });

    test("addPanel({table}) with an un-hosted name rejects by default", async ({
        page,
    }) => {
        const result = await page.evaluate(async () => {
            const viewer = document.querySelector("perspective-viewer") as any;
            const before = viewer.getPanelNames().length;
            let addError: string | null = null;
            try {
                await viewer.addPanel({ table: "lifecycle-t7" });
            } catch (e) {
                addError = String(e);
            }

            return { addError, before, after: viewer.getPanelNames().length };
        });

        expect(result.addError).toContain('Unknown table "lifecycle-t7"');
        expect(result.after).toBe(result.before + 1);
    });
});
