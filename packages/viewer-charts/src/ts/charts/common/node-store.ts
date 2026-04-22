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

/**
 * Struct-of-arrays storage for a hierarchical tree (treemap + sunburst).
 * A node is a numeric `id` into parallel typed arrays; hot numeric
 * fields live in `Float32Array` / `Int32Array` so iteration is
 * cache-linear and heap pressure stays flat.
 *
 * Children are a singly-linked list per parent (`firstChild` /
 * `nextSibling`, with `lastChild` for O(1) append). The `NULL_NODE = -1`
 * sentinel marks "no node" for `parent`, end-of-list for `nextSibling`,
 * and "leaf" for `firstChild`.
 *
 * Layout fields come in two flavors:
 *   - `x0 / y0 / x1 / y1`  — rectangular coords (treemap, future bar
 *     hierarchies)
 *   - `a0 / a1 / r0 / r1`  — polar coords (sunburst)
 * Each chart populates only its own flavor; the other set wastes ~16 B
 * per node (32 MB at 2M nodes) — a small price for keeping a single
 * unified store across hierarchical chart types.
 *
 * At typical tree shapes the SOA + linked-list representation is ~10×
 * cheaper on heap and ~4× faster to build than per-node `Object` +
 * `Array<Child>` (which allocates ~300 B / node and is O(N²) for naive
 * child-name lookup). At 2M nodes the former OOMs the tab; the latter
 * stays under 100 MB.
 */
export const NULL_NODE = -1;

export class NodeStore {
    // Hot numeric fields (tight-loop iteration in layout / render).
    size!: Float32Array;
    value!: Float32Array;
    colorValue!: Float32Array;

    // Rectangular layout (treemap).
    x0!: Float32Array;
    y0!: Float32Array;
    x1!: Float32Array;
    y1!: Float32Array;

    // Polar layout (sunburst). `a0 / a1` in radians, `r0 / r1` in pixels.
    a0!: Float32Array;
    a1!: Float32Array;
    r0!: Float32Array;
    r1!: Float32Array;

    depth!: Int32Array;

    // Tree topology.
    parent!: Int32Array;
    firstChild!: Int32Array;
    nextSibling!: Int32Array;
    lastChild!: Int32Array;
    childCount!: Int32Array;

    // Leaf source-row link. `-1` for branches; for leaves, the index
    // into the chart's row-data column buffers (enables O(1) tooltip
    // lookup without per-node `Map` allocations).
    leafRowIdx!: Int32Array;

    // Cold (only read on hover / label draw): plain JS arrays.
    name!: string[];
    colorLabel!: string[];

    count = 0;
    capacity = 0;

    constructor(initialCapacity = 1024) {
        this._allocate(initialCapacity);
    }

    reset(): void {
        this.count = 0;
        // Typed-array content doesn't need clearing — valid slots are
        // always written before read. `name` / `colorLabel` get stale
        // entries but `allocate()` clears them per-slot as reused.
    }

    /**
     * Reserve a new node id. Caller must immediately initialize the
     * hot numeric fields and set `parent` / `depth`; topology fields
     * default to `NULL_NODE`.
     */
    allocate(): number {
        if (this.count === this.capacity) {
            this._allocate(this.capacity * 2);
        }
        const id = this.count++;
        this.firstChild[id] = NULL_NODE;
        this.nextSibling[id] = NULL_NODE;
        this.lastChild[id] = NULL_NODE;
        this.childCount[id] = 0;
        this.leafRowIdx[id] = NULL_NODE;
        this.size[id] = 0;
        this.value[id] = 0;
        this.colorValue[id] = NaN;
        this.name[id] = "";
        this.colorLabel[id] = "";
        return id;
    }

    /** O(1) append `childId` as the last child of `parentId`. */
    appendChild(parentId: number, childId: number): void {
        this.parent[childId] = parentId;
        this.depth[childId] = this.depth[parentId] + 1;
        this.nextSibling[childId] = NULL_NODE;
        const last = this.lastChild[parentId];
        if (last === NULL_NODE) {
            this.firstChild[parentId] = childId;
        } else {
            this.nextSibling[last] = childId;
        }
        this.lastChild[parentId] = childId;
        this.childCount[parentId]++;
    }

    /** `true` if the node has no children (branches set firstChild when they acquire one). */
    isLeaf(id: number): boolean {
        return this.firstChild[id] === NULL_NODE;
    }

    private _allocate(newCapacity: number): void {
        const cap = Math.max(newCapacity, 1024);

        const grow = <T extends Float32Array | Int32Array>(
            old: T | undefined,
            ctor: { new (n: number): T },
        ): T => {
            const next = new ctor(cap);
            if (old && old.length > 0) next.set(old);
            return next;
        };

        this.size = grow(this.size, Float32Array);
        this.value = grow(this.value, Float32Array);
        this.colorValue = grow(this.colorValue, Float32Array);
        this.x0 = grow(this.x0, Float32Array);
        this.y0 = grow(this.y0, Float32Array);
        this.x1 = grow(this.x1, Float32Array);
        this.y1 = grow(this.y1, Float32Array);
        this.a0 = grow(this.a0, Float32Array);
        this.a1 = grow(this.a1, Float32Array);
        this.r0 = grow(this.r0, Float32Array);
        this.r1 = grow(this.r1, Float32Array);
        this.depth = grow(this.depth, Int32Array);
        this.parent = grow(this.parent, Int32Array);
        this.firstChild = grow(this.firstChild, Int32Array);
        this.nextSibling = grow(this.nextSibling, Int32Array);
        this.lastChild = grow(this.lastChild, Int32Array);
        this.childCount = grow(this.childCount, Int32Array);
        this.leafRowIdx = grow(this.leafRowIdx, Int32Array);

        // JS arrays: preserve existing, extend with empty slots.
        if (!this.name) this.name = new Array(cap);
        else this.name.length = cap;
        if (!this.colorLabel) this.colorLabel = new Array(cap);
        else this.colorLabel.length = cap;

        this.capacity = cap;
    }
}

/**
 * Walk the ancestor chain back to (but not including) the synthetic
 * root, topmost first. Allocates a fresh string array — callers that
 * care about allocations should inline the walk.
 */
export function ancestorNames(store: NodeStore, id: number): string[] {
    const out: string[] = [];
    let n = id;
    while (store.parent[n] !== NULL_NODE) {
        out.push(store.name[n]);
        n = store.parent[n];
    }
    return out.reverse();
}
