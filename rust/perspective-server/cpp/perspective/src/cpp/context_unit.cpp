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
#include <perspective/context_base.h>
#include <perspective/get_data_extents.h>
#include <perspective/context_unit.h>
#include <perspective/flat_traversal.h>
#include <perspective/sym_table.h>

#include <perspective/filter_utils.h>

namespace perspective {

t_ctxunit::t_ctxunit() = default;

t_ctxunit::t_ctxunit(const t_schema& schema, const t_config& config) :
    t_ctxbase<t_ctxunit>(schema, config),
    m_has_delta(false) {}

t_ctxunit::~t_ctxunit() = default;

void
t_ctxunit::init() {
    m_init = true;
}

void
t_ctxunit::step_begin() {
    if (!m_init) {
        return;
    }

    m_delta_pkeys.clear();
    m_rows_changed = false;
    m_columns_changed = false;
}

void
t_ctxunit::step_end() {}

/**
 * @brief Notify the context with new data when the `t_gstate` master table is
 * not empty, and being updated with new data.
 *
 * @param flattened
 * @param delta
 * @param prev
 * @param curr
 * @param transitions
 * @param existed
 */
void
t_ctxunit::notify(
    const t_data_table& flattened,
    const t_data_table& delta,
    const t_data_table& prev,
    const t_data_table& curr,
    const t_data_table& transitions,
    const t_data_table& existed
) {
    t_uindex nrecs = flattened.size();

    std::shared_ptr<const t_column> pkey_sptr =
        flattened.get_const_column("psp_pkey");
    std::shared_ptr<const t_column> op_sptr =
        flattened.get_const_column("psp_op");
    const t_column* pkey_col = pkey_sptr.get();
    const t_column* op_col = op_sptr.get();

    bool delete_encountered = false;

    for (t_uindex idx = 0; idx < nrecs; ++idx) {
        // pkeys are always integers >= 0 - no need to use internal
        // symtable to dereference.
        t_tscalar pkey = pkey_col->get_scalar(idx);
        std::uint8_t op_ = *(op_col->get_nth<std::uint8_t>(idx));
        t_op op = static_cast<t_op>(op_);

        switch (op) {
            case OP_INSERT: {
            } break;
            case OP_DELETE: {
                delete_encountered = true;
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected OP");
            } break;
        }

        // add the pkey for row delta
        add_delta_pkey(pkey);
    }

    m_has_delta = !m_delta_pkeys.empty() || delete_encountered;
}

/**
 * @brief Notify the context with new data after the `t_gstate`'s master table
 * has been updated for the first time with data.
 *
 * @param flattened
 */
void
t_ctxunit::notify(const t_data_table& flattened, bool is_registration) {
    t_uindex nrecs = flattened.size();
    std::shared_ptr<const t_column> pkey_sptr =
        flattened.get_const_column("psp_pkey");
    const t_column* pkey_col = pkey_sptr.get();

    m_has_delta = true;

    // During `_register_context`, no subscriber exists yet — skip the
    // hopscotch_set insertions no observer can see. A unit context has no
    // traversal/sort state to build either, so this is effectively O(1).
    if (is_registration) {
        return;
    }

    // TODO: pkey and idx are equal, except idx is not a t_tscalar. I don't
    // think there is a difference between accessing the pkey column and
    // creating a brand new scalar, as get_scalar always returns a copy. We
    // could also simply store the row indices but there are some problems
    // with correctness that I couldn't nail down.
    for (t_uindex idx = 0; idx < nrecs; ++idx) {
        t_tscalar pkey = pkey_col->get_scalar(idx);

        // Add primary key to track row delta
        add_delta_pkey(pkey);
    }
}

std::pair<t_tscalar, t_tscalar>
t_ctxunit::get_min_max(const std::string& colname) const {
    auto col = m_gstate->get_table()->get_const_column(colname);
    auto rval = std::make_pair(mknone(), mknone());
    for (std::size_t i = 0; i < col->size(); i++) {
        t_tscalar val = col->get_scalar(i);
        if (!val.is_valid()) {
            continue;
        }

        if (rval.first.is_none() || (!val.is_none() && val < rval.first)) {
            rval.first = val;
        }

        if (val > rval.second) {
            rval.second = val;
        }
    }

    return rval;
}

/**
 * @brief Given a start/end row and column, return the data for the subset.
 *
 * @param start_row
 * @param end_row
 * @param start_col
 * @param end_col
 * @return std::vector<t_tscalar>
 */
std::vector<t_tscalar>
t_ctxunit::get_data(
    t_index start_row, t_index end_row, t_index start_col, t_index end_col
) const {
    t_uindex ctx_nrows = get_row_count();
    t_uindex ctx_ncols = get_column_count();

    auto ext = sanitize_get_data_extents(
        ctx_nrows, ctx_ncols, start_row, end_row, start_col, end_col
    );

    t_index num_rows = ext.m_erow - ext.m_srow;
    t_index stride = ext.m_ecol - ext.m_scol;
    std::vector<t_tscalar> values(num_rows * stride);

    auto none = mknone();

    const t_data_table& master_table = *(m_gstate->get_table());

    for (t_index cidx = ext.m_scol; cidx < ext.m_ecol; ++cidx) {
        const std::string& colname = m_config.col_at(cidx);

        std::vector<t_tscalar> out_data(num_rows);

        // Read directly from the row indices on the table - they will
        // always correspond exactly.
        m_gstate->read_column(
            master_table, colname, start_row, end_row, out_data
        );

        for (t_index ridx = ext.m_srow; ridx < ext.m_erow; ++ridx) {
            auto v = out_data[ridx - ext.m_srow];

            // todo: fix null handling
            if (!v.is_valid()) {
                v.set(none);
            }

            values[(ridx - ext.m_srow) * stride + (cidx - ext.m_scol)] = v;
        }
    }

    return values;
}

/**
 * @brief Given a vector of row indices, which may not be contiguous,
 * return the underlying data for these rows.
 *
 * @param rows a vector of row indices
 * @return std::vector<t_tscalar> a vector of scalars containing data
 */
std::vector<t_tscalar>
t_ctxunit::get_data(const std::vector<t_uindex>& rows) const {
    t_uindex stride = get_column_count();
    std::vector<t_tscalar> values(rows.size() * stride);

    auto none = mknone();

    const t_data_table& master_table = *(m_gstate->get_table());

    for (t_uindex cidx = 0; cidx < stride; ++cidx) {
        std::vector<t_tscalar> out_data(rows.size());
        const std::string& colname = m_config.col_at(cidx);
        m_gstate->read_column(master_table, colname, rows, out_data);

        for (t_uindex ridx = 0; ridx < rows.size(); ++ridx) {
            auto v = out_data[ridx];

            if (!v.is_valid()) {
                v.set(none);
            }

            values[(ridx)*stride + (cidx)] = v;
        }
    }

    return values;
}

std::vector<t_tscalar>
t_ctxunit::get_data(const std::vector<t_tscalar>& pkeys) const {
    t_uindex stride = get_column_count();
    std::vector<t_tscalar> values(pkeys.size() * stride);

    auto none = mknone();

    const t_data_table& master_table = *(m_gstate->get_table());

    for (t_uindex cidx = 0; cidx < stride; ++cidx) {
        std::vector<t_tscalar> out_data(pkeys.size());
        const std::string& colname = m_config.col_at(cidx);

        m_gstate->read_column(master_table, colname, pkeys, out_data);

        for (t_uindex ridx = 0; ridx < pkeys.size(); ++ridx) {
            auto v = out_data[ridx];

            if (!v.is_valid()) {
                v.set(none);
            }

            values[(ridx)*stride + (cidx)] = v;
        }
    }

    return values;
}

/**
 * @brief Returns a vector of primary keys for the specified cells,
 * reading from the gnode_state's master table instead of from a traversal.
 *
 * @param cells
 * @return std::vector<t_tscalar>
 */
std::vector<t_tscalar>
t_ctxunit::get_pkeys(const std::vector<std::pair<t_uindex, t_uindex>>& cells
) const {
    // Validate cells
    t_index num_rows = get_row_count();

    for (const auto& cell : cells) {
        t_index ridx = cell.first;
        if (ridx >= num_rows) {
            return {};
        }
    }

    std::set<t_index> all_rows;

    for (const auto& cell : cells) {
        all_rows.insert(cell.first);
    }

    const t_data_table& master_table = *(m_gstate->get_table());
    std::shared_ptr<const t_column> pkey_sptr =
        master_table.get_const_column("psp_pkey");

    std::vector<t_tscalar> rval(all_rows.size());

    t_uindex i = 0;
    for (auto ridx : all_rows) {
        rval[i] = pkey_sptr->get_scalar(ridx);
        i++;
    }

    return rval;
}

/**
 * @brief Returns a string column name using the context's config.
 *
 * @param idx
 * @return t_tscalar
 */
t_tscalar
t_ctxunit::get_column_name(t_index idx) {
    std::string empty;

    if (idx >= get_column_count()) {
        return m_symtable.get_interned_tscalar(empty.c_str());
    }

    return m_symtable.get_interned_tscalar(m_config.col_at(idx).c_str());
}

/**
 * @brief Returns a `t_rowdelta` struct containing data from updated rows
 * and the updated row indices.
 *
 * @return t_rowdelta
 */
t_rowdelta
t_ctxunit::get_row_delta() {
    bool rows_changed = m_rows_changed;
    std::vector<t_tscalar> pkey_vector(
        m_delta_pkeys.begin(), m_delta_pkeys.end()
    );

    // Sort pkeys - they will always be integers >= 0, as the table has
    // no index set.
    std::sort(pkey_vector.begin(), pkey_vector.end());

    std::vector<t_tscalar> data = get_data(pkey_vector);
    t_rowdelta rval(rows_changed, pkey_vector.size(), data);
    clear_deltas();

    return rval;
}

const tsl::hopscotch_set<t_tscalar>&
t_ctxunit::get_delta_pkeys() const {
    return m_delta_pkeys;
}

std::vector<std::string>
t_ctxunit::get_column_names() const {
    return m_schema.columns();
}

void
t_ctxunit::reset() {
    m_has_delta = false;
}

bool
t_ctxunit::get_deltas_enabled() const {
    return true;
}

void
t_ctxunit::set_deltas_enabled(bool enabled_state) {}

t_index
t_ctxunit::sidedness() const {
    return 0;
}

t_index
t_ctxunit::get_row_count() const {
    return m_gstate->num_rows();
}

t_index
t_ctxunit::get_column_count() const {
    return m_config.get_num_columns();
}

std::vector<t_tscalar>
t_ctxunit::unity_get_row_data(t_uindex idx) const {
    return get_data(idx, idx + 1, 0, get_column_count());
}

std::vector<t_tscalar>
t_ctxunit::unity_get_row_path(t_uindex idx) const {
    return {};
}

std::vector<t_tscalar>
t_ctxunit::unity_get_column_path(t_uindex idx) const {
    return {};
}

t_uindex
t_ctxunit::unity_get_row_depth(t_uindex ridx) const {
    return 0;
}

t_uindex
t_ctxunit::unity_get_column_depth(t_uindex cidx) const {
    return 0;
}

std::vector<std::string>
t_ctxunit::unity_get_column_names() const {
    return get_column_names();
}

t_uindex
t_ctxunit::unity_get_column_count() const {
    return get_column_count();
}

t_uindex
t_ctxunit::unity_get_row_count() const {
    return get_row_count();
}

bool
t_ctxunit::unity_get_row_expanded(t_uindex idx) const {
    return false;
}

bool
t_ctxunit::unity_get_column_expanded(t_uindex idx) const {
    return false;
}

/**
 * @brief Mark a primary key as updated by adding it to the tracking set.
 *
 * @param pkey
 */
void
t_ctxunit::add_delta_pkey(t_tscalar pkey) {
    m_delta_pkeys.insert(pkey);
}

bool
t_ctxunit::has_deltas() const {
    return m_has_delta;
}

t_dtype
t_ctxunit::get_column_dtype(t_uindex idx) const {
    if (idx >= static_cast<t_uindex>(get_column_count())) {
        return DTYPE_NONE;
    }

    auto cname = m_config.col_at(idx);

    if (!m_schema.has_column(cname)) {
        return DTYPE_NONE;
    }

    return m_schema.get_dtype(cname);
}

void
t_ctxunit::clear_deltas() {
    m_has_delta = false;
}

std::string
t_ctxunit::repr() const {
    std::stringstream ss;
    ss << "t_ctxunit<" << this << ">";
    return ss.str();
}

void
t_ctxunit::pprint() const {}

} // end namespace perspective
