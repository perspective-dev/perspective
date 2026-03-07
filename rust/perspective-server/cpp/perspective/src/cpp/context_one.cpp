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
#include <perspective/sort_specification.h>
#include <perspective/get_data_extents.h>
#include <perspective/context_one.h>
#include <perspective/extract_aggregate.h>
#include <perspective/filter.h>
#include <perspective/sparse_tree.h>
#include <perspective/tree_context_common.h>

#include <perspective/env_vars.h>
#include <perspective/traversal.h>

#include <memory>

#include <utility>

namespace perspective {

t_ctx1::t_ctx1(const t_schema& schema, const t_config& pivot_config) :
    t_ctxbase<t_ctx1>(schema, pivot_config),
    m_depth(0),
    m_depth_set(false) {}

t_ctx1::~t_ctx1() = default;

void
t_ctx1::init() {
    auto pivots = m_config.get_row_pivots();
    m_tree = std::make_shared<t_stree>(
        pivots, m_config.get_aggregates(), m_schema, m_config
    );
    m_tree->init();
    m_traversal = std::make_shared<t_traversal>(m_tree);

    // Each context stores its own expression columns in separate
    // `t_data_table`s so that each context's expressions are isolated
    // and do not affect other contexts when they are calculated.
    const auto& expressions = m_config.get_expressions();
    m_expression_tables = std::make_shared<t_expression_tables>(expressions);

    m_init = true;
}

t_index
t_ctx1::get_row_count() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_traversal->size();
}

t_index
t_ctx1::get_column_count() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_config.get_num_aggregates() + 1;
}

t_index
t_ctx1::open(t_header header, t_index idx) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return open(idx);
}

std::string
t_ctx1::repr() const {
    std::stringstream ss;
    ss << "t_ctx1<" << this << ">";
    return ss.str();
}

t_index
t_ctx1::open(t_index idx) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    // If we manually open/close a node, stop automatically expanding
    m_depth_set = false;
    m_depth = 0;

    if (idx >= t_index(m_traversal->size())) {
        return 0;
    }

    t_index retval = m_traversal->expand_node(m_sortby, idx);
    m_rows_changed = (retval > 0);
    return retval;
}

t_index
t_ctx1::close(t_index idx) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    // If we manually open/close a node, stop automatically expanding
    m_depth_set = false;
    m_depth = 0;

    if (idx >= t_index(m_traversal->size())) {
        return 0;
    }

    t_index retval = m_traversal->collapse_node(idx);
    m_rows_changed = (retval > 0);
    return retval;
}

std::pair<t_tscalar, t_tscalar>
t_ctx1::get_min_max(const std::string& colname) const {
    auto rval = std::make_pair(mknone(), mknone());
    auto* aggtable = m_tree->get_aggtable();
    t_schema aggschema = aggtable->get_schema();
    const auto* col = aggtable->get_const_column(colname).get();
    auto colidx = aggschema.get_colidx(colname);
    auto depth = m_config.get_num_rpivots();
    const std::vector<t_aggspec>& aggspecs = m_config.get_aggregates();
    bool is_finished = false;
    while (!is_finished && depth > 0) {
        for (std::size_t i = 0; i < m_traversal->size(); i++) {
            t_index nidx = m_traversal->get_tree_index(i);
            t_index pnidx = m_tree->get_parent_idx(nidx);
            if (m_tree->get_depth(nidx) != depth) {
                continue;
            }

            t_uindex agg_ridx = m_tree->get_aggidx(nidx);
            t_index agg_pridx = pnidx == INVALID_INDEX
                ? INVALID_INDEX
                : m_tree->get_aggidx(pnidx);
            t_tscalar val =
                extract_aggregate(aggspecs[colidx], col, agg_ridx, agg_pridx);

            if (!val.is_valid()) {
                continue;
            }

            is_finished = true;
            if (rval.first.is_none() || (!val.is_none() && val < rval.first)) {
                rval.first = val;
            }

            if (val > rval.second) {
                rval.second = val;
            }
        }

        depth--;
    }

    return rval;
}

std::vector<t_tscalar>
t_ctx1::get_data(
    t_index start_row, t_index end_row, t_index start_col, t_index end_col
) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex ctx_nrows = get_row_count();
    t_uindex ncols = get_column_count();
    auto ext = sanitize_get_data_extents(
        ctx_nrows, ncols, start_row, end_row, start_col, end_col
    );

    t_index nrows = ext.m_erow - ext.m_srow;
    t_index stride = ext.m_ecol - ext.m_scol;

    std::vector<t_tscalar> tmpvalues(nrows * ncols);
    std::vector<t_tscalar> values(nrows * stride);

    std::vector<const t_column*> aggcols(m_config.get_num_aggregates());

    auto* aggtable = m_tree->get_aggtable();
    t_schema aggschema = aggtable->get_schema();
    auto none = mknone();

    for (t_uindex aggidx = 0, loop_end = aggcols.size(); aggidx < loop_end;
         ++aggidx) {
        const std::string& aggname = aggschema.m_columns[aggidx];
        aggcols[aggidx] = aggtable->get_const_column(aggname).get();
    }

    const std::vector<t_aggspec>& aggspecs = m_config.get_aggregates();

    for (t_index ridx = ext.m_srow; ridx < ext.m_erow; ++ridx) {
        t_index nidx = m_traversal->get_tree_index(ridx);
        t_index pnidx = m_tree->get_parent_idx(nidx);

        t_uindex agg_ridx = m_tree->get_aggidx(nidx);
        t_index agg_pridx =
            pnidx == INVALID_INDEX ? INVALID_INDEX : m_tree->get_aggidx(pnidx);

        t_tscalar tree_value = m_tree->get_value(nidx);
        tmpvalues[(ridx - ext.m_srow) * ncols] = tree_value;

        for (t_index aggidx = 0, loop_end = aggcols.size(); aggidx < loop_end;
             ++aggidx) {
            t_tscalar value = extract_aggregate(
                aggspecs[aggidx], aggcols[aggidx], agg_ridx, agg_pridx
            );
            if (!value.is_valid()) {
                value.set(none); // todo: fix null handling
            }
            tmpvalues[(ridx - ext.m_srow) * ncols + 1 + aggidx].set(value);
        }
    }

    for (auto ridx = ext.m_srow; ridx < ext.m_erow; ++ridx) {
        for (auto cidx = ext.m_scol; cidx < ext.m_ecol; ++cidx) {
            auto insert_idx = (ridx - ext.m_srow) * stride + cidx - ext.m_scol;
            auto src_idx = (ridx - ext.m_srow) * ncols + cidx;
            values[insert_idx].set(tmpvalues[src_idx]);
        }
    }
    return values;
}

std::vector<t_tscalar>
t_ctx1::get_data(const std::vector<t_uindex>& rows) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex nrows = rows.size();
    t_uindex ncols = get_column_count();

    std::vector<t_tscalar> tmpvalues(nrows * ncols);
    std::vector<t_tscalar> values(nrows * ncols);

    std::vector<const t_column*> aggcols(m_config.get_num_aggregates());

    auto* aggtable = m_tree->get_aggtable();
    t_schema aggschema = aggtable->get_schema();
    auto none = mknone();

    for (t_uindex aggidx = 0, loop_end = aggcols.size(); aggidx < loop_end;
         ++aggidx) {
        const std::string& aggname = aggschema.m_columns[aggidx];
        aggcols[aggidx] = aggtable->get_const_column(aggname).get();
    }

    const std::vector<t_aggspec>& aggspecs = m_config.get_aggregates();

    // access data for changed rows, but write them into the slice as if we
    // start from 0
    for (t_uindex idx = 0; idx < nrows; ++idx) {
        t_uindex ridx = rows[idx];
        t_index nidx = m_traversal->get_tree_index(ridx);
        t_index pnidx = m_tree->get_parent_idx(nidx);

        t_uindex agg_ridx = m_tree->get_aggidx(nidx);
        t_index agg_pridx =
            pnidx == INVALID_INDEX ? INVALID_INDEX : m_tree->get_aggidx(pnidx);

        t_tscalar tree_value = m_tree->get_value(nidx);
        tmpvalues[idx * ncols] = tree_value;

        for (t_index aggidx = 0, loop_end = aggcols.size(); aggidx < loop_end;
             ++aggidx) {
            t_tscalar value = extract_aggregate(
                aggspecs[aggidx], aggcols[aggidx], agg_ridx, agg_pridx
            );
            if (!value.is_valid()) {
                value.set(none); // todo: fix null handling
            }
            tmpvalues[idx * ncols + 1 + aggidx].set(value);
        }
    }

    for (t_uindex ridx = 0; ridx < nrows; ++ridx) {
        for (t_uindex cidx = 0; cidx < ncols; ++cidx) {
            t_uindex idx = ridx * ncols + cidx;
            values[idx].set(tmpvalues[idx]);
        }
    }

    return values;
}

void
t_ctx1::notify(const t_data_table& flattened) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    notify_sparse_tree(
        m_tree,
        m_traversal,
        true,
        m_config.get_aggregates(),
        m_config.get_sortby_pairs(),
        m_sortby,
        flattened,
        m_config,
        *m_gstate,
        *(m_expression_tables->m_master)
    );
}

void
t_ctx1::notify(
    const t_data_table& flattened,
    const t_data_table& delta,
    const t_data_table& prev,
    const t_data_table& current,
    const t_data_table& transitions,
    const t_data_table& existed
) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    notify_sparse_tree(
        m_tree,
        m_traversal,
        true,
        m_config.get_aggregates(),
        m_config.get_sortby_pairs(),
        m_sortby,
        flattened,
        delta,
        prev,
        current,
        transitions,
        existed,
        m_config,
        *m_gstate,
        *(m_expression_tables->m_master)
    );
}

void
t_ctx1::step_begin() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    reset_step_state();
}

void
t_ctx1::step_end() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    if (m_leaves_only) {
        m_traversal->rebuild_from_leaves(m_sortby);
    } else {
        sort_by(m_sortby);
        if (m_depth_set) {
            set_depth(m_depth);
        }
    }
}

t_aggspec
t_ctx1::get_aggregate(t_uindex idx) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    if (idx >= m_config.get_num_aggregates()) {
        return {};
    }
    return m_config.get_aggregates()[idx];
}

t_tscalar
t_ctx1::get_aggregate_name(t_uindex idx) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_tscalar s;
    if (idx >= m_config.get_num_aggregates()) {
        return s;
    }
    s.set(m_config.get_aggregates()[idx].name_scalar());
    return s;
}

std::vector<t_aggspec>
t_ctx1::get_aggregates() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_config.get_aggregates();
}

std::vector<t_tscalar>
t_ctx1::get_row_path(t_index idx) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    if (idx < 0) {
        return {};
    }
    return ctx_get_path(m_tree, m_traversal, idx);
}

void
t_ctx1::reset_sortby() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_sortby = std::vector<t_sortspec>();
}

void
t_ctx1::sort_by(const std::vector<t_sortspec>& sortby) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_sortby = sortby;
    if (m_sortby.empty()) {
        return;
    }
    m_traversal->sort_by(m_config, sortby, *(m_tree));
}

void
t_ctx1::set_depth(t_depth depth) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    if (m_config.get_num_rpivots() == 0) {
        return;
    }
    depth = std::min<t_depth>(m_config.get_num_rpivots() - 1, depth);
    t_index retval = 0;
    retval = m_traversal->set_depth(m_sortby, depth);
    m_rows_changed = (retval > 0);
    m_depth = depth;
    m_depth_set = true;
}

void
t_ctx1::set_leaves_only(bool enabled) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_leaves_only = enabled;
    m_traversal->set_leaves_only(enabled, m_config.get_num_rpivots());
}

std::vector<t_tscalar>
t_ctx1::get_pkeys(const std::vector<std::pair<t_uindex, t_uindex>>& cells
) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    if (!m_traversal->validate_cells(cells)) {
        std::vector<t_tscalar> rval;
        return rval;
    }

    std::vector<t_tscalar> rval;
    std::vector<t_index> tindices(cells.size());
    for (const auto& c : cells) {
        auto ptidx = m_traversal->get_tree_index(c.first);
        auto pkeys = m_tree->get_pkeys(ptidx);

        rval.insert(std::end(rval), std::begin(pkeys), std::end(pkeys));
    }
    return rval;
}

bool
t_ctx1::get_deltas_enabled() const {
    return m_features[CTX_FEAT_DELTA];
}

void
t_ctx1::set_feature_state(t_ctx_feature feature, bool state) {
    m_features[feature] = state;
}

void
t_ctx1::set_alerts_enabled(bool enabled_state) {
    m_features[CTX_FEAT_ALERT] = enabled_state;
    m_tree->set_alerts_enabled(enabled_state);
}

void
t_ctx1::set_deltas_enabled(bool enabled_state) {
    m_features[CTX_FEAT_DELTA] = enabled_state;
    m_tree->set_deltas_enabled(enabled_state);
}

/**
 * @brief Returns updated cells.
 *
 * @param bidx
 * @param eidx
 * @return t_stepdelta
 */
t_stepdelta
t_ctx1::get_step_delta(t_index bidx, t_index eidx) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    bidx = std::min(bidx, t_index(m_traversal->size()));
    eidx = std::min(eidx, t_index(m_traversal->size()));

    t_stepdelta rval(
        m_rows_changed, m_columns_changed, get_cell_delta(bidx, eidx)
    );
    m_tree->clear_deltas();
    return rval;
}

/**
 * @brief Returns a `t_rowdelta` object containing:
 * - the row indices that have been updated
 * - the data from those updated rows
 *
 * @return t_rowdelta
 */
t_rowdelta
t_ctx1::get_row_delta() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    std::vector<t_uindex> rows = get_rows_changed();
    std::vector<t_tscalar> data = get_data(rows);
    t_rowdelta rval(m_rows_changed, rows.size(), data);
    m_tree->clear_deltas();
    return rval;
}

std::vector<t_uindex>
t_ctx1::get_rows_changed() {
    std::vector<t_uindex> rows;
    const auto& deltas = m_tree->get_deltas();
    auto eidx = t_uindex(m_traversal->size());

    for (t_uindex idx = 0; idx < eidx; ++idx) {
        t_index ptidx = m_traversal->get_tree_index(idx);
        // Retrieve delta from storage and check if the row has been changed
        auto iterators = deltas->get<by_tc_nidx_aggidx>().equal_range(ptidx);
        bool unique_ridx =
            std::find(rows.begin(), rows.end(), idx) == rows.end();
        if ((iterators.first != iterators.second) && unique_ridx) {
            rows.push_back(idx);
        }
    }

    std::sort(rows.begin(), rows.end());
    return rows;
}

std::vector<t_cellupd>
t_ctx1::get_cell_delta(t_index bidx, t_index eidx) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    eidx = std::min(eidx, t_index(m_traversal->size()));
    std::vector<t_cellupd> rval;
    const auto& deltas = m_tree->get_deltas();
    for (t_index idx = bidx; idx < eidx; ++idx) {
        t_index ptidx = m_traversal->get_tree_index(idx);
        auto iterators = deltas->get<by_tc_nidx_aggidx>().equal_range(ptidx);
        for (auto iter = iterators.first; iter != iterators.second; ++iter) {
            rval.emplace_back(
                idx, iter->m_aggidx + 1, iter->m_old_value, iter->m_new_value
            );
        }
    }
    return rval;
}

void
t_ctx1::reset(bool reset_expressions) {
    auto pivots = m_config.get_row_pivots();
    m_tree = std::make_shared<t_stree>(
        pivots, m_config.get_aggregates(), m_schema, m_config
    );
    m_tree->init();
    m_tree->set_deltas_enabled(get_feature_state(CTX_FEAT_DELTA));
    m_traversal = std::make_shared<t_traversal>(m_tree);
    if (m_leaves_only) {
        m_traversal->set_leaves_only(true, m_config.get_num_rpivots());
    }

    if (reset_expressions) {
        m_expression_tables->reset();
    }
}

void
t_ctx1::reset_step_state() {
    m_rows_changed = false;
    m_columns_changed = false;
    if (t_env::log_progress()) {
        std::cout << "t_ctx1.reset_step_state " << repr() << '\n';
    }
}

t_index
t_ctx1::sidedness() const {
    return 1;
}

std::vector<t_stree*>
t_ctx1::get_trees() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    std::vector<t_stree*> rval(1);
    rval[0] = m_tree.get();
    return rval;
}

bool
t_ctx1::has_deltas() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_tree->has_deltas();
}

void
t_ctx1::pprint() const {
    std::cout << "\t" << '\n';
    for (auto idx = 1; idx < get_column_count(); ++idx) {
        std::cout << get_aggregate(idx - 1).agg_str() << ", " << '\n';
    }

    std::vector<const t_column*> aggcols(m_config.get_num_aggregates());
    auto* aggtable = m_tree->get_aggtable();
    t_schema aggschema = aggtable->get_schema();
    auto none = mknone();

    for (t_uindex aggidx = 0, loop_end = aggcols.size(); aggidx < loop_end;
         ++aggidx) {
        const std::string& aggname = aggschema.m_columns[aggidx];
        aggcols[aggidx] = aggtable->get_const_column(aggname).get();
    }

    const std::vector<t_aggspec>& aggspecs = m_config.get_aggregates();

    for (auto ridx = 0; ridx < get_row_count(); ++ridx) {
        t_index nidx = m_traversal->get_tree_index(ridx);
        t_index pnidx = m_tree->get_parent_idx(nidx);

        t_uindex agg_ridx = m_tree->get_aggidx(nidx);
        t_index agg_pridx =
            pnidx == INVALID_INDEX ? INVALID_INDEX : m_tree->get_aggidx(pnidx);

        std::cout << get_row_path(ridx) << " => ";
        for (t_index aggidx = 0, loop_end = aggcols.size(); aggidx < loop_end;
             ++aggidx) {
            t_tscalar value = extract_aggregate(
                aggspecs[aggidx], aggcols[aggidx], agg_ridx, agg_pridx
            );
            if (!value.is_valid()) {
                value.set(none); // todo: fix null handling
            }

            std::cout << value << ", ";
        }

        std::cout << "\n";
    }

    std::cout << "=================" << '\n';
}

t_index
t_ctx1::get_row_idx(const std::vector<t_tscalar>& path) const {
    auto nidx = m_tree->resolve_path(0, path);
    if (nidx == INVALID_INDEX) {
        return nidx;
    }

    return m_traversal->get_traversal_index(nidx);
}

t_dtype
t_ctx1::get_column_dtype(t_uindex idx) const {
    if (idx == 0 || idx >= static_cast<t_uindex>(get_column_count())) {
        return DTYPE_NONE;
    }
    return m_tree->get_aggtable()->get_const_column(idx - 1)->get_dtype();
}

t_depth
t_ctx1::get_trav_depth(t_index idx) const {
    return m_traversal->get_depth(idx);
}

void
t_ctx1::compute_expressions(
    const std::shared_ptr<t_data_table>& master,
    const t_gstate::t_mapping& pkey_map,
    t_expression_vocab& expression_vocab,
    t_regex_mapping& regex_mapping
) {
    // Clear the transitional expression tables on the context so they are
    // ready for the next update.
    m_expression_tables->clear_transitional_tables();

    std::shared_ptr<t_data_table> master_expression_table =
        m_expression_tables->m_master;

    // Set the master table to the right size.
    t_uindex num_rows = master->size();
    master_expression_table->reserve(num_rows);
    master_expression_table->set_size(num_rows);

    const auto& expressions = m_config.get_expressions();
    for (const auto& expr : expressions) {
        // Compute the expressions on the master table.
        expr->compute(
            master,
            pkey_map,
            master_expression_table,
            expression_vocab,
            regex_mapping
        );
    }
}

void
t_ctx1::compute_expressions(
    const std::shared_ptr<t_data_table>& master,
    const t_gstate::t_mapping& pkey_map,
    const std::shared_ptr<t_data_table>& flattened,
    const std::shared_ptr<t_data_table>& delta,
    const std::shared_ptr<t_data_table>& prev,
    const std::shared_ptr<t_data_table>& current,
    const std::shared_ptr<t_data_table>& transitions,
    const std::shared_ptr<t_data_table>& existed,
    t_expression_vocab& expression_vocab,
    t_regex_mapping& regex_mapping
) {
    // Clear the tables so they are ready for this round of updates
    m_expression_tables->clear_transitional_tables();

    // All tables are the same size
    t_uindex flattened_num_rows = flattened->size();
    m_expression_tables->reserve_transitional_table_size(flattened_num_rows);
    m_expression_tables->set_transitional_table_size(flattened_num_rows);

    // Update the master expression table's size
    t_uindex master_num_rows = master->size();
    m_expression_tables->m_master->reserve(master_num_rows);
    m_expression_tables->m_master->set_size(master_num_rows);

    const auto& expressions = m_config.get_expressions();
    for (const auto& expr : expressions) {
        // master: compute based on latest state of the gnode state table
        expr->compute(
            master,
            pkey_map,
            m_expression_tables->m_master,
            expression_vocab,
            regex_mapping
        );

        // flattened: compute based on the latest update dataset
        expr->compute(
            flattened,
            pkey_map,
            m_expression_tables->m_flattened,
            expression_vocab,
            regex_mapping
        );

        // delta: for each numerical column, the numerical delta between the
        // previous value and the current value in the row.
        expr->compute(
            delta,
            pkey_map,
            m_expression_tables->m_delta,
            expression_vocab,
            regex_mapping
        );

        // prev: the values of the updated rows before this update was applied
        expr->compute(
            prev,
            pkey_map,
            m_expression_tables->m_prev,
            expression_vocab,
            regex_mapping
        );

        // current: the current values of the updated rows
        expr->compute(
            current,
            pkey_map,
            m_expression_tables->m_current,
            expression_vocab,
            regex_mapping
        );
    }

    // Calculate the transitions now that the intermediate tables are computed
    m_expression_tables->calculate_transitions(existed);
}

bool
t_ctx1::is_expression_column(const std::string& colname) const {
    const t_schema& schema = m_expression_tables->m_master->get_schema();
    return schema.has_column(colname);
}

t_uindex
t_ctx1::num_expressions() const {
    const auto& expressions = m_config.get_expressions();
    return expressions.size();
}

std::shared_ptr<t_expression_tables>
t_ctx1::get_expression_tables() const {
    return m_expression_tables;
}

std::vector<t_tscalar>
t_ctx1::unity_get_row_data(t_uindex idx) const {
    auto rval = get_data(idx, idx + 1, 0, get_column_count());
    if (rval.empty()) {
        return {};
    }

    return {rval.begin() + 1, rval.end()};
}

std::vector<t_tscalar>
t_ctx1::unity_get_column_data(t_uindex idx) const {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
    return {};
}

std::vector<t_tscalar>
t_ctx1::unity_get_row_path(t_uindex idx) const {
    return get_row_path(idx);
}

std::vector<t_tscalar>
t_ctx1::unity_get_column_path(t_uindex idx) const {
    return {};
}

t_uindex
t_ctx1::unity_get_row_depth(t_uindex ridx) const {
    return m_traversal->get_depth(ridx);
}

t_uindex
t_ctx1::unity_get_column_depth(t_uindex cidx) const {
    return 0;
}

std::string
t_ctx1::unity_get_column_name(t_uindex idx) const {
    return m_config.unity_get_column_name(idx);
}

std::string
t_ctx1::unity_get_column_display_name(t_uindex idx) const {
    return m_config.unity_get_column_display_name(idx);
}

std::vector<std::string>
t_ctx1::unity_get_column_names() const {
    std::vector<std::string> rv;

    for (t_uindex idx = 0, loop_end = unity_get_column_count(); idx < loop_end;
         ++idx) {
        rv.push_back(unity_get_column_name(idx));
    }
    return rv;
}

std::vector<std::string>
t_ctx1::unity_get_column_display_names() const {
    std::vector<std::string> rv;

    for (t_uindex idx = 0, loop_end = unity_get_column_count(); idx < loop_end;
         ++idx) {
        rv.push_back(unity_get_column_display_name(idx));
    }
    return rv;
}

t_uindex
t_ctx1::unity_get_column_count() const {
    return get_column_count() - 1;
}

t_uindex
t_ctx1::unity_get_row_count() const {
    return get_row_count();
}

bool
t_ctx1::unity_get_row_expanded(t_uindex idx) const {
    return m_traversal->get_node_expanded(idx);
}

bool
t_ctx1::unity_get_column_expanded(t_uindex idx) const {
    return false;
}

void
t_ctx1::clear_deltas() {
    m_tree->clear_deltas();
}

void
t_ctx1::unity_init_load_step_end() {}

std::shared_ptr<t_data_table>
t_ctx1::get_table() const {
    auto schema = m_tree->get_aggtable()->get_schema();
    auto pivots = m_config.get_row_pivots();
    auto tbl = std::make_shared<t_data_table>(schema, m_tree->size());
    tbl->init();
    tbl->extend(m_tree->size());

    std::vector<t_column*> aggcols = tbl->get_columns();
    auto n_aggs = aggcols.size();
    std::vector<t_column*> pivcols;

    std::stringstream ss;
    pivcols.reserve(pivots.size());
    for (const auto& c : pivots) {
        pivcols.push_back(
            tbl->add_column(c.colname(), m_schema.get_dtype(c.colname()), true)
        );
    }

    auto idx = 0;
    for (auto nidx : m_tree->dfs()) {
        auto depth = m_tree->get_depth(nidx);
        if (depth > 0) {
            pivcols[depth - 1]->set_scalar(idx, m_tree->get_value(nidx));
        }
        for (t_uindex aggnum = 0; aggnum < n_aggs; ++aggnum) {
            auto aggscalar = m_tree->get_aggregate(nidx, aggnum);
            aggcols[aggnum]->set_scalar(idx, aggscalar);
        }
        ++idx;
    }
    return tbl;
}

} // end namespace perspective
