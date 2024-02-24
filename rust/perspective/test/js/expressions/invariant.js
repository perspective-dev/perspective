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

const jsc = require("jsverify");

const replicate = (n, g) => jsc.tuple(new Array(n).fill(g));

const array_equals = function (a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
};

const generator = function (length = 100, has_zero = true) {
    const min = has_zero ? 0 : 1;
    return jsc.record({
        a: replicate(length, jsc.number(min, 1000000)),
        b: replicate(length, jsc.number(min, 1000000)),
        c: replicate(length, jsc.string),
        d: replicate(length, jsc.datetime),
        e: replicate(length, jsc.bool),
    });
};

/**
 * Uses invariant testing to assert base correctness of computed columns.
 */
((perspective) => {
    test.describe("Invariant testing", function () {
        test.describe("Inverse expressions should be invariant", function () {
            jsc.property("(x - y) + x == y", generator(), async (data) => {
                const table = await perspective.table(data);

                const view = await table.view({
                    expressions: { '("a" - "b") + "b"': '("a" - "b") + "b"' },
                });
                const result = await view.to_columns();
                const expected = array_equals(
                    result['("a" - "b") + "b"'],
                    data["a"]
                );
                view.delete();
                table.delete();
                return expected;
            });

            jsc.property("(x + y) - x - y == 0", generator(), async (data) => {
                const table = await perspective.table(data);

                const view = await table.view({
                    expressions: {
                        '("a" + "b") - "a" - "b"': '("a" + "b") - "a" - "b"',
                    },
                });
                const result = await view.to_columns();
                const expected = array_equals(
                    result['("a" + "b") - "a" - "b"'],
                    Array(data["a"].length).fill(0)
                );
                view.delete();
                table.delete();
                return expected;
            });

            jsc.property(
                "(x + y) - (x + y) == 0",
                generator(),
                async (data) => {
                    const table = await perspective.table(data);

                    const view = await table.view({
                        expressions: {
                            '("a" + "b") - ("a" + "b")':
                                '("a" + "b") - ("a" + "b")',
                        },
                    });
                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['("a" + "b") - ("a" + "b")'],
                        Array(data["a"].length).fill(0)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            jsc.property("(x - x) == 0", generator(), async (data) => {
                const table = await perspective.table(data);

                const view = await table.view({
                    expressions: { '"a" - "a"': '"a" - "a"' },
                });
                const result = await view.to_columns();
                const expected = array_equals(
                    result['"a" - "a"'],
                    Array(data["a"].length).fill(0)
                );
                view.delete();
                table.delete();
                return expected;
            });

            jsc.property("(x / x) == 1", generator(), async (data) => {
                const table = await perspective.table(data);

                const view = await table.view({
                    expressions: { '"a" / "a"': '"a" / "a"' },
                });
                const result = await view.to_columns();
                const expected = array_equals(
                    result['"a" / "a"'],
                    Array(data["a"].length).fill(1)
                );
                view.delete();
                table.delete();
                return expected;
            });

            jsc.property("(x + x) - x - x == 0", generator(), async (data) => {
                const table = await perspective.table(data);

                const view = await table.view({
                    expressions: {
                        '("a" + "a") - "a" - "a"': '("a" + "a") - "a" - "a"',
                    },
                });
                const result = await view.to_columns();
                const expected = array_equals(
                    result['("a" + "a") - "a" - "a"'],
                    Array(data["a"].length).fill(0)
                );
                view.delete();
                table.delete();
                return expected;
            });

            jsc.property(
                "sqrt(x ^ 2) == x",
                generator(100, false),
                async (data) => {
                    const table = await perspective.table(data);

                    const view = await table.view({
                        expressions: {
                            'sqrt(pow("a", 2))': 'sqrt(pow("a", 2))',
                        },
                    });
                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['sqrt(pow("a", 2))'],
                        data["a"]
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            // jsc.property(
            //     "x ^ 2 == (x * x)",
            //     generator(100, false),
            //     async (data) => {
            //         const table = await perspective.table(data);

            //         const view = await table.view({
            //             expressions: ['pow("a", 2)', '"a" * "a"'].reduce((x, y) => Object.assign(x, {[y]: y}), {}),
            //         });
            //         const result = await view.to_columns();
            //         const expected = array_equals(
            //             result['pow("a", 2)'],
            //             result['"a" * "a"']
            //         );
            //         view.delete();
            //         table.delete();
            //         return expected;
            //     }
            // );

            jsc.property(
                "x % x == 100",
                generator(100, false),
                async (data) => {
                    const table = await perspective.table(data);

                    const view = await table.view({
                        expressions: {
                            'percent_of("a", "a")': 'percent_of("a", "a")',
                        },
                    });
                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['percent_of("a", "a")'],
                        Array(data["a"].length).fill(100)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            jsc.property(
                "abs(x) ? x > 0 == x",
                generator(100, false),
                async (data) => {
                    const table = await perspective.table(data);

                    const view = await table.view({
                        expressions: { 'abs("a")': 'abs("a")' },
                    });
                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['abs("a")'],
                        data["a"]
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );
        });

        test.describe("Comparison operations should be pure with the same inputs.", function () {
            jsc.property(
                "== should always be true with the same input column",
                generator(),
                async (data) => {
                    const table = await perspective.table(data);

                    const view = await table.view({
                        expressions: { '"a" == "a"': '"a" == "a"' },
                    });

                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['"a" == "a"'],
                        Array(data["a"].length).fill(true)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            jsc.property(
                "> should always be false with the same input column",
                generator(),
                async (data) => {
                    const table = await perspective.table(data);

                    const view = await table.view({
                        expressions: { '"a" > "a"': '"a" > "a"' },
                    });

                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['"a" > "a"'],
                        Array(data["a"].length).fill(false)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            jsc.property(
                "< should always be false with the same input column",
                generator(),
                async (data) => {
                    const table = await perspective.table(data);

                    const view = await table.view({
                        expressions: { '"a" < "a"': '"a" < "a"' },
                    });

                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['"a" < "a"'],
                        Array(data["a"].length).fill(false)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            jsc.property(
                "String == should always be true with the same input column",
                generator(),
                async (data) => {
                    const table = await perspective.table({
                        a: "float",
                        b: "float",
                        c: "string",
                        d: "datetime",
                        e: "boolean",
                    });

                    table.update(data);

                    const view = await table.view({
                        expressions: { '"c" == "c"': '"c" == "c"' },
                    });

                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['"c" == "c"'],
                        Array(data["c"].length).fill(true)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            jsc.property(
                "Datetime == should always be true with the same input column",
                generator(),
                async (data) => {
                    const table = await perspective.table({
                        a: "float",
                        b: "float",
                        c: "string",
                        d: "datetime",
                        e: "boolean",
                    });

                    table.update(data);

                    const view = await table.view({
                        expressions: { '"d" == "d"': '"d" == "d"' },
                    });

                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['"d" == "d"'],
                        Array(data["d"].length).fill(true)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );

            jsc.property(
                "Date == should always be true with the same input column",
                generator(),
                async (data) => {
                    const table = await perspective.table({
                        a: "float",
                        b: "float",
                        c: "string",
                        d: "date",
                        e: "boolean",
                    });

                    table.update(data);

                    const view = await table.view({
                        expressions: { '"d" == "d"': '"d" == "d"' },
                    });

                    const result = await view.to_columns();
                    const expected = array_equals(
                        result['"d" == "d"'],
                        Array(data["d"].length).fill(true)
                    );
                    view.delete();
                    table.delete();
                    return expected;
                }
            );
        });
    });
})(perspective);
