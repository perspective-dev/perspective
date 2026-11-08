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
#include <perspective/scalar.h>
#include <perspective/get_data_extents.h>
#include <perspective/context_unit.h>
#include <perspective/context_zero.h>
#include <perspective/context_one.h>
#include <perspective/context_two.h>

namespace perspective {
/**
 * @class t_data_slice
 *
 * @brief t_data_slice contains a slice of the View's underlying data
 * with the metadata required to correctly parse it. It offers a unified
 * get(row_index, col_index) API that is extensible and does not require
 * additional parsing in the binding language. This makes implementing data
 * serialization easy, as one simply writes each row and each column inside it
 * sequentially.
 *
 *
 * - m_view: a reference to the view from which we output data
 * - m_slice: a reference to a vector of t_tscalar objects containing data
 * - m_column_names: a reference to a vector of string column names from the
 * view.
 * - m_column_indices: an optional reference to a vector of t_uindex column
 * indices, which we use for column-pivoted views.
 *
 */
template <typename CTX_T>
class PERSPECTIVE_EXPORT t_data_slice {
public:
    t_data_slice(
        std::shared_ptr<CTX_T> ctx,
        t_uindex start_row,
        t_uindex end_row,
        t_uindex start_col,
        t_uindex end_col,
        t_uindex row_offset,
        t_uindex col_offset,
        const std::vector<t_tscalar>& slice,
        const std::vector<std::vector<t_tscalar>>& column_names
    );

    /**
     * @brief Construct a new data slice, with a vector of row indices on which
     * to access the underlying data.
     *
     * @tparam CTX_T
     * @param ctx
     * @param slice
     * @param row_indices
     */
    t_data_slice(
        std::shared_ptr<CTX_T> ctx,
        t_uindex start_row,
        t_uindex end_row,
        t_uindex start_col,
        t_uindex end_col,
        t_uindex row_offset,
        t_uindex col_offset,
        const std::vector<t_tscalar>& slice,
        const std::vector<std::vector<t_tscalar>>& column_names,
        const std::vector<t_uindex>& column_indices
    );

    ~t_data_slice();

    /**
     * @brief Returns the t_tscalar at the declared indices in the data slice,
     * or an invalid t_tscalar if the indices should be skipped.
     *
     * @param ridx row index into the slice
     * @param cidx column index into the slice
     *
     * @return t_tscalar a valid scalar containing the underlying data, or a new
     * t_tscalar initialized with an invalid flag.
     */
    t_tscalar get(t_uindex ridx, t_uindex cidx) const;

    std::vector<t_tscalar> get_pkeys(t_uindex ridx, t_uindex cidx) const;

    /**
     * @brief Returns the row path, which maps a specific piece of data to the
     * row and column that it belongs to.
     *
     * @param ridx the row index into the slice
     * @return std::vector<t_tscalar>
     */
    std::vector<t_tscalar> get_row_path(t_uindex ridx) const;

    std::vector<t_tscalar> get_column_slice(t_uindex cidx) const;

    // Getters
    std::shared_ptr<CTX_T> get_context() const;
    const std::vector<t_tscalar>& get_slice() const;
    const std::vector<std::vector<t_tscalar>>& get_column_names() const;
    const std::vector<t_uindex>& get_column_indices() const;

    /**
     * @brief The view row index of each slice row when the slice is a row
     * delta, empty when slice rows are view rows.
     */
    const std::vector<t_uindex>& get_row_indices() const;
    void set_row_indices(const std::vector<t_uindex>& row_indices);
    t_get_data_extents get_data_extents() const;
    t_uindex get_stride() const;
    t_uindex num_rows() const;
    t_uindex get_row_offset() const;
    t_uindex get_col_offset() const;
    bool is_column_only() const;

private:
    /**
     * @brief Calculates the index into the underlying data slice for the
     * row and the column.
     *
     * @param ridx
     * @param cidx
     * @return t_uindex
     */
    t_uindex get_slice_idx(t_uindex ridx, t_uindex cidx) const;
    void resync_rows();

    std::shared_ptr<CTX_T> m_ctx;
    t_uindex m_start_row;
    t_uindex m_end_row;
    t_uindex m_start_col;
    t_uindex m_end_col;
    t_uindex m_row_offset;
    t_uindex m_col_offset;
    t_uindex m_stride;
    std::vector<t_tscalar> m_slice;
    std::vector<std::vector<t_tscalar>> m_column_names;
    std::vector<t_uindex> m_column_indices;
    std::vector<t_uindex> m_row_indices;
};
} // end namespace perspective