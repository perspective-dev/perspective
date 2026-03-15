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
#include <perspective/dense_tree.h>
#include <perspective/filter.h>
#include <perspective/node_processor.h>
#include <perspective/comparators.h>
#include <perspective/sort_specification.h>
#include <perspective/data_table.h>

#include <numeric>
#include <utility>

namespace perspective {

t_dtree::t_dtree(
    t_dssptr ds,
    const std::vector<t_pivot>& pivots,
    const std::vector<std::pair<std::string, std::string>>& sortby_colvec
) :
    m_levels_pivoted(0),
    m_ds(std::move(ds)),
    m_pivots(pivots),
    m_nidx(0),
    m_backing_store(BACKING_STORE_MEMORY),
    m_init(false),
    m_sortby_colvec(sortby_colvec) {}

t_uindex
t_dtree::size() const {
    return m_nodes.size();
}

std::pair<t_index, t_index>
t_dtree::get_level_markers(t_uindex idx) const {
    PSP_VERBOSE_ASSERT(idx < m_levels.size(), "Unexpected lvlidx");
    return m_levels[idx];
}

t_dtree::t_dtree(
    std::string dirname,
    t_dssptr ds,
    const std::vector<t_pivot>& pivots,
    t_backing_store backing_store,
    const std::vector<std::pair<std::string, std::string>>& sortby_colvec
) :
    m_dirname(std::move(dirname)),
    m_levels_pivoted(0),
    m_ds(std::move(ds)),
    m_pivots(pivots),
    m_nidx(0),
    m_backing_store(backing_store),
    m_init(false),
    m_sortby_colvec(sortby_colvec) {}

void
t_dtree::init() {
    t_lstore_recipe leaf_args(
        m_dirname, leaves_colname(), DEFAULT_CAPACITY, m_backing_store
    );
    m_leaves = t_column(DTYPE_UINT64, false, leaf_args, DEFAULT_CAPACITY);
    m_leaves.init();

    t_lstore_recipe node_args(
        m_dirname, nodes_colname(), DEFAULT_CAPACITY, m_backing_store
    );

    m_values = std::vector<t_column>(m_pivots.size() + 1);

    m_has_sortby = std::vector<bool>(m_values.size());
    m_has_sortby[0] = false;

    m_sortby_columns.clear();
    for (auto& sidx : m_sortby_colvec) {
        m_sortby_columns[sidx.first] = sidx.second;
    }

    t_lstore_recipe root_args(
        m_dirname, values_colname("_root_"), DEFAULT_CAPACITY, m_backing_store
    );

    m_values[0] = t_column(DTYPE_STR, true, leaf_args, DEFAULT_CAPACITY);
    m_values[0].init();

    m_sortby_dpthcol.emplace_back("");

    for (t_uindex idx = 0, loop_end = m_pivots.size(); idx < loop_end; ++idx) {
        auto colname = m_pivots[idx].colname();
        t_lstore_recipe leaf_args(
            m_dirname,
            values_colname(colname),
            DEFAULT_CAPACITY,
            m_backing_store
        );

        auto siter = m_sortby_columns.find(colname);
        bool has_sortby =
            siter != m_sortby_columns.end() && siter->second != colname;
        m_has_sortby[idx + 1] = has_sortby;
        std::string sortby_column = has_sortby ? siter->second : colname;
        m_sortby_dpthcol.push_back(sortby_column);
        t_dtype dtype = m_ds->get_dtype(colname);
        m_values[idx + 1] = t_column(dtype, true, leaf_args, DEFAULT_CAPACITY);
        m_values[idx + 1].init();
    }

    m_init = true;
}

std::string
t_dtree::repr() const {
    std::stringstream ss;
    ss << m_ds->name() << "_tree_" << this;
    return ss.str();
}

std::string
t_dtree::leaves_colname() const {
    return repr() + std::string("_leaves");
}

std::string
t_dtree::nodes_colname() const {
    return repr() + std::string("_nodes");
}

std::string
t_dtree::values_colname(const std::string& tbl_colname) const {
    return repr() + std::string("_valuespan_") + tbl_colname;
}

void
t_dtree::check_pivot(const t_filter& filter, t_uindex level) {
    if (level <= m_levels_pivoted) {
        return;
    }

    PSP_VERBOSE_ASSERT(
        level <= m_pivots.size() + 1, "Erroneous level passed in"
    );

    pivot(filter, level);
}

void
t_dtree::pivot(const t_filter& filter, t_uindex level) {
    if (level <= m_levels_pivoted) {
        return;
    }

    PSP_VERBOSE_ASSERT(
        level <= m_pivots.size() + 1, "Erroneous level passed in"
    );

    t_uindex ncols = m_pivots.size();

    t_uindex nidx = m_nidx;

    t_uindex nrows;
    const t_mask* mask = nullptr;

    if (ncols > 0) {
        if (filter.has_filter()) {
            nrows = filter.count();
            mask = filter.cmask().get();
        } else {
            nrows = m_ds->num_rows();
        }
    } else {
        nrows = m_pivots.empty() ? m_ds->num_rows() : 1;
    }

    t_uindex nbidx;
    t_uindex neidx;

    if (m_levels_pivoted == 0) {
        m_leaves.extend<t_uindex>(nrows);
        auto* leaves = m_leaves.get_nth<t_uindex>(0);
        std::iota(leaves, leaves + nrows, t_uindex(0));

        nbidx = 0;
        neidx = 1;
    } else {
        nbidx = m_levels[m_levels_pivoted].first;
        neidx = m_levels[m_levels_pivoted].second;
    }

    for (t_uindex pidx = m_levels_pivoted; pidx < level; pidx++) {
        const t_column* pivcol;
        if (pidx == 0) {
            m_nodes.emplace_back();
            t_tnode* root = &m_nodes.back();
            fill_dense_tnode(root, nidx, nidx, 1, 0, 0, nrows);
            nidx++;
            m_values[0].push_back(std::string("Grand Aggregate"));
            m_levels.emplace_back(nbidx, neidx);
        } else {
            const t_pivot& pivot = m_pivots[pidx - 1];
            std::string pivot_colname = pivot.colname();
            pivcol = m_ds->_get_const_column(pivot_colname);
            t_dtype piv_dtype = pivcol->get_dtype();

            t_uindex next_neidx = 0;

            switch (piv_dtype) {
                case DTYPE_STR: {
                    next_neidx = t_pivot_processor<DTYPE_STR>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_INT64: {
                    next_neidx = t_pivot_processor<DTYPE_INT64>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_INT32: {
                    next_neidx = t_pivot_processor<DTYPE_INT32>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_INT16: {
                    next_neidx = t_pivot_processor<DTYPE_INT16>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_INT8: {
                    next_neidx = t_pivot_processor<DTYPE_INT8>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_UINT64: {
                    next_neidx = t_pivot_processor<DTYPE_UINT64>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_UINT32: {
                    next_neidx = t_pivot_processor<DTYPE_UINT32>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_UINT16: {
                    next_neidx = t_pivot_processor<DTYPE_UINT16>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_UINT8: {
                    next_neidx = t_pivot_processor<DTYPE_UINT8>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_FLOAT64: {
                    next_neidx = t_pivot_processor<DTYPE_FLOAT64>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_FLOAT32: {
                    next_neidx = t_pivot_processor<DTYPE_FLOAT32>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_BOOL: {

                    next_neidx = t_pivot_processor<DTYPE_BOOL>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_TIME: {
                    next_neidx = t_pivot_processor<DTYPE_INT64>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                case DTYPE_DATE: {
                    next_neidx = t_pivot_processor<DTYPE_UINT32>()(
                        pivcol,
                        &m_nodes,
                        &(m_values[pidx]),
                        &m_leaves,
                        nbidx,
                        neidx,
                        mask
                    );
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Not supported yet");
                } break;
            }
            nbidx = neidx;
            neidx = next_neidx;
            m_levels.emplace_back(nbidx, neidx);
        }

        m_levels_pivoted = pidx;
    }

    m_nidx = neidx;
}

t_uindex
t_dtree::get_depth(t_index idx) const {
    return get_span_index(idx).first;
}

void
t_dtree::pprint(const t_filter& filter) const {
    std::string indent("  ");

    for (auto idx : dfs()) {
        t_uindex depth = get_depth(idx);

        for (t_uindex didx = 0; didx < depth; ++didx) {
            std::cout << indent;
        }

        const t_dense_tnode* node = get_node_ptr(idx);

        std::cout << get_value(filter, idx) << " idx => " << node->m_idx
                  << " pidx => " << node->m_pidx << " fcidx => "
                  << node->m_fcidx << " nchild => " << node->m_nchild
                  << " flidx => " << node->m_flidx << " nleaves => "
                  << node->m_nleaves << '\n';
    }
}

t_uindex
t_dtree::last_level() const {
    return m_pivots.size();
}

const t_dtree::t_tnode*
t_dtree::get_node_ptr(t_index nidx) const {
    return &m_nodes.at(nidx);
}

t_tscalar
t_dtree::_get_value(const t_filter& filter, t_index nidx, bool sort_value)
    const {

    std::pair<t_uindex, t_uindex> spi = get_span_index(nidx);
    t_index dpth = spi.first;
    t_uindex scalar_idx = spi.second;

    if (sort_value || nidx == 0) {
        const t_column& col = m_values[dpth];
        return col.get_scalar(scalar_idx);
    }
    const std::string& colname = m_sortby_dpthcol[dpth];
    const t_column& col = *(m_ds->get_const_column(colname));
    const auto* node = get_node_ptr(nidx);
    t_uindex lfidx = *(m_leaves.get_nth<t_uindex>(node->m_flidx));
    return col.get_scalar(lfidx);
}

t_tscalar
t_dtree::get_value(const t_filter& filter, t_index nidx) const {
    return _get_value(filter, nidx, true);
}

t_tscalar
t_dtree::get_sortby_value(const t_filter& filter, t_index nidx) const {
    return _get_value(filter, nidx, false);
}

std::pair<t_uindex, t_uindex>
t_dtree::get_span_index(t_index idx) const {
    for (t_uindex i = 0, loop_end = m_levels.size(); i < loop_end; i++) {
        t_index bidx = m_levels[i].first;
        t_index eidx = m_levels[i].second;

        if ((idx >= bidx) && (idx < eidx)) {
            return std::pair<t_uindex, t_uindex>(i, idx - bidx);
        }
    }

    PSP_COMPLAIN_AND_ABORT("Reached unreachable.");
    return std::pair<t_uindex, t_uindex>(0, 0);
}

const t_column*
t_dtree::get_leaf_cptr() const {
    return &m_leaves;
}

t_bfs_iter<t_dtree>
t_dtree::bfs() const {
    return {this};
}

t_dfs_iter<t_dtree>
t_dtree::dfs() const {
    return {this};
}

t_index
t_dtree::get_parent(t_index idx) const {
    const t_tnode* n = get_node_ptr(idx);
    return n->m_pidx;
}

const std::vector<t_pivot>&
t_dtree::get_pivots() const {
    return m_pivots;
}

void
t_dtree::get_child_indices(t_index nidx, std::vector<t_index>& v) const {
    const auto* nptr = get_node_ptr(nidx);
    for (t_index idx = nptr->m_fcidx + nptr->m_nchild - 1,
                 loop_end = nptr->m_fcidx;
         idx >= loop_end;
         --idx) {
        v.push_back(idx);
    }
}

} // end namespace perspective
