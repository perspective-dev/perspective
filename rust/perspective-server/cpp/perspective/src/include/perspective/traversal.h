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
#include <perspective/raw_types.h>
#include <perspective/exports.h>
#include <perspective/multi_sort.h>
#include <perspective/traversal_nodes.h>
#include <perspective/sort_specification.h>
#include <perspective/sparse_tree_node.h>
#include <perspective/sparse_tree.h>
#include <perspective/arg_sort.h>
#include <algorithm>
#include <cstdint>
#include <queue>

SUPPRESS_WARNINGS_VC(4503)

namespace perspective {

class t_config;
class t_ctx2;

class t_traversal {
public:
    t_traversal(const std::shared_ptr<const t_stree>& tree);

    t_index expand_node(t_index exp_idx);

    t_index expand_node(
        const std::vector<t_sortspec>& sortby,
        t_index exp_idx,
        t_ctx2* ctx2 = nullptr
    );

    t_index collapse_node(t_index idx);

    void add_node(
        const std::vector<t_sortspec>& sortby,
        const std::vector<t_uindex>& indices,
        t_index insert_level_idx,
        t_ctx2* ctx2 = nullptr
    );

    t_index update_ancestors(t_index nidx, t_index n_changed);

    t_index update_sucessors(t_index nidx, t_index n_changed);

    t_index get_tree_index(t_index idx) const;

    t_uindex size() const;

    t_depth get_depth(t_index idx) const;

    t_index get_traversal_index(t_index idx);

    std::vector<t_vdnode> get_view_nodes(t_index bidx, t_index eidx) const;

    void get_expanded_span(
        const std::vector<t_uindex>& in_ptidxes,
        std::vector<t_index>& out_indexes,
        t_index& out_collpsed_ancestor,
        t_index insert_level_idx
    );

    bool validate_cells(const std::vector<std::pair<t_uindex, t_uindex>>& cells
    ) const;

    t_index remove_subtree(t_index idx);

    void pprint() const;

    t_tvnode get_node(t_index idx) const;

    void get_leaves(std::vector<t_index>& out_data) const;

    template <typename SRC_T>
    void sort_by(
        const t_config& config,
        const std::vector<t_sortspec>& sortby,
        const SRC_T& src,
        t_ctx2* ctx2 = nullptr
    );

    void get_child_indices(
        t_index nidx, std::vector<std::pair<t_index, t_index>>& out_data
    ) const;

    void print_stats();

    t_index get_num_tree_leaves(t_index idx) const;

    void post_order(t_index nidx, std::vector<t_index>& out_vec);

    // Traversal
    t_index set_depth(
        const std::vector<t_sortspec>& sortby,
        t_depth depth,
        t_ctx2* ctx2 = nullptr
    );

    std::vector<t_ftreenode>
    get_flattened_tree(t_index idx, t_depth stop_depth) const;

    t_index tree_index_lookup(t_index idx, t_index bidx) const;

    void
    get_node_ancestors(t_index nidx, std::vector<t_index>& ancestors) const;

    void get_expanded(std::vector<t_index>& expanded_tidx) const;

    bool get_node_expanded(t_index idx) const;

    void drop_tree_indices(const std::vector<t_uindex>& indices);

    bool is_valid_idx(t_index idx) const;

    const t_stree* get_tree() const;

    void populate_root_children(const t_stnode_vec& rchildren);
    void populate_root_children(const std::shared_ptr<const t_stree>& tree);

    void set_leaves_only(bool enabled, t_uindex leaf_depth);
    bool is_leaves_only() const;
    void rebuild_from_leaves(const std::vector<t_sortspec>& sortby);

private:
    void collect_leaves(
        t_uindex tnid,
        t_uindex current_depth,
        const std::vector<t_sortspec>& sortby,
        const std::vector<t_index>& sortby_agg_indices,
        const std::vector<t_sorttype>& sort_orders
    );

    std::shared_ptr<const t_stree> m_tree;
    std::shared_ptr<std::vector<t_tvnode>> m_nodes;
    bool m_leaves_only = false;
    t_uindex m_leaf_depth = 0;
};

/**
 * @brief Sort implementation for `t_ctx1` and `t_ctx2` contexts.
 *
 * @tparam SRC_T
 * @param config
 * @param sortby
 * @param src
 * @param ctx2
 */
template <typename SRC_T>
void
t_traversal::sort_by(
    const t_config& config,
    const std::vector<t_sortspec>& sortby,
    const SRC_T& src,
    t_ctx2* ctx2
) {
    std::vector<t_tvnode> new_nodes(m_nodes->size());

    // Pair is -> (old tvidx, new tvidx)
    std::vector<std::pair<t_index, t_index>> queue;

    // Add root to queue
    new_nodes[0] = (*m_nodes)[0];
    queue.emplace_back(std::pair<t_index, t_index>(0, 0));

    std::vector<t_index> sortby_agg_indices(sortby.size());

    t_uindex scount = 0;
    for (const auto& s : sortby) {
        sortby_agg_indices[scount] = s.m_agg_index;
        ++scount;
    }

    // while queue is not empty
    while (!queue.empty()) {
        // get head
        const std::pair<t_index, t_index> head_info = queue.back();
        queue.pop_back();

        // Heads idx in current traversal
        t_index h_ctvidx = head_info.first;

        // Heads idx in new traversal
        t_index h_ntvidx = head_info.second;

        const t_tvnode& head = (*m_nodes)[h_ctvidx];

        std::vector<std::pair<t_index, t_index>> h_children;
        get_child_indices(h_ctvidx, h_children);

        if (!h_children.empty()) {
            // Get sorted indices
            auto n_changed = h_children.size();
            std::vector<t_index> sorted_idx(n_changed);
            std::vector<t_index> children_ptidx(n_changed);
            auto sortelems =
                std::make_shared<std::vector<t_mselem>>(size_t(n_changed));
            auto num_aggs = sortby.size();
            std::vector<t_tscalar> aggregates(num_aggs);

            for (t_uindex i = 0, loop_end = n_changed; i < loop_end; i++) {
                children_ptidx[i] = h_children[i].second;

                src.get_aggregates_for_sorting(
                    children_ptidx[i], sortby_agg_indices, aggregates, ctx2
                );

                (*sortelems)[i] =
                    t_mselem(aggregates, static_cast<t_uindex>(i));
            }

            std::vector<t_sorttype> sort_orders = get_sort_orders(sortby);
            t_multisorter sorter(sortelems, sort_orders);
            argsort(sorted_idx, sorter);

            std::int32_t nchild = n_changed;
            t_index ndesc = head.m_ndesc;

            // Fast path - if none of heads children are
            // expanded
            if (ndesc == nchild) {
                // Set contiguous block in traversal for
                // children
                auto bidx = h_ntvidx + 1;
                auto eidx = bidx + nchild;

                for (t_index idx = bidx; idx < eidx; idx++) {
                    t_index cidx = sorted_idx[idx - bidx];
                    t_index c_otvidx = h_children[cidx].first;
                    new_nodes[idx] = (*m_nodes)[c_otvidx];
                    new_nodes[idx].m_rel_pidx = idx - bidx + 1;
                }
            } else {
                t_index c_ntvidx = h_ntvidx + 1;

                for (t_uindex idx = 0, loop_end = h_children.size();
                     idx < loop_end;
                     idx++) {
                    // For each child of head
                    t_index cidx = sorted_idx[idx];
                    t_index c_otvidx = h_children[cidx].first;

                    const t_tvnode& child = (*m_nodes)[c_otvidx];

                    // Enqueue child if it is expanded
                    if (child.m_expanded) {
                        queue.emplace_back(
                            std::pair<t_index, t_index>(c_otvidx, c_ntvidx)
                        );
                    }

                    new_nodes[c_ntvidx] = (*m_nodes)[c_otvidx];
                    new_nodes[c_ntvidx].m_rel_pidx = c_ntvidx - h_ntvidx;
                    c_ntvidx = c_ntvidx + child.m_ndesc + 1;
                }
            }
        }
    }

    std::swap(*m_nodes, new_nodes);
}

} // end namespace perspective
