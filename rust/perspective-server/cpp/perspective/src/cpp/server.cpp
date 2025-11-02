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

#include "google/protobuf/repeated_ptr_field.h"
#include "google/protobuf/struct.pb.h"
#include "perspective.pb.h"
#include "perspective/base.h"
#include "perspective/computed_expression.h"
#include "perspective/exception.h"
#include "perspective/pyutils.h"
#include "perspective/raw_types.h"
#include "perspective/scalar.h"
#include "perspective/sparse_tree.h"
#include "perspective/table.h"
#include "perspective/time.h"
#include "perspective/view.h"
#include "perspective/view_config.h"
#include "re2/re2.h"
#include <chrono>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <perspective/server.h>
#include <re2/stringpiece.h>
#include <string>
#include <tsl/hopscotch_map.h>
#include <tsl/ordered_map.h>
#include <vector>
#include <ctime>

#if defined(PSP_ENABLE_WASM) || defined(__linux__)
#include <malloc.h>
#endif

#if !defined(WIN32) && !defined(PSP_ENABLE_WASM)
#include <sys/resource.h>
#endif

namespace perspective {
std::uint32_t server::ProtoServer::m_client_id = 1;

template <>
std::shared_ptr<t_ctxunit>
make_context(
    std::shared_ptr<Table> table,
    std::shared_ptr<t_schema> schema,
    std::shared_ptr<t_view_config> view_config,
    const std::string& name
) {
    auto columns = view_config->get_columns();
    auto fterm = view_config->get_fterm();

    auto cfg = t_config(columns);
    auto ctx_unit = std::make_shared<t_ctxunit>(*schema, cfg);
    ctx_unit->init();

    auto pool = table->get_pool();
    auto gnode = table->get_gnode();

    pool->register_context(
        gnode->get_id(),
        name,
        UNIT_CONTEXT,
        reinterpret_cast<std::uintptr_t>(ctx_unit.get())
    );
    return ctx_unit;
}

template <>
std::shared_ptr<t_ctx0>
make_context(
    std::shared_ptr<Table> table,
    std::shared_ptr<t_schema> schema,
    std::shared_ptr<t_view_config> view_config,
    const std::string& name
) {
    auto columns = view_config->get_columns();
    auto filter_op = view_config->get_filter_op();
    auto fterm = view_config->get_fterm();
    auto sortspec = view_config->get_sortspec();
    auto expressions = view_config->get_used_expressions();

    auto cfg = t_config(columns, fterm, filter_op, expressions);
    auto ctx0 = std::make_shared<t_ctx0>(*schema, cfg);
    ctx0->init();
    ctx0->sort_by(sortspec);

    auto pool = table->get_pool();
    auto gnode = table->get_gnode();
    pool->register_context(
        gnode->get_id(),
        name,
        ZERO_SIDED_CONTEXT,
        reinterpret_cast<std::uintptr_t>(ctx0.get())
    );
    return ctx0;
}

template <>
std::shared_ptr<t_ctx1>
make_context(
    std::shared_ptr<Table> table,
    std::shared_ptr<t_schema> schema,
    std::shared_ptr<t_view_config> view_config,
    const std::string& name
) {
    auto row_pivots = view_config->get_row_pivots();
    auto aggspecs = view_config->get_aggspecs();
    auto filter_op = view_config->get_filter_op();
    auto fterm = view_config->get_fterm();
    auto sortspec = view_config->get_sortspec();
    auto row_pivot_depth = view_config->get_row_pivot_depth();
    auto expressions = view_config->get_used_expressions();

    auto cfg = t_config(row_pivots, aggspecs, fterm, filter_op, expressions);
    auto ctx1 = std::make_shared<t_ctx1>(*schema, cfg);

    ctx1->init();
    ctx1->sort_by(sortspec);

    auto pool = table->get_pool();
    auto gnode = table->get_gnode();
    if (row_pivot_depth > -1) {
        ctx1->set_depth(row_pivot_depth - 1);
    } else {
        ctx1->set_depth(row_pivots.size());
    }

    pool->register_context(
        gnode->get_id(),
        name,
        ONE_SIDED_CONTEXT,
        reinterpret_cast<std::uintptr_t>(ctx1.get())
    );

    return ctx1;
}

template <>
std::shared_ptr<t_ctx2>
make_context(
    std::shared_ptr<Table> table,
    std::shared_ptr<t_schema> schema,
    std::shared_ptr<t_view_config> view_config,
    const std::string& name
) {
    bool column_only = view_config->is_column_only();
    auto row_pivots = view_config->get_row_pivots();
    auto column_pivots = view_config->get_column_pivots();
    auto aggspecs = view_config->get_aggspecs();
    auto filter_op = view_config->get_filter_op();
    auto fterm = view_config->get_fterm();
    auto sortspec = view_config->get_sortspec();
    auto col_sortspec = view_config->get_col_sortspec();
    auto row_pivot_depth = view_config->get_row_pivot_depth();
    auto column_pivot_depth = view_config->get_column_pivot_depth();
    auto expressions = view_config->get_used_expressions();

    t_totals total = !sortspec.empty() ? TOTALS_BEFORE : TOTALS_HIDDEN;

    auto cfg = t_config(
        row_pivots,
        column_pivots,
        aggspecs,
        total,
        fterm,
        filter_op,
        expressions,
        column_only
    );
    auto ctx2 = std::make_shared<t_ctx2>(*schema, cfg);

    ctx2->init();

    auto pool = table->get_pool();
    auto gnode = table->get_gnode();

    if (!sortspec.empty()) {
        ctx2->sort_by(sortspec);
    }

    if (!col_sortspec.empty()) {
        ctx2->column_sort_by(col_sortspec);
    }

    if (row_pivot_depth > -1) {
        ctx2->set_depth(t_header::HEADER_ROW, row_pivot_depth - 1);
    } else {
        ctx2->set_depth(t_header::HEADER_ROW, row_pivots.size());
    }

    if (column_pivot_depth > -1) {
        ctx2->set_depth(t_header::HEADER_COLUMN, column_pivot_depth - 1);
    } else {
        ctx2->set_depth(t_header::HEADER_COLUMN, column_pivots.size());
    }

    pool->register_context(
        gnode->get_id(),
        name,
        TWO_SIDED_CONTEXT,
        reinterpret_cast<std::uintptr_t>(ctx2.get())
    );

    return ctx2;
}

struct ValidatedExpr {
    std::string expression_alias;
    std::string expression;
    std::string parse_expression_string;
    tsl::hopscotch_map<std::string, std::string> column_id_map;
};

static std::string
re_bool_to_str(std::string&& expression) {
    static const RE2 true_("true");
    static const RE2 false_("false");
    RE2::GlobalReplace(&expression, true_, "True");
    RE2::GlobalReplace(&expression, false_, "False");
    return std::move(expression);
}

template <typename Lambda>
static std::string
replace_with_re2(
    const std::string& input, const re2::RE2& pattern, Lambda replacer
) {
    std::string output;
    re2::StringPiece input_piece(input);

    PSP_VERBOSE_ASSERT1(
        pattern.NumberOfCapturingGroups() >= 2,
        "Must have at least two capturing groups"
    );

    std::string outer_match;
    std::string match;
    const char* previous_end = input.data();

    while (RE2::FindAndConsume(&input_piece, pattern, &outer_match, &match)) {
        // With the pattern /"(dolor)"/ the input piece will jump _past_ the
        // "dolor" match, so to maintain the text we skipped but didn't
        // explicitly exclude from the group, we need to subtract the size of
        // the match from the input piece to find the text before the match.

        // ↓↓↓↓↓↓↓↓↓↓↓↓ This would be lost otherwise
        // Lorem ipsum "dolor" sit amet, consectetur adipiscing elit.

        // Calculate the start of the actual match.
        // This unfortunately only works if nothing consumes
        // input _after_ the outer match.
        const char* match_start = input_piece.data() - outer_match.size();

        // Append the text that was consumed but is not part of the match
        output.append(previous_end, match_start - previous_end);

        // Apply the lambda function to the match and append the result
        output += replacer(outer_match, match);
        previous_end = input_piece.data();
    }

    output.append(previous_end, &*input.end() - previous_end);
    return output;
}

static auto
re_column_name_to_id(std::string&& expression, ValidatedExpr& validated_expr) {
    static const RE2 column_name("(\"(.*?[^\\\\])\")");
    static const RE2 escaped_double_quote(R"(\")");
    static const RE2 escaped_backslash(R"(\\)");

    std::string column_id;
    tsl::hopscotch_map<std::string, std::string> column_id_map;
    tsl::hopscotch_map<std::string, std::string> column_name_map;
    std::uint32_t running_cidx = 0;

    auto parsed_expression_string = replace_with_re2(
        expression,
        column_name,
        [&](const std::string& _, const std::string& cname) {
            if (!column_name_map.contains(cname)) {
                column_id = "COLUMN" + std::to_string(running_cidx);
                column_name_map[cname] = column_id;
                column_id_map[column_id] = cname;
            }

            running_cidx++;
            return column_name_map[cname];
        }
    );
    return std::tuple(parsed_expression_string, column_id_map);
}

static auto
re_intern_strings(std::string&& expression) {
    static const RE2 intern_string("('.*?[^\\\\]')");
    RE2::GlobalReplace(&expression, intern_string, "intern(\\1)");
    return expression;
}

static auto
re_unintern_some_exprs(std::string&& expression) {
    static const RE2 interned_param(
        "(?:match|match_all|search|indexof|replace|replace_all)\\("
        "(?:.*?,\\s*(intern\\(('.*?')\\)))"
    );
    static const RE2 intern_match("intern\\(('.*?')\\)");

    auto parsed_expression_string = replace_with_re2(
        expression,
        interned_param,
        [&](const std::string& outer_match, const std::string& inner_match) {
            LOG_DEBUG("UNINTERNING: " << inner_match);
            std::string out = inner_match;
            return out;
        }
    );

    return parsed_expression_string;
};

template <typename F>
static std::vector<ValidatedExpr>
parse_expression_strings(const F& column_expr) {
    // assert that F has an operator[] that takes a string and returns a string
    static_assert(std::is_same_v<
                  decltype(std::declval<F>()[std::declval<const std::string&>()]
                  ),
                  std::string&>);
    std::vector<ValidatedExpr> validated_exprs;
    for (const auto& [colname, expr] : column_expr) {
        // TODO: Remove
        ValidatedExpr validated_expr;
        validated_expr.expression = expr;
        validated_expr.expression_alias = colname;
        validated_expr.parse_expression_string = expr;

        LOG_DEBUG(
            "Before preprocessing: " << validated_expr.parse_expression_string
        );

        validated_expr.parse_expression_string =
            re_bool_to_str(std::move(validated_expr.parse_expression_string));

        std::tie(
            validated_expr.parse_expression_string, validated_expr.column_id_map
        ) =
            re_column_name_to_id(
                std::move(validated_expr.parse_expression_string),
                validated_expr
            );

        validated_expr.parse_expression_string =
            re_intern_strings(std::move(validated_expr.parse_expression_string)
            );

        validated_expr.parse_expression_string = re_unintern_some_exprs(
            std::move(validated_expr.parse_expression_string)
        );

        LOG_DEBUG(
            "After preprocessing: " << validated_expr.parse_expression_string
        );

        validated_exprs.emplace_back(std::move(validated_expr));
    }
    return validated_exprs;
}

} // namespace perspective

namespace perspective::server {
void
ServerResources::host_table(const t_id& id, std::shared_ptr<Table> table) {
    PSP_WRITE_LOCK(m_write_lock);
    m_tables.emplace(id, std::move(table));
}

void
ServerResources::host_view(
    const std::uint32_t& client_id,
    const t_id& id,
    const t_id& table_id,
    std::shared_ptr<ErasedView> view
) {
    PSP_WRITE_LOCK(m_write_lock);
    m_view_to_table.emplace(id, table_id);
    m_table_to_view.emplace(table_id, id);
    m_views.emplace(id, std::move(view));
    if (!m_client_to_view.contains(client_id)) {
        std::vector vec{id};
        m_client_to_view.emplace(client_id, vec);
    } else {
        m_client_to_view[client_id].emplace_back(id);
    }
}

std::shared_ptr<Table>
ServerResources::get_table(const t_id& id) {
    PSP_READ_LOCK(m_write_lock);
    return m_tables.at(id);
}

std::vector<ServerResources::t_id>
ServerResources::get_table_ids() {
    PSP_READ_LOCK(m_write_lock);
    std::vector<t_id> vec;
    for (auto const& imap : m_tables) {
        if (!m_deleted_tables.contains(imap.first)) {
            vec.push_back(imap.first);
        }
    }

    return vec;
}

std::shared_ptr<Table>
ServerResources::get_table_for_view(const t_id& view_id) {
    PSP_READ_LOCK(m_write_lock);
    return m_tables.at(m_view_to_table.at(view_id));
}

ServerResources::t_id
ServerResources::get_table_id_for_view(const t_id& view_id) {
    PSP_READ_LOCK(m_write_lock);
    if (!m_view_to_table.contains(view_id)) {
        throw PerspectiveViewNotFoundException();
    }

    return m_view_to_table.at(view_id);
}

std::vector<ServerResources::t_id>
ServerResources::get_view_ids(const t_id& table_id) {
    PSP_READ_LOCK(m_write_lock);
    std::vector<t_id> out;
    auto range = m_table_to_view.equal_range(table_id);
    for (auto it = range.first; it != range.second; ++it) {
        out.push_back(it->second);
    }
    return out;
}

bool
ServerResources::has_view(const t_id& id) {
    PSP_READ_LOCK(m_write_lock);
    return m_views.contains(id);
}

std::shared_ptr<ErasedView>
ServerResources::get_view(const t_id& id) {
    PSP_READ_LOCK(m_write_lock);
    if (!m_views.contains(id)) {
        throw PerspectiveViewNotFoundException();
    }

    return m_views.at(id);
}

void
ServerResources::delete_view(const std::uint32_t& client_id, const t_id& id) {
    if (!m_view_to_table.contains(id)) {
        throw PerspectiveViewNotFoundException();
    }

    {
        PSP_WRITE_LOCK(m_write_lock);
        auto table_id = m_view_to_table.at(id);
        if (m_views.find(id) != m_views.end()) {
            m_views.erase(id);
        }

        if (m_view_to_table.find(id) != m_view_to_table.end()) {
            m_view_to_table.erase(id);
        }

        auto& vec = m_client_to_view[client_id];
        vec.erase(std::remove(vec.begin(), vec.end(), id), vec.end());
        auto range = m_table_to_view.equal_range(table_id);
        for (auto it = range.first; it != range.second;) {
            if (it->second == id) {
                it = m_table_to_view.erase(it);
            } else {
                ++it;
            }
        }
    }

    drop_view_on_update_sub(id);
    drop_view_on_delete_sub(id);
}

void
ServerResources::delete_table(const t_id& id) {
    PSP_WRITE_LOCK(m_write_lock);
    if (m_tables.find(id) != m_tables.end()) {
        if (m_table_to_view.find(id) == m_table_to_view.end()) {
            m_tables.erase(id);
            m_dirty_tables.erase(id);
            m_deleted_tables.erase(id);
        } else {
            PSP_COMPLAIN_AND_ABORT("Cannot delete table with views");
        }
    }
}

void
ServerResources::mark_table_dirty(const t_id& id) {
    PSP_WRITE_LOCK(m_write_lock);
    m_dirty_tables.insert(id);
}

void
ServerResources::mark_table_clean(const t_id& id) {
    PSP_WRITE_LOCK(m_write_lock);
    m_dirty_tables.erase(id);
}

void
ServerResources::mark_all_tables_clean() {
    PSP_WRITE_LOCK(m_write_lock);
    m_dirty_tables.clear();
}

void
ServerResources::create_table_on_delete_sub(
    const t_id& table_id, Subscription sub_id
) {
    PSP_WRITE_LOCK(m_write_lock);
    if (!m_table_on_delete_subs.contains(table_id)) {
        m_table_on_delete_subs[table_id] = {sub_id};
    } else {
        m_table_on_delete_subs[table_id].push_back(sub_id);
    }
}

std::vector<Subscription>
ServerResources::get_table_on_delete_sub(const t_id& table_id) {
    PSP_READ_LOCK(m_write_lock);
    if (!m_table_on_delete_subs.contains(table_id)) {
        return {};
    }
    return m_table_on_delete_subs.at(table_id);
}

void
ServerResources::remove_table_on_delete_sub(
    const t_id& table_id,
    const std::uint32_t sub_id,
    const std::uint32_t client_id
) {
    {
        PSP_WRITE_LOCK(m_write_lock);
        if (!m_table_on_delete_subs.contains(table_id)) {
            m_table_on_delete_subs[table_id] = {};
        }
    }

    PSP_READ_LOCK(m_write_lock);
    auto& subs = m_table_on_delete_subs.at(table_id);
    for (auto sub = subs.begin(); sub != subs.end();) {
        if (sub->id == sub_id && sub->client_id == client_id) {
            subs.erase(sub);
            break;
        }

        ++sub;
    }
}

void
ServerResources::create_view_on_delete_sub(
    const t_id& view_id, Subscription sub
) {
    PSP_WRITE_LOCK(m_write_lock);
    if (!m_view_on_delete_subs.contains(view_id)) {
        m_view_on_delete_subs[view_id] = {sub};
    } else {
        m_view_on_delete_subs[view_id].push_back(sub);
    }
}

std::vector<Subscription>
ServerResources::get_view_on_delete_sub(const t_id& view_id) {
    PSP_READ_LOCK(m_write_lock);
    if (!m_view_on_delete_subs.contains(view_id)) {
        return {};
    }

    return m_view_on_delete_subs.at(view_id);
}

void
ServerResources::remove_view_on_delete_sub(
    const t_id& view_id,
    const std::uint32_t sub_id,
    const std::uint32_t client_id
) {
    PSP_WRITE_LOCK(m_write_lock);
    if (!m_view_on_delete_subs.contains(view_id)) {
        m_view_on_delete_subs[view_id] = {};
    }

    auto& subs = m_view_on_delete_subs.at(view_id);
    for (auto sub = subs.begin(); sub != subs.end();) {
        if (sub->id == sub_id && sub->client_id == client_id) {
            subs.erase(sub);
            break;
        }

        ++sub;
    }
}

void
ServerResources::drop_view_on_delete_sub(const t_id& view_id) {
    m_view_on_delete_subs.erase(view_id);
}

void
ServerResources::create_view_on_update_sub(
    const t_id& view_id, Subscription sub
) {
    PSP_WRITE_LOCK(m_write_lock);
    if (!m_view_on_update_subs.contains(view_id)) {
        m_view_on_update_subs[view_id] = {sub};
    } else {
        m_view_on_update_subs[view_id].push_back(sub);
    }
}

std::vector<Subscription>
ServerResources::get_view_on_update_sub(const t_id& view_id) {
    PSP_READ_LOCK(m_write_lock);
    if (!m_view_on_update_subs.contains(view_id)) {
        return {};
    }

    return m_view_on_update_subs.at(view_id);
}

void
ServerResources::drop_view_on_update_sub(const t_id& view_id) {
    PSP_WRITE_LOCK(m_write_lock);
    m_view_on_update_subs.erase(view_id);
}

void
ServerResources::remove_view_on_update_sub(
    const t_id& view_id, std::uint32_t sub_id, std::uint32_t client_id
) {
    if (m_view_on_update_subs.find(view_id) != m_view_on_update_subs.end()) {
        auto& subs = m_view_on_update_subs[view_id];
        subs.erase(
            std::remove_if(
                subs.begin(),
                subs.end(),
                [sub_id, client_id](const Subscription& sub) {
                    return sub.id == sub_id && sub.client_id == client_id;
                }
            ),
            subs.end()
        );
    }
}

void
ServerResources::create_on_hosted_tables_update_sub(Subscription sub) {
    PSP_WRITE_LOCK(m_write_lock);
    m_on_hosted_tables_update_subs.push_back(sub);
}

std::vector<Subscription>
ServerResources::get_on_hosted_tables_update_sub() {
    PSP_READ_LOCK(m_write_lock);
    return m_on_hosted_tables_update_subs;
}

void
ServerResources::remove_on_hosted_tables_update_sub(
    std::uint32_t sub_id, std::uint32_t client_id
) {
    m_on_hosted_tables_update_subs.erase(
        std::remove_if(
            m_on_hosted_tables_update_subs.begin(),
            m_on_hosted_tables_update_subs.end(),
            [sub_id, client_id](const Subscription& sub) {
                return sub.id == sub_id && sub.client_id == client_id;
            }
        ),
        m_on_hosted_tables_update_subs.end()
    );
}

std::vector<std::pair<std::shared_ptr<Table>, const ServerResources::t_id>>
ServerResources::get_dirty_tables() {
    PSP_READ_LOCK(m_write_lock);
    std::vector<std::pair<std::shared_ptr<Table>, const t_id>> out;
    for (const auto& id : m_dirty_tables) {
        out.emplace_back(m_tables[id], id);
    }
    return out;
}

bool
ServerResources::is_table_dirty(const t_id& id) {
    PSP_READ_LOCK(m_write_lock);
    return m_dirty_tables.contains(id);
}

void
ServerResources::drop_client(std::uint32_t client_id) {
    if (m_client_to_view.contains(client_id)) {

        // Load-bearing copy
        std::vector<t_id> remove = m_client_to_view[client_id];
        for (const auto& view_id : remove) {
            delete_view(client_id, view_id);
        }
    }

    std::vector<Subscription> subs;
    std::remove_copy_if(
        m_on_hosted_tables_update_subs.begin(),
        m_on_hosted_tables_update_subs.end(),
        std::back_inserter(subs),
        [&client_id](const Subscription& item) {
            return item.client_id == client_id;
        }
    );

    m_on_hosted_tables_update_subs = subs;
}

std::uint32_t
ServerResources::get_table_view_count(const t_id& table_id) {
    const auto ret = m_table_to_view.find(table_id);
    return std::distance(ret, m_table_to_view.end());
}

void
ServerResources::mark_table_deleted(
    const t_id& table_id, std::uint32_t client_id, std::uint32_t msg_id
) {
    m_deleted_tables[table_id] = Subscription{msg_id, client_id};
}

bool
ServerResources::is_table_deleted(const t_id& table_id) {
    return get_table_view_count(table_id) == 0
        && m_deleted_tables.contains(table_id);
}

Subscription
ServerResources::get_table_deleted_client(const t_id& table_id) {
    return m_deleted_tables[table_id];
}

std::uint32_t
ProtoServer::new_session() {
    if (m_cpu_time_start.load().time_since_epoch().count() == 0) {
        m_cpu_time_start = std::chrono::high_resolution_clock::now();
    }

    return m_client_id++;
}

void
ProtoServer::close_session(const std::uint32_t client_id) {
    const auto start = std::chrono::high_resolution_clock::now();
    m_resources.drop_client(client_id);
    const auto end = std::chrono::high_resolution_clock::now();
    m_cpu_time +=
        std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
            .count();
}

std::vector<ProtoServerResp<std::string>>
ProtoServer::handle_request(
    std::uint32_t client_id, const std::string_view& data
) {
    const auto start = std::chrono::high_resolution_clock::now();
    proto::Request req_env;
    req_env.ParseFromString(data);
    std::vector<ProtoServerResp<std::string>> serialized_responses;
    std::vector<proto::Response> responses;

    auto msg_id = req_env.msg_id();
    auto entity_id = req_env.entity_id();
    try {
        auto resp_msg = _handle_request(client_id, std::move(req_env));
        for (auto& resp : resp_msg) {
            ProtoServerResp<std::string> str_resp;
            str_resp.data = resp.data.SerializeAsString();
            str_resp.client_id = resp.client_id;
            serialized_responses.emplace_back(std::move(str_resp));
        }
    } catch (const PerspectiveException& e) {
        proto::Response resp;
        auto* err = resp.mutable_server_error()->mutable_message();
        *err = std::string(e.what());
        responses.emplace_back(std::move(resp));
    } catch (const PerspectiveViewNotFoundException& e) {
        proto::Response resp;
        auto* err = resp.mutable_server_error();
        err->set_status_code(proto::StatusCode::VIEW_NOT_FOUND);
        auto* msg = err->mutable_message();
        *msg = std::string(e.what());
        responses.emplace_back(std::move(resp));
    } catch (const std::exception& e) {
        proto::Response resp;
        auto* err = resp.mutable_server_error()->mutable_message();
        *err = std::string(e.what());
        responses.emplace_back(std::move(resp));
    } catch (...) {
        proto::Response resp;
        auto* err = resp.mutable_server_error()->mutable_message();
        std::exception_ptr p = std::current_exception();
        *err = "Unknown exception";
        responses.emplace_back(std::move(resp));
    }

    // proto::Response resp_env;
    serialized_responses.reserve(responses.size());
    for (auto& resp : responses) {
        resp.set_msg_id(msg_id);
        resp.set_entity_id(entity_id);

        ProtoServerResp<std::string> str_resp;
        str_resp.data = resp.SerializeAsString();
        str_resp.client_id = client_id;
        serialized_responses.emplace_back(std::move(str_resp));
    }

    const auto end = std::chrono::high_resolution_clock::now();
    m_cpu_time +=
        std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
            .count();

    return serialized_responses;
}

std::vector<ProtoServerResp<std::string>>
ProtoServer::poll() {
    const auto start = std::chrono::high_resolution_clock::now();
    std::vector<ProtoServerResp<std::string>> out;
    try {
        const auto& responses = _poll();
        for (const auto& resp : responses) {
            ProtoServerResp<std::string> str_resp;
            str_resp.data = resp.data.SerializeAsString();
            str_resp.client_id = resp.client_id;
            out.emplace_back(str_resp);
        }

    } catch (const PerspectiveException& e) {
        proto::Response resp;
        auto* err = resp.mutable_server_error()->mutable_message();
        *err = std::string(e.what());
        ProtoServerResp<std::string> str_resp;
        str_resp.data = resp.SerializeAsString();
        str_resp.client_id = 0;
        out.emplace_back(std::move(str_resp));
    } catch (const PerspectiveViewNotFoundException& e) {
        proto::Response resp;
        auto* err = resp.mutable_server_error();
        err->set_status_code(proto::StatusCode::VIEW_NOT_FOUND);
        auto* msg = err->mutable_message();
        *msg = std::string(e.what());
        ProtoServerResp<std::string> str_resp;
        str_resp.data = resp.SerializeAsString();
        str_resp.client_id = 0;
        out.emplace_back(std::move(str_resp));
    } catch (const std::exception& e) {
        proto::Response resp;
        auto* err = resp.mutable_server_error()->mutable_message();
        *err = std::string(e.what());
        ProtoServerResp<std::string> str_resp;
        str_resp.data = resp.SerializeAsString();
        str_resp.client_id = 0;
        out.emplace_back(std::move(str_resp));
    } catch (...) {
        proto::Response resp;
        auto* err = resp.mutable_server_error()->mutable_message();
        std::exception_ptr p = std::current_exception();
        *err = "Unknown exception";
        ProtoServerResp<std::string> str_resp;
        str_resp.data = resp.SerializeAsString();
        str_resp.client_id = 0;
        out.emplace_back(std::move(str_resp));
    }

    const auto end = std::chrono::high_resolution_clock::now();
    m_cpu_time +=
        std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
            .count();

    return out;
}

proto::ColumnType
dtype_to_column_type(const t_dtype& t) {
    switch (t) {
        case t_dtype::DTYPE_BOOL:
            return proto::ColumnType::BOOLEAN;
        case t_dtype::DTYPE_UINT8:
        case t_dtype::DTYPE_UINT16:
        case t_dtype::DTYPE_UINT32:
        case t_dtype::DTYPE_UINT64:
        case t_dtype::DTYPE_INT8:
        case t_dtype::DTYPE_INT16:
        case t_dtype::DTYPE_INT32:
        case t_dtype::DTYPE_INT64:
            return proto::ColumnType::INTEGER;
        case t_dtype::DTYPE_FLOAT32:
        case t_dtype::DTYPE_FLOAT64:
            return proto::ColumnType::FLOAT;
        case t_dtype::DTYPE_STR:
            return proto::ColumnType::STRING;
        case t_dtype::DTYPE_DATE:
            return proto::ColumnType::DATE;
        case t_dtype::DTYPE_TIME:
            return proto::ColumnType::DATETIME;
        default:
            PSP_COMPLAIN_AND_ABORT("Invalid type " + dtype_to_str(t));
            return proto::ColumnType::STRING;
    }
}

t_dtype
column_type_to_dtype(const proto::ColumnType& t) {
    switch (t) {
        case proto::ColumnType::BOOLEAN:
            return t_dtype::DTYPE_BOOL;
        case proto::ColumnType::FLOAT:
            return t_dtype::DTYPE_FLOAT64;
        case proto::ColumnType::INTEGER:
            return t_dtype::DTYPE_INT32;
        case proto::ColumnType::DATE:
            return t_dtype::DTYPE_DATE;
        case proto::ColumnType::DATETIME:
            return t_dtype::DTYPE_TIME;
        case proto::ColumnType::STRING:
            return t_dtype::DTYPE_STR;
        default:
            PSP_COMPLAIN_AND_ABORT("Invalid column type");
            return t_dtype::DTYPE_STR;
    }
}

struct ValidViewPort {
    std::uint32_t start_row;
    std::uint32_t end_row;
    std::uint32_t start_col;
    std::uint32_t end_col;
};

static ValidViewPort
parse_format_options(
    const proto::ViewPort& viewport,
    std::uint32_t num_columns,
    std::uint32_t num_rows,
    std::uint32_t sides,
    bool column_only,
    std::uint32_t num_hidden,
    std::uint32_t viewport_top = 0,
    std::uint32_t viewport_left = 0,
    std::uint32_t viewport_height = 0,
    std::uint32_t viewport_width = 0
) {
    ValidViewPort out;
    out.start_row =
        viewport.has_start_row() ? viewport.start_row() : viewport_top;
    out.start_col =
        viewport.has_start_col() ? viewport.start_col() : viewport_left;

    std::uint32_t max_cols = num_columns + (sides == 0 ? 0 : 1);
    std::uint32_t max_rows = num_rows;
    std::uint32_t psp_offset = sides > 0 || column_only ? 1 : 0;
    std::uint32_t hidden = num_hidden;

    out.end_row = std::min(
        max_rows,
        viewport.has_end_row()
            ? viewport.end_row()
            : (viewport_height != 0 ? out.start_row + viewport_height : max_rows
            )
    );
    out.end_col = std::min(
        max_cols,
        (viewport.has_end_col()
             ? viewport.end_col() + psp_offset
             : (viewport_width != 0 ? out.start_col + viewport_width : max_cols)
        ) * (hidden + 1)
    );

    return out;
}

static constexpr bool
needs_poll(const proto::Request::ClientReqCase proto_case) {
    using ReqCase = proto::Request::ClientReqCase;

    switch (proto_case) {
        case ReqCase::kTableSizeReq:
        case ReqCase::kTableSchemaReq:
        case ReqCase::kTableMakePortReq:
        case ReqCase::kTableValidateExprReq:
        case ReqCase::kMakeTableReq:
        case ReqCase::kViewDimensionsReq:
        case ReqCase::kViewToColumnsStringReq:
        case ReqCase::kViewToCsvReq:
        case ReqCase::kViewToRowsStringReq:
        case ReqCase::kViewToNdjsonStringReq:
        case ReqCase::kViewToArrowReq:
        case ReqCase::kViewSchemaReq:
        case ReqCase::kViewGetMinMaxReq:
        case ReqCase::kTableRemoveReq:
        case ReqCase::kTableMakeViewReq:
        case ReqCase::kViewOnUpdateReq:
        case ReqCase::kViewCollapseReq:
        case ReqCase::kViewExpandReq:
        case ReqCase::kViewSetDepthReq:
            return true;
        case ReqCase::kTableOnDeleteReq:
        case ReqCase::kViewOnDeleteReq:
        case ReqCase::kViewRemoveDeleteReq:
        case ReqCase::kTableUpdateReq:
        case ReqCase::kTableRemoveDeleteReq:
        case ReqCase::kGetHostedTablesReq:
        case ReqCase::kRemoveHostedTablesUpdateReq:
        case ReqCase::kTableReplaceReq:
        case ReqCase::kTableDeleteReq:
        case ReqCase::kViewGetConfigReq:
        case ReqCase::kViewColumnPathsReq:
        case ReqCase::kViewDeleteReq:
        case ReqCase::kViewExpressionSchemaReq:
        case ReqCase::kViewRemoveOnUpdateReq:
        case ReqCase::kServerSystemInfoReq:
        case ReqCase::kGetFeaturesReq:
            return false;
        case proto::Request::CLIENT_REQ_NOT_SET:
            throw std::runtime_error("Unhandled request type 2");
    }
    throw std::runtime_error("Unhandled request type");
}

static constexpr bool
entity_type_is_table(const proto::Request::ClientReqCase proto_case) {
    using ReqCase = proto::Request::ClientReqCase;

    switch (proto_case) {
        case ReqCase::kTableSizeReq:
        case ReqCase::kTableSchemaReq:
        case ReqCase::kTableMakePortReq:
        case ReqCase::kTableValidateExprReq:
        case ReqCase::kMakeTableReq:
        case ReqCase::kTableOnDeleteReq:
        case ReqCase::kTableRemoveReq:
        case ReqCase::kTableUpdateReq:
        case ReqCase::kTableRemoveDeleteReq:
        case ReqCase::kGetHostedTablesReq:
        case ReqCase::kServerSystemInfoReq:
        case ReqCase::kGetFeaturesReq:
        case ReqCase::kTableReplaceReq:
        case ReqCase::kTableDeleteReq:
        case ReqCase::kTableMakeViewReq:
            return true;
        case ReqCase::kViewOnDeleteReq:
        case ReqCase::kViewRemoveDeleteReq:
        case ReqCase::kViewDimensionsReq:
        case ReqCase::kViewToColumnsStringReq:
        case ReqCase::kViewToCsvReq:
        case ReqCase::kViewToNdjsonStringReq:
        case ReqCase::kViewToRowsStringReq:
        case ReqCase::kViewToArrowReq:
        case ReqCase::kViewSchemaReq:
        case ReqCase::kViewGetMinMaxReq:
        case ReqCase::kViewOnUpdateReq:
        case ReqCase::kViewCollapseReq:
        case ReqCase::kViewExpandReq:
        case ReqCase::kViewSetDepthReq:
        case ReqCase::kViewGetConfigReq:
        case ReqCase::kViewColumnPathsReq:
        case ReqCase::kViewDeleteReq:
        case ReqCase::kViewExpressionSchemaReq:
        case ReqCase::kViewRemoveOnUpdateReq:
        case ReqCase::kRemoveHostedTablesUpdateReq:
            return false;
        case proto::Request::CLIENT_REQ_NOT_SET:
            throw std::runtime_error("Unhandled request type 2");
    }
    throw std::runtime_error("Unhandled request type");
}

void
ProtoServer::handle_process_table(
    const Request& req,
    std::vector<ProtoServerResp<ProtoServer::Response>>& proto_resp
) {
    if (!m_realtime_mode && needs_poll(req.client_req_case())) {
        if (entity_type_is_table(req.client_req_case())) {
            if (m_resources.is_table_dirty(req.entity_id())) {
                auto table = m_resources.get_table(req.entity_id());
                const auto& table_id = req.entity_id();
                _process_table(table, table_id, proto_resp);
            }
        } else {
            auto table_id = m_resources.get_table_id_for_view(req.entity_id());
            if (m_resources.is_table_dirty(table_id)) {
                auto table = m_resources.get_table(table_id);
                _process_table(table, table_id, proto_resp);
            }
        }
    }
}

static std::string_view
view_sides_to_string(const ErasedView& view) {
    switch (view.sides()) {
        case 0:
            return "zero";
        case 1:
            return "one";
        case 2:
            return "two";
        default:
            PSP_COMPLAIN_AND_ABORT("Invalid number of sides");
    }
}

static std::uint32_t
calculate_num_hidden(const ErasedView& view, const t_view_config& config) {
    LOG_DEBUG("Calculating num hidden");
    auto num_hidden = 0;
    auto sides = view.sides();
    LOG_DEBUG("View sides: " << sides);
    switch (sides) {
        case 0:
            break;
        case 1:
        case 2: {
            const auto& cols = config.get_columns();
            for (const auto& s : config.get_sortspec()) {
                LOG_DEBUG("Checking sort spec: " << s.m_colname);
                if (std::find(cols.begin(), cols.end(), s.m_colname)
                    == cols.end()) {
                    LOG_DEBUG("Found hidden column: " << s.m_colname);
                    num_hidden++;
                }
            }
            for (const auto& s : config.get_col_sortspec()) {
                if (std::find(cols.begin(), cols.end(), s.m_colname)
                    == cols.end()) {
                    LOG_DEBUG("Found hidden column: " << s.m_colname);
                    num_hidden++;
                }
            }
        } break;
        default:
            PSP_COMPLAIN_AND_ABORT(
                "Invalid number of sides: " + std::to_string(view.sides())
            );
    }
    return num_hidden;
}

template <typename A>
static t_tscalar
coerce_to(const t_dtype dtype, const A& val) {
    if constexpr (std::is_same_v<A, const char*>) {
        t_tscalar scalar;
        scalar.clear();
        switch (dtype) {
            case DTYPE_STR:
                scalar.set(val);
                return scalar;
            case DTYPE_BOOL:
                scalar.set(val == "true");
                return scalar;
            case DTYPE_FLOAT32:
                scalar.set(std::stof(val));
                return scalar;
            case DTYPE_FLOAT64:
                scalar.set(std::stod(val));
                return scalar;
            case DTYPE_UINT8:
                scalar.set((std::uint8_t)std::stoul(val));
                return scalar;
            case DTYPE_UINT16:
                scalar.set((std::uint16_t)std::stoul(val));
                return scalar;
            case DTYPE_UINT32:
                scalar.set((std::uint32_t)std::stoul(val));
                return scalar;
            case DTYPE_UINT64:
                scalar.set((std::uint64_t)std::stoull(val));
                return scalar;
            case DTYPE_INT8:
                scalar.set((std::int8_t)std::stoi(val));
                return scalar;
            case DTYPE_INT16:
                scalar.set((std::int16_t)std::stoi(val));
                return scalar;
            case DTYPE_INT32:
                scalar.set((std::int32_t)std::stoi(val));
                return scalar;
            case DTYPE_INT64:
                scalar.set((std::int64_t)std::stoll(val));
                return scalar;
            case DTYPE_TIME: {
                std::chrono::system_clock::time_point tp;

                if (!parse_all_date_time(tp, val)) {
                    PSP_COMPLAIN_AND_ABORT("Invalid date format");
                }

                // If parsing succeeded, create a time structure
                t_time time{
                    std::chrono::duration_cast<std::chrono::milliseconds>(
                        tp.time_since_epoch()
                    )
                        .count()
                };

                LOG_DEBUG("Parsed time: " << time.raw_value());
                scalar.set(time);
                return scalar;
            }
            case DTYPE_DATE: {
                std::tm tm = {};
                if (!parse_all_date_time(tm, val)) {
                    PSP_COMPLAIN_AND_ABORT("Invalid date format");
                }
                t_date date{
                    static_cast<std::int16_t>(tm.tm_year + 1900),
                    static_cast<std::int8_t>(tm.tm_mon),
                    static_cast<std::int8_t>(tm.tm_mday)
                };

                LOG_DEBUG("Parsed date: " << date.str());
                scalar.set(date);
                return scalar;
            }
            default:
                PSP_COMPLAIN_AND_ABORT(
                    "Column of type " + dtype_to_str(dtype)
                    + " cannot cast from string"
                );
        }
    } else if constexpr (std::is_same_v<A, double>) {
        t_tscalar scalar;
        scalar.clear();
        switch (dtype) {
            case DTYPE_BOOL:
                scalar.set(val == 1);
                return scalar;
            case DTYPE_UINT32:
                scalar.set((std::uint32_t)val);
                return scalar;
            case DTYPE_UINT64:
                scalar.set((std::uint64_t)val);
                return scalar;
            case DTYPE_INT32:
                scalar.set(val);
                return scalar;
            case DTYPE_INT64:
                scalar.set((std::int64_t)val);
                return scalar;
            case DTYPE_FLOAT32:
                scalar.set(static_cast<float>(val));
                return scalar;
            case DTYPE_FLOAT64:
                scalar.set(val);
                return scalar;
            case DTYPE_DATE: {
                const auto time = static_cast<time_t>(val / 1000);
                std::tm* tm = std::gmtime(&time);
                t_date date{
                    static_cast<std::int16_t>(tm->tm_year + 1900),
                    static_cast<std::int8_t>(tm->tm_mon),
                    static_cast<std::int8_t>(tm->tm_mday)
                };

                scalar.set(date);
                return scalar;
            }
            case DTYPE_TIME: {
                t_time time{std::chrono::milliseconds((long long)val).count()};
                scalar.set(time);
                return scalar;
            }
            default:
                PSP_COMPLAIN_AND_ABORT("Unsupported double type");
        }
    } else if constexpr (std::is_same_v<A, std::int32_t>) {
        return t_tscalar(val);
    } else if constexpr (std::is_same_v<A, std::int64_t>) {
        return t_tscalar(val);
    } else if constexpr (std::is_same_v<A, bool>) {
        return t_tscalar(val);
    } else {
        static_assert(!std::is_same_v<A, A>, "Unsupported type");
    }
}

std::vector<ProtoServerResp<ProtoServer::Response>>
ProtoServer::_handle_request(std::uint32_t client_id, Request&& req) {
    std::vector<ProtoServerResp<ProtoServer::Response>> proto_resp;
    // proto::Response resp_env;

    auto msg_id = req.msg_id();
    auto entity_id = req.entity_id();

    auto push_resp = [&](Response&& resp) {
        resp.set_msg_id(msg_id);
        resp.set_entity_id(entity_id);
        ProtoServerResp<ProtoServer::Response> resp2;
        resp2.data = std::move(resp);
        resp2.client_id = client_id;
        proto_resp.emplace_back(std::move(resp2));
    };

    if (!m_realtime_mode) {
        handle_process_table(req, proto_resp);
    }

    switch (req.client_req_case()) {
        case proto::Request::kGetFeaturesReq: {
            proto::Response resp;
            const auto& features = resp.mutable_get_features_resp();
            features->set_group_by(true);
            features->set_split_by(true);
            features->set_sort(true);
            features->set_on_update(true);
            features->set_expressions(true);
            proto::GetFeaturesResp_ColumnTypeOptions opts;
            opts.add_options("==");
            opts.add_options("!=");
            opts.add_options(">");
            opts.add_options(">=");
            opts.add_options("<");
            opts.add_options("<=");
            opts.add_options("begins with");
            opts.add_options("contains");
            opts.add_options("ends with");
            opts.add_options("in");
            opts.add_options("not in");
            opts.add_options("is not null");
            opts.add_options("is null");
            (*features->mutable_filter_ops())[proto::ColumnType::STRING] =
                std::move(opts);

            proto::GetFeaturesResp_ColumnTypeOptions opts2;
            opts2.add_options("==");
            opts2.add_options("!=");
            opts2.add_options(">");
            opts2.add_options(">=");
            opts2.add_options("<");
            opts2.add_options("<=");
            opts2.add_options("is not null");
            opts2.add_options("is null");
            (*features->mutable_filter_ops())[proto::ColumnType::INTEGER] =
                opts2;
            (*features->mutable_filter_ops())[proto::ColumnType::FLOAT] = opts2;
            (*features->mutable_filter_ops())[proto::ColumnType::DATE] = opts2;
            (*features->mutable_filter_ops())[proto::ColumnType::DATETIME] =
                opts2;
            (*features->mutable_filter_ops())[proto::ColumnType::INTEGER] =
                std::move(opts2);

            proto::GetFeaturesResp_ColumnTypeOptions opts3;
            opts3.add_options("==");
            // opts3.add_options("!=");
            opts.add_options("is not null");
            opts.add_options("is null");
            (*features->mutable_filter_ops())[proto::ColumnType::BOOLEAN] =
                opts2;

            proto::GetFeaturesResp_AggregateOptions string_opts;
            string_opts.add_aggregates()->set_name("count");
            string_opts.add_aggregates()->set_name("any");
            string_opts.add_aggregates()->set_name("distinct count");
            string_opts.add_aggregates()->set_name("dominant");
            string_opts.add_aggregates()->set_name("first");
            string_opts.add_aggregates()->set_name("join");
            string_opts.add_aggregates()->set_name("last");
            string_opts.add_aggregates()->set_name("last by index");
            string_opts.add_aggregates()->set_name("median");
            string_opts.add_aggregates()->set_name("q1");
            string_opts.add_aggregates()->set_name("q3");
            string_opts.add_aggregates()->set_name("unique");
            auto args1 = string_opts.add_aggregates();
            args1->set_name("min by");
            args1->add_args(proto::ColumnType::FLOAT);
            auto args2 = string_opts.add_aggregates();
            args2->set_name("max by");
            args2->add_args(proto::ColumnType::FLOAT);
            (*features->mutable_aggregates())[proto::ColumnType::STRING] =
                string_opts;

            (*features->mutable_aggregates())[proto::ColumnType::BOOLEAN] =
                string_opts;

            proto::GetFeaturesResp_AggregateOptions number_opts;
            number_opts.add_aggregates()->set_name("sum");
            number_opts.add_aggregates()->set_name("abs sum");
            number_opts.add_aggregates()->set_name("any");
            number_opts.add_aggregates()->set_name("avg");
            number_opts.add_aggregates()->set_name("count");
            number_opts.add_aggregates()->set_name("distinct count");
            number_opts.add_aggregates()->set_name("dominant");
            number_opts.add_aggregates()->set_name("first");
            number_opts.add_aggregates()->set_name("high");
            number_opts.add_aggregates()->set_name("low");
            number_opts.add_aggregates()->set_name("max");
            number_opts.add_aggregates()->set_name("min");
            number_opts.add_aggregates()->set_name("high minus low");
            number_opts.add_aggregates()->set_name("last by index");
            number_opts.add_aggregates()->set_name("last minus first");
            number_opts.add_aggregates()->set_name("last");
            number_opts.add_aggregates()->set_name("mean");
            number_opts.add_aggregates()->set_name("median");
            number_opts.add_aggregates()->set_name("q1");
            number_opts.add_aggregates()->set_name("q3");
            number_opts.add_aggregates()->set_name("pct sum parent");
            number_opts.add_aggregates()->set_name("pct sum total");
            number_opts.add_aggregates()->set_name("stddev");
            number_opts.add_aggregates()->set_name("sum abs");
            number_opts.add_aggregates()->set_name("sum not null");
            number_opts.add_aggregates()->set_name("unique");
            number_opts.add_aggregates()->set_name("var");
            auto args3 = number_opts.add_aggregates();
            args3->set_name("weighted mean");
            args3->add_args(proto::ColumnType::FLOAT);
            (*features->mutable_aggregates())[proto::ColumnType::INTEGER] =
                number_opts;

            (*features->mutable_aggregates())[proto::ColumnType::FLOAT] =
                number_opts;

            proto::GetFeaturesResp_AggregateOptions datetime_opts;
            datetime_opts.add_aggregates()->set_name("count");
            datetime_opts.add_aggregates()->set_name("any");
            datetime_opts.add_aggregates()->set_name("avg");
            datetime_opts.add_aggregates()->set_name("distinct count");
            datetime_opts.add_aggregates()->set_name("dominant");
            datetime_opts.add_aggregates()->set_name("first");
            datetime_opts.add_aggregates()->set_name("high");
            datetime_opts.add_aggregates()->set_name("low");
            datetime_opts.add_aggregates()->set_name("min");
            datetime_opts.add_aggregates()->set_name("max");
            datetime_opts.add_aggregates()->set_name("last by index");
            datetime_opts.add_aggregates()->set_name("last");
            datetime_opts.add_aggregates()->set_name("median");
            datetime_opts.add_aggregates()->set_name("q1");
            datetime_opts.add_aggregates()->set_name("q3");
            datetime_opts.add_aggregates()->set_name("unique");
            (*features->mutable_aggregates())[proto::ColumnType::DATE] =
                datetime_opts;

            (*features->mutable_aggregates())[proto::ColumnType::DATETIME] =
                datetime_opts;

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kGetHostedTablesReq: {
            const auto& r = req.get_hosted_tables_req();
            if (!r.subscribe()) {
                proto::Response resp;
                const auto& tables = resp.mutable_get_hosted_tables_resp();
                const auto& infos = tables->mutable_table_infos();
                for (const auto& name : m_resources.get_table_ids()) {
                    const auto& v = infos->Add();

                    v->set_entity_id(name);
                    const auto tbl = m_resources.get_table(name);

                    if (!tbl->get_index().empty()) {
                        v->set_index(tbl->get_index());
                    }

                    if (tbl->get_limit() != std::numeric_limits<int>::max()) {
                        v->set_limit(tbl->get_limit());
                    }
                }

                push_resp(std::move(resp));
            } else {
                Subscription sub_info;
                sub_info.id = req.msg_id();
                sub_info.client_id = client_id;
                m_resources.create_on_hosted_tables_update_sub(sub_info);
            }

            break;
        }
        case proto::Request::kRemoveHostedTablesUpdateReq: {
            auto sub_id = req.remove_hosted_tables_update_req().id();
            m_resources.remove_on_hosted_tables_update_sub(sub_id, client_id);
            proto::Response resp;
            resp.mutable_remove_hosted_tables_update_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kMakeTableReq: {
            const auto& r = req.make_table_req();
            std::string index;
            std::uint32_t limit = std::numeric_limits<int>::max();
            std::shared_ptr<Table> table;
            switch (r.options().make_table_type_case()) {
                case proto::MakeTableReq_MakeTableOptions::kMakeLimitTable: {
                    limit = r.options().make_limit_table();
                    break;
                }
                case proto::MakeTableReq_MakeTableOptions::kMakeIndexTable: {
                    index = r.options().make_index_table();
                    break;
                }
                case proto::MakeTableReq_MakeTableOptions::
                    MAKE_TABLE_TYPE_NOT_SET:
                    break;
            }

            switch (r.data().data_case()) {
                case proto::MakeTableData::kFromView: {
                    auto view = m_resources.get_view(r.data().from_view());
                    proto::ViewPort viewport;
                    auto dims = parse_format_options(
                        viewport,
                        view->num_columns(),
                        view->num_rows(),
                        view->sides(),
                        view->get_view_config()->is_column_only(),
                        0
                    );
                    auto arrow = view->to_arrow(
                        dims.start_row,
                        dims.end_row,
                        dims.start_col,
                        dims.end_col
                    );

                    table = Table::from_arrow(index, std::move(*arrow), limit);
                    break;
                }
                case proto::MakeTableData::kFromArrow: {
                    std::string data = r.data().from_arrow();
                    { auto _ = std::move(req); }

                    table = Table::from_arrow(index, std::move(data), limit);
                    break;
                }
                case proto::MakeTableData::kFromCsv: {
                    std::string data = r.data().from_csv();
                    { auto _ = std::move(req); }

                    table = Table::from_csv(index, std::move(data), limit);
                    break;
                }
                case proto::MakeTableData::kFromCols: {
                    std::string data = r.data().from_cols();
                    { auto _ = std::move(req); }

                    table = Table::from_cols(index, std::move(data), limit);
                    break;
                }
                case proto::MakeTableData::kFromRows: {
                    std::string data = r.data().from_rows();
                    { auto _ = std::move(req); }

                    table = Table::from_rows(index, std::move(data), limit);
                    break;
                }
                case proto::MakeTableData::kFromNdjson: {
                    std::string data = r.data().from_ndjson();
                    { auto _ = std::move(req); }

                    table = Table::from_ndjson(index, std::move(data), limit);
                    break;
                }
                case proto::MakeTableData::kFromSchema: {
                    std::vector<std::string> columns;
                    std::vector<t_dtype> types;
                    const auto& schema = r.data().from_schema().schema();
                    for (const auto& it : schema) {
                        columns.push_back(it.name());
                        types.push_back(column_type_to_dtype(it.type()));
                    }

                    t_schema table_schema(columns, types);
                    table = Table::from_schema(index, table_schema, limit);
                    break;
                }
                case proto::MakeTableData::DATA_NOT_SET: {
                    PSP_COMPLAIN_AND_ABORT("MakeTableReq malformed");
                    break;
                }
            }

            m_resources.host_table(entity_id, table);
            proto::Response resp;
            resp.mutable_make_table_resp();
            push_resp(std::move(resp));

            // Notify `on_thsoted_tables_update` listeners
            auto subscriptions = m_resources.get_on_hosted_tables_update_sub();
            for (auto& subscription : subscriptions) {
                Response out;
                out.set_msg_id(subscription.id);
                ProtoServerResp<ProtoServer::Response> resp2;
                resp2.data = std::move(out);
                resp2.client_id = subscription.client_id;
                proto_resp.emplace_back(std::move(resp2));
            }

            break;
        }
        case proto::Request::kTableSizeReq: {
            auto table = m_resources.get_table(req.entity_id());
            proto::Response resp;
            auto* tbl_size = resp.mutable_table_size_resp();
            tbl_size->set_size(table->size());
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableSchemaReq: {
            auto table = m_resources.get_table(req.entity_id());

            proto::Response resp;
            auto* output_schema =
                resp.mutable_table_schema_resp()->mutable_schema();
            auto table_schema = table->get_schema();
            auto columns = table_schema.columns();
            auto types = table_schema.types();
            for (std::size_t i = 0; i < table_schema.size(); ++i) {
                auto* ktp = output_schema->add_schema();
                ktp->set_name(columns[i]);
                ktp->set_type(dtype_to_column_type(types[i]));
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableMakePortReq: {
            auto table = m_resources.get_table(req.entity_id());
            proto::Response resp;
            auto* make_port = resp.mutable_table_make_port_resp();
            make_port->set_port_id(table->make_port());

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableValidateExprReq: {
            auto table = m_resources.get_table(req.entity_id());
            const auto& r = req.table_validate_expr_req();

            const auto& col_with_expr = r.column_to_expr();
            const auto& exprs = parse_expression_strings(col_with_expr);

            // TODO: validate the expression, mocked out for now
            proto::Response resp;
            auto* validate_expr = resp.mutable_table_validate_expr_resp();

            std::vector<std::tuple<
                std::string,
                std::string,
                std::string,
                std::vector<std::pair<std::string, std::string>>>>
                legacy_exprs;

            legacy_exprs.reserve(exprs.size());
            for (const auto& expr : exprs) {
                legacy_exprs.emplace_back(
                    expr.expression_alias,
                    expr.expression,
                    expr.parse_expression_string,
                    std::vector<std::pair<std::string, std::string>>{
                        expr.column_id_map.begin(), expr.column_id_map.end()
                    }
                );
            }

            const auto& res = table->validate_expressions(legacy_exprs);

            std::vector<std::pair<std::string, proto::ColumnType>> schema;
            for (const auto& [col, val] : res.get_expression_schema()) {
                schema.emplace_back(
                    col, dtype_to_column_type(str_to_dtype(val))
                );
            }

            for (auto&& [col_name, col_type] : schema) {
                (*validate_expr->mutable_expression_schema())[col_name] =
                    col_type;
            }

            std::vector<std::pair<
                std::string,
                proto::TableValidateExprResp_ExprValidationError>>
                errors;
            for (const auto& [col_name, err] : res.get_expression_errors()) {
                proto::TableValidateExprResp_ExprValidationError proto_err;
                *proto_err.mutable_error_message() = err.m_error_message;
                proto_err.set_column(err.m_column);
                proto_err.set_line(err.m_line);
                (*validate_expr->mutable_errors())[col_name] =
                    std::move(proto_err);
            }

            for (const auto& [col_name, col_expr] : r.column_to_expr()) {
                (*validate_expr->mutable_expression_alias())[col_name] =
                    col_expr;
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableReplaceReq: {
            auto table = m_resources.get_table(req.entity_id());
            table->clear();
            const auto& r = req.table_replace_req();
            switch (r.data().data_case()) {
                case proto::MakeTableData::kFromArrow: {
                    table->update_arrow(r.data().from_arrow(), 0);
                    break;
                }
                case proto::MakeTableData::kFromCsv: {
                    table->update_csv(r.data().from_csv(), 0);
                    break;
                }
                case proto::MakeTableData::kFromRows: {
                    table->update_rows(r.data().from_rows(), 0);
                    break;
                }
                case proto::MakeTableData::kFromCols:
                    table->update_cols(r.data().from_cols(), 0);
                    break;
                case proto::MakeTableData::kFromSchema:
                case proto::MakeTableData::DATA_NOT_SET:
                default: {
                    PSP_COMPLAIN_AND_ABORT("TableReplaceReq malformed");
                    break;
                }
            }

            m_resources.mark_table_dirty(req.entity_id());
            proto::Response resp;
            resp.mutable_table_replace_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableRemoveReq: {
            const auto& r = req.table_remove_req();
            auto table = m_resources.get_table(req.entity_id());
            switch (r.data().data_case()) {
                case proto::MakeTableData::kFromCols: {
                    table->remove_cols(r.data().from_cols());
                    break;
                }
                case proto::MakeTableData::kFromRows: {
                    table->remove_rows(r.data().from_rows());
                    break;
                }
                case proto::MakeTableData::kFromArrow:
                case proto::MakeTableData::kFromCsv:
                case proto::MakeTableData::kFromSchema:
                case proto::MakeTableData::DATA_NOT_SET:
                default: {
                    PSP_COMPLAIN_AND_ABORT("remove malformed");
                    break;
                }
            }

            //  proto_resp.should_poll = true;
            m_resources.mark_table_dirty(req.entity_id());
            proto::Response resp;
            resp.mutable_table_remove_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableUpdateReq: {
            const auto& r = req.table_update_req();
            auto table = m_resources.get_table(req.entity_id());
            switch (r.data().data_case()) {
                case proto::MakeTableData::kFromArrow: {
                    table->update_arrow(r.data().from_arrow(), r.port_id());
                    break;
                }
                case proto::MakeTableData::kFromCsv: {
                    table->update_csv(r.data().from_csv(), r.port_id());
                    break;
                }
                case proto::MakeTableData::kFromRows: {
                    table->update_rows(r.data().from_rows(), r.port_id());
                    break;
                }
                case proto::MakeTableData::kFromCols: {
                    table->update_cols(r.data().from_cols(), r.port_id());
                    break;
                }
                case proto::MakeTableData::kFromNdjson: {
                    table->update_ndjson(r.data().from_ndjson(), r.port_id());
                    break;
                }
                case proto::MakeTableData::kFromSchema:
                case proto::MakeTableData::DATA_NOT_SET:
                default: {
                    PSP_COMPLAIN_AND_ABORT("MakeTableReq malformed");
                    break;
                }
            }

            m_resources.mark_table_dirty(req.entity_id());
            proto::Response resp;
            resp.mutable_table_update_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableMakeViewReq: {
            auto table = m_resources.get_table(req.entity_id());
            auto schema = std::make_shared<t_schema>(
                table->get_gnode()->get_output_schema()
            );
            const auto& r = req.table_make_view_req();
            const auto& cfg = r.config();

            const auto& group_by = cfg.group_by();
            std::vector<std::string> row_pivots{
                group_by.begin(), group_by.end()
            };

            const auto& split_by = cfg.split_by();
            std::vector<std::string> column_pivots{
                split_by.begin(), split_by.end()
            };

            const auto& aggs = cfg.aggregates();
            tsl::ordered_map<std::string, std::vector<std::string>> aggregates;
            for (const auto& [col_name, agg_list] : aggs) {
                aggregates[col_name] = std::vector<std::string>();
                for (const auto& agg : agg_list.aggregations()) {
                    aggregates[col_name].push_back(agg);
                }
            }

            const auto& sorts = cfg.sort();
            std::vector<t_sortspec> sortby;
            std::vector<std::vector<std::string>> sort_str;
            for (const auto& sort : sorts) {
                const char* column_sort = sort_op_str_from_proto(sort.op());
                sort_str.push_back({sort.column(), column_sort});
            }

            bool column_only = false;

            // make sure that primary keys are created for column-only views
            if (row_pivots.empty() && !column_pivots.empty()) {
                row_pivots.emplace_back("psp_okey");
                column_only = true;
            }

            std::vector<std::shared_ptr<t_computed_expression>> expressions;
            auto exprs = parse_expression_strings(cfg.expressions());

            std::vector<std::tuple<
                std::string,
                std::string,
                std::string,
                std::vector<std::pair<std::string, std::string>>>>
                legacy_exprs;

            legacy_exprs.resize(1);
            for (const auto& expr : exprs) {
                legacy_exprs[0] = {
                    expr.expression_alias,
                    expr.expression,
                    expr.parse_expression_string,
                    std::vector<std::pair<std::string, std::string>>{
                        expr.column_id_map.begin(), expr.column_id_map.end()
                    }
                };

                // Validate these expression, creating is not the same thing!
                const auto& res = table->validate_expressions(legacy_exprs);
                if (!res.get_expression_errors().empty()) {
                    // TODO unify error reporting - this works differently than
                    // `validate_expressions()`. In this case there is
                    // guaranteed to only be one ...
                    PSP_COMPLAIN_AND_ABORT(res.get_expression_errors()
                                               .at(expr.expression_alias)
                                               .m_error_message);
                }

                const auto& gnode = table->get_gnode();
                auto column_id_map =
                    std::vector<std::pair<std::string, std::string>>(
                        expr.column_id_map.begin(), expr.column_id_map.end()
                    );

                auto expr_vocab = gnode->get_expression_vocab();
                t_expression_vocab& expression_vocab = *expr_vocab;
                auto expression_regex_mapping =
                    gnode->get_expression_regex_mapping();
                t_regex_mapping& regex_mapping = *expression_regex_mapping;

                std::shared_ptr<t_computed_expression> computed_expression =
                    m_computed_expression_parser.precompute(
                        expr.expression_alias,
                        expr.expression,
                        expr.parse_expression_string,
                        column_id_map,
                        gnode->get_table_sptr(),
                        gnode->get_pkey_map(),
                        schema,
                        expression_vocab,
                        regex_mapping
                    );

                auto dtype = computed_expression->get_dtype();

                schema->add_column(expr.expression_alias, dtype);
                expressions.push_back(std::make_shared<t_computed_expression>(
                    expr.expression_alias,
                    expr.expression,
                    expr.parse_expression_string,
                    column_id_map,
                    dtype
                ));
            }

            t_vocab vocab;
            vocab.init(false);
            std::vector<
                std::tuple<std::string, std::string, std::vector<t_tscalar>>>
                filter;
            filter.reserve(cfg.filter().size());

            for (const auto& f : cfg.filter()) {
                for (const auto& arg : f.value()) {
                    switch (arg.scalar_case()) {
                        case proto::Scalar::kString: {
#ifdef PSP_SSO_SCALAR
                            if (!t_tscalar::can_store_inplace(arg.string())) {
                                vocab.get_interned(arg.string());
                            }
#else
                            vocab.get_interned(arg.string());
#endif
                            break;
                        }
                        case proto::Scalar::kBool:
                        case proto::Scalar::kFloat:
                        case proto::Scalar::kNull:
                        case proto::Scalar::SCALAR_NOT_SET:
                            break;
                    }
                }
            }

            for (const auto& f : cfg.filter()) {
                std::vector<t_tscalar> args;
                args.reserve(f.value().size());
                for (const auto& arg : f.value()) {
                    t_tscalar a;
                    a.clear();
                    switch (arg.scalar_case()) {
                        case proto::Scalar::kBool: {
                            a.set(arg.bool_());
                            args.push_back(a);
                            break;
                        }
                        case proto::Scalar::kFloat: {
                            a = coerce_to(
                                schema->get_dtype(f.column()), arg.float_()
                            );

                            args.push_back(a);
                            break;
                        }
                        case proto::Scalar::kString: {
                            if (!schema->has_column(f.column())) {
                                PSP_COMPLAIN_AND_ABORT(
                                    "Filter column not in schema: " + f.column()
                                );
                            }

#ifdef PSP_SSO_SCALAR
                            if (!t_tscalar::can_store_inplace(arg.string())) {
#endif
                                a = coerce_to(
                                    schema->get_dtype(f.column()),
                                    vocab.unintern_c(
                                        vocab.get_interned(arg.string())
                                    )
                                );
#ifdef PSP_SSO_SCALAR
                            } else {

                                a = coerce_to(
                                    schema->get_dtype(f.column()),
                                    arg.string().c_str()
                                );
                            }
#endif
                            args.push_back(a);
                            break;
                        }
                        case proto::Scalar::kNull:
                            a.set(t_none());
                            args.push_back(a);
                            break;
                        case proto::Scalar::SCALAR_NOT_SET:
                            PSP_COMPLAIN_AND_ABORT(
                                "Filter scalar type not implemented: "
                                + std::to_string(arg.scalar_case())
                            )
                            break;
                    }
                }

                filter.emplace_back(f.column(), f.op(), args);
            }

            const auto& cols = cfg.columns();
            std::vector<std::string> columns;
            if (cols.has_columns()) {
                columns = {
                    cols.columns().columns().begin(),
                    cols.columns().columns().end()
                };
            } else {
                columns = table->get_column_names();
                for (const auto& f : expressions) {
                    columns.push_back(f->get_expression_alias());
                }
            }

            LOG_DEBUG(
                "Creating view config with \n"
                << "row_pivots: " << row_pivots << '\n'
                << "column_pivots: " << column_pivots
                << '\n'
                // << "aggregates: " << aggregates << '\n'
                << "columns: " << columns
                << '\n'
                // << "filter: " << filter << '\n'
                << "sort_str: " << sort_str << '\n'
                << "expressions: " << expressions << '\n'
                << "column_only: " << column_only << '\n'
            );

            std::string filter_op;
            switch (cfg.filter_op()) {
                case proto::ViewConfig_FilterReducer::
                    ViewConfig_FilterReducer_OR:
                    filter_op = "or";
                    break;
                case proto::ViewConfig_FilterReducer::
                    ViewConfig_FilterReducer_AND:
                default:
                    filter_op = "and";
                    break;
            }

            LOG_DEBUG("FILTER_OP: " << filter_op);

            auto config = std::make_shared<t_view_config>(
                vocab,
                row_pivots,
                column_pivots,
                aggregates,
                columns,
                filter,
                sort_str,
                expressions,
                filter_op,
                column_only
            );
            config->init(schema);

            if (cfg.has_group_by_depth()) {
                config->set_row_pivot_depth(cfg.group_by_depth());
            }

            std::uint32_t sides;

            if (!group_by.empty() || !split_by.empty()) {
                if (!split_by.empty()) {
                    sides = 2;
                } else {
                    sides = 1;
                }
            } else {
                sides = 0;
            }

            bool is_unit_context = table->get_index().empty() && sides == 0
                && row_pivots.empty() && column_pivots.empty()
                && aggregates.empty() && columns.empty() && sort_str.empty()
                && cfg.expressions().empty();

            std::shared_ptr<ErasedView> erased_view;

            if (is_unit_context) {
                auto ctx =
                    make_context<t_ctxunit>(table, schema, config, r.view_id());
                auto view = std::make_shared<View<t_ctxunit>>(
                    table, ctx, r.view_id(), "|", config
                );
                erased_view = std::make_shared<CtxUnitView>(std::move(view));
            } else if (sides == 0) {
                auto ctx =
                    make_context<t_ctx0>(table, schema, config, r.view_id());
                auto view = std::make_shared<View<t_ctx0>>(
                    table, ctx, r.view_id(), "|", config
                );
                erased_view = std::make_shared<Ctx0View>(view);
            } else if (sides == 1) {
                auto ctx =
                    make_context<t_ctx1>(table, schema, config, r.view_id());
                auto view = std::make_shared<View<t_ctx1>>(
                    table, ctx, r.view_id(), "|", config
                );
                erased_view = std::make_shared<Ctx1View>(std::move(view));
            } else if (sides == 2) {
                auto ctx =
                    make_context<t_ctx2>(table, schema, config, r.view_id());
                auto view = std::make_shared<View<t_ctx2>>(
                    table, ctx, r.view_id(), "|", config
                );
                erased_view = std::make_shared<Ctx2View>(std::move(view));
            } else {
                PSP_COMPLAIN_AND_ABORT("Invalid number of sides");
            }

            m_resources.host_view(
                client_id, r.view_id(), req.entity_id(), erased_view
            );

            proto::Response resp;
            auto* make_view = resp.mutable_table_make_view_resp();
            make_view->set_view_id(r.view_id());
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableOnDeleteReq: {
            Subscription sub_info;
            sub_info.id = req.msg_id();
            sub_info.client_id = client_id;
            m_resources.create_table_on_delete_sub(req.entity_id(), sub_info);
            break;
        }
        case proto::Request::kTableRemoveDeleteReq: {
            auto sub_id = req.table_remove_delete_req().id();
            m_resources.remove_table_on_delete_sub(
                req.entity_id(), sub_id, client_id
            );
            proto::Response resp;
            resp.mutable_table_remove_delete_resp();
            push_resp(std::move(resp));
            break;
        }

        case proto::Request::kViewOnDeleteReq: {
            Subscription sub_info;
            sub_info.id = req.msg_id();
            sub_info.client_id = client_id;
            m_resources.create_view_on_delete_sub(req.entity_id(), sub_info);
            break;
        }
        case proto::Request::kViewRemoveDeleteReq: {
            auto sub_id = req.view_remove_delete_req().id();
            m_resources.remove_view_on_delete_sub(
                req.entity_id(), sub_id, client_id
            );
            proto::Response resp;
            resp.mutable_view_remove_delete_resp();
            push_resp(std::move(resp));
            break;
        }

        case proto::Request::kViewSchemaReq: {
            auto view = m_resources.get_view(req.entity_id());
            proto::Response resp;
            auto* view_schema =
                resp.mutable_view_schema_resp()->mutable_schema();
            auto schema = view->schema();
            for (const auto& [k, v] : schema) {
                (*view_schema)[k] = dtype_to_column_type(str_to_dtype(v));
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewDimensionsReq: {
            auto view = m_resources.get_view(req.entity_id());
            auto table = m_resources.get_table_for_view(req.entity_id());

            proto::Response resp;
            auto* view_dims = resp.mutable_view_dimensions_resp();
            auto ncols = view->num_columns();
            auto config = view->get_view_config();
            auto num_hidden = calculate_num_hidden(*view, *config);

            auto num_view_columns = 0;
            const auto real_size = config->get_columns().size();
            if (ncols > 0 && real_size > 0) {
                num_view_columns = ncols
                    - (ncols / (config->get_columns().size() + num_hidden))
                        * num_hidden;
            }

            view_dims->set_num_view_columns(num_view_columns);
            view_dims->set_num_view_rows(view->num_rows());
            view_dims->set_num_table_columns(table->get_schema().size());
            view_dims->set_num_table_rows(table->size());

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewGetConfigReq: {
            auto view = m_resources.get_view(req.entity_id());
            auto view_config = view->get_view_config();

            proto::Response resp;
            auto* view_config_proto =
                resp.mutable_view_get_config_resp()->mutable_config();

            for (const auto& col : view_config->get_columns()) {
                view_config_proto->mutable_columns()
                    ->mutable_columns()
                    ->add_columns(col);
            }

            if (!view_config->get_row_pivots().empty()) {
                for (const auto& aggspec : view_config->get_aggspecs()) {
                    auto* proto_exprs = view_config_proto->mutable_aggregates();
                    const auto agg = aggspec;
                    if (aggspec.agg() == AGGTYPE_WEIGHTED_MEAN
                        || aggspec.agg() == AGGTYPE_MAX_BY
                        || aggspec.agg() == AGGTYPE_MIN_BY) {

                        proto::ViewConfig_AggList agglist;
                        agglist.add_aggregations(agg.agg_str());
                        agglist.add_aggregations(agg.get_input_depnames()[1]);
                        (*proto_exprs)[aggspec.name()] = agglist;
                    } else {
                        proto::ViewConfig_AggList agglist;
                        agglist.add_aggregations(agg.agg_str());
                        (*proto_exprs)[aggspec.name()] = agglist;
                    }
                }
            }

            for (const auto& agg : view_config->get_row_pivots()) {
                if (agg == "psp_pkey" || agg == "psp_okey") {
                    continue;
                }
                view_config_proto->add_group_by(agg);
            }

            for (const auto& agg : view_config->get_column_pivots()) {
                view_config_proto->add_split_by(agg);
            }

            // TODO: Sort, Expressions, and Aggregations

            for (const auto& sort : view_config->get_sortspec()) {
                auto* proto_sort = view_config_proto->mutable_sort();
                auto* s = proto_sort->Add();
                s->set_column(sort.m_colname);
                s->set_op(sort_op_to_proto(sort.m_sort_type));
            }

            for (const auto& filter : view_config->get_fterm()) {
                auto* proto_filter = view_config_proto->mutable_filter();
                auto* f = proto_filter->Add();
                f->set_column(filter.m_colname);
                f->set_op(filter_op_to_str(filter.m_op));
                auto vals = std::vector<t_tscalar>(filter.m_bag.size());
                if (filter.m_op != FILTER_OP_NOT_IN
                    && filter.m_op != FILTER_OP_IN) {
                    vals.push_back(filter.m_threshold);
                } else {
                    for (const auto& scalar : filter.m_bag) {
                        vals.push_back(scalar);
                    }
                }

                for (const auto& scalar : vals) {
                    auto* s = f->mutable_value()->Add();
                    switch (scalar.get_dtype()) {
                        case DTYPE_BOOL:
                            s->set_bool_(scalar.get<bool>());
                            break;
                        case DTYPE_FLOAT32:
                            s->set_float_(scalar.get<float>());
                            break;
                        case DTYPE_FLOAT64:
                            s->set_float_(scalar.get<double>());
                            break;
                        case DTYPE_INT8:
                            s->set_float_((double)scalar.get<std::int8_t>());
                            break;
                        case DTYPE_INT16:
                            s->set_float_((double)scalar.get<std::int16_t>());
                            break;
                        case DTYPE_INT32:
                            s->set_float_((double)scalar.get<std::int32_t>());
                            break;
                        case DTYPE_INT64:
                            s->set_float_((double)scalar.get<std::int64_t>());
                            break;
                        case DTYPE_UINT8:
                            s->set_float_((double)scalar.get<std::uint8_t>());
                            break;
                        case DTYPE_UINT16:
                            s->set_float_((double)scalar.get<std::uint16_t>());
                            break;
                        case DTYPE_UINT32:
                            s->set_float_((double)scalar.get<std::uint32_t>());
                            break;
                        case DTYPE_UINT64:
                            s->set_float_((double)scalar.get<std::uint64_t>());
                            break;
                        case DTYPE_STR:
                            s->set_string(scalar.get<const char*>());
                            break;
                        case DTYPE_DATE: {
                            auto tm = scalar.get<t_date>();
                            std::stringstream ss;
                            ss << std::setfill('0') << std::setw(4) << tm.year()
                               << "-" << std::setfill('0')
                               << std::setw(2)
                               // Increment month by 1, as date::month is [1-12]
                               // but t_date::month() is [0-11]
                               << tm.month() + 1 << "-" << std::setfill('0')
                               << std::setw(2) << tm.day();
                            s->set_string(ss.str());
                            break;
                        }
                        case DTYPE_TIME:
                            s->set_float_(
                                (double)scalar.get<t_time>().raw_value()
                            );
                            break;
                        case DTYPE_NONE:
                            s->set_null(
                                ::google::protobuf::NullValue::NULL_VALUE
                            );
                            break;
                        default:
                            PSP_COMPLAIN_AND_ABORT(
                                "Invalid scalar type: " + scalar.to_string()
                            );
                    }
                }
            }

            switch (view_config->get_filter_op()) {
                case FILTER_OP_OR:
                    view_config_proto->set_filter_op(
                        proto::ViewConfig_FilterReducer::
                            ViewConfig_FilterReducer_OR
                    );
                    break;
                case FILTER_OP_AND:
                default:
                    view_config_proto->set_filter_op(
                        proto::ViewConfig_FilterReducer::
                            ViewConfig_FilterReducer_AND
                    );
                    break;
            }

            if (view_config->get_row_pivot_depth() != -1) {
                view_config_proto->set_group_by_depth(
                    view_config->get_row_pivot_depth()
                );
            }

            for (const auto& expr : view_config->get_expressions()) {
                auto* proto_exprs = view_config_proto->mutable_expressions();
                (*proto_exprs)[expr->get_expression_alias()] =
                    expr->get_expression_string();
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewColumnPathsReq: {
            auto view = m_resources.get_view(req.entity_id());

            const auto& r = req.view_column_paths_req();

            proto::Response resp;
            auto* view_col_paths =
                resp.mutable_view_column_paths_resp()->mutable_paths();

            // // TODO this is a better representation of column_paths but
            // // it is not legacy compat.
            // for (const auto& col_paths : view->column_paths()) {
            //     auto* col_path = view_col_paths->Add();
            //     auto* paths = col_path->mutable_path();
            //     for (const auto& path : col_paths) {
            //         *paths->Add() = path;
            //     }
            // }

            std::string col;
            const auto column_paths = r.has_start_col() ? r.has_end_col()
                    ? view->column_paths_range(r.start_col(), r.end_col())
                    : view->column_paths_range(
                        r.start_col(), view->num_columns()
                    )
                : r.has_end_col() ? view->column_paths_range(0, r.end_col())
                                  : view->column_paths();

            for (auto& col_paths : column_paths) {
                col = "";
                if (!col_paths.empty()) {
                    auto it = col_paths.begin();
                    col += *it;

                    for (++it; it != col_paths.end(); ++it) {
                        col += "|";
                        col += *it;
                    }
                }

                *view_col_paths->Add() = col;
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewToNdjsonStringReq: {
            auto view = m_resources.get_view(req.entity_id());
            const auto& r = req.view_to_rows_string_req();
            auto config = view->get_view_config();
            std::string nidx{view_sides_to_string(*view)};
            auto num_hidden = calculate_num_hidden(*view, *config);

            auto dims = parse_format_options(
                r.viewport(),
                view->num_columns(),
                view->num_rows(),
                view->sides(),
                config->is_column_only(),
                num_hidden
            );

            auto json_str = view->to_ndjson(
                dims.start_row,
                dims.end_row,
                dims.start_col,
                dims.end_col,
                num_hidden,
                r.formatted(),
                r.index(),
                r.id(),
                r.leaves_only(),
                view->sides(),
                view->sides() > 0 && !config->is_column_only(),
                nidx,
                config->get_columns().size(),
                view->get_view_config()->get_row_pivots().size()
            );

            proto::Response resp;
            auto* view_cols_str = resp.mutable_view_to_ndjson_string_resp();
            view_cols_str->set_ndjson_string(json_str);
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewToRowsStringReq: {
            auto view = m_resources.get_view(req.entity_id());
            const auto& r = req.view_to_rows_string_req();
            auto config = view->get_view_config();
            std::string nidx{view_sides_to_string(*view)};
            auto num_hidden = calculate_num_hidden(*view, *config);

            auto dims = parse_format_options(
                r.viewport(),
                view->num_columns(),
                view->num_rows(),
                view->sides(),
                config->is_column_only(),
                num_hidden
            );

            auto json_str = view->to_rows(
                dims.start_row,
                dims.end_row,
                dims.start_col,
                dims.end_col,
                num_hidden,
                r.formatted(),
                r.index(),
                r.id(),
                r.leaves_only(),
                view->sides(),
                view->sides() > 0 && !config->is_column_only(),
                nidx,
                config->get_columns().size(),
                view->get_view_config()->get_row_pivots().size()
            );

            proto::Response resp;
            auto* view_cols_str = resp.mutable_view_to_rows_string_resp();
            view_cols_str->set_json_string(json_str);
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewToColumnsStringReq: {
            auto view = m_resources.get_view(req.entity_id());
            const auto& r = req.view_to_columns_string_req();
            auto config = view->get_view_config();
            std::string nidx{view_sides_to_string(*view)};
            auto num_hidden = calculate_num_hidden(*view, *config);
            LOG_DEBUG("num_hidden: " << num_hidden);

            auto dims = parse_format_options(
                r.viewport(),
                view->num_columns(),
                view->num_rows(),
                view->sides(),
                config->is_column_only(),
                num_hidden
            );

            auto json_str = view->to_columns(
                dims.start_row,
                dims.end_row,
                dims.start_col,
                dims.end_col,
                num_hidden,
                r.formatted(),
                r.index(),
                r.id(),
                r.leaves_only(),
                view->sides(),
                view->sides() > 0 && !config->is_column_only(),
                nidx,
                config->get_columns().size(),
                config->get_row_pivots().size()
            );

            proto::Response resp;
            auto* view_cols_str = resp.mutable_view_to_columns_string_resp();
            view_cols_str->set_json_string(json_str);
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableDeleteReq: {
            const auto is_immediate = req.table_delete_req().is_immediate();
            if (is_immediate
                || m_resources.get_table_view_count(req.entity_id()) == 0) {
                m_resources.delete_table(req.entity_id());

                for (const auto& sub :
                     m_resources.get_table_on_delete_sub(req.entity_id())) {
                    proto::Response resp;
                    resp.mutable_table_on_delete_resp();
                    resp.set_msg_id(sub.id);
                    resp.set_entity_id(req.entity_id());
                    ProtoServerResp<proto::Response> resp2;
                    resp2.data = std::move(resp);
                    resp2.client_id = sub.client_id;
                    proto_resp.emplace_back(std::move(resp2));
                }

                proto::Response resp;
                resp.mutable_table_delete_resp();
                push_resp(std::move(resp));

                // notify `on_hosted_tables_update` listeners
                auto subscriptions =
                    m_resources.get_on_hosted_tables_update_sub();
                for (auto& subscription : subscriptions) {
                    Response out;
                    out.set_msg_id(subscription.id);
                    ProtoServerResp<ProtoServer::Response> resp2;
                    resp2.data = std::move(out);
                    resp2.client_id = subscription.client_id;
                    proto_resp.emplace_back(std::move(resp2));
                }
            } else {
                m_resources.mark_table_deleted(
                    req.entity_id(), client_id, req.msg_id()
                );
            }

            break;
        }
        case proto::Request::kViewDeleteReq: {
            for (const auto& sub :
                 m_resources.get_view_on_delete_sub(req.entity_id())) {
                proto::Response resp;
                resp.mutable_view_on_delete_resp();
                resp.set_msg_id(sub.id);
                resp.set_entity_id(req.entity_id());
                ProtoServerResp<proto::Response> resp2;
                resp2.data = std::move(resp);
                resp2.client_id = sub.client_id;
                proto_resp.emplace_back(std::move(resp2));
            }

            const auto table_id =
                m_resources.get_table_id_for_view(req.entity_id());
            m_resources.delete_view(client_id, req.entity_id());
            proto::Response resp;
            resp.mutable_view_delete_resp();
            push_resp(std::move(resp));
            if (m_resources.is_table_deleted(table_id)) {
                Subscription deleted_id =
                    m_resources.get_table_deleted_client(table_id);

                m_resources.delete_table(table_id);
                for (const auto& sub :
                     m_resources.get_table_on_delete_sub(table_id)) {
                    proto::Response resp;
                    resp.mutable_table_on_delete_resp();
                    resp.set_msg_id(sub.id);
                    resp.set_entity_id(table_id);
                    ProtoServerResp<proto::Response> resp2;
                    resp2.data = std::move(resp);
                    resp2.client_id = sub.client_id;
                    proto_resp.emplace_back(std::move(resp2));
                }

                // Notify the client which initially called delete
                proto::Response resp;
                resp.mutable_table_delete_resp();
                resp.set_msg_id(deleted_id.id);
                resp.set_entity_id(table_id);
                ProtoServerResp<proto::Response> resp2;
                resp2.data = std::move(resp);
                resp2.client_id = deleted_id.client_id;
                proto_resp.emplace_back(std::move(resp2));

                // notify `on_hosted_tables_update` listeners
                auto subscriptions =
                    m_resources.get_on_hosted_tables_update_sub();
                for (auto& subscription : subscriptions) {
                    Response out;
                    out.set_msg_id(subscription.id);
                    ProtoServerResp<ProtoServer::Response> resp2;
                    resp2.data = std::move(out);
                    resp2.client_id = subscription.client_id;
                    proto_resp.emplace_back(std::move(resp2));
                }
            }
            // const auto table_id =
            break;
        }
        case proto::Request::kViewRemoveOnUpdateReq: {
            auto sub_id = req.view_remove_on_update_req().id();
            m_resources.remove_view_on_update_sub(
                req.entity_id(), sub_id, client_id
            );

            proto::Response resp;
            resp.mutable_view_remove_on_update_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewExpressionSchemaReq: {
            auto view = m_resources.get_view(req.entity_id());

            proto::Response resp;
            auto* view_expr_schema =
                resp.mutable_view_expression_schema_resp()->mutable_schema();
            auto schema = view->expression_schema();
            for (const auto& [k, v] : schema) {
                (*view_expr_schema)[k] = dtype_to_column_type(str_to_dtype(v));
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewToArrowReq: {
            auto view = m_resources.get_view(req.entity_id());
            const auto& r = req.view_to_arrow_req();
            auto config = view->get_view_config();
            auto num_hidden = calculate_num_hidden(*view, *config);
            auto dims = parse_format_options(
                r.viewport(),
                view->num_columns(),
                view->num_rows(),
                view->sides(),
                view->get_view_config()->is_column_only(),
                num_hidden
            );

            proto::Response resp;
            auto* arrow = resp.mutable_view_to_arrow_resp()->mutable_arrow();
            *arrow = *view->to_arrow(
                dims.start_row,
                dims.end_row,
                dims.start_col,
                dims.end_col,
                true,
                r.compression() == "lz4"
            );

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewToCsvReq: {
            LOG_DEBUG("Handling ViewToCsvReq");
            auto view = m_resources.get_view(req.entity_id());
            const auto& r = req.view_to_csv_req();
            auto config = view->get_view_config();
            auto num_hidden = calculate_num_hidden(*view, *config);
            auto dims = parse_format_options(
                r.viewport(),
                view->num_columns(),
                view->num_rows(),
                view->sides(),
                view->get_view_config()->is_column_only(),
                num_hidden
            );

            proto::Response resp;
            auto* csv = resp.mutable_view_to_csv_resp()->mutable_csv();
            *csv = *view->to_csv(
                dims.start_row, dims.end_row, dims.start_col, dims.end_col
            );

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewOnUpdateReq: {
            Subscription sub_info;
            sub_info.id = req.msg_id();
            sub_info.client_id = client_id;
            m_resources.create_view_on_update_sub(req.entity_id(), sub_info);
            if (req.view_on_update_req().has_mode()
                && req.view_on_update_req().mode()
                    == proto::ViewOnUpdateReq_Mode::ViewOnUpdateReq_Mode_ROW) {
                auto view = m_resources.get_view(req.entity_id());
                view->set_deltas_enabled(true);
            }
            break;
        }
        case proto::Request::kViewGetMinMaxReq: {
            const auto& col = req.view_get_min_max_req().column_name();
            auto view = m_resources.get_view(req.entity_id());
            const auto min_max = view->get_min_max(col);
            proto::Response resp;
            auto* pair = resp.mutable_view_get_min_max_resp();
            rapidjson::StringBuffer s;
            rapidjson::Writer<rapidjson::StringBuffer> writer(s);
            write_scalar(min_max.first, true, writer);
            pair->set_min(s.GetString());
            rapidjson::StringBuffer s2;
            rapidjson::Writer<rapidjson::StringBuffer> writer2(s2);
            write_scalar(min_max.second, true, writer2);
            pair->set_max(s2.GetString());
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewCollapseReq: {
            const auto& r = req.view_collapse_req();
            auto view = m_resources.get_view(req.entity_id());
            auto num_changed = view->collapse(r.row_index());
            proto::Response resp;
            auto* collapse_resp = resp.mutable_view_collapse_resp();
            collapse_resp->set_num_changed(num_changed);
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewExpandReq: {
            const auto& r = req.view_expand_req();
            auto view = m_resources.get_view(req.entity_id());
            auto num_changed = view->expand(r.row_index());
            proto::Response resp;
            auto* expand_resp = resp.mutable_view_expand_resp();
            expand_resp->set_num_changed(num_changed);
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewSetDepthReq: {
            const auto& r = req.view_set_depth_req();
            auto view = m_resources.get_view(req.entity_id());
            view->set_depth(r.depth());
            proto::Response resp;
            resp.mutable_view_set_depth_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kServerSystemInfoReq: {
            proto::Response resp;
            auto* sys_info = resp.mutable_server_system_info_resp();
#if defined(PSP_ENABLE_WASM) && !defined(PSP_ENABLE_PYTHON)
            const auto heap_size = psp_heap_size();
            sys_info->set_heap_size(heap_size);
            const auto res = mallinfo();
            sys_info->set_used_size(res.uordblks);
#elif defined(__linux__) && !defined(PSP_ENABLE_WASM)
            auto res = mallinfo();
            sys_info->set_heap_size(res.usmblks);
            sys_info->set_used_size(res.uordblks);
#elif defined(__APPLE__) && !defined(PSP_ENABLE_WASM)
            rusage out;
            getrusage(RUSAGE_SELF, &out);
            sys_info->set_heap_size(out.ru_maxrss);
#endif
            sys_info->set_cpu_time(m_cpu_time);
            sys_info->set_cpu_time_epoch(
                std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::high_resolution_clock::now()
                    - m_cpu_time_start.load()
                )
                    .count()
            );

            m_cpu_time_start = std::chrono::high_resolution_clock::now();
            m_cpu_time = 0;
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::CLIENT_REQ_NOT_SET: {
            PSP_COMPLAIN_AND_ABORT("Client request unknown variant")
            break;
        }
    }

    return proto_resp;
}

std::vector<ProtoServerResp<ProtoServer::Response>>
ProtoServer::_poll() {
    std::vector<ProtoServerResp<Response>> resp_envs;
    auto tables = m_resources.get_dirty_tables();
    for (auto& [table, table_id] : tables) {
        _process_table_unchecked(table, table_id, resp_envs);
    }

    m_resources.mark_all_tables_clean();
    return resp_envs;
}

void
ProtoServer::_process_table_unchecked(
    std::shared_ptr<Table>& table,
    const ServerResources::t_id& table_id,
    std::vector<ProtoServerResp<ProtoServer::Response>>& outs
) {
    table->get_pool()->_process([this, table_id, &outs](auto port_id) {
        // record changes per port.
        auto view_ids = m_resources.get_view_ids(table_id);
        for (const auto& view_id : view_ids) {
            if (!m_resources.has_view(view_id)) {
                continue;
            }

            auto view = m_resources.get_view(view_id);
            auto subscriptions = m_resources.get_view_on_update_sub(view_id);
            for (auto& subscription : subscriptions) {
                Response out;
                out.set_msg_id(subscription.id);
                out.set_entity_id(view_id);
                auto* r = out.mutable_view_on_update_resp();
                r->set_port_id(port_id);
                if (view->get_deltas_enabled()) {
                    *r->mutable_delta() = *view->get_row_delta_as_arrow();
                }

                ProtoServerResp<proto::Response> resp2;
                resp2.data = std::move(out);
                resp2.client_id = subscription.client_id;
                outs.emplace_back(std::move(resp2));
            }
        }
    });
}

void
ProtoServer::_process_table(
    std::shared_ptr<Table>& table,
    const ServerResources::t_id& table_id,
    std::vector<ProtoServerResp<ProtoServer::Response>>& outs
) {
    if (!m_resources.is_table_dirty(table_id)) {
        return;
    }

    _process_table_unchecked(table, table_id, outs);
    m_resources.mark_table_clean(table_id);
}

} // namespace perspective::server

const char*
perspective::sort_op_str_from_proto(proto::SortOp sort_op) {
    switch (sort_op) {
        case proto::SORT_NONE:
            return "none";
        case proto::SORT_ASC:
            return "asc";
        case proto::SORT_DESC:
            return "desc";
        case proto::SORT_ASC_ABS:
            return "asc abs";
        case proto::SORT_DESC_ABS:
            return "desc abs";
        case proto::SORT_COL_ASC:
            return "col asc";
        case proto::SORT_COL_DESC:
            return "col desc";
        case proto::SORT_COL_ASC_ABS:
            return "col asc abs";
        case proto::SORT_COL_DESC_ABS:
            return "col desc abs";
        default:
            PSP_COMPLAIN_AND_ABORT("Invalid sort op");
            return "none";
    }
}

perspective::proto::SortOp
perspective::sort_op_to_proto(perspective::t_sorttype sort_op) {
    switch (sort_op) {
        case perspective::t_sorttype::SORTTYPE_ASCENDING:
            return perspective::proto::SORT_ASC;
        case perspective::t_sorttype::SORTTYPE_DESCENDING:
            return perspective::proto::SORT_DESC;
        case perspective::t_sorttype::SORTTYPE_NONE:
            return perspective::proto::SORT_NONE;
        case perspective::t_sorttype::SORTTYPE_ASCENDING_ABS:
            return perspective::proto::SORT_ASC_ABS;
        case perspective::t_sorttype::SORTTYPE_DESCENDING_ABS:
            return perspective::proto::SORT_DESC_ABS;
    }
    PSP_COMPLAIN_AND_ABORT("Invalid sort op");
}
