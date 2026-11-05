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
    });
})(perspective);
