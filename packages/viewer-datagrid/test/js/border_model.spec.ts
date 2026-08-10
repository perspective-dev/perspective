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

// Pure node tests for the mitered-header border model - no browser, no
// perspective engine. These pin the classification for the cases the old
// bespoke-CSS approach got wrong (N>=2 header group rows, rollup
// total/subtotal groups).

import { test, expect } from "@perspective-dev/test";
import {
    boundary_depth,
    classify_header_cell,
    split_levels,
    HeaderCellInput,
} from "../../src/ts/style_handlers/border_model.js";

function cell(overrides: Partial<HeaderCellInput>): HeaderCellInput {
    return {
        paths: [],
        split_by_len: 0,
        colspan: 1,
        y: 0,
        row_kind: "group",
        is_corner: false,
        is_last_header_row: false,
        single_header_row: false,
        ...overrides,
    };
}

test.describe("split_levels", () => {
    test("strips the trailing column name", () => {
        expect(split_levels("false|b|w", 2)).toStrictEqual(["false", "b"]);
        expect(split_levels("false|w", 2)).toStrictEqual(["false"]);
        expect(split_levels("w", 2)).toStrictEqual([]);
        expect(split_levels("w", 0)).toStrictEqual([]);
    });
});

test.describe("boundary_depth", () => {
    const paths_2_level = [
        "w", // grand total
        "false|w", // subtotal
        "false|b|w",
        "false|d|w",
        "true|w", // subtotal
        "true|a|w",
        "true|c|w",
    ];

    test("total-to-group boundary is depth 0", () => {
        expect(boundary_depth(paths_2_level, 2, 0)).toEqual(0);
    });

    test("subtotal-to-first-child boundary is depth 1", () => {
        expect(boundary_depth(paths_2_level, 2, 1)).toEqual(1);
    });

    test("sibling leaf boundary is depth 1", () => {
        expect(boundary_depth(paths_2_level, 2, 2)).toEqual(1);
    });

    test("last-child-to-next-group boundary is depth 0", () => {
        expect(boundary_depth(paths_2_level, 2, 3)).toEqual(0);
    });

    test("trailing edge is depth 0", () => {
        expect(boundary_depth(paths_2_level, 2, 6)).toEqual(0);
    });

    test("aggregate-internal boundary is depth == split_by_len", () => {
        const paths = ["false|w", "false|x", "true|w", "true|x"];
        expect(boundary_depth(paths, 1, 0)).toEqual(1);
        expect(boundary_depth(paths, 1, 1)).toEqual(0);
    });

    test("total/subtotal aggregate-internal boundaries are never group boundaries", () => {
        // With N>=2 aggregates, total/subtotal columns have IDENTICAL
        // (short) level lists - the boundary between them is internal to
        // one traversal node, not a depth-0/depth-1 group edge.
        const paths = [
            "w",
            "x", // grand-total group, 2 aggregates
            "false|w",
            "false|x", // subtotal group, 2 aggregates
            "false|b|w",
            "false|b|x",
        ];
        expect(boundary_depth(paths, 2, 0)).toEqual(2);
        expect(boundary_depth(paths, 2, 1)).toEqual(0);
        expect(boundary_depth(paths, 2, 2)).toEqual(2);
        expect(boundary_depth(paths, 2, 3)).toEqual(1);
        expect(boundary_depth(paths, 2, 4)).toEqual(2);
    });

    test("unloaded neighbor is null", () => {
        const paths: (string | undefined)[] = ["false|w", undefined, "true|w"];
        expect(boundary_depth(paths, 1, 0)).toBeNull();
        expect(boundary_depth(paths, 1, 1)).toBeNull();
    });
});

test.describe("classify_header_cell", () => {
    test.describe("1-level split, flat", () => {
        const paths = ["false|w", "true|w"];

        test("group row: boundary starts mitered at its own row", () => {
            const borders = classify_header_cell(
                cell({ paths, split_by_len: 1, x: 0, y: 0 }),
            );
            expect(borders.right).toEqual("miter-start");
            expect(borders.bottom).toEqual("miter-both");
        });

        test("name row (last): miter-end at group boundary", () => {
            const borders = classify_header_cell(
                cell({
                    paths,
                    split_by_len: 1,
                    x: 0,
                    y: 1,
                    row_kind: "name",
                    is_last_header_row: true,
                }),
            );
            expect(borders.right).toEqual("miter-end");
            expect(borders.bottom).toEqual("none");
        });

        test("name row (settings open, not last): full", () => {
            const borders = classify_header_cell(
                cell({
                    paths,
                    split_by_len: 1,
                    x: 0,
                    y: 1,
                    row_kind: "name",
                    is_last_header_row: false,
                }),
            );
            expect(borders.right).toEqual("full");
        });

        test("menu row is miter-end", () => {
            const borders = classify_header_cell(
                cell({
                    paths,
                    split_by_len: 1,
                    x: 0,
                    y: 2,
                    row_kind: "menu",
                    is_last_header_row: true,
                }),
            );
            expect(borders.right).toEqual("miter-end");
        });
    });

    test.describe("aggregate-internal boundaries", () => {
        const paths = ["false|w", "false|x", "true|w", "true|x"];

        test("no border inside a group, in any row", () => {
            for (const [y, row_kind, last] of [
                [0, "group", false],
                [1, "name", true],
            ] as const) {
                const borders = classify_header_cell(
                    cell({
                        paths,
                        split_by_len: 1,
                        x: 0,
                        y,
                        row_kind,
                        is_last_header_row: last,
                    }),
                );
                expect(borders.right).toEqual("none");
            }
        });

        test("group-end column draws in both rows", () => {
            expect(
                classify_header_cell(
                    cell({ paths, split_by_len: 1, x: 1, y: 0 }),
                ).right,
            ).toEqual("miter-start");
            expect(
                classify_header_cell(
                    cell({
                        paths,
                        split_by_len: 1,
                        x: 1,
                        y: 1,
                        row_kind: "name",
                        is_last_header_row: true,
                    }),
                ).right,
            ).toEqual("miter-end");
        });
    });

    test.describe("2-level split, flat (the N>=2 regression)", () => {
        // group A spans x 0..1, group B x 2..3, one aggregate.
        const paths = ["A|p|w", "A|q|w", "B|p|w", "B|q|w"];

        test("sibling boundary: absent in row 0, mitered start in row 1", () => {
            expect(
                classify_header_cell(
                    cell({ paths, split_by_len: 2, x: 0, y: 0 }),
                ).right,
            ).toEqual("none");
            expect(
                classify_header_cell(
                    cell({ paths, split_by_len: 2, x: 0, y: 1 }),
                ).right,
            ).toEqual("miter-start");
        });

        test("top-level boundary: mitered start in row 0, FULL in row 1", () => {
            // The dropped-edge bug case: a cell needing top-gap right border
            // in one row and a continuing full border in the next.
            const merged_a = classify_header_cell(
                cell({ paths, split_by_len: 2, x: 0, colspan: 2, y: 0 }),
            );
            expect(merged_a.right).toEqual("miter-start");
            expect(merged_a.bottom).toEqual("miter-both");

            expect(
                classify_header_cell(
                    cell({ paths, split_by_len: 2, x: 1, y: 1 }),
                ).right,
            ).toEqual("full");
        });
    });

    test.describe("rollup total/subtotal groups", () => {
        const paths = [
            "w",
            "false|w",
            "false|b|w",
            "false|d|w",
            "true|w",
            "true|a|w",
            "true|c|w",
        ];

        test("Total label cell: depth-0 border from row 0, NO bottom", () => {
            // The Total column's header stack - label and pads alike -
            // reads as one open block over its column name.
            const borders = classify_header_cell(
                cell({ paths, split_by_len: 2, x: 0, y: 0 }),
            );
            expect(borders.right).toEqual("miter-start");
            expect(borders.bottom).toEqual("none");
        });

        test("Total pad cell: continuing full border, no bottom", () => {
            const borders = classify_header_cell(
                cell({ paths, split_by_len: 2, x: 0, y: 1 }),
            );
            expect(borders.right).toEqual("full");
            expect(borders.bottom).toEqual("none");
        });

        test("subtotal pad: border starts mitered at its own row, no bottom", () => {
            const borders = classify_header_cell(
                cell({ paths, split_by_len: 2, x: 1, y: 1 }),
            );
            expect(borders.right).toEqual("miter-start");
            expect(borders.bottom).toEqual("none");
        });

        test("no borders between aggregate columns inside total/subtotal groups", () => {
            const multi_agg_paths = [
                "w",
                "x",
                "false|w",
                "false|x",
                "false|b|w",
                "false|b|x",
            ];
            // Between "w" and "x" (grand-total interior) and between
            // "false|w" and "false|x" (subtotal interior): nothing, in any
            // header row.
            for (const x of [0, 2]) {
                for (const [y, row_kind, last] of [
                    [0, "group", false],
                    [1, "group", false],
                    [2, "name", true],
                ] as const) {
                    const borders = classify_header_cell(
                        cell({
                            paths: multi_agg_paths,
                            split_by_len: 2,
                            x,
                            y,
                            row_kind,
                            is_last_header_row: last,
                        }),
                    );
                    expect(borders.right).toEqual("none");
                }
            }
        });

        test("merged group cell over subtotal + children keeps its bottom", () => {
            // regular-table merges the "false" level cell across the
            // subtotal column and both children; its right edge is the last
            // covered column's boundary (depth 0 vs "true").
            const borders = classify_header_cell(
                cell({ paths, split_by_len: 2, x: 1, colspan: 3, y: 0 }),
            );
            expect(borders.right).toEqual("miter-start");
            expect(borders.bottom).toEqual("miter-both");
        });
    });

    test.describe("degenerate cases", () => {
        test("single header row draws nothing", () => {
            const borders = classify_header_cell(
                cell({
                    paths: ["a", "b"],
                    split_by_len: 0,
                    x: 0,
                    y: 0,
                    row_kind: "name",
                    is_last_header_row: true,
                    single_header_row: true,
                }),
            );
            expect(borders).toStrictEqual({
                top: "none",
                right: "none",
                bottom: "none",
                left: "none",
            });
        });

        test("no split_by levels draws nothing at all", () => {
            const paths = ["a", "b", "c"];
            for (const x of [0, 1, 2]) {
                expect(
                    classify_header_cell(
                        cell({
                            paths,
                            split_by_len: 0,
                            x,
                            y: 0,
                            row_kind: "name",
                            is_last_header_row: false,
                        }),
                    ),
                ).toStrictEqual({
                    top: "none",
                    right: "none",
                    bottom: "none",
                    left: "none",
                });
            }

            expect(
                classify_header_cell(
                    cell({
                        paths,
                        split_by_len: 0,
                        y: 0,
                        row_kind: "name",
                        is_corner: true,
                        corner_needs_border: true,
                        is_last_header_row: false,
                    }),
                ).right,
            ).toEqual("none");
        });

        test("unloaded neighbor draws nothing", () => {
            const paths: (string | undefined)[] = [
                "false|w",
                undefined,
                "true|w",
            ];
            expect(
                classify_header_cell(
                    cell({ paths, split_by_len: 1, x: 0, y: 0 }),
                ).right,
            ).toEqual("none");
        });
    });

    test.describe("corner cells", () => {
        test("row-header boundary corner: mitered start at top, full below, mitered end at bottom", () => {
            expect(
                classify_header_cell(
                    cell({
                        paths: [],
                        split_by_len: 2,
                        y: 0,
                        is_corner: true,
                        corner_needs_border: true,
                    }),
                ).right,
            ).toEqual("miter-start");
            expect(
                classify_header_cell(
                    cell({
                        paths: [],
                        split_by_len: 2,
                        y: 1,
                        is_corner: true,
                        corner_needs_border: true,
                    }),
                ).right,
            ).toEqual("full");
            expect(
                classify_header_cell(
                    cell({
                        paths: [],
                        split_by_len: 2,
                        y: 2,
                        row_kind: "name",
                        is_corner: true,
                        corner_needs_border: true,
                        is_last_header_row: true,
                    }),
                ).right,
            ).toEqual("miter-end");
        });

        test("corner cells have no dividers between them", () => {
            // The NW corner region reads as one open block: no bottom
            // borders anywhere, and no right borders except the row-header
            // boundary column's.
            for (const corner_needs_border of [true, false]) {
                for (const y of [0, 1]) {
                    const borders = classify_header_cell(
                        cell({
                            paths: [],
                            split_by_len: 2,
                            y,
                            is_corner: true,
                            corner_needs_border,
                        }),
                    );
                    expect(borders.bottom).toEqual("none");
                    if (!corner_needs_border) {
                        expect(borders.right).toEqual("none");
                    }
                }
            }
        });
    });
});
