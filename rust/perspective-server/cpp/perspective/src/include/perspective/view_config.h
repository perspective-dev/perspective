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
#include <perspective/config.h>
#include <perspective/raw_types.h>
#include <perspective/scalar.h>
#include <perspective/computed_expression.h>
#include <tsl/ordered_map.h>
#include <tsl/hopscotch_set.h>
#include <unordered_set>
#include <tuple>

namespace perspective {

/**
 * @brief The `t_view_config` API provides a unified view configuration object,
 * which specifies how the `View` transforms the underlying `Table`. By storing
 * configuration values in native C++ types, we allow easy integration with
 * binding languages.
 *
 */
class PERSPECTIVE_EXPORT t_view_config {
public:
    /**
     * @brief Construct a `t_view_config` object.
     *
     * @param row_pivots
     * @param column_pivots
     * @param aggregates
     * @param columns
     * @param filter
     * @param sort
     */
    t_view_config(
        t_vocab vocab,
        const std::vector<std::string>& row_pivots,
        const std::vector<std::string>& column_pivots,
        const tsl::ordered_map<std::string, std::vector<std::string>>&
            aggregates,
        const std::vector<std::string>& columns,
        const std::vector<
            std::tuple<std::string, std::string, std::vector<t_tscalar>>>&
            filter,
        const std::vector<std::vector<std::string>>& sort,
        const std::vector<std::shared_ptr<t_computed_expression>>& expressions,
        std::string filter_op,
        bool column_only,
        bool leaves_only = false,
        bool total_only = false
    );

    /**
     * @brief Given a `t_schema` specifying the underlying `Table`'s columns,
     * construct the abstractions necessary for the core engine.
     *
     * @param schema
     */
    void init(const std::shared_ptr<t_schema>& schema);

    /**
     * @brief Validate the view config to make sure that no invalid columns
     * have been specified. If an invalid column is present, call
     * PSP_COMPLAIN_AND_ABORT, which will abort() in WASM and raise an
     * exception in Python.
     */
    void validate(const std::shared_ptr<t_schema>& schema);

    /**
     * @brief Retrieve only the used expressions.
     */
    std::vector<std::shared_ptr<t_computed_expression>> get_used_expressions();

    /**
     * @brief Add filter terms manually, as the filter term must be calculated
     * from the value passed through the binding.
     *
     * @param term
     */
    void add_filter_term(
        const std::tuple<std::string, std::string, std::vector<t_tscalar>>& term
    );

    /**
     * @brief Set the number of pivot levels the engine should generate.
     *
     * @param depth
     */
    void set_row_pivot_depth(std::int32_t depth);
    void set_column_pivot_depth(std::int32_t depth);

    std::vector<std::string> get_row_pivots() const;

    std::vector<std::string> get_column_pivots() const;

    std::vector<t_aggspec> get_aggspecs() const;

    std::vector<std::string> get_columns() const;

    std::vector<t_fterm> get_fterm() const;

    std::vector<t_sortspec> get_sortspec() const;

    std::vector<t_sortspec> get_col_sortspec() const;

    std::vector<std::shared_ptr<t_computed_expression>> get_expressions() const;

    t_filter_op get_filter_op() const;

    bool is_column_only() const;

    bool is_leaves_only() const;
    bool is_total_only() const;

    std::int32_t get_row_pivot_depth() const;
    std::int32_t get_column_pivot_depth() const;

private:
    bool m_init;

    /**
     * @brief Fill the `m_aggspecs` vector with `t_aggspec` objects which define
     * the view's aggregate settings.
     *
     * The method calculates aggregates using the columns marked for display (in
     * `m_columns`), user-provided aggregates (in `m_aggregates`), and if sorts
     * are applied using a column that is not displayed.
     *
     * At the same time, the method fills the `m_aggregate_names` vector with
     * each column that has an aggregate applied.
     *
     * See documentation for the `m_aggregate_names` vector below for details
     * regarding its logic.
     *
     * @param schema
     * @return void
     */
    void fill_aggspecs(const std::shared_ptr<t_schema>& schema);

    /**
     * @brief Fill the `m_fterm` vector with `t_fterm` objects which define the
     * view's filters.
     *
     * @return void
     */
    void fill_fterm();

    /**
     * @brief Fill the `m_sortspec` vectors with `t_sortspec` objects which
     * define the view's sorting.
     *
     * The method fills both the `m_sortspec` and `m_col_sortspec` vectors. The
     * former is used in all views, and the latter refers to sorting based on a
     * column when column pivots are applied; it is only used in 2-sided views.
     *
     * @return void
     */
    void fill_sortspec();

    /**
     * @brief Given a column name, find its position in `m_aggregate_names`.
     * Used for determining sort specifications.
     *
     * @param column
     * @return t_index
     */
    t_index get_aggregate_index(const std::string& column) const;

    void make_aggspec(
        const std::string& column,
        const std::vector<std::string>& aggregate,
        t_dtype dtype
    );

    // Global dictionary for `t_tscalar` in filter terms.
    t_vocab m_vocab;

    // containers for primitive data that does not need transformation into
    // abstractions

    std::vector<std::string> m_row_pivots;
    std::vector<std::string> m_column_pivots;
    tsl::ordered_map<std::string, std::vector<std::string>> m_aggregates;
    std::vector<std::string> m_columns;
    std::vector<std::tuple<std::string, std::string, std::vector<t_tscalar>>>
        m_filter;
    std::vector<std::vector<std::string>> m_sort;
    std::vector<std::shared_ptr<t_computed_expression>> m_expressions;

    /**
     * @brief The ordered list of aggregate columns:
     *
     * 1. all columns marked as "shown" by the user in `m_columns`
     * 2. all specified aggregates from `m_aggregates`
     * 3. all "hidden sorts", i.e. columns to sort by that do not appear in
     * `m_columns`
     *
     */
    std::vector<std::string> m_aggregate_names;

    // store containers for abstractions which are used by the engine
    std::vector<t_aggspec> m_aggspecs;

    std::vector<t_fterm> m_fterm;

    std::vector<t_sortspec> m_sortspec;

    std::vector<t_sortspec> m_col_sortspec;

    /**
     * @brief If specified, the number of pivot levels the engine should
     * generate.
     *
     * Used in `expand` and `collapse` tree operations, and in the grid.
     */
    std::int32_t m_row_pivot_depth;
    std::int32_t m_column_pivot_depth;

    /**
     * @brief the `t_filter_op` used to return data in the case of multiple
     * filters being applied.
     *
     * Defaults to "and", which returns data that satisfies all the filters
     * provided by the user.
     */
    std::string m_filter_op;

    /**
     * @brief whether the view is `column_only`, i.e. having > 1 `column_pivots`
     * without any `row_pivots`.
     *
     */
    bool m_column_only;
    bool m_leaves_only;
    bool m_total_only;
};
} // end namespace perspective