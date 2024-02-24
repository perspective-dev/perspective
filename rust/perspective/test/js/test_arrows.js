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

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

// globalThis.require = createRequire(import.meta.url);
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Returns an `ArrayBuffer` containing the contents of a `.arrow` file
 * located at `arrow_path`.
 *
 * Because `fs.readFileSync` shares its underlying buffer
 * between calls to `readFileSync`, we need to get a slice
 * of the `ArrayBuffer` specifically at its byte offset.
 *
 * See https://github.com/nodejs/node/issues/11132 for more details.
 *
 * @param arrow_path {String} a path to an arrow file.
 * @returns {ArrayBuffer} an ArrayBuffer containing the arrow-serialized data.
 */
function load_arrow(arrow_path) {
    const data = fs.readFileSync(arrow_path);
    return data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
    );
}

export const chunked_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "chunked.arrow")
);

export const test_null_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "test_null.arrow")
);

export const test_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "test.arrow")
);

export const partial_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "partial.arrow")
);

export const partial_missing_rows_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "partial_missing_rows.arrow")
);

export const int_float_str_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "int_float_str.arrow")
);

export const int_float_str_update_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "int_float_str_update.arrow")
);

export const int_float_str_file_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "int_float_str_file.arrow")
);

export const date32_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "date32.arrow")
);

export const date64_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "date64.arrow")
);

export const dict_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "dict.arrow")
);

export const dict_update_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "dict_update.arrow")
);

export const numbers_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "number_types.arrow")
);

export const all_types_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "all_types_small.arrow")
);

// uint8-64 x2, int8-64 x2, date, datetime, bool, string
export const all_types_multi_arrow = load_arrow(
    path.join(__dirname, "..", "arrow", "all_types_small_multi.arrow")
);

// module.exports = {
//     chunked_arrow,
//     test_null_arrow,
//     test_arrow,
//     partial_arrow,
//     partial_missing_rows_arrow,
//     int_float_str_arrow,
//     int_float_str_update_arrow,
//     int_float_str_file_arrow,
//     date32_arrow,
//     date64_arrow,
//     dict_arrow,
//     dict_update_arrow,
//     numbers_arrow,
//     all_types_arrow,
//     all_types_multi_arrow,
// };
