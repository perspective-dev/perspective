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
 * Load the Superstore example data set as either a Feather (LZ4) or
 * uncompressed `Arrow`, depending on whether Perspective supports Feather.
 * @param {*} metadata
 * @returns
 */
export function new_superstore_table(metadata) {
    if (check_version_gte(metadata.version, "2.5.0")) {
        return SUPERSTORE_FEATHER.slice();
    } else {
        return SUPERSTORE_ARROW.slice();
    }
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
