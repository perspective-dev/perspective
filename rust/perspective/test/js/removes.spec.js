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

const _query = async (should_cache, table, config = {}, callback) => {
    let cached_view;
    if (should_cache) {
        cached_view = await table.view(config);
    }

    const data_getter = async () => {
        if (should_cache) {
            return await cached_view.to_columns();
        } else {
            const view = await table.view(config);
            const data = await view.to_columns();
            await view.delete();
            return data;
        }
    };

    const v = await callback(data_getter);
    if (cached_view) {
        cached_view.delete();
    }

    return v;
};

const SCHEMA = {
    str: "string",
    int: "integer",
    float: "float",
};

test.describe("Removes", () => {
    for (const cond of [true, false]) {
        const query = _query.bind(undefined, cond);

        for (const idx of ["str", "int"]) {
            const string_pkey = idx === "str";

            test.describe(`View cached? ${cond}, index: ${idx}`, () => {
                test("Output consistent with filter", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    table.update(data);

                    await query(
                        table,
                        {
                            filter: [["str", "!=", "2"]],
                        },
                        async (getter) => {
                            const pkey = 3;
                            table.remove([
                                string_pkey ? pkey.toString() : pkey,
                            ]);

                            expect(await getter()).toEqual({
                                str: ["1", "4", "5", "6"],
                                int: [1, 4, 5, 6],
                                float: [0.5, 2, 2.5, 3],
                            });
                        }
                    );

                    await table.delete();
                });

                test("Output consistent with filter, empty string", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    data.str.push("");
                    data.int.push(7);
                    data.float.push(3.5);

                    table.update(data);

                    await query(
                        table,
                        {
                            filter: [["str", "!=", "2"]],
                        },
                        async (getter) => {
                            const pkey = 3;
                            table.remove([
                                string_pkey ? pkey.toString() : pkey,
                            ]);

                            if (string_pkey) {
                                expect(await getter()).toEqual({
                                    str: ["", "1", "4", "5", "6"],
                                    int: [7, 1, 4, 5, 6],
                                    float: [3.5, 0.5, 2, 2.5, 3],
                                });
                            } else {
                                expect(await getter()).toEqual({
                                    str: ["1", "4", "5", "6", ""],
                                    int: [1, 4, 5, 6, 7],
                                    float: [0.5, 2, 2.5, 3, 3.5],
                                });
                            }
                        }
                    );

                    await table.delete();
                });

                test("Output consistent with filter, null", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    data.str.push(null);
                    data.int.push(7);
                    data.float.push(3.5);

                    table.update(data);

                    await query(
                        table,
                        {
                            filter: [["str", "!=", "2"]],
                        },
                        async (getter) => {
                            const pkey = 3;
                            table.remove([
                                string_pkey ? pkey.toString() : pkey,
                            ]);

                            if (string_pkey) {
                                expect(await getter()).toEqual({
                                    str: [null, "1", "4", "5", "6"],
                                    int: [7, 1, 4, 5, 6],
                                    float: [3.5, 0.5, 2, 2.5, 3],
                                });
                            } else {
                                expect(await getter()).toEqual({
                                    str: ["1", "4", "5", "6", null],
                                    int: [1, 4, 5, 6, 7],
                                    float: [0.5, 2, 2.5, 3, 3.5],
                                });
                            }
                        }
                    );

                    await table.delete();
                });

                test("Output consistent with filter, remove before view construction, sorted", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    table.update(data);
                    table.remove(
                        [1, 3, 5].map((x) => (string_pkey ? x.toString() : x))
                    );

                    await query(
                        table,
                        {
                            sort: [["str", "desc"]],
                        },
                        async (getter) => {
                            expect(await getter()).toEqual({
                                str: ["6", "4", "2"],
                                int: [6, 4, 2],
                                float: [3, 2, 1],
                            });

                            table.update({
                                str: ["7", "9", "8"],
                                int: [7, 9, 8],
                                float: [3.5, 4.5, 4],
                            });

                            expect(await getter()).toEqual({
                                str: ["9", "8", "7", "6", "4", "2"],
                                int: [9, 8, 7, 6, 4, 2],
                                float: [4.5, 4, 3.5, 3, 2, 1],
                            });
                        }
                    );

                    await table.delete();
                });

                test("Output consistent with filter, remove and add identical", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    table.update(data);

                    await query(
                        table,
                        {
                            filter: [["str", "!=", "2"]],
                        },
                        async (getter) => {
                            const pkey = 3;
                            table.remove([
                                string_pkey ? pkey.toString() : pkey,
                            ]);

                            expect(await getter()).toEqual({
                                str: ["1", "4", "5", "6"],
                                int: [1, 4, 5, 6],
                                float: [0.5, 2, 2.5, 3],
                            });

                            table.update({
                                str: ["7", "9", "8"],
                                int: [7, 9, 8],
                                float: [3.5, 4.5, 4],
                            });

                            expect(await getter()).toEqual({
                                str: ["1", "4", "5", "6", "7", "8", "9"],
                                int: [1, 4, 5, 6, 7, 8, 9],
                                float: [0.5, 2, 2.5, 3, 3.5, 4, 4.5],
                            });
                        }
                    );

                    await table.delete();
                });

                test("Output consistent with filter, add null and remove other", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    table.update(data);

                    await query(table, {}, async (getter) => {
                        expect(await getter()).toEqual(data);

                        table.update({
                            str: [string_pkey ? null : "7"],
                            int: [string_pkey ? 7 : null],
                            float: [3.5],
                        });

                        if (string_pkey) {
                            expect(await getter()).toEqual({
                                str: [null, 1, 2, 3, 4, 5, 6].map((x) =>
                                    x ? x.toString() : x
                                ),
                                int: [7, 1, 2, 3, 4, 5, 6],
                                float: [7, 1, 2, 3, 4, 5, 6].map(
                                    (x) => x * 0.5
                                ),
                            });
                        } else {
                            expect(await getter()).toEqual({
                                str: [7, 1, 2, 3, 4, 5, 6].map((x) =>
                                    x.toString()
                                ),
                                int: [null, 1, 2, 3, 4, 5, 6],
                                float: [7, 1, 2, 3, 4, 5, 6].map(
                                    (x) => x * 0.5
                                ),
                            });
                        }

                        table.remove([string_pkey ? "3" : 3]);

                        if (string_pkey) {
                            expect(await getter()).toEqual({
                                str: [null, 1, 2, 4, 5, 6].map((x) =>
                                    x ? x.toString() : x
                                ),
                                int: [7, 1, 2, 4, 5, 6],
                                float: [7, 1, 2, 4, 5, 6].map((x) => x * 0.5),
                            });
                        } else {
                            expect(await getter()).toEqual({
                                str: [7, 1, 2, 4, 5, 6].map((x) =>
                                    x.toString()
                                ),
                                int: [null, 1, 2, 4, 5, 6],
                                float: [7, 1, 2, 4, 5, 6].map((x) => x * 0.5),
                            });
                        }
                    });

                    await table.delete();
                });

                test("Output consistent with filter, remove and add new dataset", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });

                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    table.update(data);

                    await query(
                        table,
                        {
                            filter: [["int", "!=", 3]],
                        },
                        async (getter) => {
                            table.remove(
                                [1, 2, 3, 4, 5, 6].map((x) =>
                                    string_pkey ? x.toString() : x
                                )
                            );

                            expect(await getter()).toEqual({
                                float: [],
                                int: [],
                                str: [],
                            });

                            table.update({
                                str: ["def", "abc", "deff"],
                                int: [1, 2, 4],
                                float: [100.5, 200.5, 300.5],
                            });

                            if (string_pkey) {
                                expect(await getter()).toEqual({
                                    str: ["abc", "def", "deff"],
                                    int: [2, 1, 4],
                                    float: [200.5, 100.5, 300.5],
                                });
                            } else {
                                expect(await getter()).toEqual({
                                    str: ["def", "abc", "deff"],
                                    int: [1, 2, 4],
                                    float: [100.5, 200.5, 300.5],
                                });
                            }
                        }
                    );

                    await table.delete();
                });

                test.skip("Output consistent with filter, remove and add null", async () => {
                    // FIXME
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    const splice_idx = Math.floor(Math.random() * 6);
                    data.str.splice(splice_idx, 0, string_pkey ? null : "7");
                    data.int.splice(splice_idx, 0, string_pkey ? 7 : null);
                    data.float.splice(splice_idx, 0, 3.5);

                    table.update(data);

                    await query(
                        table,
                        {
                            filter: [["float", "==", 3.5]],
                        },
                        async (getter) => {
                            table.remove([null]);
                            const v = await table.view();
                            console.log(
                                "str?",
                                string_pkey,
                                await v.to_columns()
                            );
                            await v.delete();

                            expect(await getter()).toEqual({});

                            table.update({
                                str: [string_pkey ? null : "7"],
                                int: [string_pkey ? 7 : null],
                                float: [3.5],
                            });

                            expect(await getter()).toEqual({
                                str: [string_pkey ? null : "7"],
                                int: [string_pkey ? 7 : null],
                                float: [3.5],
                            });
                        }
                    );

                    await table.delete();
                });

                test.skip("Output consistent with filter, update null", async () => {
                    const table = await perspective.table(SCHEMA, {
                        index: idx,
                    });
                    const data = {
                        str: [1, 2, 3, 4, 5, 6].map((x) => x.toString()),
                        int: [1, 2, 3, 4, 5, 6],
                        float: [1, 2, 3, 4, 5, 6].map((x) => x * 0.5),
                    };

                    const splice_idx = Math.floor(Math.random() * 6);
                    data.str.splice(splice_idx, 0, string_pkey ? null : "7");
                    data.int.splice(splice_idx, 0, string_pkey ? 7 : null);
                    data.float.splice(splice_idx, 0, 3.5);

                    table.update(data);

                    await query(table, {}, async (getter) => {
                        const expected = {
                            str: data.str.slice(),
                            int: data.int.slice(),
                            float: data.float.slice(),
                        };

                        expect(await getter()).toEqual(expected);

                        table.update([
                            {
                                str: string_pkey ? null : "7",
                                int: string_pkey ? 7 : null,
                                float: 4.5,
                            },
                        ]);

                        expected.float[splice_idx] = 4.5;

                        expect(await getter()).toEqual(expected);
                    });

                    await table.delete();
                });
            });
        }
    }
});
