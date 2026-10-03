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
#include <perspective/config.h>
#include <perspective/gnode_state.h>
#include <perspective/traversal.h>

namespace perspective {

PERSPECTIVE_EXPORT void notify_sparse_tree_common(
    std::shared_ptr<t_data_table> strands,
    std::shared_ptr<t_data_table> strand_deltas,
    std::shared_ptr<t_stree> tree,
    std::shared_ptr<t_traversal> traversal,
    bool process_traversal,
    const std::vector<t_aggspec>& aggregates,
    const std::vector<std::pair<std::string, std::string>>& tree_sortby,
    const std::vector<t_sortspec>& ctx_sortby,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
);

PERSPECTIVE_EXPORT void notify_sparse_tree(
    const std::shared_ptr<t_stree>& tree,
    const std::shared_ptr<t_traversal>& traversal,
    bool process_traversal,
    const std::vector<t_aggspec>& aggregates,
    const std::vector<std::pair<std::string, std::string>>& tree_sortby,
    const std::vector<t_sortspec>& ctx_sortby,
    const t_data_table& flattened,
    const t_data_table& prev,
    const t_data_table& current,
    const t_data_table& transitions,
    const t_data_table& existed,
    const t_config& config,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
);

PERSPECTIVE_EXPORT void notify_sparse_tree(
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
);

template <typename CONTEXT_T>
void
ctx_expand_path(
    CONTEXT_T& ctx,
    t_header header,
    const std::shared_ptr<t_stree>& tree,
    const std::shared_ptr<t_traversal>& traversal,
    const std::vector<t_tscalar>& path
) {
    t_index root = 0;
    t_index bidx = 0;

    for (int j = 0, loop_end = path.size(); j < loop_end; j++) {
        const t_tscalar& datum = path[j];
        root = tree->resolve_child(root, datum);

        if (root < 0) {
            break;
        }

        t_index tvidx = traversal->tree_index_lookup(root, bidx);

        bidx = tvidx;
        ctx.open(header, tvidx);
    }
}

template <typename CONTEXT_T>
void
ctx_set_expansion_state(
    CONTEXT_T& ctx,
    t_header header,
    std::shared_ptr<t_stree> tree,
    std::shared_ptr<t_traversal> traversal,
    const std::vector<t_path>& paths
) {
    for (int i = 0, loop_end = paths.size(); i < loop_end; i++) {
        const t_path& path = paths[i];
        ctx_expand_path(ctx, header, tree, traversal, path.m_path);
    }
}

PERSPECTIVE_EXPORT std::vector<t_path> ctx_get_expansion_state(
    const std::shared_ptr<const t_stree>& tree,
    const std::shared_ptr<const t_traversal>& traversal
);

PERSPECTIVE_EXPORT std::vector<t_tscalar> ctx_get_path(
    const std::shared_ptr<const t_stree>& tree,
    const std::shared_ptr<const t_traversal>& traversal,
    t_index idx
);

PERSPECTIVE_EXPORT std::vector<t_ftreenode> ctx_get_flattened_tree(
    t_index idx,
    t_depth stop_depth,
    t_traversal& trav,
    const t_config& config,
    const std::vector<t_sortspec>& sortby
);

} // end namespace perspective
