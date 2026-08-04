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
#include <perspective/data_table.h>
#include <perspective/expression_tables.h>
#include <perspective/expression_vocab.h>
#include <perspective/regex.h>
#include <tsl/hopscotch_set.h>

namespace perspective {

class t_data_table;

class PERSPECTIVE_EXPORT t_ctx0 : public t_ctxbase<t_ctx0> {
public:
    t_ctx0();

    t_ctx0(const t_schema& schema, const t_config& config);

    ~t_ctx0();
#include <perspective/context_common_decls.h>

    t_tscalar get_column_name(t_index idx);

    std::vector<std::string> get_column_names() const;

    const tsl::hopscotch_set<t_tscalar>& get_delta_pkeys() const;

    void sort_by();
    std::vector<t_sortspec> get_sort_by() const;

    std::pair<t_tscalar, t_tscalar> get_min_max(const std::string& colname
    ) const;

    using t_ctxbase<t_ctx0>::get_data;

protected:
    std::vector<t_tscalar>
    get_all_pkeys(const std::vector<std::pair<t_uindex, t_uindex>>& cells
    ) const;

    /**
     * @brief During a call to `notify` when the master table is being updated
     * with data for the first time (prev, curr, and transitions tables are
     * empty), take all added rows in the traversal and store them in
     * `m_deltas`.
     *
     * @param flattened
     */
    void calc_step_delta(const t_data_table& flattened);

    /**
     * @brief During a call to `notify` when the master table has data,
     * calculate the deltas - both changed and added cells, and write them
     * to `m_deltas`.
     *
     * @param flattened
     * @param prev
     * @param curr
     * @param transitions
     */
    void calc_step_delta(
        const t_data_table& flattened,
        const t_data_table& prev,
        const t_data_table& curr,
        const t_data_table& transitions
    );

    void add_delta_pkey(t_tscalar pkey);

    /**
     * @brief Read the specified column using the gnode's mapping - if the
     * column is an expression column, uses the expression master table,
     * otherwise use the gstate master table.
     *
     * @param colname
     * @param pkeys
     * @param out_data
     */
    void read_column_from_gstate(
        const std::string& colname,
        const std::vector<t_tscalar>& pkeys,
        std::vector<t_tscalar>& out_data
    ) const;

private:
    std::shared_ptr<t_ftrav> m_traversal;
    std::shared_ptr<t_zcdeltas> m_deltas;
    tsl::hopscotch_set<t_tscalar> m_delta_pkeys;
    std::shared_ptr<t_expression_tables> m_expression_tables;
    std::shared_ptr<t_window_engine> m_window_engine;
    t_symtable m_symtable;
    bool m_has_delta;
};

} // end namespace perspective
