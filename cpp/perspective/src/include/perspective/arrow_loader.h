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
#include <date/date.h>
#include <arrow/api.h>
#include <arrow/util/decimal.h>
#include <arrow/io/memory.h>
#include <arrow/ipc/reader.h>
#include <perspective/arrow_csv.h>

namespace perspective {
namespace apachearrow {

    class PERSPECTIVE_EXPORT ArrowLoader {
    public:
        ArrowLoader();
        ~ArrowLoader();

        /**
         * @brief Initialize the arrow loader with a pointer to a binary.
         *
         * @param ptr
         */
        void initialize(const std::uint8_t* ptr, std::uint32_t);

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
         * @param limit
         * @param is_update
         */
        void fill_table(
            t_data_table& tbl,
            const t_schema& input_schema,
            const std::string& index,
            std::uint32_t offset,
            std::uint32_t limit,
            bool is_update
        );

        std::vector<std::string> names() const;
        std::vector<t_dtype> types() const;
        std::uint32_t row_count() const;

    private:
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
        std::vector<std::string> m_names;
        std::vector<t_dtype> m_types;
    };

    template <typename T, typename V>
    void iter_col_copy(
        const std::shared_ptr<t_column>& dest,
        std::shared_ptr<arrow::Array> src,
        const int64_t offset,
        const int64_t len
    );

    void copy_array(
        const std::shared_ptr<t_column>& dest,
        const std::shared_ptr<arrow::Array>& src,
        const int64_t offset,
        const int64_t len
    );

} // namespace apachearrow
} // namespace perspective