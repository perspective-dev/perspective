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
#include <perspective/exports.h>
#include <perspective/base.h>
#include <perspective/raw_types.h>
#include <perspective/context_unit.h>
#include <perspective/context_zero.h>
#include <perspective/context_one.h>
#include <perspective/context_two.h>
#include <perspective/data_slice.h>
#include <perspective/table.h>
#include <perspective/view_config.h>
#include <rapidjson/writer.h>
#include <rapidjson/stringbuffer.h>
#include <cstddef>
#include <memory>
#include <map>
#include <arrow/api.h>
#ifdef PSP_ENABLE_PYTHON
#include <thread>
#endif

namespace perspective {

void write_scalar(
    t_tscalar scalar,
    bool is_formatted,
    rapidjson::Writer<rapidjson::StringBuffer>& writer
);

template <typename CTX_T>
class PERSPECTIVE_EXPORT View {
public:
    View(
        std::shared_ptr<Table> table,
        std::shared_ptr<CTX_T> ctx,
        std::string name,
        std::string separator,
        std::shared_ptr<t_view_config> view_config
    );

    ~View();

    /**
     * @brief The `t_view_config` object that created this `View`.
     *
     * @return t_view_config
     */
    std::shared_ptr<t_view_config> get_view_config() const;

    /**
     * @brief The number of pivoted sides of this View.
     *
     * @return std::int32_t
     */
    std::int32_t sides() const;

    /**
     * @brief The number of aggregated rows in this View. This is affected by
     * the "row_pivot" configuration parameter supplied to this View's
     * contructor.
     *
     *
     * @return std::int32_t the number of aggregated rows
     */
    std::int32_t num_rows() const;

    /**
     * @brief The number of aggregated columns in this View. This is affected by
     * the "column_pivot" configuration parameter supplied to this View's
     * contructor.
     *
     *
     * @return std::int32_t the number of aggregated columns
     */
    std::int32_t num_columns() const;

    /**
     * @brief The schema of this View.  A schema is an std::map, the keys of
     * which are the columns of this View, and the values are their string type
     * names. If this View is aggregated, theses will be the aggregated types;
     * otherwise these types will be the same as the columns in the underlying
     * Table.
     *
     * @return std::map<std::string, std::string>
     */
    std::map<std::string, std::string> schema() const;

    /**
     * @brief The expression schema of this View. An expression schema is an
     * std::map, the keys of which are the columns of this View, and the values
     * are their string type names. If this View is aggregated, these will be
     * the aggregated types; otherwise these types will be the same as the
     * columns in the underlying Table.
     *
     * @return std::map<std::string, std::string>
     */
    std::map<std::string, std::string> expression_schema() const;

    /**
     * @brief The column names of this View. If the View is aggregated, the
     * individual column names will be joined with a separator character
     * specified by the user, or defaulting to "|".
     *
     * @return std::vector<std::vector<t_tscalar>>
     */
    std::vector<std::vector<t_tscalar>>
    column_names(bool skip = false, std::int32_t depth = 0) const;

    /**
     * @brief The aggregated column names of this View, showing the columns that
     * have been composed through the addition of a pivot as they appear in the
     * view.
     *
     * If the view is pivoted, "__ROW_PATH__" will be prepended to the front of
     * the vector because it is part of the column path.
     *
     * @return std::vector<std::vector<t_tscalar>>>
     */
    std::vector<std::vector<t_tscalar>> column_paths() const;

    std::vector<std::vector<std::string>> column_paths_string() const;

    /**
     * @brief
     *
     * @return std::pair<t_tscalar, t_tscalar>
     */
    std::pair<t_tscalar, t_tscalar> get_min_max(const std::string& colname
    ) const;

    void write_row_path(
        t_uindex start_row,
        t_uindex end_row,
        bool has_row_path,
        bool leaves_only,
        bool is_formatted,
        rapidjson::Writer<rapidjson::StringBuffer>& writer
    ) const;

    void write_column(
        t_uindex c,
        t_uindex start_row,
        t_uindex end_row,
        bool has_row_path,
        bool leaves_only,
        bool is_formatted,
        std::shared_ptr<t_data_slice<CTX_T>> slice,
        const std::vector<std::vector<t_tscalar>>& col_names,
        rapidjson::Writer<rapidjson::StringBuffer>& writer
    ) const;

    void write_row(
        t_uindex c,
        t_uindex start_col,
        t_uindex end_col,
        bool has_row_path,
        bool leaves_only,
        bool ids,
        bool pkeys,
        bool is_formatted,
        std::shared_ptr<t_data_slice<CTX_T>> slice,
        const std::vector<std::vector<t_tscalar>>& col_names,
        rapidjson::Writer<rapidjson::StringBuffer>& writer
    ) const;

    void write_index_column(
        t_uindex start_row,
        t_uindex end_row,
        bool has_row_path,
        bool leaves_only,
        bool is_formatted,
        std::shared_ptr<t_data_slice<CTX_T>> slice,
        rapidjson::Writer<rapidjson::StringBuffer>& writer
    ) const;

    /**
     * @brief Returns shared pointer to a t_data_slice object, which
     * contains the underlying slice of data as well as the metadata
     * required to interface with it.
     *
     * @tparam
     * @param start_row
     * @param end_row
     * @param start_col
     * @param end_col
     * @return std::shared_ptr<t_data_slice<t_ctx0>>
     */
    std::shared_ptr<t_data_slice<CTX_T>> get_data(
        t_uindex start_row,
        t_uindex end_row,
        t_uindex start_col,
        t_uindex end_col
    ) const;

    std::string to_rows(
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
    ) const;

    std::string to_columns(
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
    ) const;

    /**
     * @brief Serializes the `View`'s data into the Apache Arrow format
     * as a bytestring. Using start/end row and column, retrieve a data
     * slice from the view and serialize it using `to_arrow_helper`.
     *
     * @param start_row
     * @param end_row
     * @param start_col
     * @param end_col
     * @param emit_group_by
     * @return std::shared_ptr<std::string>
     */
    std::shared_ptr<std::string> to_arrow(
        std::int32_t start_row,
        std::int32_t end_row,
        std::int32_t start_col,
        std::int32_t end_col,
        bool emit_group_by,
        bool compress
    ) const;

    /**
     * @brief Serializes the `View`'s data into the Apache Arrow format
     * as a bytestring. Using start/end row and column, retrieve a data
     * slice from the view and serialize it using `to_arrow_helper`.
     *
     * @param start_row
     * @param end_row
     * @param start_col
     * @param end_col
     * @return std::shared_ptr<std::string>
     */
    std::shared_ptr<std::string> to_csv(
        std::int32_t start_row,
        std::int32_t end_row,
        std::int32_t start_col,
        std::int32_t end_col
    ) const;

    /**
     * @brief Serializes a given data slice into the Apache Arrow format. Can
     * be directly called with a pointer to a data slice in order to serialize
     * it to Arrow.
     *
     * @param start_row
     * @param end_row
     * @param start_col
     * @param end_col
     * @return std::shared_ptr<std::string>
     */
    std::shared_ptr<std::string> data_slice_to_arrow(
        std::shared_ptr<t_data_slice<CTX_T>> data_slice,
        bool emit_group_b,
        bool compress
    ) const;

    /**
     * @brief Serializes a given data slice into the Apache Arrow format. Can
     * be directly called with a pointer to a data slice in order to serialize
     * it to Arrow.
     *
     * @param start_row
     * @param end_row
     * @param start_col
     * @param end_col
     * @return std::shared_ptr<std::string>
     */
    std::shared_ptr<std::string>
    data_slice_to_csv(std::shared_ptr<t_data_slice<CTX_T>> data_slice) const;

    // Delta calculation
    bool _get_deltas_enabled() const;
    void _set_deltas_enabled(bool enabled_state);

    // Pivot table operations

    /**
     * @brief Whether the row at "ridx" is expanded or collapsed.
     *
     * @param ridx
     * @return std::int32_t
     */
    bool get_row_expanded(std::int32_t ridx) const;

    /**
     * @brief Expands the row at "ridx".
     *
     * @param ridx
     * @param row_pivot_length
     * @return t_index
     */
    t_index expand(std::int32_t ridx, std::int32_t row_pivot_length);

    /**
     * @brief Collapses the row at "ridx".
     *
     * @param ridx
     * @return t_index
     */
    t_index collapse(std::int32_t ridx);

    /**
     * @brief Set the expansion "depth" of the pivot tree.
     *
     * @param depth
     * @param row_pivot_length
     */
    void set_depth(std::int32_t depth, std::int32_t row_pivot_length);

    /**
     * @brief Returns a data slice that contains the dataset from the rows
     * that have been changed by a call to `update()`.
     *
     * @return std::shared_ptr<t_data_slice<CTX_T>>
     */
    std::shared_ptr<t_data_slice<CTX_T>> get_row_delta() const;

    // Getters
    std::shared_ptr<CTX_T> get_context() const;
    std::vector<std::string> get_row_pivots() const;
    std::vector<std::string> get_column_pivots() const;
    std::vector<t_aggspec> get_aggregates() const;
    std::vector<t_fterm> get_filter() const;
    std::vector<t_sortspec> get_sort() const;
    std::vector<std::shared_ptr<t_computed_expression>> get_expressions() const;
    std::vector<t_tscalar> get_row_path(t_uindex idx) const;
    t_stepdelta get_step_delta(t_index bidx, t_index eidx) const;
    t_dtype get_column_dtype(t_uindex idx) const;
    bool is_column_only() const;
#ifdef PSP_PARALLEL_FOR
    boost::shared_mutex* get_lock() const;
#endif

private:
    /**
     * @brief Gets the number of hidden columns - columns used in sort but not
     * shown.
     *
     * @return std::int32_t
     */
    std::int32_t _num_hidden_cols();

    /**
     * @brief Gets the correct type for the specified aggregate, thus remapping
     * columns when they are pivoted. This ensures that we display aggregates
     * with the correct type.
     *
     * @return std::string
     */
    std::string _map_aggregate_types(
        const std::string& name, const std::string& typestring
    ) const;

    /**
     * @brief Serializes a given data slice into the Apache Arrow format. Can
     * be directly called with a pointer to a data slice in order to serialize
     * it to Arrow.
     *
     * @param start_row
     * @param end_row
     * @param start_col
     * @param end_col
     * @return std::shared_ptr<std::string>
     */
    std::pair<
        std::shared_ptr<arrow::Schema>,
        std::shared_ptr<arrow::RecordBatch>>
    data_slice_to_batches(
        bool emit_group_by, std::shared_ptr<t_data_slice<CTX_T>> data_slice
    ) const;

    void _find_hidden_sort(const std::vector<t_sortspec>& sort);

    std::shared_ptr<Table> m_table;
    std::shared_ptr<CTX_T> m_ctx;
    std::string m_name;
    std::string m_separator;

    std::vector<std::string> m_row_pivots;
    std::vector<std::string> m_column_pivots;
    std::vector<t_aggspec> m_aggregates;
    std::vector<std::string> m_columns;
    std::vector<t_fterm> m_filter;
    std::vector<t_sortspec> m_sort;
    std::vector<std::string> m_hidden_sort;
    std::vector<std::shared_ptr<t_computed_expression>> m_expressions;
    bool m_column_only;
    t_uindex m_row_offset;
    t_uindex m_col_offset;

    std::shared_ptr<t_view_config> m_view_config;
};
} // end namespace perspective