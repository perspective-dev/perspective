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

import type { LabelPosition, TileGroup } from "./types.ts";

export type LabelPlacement = Exclude<LabelPosition, "auto">;

/** A tile's text widths per pixel of font size, and its label lines. */
export interface TileMetrics {
    value: number;
    label: number;
    lines: number;

    /** The tile's label position, its column's over the plugin's. */
    position: LabelPosition;
}

export interface LayoutInput {
    width: number;
    height: number;
    tiles: TileMetrics[];
    uniform: boolean;

    /** Height reserved beneath each value, in multiples of its font size. */
    extra: number;

    /** The tile columns `plugin_config.grid_columns` asks for. */
    grid_columns: number | undefined;

    /** The tile rows `plugin_config.grid_rows` asks for. */
    grid_rows: number | undefined;
}

export interface Layout {
    cols: number;
    rows: number;

    /** Fixed tile height in pixels when the tiles overflow and scroll. */
    tile_height: number | undefined;
    padding: number;
    placements: LabelPlacement[];
    label_sizes: number[];
    value_sizes: number[];

    /** Each container's grid, when tiles nest in groups. */
    containers?: Map<TileGroup, ContainerGrid>;

    /** Each tile's padding, when tiles nest in groups. */
    paddings?: number[];
}

/** The grid of one container of tiles or groups. */
export interface ContainerGrid {
    cols: number;

    /** The rows the container's height is divided into, or `undefined` for rows sized by their content. */
    rows: number | undefined;

    /** The items in the last row, which stretch to fill it. */
    last: number;

    /** The `SPLIT_STEPS`ths of a rollup's length that its totals take. */
    split?: number;
}

interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const GAP = 1;
const VALUE_LINE_HEIGHT = 1.1;
const LABEL_LINE_HEIGHT = 1.3;
export const TRACK_EXTRA = 0.2;

const LABEL_RATIO = 0.28;
const LABEL_MIN = 10;
const LABEL_MAX = 22;
const MIN_VALUE_SIZE = 14;
const INLINE_LABEL_MAX = 0.4;
const INLINE_LABEL_GAP = 0.75;
const FIT_SLACK = 0.96;
const SCROLL_PADDING = 8;
const SCROLLBAR = 12;

interface Metrics {
    value: number;
    label: number;
    lines: number;
}

interface Fit {
    value: number;
    label: number;
    padding: number;
    placement: LabelPlacement;
}

/** The tiles sharing one label position, by the widest of their texts. */
interface Group {
    position: LabelPosition;
    widest: Metrics;
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}

function is_stacked(placement: LabelPlacement): boolean {
    return placement === "top" || placement === "bottom";
}

function placement_of(position: LabelPosition): LabelPlacement {
    return position === "auto" ? "top" : position;
}

/** The largest value font size that fits a `(w, h)` cell beside `label`. */
function fit_value(
    w: number,
    h: number,
    padding: number,
    label: number,
    em: Metrics,
    placement: LabelPlacement,
    extra: number,
): number {
    const iw = Math.max(1, w - 2 * padding);
    const ih = Math.max(1, h - 2 * padding);
    const lines = VALUE_LINE_HEIGHT + extra;
    if (placement === "none") {
        return Math.min(ih / lines, iw / em.value);
    }

    if (is_stacked(placement)) {
        return Math.min(
            (ih - label * LABEL_LINE_HEIGHT * em.lines) / lines,
            iw / em.value,
        );
    }

    const label_width = Math.min(em.label * label, iw * INLINE_LABEL_MAX);
    return Math.min(
        ih / lines,
        (iw - label_width - label * INLINE_LABEL_GAP) / em.value,
    );
}

function label_for(value: number, placement: LabelPlacement): number {
    return placement === "none"
        ? 0
        : clamp(value * LABEL_RATIO, LABEL_MIN, LABEL_MAX);
}

function fit_cell(
    w: number,
    h: number,
    em: Metrics,
    placement: LabelPlacement,
    extra: number,
): Fit {
    const padding = clamp(Math.min(w, h) * 0.08, 4, 24);
    const ih = Math.max(1, h - 2 * padding);
    const share = is_stacked(placement)
        ? LABEL_RATIO * LABEL_LINE_HEIGHT * em.lines
        : 0;

    const by_height = ih / (VALUE_LINE_HEIGHT + extra + share);
    const guess = fit_value(
        w,
        h,
        padding,
        label_for(by_height, placement),
        em,
        placement,
        extra,
    );

    const label = label_for(guess, placement);
    const value = fit_value(w, h, padding, label, em, placement, extra);
    return { value, label, padding, placement };
}

function best_fit(
    w: number,
    h: number,
    em: Metrics,
    position: LabelPosition,
    extra: number,
): Fit {
    if (position !== "auto") {
        return fit_cell(w, h, em, position, extra);
    }

    const top = fit_cell(w, h, em, "top", extra);
    const left = fit_cell(w, h, em, "left", extra);
    return left.value > top.value ? left : top;
}

function group_tiles(tiles: TileMetrics[]): Group[] {
    const groups = new Map<LabelPosition, Metrics>();
    for (const tile of tiles) {
        const widest = groups.get(tile.position);
        groups.set(tile.position, {
            value: Math.max(widest?.value ?? 0, tile.value),
            label: Math.max(widest?.label ?? 0, tile.label),
            lines: Math.max(widest?.lines ?? 0, tile.lines),
        });
    }

    return [...groups].map(([position, widest]) => ({ position, widest }));
}

/** Each group's fit in a `(w, h)` cell, and the smallest value among them. */
function fit_groups(
    w: number,
    h: number,
    groups: Group[],
    extra: number,
): { fits: Map<LabelPosition, Fit>; value: number } {
    const fits = new Map<LabelPosition, Fit>();
    let value = Infinity;
    for (const group of groups) {
        const fit = best_fit(w, h, group.widest, group.position, extra);
        fits.set(group.position, fit);
        value = Math.min(value, fit.value);
    }

    return { fits, value };
}

/** The width of tile `index`, whose row stretches to fill the container. */
function tile_width(
    index: number,
    count: number,
    cols: number,
    rows: number,
    width: number,
): number {
    const row = Math.floor(index / cols);
    const in_row = row < rows - 1 ? cols : count - (rows - 1) * cols;
    return (width - (in_row - 1) * GAP) / in_row;
}

interface Grid {
    cols: number;

    /** The rows the panel's height is divided into. */
    rows: number;

    /** The rows the tiles occupy. */
    occupied: number;
}

/** The grid `grid_columns` and `grid_rows` ask for, if either does. */
function explicit_grid(
    count: number,
    grid_columns: number | undefined,
    grid_rows: number | undefined,
): Grid | undefined {
    if (grid_columns !== undefined) {
        const cols = Math.min(grid_columns, count);
        const occupied = Math.ceil(count / cols);
        return { cols, rows: grid_rows ?? occupied, occupied };
    }

    if (grid_rows !== undefined) {
        const cols = Math.ceil(count / Math.min(grid_rows, count));
        const occupied = Math.ceil(count / cols);
        return { cols, rows: occupied, occupied };
    }

    return undefined;
}

/**
 * The grid shape, label placements and font sizes that give `input.tiles`
 * the largest value text in a `(width, height)` box, falling back to
 * fixed-height scrolling tiles when that text would be too small to read,
 * unless `grid_columns` or `grid_rows` fix the shape.
 */
export function compute_layout(input: LayoutInput): Layout {
    const { width, height, tiles, uniform, extra } = input;
    const count = tiles.length;
    if (count === 0 || width <= 0 || height <= 0) {
        return {
            cols: 1,
            rows: 1,
            tile_height: undefined,
            padding: 4,
            placements: tiles.map((x) => placement_of(x.position)),
            label_sizes: tiles.map(() => LABEL_MIN),
            value_sizes: tiles.map(() => MIN_VALUE_SIZE),
        };
    }

    const groups = group_tiles(tiles);
    let box_width = width;
    let tile_height: number | undefined;
    let fits: Map<LabelPosition, Fit>;
    let padding: number;
    let grid = explicit_grid(count, input.grid_columns, input.grid_rows);
    let cell_height: number;
    if (grid !== undefined) {
        if (grid.occupied > grid.rows) {
            box_width = Math.max(1, width - SCROLLBAR);
            tile_height = (height - (grid.rows - 1) * GAP) / grid.rows;
        }

        cell_height = (height - (grid.rows - 1) * GAP) / grid.rows;
        const w = (box_width - (grid.cols - 1) * GAP) / grid.cols;
        fits = fit_groups(w, cell_height, groups, extra).fits;
        padding = fits.values().next().value!.padding;
    } else {
        let best: ReturnType<typeof fit_groups> | undefined;
        let total = Infinity;
        grid = { cols: 1, rows: count, occupied: count };
        for (let c = 1; c <= count; c++) {
            const r = Math.ceil(count / c);
            const w = (width - (c - 1) * GAP) / c;
            const h = (height - (r - 1) * GAP) / r;
            const candidate = fit_groups(w, h, groups, extra);
            if (
                best === undefined ||
                candidate.value > best.value ||
                (candidate.value === best.value && c * r < total)
            ) {
                grid = { cols: c, rows: r, occupied: r };
                total = c * r;
                best = candidate;
            }
        }

        fits = best!.fits;
        padding = fits.values().next().value!.padding;
        cell_height = (height - (grid.rows - 1) * GAP) / grid.rows;
        if (best!.value * FIT_SLACK < MIN_VALUE_SIZE) {
            fits = new Map();
            let min_width = 0;
            let fallback_height = 0;
            for (const { position, widest } of groups) {
                const placement = placement_of(position);
                const label = placement === "none" ? 0 : LABEL_MIN;
                const inline = placement === "left" || placement === "right";
                fits.set(position, {
                    value: 0,
                    label,
                    padding: SCROLL_PADDING,
                    placement,
                });

                fallback_height = Math.max(
                    fallback_height,
                    (MIN_VALUE_SIZE / FIT_SLACK) * (VALUE_LINE_HEIGHT + extra) +
                        (is_stacked(placement)
                            ? label * LABEL_LINE_HEIGHT * widest.lines
                            : 0) +
                        2 * SCROLL_PADDING,
                );

                min_width = Math.max(
                    min_width,
                    (MIN_VALUE_SIZE / FIT_SLACK) * widest.value +
                        (inline
                            ? (widest.label + INLINE_LABEL_GAP) * label
                            : 0) +
                        2 * SCROLL_PADDING,
                );
            }

            tile_height = Math.ceil(fallback_height);
            box_width = Math.max(1, width - SCROLLBAR);
            const cols = clamp(
                Math.floor((box_width + GAP) / (min_width + GAP)),
                1,
                count,
            );

            const rows = Math.ceil(count / cols);
            grid = { cols, rows, occupied: rows };
            cell_height = tile_height;
            padding = SCROLL_PADDING;
        }
    }

    const widest = new Map(groups.map((x) => [x.position, x.widest]));
    const sizes = tiles.map((em, index) => {
        const fit = fits.get(em.position)!;
        const w = tile_width(index, count, grid.cols, grid.occupied, box_width);
        return fit_value(
            w,
            cell_height,
            padding,
            fit.label,
            uniform ? widest.get(em.position)! : em,
            fit.placement,
            extra,
        );
    });

    const shared = Math.min(...sizes);
    const value_sizes = sizes.map((x) => {
        const px = (uniform ? shared : x) * FIT_SLACK;
        return Math.max(1, Math.floor(px * 2) / 2);
    });

    return {
        cols: grid.cols,
        rows: grid.rows,
        tile_height,
        padding,
        placements: tiles.map((x) => fits.get(x.position)!.placement),
        label_sizes: tiles.map((x) => fits.get(x.position)!.label),
        value_sizes,
    };
}

/** Whether this browser's CSS has `round()`, absent before Chrome 125. */
const CSS_ROUND =
    typeof CSS !== "undefined" &&
    CSS.supports("width", "round(down, 1px, 0.5px)");

function num(x: number): string {
    return String(Number(x.toFixed(4)));
}

/**
 * {@link fit_value} as a CSS length, for a content box of `iw` by `ih` and a
 * label font size of `label`, all CSS lengths.
 */
function css_fit(
    iw: string,
    ih: string,
    label: string,
    em: Metrics,
    placement: LabelPlacement,
    extra: number,
): string {
    const lines = num(VALUE_LINE_HEIGHT + extra);
    const value = num(em.value);
    if (placement === "none") {
        return `min(${ih} / ${lines}, ${iw} / ${value})`;
    }

    if (is_stacked(placement)) {
        return `min((${ih} - ${label} * ${num(LABEL_LINE_HEIGHT * em.lines)}) / ${lines}, ${iw} / ${value})`;
    }

    return `min(${ih} / ${lines}, (${iw} - min(${label} * ${num(em.label)}, ${iw} * ${INLINE_LABEL_MAX}) - ${label} * ${INLINE_LABEL_GAP}) / ${value})`;
}

/** The final value font size for the fit `fit`, as `compute_layout` rounds it. */
function css_size(fit: string): string {
    return CSS_ROUND
        ? `max(1px, round(down, ${fit} * ${FIT_SLACK}, 0.5px))`
        : `max(1px, ${fit} * ${FIT_SLACK})`;
}

/**
 * The shared value font size of a flat, uniform `layout` as a CSS length in
 * the container units of the tile grid, sized to a full row's cell.
 */
export function uniform_value_css(
    layout: Layout,
    tiles: TileMetrics[],
    extra: number,
): string | undefined {
    if (tiles.length === 0) {
        return undefined;
    }

    const padding = num(2 * layout.padding);
    const iw = `((100cqw - ${(layout.cols - 1) * GAP}px) / ${layout.cols} - ${padding}px)`;
    const ih =
        layout.tile_height === undefined
            ? `((100cqh - ${(layout.rows - 1) * GAP}px) / ${layout.rows} - ${padding}px)`
            : `${num(layout.tile_height - 2 * layout.padding)}px`;

    const fits = group_tiles(tiles).map(({ position, widest }) => {
        const index = tiles.findIndex((x) => x.position === position);
        return css_fit(
            iw,
            ih,
            `${num(layout.label_sizes[index])}px`,
            widest,
            layout.placements[index],
            extra,
        );
    });

    return css_size(fits.length === 1 ? fits[0] : `min(${fits.join(", ")})`);
}

/**
 * One tile's value font size as a CSS length in the container units of the
 * tile itself, its label size read from `--psp-summary--label-size`.
 */
export function tile_value_css(
    em: Metrics,
    placement: LabelPlacement,
    extra: number,
): string {
    return css_size(
        css_fit(
            "100cqw",
            "100cqh",
            "var(--psp-summary--label-size)",
            em,
            placement,
            extra,
        ),
    );
}

export const GROUP_HEADER = 20;
export const GROUP_PAD = 4;
export const GROUP_GAP = 4;
export const SPLIT_STEPS = 64;

const STACKED: Grid = { cols: 1, rows: 2, occupied: 2 };
const BESIDE: Grid = { cols: 2, rows: 1, occupied: 1 };

function header_of(node: TileGroup): number {
    return node.label === undefined ? 0 : GROUP_HEADER;
}

function pad_of(node: TileGroup): number {
    return node.label === undefined ? 0 : GROUP_PAD;
}

interface Choice {
    value: number;
    grid: Grid;
    split?: number;
}

/** Fits the groups of one tree to boxes, memoized by group shape and size. */
/**
 * The share in `[lo, hi]` whose smaller value is largest, given that the
 * first value grows with the share and the second shrinks.
 */
function balance(
    values: (k: number) => [number, number],
    lo: number,
    hi: number,
): { split: number; value: number } {
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const [t, g] = values(mid);
        if (t >= g) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }

    const value = Math.min(...values(lo));
    const below = lo > 1 ? Math.min(...values(lo - 1)) : -Infinity;
    return below > value
        ? { split: lo - 1, value: below }
        : { split: lo, value };
}

class HierarchyFit {
    private shapes = new Map<TileGroup, string>();
    private ids = new Map<string, number>();
    private memos = new Map<TileGroup, Map<number, Map<number, Choice>>>();
    private by_shape: Map<number, Map<number, Choice>>[] = [];
    private groups: Group[];
    private extra: number;
    private grid_columns: number | undefined;
    private grid_rows: number | undefined;

    constructor(
        groups: Group[],
        extra: number,
        grid_columns: number | undefined,
        grid_rows: number | undefined,
    ) {
        this.groups = groups;
        this.extra = extra;
        this.grid_columns = grid_columns;
        this.grid_rows = grid_rows;
    }

    shape(node: TileGroup): string {
        let shape = this.shapes.get(node);
        if (shape === undefined) {
            shape = `${node.label === undefined ? "u" : "h"}${node.rollup ? "r" : ""}${node.tiles.length}[${node.groups.map((x) => this.shape(x)).join(",")}]`;
            this.shapes.set(node, shape);
        }

        return shape;
    }

    /** The memo of `node`, shared by every group of the same shape. */
    private memo(node: TileGroup): Map<number, Map<number, Choice>> {
        let memo = this.memos.get(node);
        if (memo === undefined) {
            const shape = this.shape(node);
            let id = this.ids.get(shape);
            if (id === undefined) {
                id = this.by_shape.push(new Map()) - 1;
                this.ids.set(shape, id);
            }

            memo = this.by_shape[id];
            this.memos.set(node, memo);
        }

        return memo;
    }

    /** The grid of `node`'s items that fits a `(w, h)` content box best. */
    choose(node: TileGroup, w: number, h: number): Choice {
        const memo = this.memo(node);
        let by_height = memo.get(w);
        if (by_height === undefined) {
            by_height = new Map();
            memo.set(w, by_height);
        }

        const cached = by_height.get(h);
        if (cached !== undefined) {
            return cached;
        }

        const choice = node.rollup
            ? this.choose_split(node, w, h)
            : this.choose_grid(node, w, h);

        by_height.set(h, choice);
        return choice;
    }

    /** A rollup's totals and groups values when its totals take `k` steps. */
    private split_values(
        node: TileGroup,
        stacked: boolean,
        w: number,
        h: number,
    ): (k: number) => [number, number] {
        const [totals, groups] = node.groups;
        const length = (stacked ? h : w) - GROUP_GAP;
        return (k) => {
            const first = (length * k) / SPLIT_STEPS;
            return stacked
                ? [
                      this.choose(totals, w, first).value,
                      this.choose(groups, w, length - first).value,
                  ]
                : [
                      this.choose(totals, first, h).value,
                      this.choose(groups, length - first, h).value,
                  ];
        };
    }

    /**
     * The orientation and share of a rollup's length for its totals that
     * gives the largest value text, the smallest such share.
     */
    private choose_split(node: TileGroup, w: number, h: number): Choice {
        let best: Choice = {
            value: 0,
            grid: STACKED,
            split: SPLIT_STEPS / 2,
        };

        for (const grid of [STACKED, BESIDE]) {
            const stacked = grid === STACKED;
            if ((stacked ? h : w) <= GROUP_GAP || (stacked ? w : h) <= 0) {
                continue;
            }

            const { split, value } = balance(
                this.split_values(node, stacked, w, h),
                1,
                SPLIT_STEPS - 1,
            );

            if (value > best.value) {
                best = { value, grid, split };
            }
        }

        return best;
    }

    /**
     * The largest share of a rollup's length for its totals that keeps the
     * value text of `choice`, whose share is the smallest that does.
     */
    private widen_split(
        node: TileGroup,
        w: number,
        h: number,
        choice: Choice,
    ): number {
        const values = this.split_values(node, choice.grid.cols === 1, w, h);
        let split = choice.split!;
        const [t, g] = values(split);
        if (t < g) {
            return split;
        }

        let end = SPLIT_STEPS - 1;
        while (split < end) {
            const mid = (split + end + 1) >> 1;
            if (values(mid)[1] >= g) {
                split = mid;
            } else {
                end = mid - 1;
            }
        }

        return split;
    }

    private choose_grid(node: TileGroup, w: number, h: number): Choice {
        const leaf = node.groups.length === 0;
        const count = leaf ? node.tiles.length : node.groups.length;
        const gap = leaf ? GAP : GROUP_GAP;
        let choice: Choice = {
            value: 0,
            grid: { cols: 1, rows: 1, occupied: 1 },
        };

        if (count > 0 && w > 0 && h > 0) {
            const explicit = leaf
                ? explicit_grid(count, this.grid_columns, this.grid_rows)
                : undefined;

            const grids =
                explicit !== undefined
                    ? [
                          {
                              ...explicit,
                              rows: Math.max(explicit.rows, explicit.occupied),
                          },
                      ]
                    : Array.from({ length: count }, (_, i) => {
                          const rows = Math.ceil(count / (i + 1));
                          return { cols: i + 1, rows, occupied: rows };
                      });

            let total = Infinity;
            let best: Choice | undefined;
            for (const grid of grids) {
                const cw = (w - (grid.cols - 1) * gap) / grid.cols;
                const ch = (h - (grid.rows - 1) * gap) / grid.rows;
                const value = leaf
                    ? fit_groups(cw, ch, this.groups, this.extra).value
                    : Math.min(
                          ...node.groups.map(
                              (child) =>
                                  this.choose(
                                      child,
                                      cw - 2 * pad_of(child),
                                      ch - header_of(child) - pad_of(child),
                                  ).value,
                          ),
                      );

                const cells = grid.cols * grid.rows;
                if (
                    best === undefined ||
                    value > best.value ||
                    (value === best.value && cells < total)
                ) {
                    best = { value, grid };
                    total = cells;
                }
            }

            choice = best!;
        }

        return choice;
    }

    /**
     * Record the grid of `node` and every group in it for a content box, and
     * the box each tile gets.
     */
    place(
        node: TileGroup,
        box: Rect,
        tile_rects: Rect[],
        containers: Map<TileGroup, ContainerGrid>,
    ): void {
        const choice = this.choose(node, box.width, box.height);
        const { grid } = choice;
        if (node.rollup && choice.split !== undefined) {
            const [totals, groups] = node.groups;
            const split = this.widen_split(node, box.width, box.height, choice);
            const stacked = grid.cols === 1;
            const length = (stacked ? box.height : box.width) - GROUP_GAP;
            const first = (length * split) / SPLIT_STEPS;
            containers.set(node, {
                cols: grid.cols,
                rows: grid.rows,
                last: grid.cols,
                split,
            });

            this.place(
                totals,
                stacked ? { ...box, height: first } : { ...box, width: first },
                tile_rects,
                containers,
            );

            this.place(
                groups,
                stacked
                    ? {
                          ...box,
                          top: box.top + first + GROUP_GAP,
                          height: length - first,
                      }
                    : {
                          ...box,
                          left: box.left + first + GROUP_GAP,
                          width: length - first,
                      },
                tile_rects,
                containers,
            );

            return;
        }

        const leaf = node.groups.length === 0;
        const count = leaf ? node.tiles.length : node.groups.length;
        const gap = leaf ? GAP : GROUP_GAP;
        const cell_height = (box.height - (grid.rows - 1) * gap) / grid.rows;
        containers.set(node, {
            cols: grid.cols,
            rows: grid.rows,
            last: count - (grid.occupied - 1) * grid.cols,
        });

        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / grid.cols);
            const in_row =
                row < grid.occupied - 1
                    ? grid.cols
                    : count - (grid.occupied - 1) * grid.cols;

            const width = (box.width - (in_row - 1) * gap) / in_row;
            const rect = {
                left: box.left + (i - row * grid.cols) * (width + gap),
                top: box.top + row * (cell_height + gap),
                width,
                height: cell_height,
            };

            if (leaf) {
                tile_rects[node.tiles[i]] = rect;
            } else {
                const child = node.groups[i];
                const pad = pad_of(child);
                const header = header_of(child);
                this.place(
                    child,
                    {
                        left: rect.left + pad,
                        top: rect.top + header,
                        width: rect.width - 2 * pad,
                        height: rect.height - header - pad,
                    },
                    tile_rects,
                    containers,
                );
            }
        }
    }
}

/**
 * Record `node`'s groups as full-width sections of fixed-height tile rows,
 * and the box each tile gets.
 */
function stack(
    node: TileGroup,
    width: number,
    tile: { width: number; height: number },
    tile_rects: Rect[],
    containers: Map<TileGroup, ContainerGrid>,
): void {
    if (node.groups.length === 0) {
        const count = node.tiles.length;
        const cols = clamp(
            Math.floor((width + GAP) / (tile.width + GAP)),
            1,
            Math.max(1, count),
        );

        const occupied = Math.ceil(count / cols);
        containers.set(node, {
            cols,
            rows: undefined,
            last: count - (occupied - 1) * cols,
        });

        node.tiles.forEach((index, i) => {
            const row = Math.floor(i / cols);
            const in_row =
                row < occupied - 1 ? cols : count - (occupied - 1) * cols;

            tile_rects[index] = {
                left: 0,
                top: 0,
                width: (width - (in_row - 1) * GAP) / in_row,
                height: tile.height,
            };
        });

        return;
    }

    containers.set(node, { cols: 1, rows: undefined, last: 1 });
    for (const child of node.groups) {
        stack(child, width - 2 * pad_of(child), tile, tile_rects, containers);
    }
}

/**
 * The grids and font sizes that give `input.tiles`, nested as `tree`, the
 * largest value text in a `(width, height)` box, falling back to scrolling
 * full-width sections when that text would be too small to read.
 */
export function compute_hierarchy_layout(
    input: LayoutInput,
    tree: TileGroup,
): Layout {
    const { width, height, tiles, uniform, extra } = input;
    const count = tiles.length;
    if (count === 0 || width <= 0 || height <= 0) {
        return compute_layout(input);
    }

    const groups = group_tiles(tiles);
    const widest = new Map(groups.map((x) => [x.position, x.widest]));
    const fitter = new HierarchyFit(
        groups,
        extra,
        input.grid_columns,
        input.grid_rows,
    );

    const tile_rects: Rect[] = new Array(count);
    const containers = new Map<TileGroup, ContainerGrid>();
    let tile_height: number | undefined;
    let fits: Map<LabelPosition, Fit>;
    const best = fitter.choose(tree, width, height);
    if (best.value * FIT_SLACK >= MIN_VALUE_SIZE) {
        fitter.place(
            tree,
            { left: 0, top: 0, width, height },
            tile_rects,
            containers,
        );

        fits = new Map();
        for (const { position, widest: em } of groups) {
            const rects = tiles.flatMap((x, i) =>
                x.position === position ? [tile_rects[i]] : [],
            );

            fits.set(
                position,
                best_fit(
                    Math.min(...rects.map((x) => x.width)),
                    Math.min(...rects.map((x) => x.height)),
                    em,
                    position,
                    extra,
                ),
            );
        }
    } else {
        fits = new Map();
        let min_width = 0;
        tile_height = 0;
        for (const { position, widest: em } of groups) {
            const placement = placement_of(position);
            const label = placement === "none" ? 0 : LABEL_MIN;
            const inline = placement === "left" || placement === "right";
            fits.set(position, {
                value: 0,
                label,
                padding: SCROLL_PADDING,
                placement,
            });

            tile_height = Math.max(
                tile_height,
                Math.ceil(
                    (MIN_VALUE_SIZE / FIT_SLACK) * (VALUE_LINE_HEIGHT + extra) +
                        (is_stacked(placement)
                            ? label * LABEL_LINE_HEIGHT * em.lines
                            : 0) +
                        2 * SCROLL_PADDING,
                ),
            );

            min_width = Math.max(
                min_width,
                (MIN_VALUE_SIZE / FIT_SLACK) * em.value +
                    (inline ? (em.label + INLINE_LABEL_GAP) * label : 0) +
                    2 * SCROLL_PADDING,
            );
        }

        stack(
            tree,
            Math.max(1, width - SCROLLBAR),
            { width: min_width, height: tile_height },
            tile_rects,
            containers,
        );
    }

    const sizes = tiles.map((em, index) => {
        const fit = fits.get(em.position)!;
        const rect = tile_rects[index];
        return fit_value(
            rect.width,
            rect.height,
            fit.padding,
            fit.label,
            uniform ? widest.get(em.position)! : em,
            fit.placement,
            extra,
        );
    });

    const shared = Math.min(...sizes);
    return {
        cols: 1,
        rows: 1,
        tile_height,
        padding: fits.values().next().value!.padding,
        placements: tiles.map((x) => fits.get(x.position)!.placement),
        label_sizes: tiles.map((x) => fits.get(x.position)!.label),
        value_sizes: sizes.map((x) => {
            const px = (uniform ? shared : x) * FIT_SLACK;
            return Math.max(1, Math.floor(px * 2) / 2);
        }),
        containers,
        paddings: tiles.map((x) => fits.get(x.position)!.padding),
    };
}
