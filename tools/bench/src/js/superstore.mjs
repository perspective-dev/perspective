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
 * Load a file as an `ArrayBuffer`, which is useful for loading Apache Arrow
 * Feather files.
 * @param {*} path
 * @returns
 */
async function get_buffer(path) {
    if (typeof window !== "undefined") {
        const resp = await fetch(
            "http://localhost:8080/node_modules/superstore-arrow/superstore.lz4.arrow",
        );

        return await resp.arrayBuffer();
    } else {
        const fs = await import("node:fs");
        const { createRequire } = await import("node:module");
        const _require = createRequire(import.meta.url);
        return fs.readFileSync(_require.resolve(path)).buffer;
    }
}

const SUPERSTORE_ARROW = await get_buffer("superstore-arrow/superstore.arrow");
const SUPERSTORE_FEATHER = await get_buffer(
    "superstore-arrow/superstore.lz4.arrow",
);

/**
 * How many times the Superstore data set is replicated. Superstore is small
 * enough that per-call fixed costs dominate some benchmarks; replicating it
 * moves the measurement onto the per-row work. `1` is the original data set.
 *
 * Override with `PSP_BENCH_SUPERSTORE_COPIES` where an environment exists.
 */
export const SUPERSTORE_COPIES = (() => {
    const env =
        typeof process !== "undefined" &&
        process.env?.PSP_BENCH_SUPERSTORE_COPIES;

    return env ? parseInt(env, 10) : 1;
})();

const REPLICATED = new Map();

/**
 * Load the Superstore example data set as either a Feather (LZ4) or
 * uncompressed `Arrow`, depending on whether Perspective supports Feather.
 * @param {*} metadata
 * @returns
 */
export async function new_superstore_table(perspective, metadata) {
    const base = check_version_gte(metadata.version, "2.5.0")
        ? SUPERSTORE_FEATHER
        : SUPERSTORE_ARROW;

    if (SUPERSTORE_COPIES <= 1) {
        return base.slice();
    }

    const cached = REPLICATED.get(base);
    if (cached !== undefined) {
        return cached.slice();
    }

    const table = await perspective.table(base.slice());
    for (let i = 1; i < SUPERSTORE_COPIES; i++) {
        await table.update(base.slice());
    }

    const view = await table.view();
    const arrow = await view.to_arrow();
    if (check_version_gte(metadata.version, "2.10.9")) {
        await view.delete();
    }

    if (check_version_gte(metadata.version, "3.0.0")) {
        await table.delete();
    }

    REPLICATED.set(base, arrow);
    return arrow.slice();
}

/**
 * Check whether a version string e.g. "v1.2.3" is greater or equal to another
 * version string, which must be of the same length/have the same number of
 * minor version levels.
 * @param {*} a
 * @param {*} b
 * @returns
 */
export function check_version_gte(a, b) {
    a = a.split(".").map((x) => parseInt(x));
    b = b.split(".").map((x) => parseInt(x));

    if (a.length === 1) {
        return true;
    }

    for (const i in a) {
        if (a[i] > b[i]) {
            return true;
        } else if (a[i] < b[i]) {
            return false;
        }
    }

    return true;
}
