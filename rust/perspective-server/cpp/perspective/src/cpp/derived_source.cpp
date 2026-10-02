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

#include <perspective/derived_source.h>
#include <perspective/gnode.h>
#include <perspective/pyutils.h>
#include <perspective/sparse_tree.h>
#include <perspective/expression_tables.h>
#include <tsl/hopscotch_set.h>
#include <algorithm>

namespace perspective {

namespace {
    std::int64_t
    wide_key(t_uindex depth, t_uindex idx) {
        return (static_cast<std::int64_t>(depth) << 40)
            | static_cast<std::int64_t>(idx);
    }

    void
    check_unique(const std::vector<std::string>& names) {
        tsl::hopscotch_set<std::string> seen;
        for (const auto& name : names) {
            if (!seen.insert(name).second) {
                PSP_COMPLAIN_AND_ABORT(
                    "Duplicate column '" + name + "' in derived table schema"
                );
            }
        }
    }

    t_dtype
    pivot_dtype(
        const t_schema& parent_schema,
        const t_view_config& config,
        const std::string& pivot
    ) {
        if (parent_schema.has_column(pivot)) {
            return parent_schema.get_dtype(pivot);
        }

        for (const auto& expr : config.get_expressions()) {
            if (expr->get_expression_alias() == pivot) {
                return expr->get_dtype();
            }
        }

        return DTYPE_STR;
    }

    bool
    is_pct(const t_aggspec& spec) {
        return spec.agg() == AGGTYPE_PCT_SUM_PARENT
            || spec.agg() == AGGTYPE_PCT_SUM_GRAND_TOTAL;
    }

    /// Whether `extract_aggregate` returns the stored aggregate unchanged,
    /// so a child may read the aggtable column in place.
    bool
    identity_extract(const t_aggspec& spec, t_dtype stored_dtype) {
        return !is_pct(spec) && spec.agg() != AGGTYPE_ABS_SUM
            && stored_dtype != DTYPE_F64PAIR;
    }

    t_dtype
    aggregate_dtype(const t_stree& tree, const t_aggspec& spec) {
        t_dtype dtype = tree.get_aggtable()->get_schema().get_dtype(spec.name());
        if (dtype == DTYPE_F64PAIR || is_pct(spec)) {
            return DTYPE_FLOAT64;
        }

        return dtype;
    }

    void
    put(t_column* column,
        t_uindex idx,
        t_derived_cell_state state,
        const t_tscalar& value) {
        if (column == nullptr) {
            return;
        }

        switch (state) {
            case DERIVED_CELL_SET: {
                column->set_scalar(idx, value);
            } break;
            case DERIVED_CELL_CLEAR: {
                column->unset(idx);
            } break;
            case DERIVED_CELL_KEEP: {
            } break;
        }
    }

    void
    put_scalar(t_column* column, t_uindex idx, const t_tscalar& value) {
        put(column,
            idx,
            value.is_valid() && !value.is_none() ? DERIVED_CELL_SET
                                                 : DERIVED_CELL_CLEAR,
            value);
    }

    std::vector<t_tscalar>
    node_path(const t_stree& tree, t_uindex idx) {
        std::vector<t_tscalar> path;
        tree.get_path(idx, path);
        std::reverse(path.begin(), path.end());
        return path;
    }

    /// Root-to-node paths of live tree nodes under a caller-chosen key
    /// that must identify the tree as well as the node when several trees
    /// share an index space; a reference is valid until the next `get`.
    class t_path_cache {
    public:
        const std::vector<t_tscalar>&
        get(const t_stree& tree, std::int64_t key, t_uindex idx) {
            auto iter = m_paths.find(key);
            if (iter == m_paths.end()) {
                iter = m_paths.emplace(key, node_path(tree, idx)).first;
            }

            return iter->second;
        }

        void
        erase(std::int64_t key) {
            m_paths.erase(key);
        }

        void
        clear() {
            m_paths.clear();
        }

    private:
        tsl::hopscotch_map<std::int64_t, std::vector<t_tscalar>> m_paths;
    };

    /**
     * @brief Add the nodes whose `pct sum` values move with a touched node.
     */
    void
    widen_pct(
        const t_stree& tree,
        bool pct_parent,
        bool pct_grand,
        tsl::hopscotch_set<t_uindex>& touched
    ) {
        if (pct_grand && touched.contains(0)) {
            tree.for_each_node([&touched](const t_stnode& node) {
                touched.insert(node.m_idx);
            });
            return;
        }

        if (!pct_parent) {
            return;
        }

        std::vector<t_uindex> parents(touched.begin(), touched.end());
        std::vector<t_index> children;
        for (t_uindex idx : parents) {
            if (!tree.node_exists(idx)) {
                continue;
            }

            children.clear();
            tree.get_child_indices(idx, children);
            for (t_index child : children) {
                touched.insert(static_cast<t_uindex>(child));
            }
        }
    }

    tsl::hopscotch_set<t_uindex>
    touched_nodes(
        const t_stree& tree,
        const t_stree_capture& capture,
        bool pct_parent,
        bool pct_grand
    ) {
        tsl::hopscotch_set<t_uindex> touched;
        for (const auto& kv : capture.m_changed) {
            touched.insert(kv.first);
        }

        for (t_uindex idx : capture.m_created) {
            touched.insert(idx);
        }

        widen_pct(tree, pct_parent, pct_grand, touched);
        return touched;
    }
} // namespace

std::string
t_derived_source::index() const {
    return "";
}

std::uint32_t
t_derived_source::limit() const {
    return std::numeric_limits<std::uint32_t>::max();
}

const std::shared_ptr<Table>&
t_derived_source::child() const {
    return m_child;
}

void
t_derived_source::detach() {}

std::shared_ptr<t_column>
t_derived_source::alias_column(t_uindex cidx) const {
    return nullptr;
}

bool
t_derived_source::previous(
    const t_derived_member& member, t_uindex cidx, t_tscalar& out
) const {
    return false;
}

t_index
t_derived_source::bound_row(const t_tscalar& pkey) const {
    const auto& mapping = m_child->get_gnode()->get_pkey_map();
    auto iter = mapping.find(pkey);
    if (iter == mapping.end()) {
        return -1;
    }

    return static_cast<t_index>(iter->second);
}

bool
t_derived_source::take_replaced() {
    t_uindex generation = storage_generation();
    bool replaced = generation != m_generation;
    m_generation = generation;
    return replaced;
}

void
t_derived_source::init_pct_flags(const t_view_config& config) {
    for (const auto& spec : config.get_aggspecs()) {
        m_pct_parent = m_pct_parent || spec.agg() == AGGTYPE_PCT_SUM_PARENT;
        m_pct_grand =
            m_pct_grand || spec.agg() == AGGTYPE_PCT_SUM_GRAND_TOTAL;
    }
}

void
t_derived_source::attach(const std::shared_ptr<Table>& child) {
    m_child = child;
    t_schema schema = child->get_schema();
    m_columns = schema.columns();
    resolve(schema);
    take_replaced();
    m_attached = false;
    step(false);
}

bool
t_derived_source::step(bool notify) {
#ifdef PSP_PARALLEL_FOR
    PSP_WRITE_LOCK(*m_child->get_pool()->get_lock());
#endif
    bool full = take_replaced() || !m_attached;
    auto gnode = m_child->get_gnode();
    if (full && m_attached) {
        gnode->reset();
    }

    m_attached = true;
    std::vector<t_derived_member> members;
    collect(full, members);

    std::shared_ptr<t_data_table> master = gnode->get_table_sptr();
    const t_schema& schema = master->get_schema();
    t_uindex num_columns = m_columns.size();
    if (full) {
        for (t_uindex cidx = 0; cidx < num_columns; ++cidx) {
            auto column = alias_column(cidx);
            if (column
                && column->get_dtype() == schema.get_dtype(m_columns[cidx])) {
                gnode->set_derived_alias(m_columns[cidx], std::move(column));
            }
        }
    }

    std::vector<bool> aliased(num_columns);
    for (t_uindex cidx = 0; cidx < num_columns; ++cidx) {
        aliased[cidx] = gnode->is_derived_alias(m_columns[cidx]);
    }

    t_uindex size = members.size();
    auto flattened = std::make_shared<t_data_table>(schema);
    flattened->init();
    flattened->extend(size);
    auto prev_state = std::make_shared<t_data_table>(schema);
    prev_state->init();
    if (!full) {
        prev_state->extend(size);
    }

    t_column* pkey_col = flattened->_get_column("psp_pkey");
    t_column* okey_col = flattened->_get_column("psp_okey");
    t_column* op_col = flattened->_get_column("psp_op");
    const t_column* master_okey = master->_get_const_column("psp_okey");
    t_column* prev_okey = prev_state->_get_column("psp_okey");
    std::vector<t_column*> columns(num_columns);
    std::vector<const t_column*> master_cols(num_columns);
    std::vector<t_column*> prev_cols(num_columns);
    for (t_uindex cidx = 0; cidx < num_columns; ++cidx) {
        const std::string& name = m_columns[cidx];
        columns[cidx] =
            full && aliased[cidx] ? nullptr : flattened->_get_column(name);
        master_cols[cidx] = master->_get_const_column(name);
        prev_cols[cidx] = prev_state->_get_column(name);
    }

    std::vector<t_uindex> rows(size);
    std::vector<t_index> bound(size);
    t_uindex widx = 0;
    for (const t_derived_member& member : members) {
        t_index bound_idx = bound_row(member.m_pkey);
        if (member.m_deleted && bound_idx < 0) {
            continue;
        }

        pkey_col->set_scalar(widx, member.m_pkey);
        okey_col->set_scalar(widx, member.m_pkey);
        op_col->set_nth<std::uint8_t>(
            widx, member.m_deleted ? OP_DELETE : OP_INSERT
        );

        rows[widx] =
            member.m_deleted ? static_cast<t_uindex>(bound_idx) : member.m_row;
        bound[widx] = bound_idx;

        if (bound_idx >= 0) {
            if (master_okey->is_valid(bound_idx)) {
                prev_okey->set_scalar(widx, master_okey->get_scalar(bound_idx));
            }

            for (t_uindex cidx = 0; cidx < num_columns; ++cidx) {
                t_tscalar value;
                if (!aliased[cidx] || !previous(member, cidx, value)) {
                    if (!master_cols[cidx]->is_valid(bound_idx)) {
                        continue;
                    }

                    value = master_cols[cidx]->get_scalar(bound_idx);
                }

                if (value.is_valid() && !value.is_none()) {
                    prev_cols[cidx]->set_scalar(widx, value);
                }
            }
        }

        if (!member.m_deleted) {
            fill(member, widx, columns);
        }

        ++widx;
    }

    if (widx != size) {
        flattened->set_size(widx);
        prev_state->set_size(widx);
        rows.resize(widx);
        bound.resize(widx);
    }

    t_derived_step derived_step;
    derived_step.m_flattened = flattened;
    derived_step.m_prev_state = prev_state;
    derived_step.m_rows = std::move(rows);
    derived_step.m_bound = std::move(bound);
    derived_step.m_notify = notify;
    return gnode->process_derived(derived_step);
}

/**
 * @brief The source for a `group_by` view, one row per tree node.
 */
class t_tree_derived_source : public t_derived_source {
public:
    t_tree_derived_source(
        std::shared_ptr<View<t_ctx1>> view, std::shared_ptr<Table> parent
    ) :
        m_view(std::move(view)),
        m_parent(std::move(parent)) {
        auto config = m_view->get_view_config();
        m_num_pivots = config->get_row_pivots().size();
        m_num_visible = config->get_columns().size();
        init_pct_flags(*config);
    }

    t_schema
    infer_schema() const override {
        auto config = m_view->get_view_config();
        t_schema parent_schema = m_parent->get_schema();
        std::vector<std::string> names;
        std::vector<t_dtype> types;
        const auto pivots = config->get_row_pivots();
        for (t_uindex depth = 0; depth < pivots.size(); ++depth) {
            names.push_back(pivots[depth]);
            types.push_back(pivot_dtype(parent_schema, *config, pivots[depth]));
        }

        const auto aggspecs = config->get_aggspecs();
        for (t_uindex aggnum = 0; aggnum < m_num_visible; ++aggnum) {
            names.push_back(config->readable_aggregate_name(aggspecs[aggnum]));
            types.push_back(aggregate_dtype(*tree(), aggspecs[aggnum]));
        }

        check_unique(names);
        return {names, types};
    }

    t_dtype
    pkey_dtype() const override {
        return DTYPE_INT64;
    }

    void
    detach() override {
        tree()->remove_capture(m_capture);
    }

protected:
    void
    resolve(const t_schema& schema) override {
        auto config = m_view->get_view_config();
        const auto pivots = config->get_row_pivots();
        const auto aggspecs = config->get_aggspecs();
        m_roles.assign(m_columns.size(), {ROLE_NONE, 0});
        m_agg_names.assign(m_columns.size(), "");
        for (t_uindex cidx = 0; cidx < m_columns.size(); ++cidx) {
            for (t_uindex aggnum = 0; aggnum < m_num_visible; ++aggnum) {
                if (config->readable_aggregate_name(aggspecs[aggnum])
                    == m_columns[cidx]) {
                    m_roles[cidx] = {ROLE_AGGREGATE, aggnum};
                    m_agg_names[cidx] = aggspecs[aggnum].name();
                }
            }

            for (t_uindex depth = 0; depth < pivots.size(); ++depth) {
                if (pivots[depth] == m_columns[cidx]) {
                    m_roles[cidx] = {ROLE_KEY, depth};
                }
            }
        }
    }

    t_uindex
    storage_generation() const override {
        return m_view->get_context()->get_storage_generation();
    }

    void
    collect(bool full, std::vector<t_derived_member>& members) override {
        t_stree* tr = tree();
        snapshot_aggregates(*tr);
        if (full) {
            m_paths.clear();
            tr->remove_capture(m_capture);
            m_capture = std::make_shared<t_stree_capture>();
            tr->add_capture(m_capture);
            tr->for_each_node([&](const t_stnode& node) {
                if (selected(node.m_depth)) {
                    members.push_back(member(*tr, node));
                }
            });
            return;
        }

        t_stree_capture capture;
        std::swap(capture, *m_capture);
        for (const auto& dropped : capture.m_dropped) {
            m_paths.erase(static_cast<std::int64_t>(dropped.m_idx));
            if (!selected(dropped.m_depth)) {
                continue;
            }

            t_derived_member out;
            out.m_pkey.set(static_cast<std::int64_t>(dropped.m_idx));
            out.m_deleted = true;
            for (t_uindex aggnum = 0; aggnum < dropped.m_aggregates.size();
                 ++aggnum) {
                out.m_cells.emplace_back(aggnum, dropped.m_aggregates[aggnum]);
            }

            members.push_back(out);
        }

        for (t_uindex idx :
             touched_nodes(*tr, capture, m_pct_parent, m_pct_grand)) {
            const t_stnode* node = tr->find_node(idx);
            if (node == nullptr || !selected(node->m_depth)) {
                continue;
            }

            members.push_back(member(*tr, *node));
            auto changed = capture.m_changed.find(idx);
            if (changed != capture.m_changed.end()) {
                members.back().m_cells = changed->second;
            }
        }
    }

    std::shared_ptr<t_column>
    alias_column(t_uindex cidx) const override {
        const auto& role = m_roles[cidx];
        if (role.first != ROLE_AGGREGATE) {
            return nullptr;
        }

        const auto aggspecs = m_view->get_view_config()->get_aggspecs();
        auto column = tree()->get_aggtable()->get_column(m_agg_names[cidx]);
        if (!identity_extract(aggspecs[role.second], column->get_dtype())) {
            return nullptr;
        }

        return column;
    }

    bool
    previous(
        const t_derived_member& member, t_uindex cidx, t_tscalar& out
    ) const override {
        const auto& role = m_roles[cidx];
        for (const auto& cell : member.m_cells) {
            if (cell.first == role.second) {
                out = cell.second;
                return true;
            }
        }

        return false;
    }

    void
    fill(
        const t_derived_member& member,
        t_uindex idx,
        const std::vector<t_column*>& columns
    ) const override {
        const t_stree* tr = tree();
        for (t_uindex cidx = 0; cidx < columns.size(); ++cidx) {
            if (columns[cidx] == nullptr) {
                continue;
            }

            const auto& role = m_roles[cidx];
            switch (role.first) {
                case ROLE_KEY: {
                    if (role.second < member.m_path.size()) {
                        put_scalar(columns[cidx], idx, member.m_path[role.second]);
                    } else {
                        put(columns[cidx], idx, DERIVED_CELL_CLEAR, mknone());
                    }
                } break;
                case ROLE_AGGREGATE: {
                    const t_column* direct = m_direct[cidx];
                    put_scalar(
                        columns[cidx],
                        idx,
                        direct != nullptr
                            ? direct->get_scalar(member.m_row)
                            : tr->get_aggregate(member.m_handle, role.second)
                    );
                } break;
                case ROLE_NONE: {
                    put(columns[cidx], idx, DERIVED_CELL_CLEAR, mknone());
                } break;
            }
        }
    }

private:
    enum t_role : std::uint8_t { ROLE_NONE, ROLE_KEY, ROLE_AGGREGATE };

    t_stree*
    tree() const {
        return m_view->get_context()->get_trees()[0];
    }

    bool
    selected(t_uindex depth) const {
        auto config = m_view->get_view_config();
        if (config->is_total_only()) {
            return depth == 0;
        }

        if (config->is_leaves_only()) {
            return depth == m_num_pivots;
        }

        return true;
    }

    void
    snapshot_aggregates(const t_stree& tr) {
        const auto aggspecs = m_view->get_view_config()->get_aggspecs();
        auto aggtable = tr.get_aggtable();
        m_direct.assign(m_columns.size(), nullptr);
        for (t_uindex cidx = 0; cidx < m_columns.size(); ++cidx) {
            const auto& role = m_roles[cidx];
            if (role.first != ROLE_AGGREGATE) {
                continue;
            }

            const t_column* column =
                aggtable->_get_const_column(m_agg_names[cidx]);
            if (identity_extract(aggspecs[role.second], column->get_dtype())) {
                m_direct[cidx] = column;
            }
        }
    }

    t_derived_member
    member(const t_stree& tr, const t_stnode& node) {
        t_derived_member out;
        out.m_pkey.set(static_cast<std::int64_t>(node.m_idx));
        out.m_row = node.m_aggidx;
        out.m_handle = node.m_idx;
        if (node.m_depth > 0) {
            out.m_path = m_paths.get(
                tr, static_cast<std::int64_t>(node.m_idx), node.m_idx
            );
        }

        return out;
    }

    std::shared_ptr<View<t_ctx1>> m_view;
    std::shared_ptr<Table> m_parent;
    t_uindex m_num_pivots = 0;
    t_uindex m_num_visible = 0;
    std::vector<std::pair<t_role, t_uindex>> m_roles;
    std::vector<std::string> m_agg_names;
    std::vector<const t_column*> m_direct;
    t_path_cache m_paths;
    std::shared_ptr<t_stree_capture> m_capture;
};

/**
 * @brief The source for a `split_by` view, one row per row node and one
 * column per column path and aggregate.
 */
class t_wide_derived_source : public t_derived_source {
public:
    t_wide_derived_source(
        std::shared_ptr<View<t_ctx2>> view, std::shared_ptr<Table> parent
    ) :
        m_view(std::move(view)),
        m_parent(std::move(parent)) {
        auto config = m_view->get_view_config();
        m_column_only = config->is_column_only();
        m_num_row_pivots = config->get_row_pivots().size();
        m_num_column_pivots = config->get_column_pivots().size();
        m_num_visible = config->get_columns().size();
        init_pct_flags(*config);
    }

    t_schema
    infer_schema() const override {
        auto config = m_view->get_view_config();
        t_schema parent_schema = m_parent->get_schema();
        std::vector<std::string> names;
        std::vector<t_dtype> types;
        const auto pivots = key_pivots();
        for (t_uindex depth = 0; depth < pivots.size(); ++depth) {
            names.push_back(pivots[depth]);
            types.push_back(pivot_dtype(parent_schema, *config, pivots[depth]));
        }

        const auto aggspecs = config->get_aggspecs();
        const t_stree* tr = trees().back();
        const tsl::hopscotch_set<std::string> keys(names.begin(), names.end());
        tsl::hopscotch_set<std::string> seen;
        for (const auto& path : m_view->column_names()) {
            if (path.empty() || !column_selected(path.size() - 1)) {
                continue;
            }

            std::string aggregate = path.back().to_string();
            for (t_uindex aggnum = 0; aggnum < m_num_visible; ++aggnum) {
                if (aggspecs[aggnum].name() != aggregate) {
                    continue;
                }

                std::string name;
                for (t_uindex pidx = 0; pidx + 1 < path.size(); ++pidx) {
                    name += path[pidx].to_string() + "|";
                }

                name += config->readable_aggregate_name(aggspecs[aggnum]);
                if (keys.count(name) > 0) {
                    PSP_COMPLAIN_AND_ABORT(
                        "Duplicate column '" + name
                        + "' in derived table schema"
                    );
                }

                if (seen.insert(name).second) {
                    names.push_back(name);
                    types.push_back(aggregate_dtype(*tr, aggspecs[aggnum]));
                }
            }
        }

        return {names, types};
    }

    t_dtype
    pkey_dtype() const override {
        return DTYPE_INT64;
    }

    void
    detach() override {
        auto all = trees();
        for (t_uindex depth = 0; depth < m_captures.size(); ++depth) {
            all[depth]->remove_capture(m_captures[depth]);
        }
    }

protected:
    void
    resolve(const t_schema& schema) override {
        const auto config = m_view->get_view_config();
        const auto aggspecs = config->get_aggspecs();
        const auto pivots = key_pivots();
        m_key_columns.assign(pivots.size(), -1);
        m_cell_columns.clear();
        m_cell_names.clear();
        for (t_uindex aggnum = 0; aggnum < m_num_visible; ++aggnum) {
            m_cell_names.push_back(
                config->readable_aggregate_name(aggspecs[aggnum])
            );
        }

        for (t_uindex cidx = 0; cidx < m_columns.size(); ++cidx) {
            bool is_key = false;
            for (t_uindex depth = 0; depth < pivots.size(); ++depth) {
                if (pivots[depth] == m_columns[cidx]) {
                    m_key_columns[depth] = static_cast<t_index>(cidx);
                    is_key = true;
                }
            }

            if (!is_key) {
                m_cell_columns[m_columns[cidx]] = cidx;
            }
        }
    }

    t_uindex
    storage_generation() const override {
        return m_view->get_context()->get_storage_generation();
    }

    void
    collect(bool full, std::vector<t_derived_member>& members) override {
        if (full) {
            m_free_rows.clear();
            m_freed_rows.clear();
            m_next_row = 0;
            m_paths.clear();
            m_cell_index.clear();
        } else {
            m_free_rows.insert(
                m_free_rows.end(), m_freed_rows.begin(), m_freed_rows.end()
            );
            m_freed_rows.clear();
        }

        tsl::hopscotch_map<std::int64_t, t_uindex> index;
        auto all = trees();
        m_captures.resize(all.size());
        for (t_uindex depth = 0; depth < all.size(); ++depth) {
            if (!row_selected(depth)) {
                continue;
            }

            t_stree* tr = all[depth];
            if (full) {
                tr->remove_capture(m_captures[depth]);
                m_captures[depth] = std::make_shared<t_stree_capture>();
                tr->add_capture(m_captures[depth]);
                tr->for_each_node([&](const t_stnode& node) {
                    add_node(*tr, depth, node.m_idx, members, index);
                });
                continue;
            }

            t_stree_capture capture;
            std::swap(capture, *m_captures[depth]);
            for (const auto& dropped : capture.m_dropped) {
                forget_node(all.size(), dropped.m_idx);
                add_dropped(*tr, depth, dropped, members, index);
            }

            for (t_uindex idx :
                 touched_nodes(*tr, capture, m_pct_parent, m_pct_grand)) {
                if (tr->node_exists(idx)) {
                    add_node(*tr, depth, idx, members, index);
                }
            }
        }
    }

    void
    fill(
        const t_derived_member& member,
        t_uindex idx,
        const std::vector<t_column*>& columns
    ) const override {
        for (t_uindex depth = 0; depth < m_key_columns.size(); ++depth) {
            if (m_key_columns[depth] < 0) {
                continue;
            }

            t_column* column = columns[m_key_columns[depth]];
            if (depth < member.m_path.size()) {
                put_scalar(column, idx, member.m_path[depth]);
            } else {
                put(column, idx, DERIVED_CELL_CLEAR, mknone());
            }
        }

        for (const auto& cell : member.m_cells) {
            put_scalar(columns[cell.first], idx, cell.second);
        }
    }

private:
    using t_cell_index = std::vector<std::pair<t_uindex, t_uindex>>;

    std::vector<t_stree*>
    trees() const {
        return m_view->get_context()->get_trees();
    }

    std::vector<std::string>
    key_pivots() const {
        if (m_column_only) {
            return {};
        }

        return m_view->get_view_config()->get_row_pivots();
    }

    bool
    row_selected(t_uindex depth) const {
        auto config = m_view->get_view_config();
        if (config->is_total_only() || m_num_row_pivots == 0) {
            return depth == 0;
        }

        if (m_column_only || config->is_leaves_only()) {
            return depth == m_num_row_pivots;
        }

        return true;
    }

    bool
    column_selected(t_uindex depth) const {
        if (m_view->get_view_config()->is_split_rollup()) {
            return true;
        }

        return depth == m_num_column_pivots;
    }

    t_uindex
    allocate_row() {
        if (!m_free_rows.empty()) {
            t_uindex row = m_free_rows.back();
            m_free_rows.pop_back();
            return row;
        }

        return m_next_row++;
    }

    void
    forget_node(t_uindex num_depths, t_uindex idx) {
        for (t_uindex depth = 0; depth < num_depths; ++depth) {
            m_paths.erase(wide_key(depth, idx));
            m_cell_index.erase(wide_key(depth, idx));
        }
    }

    t_derived_member&
    ensure_row(
        const t_stree& tr,
        t_uindex depth,
        t_uindex ridx,
        std::vector<t_derived_member>& members,
        tsl::hopscotch_map<std::int64_t, t_uindex>& index
    ) {
        std::int64_t key = wide_key(depth, ridx);
        auto iter = index.find(key);
        if (iter != index.end()) {
            return members[iter->second];
        }

        t_derived_member out;
        out.m_pkey.set(key);
        out.m_handle = ridx;
        out.m_depth = depth;
        out.m_path = m_paths.get(tr, key, ridx);
        t_index bound = bound_row(out.m_pkey);
        out.m_row = bound >= 0 ? static_cast<t_uindex>(bound) : allocate_row();
        index[key] = members.size();
        members.push_back(std::move(out));
        return members.back();
    }

    t_cell_index
    resolve_cells(const std::vector<t_tscalar>& path, t_uindex depth) const {
        std::string prefix;
        for (t_uindex pidx = depth; pidx < path.size(); ++pidx) {
            prefix += path[pidx].to_string() + "|";
        }

        t_cell_index cells;
        for (t_uindex aggnum = 0; aggnum < m_num_visible; ++aggnum) {
            auto iter = m_cell_columns.find(prefix + m_cell_names[aggnum]);
            if (iter != m_cell_columns.end()) {
                cells.emplace_back(aggnum, iter->second);
            }
        }

        return cells;
    }

    const t_cell_index&
    cells_for(const t_stree& tr, t_uindex depth, t_uindex idx) {
        std::int64_t key = wide_key(depth, idx);
        auto iter = m_cell_index.find(key);
        if (iter == m_cell_index.end()) {
            iter = m_cell_index
                       .emplace(
                           key, resolve_cells(m_paths.get(tr, key, idx), depth)
                       )
                       .first;
        }

        return iter->second;
    }

    void
    add_node(
        const t_stree& tr,
        t_uindex depth,
        t_uindex idx,
        std::vector<t_derived_member>& members,
        tsl::hopscotch_map<std::int64_t, t_uindex>& index
    ) {
        t_uindex node_depth = tr.get_depth(idx);
        if (node_depth < depth) {
            return;
        }

        t_uindex ridx = idx;
        for (t_uindex step = node_depth; step > depth; --step) {
            ridx = tr.get_parent_idx(ridx);
        }

        t_derived_member& row = ensure_row(tr, depth, ridx, members, index);
        if (!column_selected(node_depth - depth)) {
            return;
        }

        for (const auto& [aggnum, cidx] : cells_for(tr, depth, idx)) {
            row.m_cells.emplace_back(cidx, tr.get_aggregate(idx, aggnum));
        }
    }

    void
    add_dropped(
        const t_stree& tr,
        t_uindex depth,
        const t_stree_dropped& dropped,
        std::vector<t_derived_member>& members,
        tsl::hopscotch_map<std::int64_t, t_uindex>& index
    ) {
        if (dropped.m_depth < depth) {
            return;
        }

        if (dropped.m_depth == depth) {
            t_derived_member out;
            out.m_pkey.set(wide_key(depth, dropped.m_idx));
            out.m_deleted = true;
            t_index bound = bound_row(out.m_pkey);
            if (bound >= 0) {
                m_freed_rows.push_back(static_cast<t_uindex>(bound));
                members.push_back(std::move(out));
            }

            return;
        }

        if (!column_selected(dropped.m_depth - depth)) {
            return;
        }

        std::vector<t_tscalar> row_path(
            dropped.m_path.begin(), dropped.m_path.begin() + depth
        );
        std::reverse(row_path.begin(), row_path.end());
        t_index ridx = depth == 0 ? 0 : tr.resolve_path(0, row_path);
        if (ridx == INVALID_INDEX || !tr.node_exists(ridx)) {
            return;
        }

        t_derived_member& row = ensure_row(
            tr, depth, static_cast<t_uindex>(ridx), members, index
        );
        for (const auto& [aggnum, cidx] : resolve_cells(dropped.m_path, depth)) {
            row.m_cells.emplace_back(cidx, mknone());
        }
    }

    std::shared_ptr<View<t_ctx2>> m_view;
    std::shared_ptr<Table> m_parent;
    bool m_column_only = false;
    t_uindex m_num_row_pivots = 0;
    t_uindex m_num_column_pivots = 0;
    t_uindex m_num_visible = 0;
    std::vector<t_index> m_key_columns;
    std::vector<std::string> m_cell_names;
    tsl::hopscotch_map<std::string, t_uindex> m_cell_columns;
    tsl::hopscotch_map<std::int64_t, t_cell_index> m_cell_index;
    t_path_cache m_paths;
    std::vector<t_uindex> m_free_rows;
    std::vector<t_uindex> m_freed_rows;
    t_uindex m_next_row = 0;
    std::vector<std::shared_ptr<t_stree_capture>> m_captures;
};

namespace {
    bool
    flat_has_member(
        const t_ctx0& ctx, const t_gstate::t_mapping&, const t_tscalar& pkey
    ) {
        return ctx.has_pkey(pkey);
    }

    bool
    flat_has_member(
        const t_ctxunit&,
        const t_gstate::t_mapping& mapping,
        const t_tscalar& pkey
    ) {
        return mapping.find(pkey) != mapping.end();
    }

    std::shared_ptr<t_data_table>
    flat_expression_master(const t_ctx0& ctx) {
        return ctx.get_expression_tables()->m_master;
    }

    std::shared_ptr<t_data_table>
    flat_expression_master(const t_ctxunit&) {
        return nullptr;
    }

    std::shared_ptr<t_data_table>
    flat_expression_prev(const t_ctx0& ctx) {
        return ctx.get_expression_tables()->m_prev;
    }

    std::shared_ptr<t_data_table>
    flat_expression_prev(const t_ctxunit&) {
        return nullptr;
    }

    std::vector<t_tscalar>
    flat_members(const t_ctx0& ctx, const t_gstate::t_mapping&) {
        return ctx.get_member_pkeys();
    }

    std::vector<t_tscalar>
    flat_members(const t_ctxunit&, const t_gstate::t_mapping& mapping) {
        std::vector<t_tscalar> pkeys;
        pkeys.reserve(mapping.size());
        for (const auto& kv : mapping) {
            pkeys.push_back(kv.first);
        }

        return pkeys;
    }
} // namespace

/**
 * @brief The source for an unpivoted view, one row per row passing its filter.
 */
template <typename CTX_T>
class t_flat_derived_source : public t_derived_source {
public:
    t_flat_derived_source(
        std::shared_ptr<View<CTX_T>> view, std::shared_ptr<Table> parent
    ) :
        m_view(std::move(view)),
        m_parent(std::move(parent)) {}

    t_schema
    infer_schema() const override {
        t_schema parent_schema = m_parent->get_schema();
        auto expressions = flat_expression_master(*(m_view->get_context()));
        std::vector<std::string> names;
        std::vector<t_dtype> types;
        for (const auto& name : m_view->get_view_config()->get_columns()) {
            if (parent_schema.has_column(name)) {
                names.push_back(name);
                types.push_back(parent_schema.get_dtype(name));
            } else if (expressions && expressions->get_schema().has_column(name)) {
                names.push_back(name);
                types.push_back(expressions->get_schema().get_dtype(name));
            }
        }

        return {names, types};
    }

    t_dtype
    pkey_dtype() const override {
        return m_parent->get_gnode()->get_table_sptr()->get_schema().get_dtype(
            "psp_pkey"
        );
    }

    std::string
    index() const override {
        const std::string& index = m_parent->get_index();
        const auto columns = m_view->get_view_config()->get_columns();
        if (std::find(columns.begin(), columns.end(), index) == columns.end()) {
            return "";
        }

        return index;
    }

    std::uint32_t
    limit() const override {
        return m_parent->get_limit();
    }

protected:
    void
    resolve(const t_schema& schema) override {}

    t_uindex
    storage_generation() const override {
        return m_view->get_context()->get_storage_generation();
    }

    void
    collect(bool full, std::vector<t_derived_member>& members) override {
        auto gnode = m_parent->get_gnode();
        std::shared_ptr<t_data_table> master = gnode->get_table_sptr();
        auto expressions = flat_expression_master(*(m_view->get_context()));
        m_sources.assign(m_columns.size(), nullptr);
        for (t_uindex cidx = 0; cidx < m_columns.size(); ++cidx) {
            const std::string& name = m_columns[cidx];
            if (master->get_schema().has_column(name)) {
                m_sources[cidx] = master->_get_const_column(name);
            } else if (expressions && expressions->get_schema().has_column(name)) {
                m_sources[cidx] = expressions->_get_const_column(name);
            }
        }

        const auto& mapping = gnode->get_pkey_map();
        const CTX_T& ctx = *(m_view->get_context());
        if (full) {
            m_previous.clear();
            for (const t_tscalar& pkey : flat_members(ctx, mapping)) {
                add_member(mapping, pkey, false, members);
            }

            return;
        }

        const t_data_table* flattened = gnode->_get_otable(PSP_PORT_FLATTENED);
        const t_data_table* prev = gnode->_get_otable(PSP_PORT_PREV);
        auto expression_prev = flat_expression_prev(ctx);
        m_previous.assign(m_columns.size(), nullptr);
        for (t_uindex cidx = 0; cidx < m_columns.size(); ++cidx) {
            const std::string& name = m_columns[cidx];
            if (prev->get_schema().has_column(name)) {
                m_previous[cidx] = prev->_get_const_column(name);
            } else if (expression_prev
                       && expression_prev->get_schema().has_column(name)) {
                m_previous[cidx] = expression_prev->_get_const_column(name);
            }
        }

        const t_column* pkey_col = flattened->_get_const_column("psp_pkey");
        const t_column* op_col = flattened->_get_const_column("psp_op");
        for (t_uindex idx = 0; idx < flattened->size(); ++idx) {
            t_tscalar pkey = pkey_col->get_scalar(idx);
            bool removed =
                *(op_col->get_nth<std::uint8_t>(idx)) == OP_DELETE
                || !flat_has_member(ctx, mapping, pkey);
            add_member(mapping, pkey, removed, members);
            members.back().m_handle = idx;
        }
    }

    std::shared_ptr<t_column>
    alias_column(t_uindex cidx) const override {
        if (m_parent->get_backing_store() != BACKING_STORE_MEMORY) {
            return nullptr;
        }

        const std::string& name = m_columns[cidx];
        auto master = m_parent->get_gnode()->get_table_sptr();
        if (master->get_schema().has_column(name)) {
            return master->get_column(name);
        }

        auto expressions = flat_expression_master(*(m_view->get_context()));
        if (expressions && expressions->get_schema().has_column(name)) {
            return expressions->get_column(name);
        }

        return nullptr;
    }

    bool
    previous(
        const t_derived_member& member, t_uindex cidx, t_tscalar& out
    ) const override {
        if (cidx >= m_previous.size()) {
            return false;
        }

        const t_column* source = m_previous[cidx];
        if (source == nullptr || member.m_handle >= source->size()) {
            return false;
        }

        out = source->is_valid(member.m_handle)
            ? source->get_scalar(member.m_handle)
            : mknone();
        return true;
    }

    void
    fill(
        const t_derived_member& member,
        t_uindex idx,
        const std::vector<t_column*>& columns
    ) const override {
        for (t_uindex cidx = 0; cidx < columns.size(); ++cidx) {
            if (columns[cidx] == nullptr) {
                continue;
            }

            const t_column* source = m_sources[cidx];
            if (source != nullptr && source->is_valid(member.m_row)) {
                put(columns[cidx],
                    idx,
                    DERIVED_CELL_SET,
                    source->get_scalar(member.m_row));
            } else {
                put(columns[cidx], idx, DERIVED_CELL_CLEAR, mknone());
            }
        }
    }

private:
    void
    add_member(
        const t_gstate::t_mapping& mapping,
        const t_tscalar& pkey,
        bool removed,
        std::vector<t_derived_member>& members
    ) const {
        t_derived_member out;
        out.m_pkey = pkey;
        auto iter = mapping.find(pkey);
        if (removed || iter == mapping.end()) {
            out.m_deleted = true;
        } else {
            out.m_row = iter->second;
        }

        members.push_back(std::move(out));
    }

    std::shared_ptr<View<CTX_T>> m_view;
    std::shared_ptr<Table> m_parent;
    std::vector<const t_column*> m_sources;
    std::vector<const t_column*> m_previous;
};

std::shared_ptr<t_derived_source>
make_derived_source(
    const std::shared_ptr<View<t_ctxunit>>& view,
    const std::shared_ptr<Table>& parent
) {
    return std::make_shared<t_flat_derived_source<t_ctxunit>>(view, parent);
}

std::shared_ptr<t_derived_source>
make_derived_source(
    const std::shared_ptr<View<t_ctx0>>& view,
    const std::shared_ptr<Table>& parent
) {
    return std::make_shared<t_flat_derived_source<t_ctx0>>(view, parent);
}

std::shared_ptr<t_derived_source>
make_derived_source(
    const std::shared_ptr<View<t_ctx1>>& view,
    const std::shared_ptr<Table>& parent
) {
    return std::make_shared<t_tree_derived_source>(view, parent);
}

std::shared_ptr<t_derived_source>
make_derived_source(
    const std::shared_ptr<View<t_ctx2>>& view,
    const std::shared_ptr<Table>& parent
) {
    return std::make_shared<t_wide_derived_source>(view, parent);
}

} // namespace perspective
