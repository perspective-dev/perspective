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

const data = [
    { x: 1, y: "a", z: 1.5 },
    { x: 2, y: "b", z: 2.5 },
    { x: 3, y: "c", z: 3.5 },
];

async function removed_indices(perspective, indices) {
    const table = await perspective.table(indices);
    const view = await table.view();
    const result = await view.to_json();
    await view.delete();
    await table.delete();
    return result;
}

async function subscribe(view) {
    const calls = [];
    let resolve;
    const id = await view.on_remove((removed) => {
        calls.push(removed);
        if (resolve) {
            resolve(removed);
        }
    });

    const next = () =>
        new Promise((x) => {
            resolve = x;
        });

    return { calls, next, id };
}

async function fixture(perspective, index) {
    const table = await perspective.table(data, { index });
    const view = await table.view();
    const cleanup = async () => {
        await view.delete();
        await table.delete();
    };

    return { table, view, cleanup };
}

((perspective) => {
    test.describe("View.on_remove", function () {
        test("fires with the removed index values", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const sub = await subscribe(view);
            const promise = sub.next();
            await table.remove([2]);
            const removed = await promise;
            expect(removed.port_id).toEqual(0);
            expect(await removed_indices(perspective, removed.indices)).toEqual(
                [{ x: 2 }],
            );
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("carries string index values", async function () {
            const { table, view, cleanup } = await fixture(perspective, "y");
            const sub = await subscribe(view);
            const promise = sub.next();
            await table.remove(["b", "c"]);
            const removed = await promise;
            expect(await removed_indices(perspective, removed.indices)).toEqual(
                [{ y: "b" }, { y: "c" }],
            );
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("carries float index values", async function () {
            const { table, view, cleanup } = await fixture(perspective, "z");
            const sub = await subscribe(view);
            const promise = sub.next();
            await table.remove([2.5]);
            const removed = await promise;
            expect(await removed_indices(perspective, removed.indices)).toEqual(
                [{ z: 2.5 }],
            );
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("does not fire for index values which do not exist", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const sub = await subscribe(view);
            await table.remove([9]);
            await table.size();
            const promise = sub.next();
            await table.remove([1]);
            await promise;
            expect(sub.calls.length).toEqual(1);
            expect(
                await removed_indices(perspective, sub.calls[0].indices),
            ).toEqual([{ x: 1 }]);
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("does not fire for `update`", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const sub = await subscribe(view);
            await table.update([
                { x: 1, y: "aa", z: 1.5 },
                { x: 4, y: "d", z: 4.5 },
            ]);
            await table.size();
            const promise = sub.next();
            await table.remove([3]);
            await promise;
            expect(sub.calls.length).toEqual(1);
            expect(
                await removed_indices(perspective, sub.calls[0].indices),
            ).toEqual([{ x: 3 }]);
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("fires on every view of the table", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const other = await table.view({ columns: ["y"] });
            const first = await subscribe(view);
            const second = await subscribe(other);
            const promises = [first.next(), second.next()];
            await table.remove([2]);
            await Promise.all(promises);
            expect(
                await removed_indices(perspective, first.calls[0].indices),
            ).toEqual([{ x: 2 }]);
            expect(
                await removed_indices(perspective, second.calls[0].indices),
            ).toEqual([{ x: 2 }]);
            await view.remove_remove(first.id);
            await other.remove_remove(second.id);
            await other.delete();
            await cleanup();
        });

        test("fires for `replace` with the keys not re-supplied", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const sub = await subscribe(view);
            const promise = sub.next();
            await table.replace([
                { x: 2, y: "bb", z: 2.5 },
                { x: 4, y: "d", z: 4.5 },
            ]);
            const removed = await promise;
            expect(sub.calls.length).toEqual(1);
            expect(await removed_indices(perspective, removed.indices)).toEqual(
                [{ x: 1 }, { x: 3 }],
            );
            expect(await view.to_json()).toEqual([
                { x: 2, y: "bb", z: 2.5 },
                { x: 4, y: "d", z: 4.5 },
            ]);
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("fires for `clear` with every key", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const sub = await subscribe(view);
            let updates = 0;
            await view.on_update(() => {
                updates += 1;
            });
            const promise = sub.next();
            await table.clear();
            const removed = await promise;
            expect(sub.calls.length).toEqual(1);
            expect(await removed_indices(perspective, removed.indices)).toEqual(
                [{ x: 1 }, { x: 2 }, { x: 3 }],
            );
            expect(await view.to_json()).toEqual([]);
            await expect.poll(() => updates).toEqual(1);
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("`remove_remove` stops delivery", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const first = await subscribe(view);
            await view.remove_remove(first.id);
            const second = await subscribe(view);
            const promise = second.next();
            await table.remove([1]);
            await promise;
            expect(first.calls.length).toEqual(0);
            expect(second.calls.length).toEqual(1);
            await view.remove_remove(second.id);
            await cleanup();
        });

        test("`remove` accepts an Arrow of index values", async function () {
            const { table, view, cleanup } = await fixture(perspective, "x");
            const keys = await perspective.table({ x: [2, 3] });
            const keys_view = await keys.view();
            const arrow = await keys_view.to_arrow();
            const sub = await subscribe(view);
            const promise = sub.next();
            await table.remove(arrow);
            const removed = await promise;
            expect(await removed_indices(perspective, removed.indices)).toEqual(
                [{ x: 2 }, { x: 3 }],
            );

            expect(await view.to_json()).toEqual([{ x: 1, y: "a", z: 1.5 }]);
            await keys_view.delete();
            await keys.delete();
            await view.remove_remove(sub.id);
            await cleanup();
        });

        test("`remove` rejects an Arrow without the index column", async function () {
            const { table, cleanup } = await fixture(perspective, "x");
            const keys = await perspective.table({ q: [2] });
            const keys_view = await keys.view();
            const arrow = await keys_view.to_arrow();
            let message = "";
            try {
                await table.remove(arrow);
            } catch (error) {
                message = error.message;
            }

            expect(message).toContain("missing index column");
            await keys_view.delete();
            await keys.delete();
            await cleanup();
        });
    });
})(perspective);
