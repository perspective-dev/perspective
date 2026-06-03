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
#include <perspective/exports.h>
#include <perspective/aggspec.h>
#include <perspective/filter.h>
#include <perspective/pivot.h>
#include <perspective/schema.h>
#include <perspective/sort_specification.h>
#include <perspective/computed_expression.h>

namespace perspective {

/**
 * @brief `t_config` contains metadata for the `View` and `t_ctx*` structures,
 * containing specifications for how pivots, columns, filters, and sorts should
 * be constructed.
 *
 */
class PERSPECTIVE_EXPORT t_config {
public:
    /**
     * @brief Construct a new config for a `t_ctxunit` object.
     *
     * @param detail_columns the columns to be displayed in the context
     */
    t_config(const std::vector<std::string>& detail_columns);

    /**
     * @brief Construct a new config for a `t_ctx0` object.
     *
     * @param detail_columns the columns to be displayed in the context
     * @param combiner
     * @param fterms specifications for filtering down the context
     */
    t_config(
        const std::vector<std::string>& detail_columns,
        const std::vector<t_fterm>& fterms,
        t_filter_op combiner,
        const std::vector<std::shared_ptr<t_computed_expression>>& expressions
    );

    /**
     * @brief Construct a new config for a `t_ctx1` object, which has 1 or more
     * `row_pivot`s applied.
     *
     * @param row_pivots
     * @param aggregates
     * @param combiner
     * @param fterms
     */
    t_config(
        const std::vector<std::string>& row_pivots,
        const std::vector<t_aggspec>& aggregates,
        const std::vector<t_fterm>& fterms,
        t_filter_op combiner,
        const std::vector<std::shared_ptr<t_computed_expression>>& expressions
    );

    /**
     * @brief Construct a new config for a `t_ctx2` object, which has 1 or more
     * `row_pivot`s and 1 or more `col_pivot`s applied.
     *
     * @param row_pivots
     * @param col_pivots
     * @param aggregates
     * @param totals
     * @param combiner
     * @param fterms
     * @param column_only
     */
    t_config(
        const std::vector<std::string>& row_pivots,
        const std::vector<std::string>& col_pivots,
        const std::vector<t_aggspec>& aggregates,
        const t_totals totals,
        const std::vector<t_fterm>& fterms,
        t_filter_op combiner,
        const std::vector<std::shared_ptr<t_computed_expression>>& expressions,
        bool column_only
    );

    // An empty config, used for the unit context.
    t_config();

    // Constructors used for C++ tests, not exposed to other parts of the engine
    t_config(
        const std::vector<std::string>& row_pivots,
        const std::vector<std::string>& col_pivots,
        const std::vector<t_aggspec>& aggregates
    );

    t_config(
        const std::vector<std::string>& row_pivots,
        const std::vector<std::string>& col_pivots,
        const std::vector<t_aggspec>& aggregates,
        const t_totals totals,
        t_filter_op combiner,
        const std::vector<t_fterm>& fterms
    );

    t_config(
        const std::vector<t_pivot>& row_pivots,
        const std::vector<t_aggspec>& aggregates
    );

    t_config(
        const std::vector<std::string>& row_pivots,
        const std::vector<t_aggspec>& aggregates
    );

    t_config(const std::vector<std::string>& row_pivots, const t_aggspec& agg);

    /**
     * @brief For each column in the config's `detail_columns` (i.e. visible
     * columns), add it to the internal map tracking column indices.
     *
     * @param detail_columns
     */
    void setup(const std::vector<std::string>& detail_columns);

    void setup(
        const std::vector<std::string>& detail_columns,
        const std::vector<std::string>& sort_pivot,
        const std::vector<std::string>& sort_pivot_by
    );

    /**
     * @brief A t_config is trivial if it does not have any pivots, sorts,
     * filter terms, or expressions. This allows a context_zero to
     * skip creating a traversal and simply read from its gnode state for
     * a performance boost.
     *
     * @return true
     * @return false
     */
    bool is_trivial_config() const;

    t_index get_colidx(const std::string& colname) const;

    std::string repr() const;

    t_uindex get_num_aggregates() const;

    t_uindex get_num_columns() const;

    std::string col_at(t_uindex idx) const;

    bool has_pkey_agg() const;

    std::string get_totals_string() const;

    std::string get_sort_by(const std::string& pivot) const;

    bool validate_colidx(t_index idx) const;

    std::vector<std::string> get_column_names() const;
    t_uindex get_num_rpivots() const;
    t_uindex get_num_cpivots() const;
    bool is_column_only() const;

    std::vector<t_pivot> get_pivots() const;
    const std::vector<t_pivot>& get_row_pivots() const;
    const std::vector<t_pivot>& get_column_pivots() const;
    const std::vector<t_aggspec>& get_aggregates() const;

    std::vector<std::pair<std::string, std::string>> get_sortby_pairs() const;
    const std::vector<t_sortspec>& get_sortspecs() const;
    const std::vector<t_sortspec>& get_col_sortspecs() const;

    bool has_filters() const;

    const std::vector<t_fterm>& get_fterms() const;

    std::vector<std::shared_ptr<t_computed_expression>> get_expressions() const;

    t_totals get_totals() const;

    t_filter_op get_combiner() const;

    std::string get_parent_pkey_column() const;

    std::string get_child_pkey_column() const;

    const std::string& get_grouping_label_column() const;

    std::string unity_get_column_name(t_uindex idx) const;
    std::string unity_get_column_display_name(t_uindex idx) const;
    t_fmode get_fmode() const;

    inline const std::string&
    get_grand_agg_str() const {
        return m_grand_agg_str;
    }

    // The backing store for any persistent storage created by the context built
    // from this config (currently the expression `m_master` table). Inherited
    // from the parent `Table`'s backing store. Defaults to memory.
    inline void
    set_backing_store(t_backing_store backing_store) {
        m_backing_store = backing_store;
    }

    inline t_backing_store
    get_backing_store() const {
        return m_backing_store;
    }

protected:
    void populate_sortby(const std::vector<t_pivot>& pivots);

private:
    // Set at initialization and accessible through a public API.
    std::vector<std::string> m_detail_columns;
    std::vector<t_pivot> m_row_pivots;
    std::vector<t_pivot> m_col_pivots;
    std::vector<t_aggspec> m_aggregates;
    std::map<std::string, std::string> m_sortby;
    std::vector<t_sortspec> m_sortspecs;
    std::vector<t_sortspec> m_col_sortspecs;
    std::vector<t_fterm> m_fterms;
    std::vector<std::shared_ptr<t_computed_expression>> m_expressions;
    t_filter_op m_combiner;
    bool m_column_only;

    // A trivial config exists if there are no pivots, sorts, filters, or
    // expression columns.
    bool m_is_trivial_config;

    // Internal
    t_totals m_totals;
    std::map<std::string, t_index> m_detail_colmap;
    std::string m_parent_pkey_column;
    std::string m_child_pkey_column;
    std::string m_grouping_label_column;
    std::string m_grand_agg_str;
    t_fmode m_fmode;
    bool m_has_pkey_agg;
    t_backing_store m_backing_store = BACKING_STORE_MEMORY;
};

} // end namespace perspective
