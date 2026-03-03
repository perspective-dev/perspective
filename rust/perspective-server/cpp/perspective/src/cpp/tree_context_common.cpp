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
#include <perspective/base.h>
#include <perspective/filter.h>
#include <perspective/path.h>
#include <perspective/sparse_tree.h>
#include <perspective/data_table.h>
#include <perspective/traversal.h>
#include <perspective/env_vars.h>
#include <perspective/dense_tree.h>
#include <perspective/dense_tree_context.h>
#include <tsl/hopscotch_set.h>

#include <utility>

namespace perspective {

void
notify_sparse_tree_common(
    const std::shared_ptr<t_data_table>& strands,
    const std::shared_ptr<t_data_table>& strand_deltas,
    const std::shared_ptr<t_stree>& tree,
    const std::shared_ptr<t_traversal>& traversal,
    bool process_traversal,
    const std::vector<t_aggspec>& aggregates,
    const std::vector<std::pair<std::string, std::string>>& tree_sortby,
    const std::vector<t_sortspec>& ctx_sortby,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
) {
    t_filter fltr;
    if (t_env::log_data_nsparse_strands()) {
        std::cout << "nsparse_strands" << '\n';
        strands->pprint();
    }

    if (t_env::log_data_nsparse_strand_deltas()) {
        std::cout << "nsparse_strand_deltas" << '\n';
        strand_deltas->pprint();
    }

    auto pivots = tree->get_pivots();

    t_dtree dtree(strands, pivots, tree_sortby);
    dtree.init();

    dtree.check_pivot(fltr, pivots.size() + 1);

    if (t_env::log_data_nsparse_dtree()) {
        std::cout << "nsparse_dtree" << '\n';
        dtree.pprint(fltr);
    }

    t_dtree_ctx dctx(strands, strand_deltas, dtree, aggregates);

    dctx.init();

    tree->update_shape_from_static(dctx);

    auto zero_strands = tree->zero_strands();

    bool is_leaves_only =
        process_traversal && traversal != nullptr && traversal->is_leaves_only();

    if (process_traversal && !is_leaves_only) {
        t_uindex t_osize = traversal->size();
        traversal->drop_tree_indices(zero_strands);
        t_uindex t_nsize = traversal->size();
        if (t_osize != t_nsize) {
            tree->set_has_deltas(true);
        }
    }

    auto non_zero_ids = tree->non_zero_ids(zero_strands);
    auto non_zero_leaves = tree->non_zero_leaves(zero_strands);

    tree->drop_zero_strands();

    tree->populate_leaf_index(non_zero_leaves);

    tree->update_aggs_from_static(dctx, gstate, expression_master_table);

    if (is_leaves_only) {
        traversal->rebuild_from_leaves(ctx_sortby);
    } else {
        std::set<t_uindex> visited;

        struct t_leaf_path {
            std::vector<t_tscalar> m_path;
            t_uindex m_lfidx;
        };

        std::vector<t_leaf_path> leaf_paths(non_zero_leaves.size());

        t_uindex count = 0;

        for (auto lfidx : non_zero_leaves) {
            leaf_paths[count].m_lfidx = lfidx;
            tree->get_sortby_path(lfidx, leaf_paths[count].m_path);
            std::reverse(
                leaf_paths[count].m_path.begin(),
                leaf_paths[count].m_path.end()
            );
            ++count;
        }

        std::sort(
            leaf_paths.begin(),
            leaf_paths.end(),
            [](const t_leaf_path& a, const t_leaf_path& b) {
                return a.m_path < b.m_path;
            }
        );

        if (!leaf_paths.empty() && (traversal != nullptr)
            && traversal->size() == 1) {
            if (traversal->get_node(0).m_expanded) {
                traversal->populate_root_children(tree);
            }
        } else {
            for (const auto& lpath : leaf_paths) {
                t_uindex lfidx = lpath.m_lfidx;
                auto ancestry = tree->get_ancestry(lfidx);

                t_uindex num_tnodes_existed = 0;

                for (auto nidx : ancestry) {
                    if (non_zero_ids.find(nidx) == non_zero_ids.end()
                        || visited.find(nidx) != visited.end()) {
                        ++num_tnodes_existed;
                    } else {
                        break;
                    }
                }

                if (process_traversal) {
                    traversal->add_node(
                        ctx_sortby, ancestry, num_tnodes_existed
                    );
                }

                for (auto nidx : ancestry) {
                    visited.insert(nidx);
                }
            }
        }
    }
}

void
notify_sparse_tree(
    const std::shared_ptr<t_stree>& tree,
    const std::shared_ptr<t_traversal>& traversal,
    bool process_traversal,
    const std::vector<t_aggspec>& aggregates,
    const std::vector<std::pair<std::string, std::string>>& tree_sortby,
    const std::vector<t_sortspec>& ctx_sortby,
    const t_data_table& flattened,
    const t_data_table& delta,
    const t_data_table& prev,
    const t_data_table& current,
    const t_data_table& transitions,
    const t_data_table& existed,
    const t_config& config,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
) {

    auto strand_values = tree->build_strand_table(
        flattened, delta, prev, current, transitions, aggregates, config
    );

    auto strands = strand_values.first;
    auto strand_deltas = strand_values.second;
    notify_sparse_tree_common(
        strands,
        strand_deltas,
        tree,
        traversal,
        process_traversal,
        aggregates,
        tree_sortby,
        ctx_sortby,
        gstate,
        expression_master_table
    );
}

void
notify_sparse_tree(
    const std::shared_ptr<t_stree>& tree,
    const std::shared_ptr<t_traversal>& traversal,
    bool process_traversal,
    const std::vector<t_aggspec>& aggregates,
    const std::vector<std::pair<std::string, std::string>>& tree_sortby,
    const std::vector<t_sortspec>& ctx_sortby,
    const t_data_table& flattened,
    const t_config& config,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
) {
    auto strand_values =
        tree->build_strand_table(flattened, aggregates, config);

    auto strands = strand_values.first;
    auto strand_deltas = strand_values.second;
    notify_sparse_tree_common(
        strands,
        strand_deltas,
        tree,
        traversal,
        process_traversal,
        aggregates,
        tree_sortby,
        ctx_sortby,
        gstate,
        expression_master_table
    );
}

std::vector<t_path>
ctx_get_expansion_state(
    const std::shared_ptr<const t_stree>& tree,
    const std::shared_ptr<const t_traversal>& traversal
) {
    std::vector<t_path> paths;
    std::vector<t_index> expanded;
    traversal->get_expanded(expanded);

    for (long long i : expanded) {
        std::vector<t_tscalar> path;
        tree->get_path(i, path);
        paths.emplace_back(path);
    }
    return paths;
}

std::vector<t_tscalar>
ctx_get_path(
    const std::shared_ptr<const t_stree>& tree,
    const std::shared_ptr<const t_traversal>& traversal,
    t_index idx
) {
    if (idx < 0 || idx >= t_index(traversal->size())) {
        std::vector<t_tscalar> rval;
        return rval;
    }

    auto tree_index = traversal->get_tree_index(idx);
    std::vector<t_tscalar> rval;
    tree->get_path(tree_index, rval);
    return rval;
}

std::vector<t_ftreenode>
ctx_get_flattened_tree(
    t_index idx,
    t_depth stop_depth,
    t_traversal& trav,
    const t_config& config,
    const std::vector<t_sortspec>& sortby
) {
    t_index ptidx = trav.get_tree_index(idx);
    trav.set_depth(sortby, stop_depth);
    if (!sortby.empty()) {
        trav.sort_by(config, sortby, *(trav.get_tree()));
    }
    t_index new_tvidx = trav.tree_index_lookup(ptidx, idx);
    return trav.get_flattened_tree(new_tvidx, stop_depth);
}

} // end namespace perspective
