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

#include <perspective/first.h>
#include <perspective/view.h>
#include <perspective/arrow_writer.h>
#include <sstream>
#include <utility>
#include <rapidjson/writer.h>
#include <rapidjson/stringbuffer.h>
#include <arrow/csv/writer.h>
#include <perspective/pyutils.h>

namespace perspective {

std::string
join_column_names(
    const std::vector<t_tscalar>& names, const std::string& separator
) {
    if (names.empty()) {
        return "";
    }
    if (names.size() == 1) {
        return names.at(0).to_string();
    }
    std::ostringstream ss;
    for (auto i = 0; i < names.size() - 1; ++i) {
        std::string str = names.at(i).to_string();
        ss << str;
        ss << separator;
    }
    ss << names.at(names.size() - 1).to_string();
    return ss.str();
}

template <typename CTX_T>
View<CTX_T>::View(
    std::shared_ptr<Table> table,
    std::shared_ptr<CTX_T> ctx,
    std::string name,
    std::string separator,
    std::shared_ptr<t_view_config> view_config
) :
    m_table(std::move(std::move(table))),
    m_ctx(ctx),
    m_name(std::move(name)),
    m_separator(std::move(separator)),
    m_view_config(std::move(std::move(view_config))) {
    m_row_pivots = m_view_config->get_row_pivots();
    m_column_pivots = m_view_config->get_column_pivots();
    m_aggregates = m_view_config->get_aggspecs();
    m_columns = m_view_config->get_columns();
    m_filter = m_view_config->get_fterm();
    m_sort = m_view_config->get_sortspec();
    m_expressions = m_view_config->get_expressions();

    // Add hidden columns used in sorts to the `m_hidden_sort` vector.
    if (!m_sort.empty()) {
        _find_hidden_sort(m_sort);
    }

    if (!m_column_pivots.empty()) {
        auto column_sort = m_view_config->get_col_sortspec();
        _find_hidden_sort(column_sort);
    }

    // configure data window for `get_data` and `row_delta`
    is_column_only() ? m_row_offset = 1 : m_row_offset = 0;

    // TODO: make sure is 0 for column only - right now get_data returns row
    // path for everything
    sides() > 0 ? m_col_offset = 1 : m_col_offset = 0;

    // TODO: add index shifting ability
}

template <typename CTX_T>
View<CTX_T>::~View() {
    auto pool = m_table->get_pool();
    auto gnode = m_table->get_gnode();
    PSP_GIL_UNLOCK();
    PSP_WRITE_LOCK(pool->get_lock());
    // TODO: need to invalidate memory used by previous computed columns
    // without affecting views that depend on those computed columns.
    pool->unregister_context(gnode->get_id(), m_name);
}

template <typename CTX_T>
std::shared_ptr<t_view_config>
View<CTX_T>::get_view_config() const {
    return m_view_config;
}

template <>
std::int32_t
View<t_ctxunit>::sides() const {
    return 0;
}

template <>
std::int32_t
View<t_ctx0>::sides() const {
    return 0;
}

template <>
std::int32_t
View<t_ctx1>::sides() const {
    return 1;
}

template <>
std::int32_t
View<t_ctx2>::sides() const {
    return 2;
}

template <typename CTX_T>
std::int32_t
View<CTX_T>::num_rows() const {
    if (is_column_only()) {
        return m_ctx->get_row_count() - 1;
    }
    return m_ctx->get_row_count();
}

template <typename CTX_T>
std::int32_t
View<CTX_T>::num_columns() const {
    return m_ctx->unity_get_column_count();
}

/**
 * @brief Return correct number of columns when headers need to be skipped.
 *
 * @tparam
 * @return std::int32_t
 */
template <>
std::int32_t
View<t_ctx2>::num_columns() const {
    if (!m_sort.empty()) {
        auto depth = m_column_pivots.size();
        auto col_length = m_ctx->unity_get_column_count();
        auto count = 0;
        for (t_uindex i = 0; i < col_length; ++i) {
            if (m_ctx->unity_get_column_path(i + 1).size() == depth) {
                count++;
            }
        }
        return count;
    }
    return m_ctx->unity_get_column_count();
}

// Metadata construction
template <typename CTX_T>
std::vector<std::vector<t_tscalar>>
View<CTX_T>::column_names(bool skip, std::int32_t depth) const {
    std::vector<std::vector<t_tscalar>> names;
    const std::vector<t_aggspec> aggs = m_ctx->get_aggregates();
    std::vector<std::string> aggregate_names(aggs.size());

    for (auto i = 0; i < aggs.size(); ++i) {
        aggregate_names[i] = aggs[i].name();
    }

    for (t_uindex key = 0, max = m_ctx->unity_get_column_count(); key != max;
         ++key) {
        const std::string& name = aggregate_names[key % aggregate_names.size()];

        if (name == "psp_okey") {
            continue;
        }

        std::vector<t_tscalar> col_path = m_ctx->unity_get_column_path(key + 1);
        if (skip && col_path.size() < static_cast<unsigned int>(depth)) {
            continue;
        }

        std::vector<t_tscalar> new_path;
        for (auto path = col_path.rbegin(); path != col_path.rend(); ++path) {
            new_path.push_back(*path);
        }
        new_path.push_back(
            m_ctx->get_aggregate_name(key % aggregate_names.size())
        );
        names.push_back(new_path);
    }

    return names;
}

template <>
std::vector<std::vector<t_tscalar>>
View<t_ctx0>::column_names(bool skip, std::int32_t depth) const {
    std::vector<std::vector<t_tscalar>> names;

    for (t_uindex key = 0, max = m_ctx->unity_get_column_count(); key != max;
         ++key) {
        t_tscalar name = m_ctx->get_column_name(key);
        if (strcmp(name.get<const char*>(), "psp_okey") == 0) {
            continue;
        };
        std::vector<t_tscalar> col_path;
        col_path.push_back(name);
        names.push_back(col_path);
    }

    return names;
}

template <>
std::vector<std::vector<t_tscalar>>
View<t_ctxunit>::column_names(bool skip, std::int32_t depth) const {
    std::vector<std::vector<t_tscalar>> names;

    for (t_uindex key = 0, max = m_ctx->unity_get_column_count(); key != max;
         ++key) {
        t_tscalar name = m_ctx->get_column_name(key);
        if (strcmp(name.get<const char*>(), "psp_okey") == 0) {
            continue;
        };
        std::vector<t_tscalar> col_path;
        col_path.push_back(name);
        names.push_back(col_path);
    }

    return names;
}

template <typename CTX_T>
std::vector<std::vector<t_tscalar>>
View<CTX_T>::column_paths() const {
    auto num_column_pivots = m_column_pivots.size();
    auto names = column_names(true, num_column_pivots);

    if (sides() > 0 && !is_column_only()) {
        // prepend `__ROW_PATH__` to the output vector
        t_tscalar row_path;
        row_path.set("__ROW_PATH__");
        names.insert(names.begin(), std::vector<t_tscalar>{row_path});
    }

    if (!m_hidden_sort.empty()) {
        // make a new vector so we don't have to erase while iterating
        std::vector<std::vector<t_tscalar>> visible_column_paths;

        for (const auto& column : names) {
            // Remove undisplayed column names used to sort
            std::string name = column.back().to_string();
            if (std::find(m_hidden_sort.begin(), m_hidden_sort.end(), name)
                == m_hidden_sort.end()) {
                visible_column_paths.push_back(column);
            }
        }

        return visible_column_paths;
    }

    return names;
}

template <typename CTX_T>
std::vector<std::vector<std::string>>
View<CTX_T>::column_paths_string() const {
    auto paths = column_paths();
    std::vector<std::vector<std::string>> out;
    out.reserve(paths.size());
    for (const auto& path : paths) {
        std::vector<std::string> row;
        row.reserve(path.size());
        for (const auto& c : path) {
            row.push_back(c.to_string());
        }

        out.push_back(row);
    }

    return out;
}

template <typename CTX_T>
std::map<std::string, std::string>
View<CTX_T>::schema() const {
    // TODO: should revert to m_table
    auto schema = m_ctx->get_schema();
    auto _types = schema.types();
    auto names = schema.columns();

    std::map<std::string, t_dtype> types;
    std::map<std::string, std::string> new_schema;

    for (std::size_t i = 0, max = names.size(); i != max; ++i) {
        types[names[i]] = _types[i];
    }

    auto col_names = column_names(false);
    for (const std::vector<t_tscalar>& name : col_names) {
        // Pull out the main aggregate column
        std::string agg_name = name.back().to_string();
        std::string type_string = dtype_to_str(types[agg_name]);
        new_schema[agg_name] = type_string;

        if (!m_row_pivots.empty() && !is_column_only()) {
            new_schema[agg_name] =
                _map_aggregate_types(agg_name, new_schema[agg_name]);
        }
    }

    return new_schema;
}

template <>
std::map<std::string, std::string>
View<t_ctxunit>::schema() const {
    t_schema schema = m_ctx->get_schema();
    std::vector<t_dtype> _types = schema.types();
    std::vector<std::string> names = schema.columns();

    std::map<std::string, t_dtype> types;
    for (std::size_t i = 0, max = names.size(); i != max; ++i) {
        types[names[i]] = _types[i];
    }

    std::vector<std::vector<t_tscalar>> cols = column_names(false);
    std::map<std::string, std::string> new_schema;

    for (auto& col : cols) {
        std::string name = col.back().to_string();
        if (name == "psp_okey") {
            continue;
        }
        new_schema[name] = dtype_to_str(types[name]);
    }

    return new_schema;
}

template <>
std::map<std::string, std::string>
View<t_ctx0>::schema() const {
    const t_schema& schema = m_ctx->get_schema();
    const std::vector<t_dtype>& _types = schema.types();
    const std::vector<std::string>& names = schema.columns();

    std::map<std::string, t_dtype> types;
    for (std::size_t i = 0, max = names.size(); i != max; ++i) {
        types[names[i]] = _types[i];
    }

    std::vector<std::vector<t_tscalar>> cols = column_names(false);
    std::map<std::string, std::string> new_schema;

    for (auto& col : cols) {
        std::string name = col.back().to_string();
        if (name == "psp_okey") {
            continue;
        }
        new_schema[name] = dtype_to_str(types[name]);
    }

    return new_schema;
}

template <typename CTX_T>
std::map<std::string, std::string>
View<CTX_T>::expression_schema() const {
    auto schema = m_ctx->get_schema();
    auto _types = schema.types();
    auto names = schema.columns();

    std::map<std::string, t_dtype> types;
    std::map<std::string, std::string> new_schema;

    for (std::size_t i = 0, max = names.size(); i != max; ++i) {
        types[names[i]] = _types[i];
    }

    for (const auto& expr : m_expressions) {
        const std::string& expression_alias = expr->get_expression_alias();
        new_schema[expression_alias] = dtype_to_str(expr->get_dtype());

        if (!m_row_pivots.empty() && !is_column_only()) {
            new_schema[expression_alias] = _map_aggregate_types(
                expression_alias, new_schema[expression_alias]
            );
        }
    }

    return new_schema;
}

template <>
std::map<std::string, std::string>
View<t_ctxunit>::expression_schema() const {
    return {};
}

template <>
std::map<std::string, std::string>
View<t_ctx0>::expression_schema() const {
    const t_schema& schema = m_ctx->get_schema();
    const std::vector<t_dtype>& _types = schema.types();
    const std::vector<std::string>& names = schema.columns();

    std::map<std::string, t_dtype> types;
    for (std::size_t i = 0, max = names.size(); i != max; ++i) {
        types[names[i]] = _types[i];
    }

    std::map<std::string, std::string> new_schema;

    for (const auto& expr : m_expressions) {
        const std::string& expression_alias = expr->get_expression_alias();
        new_schema[expression_alias] = dtype_to_str(expr->get_dtype());
    }

    return new_schema;
}

template <typename T>
std::pair<t_tscalar, t_tscalar>
View<T>::get_min_max(const std::string& colname) const {
    return m_ctx->get_min_max(colname);
}

template <>
std::shared_ptr<t_data_slice<t_ctxunit>>
View<t_ctxunit>::get_data(
    t_uindex start_row, t_uindex end_row, t_uindex start_col, t_uindex end_col
) const {
    std::vector<t_tscalar> slice =
        m_ctx->get_data(start_row, end_row, start_col, end_col);
    auto col_names = column_names();
    auto data_slice_ptr = std::make_shared<t_data_slice<t_ctxunit>>(
        m_ctx,
        start_row,
        end_row,
        start_col,
        end_col,
        m_row_offset,
        m_col_offset,
        slice,
        col_names
    );
    return data_slice_ptr;
}

template <>
std::shared_ptr<t_data_slice<t_ctx0>>
View<t_ctx0>::get_data(
    t_uindex start_row, t_uindex end_row, t_uindex start_col, t_uindex end_col
) const {
    std::vector<t_tscalar> slice =
        m_ctx->get_data(start_row, end_row, start_col, end_col);
    auto col_names = column_names();
    auto data_slice_ptr = std::make_shared<t_data_slice<t_ctx0>>(
        m_ctx,
        start_row,
        end_row,
        start_col,
        end_col,
        m_row_offset,
        m_col_offset,
        slice,
        col_names
    );
    return data_slice_ptr;
}

template <>
std::shared_ptr<t_data_slice<t_ctx1>>
View<t_ctx1>::get_data(
    t_uindex start_row, t_uindex end_row, t_uindex start_col, t_uindex end_col
) const {
    std::vector<t_tscalar> slice =
        m_ctx->get_data(start_row, end_row, start_col, end_col);
    auto col_names = column_names();
    t_tscalar row_path;
    row_path.set("__ROW_PATH__");
    col_names.insert(col_names.begin(), std::vector<t_tscalar>{row_path});
    auto data_slice_ptr = std::make_shared<t_data_slice<t_ctx1>>(
        m_ctx,
        start_row,
        end_row,
        start_col,
        end_col,
        m_row_offset,
        m_col_offset,
        slice,
        col_names
    );
    return data_slice_ptr;
}

template <>
std::shared_ptr<t_data_slice<t_ctx2>>
View<t_ctx2>::get_data(
    t_uindex start_row, t_uindex end_row, t_uindex start_col, t_uindex end_col
) const {
    std::vector<t_tscalar> slice;
    std::vector<t_uindex> column_indices;
    std::vector<std::vector<t_tscalar>> cols;
    bool is_sorted = !m_sort.empty();

    if (is_column_only()) {
        start_row += m_row_offset;
        end_row += m_row_offset;
    }

    if (is_sorted) {
        /**
         * Perspective generates headers for sorted columns, so we have to
         * skip them in the underlying slice.
         */
        t_uindex start_col_index = start_col;
        t_uindex end_col_index = end_col;

        // Only construct column_indices if start_col > end_col as get_data will
        // handle the incorrect data window properly, which is consistent
        // with the implementation for when the context is not sorted.
        if (start_col < end_col) {
            auto depth = m_column_pivots.size();
            auto col_length = m_ctx->unity_get_column_count();
            column_indices.push_back(0);
            for (t_uindex i = 0; i < col_length; ++i) {
                if (m_ctx->unity_get_column_path(i + 1).size() == depth) {
                    column_indices.push_back(i + 1);
                }
            }

            cols = column_names(true, depth);

            // Filter down column indices by user-provided start/end columns
            column_indices = std::vector<t_uindex>(
                column_indices.begin() + start_col,
                column_indices.begin()
                    + std::min(end_col, (t_uindex)column_indices.size())
            );

            // If start_col == end_col, then column_indices will be an empty
            // vector. Only try to access the first and last elements if the
            // vector is not empty. `get_data` correctly handles cases where
            // start == end and start < end.
            if (!column_indices.empty()) {
                start_col_index = column_indices.front();
                end_col_index = column_indices.back() + 1;
            }
        }

        std::vector<t_tscalar> slice_with_headers =
            m_ctx->get_data(start_row, end_row, start_col_index, end_col_index);

        auto iter = slice_with_headers.begin();
        while (iter != slice_with_headers.end()) {
            t_uindex prev = column_indices.front();
            for (unsigned long long col_num : column_indices) {
                iter += col_num - prev;
                prev = col_num;
                slice.push_back(*iter);
            }
            if (iter != slice_with_headers.end()) {
                iter++;
            }
        }
    } else {
        cols = column_names();
        slice = m_ctx->get_data(start_row, end_row, start_col, end_col);
    }
    // TODO: we need to just use column_paths everywhere instead of row path
    // insertion manually, this causes issues with needing to skip row paths
    t_tscalar row_path;
    row_path.set("__ROW_PATH__");
    cols.insert(cols.begin(), std::vector<t_tscalar>{row_path});
    auto data_slice_ptr = std::make_shared<t_data_slice<t_ctx2>>(
        m_ctx,
        start_row,
        end_row,
        start_col,
        end_col,
        m_row_offset,
        m_col_offset,
        slice,
        cols,
        column_indices
    );
    return data_slice_ptr;
}

template <typename CTX_T>
std::shared_ptr<std::string>
View<CTX_T>::to_arrow(
    std::int32_t start_row,
    std::int32_t end_row,
    std::int32_t start_col,
    std::int32_t end_col,
    bool emit_group_by,
    bool compress
) const {
    std::shared_ptr<t_data_slice<CTX_T>> data_slice =
        get_data(start_row, end_row, start_col, end_col);
    return data_slice_to_arrow(data_slice, emit_group_by, compress);
};

template <>
std::shared_ptr<std::string>
View<t_ctx2>::to_csv(
    std::int32_t start_row,
    std::int32_t end_row,
    std::int32_t start_col,
    std::int32_t end_col
) const {

    // See generic instance.
    if (is_column_only() && m_ctx->unity_get_column_count() == 0) {
        return std::make_shared<std::string>("");
    }

    std::shared_ptr<t_data_slice<t_ctx2>> data_slice =
        get_data(start_row, end_row, start_col, end_col);
    return data_slice_to_csv(data_slice);
};

template <>
std::shared_ptr<std::string>
View<t_ctx1>::to_csv(
    std::int32_t start_row,
    std::int32_t end_row,
    std::int32_t start_col,
    std::int32_t end_col
) const {
    std::shared_ptr<t_data_slice<t_ctx1>> data_slice =
        get_data(start_row, end_row, start_col, end_col);
    return data_slice_to_csv(data_slice);
};

template <typename CTX_T>
std::shared_ptr<std::string>
View<CTX_T>::to_csv(
    std::int32_t start_row,
    std::int32_t end_row,
    std::int32_t start_col,
    std::int32_t end_col
) const {

    // Arrow has a big whih miscalculates CSV header size as 1 when there are no
    // columns (and hence no rows) in the dataset, so intercept these calls/
    if (m_ctx->unity_get_column_count() == 0) {
        return std::make_shared<std::string>("");
    }

    std::shared_ptr<t_data_slice<CTX_T>> data_slice =
        get_data(start_row, end_row, start_col, end_col);
    return data_slice_to_csv(data_slice);
};

template <typename CTX_T>
std::pair<std::shared_ptr<arrow::Schema>, std::shared_ptr<arrow::RecordBatch>>
View<CTX_T>::data_slice_to_batches(
    bool emit_group_by, std::shared_ptr<t_data_slice<CTX_T>> data_slice
) const {
    // From the data slice, get all the metadata we need
    t_get_data_extents extents = data_slice->get_data_extents();
    std::int32_t start_col = extents.m_scol;
    std::int32_t end_col = extents.m_ecol;

    const std::vector<t_tscalar>& slice = data_slice->get_slice();
    const std::vector<std::vector<t_tscalar>>& names =
        data_slice->get_column_names();
    auto stride = data_slice->get_stride();
    auto num_sides = sides();

    std::vector<std::shared_ptr<arrow::Array>> vectors;
    std::vector<std::shared_ptr<arrow::Field>> fields;
    std::int32_t num_columns = end_col - start_col;
    std::vector<std::string> row_pivots = m_view_config->get_row_pivots();
    t_uindex num_row_paths = emit_group_by ? row_pivots.size() : 0;
    if (num_columns + num_row_paths > 0) {
        fields.resize(num_columns + num_row_paths);
        vectors.resize(num_columns + num_row_paths);
    }

    auto num_output_row_paths = is_column_only() ? 0 : num_row_paths;

    t_uindex write_idx = 0;
    if (emit_group_by && num_output_row_paths > 0) {
        auto schema = m_table->get_schema();
        for (auto rpidx = 0; rpidx < num_row_paths; ++rpidx) {
            std::string column_name = row_pivots.at(rpidx);
            std::string row_path_name = column_name;
            row_path_name += " (Group by ";
            row_path_name += std::to_string(rpidx + 1);
            row_path_name += ")";

            // Get the "table" type for this column, as row_pivots are not in
            // the view schema.
            t_dtype dtype;
            if (schema.has_column(column_name)) {
                dtype = schema.get_dtype(column_name);
            } else {
                for (const auto& expr : m_expressions) {
                    std::string expression_alias = expr->get_expression_alias();
                    if (expr->get_expression_alias() == column_name) {
                        dtype = expr->get_dtype();
                        break;
                    }
                }
            }

            std::shared_ptr<arrow::Array> arr;
            switch (dtype) {
                case DTYPE_INT8: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::int8());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::Int8Type,
                        std::int8_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_UINT8: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::uint8());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::UInt8Type,
                        std::uint8_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_INT16: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::int16());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::Int16Type,
                        std::int16_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_UINT16: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::uint16());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::UInt16Type,
                        std::uint16_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_INT32: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::int32());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::Int32Type,
                        std::int32_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_UINT32: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::uint32());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::UInt32Type,
                        std::uint32_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_INT64: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::int64());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::Int64Type,
                        std::int64_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_UINT64: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::uint64());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::UInt64Type,
                        std::uint64_t>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_FLOAT32: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::float32());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::FloatType,
                        float>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_FLOAT64: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::float64());
                    vectors[write_idx] = apachearrow::numeric_col_to_array<
                        arrow::DoubleType,
                        double>(extents, [&, rpidx](t_uindex ridx) {
                        auto depth = m_ctx->unity_get_row_depth(ridx);
                        if (rpidx < depth) {
                            return m_ctx->unity_get_row_path(ridx).at(
                                (depth - 1) - rpidx
                            );
                        }
                        return mknone();
                    });
                } break;
                case DTYPE_DATE: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::date32());
                    vectors[write_idx] = apachearrow::date_col_to_array(
                        extents,
                        [&, rpidx](t_uindex ridx) {
                            auto depth = m_ctx->unity_get_row_depth(ridx);
                            if (rpidx < depth) {
                                return m_ctx->unity_get_row_path(ridx).at(
                                    (depth - 1) - rpidx
                                );
                            }
                            return mknone();
                        }
                    );
                } break;
                case DTYPE_TIME: {
                    fields[write_idx] = arrow::field(
                        row_path_name, arrow::timestamp(arrow::TimeUnit::MILLI)
                    );
                    vectors[write_idx] = apachearrow::timestamp_col_to_array(
                        extents,
                        [&, rpidx](t_uindex ridx) {
                            auto depth = m_ctx->unity_get_row_depth(ridx);
                            if (rpidx < depth) {
                                return m_ctx->unity_get_row_path(ridx).at(
                                    (depth - 1) - rpidx
                                );
                            }
                            return mknone();
                        }
                    );
                } break;
                case DTYPE_BOOL: {
                    fields[write_idx] =
                        arrow::field(row_path_name, arrow::boolean());
                    vectors[write_idx] = apachearrow::boolean_col_to_array(
                        extents,
                        [&, rpidx](t_uindex ridx) {
                            auto depth = m_ctx->unity_get_row_depth(ridx);
                            if (rpidx < depth) {
                                return m_ctx->unity_get_row_path(ridx).at(
                                    (depth - 1) - rpidx
                                );
                            }
                            return mknone();
                        }
                    );
                } break;
                case DTYPE_STR: {
                    fields[write_idx] = arrow::field(
                        row_path_name,
                        arrow::dictionary(arrow::int32(), arrow::utf8())
                    );
                    vectors[write_idx] =
                        apachearrow::string_col_to_dictionary_array(
                            extents,
                            [&, rpidx](t_uindex ridx) {
                                auto depth = m_ctx->unity_get_row_depth(ridx);
                                if (rpidx < depth) {
                                    return m_ctx->unity_get_row_path(ridx).at(
                                        (depth - 1) - rpidx
                                    );
                                }
                                return mknone();
                            }
                        );
                } break;
                case DTYPE_OBJECT:
                default: {
                    std::stringstream ss;
                    ss << "Cannot serialize column `" << row_path_name
                       << "` of type `" << get_dtype_descr(dtype)
                       << "` to Arrow format." << std::endl;
                    PSP_COMPLAIN_AND_ABORT(ss.str());
                }
            }

            write_idx++;
        }
    }

    // calculate the number of columns (including __ROW_PATH__) minus
    // the number of hidden sorts, so we can skip hidden sorts.
    // t_uindex num_view_columns = num_columns - m_hidden_sort.size();
    t_uindex num_view_columns = m_columns.size();
    std::vector<t_uindex> indices;
    for (auto tidx = 0; tidx < end_col - start_col; ++tidx) {
        auto cidx = tidx + start_col;
        if (cidx == start_col && num_sides > 0) {
            continue;
        }

        // Do not output hidden sort columns - they are always at the end
        // of the columns list.
        if ((num_view_columns + m_hidden_sort.size()) > 0
            && ((cidx - (num_sides > 0 ? 1 : 0))
                % (num_view_columns + m_hidden_sort.size()))
                >= num_view_columns) {
            continue;
        }

        indices.push_back(tidx);
    }

    // TODO For some reason, this parallel call doesn't benefit from
    // parallelism.
    parallel_for(int(indices.size()), [&](auto iidx) {
        // for (auto iidx = 0; iidx < indices.size(); iidx++) {
        auto ccidx = iidx + num_output_row_paths;
        auto cidx = indices[iidx] + start_col;

        std::vector<t_tscalar> col_path = names.at(cidx);
        t_dtype dtype = get_column_dtype(cidx);

        // mean and weighted mean uses DTYPE_F64PAIR on the aggtable, which
        // is the dtype returned by get_column_dtype. However, in the output
        // data slice they are DTYPE_FLOAT64 and the f64 pair is not exposed
        // outside of the sparse tree. Thus, treat f64 pair as DTYPE_FLOAT64
        // for arrow serialization.
        if (dtype == DTYPE_F64PAIR) {
            dtype = DTYPE_FLOAT64;
        }

        std::string name;

        if (num_sides > 1) {
            name = join_column_names(col_path, m_separator);
        } else {
            name = col_path.at(col_path.size() - 1).to_string();
        }

        std::shared_ptr<arrow::Array> arr;
        switch (dtype) {
            case DTYPE_INT8: {
                fields[ccidx] = arrow::field(name, arrow::int8());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::Int8Type,
                    std::int8_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_UINT8: {
                fields[ccidx] = arrow::field(name, arrow::uint8());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::UInt8Type,
                    std::uint8_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_INT16: {
                fields[ccidx] = arrow::field(name, arrow::int16());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::Int16Type,
                    std::int16_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_UINT16: {
                fields[ccidx] = arrow::field(name, arrow::uint16());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::UInt16Type,
                    std::uint16_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_INT32: {
                fields[ccidx] = arrow::field(name, arrow::int32());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::Int32Type,
                    std::int32_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_UINT32: {
                fields[ccidx] = arrow::field(name, arrow::uint32());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::UInt32Type,
                    std::uint32_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_INT64: {
                fields[ccidx] = arrow::field(name, arrow::int64());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::Int64Type,
                    std::int64_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_UINT64: {
                fields[ccidx] = arrow::field(name, arrow::uint64());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::UInt64Type,
                    std::uint64_t>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_FLOAT32: {
                fields[ccidx] = arrow::field(name, arrow::float32());
                vectors[ccidx] =
                    apachearrow::numeric_col_to_array<arrow::FloatType, float>(
                        extents,
                        [&](t_uindex ridx) {
                            return slice
                                [(ridx - extents.m_srow) * stride
                                 + (cidx - extents.m_scol)];
                        }
                    );
            } break;
            case DTYPE_FLOAT64: {
                fields[ccidx] = arrow::field(name, arrow::float64());
                vectors[ccidx] = apachearrow::numeric_col_to_array<
                    arrow::DoubleType,
                    double>(extents, [&](t_uindex ridx) {
                    return slice
                        [(ridx - extents.m_srow) * stride
                         + (cidx - extents.m_scol)];
                });
            } break;
            case DTYPE_DATE: {
                fields[ccidx] = arrow::field(name, arrow::date32());
                vectors[ccidx] =
                    apachearrow::date_col_to_array(extents, [&](t_uindex ridx) {
                        return slice
                            [(ridx - extents.m_srow) * stride
                             + (cidx - extents.m_scol)];
                    });
            } break;
            case DTYPE_TIME: {
                fields[ccidx] = arrow::field(
                    name, arrow::timestamp(arrow::TimeUnit::MILLI)
                );
                vectors[ccidx] = apachearrow::timestamp_col_to_array(
                    extents,
                    [&](t_uindex ridx) {
                        return slice
                            [(ridx - extents.m_srow) * stride
                             + (cidx - extents.m_scol)];
                    }
                );
            } break;
            case DTYPE_BOOL: {
                fields[ccidx] = arrow::field(name, arrow::boolean());
                vectors[ccidx] = apachearrow::boolean_col_to_array(
                    extents,
                    [&](t_uindex ridx) {
                        return slice
                            [(ridx - extents.m_srow) * stride
                             + (cidx - extents.m_scol)];
                    }
                );
            } break;
            case DTYPE_STR: {
                fields[ccidx] = arrow::field(
                    name, arrow::dictionary(arrow::int32(), arrow::utf8())
                );
                vectors[ccidx] = apachearrow::string_col_to_dictionary_array(
                    extents,
                    [&](t_uindex ridx) {
                        return slice
                            [(ridx - extents.m_srow) * stride
                             + (cidx - extents.m_scol)];
                    }
                );
            } break;
            case DTYPE_OBJECT:
            default: {
                std::stringstream ss;
                ss << "Cannot serialize column `" << name << "` of type `"
                   << get_dtype_descr(dtype) << "` to Arrow format."
                   << std::endl;
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
        }
    });
    // }

    fields.resize(indices.size() + num_output_row_paths);
    vectors.resize(indices.size() + num_output_row_paths);

    auto arrow_schema = arrow::schema(fields);
    auto num_rows = data_slice->num_rows();
    std::shared_ptr<arrow::RecordBatch> batches =
        arrow::RecordBatch::Make(arrow_schema, num_rows, vectors);
    auto valid = batches->Validate();
    if (!valid.ok()) {
        std::stringstream ss;
        ss << "Invalid RecordBatch: " << valid.message() << std::endl;
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    return std::make_pair(arrow_schema, batches);
}

template <typename CTX_T>
std::shared_ptr<std::string>
View<CTX_T>::data_slice_to_arrow(
    std::shared_ptr<t_data_slice<CTX_T>> data_slice,
    bool emit_group_by,
    bool compress
) const {
    std::pair<
        std::shared_ptr<arrow::Schema>,
        std::shared_ptr<arrow::RecordBatch>>
        pairs = data_slice_to_batches(emit_group_by, data_slice);
    std::shared_ptr<arrow::RecordBatch> batches = pairs.second;
    std::shared_ptr<arrow::Schema> arrow_schema = pairs.first;
    arrow::Result<std::shared_ptr<arrow::ResizableBuffer>> allocated =
        arrow::AllocateResizableBuffer(0);
    if (!allocated.ok()) {
        std::stringstream ss;
        ss << "Failed to allocate buffer: " << allocated.status().message()
           << std::endl;
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    std::shared_ptr<arrow::ResizableBuffer> buffer;
    buffer = *allocated;
    arrow::io::BufferOutputStream sink(buffer);
    auto options = arrow::ipc::IpcWriteOptions::Defaults();
    if (compress) {
        auto codec = arrow::util::Codec::Create(arrow::Compression::LZ4_FRAME);
        options.codec = std::move(codec).ValueUnsafe();
    }

    // #ifdef PSP_PARALLEL_FOR
    //     options.use_threads = false;
    // #else
    //     options.use_threads = false;
    // #endif
    options.use_threads = false;
    auto res = arrow::ipc::MakeStreamWriter(&sink, arrow_schema, options);
    std::shared_ptr<arrow::ipc::RecordBatchWriter> writer = *res;
    PSP_CHECK_ARROW_STATUS(writer->WriteRecordBatch(*batches));
    PSP_CHECK_ARROW_STATUS(writer->Close());
    PSP_CHECK_ARROW_STATUS(sink.Close());
    return std::make_shared<std::string>(buffer->ToString());
}

template <typename CTX_T>
std::shared_ptr<std::string>
View<CTX_T>::data_slice_to_csv(std::shared_ptr<t_data_slice<CTX_T>> data_slice
) const {
    std::pair<
        std::shared_ptr<arrow::Schema>,
        std::shared_ptr<arrow::RecordBatch>>
        pairs = data_slice_to_batches(true, data_slice);
    std::shared_ptr<arrow::RecordBatch> batches = pairs.second;
    std::shared_ptr<arrow::Schema> arrow_schema = pairs.first;
    arrow::Result<std::shared_ptr<arrow::ResizableBuffer>> allocated =
        arrow::AllocateResizableBuffer(0);
    if (!allocated.ok()) {
        std::stringstream ss;
        ss << "Failed to allocate buffer: " << allocated.status().message()
           << '\n';
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    std::shared_ptr<arrow::ResizableBuffer> buffer;
    buffer = *allocated;
    arrow::io::BufferOutputStream sink(buffer);
    auto write_options = arrow::csv::WriteOptions::Defaults();
    auto maybe_writer =
        arrow::csv::MakeCSVWriter(&sink, arrow_schema, write_options);
    std::shared_ptr<arrow::ipc::RecordBatchWriter> writer = *maybe_writer;
    PSP_CHECK_ARROW_STATUS(writer->WriteRecordBatch(*batches));
    PSP_CHECK_ARROW_STATUS(writer->Close());
    PSP_CHECK_ARROW_STATUS(sink.Close());
    return std::make_shared<std::string>(buffer->ToString());
}

// Delta calculation
template <typename CTX_T>
bool
View<CTX_T>::_get_deltas_enabled() const {
    return m_ctx->get_deltas_enabled();
}

template <typename CTX_T>
void
View<CTX_T>::_set_deltas_enabled(bool enabled_state) {
    m_ctx->set_deltas_enabled(enabled_state);
}

// Pivot table operations
template <typename CTX_T>
bool
View<CTX_T>::get_row_expanded(std::int32_t ridx) const {
    return m_ctx->unity_get_row_expanded(ridx);
}

template <>
t_index
View<t_ctxunit>::expand(std::int32_t ridx, std::int32_t row_pivot_length) {
    return ridx;
}

template <>
t_index
View<t_ctx0>::expand(std::int32_t ridx, std::int32_t row_pivot_length) {
    return ridx;
}

template <>
t_index
View<t_ctx1>::expand(std::int32_t ridx, std::int32_t row_pivot_length) {
    return m_ctx->open(ridx);
}

template <>
t_index
View<t_ctx2>::expand(std::int32_t ridx, std::int32_t row_pivot_length) {
    if (m_ctx->unity_get_row_depth(ridx) < t_uindex(row_pivot_length)) {
        return m_ctx->open(t_header::HEADER_ROW, ridx);
    }
    return ridx;
}

template <>
t_index
View<t_ctxunit>::collapse(std::int32_t ridx) {
    return ridx;
}

template <>
t_index
View<t_ctx0>::collapse(std::int32_t ridx) {
    return ridx;
}

template <>
t_index
View<t_ctx1>::collapse(std::int32_t ridx) {
    return m_ctx->close(ridx);
}

template <>
t_index
View<t_ctx2>::collapse(std::int32_t ridx) {
    return m_ctx->close(t_header::HEADER_ROW, ridx);
}

template <>
void
View<t_ctxunit>::set_depth(std::int32_t depth, std::int32_t row_pivot_length) {}

template <>
void
View<t_ctx0>::set_depth(std::int32_t depth, std::int32_t row_pivot_length) {}

template <>
void
View<t_ctx1>::set_depth(std::int32_t depth, std::int32_t row_pivot_length) {
    if (row_pivot_length >= depth) {
        m_ctx->set_depth(depth);
    } else {
        std::cout << "Cannot expand past " << std::to_string(row_pivot_length)
                  << '\n';
    }
}

template <>
void
View<t_ctx2>::set_depth(std::int32_t depth, std::int32_t row_pivot_length) {
    if (row_pivot_length >= depth) {
        m_ctx->set_depth(t_header::HEADER_ROW, depth);
    } else {
        std::cout << "Cannot expand past " << std::to_string(row_pivot_length)
                  << '\n';
    }
}

// Getters
template <typename CTX_T>
std::shared_ptr<CTX_T>
View<CTX_T>::get_context() const {
    return m_ctx;
}

template <typename CTX_T>
std::vector<std::string>
View<CTX_T>::get_row_pivots() const {
    return m_row_pivots;
}

template <typename CTX_T>
std::vector<std::string>
View<CTX_T>::get_column_pivots() const {
    return m_column_pivots;
}

template <typename CTX_T>
std::vector<t_aggspec>
View<CTX_T>::get_aggregates() const {
    return m_aggregates;
}

template <typename CTX_T>
std::vector<t_fterm>
View<CTX_T>::get_filter() const {
    return m_filter;
}

template <typename CTX_T>
std::vector<t_sortspec>
View<CTX_T>::get_sort() const {
    return m_sort;
}

template <typename CTX_T>
std::vector<std::shared_ptr<t_computed_expression>>
View<CTX_T>::get_expressions() const {
    return m_expressions;
}

template <>
std::vector<t_tscalar>
View<t_ctx0>::get_row_path(t_uindex idx) const {
    return {};
}

template <>
std::vector<t_tscalar>
View<t_ctxunit>::get_row_path(t_uindex idx) const {
    return {};
}

template <typename CTX_T>
std::vector<t_tscalar>
View<CTX_T>::get_row_path(t_uindex idx) const {
    return m_ctx->unity_get_row_path(idx);
}

template <typename CTX_T>
t_stepdelta
View<CTX_T>::get_step_delta(t_index bidx, t_index eidx) const {
    return m_ctx->get_step_delta(bidx, eidx);
}

template <>
t_stepdelta
View<t_ctxunit>::get_step_delta(t_index bidx, t_index eidx) const {
    return {};
}

template <typename CTX_T>
std::shared_ptr<t_data_slice<CTX_T>>
View<CTX_T>::get_row_delta() const {
    t_rowdelta delta = m_ctx->get_row_delta();
    const std::vector<t_tscalar>& data = delta.data;
    t_uindex num_rows_changed = delta.num_rows_changed;

    std::vector<std::vector<t_tscalar>> paths;

    // num_columns needs to include __ROW_PATH__ for all pivoted contexts
    t_uindex ncols = num_columns() + m_col_offset;
    t_uindex num_sides = sides();

    if (num_sides == 2 && !m_sort.empty()) {
        // Use column_names instead of column_paths, as column_names does
        // not skip hidden sort columns whereas column_paths does, which
        // causes issues later on.
        paths = column_names(true, m_column_pivots.size());
    } else {
        paths = column_paths();
    }

    // Add __ROW_PATH__ to the beginning for column only or for 2-sided
    // sorted contexts where we used `column_names`, which does not add
    // __ROW_PATH__ automatically.
    if (is_column_only() || (num_sides == 2 && !m_sort.empty())) {
        t_tscalar row_path;
        row_path.set("__ROW_PATH__");
        paths.insert(paths.begin(), std::vector<t_tscalar>{row_path});
    }

    return std::make_shared<t_data_slice<CTX_T>>(
        m_ctx,
        0,
        num_rows_changed,
        0,
        ncols,
        m_row_offset,
        m_col_offset,
        data,
        paths
    );
}

template <typename CTX_T>
t_dtype
View<CTX_T>::get_column_dtype(t_uindex idx) const {
    return m_ctx->get_column_dtype(idx);
}

template <typename CTX_T>
bool
View<CTX_T>::is_column_only() const {
    return m_view_config->is_column_only();
}

#ifdef PSP_PARALLEL_FOR
template <typename CTX_T>
boost::shared_mutex*
View<CTX_T>::get_lock() const {
    return m_table->get_pool()->get_lock();
}
#endif

/******************************************************************************
 *
 * Private
 */

template <typename CTX_T>
std::string
View<CTX_T>::_map_aggregate_types(
    const std::string& name, const std::string& typestring
) const {

    for (const t_aggspec& agg : m_aggregates) {
        if (agg.name() == name) {
            switch (agg.agg()) {
                case AGGTYPE_DISTINCT_COUNT:
                case AGGTYPE_COUNT: {
                    return "integer";
                } break;
                case AGGTYPE_MEAN:
                case AGGTYPE_MEAN_BY_COUNT:
                case AGGTYPE_WEIGHTED_MEAN:
                case AGGTYPE_PCT_SUM_PARENT:
                case AGGTYPE_PCT_SUM_GRAND_TOTAL:
                case AGGTYPE_VARIANCE:
                case AGGTYPE_STANDARD_DEVIATION: {
                    return "float";
                } break;
                default: {
                    return typestring;
                } break;
            }
        }
    }

    return typestring;
}

void
write_scalar(
    t_tscalar scalar,
    bool is_formatted,
    rapidjson::Writer<rapidjson::StringBuffer>& writer
) {

    if (!scalar.is_valid()) {
        writer.Null();
        return;
    }

    switch (scalar.get_dtype()) {
        case DTYPE_NONE:
            writer.Null();
            break;
        case DTYPE_BOOL:
            writer.Bool(scalar.get<bool>());
            break;
        case DTYPE_UINT8:
        case DTYPE_INT8:
            writer.Int(scalar.get<int8_t>());
            break;
        case DTYPE_UINT16:
        case DTYPE_INT16:
            writer.Int(scalar.get<int16_t>());
            break;
        case DTYPE_UINT32:
        case DTYPE_INT32:
            writer.Int(scalar.get<int32_t>());
            break;
        case DTYPE_UINT64:
        case DTYPE_INT64:
            writer.Int64(scalar.get<int64_t>());
            break;
        case DTYPE_FLOAT32:
            if (scalar.is_nan()) {
                writer.Null();
            } else {
                writer.Double(scalar.get<float>());
            }
            break;
        case DTYPE_FLOAT64:
            if (scalar.is_nan()) {
                writer.Null();
            } else {
                writer.Double(scalar.get<double>());
            }
            break;
        case DTYPE_STR:
            writer.String(scalar.get<const char*>());
            break;
        case DTYPE_TIME:
            if (is_formatted) {
                writer.String(scalar.to_string().c_str());
            } else {
                writer.Int64(scalar.get<int64_t>());
            }

            break;
        case DTYPE_DATE: {
            if (is_formatted) {
                writer.String(scalar.to_string().c_str());
            } else {
                t_date date_val = scalar.get<t_date>();
                tm t = date_val.get_tm();
                time_t epoch_delta = mktime(&t);
                writer.Double(epoch_delta * 1000);
            }
            break;
        }

        default:
            break;
    }
}

template <typename CTX_T>
void
View<CTX_T>::write_row_path(
    t_uindex start_row,
    t_uindex end_row,
    bool has_row_path,
    bool leaves_only,
    bool is_formatted,
    rapidjson::Writer<rapidjson::StringBuffer>& writer
) const {

    if (has_row_path) {
        writer.Key("__ROW_PATH__");
        writer.StartArray();
        t_uindex depth = m_row_pivots.size();
        for (auto r = start_row; r < end_row; ++r) {
            if (leaves_only) {
                if (m_ctx->unity_get_row_depth(r) < depth) {
                    continue;
                }
            }

            writer.StartArray();
            const auto row_path = get_row_path(r);

            // Question: Why are the row paths reversed?
            for (auto entry = row_path.size(); entry > 0; entry--) {
                const t_tscalar& scalar = row_path[entry - 1];

                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        writer.EndArray();
    }
}

std::string
col_path_to_legacy(const std::vector<t_tscalar>& col_path) {
    std::stringstream column_name;
    if (!col_path.empty()) {
        for (auto i = 0; i < col_path.size() - 1; ++i) {
            column_name << col_path[i].to_string() << "|";
        }
    }

    column_name << col_path[col_path.size() - 1].get<const char*>();
    return column_name.str();
}

template <typename CTX_T>
void
View<CTX_T>::write_column(
    t_uindex c,
    t_uindex start_row,
    t_uindex end_row,
    bool has_row_path,
    bool leaves_only,
    bool is_formatted,
    std::shared_ptr<t_data_slice<CTX_T>> slice,
    const std::vector<std::vector<t_tscalar>>& col_names,
    rapidjson::Writer<rapidjson::StringBuffer>& writer
) const {

    t_uindex depth = m_row_pivots.size();
    writer.Key(col_path_to_legacy(col_names.at(c)).c_str());
    writer.StartArray();

    for (auto r = start_row; r < end_row; ++r) {
        if (has_row_path && leaves_only) {
            if (m_ctx->unity_get_row_depth(r) < depth) {
                continue;
            }
        }

        auto scalar = slice->get(r, c);

        write_scalar(scalar, is_formatted, writer);
    }

    writer.EndArray();
}

template <typename CTX_T>
void
View<CTX_T>::write_index_column(
    t_uindex start_row,
    t_uindex end_row,
    bool has_row_path,
    bool leaves_only,
    bool is_formatted,
    std::shared_ptr<t_data_slice<CTX_T>> slice,
    rapidjson::Writer<rapidjson::StringBuffer>& writer
) const {
    t_uindex depth = m_row_pivots.size();
    writer.Key("__INDEX__");
    writer.StartArray();

    for (auto r = start_row; r < end_row; ++r) {
        if (has_row_path && leaves_only) {
            if (m_ctx->unity_get_row_depth(r) < depth) {
                continue;
            }
        }

        std::vector<t_tscalar> keys = slice->get_pkeys(r, 0);

        writer.StartArray();
        for (auto i = keys.size(); i > 0; --i) {
            auto scalar = keys[i - 1];

            write_scalar(scalar, is_formatted, writer);
        }

        writer.EndArray();
    }

    writer.EndArray();
}

template <typename T>
std::string
View<T>::to_rows(
    t_uindex start_row,
    t_uindex end_row,
    t_uindex start_col,
    t_uindex end_col,
    t_uindex hidden,
    bool is_formatted,
    bool get_pkeys,
    bool get_ids,
    bool leaves_only,
    t_uindex num_sides,
    bool has_row_path,
    const std::string& nidx,
    t_uindex columns_length,
    t_uindex group_by_length
) const {
    PSP_GIL_UNLOCK();
    PSP_READ_LOCK(get_lock());
    auto slice = get_data(start_row, end_row, start_col, end_col);
    auto& col_names = slice->get_column_names();
    rapidjson::StringBuffer s;
    rapidjson::Writer<rapidjson::StringBuffer> writer(s);
    writer.StartArray();

    if (start_row == end_row || start_col == end_col) {
        writer.EndArray();
        return s.GetString();
    }

    std::vector<std::string> column_names;
    for (auto c = start_col; c < end_col; ++c) {
        column_names.emplace_back(
            col_names[c][col_names[c].size() - 1].template get<const char*>()
        );
    }

    t_uindex depth = m_row_pivots.size();
    for (auto r = start_row; r < end_row; ++r) {
        if (has_row_path && leaves_only) {
            if (m_ctx->unity_get_row_depth(r) < depth) {
                continue;
            }
        }

        writer.StartObject();
        if (get_ids) {
            std::pair<t_uindex, t_uindex> pair{r, 0};
            std::vector<std::pair<t_uindex, t_uindex>> vec{pair};
            const auto keys = m_ctx->get_pkeys(vec);
            const t_tscalar& scalar = keys[0];
            writer.Key("__ID__");
            writer.StartArray();
            write_scalar(scalar, is_formatted, writer);
            writer.EndArray();
        }

        if (get_pkeys) {
            std::vector<t_tscalar> keys = slice->get_pkeys(r, 0);
            writer.Key("__INDEX__");
            writer.StartArray();
            for (auto i = keys.size(); i > 0; --i) {
                auto scalar = keys[i - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        for (auto c = start_col; c < end_col; ++c) {
            writer.Key(column_names[c - start_col].c_str());
            auto scalar = slice->get(r, c);
            write_scalar(scalar, is_formatted, writer);
        }

        writer.EndObject();
    }

    writer.EndArray();
    return s.GetString();
}

template <>
std::string
View<t_ctx1>::to_rows(
    t_uindex start_row,
    t_uindex end_row,
    t_uindex start_col,
    t_uindex end_col,
    t_uindex hidden,
    bool is_formatted,
    bool get_pkeys,
    bool get_ids,
    bool leaves_only,
    t_uindex num_sides,
    bool has_row_path,
    const std::string& nidx,
    t_uindex columns_length,
    t_uindex group_by_length
) const {
    PSP_GIL_UNLOCK();
    PSP_READ_LOCK(get_lock());
    auto slice = get_data(start_row, end_row, start_col, end_col);
    const auto& col_names = slice->get_column_names();
    rapidjson::StringBuffer s;
    rapidjson::Writer<rapidjson::StringBuffer> writer(s);
    writer.StartArray();

    if (start_row == end_row || start_col == end_col) {
        writer.EndArray();
        return s.GetString();
    }

    t_uindex depth = m_row_pivots.size();

    std::vector<std::string> column_names;
    for (auto c = start_col + 1; c < end_col; ++c) {
        if (c > columns_length) {
            continue;
        }

        column_names.emplace_back(
            col_names[c][col_names[c].size() - 1].template get<const char*>()
        );
    }

    for (auto r = start_row; r < end_row; ++r) {
        if (has_row_path && leaves_only) {
            if (m_ctx->unity_get_row_depth(r) < depth) {
                continue;
            }
        }

        // Row
        writer.StartObject();

        // `__ROW_PATH__`
        writer.Key("__ROW_PATH__");
        writer.StartArray();
        const auto row_path = get_row_path(r);
        for (auto entry = row_path.size(); entry > 0; entry--) {
            const t_tscalar& scalar = row_path[entry - 1];
            write_scalar(scalar, is_formatted, writer);
        }

        writer.EndArray();

        if (get_ids) {
            writer.Key("__ID__");
            writer.StartArray();
            for (auto entry = row_path.size(); entry > 0; entry--) {
                const t_tscalar& scalar = row_path[entry - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        if (get_pkeys) {
            std::vector<t_tscalar> keys = slice->get_pkeys(r, 0);
            writer.Key("__INDEX__");
            writer.StartArray();
            for (auto i = keys.size(); i > 0; --i) {
                auto scalar = keys[i - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        // Columns
        for (auto c = start_col + 1; c < end_col; ++c) {
            if (c >= columns_length + 1) {
                continue;
            }

            writer.Key(column_names[c - (start_col + 1)].c_str());
            auto scalar = slice->get(r, c);
            write_scalar(scalar, is_formatted, writer);
        }

        writer.EndObject();
    }

    writer.EndArray();
    return s.GetString();
}

template <>
std::string
View<t_ctx2>::to_rows(
    t_uindex start_row,
    t_uindex end_row,
    t_uindex start_col,
    t_uindex end_col,
    t_uindex hidden,
    bool is_formatted,
    bool get_pkeys,
    bool get_ids,
    bool leaves_only,
    t_uindex num_sides,
    bool has_row_path,
    const std::string& nidx,
    t_uindex columns_length,
    t_uindex group_by_length
) const {
    PSP_GIL_UNLOCK();
    PSP_READ_LOCK(get_lock());
    auto slice = get_data(start_row, end_row, start_col, end_col);
    const auto& col_names = slice->get_column_names();
    rapidjson::StringBuffer s;
    rapidjson::Writer<rapidjson::StringBuffer> writer(s);
    writer.StartArray();

    if (start_row == end_row || start_col == end_col) {
        writer.EndArray();
        return s.GetString();
    }

    std::vector<std::string> column_names;
    for (auto c = start_col + 1; c < end_col; ++c) {
        column_names.emplace_back(col_path_to_legacy(col_names.at(c)));
    }

    t_uindex depth = m_row_pivots.size();
    bool column_only = is_column_only();
    for (auto r = start_row; r < end_row; ++r) {
        if (has_row_path && leaves_only) {
            if (m_ctx->unity_get_row_depth(r) < depth) {
                continue;
            }
        }

        // Row
        writer.StartObject();

        // `__ROW_PATH__`
        const auto row_path = get_row_path(r);
        if (!column_only) {
            writer.Key("__ROW_PATH__");
            writer.StartArray();
            for (auto entry = row_path.size(); entry > 0; entry--) {
                const t_tscalar& scalar = row_path[entry - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        if (get_ids) {
            writer.Key("__ID__");
            writer.StartArray();
            for (auto entry = row_path.size(); entry > 0; entry--) {
                const t_tscalar& scalar = row_path[entry - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        if (get_pkeys) {
            std::vector<t_tscalar> keys = slice->get_pkeys(r, 0);
            writer.Key("__INDEX__");
            writer.StartArray();
            for (auto i = keys.size(); i > 0; --i) {
                auto scalar = keys[i - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        // Columns
        for (auto c = start_col + 1; c < end_col; ++c) {
            if (((c - 1) % (columns_length + hidden)) >= columns_length) {
                continue;
            }

            writer.Key(column_names[c - (start_col + 1)].c_str());
            auto scalar = slice->get(r, c);
            write_scalar(scalar, is_formatted, writer);
        }

        writer.EndObject();
    }

    writer.EndArray();
    return s.GetString();
}

// template <>
// std::string
// View<t_ctx2>::to_rows(t_uindex start_row, t_uindex end_row, t_uindex
// start_col,
//     t_uindex end_col, t_uindex hidden, bool is_formatted, bool get_pkeys,
//     bool get_ids, bool leaves_only, t_uindex num_sides, bool has_row_path,
//     std::string nidx, t_uindex columns_length, t_uindex group_by_length)
//     const { PSP_GIL_UNLOCK(); PSP_READ_LOCK(get_lock()); const auto slice =
//     get_data(start_row, end_row, start_col, end_col); const auto& col_names =
//     slice->get_column_names(); rapidjson::StringBuffer s;
//     rapidjson::Writer<rapidjson::StringBuffer> writer(s);
//     writer.StartObject();
//     write_row_path(
//         start_row, end_row, has_row_path, leaves_only, is_formatted, writer);
//     if (get_ids) {
//         writer.Key("__ID__");
//         writer.StartArray();
//         for (auto r = start_row; r < end_row; ++r) {
//             writer.StartArray();
//             const auto row_path = m_ctx->get_row_path(r);
//             for (auto entry = row_path.size(); entry > 0; entry--) {
//                 const t_tscalar& scalar = row_path[entry - 1];
//                 write_scalar(scalar, is_formatted, writer);
//             }

//             writer.EndArray();
//         }

//         writer.EndArray();
//     }

//     for (auto c = start_col + 1; c < end_col; ++c) {
//         // Hidden columns are always at the end of the column names
//         // list, and we need to skip them from the output.
//         if (((c - 1) % (columns_length + hidden)) >= columns_length) {
//             continue;
//         } else {
//             write_column(c, start_row, end_row, has_row_path, leaves_only,
//                 is_formatted, slice, col_names, writer);
//         }
//     }

//     if (get_pkeys) {
//         write_index_column(start_row, end_row, has_row_path, leaves_only,
//             is_formatted, slice, writer);
//     }

//     writer.EndObject();
//     return s.GetString();
// }

template <typename T>
std::string
View<T>::to_columns(
    t_uindex start_row,
    t_uindex end_row,
    t_uindex start_col,
    t_uindex end_col,
    t_uindex hidden,
    bool is_formatted,
    bool get_pkeys,
    bool get_ids,
    bool _leaves_only,
    t_uindex num_sides,
    bool _has_row_path,
    const std::string& nidx,
    t_uindex columns_length,
    t_uindex group_by_length
) const {
    PSP_GIL_UNLOCK();
    PSP_READ_LOCK(get_lock());
    auto slice = get_data(start_row, end_row, start_col, end_col);
    const std::vector<std::vector<t_tscalar>>& col_names =
        slice->get_column_names();

    rapidjson::StringBuffer s;
    rapidjson::Writer<rapidjson::StringBuffer> writer(s);
    writer.StartObject();
    for (auto c = start_col; c < end_col; ++c) {
        write_column(
            c,
            start_row,
            end_row,
            false,
            false,
            is_formatted,
            slice,
            col_names,
            writer
        );
    }

    if (get_pkeys) {
        write_index_column(
            start_row, end_row, false, false, is_formatted, slice, writer
        );
    }

    if (get_ids) {
        writer.Key("__ID__");
        writer.StartArray();
        for (auto x = start_row; x < end_row; ++x) {
            std::pair<t_uindex, t_uindex> pair{x, 0};
            std::vector<std::pair<t_uindex, t_uindex>> vec{pair};
            const auto keys = m_ctx->get_pkeys(vec);
            const t_tscalar& scalar = keys[0];
            writer.StartArray();
            write_scalar(scalar, is_formatted, writer);
            writer.EndArray();
        }

        writer.EndArray();
    }

    writer.EndObject();
    return s.GetString();
}

template <>
std::string
View<t_ctx1>::to_columns(
    t_uindex start_row,
    t_uindex end_row,
    t_uindex start_col,
    t_uindex end_col,
    t_uindex hidden,
    bool is_formatted,
    bool get_pkeys,
    bool get_ids,
    bool leaves_only,
    t_uindex num_sides,
    bool has_row_path,
    const std::string& nidx,
    t_uindex columns_length,
    t_uindex group_by_length
) const {
    PSP_GIL_UNLOCK();
    PSP_READ_LOCK(get_lock());

    auto slice = get_data(start_row, end_row, start_col, end_col);
    const auto& col_names = slice->get_column_names();
    rapidjson::StringBuffer s;
    rapidjson::Writer<rapidjson::StringBuffer> writer(s);
    writer.StartObject();
    write_row_path(start_row, end_row, true, leaves_only, is_formatted, writer);
    if (get_ids) {
        writer.Key("__ID__");
        writer.StartArray();
        for (auto r = start_row; r < end_row; ++r) {
            writer.StartArray();
            const auto row_path = m_ctx->get_row_path(r);
            for (auto entry = row_path.size(); entry > 0; entry--) {
                const t_tscalar& scalar = row_path[entry - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        writer.EndArray();
    }

    // Hidden columns are always at the end of the column names
    // list, and we need to skip them from the output.
    for (auto c = start_col + 1; c < end_col; ++c) {
        if ((c - 1) > columns_length - hidden) {
            continue;
        }
        write_column(
            c,
            start_row,
            end_row,
            true,
            leaves_only,
            is_formatted,
            slice,
            col_names,
            writer
        );
    }

    if (get_pkeys) {
        write_index_column(
            start_row, end_row, true, leaves_only, is_formatted, slice, writer
        );
    }

    writer.EndObject();
    return s.GetString();
}

template <>
std::string
View<t_ctx2>::to_columns(
    t_uindex start_row,
    t_uindex end_row,
    t_uindex start_col,
    t_uindex end_col,
    t_uindex hidden,
    bool is_formatted,
    bool get_pkeys,
    bool get_ids,
    bool leaves_only,
    t_uindex num_sides,
    bool has_row_path,
    const std::string& nidx,
    t_uindex columns_length,
    t_uindex group_by_length
) const {
    PSP_GIL_UNLOCK();
    PSP_READ_LOCK(get_lock());
    const auto slice = get_data(start_row, end_row, start_col, end_col);
    const auto& col_names = slice->get_column_names();
    rapidjson::StringBuffer s;
    rapidjson::Writer<rapidjson::StringBuffer> writer(s);
    writer.StartObject();
    write_row_path(
        start_row, end_row, has_row_path, leaves_only, is_formatted, writer
    );

    if (get_ids) {
        writer.Key("__ID__");
        writer.StartArray();
        for (auto r = start_row; r < end_row; ++r) {
            writer.StartArray();
            const auto row_path = m_ctx->get_row_path(r);
            for (auto entry = row_path.size(); entry > 0; entry--) {
                const t_tscalar& scalar = row_path[entry - 1];
                write_scalar(scalar, is_formatted, writer);
            }

            writer.EndArray();
        }

        writer.EndArray();
    }

    for (auto c = start_col + 1; c < end_col; ++c) {
        // Hidden columns are always at the end of the column names
        // list, and we need to skip them from the output.
        if (((c - 1) % (columns_length + hidden)) >= columns_length) {
            continue;
        }
        write_column(
            c,
            start_row,
            end_row,
            has_row_path,
            leaves_only,
            is_formatted,
            slice,
            col_names,
            writer
        );
    }

    if (get_pkeys) {
        write_index_column(
            start_row,
            end_row,
            has_row_path,
            leaves_only,
            is_formatted,
            slice,
            writer
        );
    }

    writer.EndObject();
    return s.GetString();
}

template <typename CTX_T>
void
View<CTX_T>::_find_hidden_sort(const std::vector<t_sortspec>& sort) {
    for (const t_sortspec& s : sort) {
        bool hidden = std::find(m_columns.begin(), m_columns.end(), s.m_colname)
            == m_columns.end();
        if (hidden) {
            // Store the actual column, not the composite column path
            m_hidden_sort.push_back(s.m_colname);
        }
    }
}

// Explicitly instantiate View for each context
template class View<t_ctxunit>;
template class View<t_ctx0>;
template class View<t_ctx1>;
template class View<t_ctx2>;
} // end namespace perspective