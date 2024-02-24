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
import * as _ from "underscore";

const data = {
    w: [1.5, 2.5, 3.5, 4.5],
    x: [1, 2, 3, 4],
    y: ["a", "b", "c", "d"],
    z: [true, false, true, false],
};

const get_random_int = function (min, max) {
    // liberally copied from stack
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

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

((perspective) => {
    test.describe("ports", function () {
        test("Should create port IDs in incremental order", async function () {
            const table = await perspective.table(data);
            const port_ids = [];
            for (let i = 0; i < 10; i++) {
                port_ids.push(await table.make_port());
            }
            expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            table.delete();
        });

        test("Should create port IDs in incremental order and allow updates on each port", async function () {
            const table = await perspective.table(data);
            const port_ids = [];

            for (let i = 0; i < 10; i++) {
                port_ids.push(await table.make_port());
            }

            expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

            for (const port_id of port_ids) {
                table.update(
                    {
                        w: [1.5],
                        x: [port_id],
                        y: ["d"],
                        z: [true],
                    },
                    { port_id }
                );
            }

            const view = await table.view();
            const output = await view.to_columns();

            expect(await table.size()).toEqual(14);

            const expected = {
                w: [
                    1.5, 2.5, 3.5, 4.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5,
                    1.5, 1.5,
                ],
                x: [1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                y: [
                    "a",
                    "b",
                    "c",
                    "d",
                    "d",
                    "d",
                    "d",
                    "d",
                    "d",
                    "d",
                    "d",
                    "d",
                    "d",
                    "d",
                ],
                z: [
                    true,
                    false,
                    true,
                    false,
                    true,
                    true,
                    true,
                    true,
                    true,
                    true,
                    true,
                    true,
                    true,
                    true,
                ],
            };

            expect(output).toEqual(expected);

            view.delete();
            table.delete();
        });

        test("Should create port IDs in incremental order and allow updates on each port, indexed", async function () {
            const table = await perspective.table(data, { index: "w" });
            const port_ids = [];

            for (let i = 0; i < 10; i++) {
                port_ids.push(await table.make_port());
            }

            expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

            for (const port_id of port_ids) {
                table.update(
                    {
                        w: [1.5],
                        x: [1],
                        y: ["a"],
                        z: [true],
                    },
                    { port_id }
                );
            }

            expect(await table.size()).toEqual(4);

            const view = await table.view();
            const output = await view.to_columns();
            expect(output).toEqual(data);

            view.delete();
            table.delete();
        });

        test("Should create port IDs in incremental order and allow random arbitrary updates on each port, indexed", async function () {
            const table = await perspective.table(data, { index: "w" });
            const port_ids = [];

            for (let i = 0; i < 10; i++) {
                port_ids.push(await table.make_port());
            }

            expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

            for (const port_id of port_ids) {
                table.update(
                    {
                        w: [1.5],
                        x: [1],
                        y: ["a"],
                        z: [true],
                    },
                    { port_id }
                );
            }

            expect(await table.size()).toEqual(4);

            const view = await table.view();
            const output = await view.to_columns();
            expect(output).toEqual(data);

            // arbitarily update from a random port, force append with new pkey
            const port = get_random_int(1, 9);
            const update_data = {
                w: [5.5],
                x: [5],
                y: ["e"],
                z: [true],
            };

            table.update(update_data, { port_id: 0 });

            const output2 = await view.to_columns();
            expect(output2).toEqual({
                w: [1.5, 2.5, 3.5, 4.5, 5.5],
                x: [1, 2, 3, 4, 5],
                y: ["a", "b", "c", "d", "e"],
                z: [true, false, true, false, true],
            });

            // and do it again but this time with null as pkey
            let port2 = get_random_int(1, 9);

            while (port2 === port) {
                port2 = get_random_int(1, 9);
            }

            const update_data2 = {
                w: [null],
                x: [6],
                y: ["f"],
                z: [true],
            };

            table.update(update_data2, { port_id: port2 });
            const output3 = await view.to_columns();
            expect(output3).toEqual({
                w: [null, 1.5, 2.5, 3.5, 4.5, 5.5],
                x: [6, 1, 2, 3, 4, 5],
                y: ["f", "a", "b", "c", "d", "e"],
                z: [true, true, false, true, false, true],
            });

            view.delete();
            table.delete();
        });

        test.describe("View notifications from different ports", function () {
            test("All views should be notified by appends on all ports", async function () {
                const table = await perspective.table(data);
                const port_ids = [];

                for (let i = 0; i < 10; i++) {
                    port_ids.push(await table.make_port());
                }

                expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                const view = await table.view();

                const view2 = await table.view({
                    group_by: ["w"],
                });

                const view3 = await table.view({
                    group_by: ["w"],
                    split_by: ["x"],
                });

                for (const port_id of port_ids) {
                    table.update(
                        {
                            w: [1.5],
                            x: [port_id],
                            y: ["d"],
                            z: [true],
                        },
                        { port_id }
                    );
                }

                const output = await view.to_columns();

                expect(await table.size()).toEqual(14);

                const expected = {
                    w: [
                        1.5, 2.5, 3.5, 4.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5,
                        1.5, 1.5, 1.5,
                    ],
                    x: [1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    y: [
                        "a",
                        "b",
                        "c",
                        "d",
                        "d",
                        "d",
                        "d",
                        "d",
                        "d",
                        "d",
                        "d",
                        "d",
                        "d",
                        "d",
                    ],
                    z: [
                        true,
                        false,
                        true,
                        false,
                        true,
                        true,
                        true,
                        true,
                        true,
                        true,
                        true,
                        true,
                        true,
                        true,
                    ],
                };

                expect(output).toEqual(expected);

                const output2 = await view2.to_columns();
                expect(output2).toEqual({
                    __ROW_PATH__: [[], [1.5], [2.5], [3.5], [4.5]],
                    w: [27, 16.5, 2.5, 3.5, 4.5],
                    x: [65, 56, 2, 3, 4],
                    y: [14, 11, 1, 1, 1],
                    z: [14, 11, 1, 1, 1],
                });

                const output3 = await view3.to_columns();
                expect(output3).toEqual({
                    __ROW_PATH__: [[], [1.5], [2.5], [3.5], [4.5]],
                    "1|w": [3, 3, null, null, null],
                    "1|x": [2, 2, null, null, null],
                    "1|y": [2, 2, null, null, null],
                    "1|z": [2, 2, null, null, null],
                    "2|w": [4, 1.5, 2.5, null, null],
                    "2|x": [4, 2, 2, null, null],
                    "2|y": [2, 1, 1, null, null],
                    "2|z": [2, 1, 1, null, null],
                    "3|w": [5, 1.5, null, 3.5, null],
                    "3|x": [6, 3, null, 3, null],
                    "3|y": [2, 1, null, 1, null],
                    "3|z": [2, 1, null, 1, null],
                    "4|w": [6, 1.5, null, null, 4.5],
                    "4|x": [8, 4, null, null, 4],
                    "4|y": [2, 1, null, null, 1],
                    "4|z": [2, 1, null, null, 1],
                    "5|w": [1.5, 1.5, null, null, null],
                    "5|x": [5, 5, null, null, null],
                    "5|y": [1, 1, null, null, null],
                    "5|z": [1, 1, null, null, null],
                    "6|w": [1.5, 1.5, null, null, null],
                    "6|x": [6, 6, null, null, null],
                    "6|y": [1, 1, null, null, null],
                    "6|z": [1, 1, null, null, null],
                    "7|w": [1.5, 1.5, null, null, null],
                    "7|x": [7, 7, null, null, null],
                    "7|y": [1, 1, null, null, null],
                    "7|z": [1, 1, null, null, null],
                    "8|w": [1.5, 1.5, null, null, null],
                    "8|x": [8, 8, null, null, null],
                    "8|y": [1, 1, null, null, null],
                    "8|z": [1, 1, null, null, null],
                    "9|w": [1.5, 1.5, null, null, null],
                    "9|x": [9, 9, null, null, null],
                    "9|y": [1, 1, null, null, null],
                    "9|z": [1, 1, null, null, null],
                    "10|w": [1.5, 1.5, null, null, null],
                    "10|x": [10, 10, null, null, null],
                    "10|y": [1, 1, null, null, null],
                    "10|z": [1, 1, null, null, null],
                });

                view3.delete();
                view2.delete();
                view.delete();
                table.delete();
            });

            test("All views should be notified by partial updates on all ports", async function () {
                const table = await perspective.table(data, { index: "w" });
                const port_ids = [];

                for (let i = 0; i < 10; i++) {
                    port_ids.push(await table.make_port());
                }

                expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                const view = await table.view();

                const view2 = await table.view({
                    group_by: ["w"],
                });

                const view3 = await table.view({
                    group_by: ["w"],
                    split_by: ["x"],
                });

                for (const port_id of port_ids) {
                    table.update(
                        {
                            w: [1.5],
                            x: [port_id],
                            y: ["d"],
                            z: [false],
                        },
                        { port_id }
                    );
                }

                const output = await view.to_columns();

                expect(await table.size()).toEqual(4);

                const expected = {
                    w: [1.5, 2.5, 3.5, 4.5],
                    x: [10, 2, 3, 4],
                    y: ["d", "b", "c", "d"],
                    z: [false, false, true, false],
                };

                expect(output).toEqual(expected);

                const output2 = await view2.to_columns();
                expect(output2).toEqual({
                    __ROW_PATH__: [[], [1.5], [2.5], [3.5], [4.5]],
                    w: [12, 1.5, 2.5, 3.5, 4.5],
                    x: [19, 10, 2, 3, 4],
                    y: [4, 1, 1, 1, 1],
                    z: [4, 1, 1, 1, 1],
                });

                const output3 = await view3.to_columns();
                expect(output3).toEqual({
                    __ROW_PATH__: [[], [1.5], [2.5], [3.5], [4.5]],
                    "2|w": [2.5, null, 2.5, null, null],
                    "2|x": [2, null, 2, null, null],
                    "2|y": [1, null, 1, null, null],
                    "2|z": [1, null, 1, null, null],
                    "3|w": [3.5, null, null, 3.5, null],
                    "3|x": [3, null, null, 3, null],
                    "3|y": [1, null, null, 1, null],
                    "3|z": [1, null, null, 1, null],
                    "4|w": [4.5, null, null, null, 4.5],
                    "4|x": [4, null, null, null, 4],
                    "4|y": [1, null, null, null, 1],
                    "4|z": [1, null, null, null, 1],
                    "10|w": [1.5, 1.5, null, null, null],
                    "10|x": [10, 10, null, null, null],
                    "10|y": [1, 1, null, null, null],
                    "10|z": [1, 1, null, null, null],
                });

                view3.delete();
                view2.delete();
                view.delete();
                table.delete();
            });
        });

        test.describe("on_update notifications from different ports", function () {
            it_old_behavior(
                "All calls to on_update should contain the port ID",
                async function (done) {
                    const table = await perspective.table(data);
                    const port_ids = [];

                    for (let i = 0; i < 10; i++) {
                        port_ids.push(await table.make_port());
                    }

                    expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                    const view = await table.view();

                    // because no updates were called in port 0, start at 1
                    let last_port_id = 1;
                    view.on_update(function (updated) {
                        expect(updated.port_id).toEqual(last_port_id);
                        if (last_port_id == 10) {
                            view.delete();
                            table.delete();
                            done();
                        } else {
                            last_port_id++;
                        }
                    });

                    for (const port_id of port_ids) {
                        table.update(
                            {
                                w: [1.5],
                                x: [1],
                                y: ["a"],
                                z: [true],
                            },
                            { port_id }
                        );
                    }
                }
            );

            it_old_behavior(
                "Only the port that was updated should be notified in on_update",
                async function (done) {
                    const table = await perspective.table(data);
                    const port_ids = [];

                    for (let i = 0; i < 10; i++) {
                        port_ids.push(await table.make_port());
                    }

                    expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                    const view = await table.view();

                    const port_id = get_random_int(1, 9);

                    view.on_update(function (updated) {
                        expect(updated.port_id).toEqual(port_id);
                        view.delete();
                        table.delete();
                        done();
                    });

                    table.update(
                        {
                            w: [1.5],
                            x: [1],
                            y: ["a"],
                            z: [true],
                        },
                        { port_id }
                    );
                }
            );

            it_old_behavior(
                "All ports should be notified in creation order, regardless of what order the update is called.",
                async function (done) {
                    const table = await perspective.table(data);
                    const port_ids = [];

                    for (let i = 0; i < 10; i++) {
                        port_ids.push(await table.make_port());
                    }

                    expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                    const view = await table.view();

                    let last_port_id = 0;
                    let num_updates = 0;

                    view.on_update(function (updated) {
                        expect(updated.port_id).toEqual(last_port_id);
                        if (last_port_id == 10 && num_updates === 10) {
                            view.delete();
                            table.delete();
                            done();
                        } else {
                            num_updates++;
                            last_port_id++;
                        }
                    });

                    const update_order = _.shuffle([
                        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
                    ]);

                    for (const port_id of update_order) {
                        table.update(
                            {
                                w: [1.5],
                                x: [1],
                                y: ["a"],
                                z: [true],
                            },
                            { port_id }
                        );
                    }
                }
            );

            it_old_behavior(
                "On update callbacks should be able to ignore updates from certain ports.",
                async function (done) {
                    const table = await perspective.table(data);
                    const update_table = await perspective.table(
                        await table.schema()
                    );
                    const port_ids = [];

                    for (let i = 0; i < 10; i++) {
                        port_ids.push(await table.make_port());
                    }

                    expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                    const view = await table.view();

                    let last_port_id = 0;
                    let num_updates = 0;

                    view.on_update(
                        async function (updated) {
                            expect(updated.port_id).toEqual(last_port_id);

                            if (![0, 5, 7, 8, 9].includes(updated.port_id)) {
                                update_table.update(updated.delta);
                            }

                            if (last_port_id == 10 && num_updates === 10) {
                                expect(await update_table.size()).toEqual(6);
                                const update_view = await update_table.view();
                                const result = await update_view.to_columns();
                                expect(result).toEqual({
                                    w: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
                                    x: [1, 2, 3, 4, 6, 10],
                                    y: ["a", "a", "a", "a", "a", "a"],
                                    z: [true, true, true, true, true, true],
                                });
                                update_view.delete();
                                update_table.delete();
                                view.delete();
                                table.delete();
                                done();
                            } else {
                                num_updates++;
                                last_port_id++;
                            }
                        },
                        { mode: "row" }
                    );

                    const update_order = _.shuffle([
                        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
                    ]);

                    for (const port_id of update_order) {
                        table.update(
                            {
                                w: [1.5],
                                x: [port_id],
                                y: ["a"],
                                z: [true],
                            },
                            { port_id }
                        );
                    }
                }
            );
        });

        test.describe("deltas", function () {
            it_old_behavior(
                "Deltas should be unique to each port",
                async function (done) {
                    const table = await perspective.table(data);
                    const port_ids = [];

                    for (let i = 0; i < 10; i++) {
                        port_ids.push(await table.make_port());
                    }

                    expect(port_ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                    const view = await table.view();

                    let update_count = 0;

                    view.on_update(
                        async function (updated) {
                            const _t = await perspective.table(updated.delta);
                            const _v = await _t.view();
                            const result = await _v.to_columns();

                            if (updated.port_id == first_port) {
                                expect(result).toEqual({
                                    w: [100],
                                    x: [first_port],
                                    y: ["first port"],
                                    z: [false],
                                });
                            } else if (updated.port_id == second_port) {
                                expect(result).toEqual({
                                    w: [200],
                                    x: [second_port],
                                    y: ["second port"],
                                    z: [true],
                                });
                            }

                            update_count++;

                            if (update_count === 2) {
                                _v.delete();
                                _t.delete();
                                view.delete();
                                table.delete();
                                done();
                            }
                        },
                        { mode: "row" }
                    );

                    const first_port = get_random_int(0, 10);
                    let second_port = get_random_int(0, 10);

                    while (second_port === first_port) {
                        second_port = get_random_int(0, 10);
                    }

                    table.update(
                        {
                            w: [100],
                            x: [first_port],
                            y: ["first port"],
                            z: [false],
                        },
                        { port_id: first_port }
                    );

                    table.update(
                        {
                            w: [200],
                            x: [second_port],
                            y: ["second port"],
                            z: [true],
                        },
                        { port_id: second_port }
                    );
                }
            );
        });

        test.describe("Cross-table port operations", function () {
            it_old_behavior(
                "Should allow a client-server round trip without loops",
                async function (done) {
                    const client_table = await perspective.table(data);
                    const server_table = await perspective.table(data);
                    const client_port = await client_table.make_port();

                    // "get rid" of a random number of ports by creating them
                    for (let i = 0; i < get_random_int(5, 20); i++) {
                        await server_table.make_port();
                    }

                    const server_port = await server_table.make_port();

                    expect(client_port).toBeLessThan(server_port);

                    const client_view = await client_table.view();

                    let CLIENT_TO_SERVER_UPDATES = 0;

                    client_view.on_update(
                        async (updated) => {
                            if (updated.port_id === client_port) {
                                server_table.update(updated.delta, {
                                    port_id: server_port,
                                });
                                CLIENT_TO_SERVER_UPDATES++;
                            } else {
                                // Should not pass forward that update, and break
                                // the chain.
                                expect(CLIENT_TO_SERVER_UPDATES).toEqual(1);
                            }
                        },
                        { mode: "row" }
                    );

                    const server_view = await server_table.view();

                    server_view.on_update(
                        async (updated) => {
                            if (updated.port_id !== server_port) {
                                client_table.update(updated.delta);
                            } else {
                                // update is trapped in this state - assert correct
                                // state and exit the test.
                                expect(await client_table.size()).toEqual(8);
                                expect(await server_table.size()).toEqual(8);
                                client_view.delete();
                                server_view.delete();
                                client_table.delete();
                                server_table.delete();
                                done();
                            }
                        },
                        { mode: "row" }
                    );

                    // this should go to the server and round trip back to the
                    // client, but stop when it gets to the client again.
                    client_table.update(data, { port_id: client_port });
                }
            );

            it_old_behavior(
                "Should allow a client-server round trip without loops and server updates",
                async function (done) {
                    const client_table = await perspective.table(data);
                    const server_table = await perspective.table(data);
                    const client_port = await client_table.make_port();

                    // "get rid" of a random number of ports by creating them
                    for (let i = 0; i < get_random_int(5, 20); i++) {
                        await server_table.make_port();
                    }

                    const server_port = await server_table.make_port();

                    expect(client_port).toBeLessThan(server_port);

                    const client_view = await client_table.view();

                    let CLIENT_TO_SERVER_UPDATES = 0;

                    client_view.on_update(
                        async (updated) => {
                            if (updated.port_id === client_port) {
                                server_table.update(updated.delta, {
                                    port_id: server_port,
                                });
                                CLIENT_TO_SERVER_UPDATES++;
                            } else {
                                // Should not pass forward that update, and break
                                // the chain.
                                expect(
                                    CLIENT_TO_SERVER_UPDATES
                                ).toBeLessThanOrEqual(2);
                            }
                        },
                        { mode: "row" }
                    );

                    const server_view = await server_table.view();

                    server_view.on_update(
                        async (updated) => {
                            if (updated.port_id !== server_port) {
                                client_table.update(updated.delta);
                            } else {
                                // update is trapped in this state - assert correct
                                // state and exit the test.
                                expect(await client_table.size()).toEqual(16);
                                expect(await server_table.size()).toEqual(16);
                                client_view.delete();
                                server_view.delete();
                                client_table.delete();
                                server_table.delete();
                                done();
                            }
                        },
                        { mode: "row" }
                    );

                    // this should go to the server and round trip back to the
                    // client, but stop when it gets to the client again.
                    client_table.update(data, { port_id: client_port });

                    // this should go to the client
                    server_table.update(data);

                    // this should go to the server
                    client_table.update(data, { port_id: client_port });
                }
            );

            it_old_behavior(
                "Should allow multi client-server round trips without loops",
                async function (done) {
                    const client_table = await perspective.table(data, {
                        index: "w",
                    });
                    const client_table2 = await perspective.table(data, {
                        index: "w",
                    });
                    const server_table = await perspective.table(data, {
                        index: "w",
                    });
                    const client_port = await client_table.make_port();
                    const client_port2 = await client_table2.make_port();

                    // "get rid" of a random number of ports by creating them
                    for (let i = 0; i < get_random_int(5, 20); i++) {
                        await server_table.make_port();
                    }

                    const server_port = await server_table.make_port();
                    const server_port2 = await server_table.make_port();

                    expect(client_port).toBeLessThan(server_port);
                    expect(client_port2).toBeLessThan(server_port);
                    expect(client_port).toBeLessThan(server_port2);
                    expect(client_port2).toBeLessThan(server_port2);

                    // port numbers can be equal between clients
                    expect(client_port2).toEqual(client_port);

                    const client_view = await client_table.view();
                    const client_view2 = await client_table2.view();

                    client_view.on_update(
                        async (updated) => {
                            // client1 and server handlers are as minimal as can be
                            if (updated.port_id === client_port) {
                                server_table.update(updated.delta, {
                                    port_id: server_port,
                                });
                            }
                        },
                        { mode: "row" }
                    );

                    client_view2.on_update(
                        async (updated) => {
                            // client2 only reads updates from other clients
                            const results = await client_view2.to_columns();
                            expect(results).toEqual({
                                w: [1.5, 2.5, 3.5, 4.5],
                                x: [1, 2, 300, 4],
                                y: ["a", "b", "ccc", "d"],
                                z: [true, false, true, false],
                            });
                            expect(await client_view.to_columns()).toEqual(
                                results
                            );
                            expect(await server_view.to_columns()).toEqual(
                                results
                            );
                            client_view.delete();
                            client_view2.delete();
                            server_view.delete();
                            client_table.delete();
                            client_table2.delete();
                            server_table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    const server_view = await server_table.view();

                    // Simulate multiple connections to the server
                    server_view.on_update(
                        async (updated) => {
                            if (updated.port_id !== server_port) {
                                client_table.update(updated.delta);
                            }
                        },
                        { mode: "row" }
                    );

                    server_view.on_update(
                        async (updated) => {
                            if (updated.port_id !== server_port2) {
                                client_table2.update(updated.delta);
                            }
                        },
                        { mode: "row" }
                    );

                    // this should go to the server and round trip back to the
                    // client, but stop when it gets to the client again. It should
                    // reflect on the client2 table though.
                    client_table.update(
                        [
                            {
                                w: 3.5,
                                x: 300,
                                y: "ccc",
                            },
                        ],
                        { port_id: client_port }
                    );
                }
            );
        });
    });
})(perspective);
