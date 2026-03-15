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
#include <perspective/get_data_extents.h>
#include <perspective/context_two.h>
#include <perspective/extract_aggregate.h>
#include <perspective/sparse_tree.h>
#include <perspective/tree_context_common.h>

#include <perspective/traversal.h>

#include <utility>

namespace perspective {

t_ctx2::t_ctx2() :
    m_row_depth(0),
    m_row_depth_set(false),
    m_column_depth(0),
    m_column_depth_set(false) {}

t_ctx2::t_ctx2(const t_schema& schema, const t_config& pivot_config) :
    t_ctxbase<t_ctx2>(schema, pivot_config),
    m_row_depth(0),
    m_row_depth_set(false),
    m_column_depth(0),
    m_column_depth_set(false) {}

t_ctx2::~t_ctx2() = default;

t_uindex
t_ctx2::get_num_trees() const {
    return m_config.get_num_rpivots() + 1;
}

std::string
t_ctx2::repr() const {
    std::stringstream ss;
    ss << "t_ctx2<" << this << ">";
    return ss.str();
}

void
t_ctx2::init() {
    m_trees = std::vector<std::shared_ptr<t_stree>>(get_num_trees());

    for (t_uindex treeidx = 0, tree_loop_end = m_trees.size();
         treeidx < tree_loop_end;
         ++treeidx) {
        std::vector<t_pivot> pivots;
        if (treeidx > 0) {
            pivots.insert(
                pivots.end(),
                m_config.get_row_pivots().begin(),
                m_config.get_row_pivots().begin() + treeidx
            );
        }

        pivots.insert(
            pivots.end(),
            m_config.get_column_pivots().begin(),
            m_config.get_column_pivots().end()
        );

        m_trees[treeidx] = std::make_shared<t_stree>(
            pivots, m_config.get_aggregates(), m_schema, m_config
        );

        m_trees[treeidx]->init();
    }

    m_rtraversal = std::make_shared<t_traversal>(rtree());

    m_ctraversal = std::make_shared<t_traversal>(ctree());

    // Each context stores its own expression columns in separate
    // `t_data_table`s so that each context's expressions are isolated
    // and do not affect other contexts when they are calculated.
    const auto& expressions = m_config.get_expressions();
    m_expression_tables = std::make_shared<t_expression_tables>(expressions);

    m_init = true;
}

t_uindex
t_ctx2::num_expressions() const {
    const auto& expressions = m_config.get_expressions();
    return expressions.size();
}

std::shared_ptr<t_expression_tables>
t_ctx2::get_expression_tables() const {
    return m_expression_tables;
}

void
t_ctx2::step_begin() {
    reset_step_state();
}

void
t_ctx2::step_end() {
    if (m_total_only) {
        m_rtraversal->rebuild_for_total();
    } else if (m_leaves_only) {
        m_rtraversal->rebuild_from_leaves(m_sortby);
    } else {
        if (m_row_depth_set) {
            set_depth(HEADER_ROW, m_row_depth);
        }
    }
    if (m_column_depth_set) {
        set_depth(HEADER_COLUMN, m_column_depth);
    }
}

t_index
t_ctx2::get_row_count() const {
    return m_rtraversal->size();
}

t_index
t_ctx2::get_column_count() const {
    return get_num_view_columns();
}

t_index
t_ctx2::open(t_header header, t_index idx) {
    t_index retval;

    if (header == HEADER_ROW) {
        if (!m_rtraversal->is_valid_idx(idx)) {
            return 0;
        }
        m_row_depth_set = false;
        m_row_depth = 0;
        if (m_sortby.empty()) {
            retval = m_rtraversal->expand_node(idx);
        } else {
            retval = m_rtraversal->expand_node(m_sortby, idx);
        }
        m_rows_changed = (retval > 0);
    } else {
        if (!m_ctraversal->is_valid_idx(idx)) {
            return 0;
        }
        retval = m_ctraversal->expand_node(idx);
        m_column_depth_set = false;
        m_column_depth = 0;
        m_columns_changed = (retval > 0);
    }

    return retval;
}

t_index
t_ctx2::close(t_header header, t_index idx) {
    t_index retval;

    switch (header) {
        case HEADER_ROW: {
            if (!m_rtraversal->is_valid_idx(idx)) {
                return 0;
            }
            m_row_depth_set = false;
            m_row_depth = 0;
            retval = m_rtraversal->collapse_node(idx);
            m_rows_changed = (retval > 0);
        } break;
        case HEADER_COLUMN: {
            if (!m_ctraversal->is_valid_idx(idx)) {
                return 0;
            }
            m_column_depth_set = false;
            m_column_depth = 0;
            retval = m_ctraversal->collapse_node(idx);
            m_columns_changed = (retval > 0);
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Invalid header type detected.");
            return INVALID_INDEX;
        } break;
    }
    return retval;
}

t_totals
t_ctx2::get_totals() const {
    return m_config.get_totals();
}

std::vector<t_index>
t_ctx2::get_ctraversal_indices() const {
    switch (m_config.get_totals()) {
        case TOTALS_BEFORE: {
            t_index nelems = m_ctraversal->size();
            PSP_VERBOSE_ASSERT(nelems > 0, "nelems is <= 0");
            std::vector<t_index> rval(nelems);
            for (t_index cidx = 0; cidx < nelems; ++cidx) {
                rval[cidx] = cidx;
            }
            return rval;
        } break;
        case TOTALS_AFTER: {
            std::vector<t_index> col_order;
            m_ctraversal->post_order(0, col_order);
            return col_order;
        } break;
        case TOTALS_HIDDEN: {
            std::vector<t_index> leaves;
            m_ctraversal->get_leaves(leaves);
            std::vector<t_index> rval(leaves.size() + 1);
            rval[0] = 0;
            for (t_uindex idx = 1, loop_end = rval.size(); idx < loop_end;
                 ++idx) {
                rval[idx] = leaves[idx - 1];
            }
            return rval;
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unknown total type");
        }
    }
    return {};
}

std::pair<t_tscalar, t_tscalar>
t_ctx2::get_min_max(const std::string& colname) const {
    t_uindex ctx_nrows = get_row_count();
    t_uindex ctx_ncols = get_column_count();
    auto rval = std::make_pair(mknone(), mknone());
    t_uindex scol =
        m_trees[0]->get_aggtable()->get_schema().get_colidx(colname);
    auto cells_info = resolve_cells(0, ctx_nrows, 0, ctx_ncols);
    auto n_aggs = m_config.get_num_aggregates();
    t_uindex ntrees = m_trees.size();
    std::vector<const t_column*> aggcols(ntrees * n_aggs);
    for (t_uindex treeidx = 0; treeidx < ntrees; ++treeidx) {
        auto* aggtable = m_trees[treeidx]->get_aggtable();
        t_schema aggschema = aggtable->get_schema();
        for (t_uindex aggidx = 0; aggidx < t_uindex(n_aggs); ++aggidx) {
            const std::string& aggname = aggschema.m_columns[aggidx];
            aggcols[treeidx * n_aggs + aggidx] =
                aggtable->_get_const_column(aggname);
        }
    }

    const std::vector<t_aggspec>& aggspecs = m_config.get_aggregates();
    bool is_finished = false;
    t_uindex row_depth = m_row_depth + 1;
    while (!is_finished && row_depth > 0) {
        for (const auto& cinfo : cells_info) {
            if (cinfo.m_idx < 0 || cinfo.m_agg_index != scol) {
                continue;
            }
            t_index nidx = m_rtraversal->get_tree_index(cinfo.m_ridx);
            if (rtree()->get_depth(nidx) != row_depth) {
                continue;
            }

            auto col_depth = ctree()->get_depth(m_ctraversal->get_tree_index(
                calc_translated_colidx(n_aggs, cinfo.m_cidx)
            ));
            if (m_config.get_num_cpivots() != col_depth) {
                continue;
            }

            const auto* aggcol =
                aggcols[cinfo.m_treenum * n_aggs + cinfo.m_agg_index];
            t_index p_idx =
                m_trees[cinfo.m_treenum]->get_parent_idx(cinfo.m_idx);
            t_uindex agg_ridx =
                m_trees[cinfo.m_treenum]->get_aggidx(cinfo.m_idx);
            t_uindex agg_pridx = p_idx == INVALID_INDEX
                ? INVALID_INDEX
                : m_trees[cinfo.m_treenum]->get_aggidx(p_idx);

            auto val = extract_aggregate(
                aggspecs[cinfo.m_agg_index], aggcol, agg_ridx, agg_pridx
            );

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

        row_depth--;
    }

    return rval;
}

std::vector<t_tscalar>
t_ctx2::get_data(
    t_index start_row, t_index end_row, t_index start_col, t_index end_col
) const {
    t_uindex ctx_nrows = get_row_count();
    t_uindex ctx_ncols = get_column_count();
    auto ext = sanitize_get_data_extents(
        ctx_nrows, ctx_ncols, start_row, end_row, start_col, end_col
    );

    auto cells_info = resolve_cells(ext.m_srow, ext.m_erow, ext.m_scol, ext.m_ecol);

    t_index nrows = ext.m_erow - ext.m_srow;
    t_index stride = ext.m_ecol - ext.m_scol;
    std::vector<t_tscalar> retval(nrows * stride);

    t_tscalar empty = mknone();

    t_uindex ntrees = m_trees.size();
    t_uindex naggs = m_config.get_num_aggregates();
    std::vector<const t_column*> aggcols(ntrees * naggs);

    for (t_uindex treeidx = 0; treeidx < ntrees; ++treeidx) {
        auto* aggtable = m_trees[treeidx]->get_aggtable();
        t_schema aggschema = aggtable->get_schema();

        for (t_uindex aggidx = 0; aggidx < naggs; ++aggidx) {
            const std::string& aggname = aggschema.m_columns[aggidx];
            aggcols[treeidx * naggs + aggidx] =
                aggtable->_get_const_column(aggname);
        }
    }

    const std::vector<t_aggspec>& aggspecs = m_config.get_aggregates();

    for (t_index ridx = ext.m_srow; ridx < ext.m_erow; ++ridx) {
        if (ext.m_scol == 0) {
            retval[(ridx - ext.m_srow) * stride].set(
                rtree()->get_value(m_rtraversal->get_tree_index(ridx))
            );
        }

        for (t_index cidx = std::max(ext.m_scol, t_index(1)); cidx < ext.m_ecol;
             ++cidx) {
            t_index insert_idx =
                (ridx - ext.m_srow) * stride + (cidx - ext.m_scol);
            const t_cellinfo& cinfo = cells_info[insert_idx];

            if (cinfo.m_idx < 0) {
                retval[insert_idx].set(empty);
            } else {
                const auto* aggcol =
                    aggcols[cinfo.m_treenum * naggs + cinfo.m_agg_index];

                t_index p_idx =
                    m_trees[cinfo.m_treenum]->get_parent_idx(cinfo.m_idx);

                t_uindex agg_ridx =
                    m_trees[cinfo.m_treenum]->get_aggidx(cinfo.m_idx);

                t_uindex agg_pridx = p_idx == INVALID_INDEX
                    ? INVALID_INDEX
                    : m_trees[cinfo.m_treenum]->get_aggidx(p_idx);

                auto value = extract_aggregate(
                    aggspecs[cinfo.m_agg_index], aggcol, agg_ridx, agg_pridx
                );

                if (!value.is_valid()) {
                    value.set(empty);
                }

                retval[insert_idx].set(value);
            }
        }
    }

    return retval;
}

std::vector<t_tscalar>
t_ctx2::get_data(const std::vector<t_uindex>& rows) const {
    t_uindex nrows = rows.size();
    t_uindex start_col = 0;
    t_uindex end_col = get_column_count();

    // Perspective generates extra headers for columns in the sort, which
    // needs to be skipped when generating row deltas.
    bool should_skip_column_headers = !m_sortby.empty() && start_col < end_col;

    if (should_skip_column_headers) {
        auto depth = m_config.get_num_cpivots();

        // find the first column that isn't a generated sort header, i.e.
        // its column path has to be the same as the number of column pivots.
        for (t_uindex i = 0; i < end_col; ++i) {
            if (unity_get_column_path(i + 1).size() == depth) {
                start_col = i;
                break;
            }
        }
    }

    t_uindex ncols = end_col - start_col;

    // Get data out of the context at the specified row and column indices
    std::vector<std::pair<t_uindex, t_uindex>> cells;
    for (t_uindex idx = 0; idx < nrows; ++idx) {
        t_uindex ridx = rows[idx];
        for (t_uindex cidx = start_col; cidx < end_col; ++cidx) {
            cells.emplace_back(std::pair<t_index, t_index>(ridx, cidx));
        }
    }

    auto cells_info = resolve_cells(cells);
    std::vector<t_tscalar> rval(nrows * ncols);

    t_tscalar empty = mknone();

    t_uindex ntrees = m_trees.size();
    t_uindex naggs = m_config.get_num_aggregates();
    std::vector<const t_column*> aggcols(ntrees * naggs);

    for (t_uindex treeidx = 0; treeidx < ntrees; ++treeidx) {
        auto* aggtable = m_trees[treeidx]->get_aggtable();
        t_schema aggschema = aggtable->get_schema();

        for (t_uindex aggidx = 0; aggidx < naggs; ++aggidx) {
            const std::string& aggname = aggschema.m_columns[aggidx];
            aggcols[treeidx * naggs + aggidx] =
                aggtable->_get_const_column(aggname);
        }
    }

    const std::vector<t_aggspec>& aggspecs = m_config.get_aggregates();

    for (t_uindex ridx = 0; ridx < nrows; ++ridx) {
        for (t_uindex cidx = 1; cidx < ncols; ++cidx) {
            t_uindex insert_idx = ridx * ncols + cidx;
            const t_cellinfo& cinfo = cells_info[insert_idx];

            if (cinfo.m_idx < 0) {
                rval[insert_idx].set(empty);
            } else {
                const auto* aggcol =
                    aggcols[cinfo.m_treenum * naggs + cinfo.m_agg_index];

                t_index p_idx =
                    m_trees[cinfo.m_treenum]->get_parent_idx(cinfo.m_idx);

                t_index agg_ridx =
                    m_trees[cinfo.m_treenum]->get_aggidx(cinfo.m_idx);

                t_index agg_pridx = p_idx == INVALID_INDEX
                    ? INVALID_INDEX
                    : m_trees[cinfo.m_treenum]->get_aggidx(p_idx);

                auto value = extract_aggregate(
                    aggspecs[cinfo.m_agg_index], aggcol, agg_ridx, agg_pridx
                );

                if (!value.is_valid()) {
                    value.set(empty);
                }

                rval[insert_idx].set(value);
            }
        }
    }

    return rval;
}

void
t_ctx2::column_sort_by(const std::vector<t_sortspec>& sortby) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_column_sortby = sortby;
    m_ctraversal->sort_by(m_config, sortby, *(ctree()));
}

void
t_ctx2::sort_by(const std::vector<t_sortspec>& sortby) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_sortby = sortby;
    if (m_sortby.empty()) {
        return;
    }
    m_rtraversal->sort_by(m_config, sortby, *(rtree()), this);
}

void
t_ctx2::reset_sortby() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_sortby = std::vector<t_sortspec>();
}

void
t_ctx2::notify(const t_data_table& flattened) {
    for (t_uindex tree_idx = 0, loop_end = m_trees.size(); tree_idx < loop_end;
         ++tree_idx) {
        if (is_rtree_idx(tree_idx) != 0U) {
            notify_sparse_tree(
                rtree(),
                m_rtraversal,
                true,
                m_config.get_aggregates(),
                m_config.get_sortby_pairs(),
                m_sortby,
                flattened,
                m_config,
                *m_gstate,
                *(m_expression_tables->m_master)
            );
        } else if (is_ctree_idx(tree_idx) != 0U) {
            notify_sparse_tree(
                ctree(),
                m_ctraversal,
                true,
                m_config.get_aggregates(),
                m_config.get_sortby_pairs(),
                m_column_sortby,
                flattened,
                m_config,
                *m_gstate,
                *(m_expression_tables->m_master)
            );
        } else {
            notify_sparse_tree(
                m_trees[tree_idx],
                std::shared_ptr<t_traversal>(nullptr),
                false,
                m_config.get_aggregates(),
                m_config.get_sortby_pairs(),
                std::vector<t_sortspec>(),
                flattened,
                m_config,
                *m_gstate,
                *(m_expression_tables->m_master)
            );
        }
    }
    if (!m_sortby.empty()) {
        sort_by(m_sortby);
    }

    if (!m_column_sortby.empty()) {
        column_sort_by(m_column_sortby);
    }
}

void
t_ctx2::notify(
    const t_data_table& flattened,
    const t_data_table& delta,
    const t_data_table& prev,
    const t_data_table& current,
    const t_data_table& transitions,
    const t_data_table& existed
) {

    for (t_uindex tree_idx = 0, loop_end = m_trees.size(); tree_idx < loop_end;
         ++tree_idx) {
        if (is_rtree_idx(tree_idx) != 0U) {
            notify_sparse_tree(
                rtree(),
                m_rtraversal,
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
        } else if (is_ctree_idx(tree_idx) != 0U) {
            notify_sparse_tree(
                ctree(),
                m_ctraversal,
                true,
                m_config.get_aggregates(),
                m_config.get_sortby_pairs(),
                m_column_sortby,
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
        } else {
            notify_sparse_tree(
                m_trees[tree_idx],
                std::shared_ptr<t_traversal>(nullptr),
                false,
                m_config.get_aggregates(),
                m_config.get_sortby_pairs(),
                std::vector<t_sortspec>(),
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
    }

    if (!m_sortby.empty()) {
        sort_by(m_sortby);
    }

    if (!m_column_sortby.empty()) {
        column_sort_by(m_column_sortby);
    }
}

t_uindex
t_ctx2::calc_translated_colidx(t_uindex n_aggs, t_uindex cidx) const {
    switch (m_config.get_totals()) {
        case TOTALS_BEFORE: {
            return (cidx - 1) / n_aggs;
        } break;
        case TOTALS_AFTER: {
            return (cidx - 1) / n_aggs;
        } break;
        case TOTALS_HIDDEN: {
            return (cidx - 1) / n_aggs + 1;
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unknown totals type encountered.");
            return -1;
        }
    }
}

std::vector<t_cellinfo>
t_ctx2::resolve_cells(const std::vector<std::pair<t_uindex, t_uindex>>& cells
) const {
    std::vector<t_cellinfo> rval(cells.size());

    t_index n_aggs = m_config.get_num_aggregates();
    std::vector<t_index> c_tvindices = get_ctraversal_indices();

    std::vector<std::vector<t_tscalar>> col_paths(m_ctraversal->size());

    for (t_index cidx = 0, loop_end = c_tvindices.size(); cidx < loop_end;
         ++cidx) {
        auto translated = c_tvindices[cidx];
        const t_tvnode& c_tvnode = m_ctraversal->get_node(translated);
        col_paths[cidx].reserve(m_config.get_num_cpivots());
        col_paths[cidx] = get_column_path(c_tvnode);
    }

    t_uindex ncols = get_num_view_columns();

    for (t_index idx = 0, loop_end = cells.size(); idx < loop_end; ++idx) {
        const auto& cell = cells[idx];

        if (cell.first >= m_rtraversal->size() || cell.second == 0
            || cell.second >= ncols) {
            rval[idx].m_idx = INVALID_INDEX;
            continue;
        }

        const t_tvnode& r_tvnode = m_rtraversal->get_node(cell.first);

        t_index r_ptidx = r_tvnode.m_tnid;
        t_depth r_depth = r_tvnode.m_depth;
        std::vector<t_tscalar> r_path = get_row_path(r_tvnode);
        t_index agg_idx = (cell.second - 1) % n_aggs;
        t_uindex translated_cidx = calc_translated_colidx(n_aggs, cell.second);
        if (translated_cidx >= c_tvindices.size()) {
            rval[idx].m_idx = INVALID_INDEX;
            continue;
        }

        t_index c_tvidx = c_tvindices[translated_cidx];

        rval[idx].m_ridx = cell.first;
        rval[idx].m_cidx = cell.second;

        if (c_tvidx >= t_index(m_ctraversal->size())) {
            rval[idx].m_idx = INVALID_INDEX;
            continue;
        }

        const t_tvnode& c_tvnode = m_ctraversal->get_node(c_tvidx);
        t_index c_ptidx = c_tvnode.m_tnid;
        const std::vector<t_tscalar>& c_path = col_paths[translated_cidx];

        rval[idx].m_agg_index = agg_idx;

        if (cell.first == 0 && !m_leaves_only) {
            rval[idx].m_idx = c_ptidx;
            rval[idx].m_treenum = 0;
        } else if (c_path.empty()) {
            rval[idx].m_idx = r_ptidx;
            rval[idx].m_treenum = m_trees.size() - 1;
        } else {
            t_index tree_idx = r_depth;
            rval[idx].m_treenum = tree_idx;

            if (r_depth + 1 == static_cast<t_depth>(m_trees.size())) {
                rval[idx].m_idx =
                    m_trees[tree_idx]->resolve_path(r_ptidx, c_path);
            } else {
                t_index path_ptidx = m_trees[tree_idx]->resolve_path(0, r_path);
                if (path_ptidx < 0) {
                    rval[idx].m_idx = INVALID_INDEX;
                } else {
                    rval[idx].m_idx =
                        m_trees[tree_idx]->resolve_path(path_ptidx, c_path);
                }
            }
        }
    }

    return rval;
}

std::vector<t_cellinfo>
t_ctx2::resolve_cells(
    t_uindex srow, t_uindex erow, t_uindex scol, t_uindex ecol
) const {
    t_uindex nrows = erow - srow;
    t_uindex ncols_range = ecol - scol;
    std::vector<t_cellinfo> rval(nrows * ncols_range);

    t_index n_aggs = m_config.get_num_aggregates();
    std::vector<t_index> c_tvindices = get_ctraversal_indices();

    std::vector<std::vector<t_tscalar>> col_paths(m_ctraversal->size());

    for (t_index cidx = 0, loop_end = c_tvindices.size(); cidx < loop_end;
         ++cidx) {
        auto translated = c_tvindices[cidx];
        const t_tvnode& c_tvnode = m_ctraversal->get_node(translated);
        col_paths[cidx].reserve(m_config.get_num_cpivots());
        col_paths[cidx] = get_column_path(c_tvnode);
    }

    t_uindex view_ncols = get_num_view_columns();

    for (t_uindex ridx = srow; ridx < erow; ++ridx) {
        bool row_valid = ridx < m_rtraversal->size();
        t_index r_ptidx = 0;
        t_depth r_depth = 0;
        std::vector<t_tscalar> r_path;
        if (row_valid) {
            const t_tvnode& r_tvnode = m_rtraversal->get_node(ridx);
            r_ptidx = r_tvnode.m_tnid;
            r_depth = r_tvnode.m_depth;
            r_path = get_row_path(r_tvnode);
        }

        for (t_uindex cidx = scol; cidx < ecol; ++cidx) {
            t_uindex out_idx = (ridx - srow) * ncols_range + (cidx - scol);

            if (!row_valid || cidx == 0 || cidx >= view_ncols) {
                rval[out_idx].m_idx = INVALID_INDEX;
                continue;
            }

            t_index agg_idx = (cidx - 1) % n_aggs;
            t_uindex translated_cidx = calc_translated_colidx(n_aggs, cidx);
            if (translated_cidx >= c_tvindices.size()) {
                rval[out_idx].m_idx = INVALID_INDEX;
                continue;
            }

            t_index c_tvidx = c_tvindices[translated_cidx];

            rval[out_idx].m_ridx = ridx;
            rval[out_idx].m_cidx = cidx;

            if (c_tvidx >= t_index(m_ctraversal->size())) {
                rval[out_idx].m_idx = INVALID_INDEX;
                continue;
            }

            const t_tvnode& c_tvnode = m_ctraversal->get_node(c_tvidx);
            t_index c_ptidx = c_tvnode.m_tnid;
            const std::vector<t_tscalar>& c_path = col_paths[translated_cidx];

            rval[out_idx].m_agg_index = agg_idx;

            if (ridx == 0 && !m_leaves_only) {
                rval[out_idx].m_idx = c_ptidx;
                rval[out_idx].m_treenum = 0;
            } else if (c_path.empty()) {
                rval[out_idx].m_idx = r_ptidx;
                rval[out_idx].m_treenum = m_trees.size() - 1;
            } else {
                t_index tree_idx = r_depth;
                rval[out_idx].m_treenum = tree_idx;

                if (r_depth + 1 == static_cast<t_depth>(m_trees.size())) {
                    rval[out_idx].m_idx =
                        m_trees[tree_idx]->resolve_path(r_ptidx, c_path);
                } else {
                    t_index path_ptidx =
                        m_trees[tree_idx]->resolve_path(0, r_path);
                    if (path_ptidx < 0) {
                        rval[out_idx].m_idx = INVALID_INDEX;
                    } else {
                        rval[out_idx].m_idx =
                            m_trees[tree_idx]->resolve_path(path_ptidx, c_path);
                    }
                }
            }
        }
    }

    return rval;
}

t_index
t_ctx2::sidedness() const {
    return 2;
}

t_uindex
t_ctx2::is_rtree_idx(t_uindex idx) const {
    return static_cast<t_uindex>(idx == m_trees.size() - 1);
}

t_uindex
t_ctx2::is_ctree_idx(t_uindex idx) const {
    return static_cast<t_uindex>(idx == 0);
}

std::shared_ptr<t_stree>
t_ctx2::rtree() {
    return m_trees.back();
}

std::shared_ptr<const t_stree>
t_ctx2::rtree() const {
    return m_trees.back();
}

std::shared_ptr<t_stree>
t_ctx2::ctree() {
    return m_trees.front();
}

std::shared_ptr<const t_stree>
t_ctx2::ctree() const {
    return m_trees.front();
}

t_uindex
t_ctx2::get_num_view_columns() const {
    switch (m_config.get_totals()) {
        case TOTALS_AFTER:
        case TOTALS_BEFORE: {
            return m_ctraversal->size() * m_config.get_num_aggregates() + 1;
        } break;
        case TOTALS_HIDDEN: {
            t_index nitems =
                (m_ctraversal->size() - 1) * m_config.get_num_aggregates();
            return nitems + 1;
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unknown totals type");
            return -1;
        }
    }
    PSP_COMPLAIN_AND_ABORT("Not implemented");
    return 0;
}

std::vector<t_tscalar>
t_ctx2::get_row_path(t_index idx) const {
    if (idx < 0) {
        return {};
    }
    return ctx_get_path(rtree(), m_rtraversal, idx);
}

std::vector<t_tscalar>
t_ctx2::get_row_path(const t_tvnode& node) const {
    std::vector<t_tscalar> rval;
    m_trees.back()->get_path(node.m_tnid, rval);
    return rval;
}

std::vector<t_tscalar>
t_ctx2::get_column_path(t_index idx) const {
    if (idx < 0) {
        return {};
    }
    return ctx_get_path(ctree(), m_ctraversal, idx);
}

std::vector<t_tscalar>
t_ctx2::get_column_path(const t_tvnode& node) const {
    std::vector<t_tscalar> rval;
    m_trees[0]->get_path(node.m_tnid, rval);
    return rval;
}

std::vector<t_tscalar>
t_ctx2::get_column_path_userspace(t_index idx) const {
    t_index translated_idx = translate_column_index(idx);
    if (translated_idx == INVALID_INDEX) {
        return {};
    }
    return get_column_path(translated_idx);
}

t_index
t_ctx2::translate_column_index(t_index idx) const {
    t_index rval = INVALID_INDEX;

    switch (m_config.get_totals()) {
        case TOTALS_BEFORE: {
            rval = (idx - 1) / m_config.get_num_aggregates();
        } break;
        case TOTALS_AFTER: {
            std::vector<t_index> col_order;
            m_ctraversal->post_order(0, col_order);
            rval = col_order[(idx - 1) / m_config.get_num_aggregates()];
        } break;
        case TOTALS_HIDDEN: {
            std::vector<t_index> leaves;
            m_ctraversal->get_leaves(leaves);
            rval = leaves[(idx - 1) / m_config.get_num_aggregates()];
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unknown totals type encountered.");
        }
    }

    return rval;
}

std::vector<t_aggspec>
t_ctx2::get_aggregates() const {
    return m_config.get_aggregates();
}

t_tscalar
t_ctx2::get_aggregate_name(t_uindex idx) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_tscalar s;
    if (idx >= m_config.get_num_aggregates()) {
        return s;
    }
    s.set(m_config.get_aggregates()[idx].name_scalar());
    return s;
}

void
t_ctx2::set_depth(t_header header, t_depth depth) {
    t_depth new_depth;

    switch (header) {
        case HEADER_ROW: {
            if (m_config.get_num_rpivots() == 0) {
                return;
            }
            new_depth =
                std::min<t_depth>(m_config.get_num_rpivots() - 1, depth);
            m_rtraversal->set_depth(m_sortby, new_depth);
            m_row_depth = new_depth;
            m_row_depth_set = true;
        } break;
        case HEADER_COLUMN: {
            if (m_config.get_num_cpivots() == 0) {
                return;
            }
            new_depth =
                std::min<t_depth>(m_config.get_num_cpivots() - 1, depth);
            m_ctraversal->set_depth(m_column_sortby, new_depth);
            m_column_depth = new_depth;
            m_column_depth_set = true;
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Invalid header");
        } break;
    }
}

void
t_ctx2::set_leaves_only(bool enabled) {
    m_leaves_only = enabled;
    m_rtraversal->set_leaves_only(enabled, m_config.get_num_rpivots());
}

void
t_ctx2::set_total_only(bool enabled) {
    m_total_only = enabled;
    m_rtraversal->set_total_only(enabled);
}

std::vector<t_tscalar>
t_ctx2::get_pkeys(const std::vector<std::pair<t_uindex, t_uindex>>& cells
) const {
    tsl::hopscotch_set<t_tscalar> all_pkeys;

    auto tree_info = resolve_cells(cells);
    for (const auto& cinfo : tree_info) {

        if (cinfo.m_idx != INVALID_INDEX) {
            auto node_pkeys = m_trees[cinfo.m_treenum]->get_pkeys(cinfo.m_idx);
            std::copy(
                node_pkeys.begin(),
                node_pkeys.end(),
                std::inserter(all_pkeys, all_pkeys.end())
            );
        }
    }

    std::vector<t_tscalar> rval(all_pkeys.size());
    std::copy(all_pkeys.begin(), all_pkeys.end(), rval.begin());
    return rval;
}

/**
 * @brief Returns updated cells.
 *
 * @param bidx
 * @param eidx
 * @return t_stepdelta
 */
t_stepdelta
t_ctx2::get_step_delta(t_index bidx, t_index eidx) {
    t_uindex start_row = bidx;
    t_uindex end_row = eidx;
    t_uindex start_col = 1;
    t_uindex end_col = get_num_view_columns();
    t_stepdelta rval;
    rval.rows_changed = true;
    rval.columns_changed = true;
    std::vector<t_cellupd>& updvec = rval.cells;

    t_uindex ctx_nrows = get_row_count();
    t_uindex ctx_ncols = get_column_count();
    auto ext = sanitize_get_data_extents(
        ctx_nrows, ctx_ncols, start_row, end_row, start_col, end_col
    );

    std::vector<std::pair<t_uindex, t_uindex>> cells;

    for (t_index ridx = ext.m_srow; ridx < ext.m_erow; ++ridx) {
        for (t_uindex cidx = 1; cidx < end_col; ++cidx) {
            cells.emplace_back(std::pair<t_index, t_index>(ridx, cidx));
        }
    }

    auto cells_info = resolve_cells(cells);

    for (const auto& c : cells_info) {
        if (c.m_idx < 0) {
            continue;
        }

        const auto& deltas = m_trees[c.m_treenum]->get_deltas();

        auto iterators = deltas->get<by_tc_nidx_aggidx>().equal_range(c.m_idx);

        for (auto iter = iterators.first; iter != iterators.second; ++iter) {
            updvec.emplace_back(
                c.m_ridx, c.m_cidx, iter->m_old_value, iter->m_new_value
            );
        }
    }

    clear_deltas();
    return rval;
}

/**
 * @brief Returns the row indices that have been updated with new data.
 *
 * @return t_rowdelta
 */
t_rowdelta
t_ctx2::get_row_delta() {
    std::vector<t_uindex> rows = get_rows_changed();
    std::vector<t_tscalar> data = get_data(rows);
    t_rowdelta rval(true, rows.size(), data);
    clear_deltas();
    return rval;
}

std::vector<t_uindex>
t_ctx2::get_rows_changed() {
    t_uindex nrows = get_row_count();
    t_uindex ncols = get_num_view_columns();
    std::vector<t_uindex> rows;
    std::vector<std::pair<t_uindex, t_uindex>> cells;

    // get cells and imbue with additional information
    for (t_uindex ridx = 0; ridx < nrows; ++ridx) {
        for (t_uindex cidx = 1; cidx < ncols; ++cidx) {
            cells.emplace_back(ridx, cidx);
        }
    }

    auto cells_info = resolve_cells(cells);

    for (const auto& c : cells_info) {
        if (c.m_idx < 0) {
            continue;
        }
        const auto& deltas = m_trees[c.m_treenum]->get_deltas();
        auto iterators = deltas->get<by_tc_nidx_aggidx>().equal_range(c.m_idx);
        auto ridx = c.m_ridx;
        bool unique_ridx =
            std::find(rows.begin(), rows.end(), ridx) == rows.end();
        if ((iterators.first != iterators.second) && unique_ridx) {
            rows.push_back(ridx);
        }
    }

    std::sort(rows.begin(), rows.end());
    return rows;
}

void
t_ctx2::reset(bool reset_expressions) {
    for (t_uindex treeidx = 0, tree_loop_end = m_trees.size();
         treeidx < tree_loop_end;
         ++treeidx) {
        std::vector<t_pivot> pivots;
        if (treeidx > 0) {
            pivots.insert(
                pivots.end(),
                m_config.get_row_pivots().begin(),
                m_config.get_row_pivots().begin() + treeidx
            );
        }

        pivots.insert(
            pivots.end(),
            m_config.get_column_pivots().begin(),
            m_config.get_column_pivots().end()
        );

        m_trees[treeidx] = std::make_shared<t_stree>(
            pivots, m_config.get_aggregates(), m_schema, m_config
        );
        m_trees[treeidx]->init();
        m_trees[treeidx]->set_deltas_enabled(get_feature_state(CTX_FEAT_DELTA));
    }

    m_rtraversal = std::make_shared<t_traversal>(rtree());
    m_ctraversal = std::make_shared<t_traversal>(ctree());
    if (m_leaves_only) {
        m_rtraversal->set_leaves_only(true, m_config.get_num_rpivots());
    }

    if (reset_expressions) {
        m_expression_tables->reset();
    }
}

bool
t_ctx2::get_deltas_enabled() const {
    return m_features[CTX_FEAT_DELTA];
}

void
t_ctx2::reset_step_state() {
    m_rows_changed = false;
    m_columns_changed = false;
}

void
t_ctx2::clear_deltas() {
    for (auto& tr : m_trees) {
        tr->clear_deltas();
    }
}

void
t_ctx2::set_feature_state(t_ctx_feature feature, bool state) {
    m_features[feature] = state;
}

void
t_ctx2::set_alerts_enabled(bool enabled_state) {
    m_features[CTX_FEAT_ALERT] = enabled_state;
    for (auto& tr : m_trees) {
        tr->set_alerts_enabled(enabled_state);
    }
}

void
t_ctx2::set_deltas_enabled(bool enabled_state) {
    m_features[CTX_FEAT_DELTA] = enabled_state;
    for (auto& tr : m_trees) {
        tr->set_deltas_enabled(enabled_state);
    }
}

std::vector<t_stree*>
t_ctx2::get_trees() {
    std::vector<t_stree*> rval(m_trees.size());
    t_uindex count = 0;
    for (auto& t : m_trees) {
        rval[count] = t.get();
        ++count;
    }
    return rval;
}

bool
t_ctx2::has_deltas() const {
    bool has_deltas = false;
    for (const auto& m_tree : m_trees) {
        has_deltas = has_deltas || m_tree->has_deltas();
    }
    return has_deltas;
}

void
t_ctx2::pprint() const {}

t_dtype
t_ctx2::get_column_dtype(t_uindex idx) const {
    t_uindex naggs = m_config.get_num_aggregates();

    if (idx == 0) {
        return DTYPE_NONE;
    }

    return rtree()
        ->get_aggtable()
        ->get_const_column((idx - 1) % naggs)
        ->get_dtype();
}

void
t_ctx2::compute_expressions(
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
t_ctx2::compute_expressions(
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
t_ctx2::is_expression_column(const std::string& colname) const {
    const t_schema& schema = m_expression_tables->m_master->get_schema();
    return schema.has_column(colname);
}

std::vector<t_tscalar>
t_ctx2::unity_get_row_data(t_uindex idx) const {
    auto rval = get_data(idx, idx + 1, 0, get_column_count());
    if (rval.empty()) {
        return {};
    }

    return {rval.begin() + 1, rval.end()};
}

std::vector<t_tscalar>
t_ctx2::unity_get_column_data(t_uindex idx) const {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
    return {};
}

std::vector<t_tscalar>
t_ctx2::unity_get_row_path(t_uindex idx) const {
    return get_row_path(idx);
}

std::vector<t_tscalar>
t_ctx2::unity_get_column_path(t_uindex idx) const {
    auto rv = get_column_path_userspace(idx);
    return rv;
}

t_uindex
t_ctx2::unity_get_row_depth(t_uindex idx) const {
    return get_row_path(idx).size();
}

t_uindex
t_ctx2::unity_get_column_depth(t_uindex idx) const {
    return get_column_path(idx).size();
}

std::string
t_ctx2::unity_get_column_name(t_uindex idx) const {
    return m_config.unity_get_column_name(idx);
}

std::string
t_ctx2::unity_get_column_display_name(t_uindex idx) const {
    return m_config.unity_get_column_display_name(idx);
}

std::vector<std::string>
t_ctx2::unity_get_column_names() const {
    std::vector<std::string> rv;

    for (t_uindex idx = 0, loop_end = unity_get_column_count(); idx < loop_end;
         ++idx) {
        rv.push_back(unity_get_column_name(idx));
    }
    return rv;
}

std::vector<std::string>
t_ctx2::unity_get_column_display_names() const {
    std::vector<std::string> rv;

    for (t_uindex idx = 0, loop_end = unity_get_column_count(); idx < loop_end;
         ++idx) {
        rv.push_back(unity_get_column_display_name(idx));
    }
    return rv;
}

t_uindex
t_ctx2::unity_get_column_count() const {
    if (m_config.get_totals() != TOTALS_HIDDEN) {
        return get_column_count() - 1;
    }
    std::vector<t_index> leaves;
    m_ctraversal->get_leaves(leaves);
    return leaves.size() * m_config.get_num_aggregates();
}

t_uindex
t_ctx2::unity_get_row_count() const {
    return get_row_count();
}

bool
t_ctx2::unity_get_row_expanded(t_uindex idx) const {
    return m_rtraversal->get_node_expanded(idx);
}

bool
t_ctx2::unity_get_column_expanded(t_uindex idx) const {

    return m_ctraversal->get_node_expanded(
        calc_translated_colidx(idx, m_config.get_num_aggregates())
    );
}

void
t_ctx2::unity_init_load_step_end() {}

} // end namespace perspective
