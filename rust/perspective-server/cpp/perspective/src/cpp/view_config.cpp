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

#include "perspective/base.h"
#include <perspective/view_config.h>

#include <utility>

namespace perspective {

t_view_config::t_view_config(
    t_vocab vocab,
    const std::vector<std::string>& row_pivots,
    const std::vector<std::string>& column_pivots,
    const tsl::ordered_map<std::string, std::vector<std::string>>& aggregates,
    const std::vector<std::string>& columns,
    const std::vector<
        std::tuple<std::string, std::string, std::vector<t_tscalar>>>& filter,
    const std::vector<std::vector<std::string>>& sort,
    const std::vector<std::shared_ptr<t_computed_expression>>& expressions,
    std::string filter_op,
    bool column_only,
    bool leaves_only,
    bool total_only
) :
    m_init(false),
    m_vocab(std::move(vocab)),
    m_row_pivots(row_pivots),
    m_column_pivots(column_pivots),
    m_aggregates(aggregates),
    m_columns(columns),
    m_filter(filter),
    m_sort(sort),
    m_expressions(expressions),
    m_row_pivot_depth(-1),
    m_column_pivot_depth(-1),
    m_filter_op(std::move(filter_op)),
    m_column_only(column_only),
    m_leaves_only(leaves_only),
    m_total_only(total_only) {}

void
t_view_config::init(const std::shared_ptr<t_schema>& schema) {
    validate(schema);
    fill_aggspecs(schema);
    fill_fterm();
    fill_sortspec();

    m_init = true;
}

void
t_view_config::validate(const std::shared_ptr<t_schema>& schema) {
    std::unordered_set<std::string> expression_aliases;
    expression_aliases.reserve(m_expressions.size());

    for (const auto& expr : m_expressions) {
        expression_aliases.insert(expr->get_expression_alias());
    }

    for (const std::string& col : m_columns) {
        if (!schema->has_column(col) && expression_aliases.count(col) == 0) {
            std::stringstream ss;
            ss << "Invalid column '" << col << "' found in View columns."
               << '\n';
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    for (const auto& agg : m_aggregates) {
        const std::string& col = agg.first;
        if (!schema->has_column(col) && expression_aliases.count(col) == 0) {
            std::stringstream ss;
            ss << "Invalid column '" << col << "' found in View aggregates."
               << '\n';
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    for (const std::string& col : m_row_pivots) {
        if (!schema->has_column(col) && expression_aliases.count(col) == 0) {
            std::stringstream ss;
            ss << "Invalid column '" << col << "' found in View group_by."
               << '\n';
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    for (const std::string& col : m_column_pivots) {
        if (!schema->has_column(col) && expression_aliases.count(col) == 0) {
            std::stringstream ss;
            ss << "Invalid column '" << col << "' found in View split_by."
               << '\n';
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    for (const auto& filter : m_filter) {
        const std::string& col = std::get<0>(filter);
        if (!schema->has_column(col) && expression_aliases.count(col) == 0) {
            std::stringstream ss;
            ss << "Invalid column '" << col << "' found in View filters."
               << '\n';
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    for (const auto& sort : m_sort) {
        const std::string& col = sort[0];
        if (!schema->has_column(col) && expression_aliases.count(col) == 0) {
            std::stringstream ss;
            ss << "Invalid column '" << col << "' found in View sorts." << '\n';
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }
}

std::vector<std::shared_ptr<t_computed_expression>>
t_view_config::get_used_expressions() {
    std::vector<std::shared_ptr<t_computed_expression>> exprs = m_expressions;
    tsl::hopscotch_set<std::string> used_cols(
        m_columns.begin(), m_columns.end()
    );

    std::copy(
        m_row_pivots.begin(),
        m_row_pivots.end(),
        std::inserter(used_cols, used_cols.end())
    );

    for (auto i : m_filter) {
        used_cols.insert(std::get<0>(i));
    }

    for (auto i : m_sort) {
        used_cols.insert(i[0]);
    }

    std::copy(
        m_column_pivots.begin(),
        m_column_pivots.end(),
        std::inserter(used_cols, used_cols.end())
    );

    std::copy(
        m_row_pivots.begin(),
        m_row_pivots.end(),
        std::inserter(used_cols, used_cols.end())
    );

    std::copy(
        m_row_pivots.begin(),
        m_row_pivots.end(),
        std::inserter(used_cols, used_cols.end())
    );

    auto iter = std::remove_if(
        exprs.begin(),
        exprs.end(),
        [&](std::shared_ptr<perspective::t_computed_expression>& i) {
            bool unused =
                used_cols.find(i->get_expression_alias()) == used_cols.end();

#ifdef PSP_DEBUG
            if (unused) {
                std::cout << "Unused expression `" << i->get_expression_alias()
                          << "`"
                          << "\n";
            }
#endif

            return unused;
        }
    );

    if (iter != exprs.end()) {
        exprs.erase(iter, exprs.end());
    }

    return exprs;
}

void
t_view_config::add_filter_term(
    const std::tuple<std::string, std::string, std::vector<t_tscalar>>& term
) {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_filter.push_back(term);
}

void
t_view_config::set_row_pivot_depth(std::int32_t depth) {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_row_pivot_depth = depth;
}

void
t_view_config::set_column_pivot_depth(std::int32_t depth) {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_column_pivot_depth = depth;
}

std::vector<std::string>
t_view_config::get_row_pivots() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_row_pivots;
}

std::vector<std::string>
t_view_config::get_column_pivots() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_column_pivots;
}

std::vector<t_aggspec>
t_view_config::get_aggspecs() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_aggspecs;
}

std::vector<std::string>
t_view_config::get_columns() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_columns;
}

std::vector<t_fterm>
t_view_config::get_fterm() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_fterm;
}

std::vector<t_sortspec>
t_view_config::get_sortspec() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_sortspec;
}

std::vector<t_sortspec>
t_view_config::get_col_sortspec() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_col_sortspec;
}

std::vector<std::shared_ptr<t_computed_expression>>
t_view_config::get_expressions() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_expressions;
}

t_filter_op
t_view_config::get_filter_op() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return str_to_filter_op(m_filter_op);
}

bool
t_view_config::is_column_only() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_column_only;
}

bool
t_view_config::is_leaves_only() const {
    return m_leaves_only;
}

bool
t_view_config::is_total_only() const {
    return m_total_only;
}

std::int32_t
t_view_config::get_row_pivot_depth() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_row_pivot_depth;
}

std::int32_t
t_view_config::get_column_pivot_depth() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_column_pivot_depth;
}

// PRIVATE
void
t_view_config::fill_aggspecs(const std::shared_ptr<t_schema>& schema) {
    auto max_agg_count = m_columns.size() + m_sort.size();
    m_aggspecs.reserve(max_agg_count);
    m_aggregate_names.reserve(max_agg_count);

    // Iterate through the columns array - if the column is in the
    // aggregates map, use the specified aggregate or generate a default. If
    // an aggregate is in the aggregate map but NOT in the columns list,
    // it is ignored and NOT applied.
    for (const std::string& column : m_columns) {
        t_dtype dtype = schema->get_dtype(column);
        const auto& agg_iter = m_aggregates.find(column);

        if (agg_iter != m_aggregates.end()) {
            // If the column name is in the aggregate map, use the custom
            // aggregate as defined by the map and add it to m_aggspecs
            // and m_aggregate_names.
            const std::vector<std::string>& aggregate = agg_iter->second;
            make_aggspec(column, aggregate, dtype);
        } else {
            // Generate a default aggregate based on the column type.
            std::vector<t_dep> dependencies{t_dep(column, DEPTYPE_COLUMN)};
            t_aggtype agg_type;
            (m_column_only && !m_total_only)
                ? agg_type = AGGTYPE_ANY
                : agg_type = _get_default_aggregate(dtype);
            m_aggspecs.emplace_back(column, agg_type, dependencies);
            m_aggregate_names.push_back(column);
        }
    }

    // construct aggspecs for hidden sorts
    for (auto sort : m_sort) {
        std::string column = sort[0];

        bool is_hidden_column =
            std::find(m_columns.begin(), m_columns.end(), column)
            == m_columns.end();

        if (is_hidden_column) {
            bool is_row_pivot =
                std::find(m_row_pivots.begin(), m_row_pivots.end(), column)
                != m_row_pivots.end();
            bool is_column_pivot =
                std::find(
                    m_column_pivots.begin(), m_column_pivots.end(), column
                )
                != m_column_pivots.end();
            bool is_column_only =
                (m_row_pivots.empty() || m_column_only) && !m_total_only;
            bool is_row_sort = sort[1].rfind("col", 0) != 0;

            std::vector<t_dep> dependencies{t_dep(column, DEPTYPE_COLUMN)};
            t_aggtype agg_type;

            if (is_column_only) {
                // Always sort by `ANY` in column only views
                agg_type = t_aggtype::AGGTYPE_ANY;
            } else if ((is_row_pivot && is_row_sort) || (is_column_pivot && !is_row_sort)) {
                // Otherwise if the hidden column is in pivot on the same axis,
                // use `UNIQUE`
                agg_type = t_aggtype::AGGTYPE_UNIQUE;
            } else if (m_aggregates.count(column) > 0) {
                auto col = m_aggregates.at(column);
                if (col.at(0) == "weighted mean") {
                    dependencies.emplace_back(col.at(1), DEPTYPE_COLUMN);
                    agg_type = AGGTYPE_WEIGHTED_MEAN;
                } else if (col.at(0) == "max by") {
                    dependencies.emplace_back(col.at(1), DEPTYPE_COLUMN);
                    agg_type = AGGTYPE_MAX_BY;
                } else if (col.at(0) == "min by") {
                    dependencies.emplace_back(col.at(1), DEPTYPE_COLUMN);
                    agg_type = AGGTYPE_MIN_BY;
                } else {
                    agg_type = str_to_aggtype(col.at(0));
                }
            } else {
                t_dtype dtype = schema->get_dtype(column);
                agg_type = _get_default_aggregate(dtype);
            }

            m_aggspecs.emplace_back(column, agg_type, dependencies);
            m_aggregate_names.push_back(column);
        }
    }
}

void
t_view_config::fill_fterm() {
    for (auto filter : m_filter) {
        t_filter_op op = str_to_filter_op(std::get<1>(filter));
        switch (op) {
            case FILTER_OP_NOT_IN:
            case FILTER_OP_IN: {
                m_fterm.emplace_back(
                    std::get<0>(filter), op, mktscalar(0), std::get<2>(filter)
                );
            } break;
            default: {
                t_tscalar filter_term = std::get<2>(filter)[0];
                m_fterm.emplace_back(
                    std::get<0>(filter),
                    op,
                    filter_term,
                    std::vector<t_tscalar>()
                );
            }
        }
    }
}

void
t_view_config::fill_sortspec() {
    for (auto s : m_sort) {
        t_index agg_index = get_aggregate_index(s[0]);
        t_sorttype sort_type = str_to_sorttype(s[1]);

        auto spec = t_sortspec(s[0], agg_index, sort_type);

        bool is_column_sort = s[1].find("col") != std::string::npos;
        if (is_column_sort) {
            m_col_sortspec.push_back(spec);
        } else {
            m_sortspec.push_back(spec);
        }
    }
}

t_index
t_view_config::get_aggregate_index(const std::string& column) const {
    auto it =
        std::find(m_aggregate_names.begin(), m_aggregate_names.end(), column);
    if (it != m_aggregate_names.end()) {
        return t_index(std::distance(m_aggregate_names.begin(), it));
    }
    return t_index();
}

void
t_view_config::make_aggspec(
    const std::string& column,
    const std::vector<std::string>& aggregate,
    t_dtype dtype
) {
    t_aggtype agg_type;
    t_aggspec aggspec;

    // Maximum of 2 dependencies, based on the aggregate type
    std::vector<t_dep> dependencies{t_dep(column, DEPTYPE_COLUMN)};
    dependencies.reserve(2);

    if (m_column_only && !m_total_only) {
        agg_type = t_aggtype::AGGTYPE_ANY;
    } else {
        if (aggregate.at(0) == "weighted mean") {
            dependencies.emplace_back(aggregate.at(1), DEPTYPE_COLUMN);
            agg_type = AGGTYPE_WEIGHTED_MEAN;
        } else if (aggregate.at(0) == "max by") {
            dependencies.emplace_back(aggregate.at(1), DEPTYPE_COLUMN);
            agg_type = AGGTYPE_MAX_BY;
        } else if (aggregate.at(0) == "min by") {
            dependencies.emplace_back(aggregate.at(1), DEPTYPE_COLUMN);
            agg_type = AGGTYPE_MIN_BY;
        } else {
            agg_type = str_to_aggtype(aggregate.at(0));
        }
    }

    if (agg_type == AGGTYPE_FIRST || agg_type == AGGTYPE_LAST_BY_INDEX
        || agg_type == AGGTYPE_LAST_MINUS_FIRST) {
        dependencies.emplace_back("psp_okey", DEPTYPE_COLUMN);
        aggspec = t_aggspec(
            column, column, agg_type, dependencies, SORTTYPE_ASCENDING
        );
    } else {
        aggspec = t_aggspec(column, agg_type, dependencies);
    }

    m_aggspecs.push_back(aggspec);
    m_aggregate_names.push_back(column);
}

} // end namespace perspective