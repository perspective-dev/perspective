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
#include <perspective/context_base.h>
#include <perspective/sort_specification.h>

#include <perspective/sym_table.h>
#include <perspective/traversal.h>
#include <perspective/flat_traversal.h>
#include <tsl/hopscotch_set.h>

namespace perspective {

/**
 * @brief A context that does not maintain its own traversal, instead
 * reading directly from the underlying master table of the context's
 * gnode state.
 *
 * This context can be created when the table does not have an explicit index
 * set, as the order of rows in the master table will be exactly the same as
 * the primary key order (using PSP_PKEY). If the table has an explicit index,
 * a context's traversal contains the sorted order of primary keys and thus
 * the order in which the table is meant to be read.
 *
 * Additionally, to create a unit context, the context must have no pivots,
 * sorts, filters, or expressions applied. It can have any number of
 * columns in any order. See implementations in the binding language to see
 * how a unit context is created.
 *
 * Benchmarking shows a 5-10x improvement in View construction time compared
 * to a regular ctx_0.
 */
class PERSPECTIVE_EXPORT t_ctxunit : public t_ctxbase<t_ctxunit> {
public:
    t_ctxunit();

    t_ctxunit(const t_schema& schema, const t_config& config);

    ~t_ctxunit();

    perspective::t_index get_row_count() const;

    perspective::t_index get_column_count() const;

    std::pair<t_tscalar, t_tscalar> get_min_max(const std::string& colname
    ) const;

    using t_ctxbase<t_ctxunit>::get_data;

    std::vector<t_tscalar> get_data(
        t_index start_row, t_index end_row, t_index start_col, t_index end_col
    ) const;

    std::vector<t_tscalar> get_data(const std::vector<t_uindex>& rows) const;

    std::vector<t_tscalar> get_data(const std::vector<t_tscalar>& pkeys) const;

    // will only work on empty contexts. `is_registration` is `true` when
    // this call is part of `_register_context` (no subscriber yet) and
    // `false` when it is the first update to a previously-empty table.
    // When `true`, per-row delta tracking is skipped to avoid O(N)
    // allocations no observer can see.
    void notify(const t_data_table& flattened, bool is_registration);

    void notify(
        const t_data_table& flattened,
        const t_data_table& delta,
        const t_data_table& prev,
        const t_data_table& current,
        const t_data_table& transitions,
        const t_data_table& existed
    );

    void step_begin();

    void step_end();

    std::string repr() const;

    void init();

    void reset();

    t_index sidedness() const;

    bool get_deltas_enabled() const;
    void set_deltas_enabled(bool enabled_state);

    std::vector<t_tscalar>
    get_pkeys(const std::vector<std::pair<t_uindex, t_uindex>>& cells) const;

    t_stepdelta get_step_delta(t_index bidx, t_index eidx);

    t_rowdelta get_row_delta();

    std::vector<t_uindex> get_rows_changed();

    void clear_deltas();

    void reset_step_state();

    void disable();

    void enable();

    bool has_deltas() const;

    void pprint() const;

    t_dtype get_column_dtype(t_uindex idx) const;

    std::shared_ptr<t_data_table> get_table() const;

    t_tscalar get_column_name(t_index idx);

    std::vector<std::string> get_column_names() const;

    const tsl::hopscotch_set<t_tscalar>& get_delta_pkeys() const;

    // Unity api
    std::vector<t_tscalar> unity_get_row_data(t_uindex idx) const;
    std::vector<t_tscalar> unity_get_row_path(t_uindex idx) const;
    std::vector<t_tscalar> unity_get_column_path(t_uindex idx) const;
    t_uindex unity_get_row_depth(t_uindex ridx) const;
    t_uindex unity_get_column_depth(t_uindex cidx) const;
    std::vector<std::string> unity_get_column_names() const;
    std::vector<std::string> unity_get_column_display_names() const;
    std::string unity_get_column_name(t_uindex idx) const;
    std::string unity_get_column_display_name(t_uindex idx) const;
    t_uindex unity_get_column_count() const;
    t_uindex unity_get_row_count() const;
    bool unity_get_row_expanded(t_uindex idx) const;
    bool unity_get_column_expanded(t_uindex idx) const;

protected:
    void add_delta_pkey(t_tscalar pkey);

    void add_row(t_tscalar pkey, t_uindex idx);

    void update_row(t_tscalar pkey);

    void delete_row(t_tscalar pkey);

private:
    /**
     * The unit context does not contain `m_traversal`, as it does not need to
     * keep track of a subset of the `gnode_state`'s master table or perform
     * translations between row/column indices and primary keys. Instead, data
     * is read from the master table using row/column indices that map directly
     * to the master table's data.
     */
    tsl::hopscotch_set<t_tscalar> m_delta_pkeys;

    t_symtable m_symtable;
    bool m_has_delta;
};

} // end namespace perspective
