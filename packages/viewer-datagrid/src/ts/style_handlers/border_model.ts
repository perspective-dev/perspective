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

// The single source of truth for the "mitered" header borders: borders gapped
// at one or both corners, indicating the cell binds more tightly to its
// neighbor in that direction. Pure - no DOM, no regular-table - so the
// classification is unit-testable in plain node.
//
// The central rule: for adjacent data columns `x`, `x + 1`, the depth of the
// boundary between them is the length of the longest common prefix of their
// raw column paths' split levels. A vertical border exists in header row `y`
// iff `boundary_depth <= y` - borders "grow downward" from the row where the
// paths diverge - mitered at the top in the row where they begin, and mitered
// at the bottom in the bottommost header row (where the columns bind to the
// body below). This needs no special-casing for `split_rollup_mode:
// "rollup"`: total and subtotal groups produce shorter paths, so their
// boundaries are shallower and their borders taller, automatically.

/// One edge of a cell. `miter-start` gaps the corner nearest the axis origin
/// (top for vertical edges, left for horizontal edges).
export type EdgeState =
    | "none"
    | "full"
    | "miter-start"
    | "miter-end"
    | "miter-both";

export interface CellBorders {
    top: EdgeState;
    right: EdgeState;
    bottom: EdgeState;
    left: EdgeState;
}

export interface HeaderCellInput {
    /// Raw (unpadded) column paths, `model._column_paths`. May be sparse
    /// where the virtual viewport has not loaded a column.
    paths: (string | undefined)[];

    /// `config.split_by.length`.
    split_by_len: number;

    /// Leftmost data column covered by this cell, `metadata.x`. `undefined`
    /// for corner cells.
    x?: number;

    /// `th.colSpan` - regular-table merges adjacent equal header values
    /// horizontally, and a merged cell's right edge belongs to its LAST
    /// covered column.
    colspan: number;

    /// Header row index, `0..split_by_len - 1` for group rows.
    y: number;

    row_kind: "group" | "name" | "menu";

    is_corner: boolean;

    /// For corner cells: whether this cell sits at the boundary between the
    /// row-header region and the data columns (`row_header_x` equals the
    /// effective row-header depth).
    corner_needs_border?: boolean;

    /// Whether this is the bottommost header row (the name row with settings
    /// closed, the menu row with settings open).
    is_last_header_row: boolean;

    /// A single header row draws no borders at all (previously
    /// `tr:only-child th { box-shadow: none !important }`).
    single_header_row: boolean;
}

const NONE: CellBorders = {
    top: "none",
    right: "none",
    bottom: "none",
    left: "none",
};

/// The split levels of a raw column path - the path minus its trailing
/// column name. Total/subtotal columns (`split_rollup_mode: "rollup"`) have
/// fewer than `split_by_len` levels. NOTE a column NAME containing `"|"`
/// mis-splits here; this is a pre-existing ambiguity shared with the data
/// listener, not worsened.
export function split_levels(path: string, split_by_len: number): string[] {
    const parts = path.split("|");
    return parts.slice(0, Math.min(split_by_len, parts.length - 1));
}

/// Depth of the boundary between data columns `x` and `x + 1`:
/// - `null` when either side is unloaded (draw nothing, self-corrects when
///   the viewport fills), except past the end of the loaded set, which is
///   the table's trailing edge and reads as a depth-0 boundary.
/// - Otherwise the longest-common-prefix length of the two columns' split
///   levels: `0..split_by_len`, where `split_by_len` means "same group"
///   (an aggregate-internal boundary).
export function boundary_depth(
    paths: (string | undefined)[],
    split_by_len: number,
    x: number,
): number | null {
    const left = paths[x];
    if (left === undefined) {
        return null;
    }

    if (x + 1 >= paths.length) {
        return 0;
    }

    const right = paths[x + 1];
    if (right === undefined) {
        return null;
    }

    const a = split_levels(left, split_by_len);
    const b = split_levels(right, split_by_len);
    let depth = 0;
    while (depth < a.length && depth < b.length && a[depth] === b[depth]) {
        depth++;
    }

    // IDENTICAL level lists mean the same traversal node - an
    // aggregate-internal boundary, never a group boundary. This matters for
    // total/subtotal groups (`split_rollup_mode: "rollup"`), whose level
    // lists are SHORTER than `split_by_len`: two aggregate columns of the
    // grand-total group have LCP 0, which without this clause would read as
    // a top-level group boundary between them.
    if (depth === a.length && depth === b.length) {
        return split_by_len;
    }

    return depth;
}

/// Whether the group-row cell at `(x, y)` displays a real split level
/// rather than a vertical-continuation pad. Pads draw no bottom border -
/// they are interior to their group's header block - and the synthesized
/// `"Total"` label of a zero-level grand-total column counts as a pad too:
/// the whole Total column header stack reads as one open block.
function has_real_text(
    paths: (string | undefined)[],
    split_by_len: number,
    x: number,
    y: number,
): boolean {
    const path = paths[x];
    if (path === undefined) {
        return false;
    }

    return y < split_levels(path, split_by_len).length;
}

export function classify_header_cell(input: HeaderCellInput): CellBorders {
    if (input.single_header_row || input.split_by_len === 0) {
        return NONE;
    }

    // The NW corner region renders as one open block - no dividers between
    // corner cells - with only the boundary column's right edge separating
    // it from the data columns.
    if (input.is_corner) {
        if (!input.corner_needs_border) {
            return NONE;
        }

        return {
            ...NONE,
            right:
                input.y === 0 && input.row_kind === "group"
                    ? "miter-start"
                    : input.is_last_header_row
                      ? "miter-end"
                      : "full",
        };
    }

    if (input.x === undefined) {
        return NONE;
    }

    const x_end = input.x + input.colspan - 1;
    const depth = boundary_depth(input.paths, input.split_by_len, x_end);
    const is_trailing = x_end >= input.paths.length - 1;

    let right: EdgeState = "none";
    if (depth !== null) {
        if (input.row_kind === "group") {
            if (depth <= input.y) {
                right = depth === input.y ? "miter-start" : "full";
            }
        } else if (depth < input.split_by_len || is_trailing) {
            right = input.is_last_header_row ? "miter-end" : "full";
        }
    }

    const bottom: EdgeState =
        input.row_kind === "group" &&
        has_real_text(input.paths, input.split_by_len, input.x, input.y)
            ? "miter-both"
            : "none";

    return { top: "none", right, bottom, left: "none" };
}

/// The utility classes, one per (edge, state). Each sets a single per-edge
/// custom property (`--psp-miter-*`) composed by one base rule in
/// `mitered-headers.css` - custom properties merge across classes where
/// `box-shadow` itself cannot.
const EDGE_CLASSES: Record<
    keyof CellBorders,
    Record<Exclude<EdgeState, "none">, string>
> = {
    top: {
        full: "psp-b-t",
        "miter-start": "psp-b-t-ml",
        "miter-end": "psp-b-t-mr",
        "miter-both": "psp-b-t-mlr",
    },
    right: {
        full: "psp-b-r",
        "miter-start": "psp-b-r-mt",
        "miter-end": "psp-b-r-mb",
        "miter-both": "psp-b-r-mtb",
    },
    bottom: {
        full: "psp-b-b",
        "miter-start": "psp-b-b-ml",
        "miter-end": "psp-b-b-mr",
        "miter-both": "psp-b-b-mlr",
    },
    left: {
        full: "psp-b-l",
        "miter-start": "psp-b-l-mt",
        "miter-end": "psp-b-l-mb",
        "miter-both": "psp-b-l-mtb",
    },
};

export const ALL_BORDER_CLASSES: string[] = Object.values(EDGE_CLASSES)
    .map((states) => Object.values(states))
    .flat();

/// Toggle exactly the classes for `borders` on `element`, clearing the rest.
export function apply_borders(element: Element, borders: CellBorders): void {
    for (const edge of ["top", "right", "bottom", "left"] as const) {
        const state = borders[edge];
        for (const [s, class_name] of Object.entries(EDGE_CLASSES[edge])) {
            element.classList.toggle(class_name, s === state);
        }
    }
}
