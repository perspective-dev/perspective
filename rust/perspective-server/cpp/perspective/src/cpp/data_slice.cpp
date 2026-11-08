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
#include <perspective/data_slice.h>

#include <algorithm>

namespace perspective {

template <typename CTX_T>
t_data_slice<CTX_T>::t_data_slice(
    std::shared_ptr<CTX_T> ctx,
    t_uindex start_row,
    t_uindex end_row,
    t_uindex start_col,
    t_uindex end_col,
    t_uindex row_offset,
    t_uindex col_offset,
    const std::vector<t_tscalar>& slice,
    const std::vector<std::vector<t_tscalar>>& column_names
) :
    m_ctx(ctx),
    m_start_row(start_row),
    m_end_row(end_row),
    m_start_col(start_col),
    m_end_col(end_col),
    m_row_offset(row_offset),
    m_col_offset(col_offset),
    m_slice(slice),
    m_column_names(column_names) {
    m_stride = m_end_col - m_start_col;
    resync_rows();
}

template <typename CTX_T>
t_data_slice<CTX_T>::t_data_slice(
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
) :
    m_ctx(ctx),
    m_start_row(start_row),
    m_end_row(end_row),
    m_start_col(start_col),
    m_end_col(end_col),
    m_row_offset(row_offset),
    m_col_offset(col_offset),
    m_slice(slice),
    m_column_names(column_names),
    m_column_indices(column_indices) {
    m_stride = m_end_col - m_start_col;
    resync_rows();
}

template <typename CTX_T>
void
t_data_slice<CTX_T>::resync_rows() {
    const t_uindex nrows = static_cast<t_uindex>(m_ctx->get_row_count());
    m_start_row = std::min(m_start_row, nrows);
    m_end_row = std::max(m_start_row, std::min(m_end_row, nrows));
}

template <typename CTX_T>
t_data_slice<CTX_T>::~t_data_slice() = default;

// Public API
template <typename CTX_T>
t_tscalar
t_data_slice<CTX_T>::get(t_uindex ridx, t_uindex cidx) const {
    ridx += m_row_offset;
    t_uindex idx = get_slice_idx(ridx, cidx);
    t_tscalar rv;
    if (idx >= m_slice.size()) {
        rv.clear();
    } else {
        rv = m_slice.operator[](idx);
    }
    return rv;
}

template <typename CTX_T>
std::vector<t_tscalar>
t_data_slice<CTX_T>::get_pkeys(t_uindex ridx, t_uindex cidx) const {
    std::pair<t_uindex, t_uindex> pair{ridx, cidx};
    std::vector<std::pair<t_uindex, t_uindex>> vec{pair};
    return m_ctx->get_pkeys(vec);
}

template <typename CTX_T>
std::vector<t_tscalar>
t_data_slice<CTX_T>::get_column_slice(t_uindex cidx) const {
    std::vector<t_tscalar> column_data;
    column_data.reserve(m_end_row);

    for (t_uindex ridx = 0; ridx < m_end_row; ++ridx) {
        ridx += m_row_offset;
        t_tscalar value = get(ridx, cidx);
        column_data.push_back(value);
    }

    return column_data;
}

template <typename CTX_T>
std::vector<t_tscalar>
t_data_slice<CTX_T>::get_row_path(t_uindex ridx) const {
    return m_ctx->unity_get_row_path(ridx);
}

template <typename CTX_T>
t_uindex
t_data_slice<CTX_T>::num_rows() const {
    return m_end_row - m_start_row;
}

// Getters
template <typename CTX_T>
std::shared_ptr<CTX_T>
t_data_slice<CTX_T>::get_context() const {
    return m_ctx;
}

template <typename CTX_T>
const std::vector<t_tscalar>&
t_data_slice<CTX_T>::get_slice() const {
    return m_slice;
}

template <typename CTX_T>
const std::vector<std::vector<t_tscalar>>&
t_data_slice<CTX_T>::get_column_names() const {
    return m_column_names;
}

template <typename CTX_T>
const std::vector<t_uindex>&
t_data_slice<CTX_T>::get_column_indices() const {
    return m_column_indices;
}

template <typename CTX_T>
const std::vector<t_uindex>&
t_data_slice<CTX_T>::get_row_indices() const {
    return m_row_indices;
}

template <typename CTX_T>
void
t_data_slice<CTX_T>::set_row_indices(const std::vector<t_uindex>& row_indices) {
    m_row_indices = row_indices;
}

template <typename CTX_T>
bool
t_data_slice<CTX_T>::is_column_only() const {
    return false;
}

template <>
bool
t_data_slice<t_ctx2>::is_column_only() const {
    auto config = m_ctx->get_config();
    return config.is_column_only();
}

template <typename CTX_T>
t_uindex
t_data_slice<CTX_T>::get_stride() const {
    return m_stride;
}

template <typename CTX_T>
t_uindex
t_data_slice<CTX_T>::get_row_offset() const {
    return m_row_offset;
}

template <typename CTX_T>
t_uindex
t_data_slice<CTX_T>::get_col_offset() const {
    return m_col_offset;
}

template <typename CTX_T>
t_get_data_extents
t_data_slice<CTX_T>::get_data_extents() const {
    auto nrows = m_ctx->get_row_count();
    auto ncols = m_ctx->get_column_count();
    t_get_data_extents ext = sanitize_get_data_extents(
        nrows, ncols, m_start_row, m_end_row, m_start_col, m_end_col
    );
    return ext;
}

// Private
template <typename CTX_T>
t_uindex
t_data_slice<CTX_T>::get_slice_idx(t_uindex ridx, t_uindex cidx) const {
    t_uindex idx = (ridx - m_start_row) * m_stride + (cidx - m_start_col);
    return idx;
}

// Explicitly instantiate data slice for each context
template class t_data_slice<t_ctxunit>;
template class t_data_slice<t_ctx0>;
template class t_data_slice<t_ctx1>;
template class t_data_slice<t_ctx2>;
} // end namespace perspective