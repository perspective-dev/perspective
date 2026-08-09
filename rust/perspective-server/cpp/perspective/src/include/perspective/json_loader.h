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
#include <perspective/raw_types.h>
#include <perspective/column.h>
#include <perspective/last.h>
#include <rapidjson/document.h>
#include <perspective/schema.h>
#include <perspective/data_table.h>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <vector>

namespace perspective {
namespace json {
    t_dtype rapidjson_type_to_dtype(const rapidjson::Value& value);
    std::optional<t_dtype> fill_column_json(
        const std::shared_ptr<t_column>& col,
        t_uindex i,
        const rapidjson::Value& value,
        bool is_update
    );

    /**
     * @brief The wire shape of a JSON payload.
     */
    enum t_json_format {
        /** `[{"a": 1}, {"a": 2}]` */
        JSON_FORMAT_ROWS,

        /** `{"a": [1, 2]}` */
        JSON_FORMAT_COLUMNS,

        /** `{"a": 1}\n{"a": 2}` — parsed one record at a time. */
        JSON_FORMAT_NDJSON,
    };

    class PERSPECTIVE_EXPORT JsonLoader {
    public:
        JsonLoader();
        ~JsonLoader();

        void init(
            std::string_view data,
            t_json_format format,
            const std::string& index,
            const t_schema* existing,
            t_list_flatten mode
        );

        const std::vector<std::string>& names() const;
        const std::vector<t_dtype>& types() const;

        bool is_implicit() const;

        bool empty() const;

        std::optional<std::string> repeated_index(const std::string& index
        ) const;

        void release();

        std::uint32_t fill_table(
            t_data_table& tbl,
            const std::string& index,
            std::uint32_t offset,
            bool is_update
        );

    private:
        std::shared_ptr<t_column> resolve_column(
            t_data_table& tbl,
            std::string_view name,
            const rapidjson::Value& leaf,
            bool is_update
        );

        void infer_rows(const std::string& index);
        void infer_cols(const std::string& index);
        void infer_ndjson(const std::string& index);

        std::uint32_t
        fill_rows(t_data_table&, const std::string&, std::uint32_t, bool);
        std::uint32_t
        fill_cols(t_data_table&, const std::string&, std::uint32_t, bool);
        std::uint32_t
        fill_ndjson(t_data_table&, const std::string&, std::uint32_t, bool);

        rapidjson::Document m_document;
        rapidjson::StringStream m_stream{nullptr};
        t_json_format m_format{JSON_FORMAT_ROWS};
        std::vector<std::string> m_names;
        std::vector<t_dtype> m_types;
        t_list_flatten m_mode{LIST_FLATTEN_ZIP};

        std::set<std::string> m_per_element;
        std::vector<t_uindex> m_child_widths;
        bool m_expands{false};
        bool m_is_implicit{true};
        bool m_empty{false};
    };

} // namespace json
} // namespace perspective
