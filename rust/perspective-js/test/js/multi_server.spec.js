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

import { test, expect } from "@perspective-dev/test";
import perspective from "./perspective_client";
import { make_client, PerspectiveServer } from "@perspective-dev/client";

((perspective) => {
    test.describe("Multiple Server instances", function () {
        test("Construct Table from remote View", async function ({ page }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const [json0, json1] = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,2\n3,4");
                const view0 = await table0.view();
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                const json0 = await view0.to_json();
                const json1 = await view1.to_json();
                return [json0, json1];
            });

            expect(json0).toEqual(json1);
        });

        test("View on_update transfers to new table", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const [json0, json1] = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,2\n3,4");
                const view0 = await table0.view();
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                const { promise, resolve } = Promise.withResolvers();
                await view1.on_update(() => resolve());
                await table0.update([{ x: 6 }]);
                await promise;
                const json0 = await view0.to_json();
                const json1 = await view1.to_json();
                return [json0, json1];
            });

            expect(json0).toEqual(json1);
        });

        test("Removes transfer to new table", async function ({ page }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const [json0, json1] = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,2\n3,4", {
                    index: "x",
                });
                const view0 = await table0.view();
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                const { promise, resolve } = Promise.withResolvers();
                await view1.on_update(() => resolve());
                await table0.remove([1]);
                await promise;
                const json0 = await view0.to_json();
                const json1 = await view1.to_json();
                return [json0, json1];
            });

            expect(json0).toEqual([{ x: 3, y: 4 }]);
            expect(json0).toEqual(json1);
        });

        test("Replace transfers to an unindexed remote Table", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const [json0, json1] = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const sync = async (view0, view1, action) => {
                    const { promise, resolve } = Promise.withResolvers();
                    const token = await view1.on_update(async () => {
                        const [x, y] = await Promise.all([
                            view0.to_json(),
                            view1.to_json(),
                        ]);

                        if (JSON.stringify(x) === JSON.stringify(y)) {
                            resolve();
                        }
                    });

                    await action();
                    await Promise.race([
                        promise,
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);

                    await view1.remove_update(token);
                };

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,2\n3,4");
                const view0 = await table0.view();
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                await sync(view0, view1, () =>
                    table0.replace([
                        { x: 5, y: 6 },
                        { x: 7, y: 8 },
                    ]),
                );

                return [await view0.to_json(), await view1.to_json()];
            });

            expect(json0).toEqual([
                { x: 5, y: 6 },
                { x: 7, y: 8 },
            ]);

            expect(json1).toEqual(json0);
        });

        test("Clear transfers to an unindexed remote Table", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const [json0, json1] = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const sync = async (view0, view1, action) => {
                    const { promise, resolve } = Promise.withResolvers();
                    const token = await view1.on_update(async () => {
                        const [x, y] = await Promise.all([
                            view0.to_json(),
                            view1.to_json(),
                        ]);

                        if (JSON.stringify(x) === JSON.stringify(y)) {
                            resolve();
                        }
                    });

                    await action();
                    await Promise.race([
                        promise,
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);

                    await view1.remove_update(token);
                };

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,2\n3,4");
                const view0 = await table0.view();
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                await sync(view0, view1, () => table0.clear());
                return [await view0.to_json(), await view1.to_json()];
            });

            expect(json0).toEqual([]);
            expect(json1).toEqual([]);
        });

        test("Replace transfers to a remote Table whose View omits the index", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const [json0, json1] = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const sync = async (view0, view1, action) => {
                    const { promise, resolve } = Promise.withResolvers();
                    const token = await view1.on_update(async () => {
                        const [x, y] = await Promise.all([
                            view0.to_json(),
                            view1.to_json(),
                        ]);

                        if (JSON.stringify(x) === JSON.stringify(y)) {
                            resolve();
                        }
                    });

                    await action();
                    await Promise.race([
                        promise,
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);

                    await view1.remove_update(token);
                };

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,2\n3,4", {
                    index: "x",
                });

                const view0 = await table0.view({ columns: ["y"] });
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                await sync(view0, view1, () =>
                    table0.replace([{ x: 1, y: 20 }]),
                );

                return [await view0.to_json(), await view1.to_json()];
            });

            expect(json0).toEqual([{ y: 20 }]);
            expect(json1).toEqual(json0);
        });

        test("Replace and clear transfer to an indexed remote Table", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const [json0, json1] = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const sync = async (view0, view1, action) => {
                    const { promise, resolve } = Promise.withResolvers();
                    const token = await view1.on_update(async () => {
                        const [x, y] = await Promise.all([
                            view0.to_json(),
                            view1.to_json(),
                        ]);

                        if (JSON.stringify(x) === JSON.stringify(y)) {
                            resolve();
                        }
                    });

                    await action();
                    await Promise.race([
                        promise,
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);

                    await view1.remove_update(token);
                };

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,2\n3,4", {
                    index: "x",
                });

                const view0 = await table0.view();
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                await sync(view0, view1, () =>
                    table0.replace([
                        { x: 3, y: 40 },
                        { x: 5, y: 6 },
                    ]),
                );

                const replaced = [await view0.to_json(), await view1.to_json()];
                await sync(view0, view1, () => table0.clear());
                return [
                    replaced,
                    [await view0.to_json(), await view1.to_json()],
                ];
            });

            expect(json0[0]).toEqual([
                { x: 3, y: 40 },
                { x: 5, y: 6 },
            ]);

            expect(json0[1]).toEqual(json0[0]);
            expect(json1).toEqual([[], []]);
        });

        test("Dissolved groups transfer to a remote Table", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const result = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const sorted = (rows) =>
                    rows.map((row) => JSON.stringify(row)).sort();

                const rows_of = async (view) => {
                    const table = await worker1.table(await view.to_arrow());
                    const flat = await table.view();
                    const rows = await flat.to_json();
                    await flat.delete();
                    await table.delete();
                    return rows;
                };

                const sync = async (view1, check, action) => {
                    const { promise, resolve } = Promise.withResolvers();
                    const token = await view1.on_update(async () => {
                        if (await check()) {
                            resolve();
                        }
                    });

                    await action();
                    await Promise.race([
                        promise,
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);

                    await view1.remove_update(token);
                };

                const table0 = await worker0.table("x,y\n1,a\n2,b\n3,a", {
                    index: "x",
                });

                const view0 = await table0.view({
                    group_by: ["y"],
                    columns: ["x"],
                    group_rollup_mode: "flat",
                });

                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                const same = async () =>
                    JSON.stringify(sorted(await rows_of(view0))) ===
                    JSON.stringify(sorted(await view1.to_json()));

                await sync(view1, same, () => table0.remove([2]));
                return {
                    index: [await table1.get_index()].flat(),
                    same: await same(),
                    rows: await view1.to_json(),
                };
            });

            expect(result.index).toEqual(["y"]);
            expect(result.same).toEqual(true);
            expect(result.rows.some((row) => row.y === "b")).toEqual(false);
        });

        test("Dissolved groups of a limited remote Table transfer", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const result = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const sorted = (rows) =>
                    rows.map((row) => JSON.stringify(row)).sort();

                const rows_of = async (view) => {
                    const table = await worker1.table(await view.to_arrow());
                    const flat = await table.view();
                    const rows = await flat.to_json();
                    await flat.delete();
                    await table.delete();
                    return rows;
                };

                const sync = async (view1, check, action) => {
                    const { promise, resolve } = Promise.withResolvers();
                    const token = await view1.on_update(async () => {
                        if (await check()) {
                            resolve();
                        }
                    });

                    await action();
                    await Promise.race([
                        promise,
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);

                    await view1.remove_update(token);
                };

                const table0 = await worker0.table("x,y\n1,a\n2,b\n3,c", {
                    limit: 3,
                });

                const view0 = await table0.view({
                    group_by: ["y"],
                    columns: ["x"],
                    group_rollup_mode: "flat",
                });

                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                const same = async () =>
                    JSON.stringify(sorted(await rows_of(view0))) ===
                    JSON.stringify(sorted(await view1.to_json()));

                await sync(view1, same, () =>
                    table0.update([{ x: 4, y: "d" }]),
                );
                return {
                    limit: await table1.get_limit(),
                    same: await same(),
                    rows: await view1.to_json(),
                };
            });

            expect(result.limit).toBeFalsy();
            expect(result.same).toEqual(true);
            expect(result.rows.some((row) => row.y === "a")).toEqual(false);
        });

        test("A rollup remote Table of a group_by View is unindexed", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const result = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const table0 = await worker0.table("x,y\n1,a\n2,b\n3,a", {
                    index: "x",
                });

                const view0 = await table0.view({
                    group_by: ["y"],
                    columns: ["x"],
                });

                const table1 = await worker1.table(view0);
                return {
                    index: await table1.get_index(),
                    size: await table1.size(),
                };
            });

            expect(result.index).toBeUndefined();
            expect(result.size).toEqual(3);
        });

        test("Rows leaving a remote View's filter transfer", async function ({
            page,
        }) {
            await page.goto("/rust/perspective-js/test/html/test.html");
            const result = await page.evaluate(async () => {
                let perspective = await import(
                    "http://localhost:6598/node_modules/@perspective-dev/client/dist/cdn/perspective.js"
                );

                perspective.init_client(
                    fetch(
                        "http://localhost:6598/node_modules/@perspective-dev/client/dist/wasm/perspective-js.wasm",
                    ),
                );

                const worker0 = await perspective.worker();
                const worker1 = await perspective.worker();
                const sorted = (rows) =>
                    rows.map((row) => JSON.stringify(row)).sort();

                const rows_of = async (view) => {
                    const table = await worker1.table(await view.to_arrow());
                    const flat = await table.view();
                    const rows = await flat.to_json();
                    await flat.delete();
                    await table.delete();
                    return rows;
                };

                const sync = async (view1, check, action) => {
                    const { promise, resolve } = Promise.withResolvers();
                    const token = await view1.on_update(async () => {
                        if (await check()) {
                            resolve();
                        }
                    });

                    await action();
                    await Promise.race([
                        promise,
                        new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);

                    await view1.remove_update(token);
                };

                const table0 = await worker0.table("x,y\n1,a\n2,b\n3,a", {
                    index: "x",
                });

                const view0 = await table0.view({ filter: [["y", "==", "a"]] });
                const table1 = await worker1.table(view0);
                const view1 = await table1.view();
                const same = async () =>
                    JSON.stringify(await view0.to_json()) ===
                    JSON.stringify(await view1.to_json());

                await sync(view1, same, () =>
                    table0.update([{ x: 1, y: "b" }]),
                );
                return [await view0.to_json(), await view1.to_json()];
            });

            expect(result[0]).toEqual([{ x: 3, y: "a" }]);
            expect(result[1]).toEqual(result[0]);
        });
    });
})(perspective);

function two_clients() {
    const server = new PerspectiveServer();
    const clients = [];
    for (let i = 0; i < 2; i++) {
        const session = server.make_session(async (msg) => {
            await clients[i].handle_response(msg);
        });

        clients.push(
            make_client(async (msg) => {
                await session.handle_request(msg.slice());
            }),
        );
    }

    return clients;
}

const sorted = (rows) => rows.map((row) => JSON.stringify(row)).sort();

const sync = async (view, check, action) => {
    const { promise, resolve } = Promise.withResolvers();
    const token = await view.on_update(async () => {
        if (await check()) {
            resolve();
        }
    });

    await action();
    await Promise.race([
        promise,
        new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);

    await view.remove_update(token);
};

test.describe("Derived group_by Tables across clients of one server", function () {
    test("A flat derived group_by Table replicates to another client", async function () {
        const [client0, client1] = two_clients();
        const src = await client0.table(
            { k: "integer", g: "string", x: "integer" },
            { index: "k" },
        );

        await src.update([
            { k: 1, g: "a", x: 1 },
            { k: 2, g: "b", x: 2 },
            { k: 3, g: "a", x: 3 },
            { k: 4, g: null, x: 4 },
        ]);

        const view = await src.view({
            group_by: ["g"],
            columns: ["x"],
            group_rollup_mode: "flat",
        });

        const derived = await client0.table(view, { name: "derived_flat" });
        const derived_view = await derived.view();
        const opened = await client1.open_table("derived_flat");
        const opened_view = await opened.view();
        const replica = await client1.table(opened_view);
        const replica_view = await replica.view();
        expect(await derived.get_index()).toEqual("g");
        expect(await replica.get_index()).toEqual("g");
        const same = async () =>
            JSON.stringify(sorted(await derived_view.to_json())) ===
            JSON.stringify(sorted(await replica_view.to_json()));

        const expect_same = async () => {
            const rows = sorted(await replica_view.to_json());
            expect(rows).toEqual(sorted(await derived_view.to_json()));
            return rows;
        };

        const step = async (action) => {
            await sync(replica_view, same, action);
            return await expect_same();
        };

        await expect_same();
        expect(sorted(await replica_view.to_json())).toEqual(
            sorted([
                { g: null, x: 4 },
                { g: "a", x: 4 },
                { g: "b", x: 2 },
            ]),
        );

        await step(() => src.update([{ k: 1, x: 10 }]));
        await step(() => src.update([{ k: 5, g: "c", x: 5 }]));
        expect(await step(() => src.update([{ k: 2, g: "a" }]))).toEqual(
            sorted([
                { g: null, x: 4 },
                { g: "a", x: 15 },
                { g: "c", x: 5 },
            ]),
        );

        expect(await step(() => src.remove([5]))).toEqual(
            sorted([
                { g: null, x: 4 },
                { g: "a", x: 15 },
            ]),
        );

        expect(await step(() => src.update([{ k: 6, g: null, x: 6 }]))).toEqual(
            sorted([
                { g: null, x: 10 },
                { g: "a", x: 15 },
            ]),
        );

        expect(await step(() => src.clear())).toEqual([]);
        expect(
            await step(() =>
                src.replace([
                    { k: 7, g: "z", x: 7 },
                    { k: 8, g: "z", x: 8 },
                ]),
            ),
        ).toEqual(sorted([{ g: "z", x: 15 }]));

        await replica_view.delete();
        await replica.delete();
        await opened_view.delete();
        await derived_view.delete();
        await derived.delete();
        await view.delete();
        await src.delete();
    });

    test("A flat derived Table with two group_by columns replicates with a composite index", async function () {
        const [client0, client1] = two_clients();
        const src = await client0.table("k,g,h,x\n1,a,p,1\n2,a,q,2\n3,b,p,3", {
            index: "k",
        });

        const view = await src.view({
            group_by: ["g", "h"],
            columns: ["x"],
            group_rollup_mode: "flat",
        });

        const derived = await client0.table(view, { name: "derived_flat_gh" });
        const derived_view = await derived.view();
        const opened = await client1.open_table("derived_flat_gh");
        const opened_view = await opened.view();
        const replica = await client1.table(opened_view);
        const replica_view = await replica.view();
        expect(await derived.get_index()).toEqual(["g", "h"]);
        expect(await replica.get_index()).toEqual(["g", "h"]);
        const same = async () =>
            JSON.stringify(sorted(await derived_view.to_json())) ===
            JSON.stringify(sorted(await replica_view.to_json()));

        await sync(replica_view, same, () => src.update([{ k: 2, g: "b" }]));
        expect(sorted(await replica_view.to_json())).toEqual(
            sorted(await derived_view.to_json()),
        );

        expect(sorted(await replica_view.to_json())).toEqual(
            sorted([
                { g: "a", h: "p", x: 1 },
                { g: "b", h: "p", x: 3 },
                { g: "b", h: "q", x: 2 },
            ]),
        );

        await replica_view.delete();
        await replica.delete();
        await opened_view.delete();
        await derived_view.delete();
        await derived.delete();
        await view.delete();
        await src.delete();
    });

    test("A rollup derived group_by Table stays unindexed on both clients", async function () {
        const [client0, client1] = two_clients();
        const src = await client0.table("k,g,x\n1,a,1\n2,b,2\n3,a,3", {
            index: "k",
        });

        const view = await src.view({ group_by: ["g"], columns: ["x"] });
        const derived = await client0.table(view, { name: "derived_rollup" });
        const opened = await client1.open_table("derived_rollup");
        const opened_view = await opened.view();
        const replica = await client1.table(opened_view);
        expect(await derived.get_index()).toBeUndefined();
        expect(await replica.get_index()).toBeUndefined();
        expect(await replica.size()).toEqual(3);
        await replica.delete();
        await opened_view.delete();
        await derived.delete();
        await view.delete();
        await src.delete();
    });
});
