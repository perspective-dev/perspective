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
#include <perspective/context_base.h>
#include <perspective/path.h>
#include <perspective/traversal_nodes.h>
#include <perspective/sort_specification.h>
#include <perspective/traversal.h>
#include <perspective/data_table.h>
#include <perspective/expression_tables.h>
#include <perspective/expression_vocab.h>
#include <perspective/regex.h>

namespace perspective {

class PERSPECTIVE_EXPORT t_ctx1 : public t_ctxbase<t_ctx1> {
public:
    t_ctx1();

    t_ctx1(const t_schema& schema, const t_config& config);

    ~t_ctx1();

#include <perspective/context_common_decls.h>

    t_index open(t_header header, t_index idx);
    t_index open(t_index idx);
    t_index close(t_index idx);

    t_aggspec get_aggregate(t_uindex idx) const;
    t_tscalar get_aggregate_name(t_uindex idx) const;
    std::vector<t_aggspec> get_aggregates() const;
    std::vector<t_tscalar> get_row_path(t_index idx) const;
    void set_depth(t_depth depth);
    void set_leaves_only(bool enabled);

    t_index get_row_idx(const std::vector<t_tscalar>& path) const;

    t_depth get_trav_depth(t_index idx) const;

    std::pair<t_tscalar, t_tscalar> get_min_max(const std::string& colname
    ) const;

    using t_ctxbase<t_ctx1>::get_data;

private:
    std::shared_ptr<t_traversal> m_traversal;
    std::shared_ptr<t_stree> m_tree;
    std::vector<t_sortspec> m_sortby;
    std::shared_ptr<t_expression_tables> m_expression_tables;
    t_depth m_depth;
    bool m_depth_set;
    bool m_leaves_only = false;
};

} // end namespace perspective
