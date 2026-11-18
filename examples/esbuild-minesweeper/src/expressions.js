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

/** `text` with every line after the first indented by `depth` levels. */
function indent(text, depth) {
    return text.replaceAll("\n", `\n${"    ".repeat(depth)}`);
}

/** An ExprTK loop running `body` with `n` bound to each in-bounds neighbour of square (`x`, `y`), its loop variables prefixed by `n` since ExprTK forbids shadowing. */
function each_neighbour(width, height, x, y, n, body) {
    return `for (var ${n}_dx := -1; ${n}_dx <= 1; ${n}_dx += 1) {
    for (var ${n}_dy := -1; ${n}_dy <= 1; ${n}_dy += 1) {
        var ${n}_x := ${x} + ${n}_dx;
        var ${n}_y := ${y} + ${n}_dy;
        if ((${n}_dx != 0 or ${n}_dy != 0) and ${n}_x >= 0 and ${n}_x < ${height} and ${n}_y >= 0 and ${n}_y < ${width}) {
            var ${n} := ${n}_x * ${width} + ${n}_y;
            ${indent(body, 3)}
        }
    }
}`;
}

/** ExprTK statements declaring `total` as the number of mines neighbouring `square`, and `total_x` / `total_y` as its coordinates. */
function mine_count(width, height, square, total) {
    return `var ${total} := 0;
var ${total}_x := floor(${square} / ${width});
var ${total}_y := ${square} - ${total}_x * ${width};
${each_neighbour(
    width,
    height,
    `${total}_x`,
    `${total}_y`,
    `${total}_n`,
    `if (vlookup('mine', integer(${total}_n))) {
    ${total} += 1;
}`,
)};`;
}

/** The `group_by` / `split_by` expressions laying `"index"` out as a board `width` squares wide. */
export function grid_expressions(width) {
    return {
        row: `integer(floor("index" / ${width}))`,
        col: `integer("index" % ${width})`,
    };
}

/** The number of mines neighbouring each square, read from its neighbours' rows with `vlookup()`. */
export function neighbour_count(width, height) {
    return `var i := float("index");
${mine_count(width, height, "i", "total")}
total`;
}

/** Whether each square is revealed by a flood fill from square `start`, which every row searches for itself. */
export function flood_from(width, height, start) {
    const cells = width * height;
    return `var seen[${cells}];
var queue[${cells}];
for (var j := 0; j < ${cells}; j += 1) {
    seen[j] := 0;
    queue[j] := 0;
};
var me := float("index");
var head := 0;
var tail := 1;
var found := 0;
queue[0] := ${start};
seen[${start}] := 1;
if (me == ${start}) {
    found := 1;
};
while (head < tail and found == 0) {
    var c := queue[head];
    head += 1;
    ${indent(mine_count(width, height, "c", "k"), 1)}
    if (k == 0) {
        ${indent(
            each_neighbour(
                width,
                height,
                "k_x",
                "k_y",
                "n",
                `if (seen[n] == 0) {
    seen[n] := 1;
    if (vlookup('flagged', integer(n))) {
        seen[n] := 2;
    } else {
        queue[tail] := n;
        tail += 1;
        if (n == me) {
            found := 1;
        }
    }
}`,
            ),
            2,
        )}
    }
};
found == 1`;
}

/** The neighbouring-mine count of each revealed square that is not a mine, else `null`. */
export function cell_display() {
    return `if ("revealed") {
    if ("mine" != True) {
        integer("count")
    } else {
        null
    }
} else {
    null
}`;
}
