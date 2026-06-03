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
#include <perspective/computed_expression.h>
#include <perspective/data_table.h>
#include <perspective/parallel_for.h>

namespace perspective {

/**
 * @brief Store expression tables for each context - by separating expression
 * columns from the main tables managed by the context, we ensure that cleaning
 * up a context will also clean up its expression columns and not leak memory
 * after the lifetime of a context.
 */
struct t_expression_tables {

    PSP_NON_COPYABLE(t_expression_tables);

    t_expression_tables(
        const std::vector<std::shared_ptr<t_computed_expression>>& expressions,
        t_backing_store backing_store = BACKING_STORE_MEMORY
    );

    /**
     * @brief Reserve space on each transitional table - reserve is important
     * because it also reserves space on each underlying column, whereas
     * `set_capacity` only affects the table, and can lead to a situation where
     * the table's capacity and the capacity of underlying columns grow out
     * of sync, which causes memory errors.
     *
     * @param size
     */
    void reserve_transitional_table_size(t_uindex size) const;

    void set_transitional_table_size(t_uindex size) const;

    void clear_transitional_tables() const;

    // Calculate the `t_transitions` value for each row.
    void calculate_transitions(const std::shared_ptr<t_data_table>& existed);

    void set_flattened(const std::shared_ptr<t_data_table>& flattened) const;

    void reset() const;

    t_data_table* get_table() const;

    // master table is calculated from t_gstate's master table
    std::shared_ptr<t_data_table> m_master;

    // flattened, prev, current, delta, transitions calculated from the
    // tables stored on the gnode's output ports.
    std::shared_ptr<t_data_table> m_flattened;
    std::shared_ptr<t_data_table> m_prev;
    std::shared_ptr<t_data_table> m_current;
    std::shared_ptr<t_data_table> m_delta;
    std::shared_ptr<t_data_table> m_transitions;
};

} // end namespace perspective