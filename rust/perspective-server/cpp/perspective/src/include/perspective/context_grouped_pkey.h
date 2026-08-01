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
#include <perspective/context_base.h>
#include <perspective/traversal.h>
#include <perspective/sparse_tree.h>
#include <perspective/data_table.h>
#include <perspective/path.h>
#include <perspective/sym_table.h>
#include <perspective/expression_tables.h>
#include <perspective/expression_vocab.h>
#include <perspective/regex.h>

namespace perspective {

class PERSPECTIVE_EXPORT t_ctx_grouped_pkey
    : public t_ctxbase<t_ctx_grouped_pkey> {
public:
    t_ctx_grouped_pkey();
    t_ctx_grouped_pkey(const t_schema& schema, const t_config& config);

    ~t_ctx_grouped_pkey();

#include <perspective/context_common_decls.h>

    t_index open(t_header header, t_index idx);
    t_index open(t_index idx);

    t_index close(t_index idx);
    std::vector<t_aggspec> get_aggregates() const;
    std::vector<t_tscalar> get_row_path(t_index idx) const;
    std::vector<t_path> get_expansion_state() const;
    void set_expansion_state(const std::vector<t_path>& paths);
    t_tscalar get_tree_value(t_index idx) const;
    t_stree* _get_tree();
    std::vector<t_ftreenode>
    get_flattened_tree(t_index idx, t_depth stop_depth);
    std::shared_ptr<const t_traversal> get_traversal() const;

    void set_depth(t_depth depth);

    void expand_path(const std::vector<t_tscalar>& path);

    // aggregates should be presized to be same size
    // as agg_indices
    void
    get_aggregates_for_sorting(t_uindex nidx, const std::vector<t_index>& agg_indices, std::vector<t_tscalar>& aggregates, t_ctx2*)
        const;

    using t_ctxbase<t_ctx_grouped_pkey>::get_data;

private:
    void rebuild();

    t_tscalar get_value_from_gstate(
        const std::string& colname, const t_tscalar& pkey
    ) const;

    std::shared_ptr<t_traversal> m_traversal;
    std::shared_ptr<t_stree> m_tree;
    std::vector<t_sortspec> m_sortby;
    t_symtable m_symtable;
    bool m_has_label;
    t_depth m_depth;
    bool m_depth_set;
    std::shared_ptr<t_expression_tables> m_expression_tables;
    std::shared_ptr<t_window_engine> m_window_engine;
};

typedef std::shared_ptr<t_ctx_grouped_pkey> t_ctx_grouped_pkey_sptr;
typedef t_ctx_grouped_pkey t_ctxg;
typedef std::shared_ptr<t_ctx_grouped_pkey> t_ctxg_sptr;
typedef std::vector<t_ctx_grouped_pkey_sptr> t_ctx_grouped_pkey_svec;

} // end namespace perspective
