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

let data = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
];

let partial_change_y = [
    { x: 1, y: "string1" },
    { x: 2, y: "string2" },
];
let partial_change_z = [
    { x: 1, z: false },
    { x: 2, z: true },
];
let partial_change_y_z = [
    { x: 1, y: "string1", z: false },
    { x: 2, y: "string2", z: true },
];
let partial_change_nonseq = [
    { x: 1, y: "string1", z: false },
    { x: 4, y: "string2", z: true },
];

async function match_delta(
    perspective,
    delta,
    expected,
    formatter = "to_json"
) {
    const table = await perspective.table(delta);
    const view = await table.view();
    const result = await view[formatter]();
    expect(result).toEqual(expected);
    await view.delete();
    await table.delete();
}

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
    test.describe("Row delta", function () {
        test.describe("0-sided row delta", function () {
            it_old_behavior("returns changed rows", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let view = await table.view();
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 1, y: "string1", z: true },
                            { x: 2, y: "string2", z: false },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns changed rows, hidden sort",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        columns: ["x"],
                        sort: [["y", "desc"]],
                    });
                    console.log(await view.to_json());
                    view.on_update(
                        async function (updated) {
                            const expected = [{ x: 2 }, { x: 1 }];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows from schema",
                async function (done) {
                    let table = await perspective.table(
                        {
                            x: "integer",
                            y: "string",
                            z: "boolean",
                        },
                        { index: "x" }
                    );
                    let view = await table.view();
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: "d", z: false },
                                { x: 2, y: "b", z: false },
                                { x: 3, y: "c", z: true },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update([
                        { x: 1, y: "a", z: true },
                        { x: 2, y: "b", z: false },
                        { x: 3, y: "c", z: true },
                        { x: 1, y: "d", z: false },
                    ]);
                }
            );

            it_old_behavior("returns added rows", async function (done) {
                let table = await perspective.table(data);
                let view = await table.view();
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 1, y: "string1", z: null },
                            { x: 2, y: "string2", z: null },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns added rows from schema",
                async function (done) {
                    let table = await perspective.table({
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    });
                    let view = await table.view();
                    view.on_update(
                        async function (updated) {
                            await match_delta(perspective, updated.delta, data);
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(data);
                }
            );

            it_old_behavior("returns deleted columns", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let view = await table.view();
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 1, y: null, z: true },
                            { x: 4, y: null, z: false },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update([
                    { x: 1, y: null },
                    { x: 4, y: null },
                ]);
            });

            it_old_behavior(
                "returns changed rows in sorted context",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        sort: [["x", "desc"]],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 2, y: "string2", z: false },
                                { x: 1, y: "string1", z: true },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows in sorted context from schema",
                async function (done) {
                    let table = await perspective.table(
                        {
                            x: "integer",
                            y: "string",
                            z: "boolean",
                        },
                        { index: "x" }
                    );
                    let view = await table.view({
                        sort: [["x", "desc"]],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 4, y: "a", z: true },
                                { x: 3, y: "c", z: true },
                                { x: 2, y: "b", z: false },
                                { x: 1, y: "d", z: false },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update([
                        { x: 1, y: "a", z: true },
                        { x: 2, y: "b", z: false },
                        { x: 3, y: "c", z: true },
                        { x: 1, y: "d", z: false },
                        { x: 4, y: "a", z: true },
                    ]);
                }
            );

            it_old_behavior(
                "returns added rows in filtered context from schema",
                async function (done) {
                    let table = await perspective.table({
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    });
                    let view = await table.view({
                        filter: [["x", ">", 3]],
                    });
                    view.on_update(
                        async function (updated) {
                            await match_delta(perspective, updated.delta, [
                                { x: 4, y: "d", z: false },
                            ]);
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(data);
                }
            );

            it_old_behavior(
                "returns changed rows in non-sequential update",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view();
                    view.on_update(
                        async function (updated) {
                            const expected = partial_change_nonseq;
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_nonseq);
                }
            );
        });

        test.describe("0-sided row delta, randomized column order", function () {
            it_old_behavior("returns changed rows", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let columns = _.shuffle(await table.columns());
                let view = await table.view({
                    columns: columns,
                });
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 1, y: "string1", z: true },
                            { x: 2, y: "string2", z: false },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns changed rows from schema",
                async function (done) {
                    let table = await perspective.table(
                        {
                            x: "integer",
                            y: "string",
                            z: "boolean",
                        },
                        { index: "x" }
                    );
                    let columns = _.shuffle(await table.columns());
                    let view = await table.view({
                        columns: columns,
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { x: 1, y: "d", z: false },
                                { x: 2, y: "b", z: false },
                                { x: 3, y: "c", z: true },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update([
                        { x: 1, y: "a", z: true },
                        { x: 2, y: "b", z: false },
                        { x: 3, y: "c", z: true },
                        { x: 1, y: "d", z: false },
                    ]);
                }
            );

            it_old_behavior("returns added rows", async function (done) {
                let table = await perspective.table(data);
                let columns = _.shuffle(await table.columns());
                let view = await table.view({
                    columns: columns,
                });
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 1, y: "string1", z: null },
                            { x: 2, y: "string2", z: null },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns added rows, hidden sort",
                async function (done) {
                    let table = await perspective.table(data);
                    let view = await table.view({
                        columns: ["x"],
                        sort: [["y", "desc"]],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [{ x: 2 }, { x: 1 }];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns added rows from schema",
                async function (done) {
                    let table = await perspective.table({
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    });
                    let columns = _.shuffle(await table.columns());
                    let view = await table.view({
                        columns: columns,
                    });
                    view.on_update(
                        async function (updated) {
                            await match_delta(perspective, updated.delta, data);
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(data);
                }
            );

            it_old_behavior("returns deleted columns", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let columns = _.shuffle(await table.columns());
                let view = await table.view({
                    columns: columns,
                });
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 1, y: null, z: true },
                            { x: 4, y: null, z: false },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update([
                    { x: 1, y: null },
                    { x: 4, y: null },
                ]);
            });

            it_old_behavior(
                "returns changed rows in non-sequential update",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let columns = _.shuffle(await table.columns());
                    let view = await table.view({
                        columns: columns,
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = partial_change_nonseq;
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_nonseq);
                }
            );
        });

        test.describe("0-sided row delta, column order subset", function () {
            it_old_behavior("returns changed rows", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let view = await table.view({
                    columns: ["y"],
                });
                view.on_update(
                    async function (updated) {
                        const expected = [{ y: "string1" }, { y: "string2" }];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns changed rows from schema",
                async function (done) {
                    let table = await perspective.table(
                        {
                            x: "integer",
                            y: "string",
                            z: "boolean",
                        },
                        { index: "x" }
                    );
                    let view = await table.view({
                        columns: ["z"],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                { z: false },
                                { z: false },
                                { z: true },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update([
                        { x: 1, y: "a", z: true },
                        { x: 2, y: "b", z: false },
                        { x: 3, y: "c", z: true },
                        { x: 1, y: "d", z: false },
                    ]);
                }
            );

            it_old_behavior("returns added rows", async function (done) {
                let table = await perspective.table(data);
                let view = await table.view({
                    columns: ["y"],
                });
                view.on_update(
                    async function (updated) {
                        const expected = [{ y: "string1" }, { y: "string2" }];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns added rows from schema",
                async function (done) {
                    let table = await perspective.table({
                        x: "integer",
                        y: "string",
                        z: "boolean",
                    });
                    let view = await table.view({
                        columns: ["z"],
                    });
                    view.on_update(
                        async function (updated) {
                            await match_delta(perspective, updated.delta, [
                                { z: true },
                                { z: false },
                                { z: true },
                                { z: false },
                            ]);
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(data);
                }
            );

            it_old_behavior("returns deleted rows", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let view = await table.view({
                    columns: ["y"],
                });
                view.on_update(
                    async function (updated) {
                        const expected = [{ y: null }, { y: null }];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update([
                    { x: 1, y: null },
                    { x: 4, y: null },
                ]);
            });

            it_old_behavior(
                "returns changed rows in non-sequential update",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        columns: ["y"],
                    });
                    view.on_update(
                        async function (updated) {
                            await match_delta(perspective, updated.delta, [
                                { y: "string1" },
                                { y: "string2" },
                            ]);
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_nonseq);
                }
            );
        });

        test.describe("1-sided row delta", function () {
            it_old_behavior("returns changed rows", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let view = await table.view({
                    group_by: ["y"],
                    aggregates: { y: "distinct count", z: "distinct count" },
                });
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 1, y: 1, z: 1 },
                            { x: 2, y: 1, z: 1 },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            test.skip("returns changed rows, unique", async function () {
                // FIXME: the delta doesn't seem to trigger if the
                // cell is invalidated, only if the actual values are
                // different. This feels off behavior-wise.
                const table = await perspective.table(
                    {
                        x: [1, 2, 3, 4],
                        y: ["a", "a", "a", "a"],
                        z: [100, 200, 100, 200],
                    },
                    { index: "x" }
                );

                const view = await table.view({
                    group_by: ["z"],
                    aggregates: { y: "unique" },
                });

                expect(await view.to_columns()).toEqual({
                    __ROW_PATH__: [[], [100], [200]],
                    x: [10, 4, 6],
                    y: ["a", "a", "a"],
                    z: [600, 200, 400],
                });

                view.on_update(
                    async function (updated) {
                        console.log(await view.to_columns());
                        const expected = [
                            { x: 10, y: null, z: 600 }, // total
                            { x: 6, y: null, z: 400 },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        await view.delete();
                        await table.delete();
                        done();
                    },
                    { mode: "row" }
                );

                table.update({
                    x: [4],
                    y: ["a"],
                    z: [200],
                });
            });

            it_old_behavior(
                "returns changed rows, column range",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        columns: ["x"],
                        aggregates: {
                            y: "distinct count",
                            z: "distinct count",
                        },
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [{ x: 1 }, { x: 2 }];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns nothing when updated data is not in pivot",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        aggregates: {
                            y: "distinct count",
                            z: "distinct count",
                        },
                    });
                    view.on_update(
                        async function (updated) {
                            await match_delta(perspective, updated.delta, []);
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_z);
                }
            );

            it_old_behavior("returns added rows", async function (done) {
                let table = await perspective.table(data);
                let view = await table.view({
                    group_by: ["y"],
                    aggregates: { y: "distinct count", z: "distinct count" },
                });
                view.on_update(
                    async function (updated) {
                        const expected = [
                            { x: 13, y: 6, z: 3 },
                            { x: 1, y: 1, z: 1 },
                            { x: 2, y: 1, z: 1 },
                        ];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns added rows, column range",
                async function (done) {
                    let table = await perspective.table(data);
                    let view = await table.view({
                        group_by: ["y"],
                        columns: ["z"],
                        aggregates: {
                            y: "distinct count",
                            z: "distinct count",
                        },
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [{ z: 3 }, { z: 1 }, { z: 1 }];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior("returns deleted columns", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let view = await table.view({
                    group_by: ["y"],
                    aggregates: { y: "distinct count", z: "distinct count" },
                });
                view.on_update(
                    async function (updated) {
                        // underlying data changes, but only total aggregate row is affected
                        const expected = [{ x: 10, y: 3, z: 2 }];
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update([
                    { x: 1, y: null },
                    { x: 4, y: null },
                ]);
            });

            it_old_behavior(
                "returns changed rows in non-sequential update",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        aggregates: {
                            y: "distinct count",
                            z: "distinct count",
                        },
                    });
                    view.on_update(
                        async function (updated) {
                            // aggregates are sorted, in this case by string comparator - "string1" and "string2" are at the end
                            const expected = [
                                { x: 1, y: 1, z: 1 },
                                { x: 4, y: 1, z: 1 },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_nonseq);
                }
            );

            it_old_behavior(
                "Returns appended rows, hidden sort",
                async function (done) {
                    const table = await perspective.table({
                        x: [1, 2, 3, 4],
                        y: ["A", "B", "C", "D"],
                    });
                    const view = await table.view({
                        group_by: ["y"],
                        sort: [["y", "desc"]],
                        columns: ["x"],
                    });

                    view.on_update(
                        async function (updated) {
                            const expected = [{ x: 13 }, { x: 2 }, { x: 1 }];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update(partial_change_y);
                }
            );
        });

        test.describe("2-sided row delta", function () {
            it_old_behavior(
                "returns changed rows when updated data in group by",
                async function (done) {
                    let table = await perspective.table(data, { index: "y" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["x"],
                    });
                    view.on_update(
                        async function (updated) {
                            const json = await view.to_json();
                            json.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            const expected = json.slice(0, 3);
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows when updated data in group by, column range",
                async function (done) {
                    let table = await perspective.table(data, { index: "y" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["x"],
                        columns: ["x"],
                    });
                    view.on_update(
                        async function (updated) {
                            const json = await view.to_json();
                            json.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            const expected = json.slice(0, 3);
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows when updated data in group by, hidden sort",
                async function (done) {
                    let table = await perspective.table(data, { index: "y" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["x"],
                        sort: [["y", "desc"]],
                        columns: ["x"],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = await view.to_json();
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected.slice(0, 3).map((x) => {
                                    delete x.__ROW_PATH__;
                                    return x;
                                })
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );

            test.skip("returns changed rows when updated data in group by multi, hidden sort", async function () {
                let table = await perspective.table(data, { index: "y" });
                let view = await table.view({
                    group_by: ["y", "x", "z"],
                    split_by: ["x"],
                    sort: [["y", "desc"]],
                    columns: ["x"],
                });
                view.on_update(
                    async function (updated) {
                        const expected = {
                            "1|x": [14, 0, 0],
                            "1|y": ["-", null, null],
                            "2|x": [2, 3, null],
                            "2|y": ["-", "WORLD", null],
                            "3|x": [2, null, 1],
                            "3|y": ["b", null, "HELLO"],
                            "4|x": [6, null, 1],
                            "4|y": ["-", null, "HELLO"],
                        };
                        await match_delta(
                            perspective,
                            updated.delta,
                            expected,
                            "to_columns"
                        );
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior(
                "returns changed rows when updated data in split by",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["z"],
                    });
                    view.on_update(
                        async function (updated) {
                            const json = await view.to_json();
                            json.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            const expected = json.slice(0, 3);
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_z);
                }
            );

            it_old_behavior(
                "returns changed rows when updated data in split by, column range",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["z"],
                        columns: ["y"],
                    });
                    view.on_update(
                        async function (updated) {
                            const json = await view.to_json();
                            json.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            const expected = json.slice(0, 3);
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_z);
                }
            );

            it_old_behavior(
                "returns changed rows when updated data in row and split by",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["z"],
                    });
                    view.on_update(
                        async function (updated) {
                            const json = await view.to_json();
                            json.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            const expected = [json[0], json[3], json[4]];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y_z);
                }
            );

            it_old_behavior(
                "returns changed rows when updated data in row and split by, column range",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["z"],
                        columns: ["x"],
                    });
                    view.on_update(
                        async function (updated) {
                            const json = await view.to_json();
                            json.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            const expected = [json[0], json[3], json[4]];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y_z);
                }
            );

            it_old_behavior(
                "returns nothing when updated data is not in pivot",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["x"],
                        aggregates: {
                            y: "distinct count",
                            z: "distinct count",
                        },
                    });
                    view.on_update(
                        async function (updated) {
                            await match_delta(perspective, updated.delta, []);
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_z);
                }
            );

            it_old_behavior("returns added rows", async function (done) {
                let table = await perspective.table(data);
                let view = await table.view({
                    group_by: ["y"],
                    split_by: ["x"],
                });
                view.on_update(
                    async function (updated) {
                        const json = await view.to_json();
                        json.map((d) => {
                            delete d["__ROW_PATH__"];
                        });
                        const expected = json.slice(0, 3);
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update(partial_change_y);
            });

            it_old_behavior("returns deleted columns", async function (done) {
                let table = await perspective.table(data, { index: "x" });
                let view = await table.view({
                    group_by: ["y"],
                    split_by: ["x"],
                    aggregates: { y: "unique" },
                    columns: ["x", "y", "z"],
                });
                view.on_update(
                    async function (updated) {
                        // underlying data changes, but only total aggregate row is affected
                        const expected = await view.to_json();
                        expected.splice(3, 1);
                        expected.map((d) => {
                            delete d["__ROW_PATH__"];
                        });
                        await match_delta(perspective, updated.delta, expected);
                        view.delete();
                        table.delete();
                        done();
                    },
                    { mode: "row" }
                );
                table.update([
                    { x: 1, y: null },
                    { x: 2, y: null },
                    { x: 4, y: null },
                ]);
            });

            it_old_behavior(
                "returns deleted columns, column range",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["x"],
                        aggregates: { y: "unique" },
                        columns: ["y"],
                    });
                    view.on_update(
                        async function (updated) {
                            // underlying data changes, but only total aggregate row is affected
                            const expected = await view.to_json();
                            expected.splice(3, 1);
                            expected.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update([
                        { x: 1, y: null },
                        { x: 2, y: null },
                        { x: 4, y: null },
                    ]);
                }
            );

            it_old_behavior(
                "returns changed rows in non-sequential update",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        group_by: ["y"],
                        split_by: ["x"],
                        aggregates: {
                            y: "distinct count",
                            z: "distinct count",
                        },
                    });
                    view.on_update(
                        async function (updated) {
                            // aggregates are sorted, in this case by string comparator - "string1" and "string2" are at the end
                            const json = await view.to_json();
                            json.map((d) => {
                                delete d["__ROW_PATH__"];
                            });
                            const expected = [json[3], json[4]];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_nonseq);
                }
            );

            it_old_behavior(
                "returns changed rows in column-only pivots",
                async function (done) {
                    let table = await perspective.table(data, { index: "x" });
                    let view = await table.view({
                        split_by: ["x"],
                    });
                    view.on_update(
                        async function (updated) {
                            const json = await view.to_json();
                            const expected = [
                                {
                                    "1|x": 1,
                                    "1|y": "string1",
                                    "1|z": false,
                                    "2|x": 2,
                                    "2|y": "b",
                                    "2|z": false,
                                    "3|x": 3,
                                    "3|y": "c",
                                    "3|z": true,
                                    "4|x": 4,
                                    "4|y": "string2",
                                    "4|z": true,
                                },
                                json[0],
                                json[3],
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_nonseq);
                }
            );

            it_old_behavior(
                "returns changed rows, col only",
                async function (done) {
                    let table = await perspective.table(data, {
                        index: "x",
                    });
                    let view = await table.view({
                        split_by: ["y"],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                {
                                    "c|x": 3,
                                    "c|y": "c",
                                    "c|z": true,
                                    "d|x": 4,
                                    "d|y": "d",
                                    "d|z": false,
                                    "string1|x": 1,
                                    "string1|y": "string1",
                                    "string1|z": true,
                                    "string2|x": 2,
                                    "string2|y": "string2",
                                    "string2|z": false,
                                },
                                {
                                    "c|x": null,
                                    "c|y": null,
                                    "c|z": null,
                                    "d|x": null,
                                    "d|y": null,
                                    "d|z": null,
                                    "string1|x": 1,
                                    "string1|y": "string1",
                                    "string1|z": true,
                                    "string2|x": null,
                                    "string2|y": null,
                                    "string2|z": null,
                                },
                                {
                                    "c|x": null,
                                    "c|y": null,
                                    "c|z": null,
                                    "d|x": null,
                                    "d|y": null,
                                    "d|z": null,
                                    "string1|x": null,
                                    "string1|y": null,
                                    "string1|z": null,
                                    "string2|x": 2,
                                    "string2|y": "string2",
                                    "string2|z": false,
                                },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        {
                            mode: "row",
                        }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows, col only agg",
                async function (done) {
                    const table = await perspective.table(data, {
                        index: "x",
                    });

                    const view = await table.view({
                        split_by: ["x"],
                        sort: [["y", "desc"]],
                        columns: ["y"],
                        aggregates: { y: "last" },
                    });

                    view.on_update(
                        async function (updated) {
                            // TODO: deltas return a total row for column only
                            // which they probably shouldn't.
                            const expected = [
                                {
                                    "1|y": "string1",
                                    "2|y": "string2",
                                    "3|y": "c",
                                    "4|y": "d",
                                },
                                {
                                    "1|y": null,
                                    "2|y": "string2",
                                    "3|y": null,
                                    "4|y": null,
                                },
                                {
                                    "1|y": "string1",
                                    "2|y": null,
                                    "3|y": null,
                                    "4|y": null,
                                },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );

                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows, col only col range",
                async function (done) {
                    let table = await perspective.table(data, {
                        index: "x",
                    });
                    let view = await table.view({
                        split_by: ["y"],
                        columns: ["x"],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                {
                                    "c|x": 3,
                                    "d|x": 4,
                                    "string1|x": 1,
                                    "string2|x": 2,
                                },
                                {
                                    "c|x": null,
                                    "d|x": null,
                                    "string1|x": 1,
                                    "string2|x": null,
                                },
                                {
                                    "c|x": null,
                                    "d|x": null,
                                    "string1|x": null,
                                    "string2|x": 2,
                                },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        {
                            mode: "row",
                        }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows, col only sorted",
                async function (done) {
                    const table = await perspective.table(data, {
                        index: "x",
                    });
                    const view = await table.view({
                        split_by: ["y"],
                        columns: ["x"],
                        sort: [["x", "desc"]],
                    });
                    console.log(await view.to_json());
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                {
                                    "c|x": 3,
                                    "d|x": 4,
                                    "string1|x": 1,
                                    "string2|x": 2,
                                },
                                {
                                    "c|x": null,
                                    "d|x": null,
                                    "string1|x": null,
                                    "string2|x": 2,
                                },
                                {
                                    "c|x": null,
                                    "d|x": null,
                                    "string1|x": 1,
                                    "string2|x": null,
                                },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        {
                            mode: "row",
                        }
                    );
                    table.update(partial_change_y);
                }
            );

            it_old_behavior(
                "returns changed rows, col only sorted change not in pivot",
                async function (done) {
                    let table = await perspective.table(
                        { x: [1], y: [100] },
                        {
                            index: "x",
                        }
                    );
                    let view = await table.view({
                        split_by: ["y"],
                        columns: ["x"],
                        sort: [["x", "desc"]],
                    });
                    console.log(await view.to_json());
                    view.on_update(
                        async function (updated) {
                            const expected = [{ "100|x": 3 }];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            view.delete();
                            table.delete();
                            done();
                        },
                        {
                            mode: "row",
                        }
                    );
                    table.update([{ x: 3, y: 100 }]);
                }
            );

            it_old_behavior(
                "returns changed rows, col only hidden sort",
                async function (done) {
                    const table = await perspective.table(data, { index: "x" });
                    const view = await table.view({
                        split_by: ["y"],
                        columns: ["x"],
                        sort: [["y", "desc"]],
                    });
                    view.on_update(
                        async function (updated) {
                            const expected = [
                                {
                                    "c|x": 3,
                                    "d|x": 4,
                                    "string1|x": 1,
                                    "string2|x": 2,
                                },
                                {
                                    "c|x": null,
                                    "d|x": null,
                                    "string1|x": null,
                                    "string2|x": 2,
                                },
                                {
                                    "c|x": null,
                                    "d|x": null,
                                    "string1|x": 1,
                                    "string2|x": null,
                                },
                            ];
                            await match_delta(
                                perspective,
                                updated.delta,
                                expected
                            );
                            await view.delete();
                            await table.delete();
                            done();
                        },
                        { mode: "row" }
                    );
                    table.update(partial_change_y);
                }
            );
        });
    });
})(perspective);
