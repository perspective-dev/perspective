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
#include <perspective/date.h>
#include <perspective/exports.h>
#include <perspective/data_table.h>
#include <perspective/last.h>
#include <chrono>
#include <optional>
#include <date/date.h>
#include <arrow/api.h>
#include <arrow/util/decimal.h>
#include <arrow/io/memory.h>
#include <arrow/ipc/reader.h>
#include <perspective/arrow_csv.h>
#include <perspective/arrow_normalize.h>

namespace perspective {
namespace apachearrow {

    class PERSPECTIVE_EXPORT ArrowLoader {
    public:
        ArrowLoader();
        ~ArrowLoader();
        ArrowLoader(ArrowLoader&& other) noexcept;

        /**
         * @brief Initialize the arrow loader with a pointer to a binary.
         *
         * Nested `STRUCT` and `LIST` columns are normalized into Perspective's
         * flat column model here, so `names`, `types` and `row_count` all
         * describe the post-flattening shape.
         *
         * @param ptr
         * @param mode - how `LIST` columns are ingested.
         */
        void initialize(
            const std::uint8_t* ptr,
            std::uint32_t,
            t_list_flatten mode = LIST_FLATTEN_ZIP
        );

        /**
         * @brief The name of an index column whose value repeats across the
         * rows of an expansion, or `nullopt` if indexing is safe.
         *
         * A column derived from an exploded list takes a different element per
         * output row, so it is a legitimate key; a sibling of that list carries
         * the identical value on every row of the group and would silently
         * collide.
         *
         * @param index - the explicit index column, or empty for none.
         */
        std::optional<std::string> repeated_index(const std::string& index
        ) const;

        /**
         * @brief Initialize the arrow loader with a CSV.
         *
         * @param ptr
         */
        void init_csv(
            const std::string_view& csv,
            bool is_update,
            std::unordered_map<std::string, std::shared_ptr<arrow::DataType>>&
                schema
        );

        /**
         * @brief Given an arrow binary and a data table, load the arrow into
         * Perspective. If updating an existing table, use the `input_schema`
         * of the table and respect it as much as possible.
         *
         * @param tbl
         * @param input_schema
         * @param index
         * @param offset
         * @param is_update
         */
        void fill_table(
            t_data_table& tbl,
            const t_schema& input_schema,
            const std::string& index,
            std::uint32_t offset,
            bool is_update
        );

        std::vector<std::string> names() const;
        std::vector<t_dtype> types() const;
        std::uint32_t row_count() const;

    private:
        /**
         * @brief The post-normalization fields, which for a nested input differ
         * from `m_table`'s.
         */
        const std::vector<std::shared_ptr<arrow::Field>>& fields() const;

        void fill_column(
            t_data_table& tbl,
            const std::shared_ptr<t_column>& col,
            const std::string& name,
            std::int32_t cidx,
            t_dtype type,
            std::string& raw_type,
            bool is_update
        );

        std::shared_ptr<arrow::Table> m_table;

        /**
         * @brief Set only when the input had a struct or list column.
         *
         * INVARIANT: while this is null, `m_table` is the exact object parsed
         * out of the IPC bytes and every read path below behaves as it did
         * before flattening existed.
         */
        std::unique_ptr<t_normalized_table> m_normalized;
        std::vector<std::string> m_names;
        std::vector<t_dtype> m_types;
        bool m_expanded{false};
    };

    template <typename T, typename V, typename GATHER>
    void iter_col_copy(
        const std::shared_ptr<t_column>& dest,
        std::shared_ptr<arrow::Array> src,
        const int64_t offset,
        const int64_t len,
        const GATHER& gather
    );

    void copy_array(
        const std::shared_ptr<t_column>& dest,
        const std::shared_ptr<arrow::Array>& src,
        const int64_t offset,
        const int64_t len
    );

} // namespace apachearrow
} // namespace perspective