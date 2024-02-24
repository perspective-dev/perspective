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

import { test, expect } from "@finos/perspective-test";
import perspective from "@finos/perspective";

function it_old_behavior(name, capture) {
    test(name, async function () {
        let done;
        let result = new Promise((x) => {
            done = x;
        });

        await capture(done);
        await result;
    });
}

function mock_fn() {
    let count = 0;
    let fun = () => {
        count += 1;
    };
    fun.count = () => count;
    return fun;
}

((perspective) => {
    test.describe("Delete", function () {
        test("calls all delete callbacks registered on table", async function () {
            const table = await perspective.table([{ x: 1 }]);
            const cb1 = mock_fn();
            const cb2 = mock_fn();
            table.on_delete(cb1);
            table.on_delete(cb2);
            await table.delete();
            expect(cb1.count()).toEqual(1);
            expect(cb2.count()).toEqual(1);
        });

        test("remove_delete unregisters table delete callbacks", async function () {
            const table = await perspective.table([{ x: 1 }]);
            const cb1 = mock_fn();
            const cb2 = mock_fn();
            const sub1 = await table.on_delete(cb1);
            table.on_delete(cb2);
            table.remove_delete(sub1);
            await table.delete();
            expect(cb1.count()).toEqual(0);
            expect(cb2.count()).toEqual(1);
        });

        test("calls all delete callbacks registered on view", async function () {
            const table = await perspective.table([{ x: 1 }]);
            const view = await table.view();
            const cb1 = mock_fn();
            const cb2 = mock_fn();
            view.on_delete(cb1);
            view.on_delete(cb2);
            await view.delete();
            expect(cb1.count()).toEqual(1);
            expect(cb2.count()).toEqual(1);
            await table.delete();
        });

        test("remove_delete unregisters view delete callbacks", async function () {
            const table = await perspective.table([{ x: 1 }]);
            const view = await table.view();
            const cb1 = mock_fn();
            const cb2 = mock_fn();
            const sub1 = await view.on_delete(cb1);
            view.on_delete(cb2);
            view.remove_delete(sub1);
            await view.delete();
            expect(cb1.count()).toEqual(0);
            expect(cb2.count()).toEqual(1);
            await table.delete();
        });

        it_old_behavior(
            "properly removes a failed delete callback on a table",
            async function (done) {
                const table = await perspective.table([{ x: 1 }]);

                // when a callback throws, it should delete that callback
                table.on_delete(() => {
                    throw new Error("something went wrong!");
                });

                table.delete();
                done();
            }
        );

        it_old_behavior(
            "properly removes a failed delete callback on a view",
            async function (done) {
                const table = await perspective.table([{ x: 1 }]);
                const view = await table.view();

                // when a callback throws, it should delete that callback
                view.on_delete(() => {
                    throw new Error("something went wrong!");
                });

                view.delete();
                table.delete();
                done();
            }
        );
    });
})(perspective);
