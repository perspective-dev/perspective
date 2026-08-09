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

#pragma once
#include <perspective/first.h>
#include <perspective/base.h>
#include <perspective/exports.h>
#include <perspective/flatten_mode.h>
#include <perspective/last.h>
#include <arrow/api.h>
#include <memory>
#include <string>

namespace perspective {
namespace apachearrow {

    using perspective::t_list_flatten;
    using perspective::LIST_FLATTEN_CARTESIAN;
    using perspective::LIST_FLATTEN_STRINGIFY;
    using perspective::LIST_FLATTEN_ZIP;
    extern const char* const FLATTEN_SEPARATOR;

    /**
     * @brief A table rewritten into Perspective's flat column model, plus the
     * row expansion left deferred as a gather plan.
     */
    struct t_normalized_table {
        std::vector<std::shared_ptr<arrow::Field>> fields;
        std::vector<std::shared_ptr<arrow::ChunkedArray>> columns;

        /**
         * Per column, output row -> index into that column, or -1 for a null
         * slot. An empty entry means the column is already row-aligned and is
         * copied with no indirection.
         */
        std::vector<std::vector<std::int64_t>> gathers;

        /**
         * Per column, whether it takes a distinct element per output row
         * rather than repeating one input value across an expansion group.
         */
        std::vector<bool> per_element;
        std::int64_t num_rows;
    };

    PERSPECTIVE_EXPORT t_normalized_table normalize_table(
        std::shared_ptr<arrow::Table> input, t_list_flatten mode
    );

    PERSPECTIVE_EXPORT bool
    normalize_table_is_noop(const arrow::Table& input, t_list_flatten mode);

    PERSPECTIVE_EXPORT bool
    normalize_table_expands(const arrow::Table& input, t_list_flatten mode);

} // namespace apachearrow
} // namespace perspective
