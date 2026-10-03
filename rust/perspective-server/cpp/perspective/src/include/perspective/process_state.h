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
#include <perspective/port.h>
#include <perspective/schema.h>
#include <perspective/rlookup.h>

namespace perspective {

/**
 * @brief Manages the intermediate data structures and transitional
 * `t_data_table`s associated with a single call to `t_gnode::_process_table`.
 */
struct t_process_state {
    t_process_state();

    /**
     * @brief Clear each transitional `t_data_table`, i.e. all tables except
     * `flattened` and `state`.
     */
    void clear_transitional_data_tables() const;

    /**
     * @brief Reserve `size` elements for each transitional table in the state.
     *
     * @param size
     */
    void reserve_transitional_data_tables(t_uindex size) const;

    /**
     * @brief For each transitional table in the state, set its size to `size`.
     *
     * @param size
     */
    void set_size_transitional_data_tables(t_uindex size) const;

    std::shared_ptr<t_data_table> m_state_data_table;
    std::shared_ptr<t_data_table> m_flattened_data_table;
    std::shared_ptr<t_data_table> m_prev_data_table;
    std::shared_ptr<t_data_table> m_current_data_table;
    std::shared_ptr<t_data_table> m_transitions_data_table;
    std::shared_ptr<t_data_table> m_existed_data_table;

    std::vector<t_rlookup> m_lookup;
    std::vector<t_uindex> m_col_translation;
    std::vector<t_uindex> m_added_offset;
    std::vector<bool> m_prev_pkey_eq_vec;

    std::uint8_t* m_op_base;
};

} // end namespace perspective