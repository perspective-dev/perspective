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
#include <memory>
#include <vector>
#include <map>
#include <algorithm>
#include <functional>
#include <iostream>
#include <perspective/multi_sort.h>
#include <perspective/sort_specification.h>
#include <perspective/gnode_state.h>
#include <perspective/config.h>
#include <perspective/exports.h>
#include <perspective/sym_table.h>
#include <set>
#include <tsl/hopscotch_map.h>

namespace perspective {

class PERSPECTIVE_EXPORT t_ftrav {

public:
    t_ftrav();

    void init();

    std::vector<t_tscalar>
    get_all_pkeys(const std::vector<std::pair<t_uindex, t_uindex>>& cells
    ) const;

    std::vector<t_tscalar>
    get_pkeys(const std::vector<std::pair<t_uindex, t_uindex>>& cells) const;

    std::vector<t_tscalar> get_pkeys() const;
    std::vector<t_tscalar> get_pkeys(t_index begin_row, t_index end_row) const;
    std::vector<t_tscalar> get_pkeys(const std::vector<t_uindex>& rows) const;

    t_tscalar get_pkey(t_index idx) const;

    void fill_sort_elem(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const t_config& config,
        t_tscalar pkey,
        t_mselem& out_elem
    );

    // sorting over a whole row whose data we already have, so we don't need
    // the expression table separately.
    void fill_sort_elem(
        const t_gstate& gstate,
        const t_config& config,
        const std::vector<t_tscalar>& row,
        t_mselem& out_elem
    ) const;

    void sort_by(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const t_config& config,
        const std::vector<t_sortspec>& sortby
    );

    t_index size() const;

    void get_row_indices(
        const tsl::hopscotch_set<t_tscalar>& pkeys,
        tsl::hopscotch_map<t_tscalar, t_index>& out_map
    ) const;

    void get_row_indices(
        t_index bidx,
        t_index eidx,
        const tsl::hopscotch_set<t_tscalar>& pkeys,
        tsl::hopscotch_map<t_tscalar, t_index>& out_map
    ) const;

    std::vector<t_uindex>
    get_row_indices(const tsl::hopscotch_set<t_tscalar>& pkeys) const;

    void reset();

    void check_size();

    bool validate_cells(const std::vector<std::pair<t_uindex, t_uindex>>& cells
    ) const;

    void step_begin();

    void step_end();

    void add_row(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const t_config& config,
        t_tscalar pkey
    );

    void update_row(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const t_config& config,
        t_tscalar pkey
    );

    void delete_row(t_tscalar pkey);

    std::vector<t_sortspec> get_sort_by() const;
    bool empty_sort_by() const;

    // Fast-path initialization for unsorted traversals: append pkeys
    // directly to `m_index` in one shot, skipping the `m_new_elems`
    // hopscotch_map round-trip and the `new_rows` intermediate vector
    // that a normal `add_row` / `step_end` pair would incur. Only valid
    // when `empty_sort_by()` is true and the traversal is otherwise empty
    // (i.e. during initial registration of a ctx0 without a sort).
    //
    // Call `bulk_load_reserve(n)` first, then `bulk_load_append(pkey)`
    // once per pkey, then `bulk_load_finalize()` to sort by pkey (the
    // implicit order used by `cmp_mselem` with an empty sort spec) and
    // build `m_pkeyidx`. After finalize, `step_end` short-circuits
    // because `m_step_inserts` remains 0.
    void bulk_load_reserve(t_uindex n);
    void bulk_load_append(t_tscalar pkey);
    void bulk_load_finalize();

    void reset_step_state();

    t_uindex lower_bound_row_idx(
        const t_gstate& gstate,
        const t_config& config,
        const std::vector<t_tscalar>& row
    ) const;

    t_index get_row_idx(t_tscalar pkey) const;

private:
    t_tscalar get_from_gstate(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const std::string& colname,
        t_tscalar pkey
    ) const;

    t_index m_step_deletes;
    t_index m_step_inserts;

    // map primary keys to row indices
    tsl::hopscotch_map<t_tscalar, t_uindex> m_pkeyidx;

    // map primary keys to sort items
    tsl::hopscotch_map<t_tscalar, t_mselem> m_new_elems;

    std::vector<t_sortspec> m_sortby;
    std::shared_ptr<std::vector<t_mselem>> m_index;
    t_symtable m_symtable;
};

} // end namespace perspective
