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
#include "perspective/raw_types.h"
#include "perspective/regex.h"
#include "perspective/scalar.h"
#include "perspective/sparse_tree.h"
#include "perspective/table.h"
#include "perspective/time.h"
#include "perspective/view.h"
#include "perspective/view_config.h"
#include "re2/re2.h"
#include <cstdint>
#include <limits>
#include <memory>
#include <perspective/server.h>
#include <re2/stringpiece.h>
#include <string>
#include <tsl/hopscotch_map.h>
#include <tsl/ordered_map.h>
#include <vector>
#include <ctime>

namespace perspective {
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
    pool->register_context(
        gnode->get_id(),
        name,
        ONE_SIDED_CONTEXT,
        reinterpret_cast<std::uintptr_t>(ctx1.get())
    );

    if (row_pivot_depth > -1) {
        ctx1->set_depth(row_pivot_depth - 1);
    } else {
        ctx1->set_depth(row_pivots.size());
    }

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
    pool->register_context(
        gnode->get_id(),
        name,
        TWO_SIDED_CONTEXT,
        reinterpret_cast<std::uintptr_t>(ctx2.get())
    );

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

    if (!sortspec.empty()) {
        ctx2->sort_by(sortspec);
    }

    if (!col_sortspec.empty()) {
        ctx2->column_sort_by(col_sortspec);
    }

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

// parsed_expression_string = parsed_expression_string.replace(
//     /\"(.*?[^\\])\"/g,
//     (_, cname) => {
//         // If the column name contains escaped double quotes, replace
//         // them and assume that they escape one double quote. If there
//         // are multiple double quotes being escaped, i.e. \""...well?
//         cname = cname.replace(/\\"/g, '"');

//         if (column_name_map[cname] === undefined) {
//             let column_id = `COLUMN${running_cidx}`;
//             column_name_map[cname] = column_id;
//             column_id_map[column_id] = cname;
//         }

//         running_cidx++;
//         return column_name_map[cname];
//     }
// );

// template <typename Lambda>
// static std::string
// replace_with_re2(
//     const std::string& input, const re2::RE2& pattern, Lambda replacer) {
//     std::string output;
//     re2::StringPiece input_piece(input);

//     std::string match;
//     int64_t start = 0;
//     while (RE2::FindAndConsume(&input_piece, pattern, &match)) {
//         int64_t end = input_piece.data() - input.data();
//         output += input.substr(start, end - start - match.size());
//         output += replacer(match);
//         start = end;
//     }
//     output += input.substr(start);

//     return output;
// }

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

    output.append(previous_end, input.end().base() - previous_end);

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
        "(?:bucket|match|match_all|search|indexof|replace|replace_all)\\("
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
    m_tables.emplace(id, std::move(table));
}

void
ServerResources::host_view(
    const t_id& id, const t_id& table_id, std::shared_ptr<ErasedView> view
) {
    m_view_to_table.emplace(id, table_id);
    m_table_to_view.emplace(table_id, id);
    m_views.emplace(id, std::move(view));
}

std::shared_ptr<Table>
ServerResources::get_table(const t_id& id) {
    return m_tables.at(id);
}

std::shared_ptr<Table>
ServerResources::get_table_for_view(const t_id& view_id) {
    return m_tables.at(m_view_to_table.at(view_id));
}

ServerResources::t_id
ServerResources::get_table_id_for_view(const t_id& view_id) {
    return m_view_to_table.at(view_id);
}

std::vector<ServerResources::t_id>
ServerResources::get_view_ids(const t_id& table_id) {
    std::vector<t_id> out;
    auto range = m_table_to_view.equal_range(table_id);
    for (auto it = range.first; it != range.second; ++it) {
        out.push_back(it->second);
    }
    return out;
}

std::shared_ptr<ErasedView>
ServerResources::get_view(const t_id& id) {
    return m_views[id];
}

void
ServerResources::delete_view(const t_id& id) {
    m_views.erase(id);
    m_view_to_table.erase(id);
    drop_view_on_update_sub(id);
}

void
ServerResources::delete_table(const t_id& id) {
    m_tables.erase(id);
}

void
ServerResources::mark_table_dirty(const t_id& id) {
    m_dirty_tables.insert(id);
}

void
ServerResources::mark_table_clean(const t_id& id) {
    m_dirty_tables.erase(id);
}

void
ServerResources::mark_all_tables_clean() {
    m_dirty_tables.clear();
}

void
ServerResources::create_table_on_delete_sub(
    const t_id& table_id, Subscription sub_id
) {
    if (!m_table_on_delete_subs.contains(table_id)) {
        m_table_on_delete_subs[table_id] = {sub_id};
    } else {
        m_table_on_delete_subs[table_id].push_back(sub_id);
    }
}

std::vector<Subscription>&
ServerResources::get_table_on_delete_sub(const t_id& table_id) {
    if (!m_table_on_delete_subs.contains(table_id)) {
        m_table_on_delete_subs[table_id] = {};
    }

    return m_table_on_delete_subs.at(table_id);
}

void
ServerResources::drop_table_on_delete_sub(
    const t_id& table_id, const std::uint32_t sub_id
) {
    if (!m_table_on_delete_subs.contains(table_id)) {
        m_table_on_delete_subs[table_id] = {};
    }

    auto& subs = m_table_on_delete_subs.at(table_id);
    for (auto sub = subs.begin(); sub != subs.end();) {
        if (sub->id == sub_id) {
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
    if (!m_view_on_delete_subs.contains(view_id)) {
        m_view_on_delete_subs[view_id] = {sub};
    } else {
        m_view_on_delete_subs[view_id].push_back(sub);
    }
}

std::vector<Subscription>&
ServerResources::get_view_on_delete_sub(const t_id& view_id) {
    if (!m_view_on_delete_subs.contains(view_id)) {
        m_view_on_delete_subs[view_id] = {};
    }

    return m_view_on_delete_subs.at(view_id);
}

void
ServerResources::drop_view_on_delete_sub(
    const t_id& view_id, const std::uint32_t sub_id
) {
    if (!m_view_on_delete_subs.contains(view_id)) {
        m_view_on_delete_subs[view_id] = {};
    }

    auto& subs = m_view_on_delete_subs.at(view_id);
    for (auto sub = subs.begin(); sub != subs.end();) {
        if (sub->id == sub_id) {
            subs.erase(sub);
            break;
        }

        ++sub;
    }
}

void
ServerResources::create_view_on_update_sub(
    const t_id& view_id, Subscription sub
) {
    if (!m_view_on_update_subs.contains(view_id)) {
        m_view_on_update_subs[view_id] = {sub};
    } else {
        m_view_on_update_subs[view_id].push_back(sub);
    }
}

std::vector<Subscription>&
ServerResources::get_view_on_update_sub(const t_id& view_id) {
    if (!m_view_on_update_subs.contains(view_id)) {
        m_view_on_update_subs[view_id] = {};
    }

    return m_view_on_update_subs.at(view_id);
}

void
ServerResources::drop_view_on_update_sub(const t_id& view_id) {
    m_view_on_update_subs.erase(view_id);
}

std::vector<std::pair<std::shared_ptr<Table>, const ServerResources::t_id&>>
ServerResources::get_dirty_tables() {
    std::vector<std::pair<std::shared_ptr<Table>, const t_id&>> out;
    for (const auto& id : m_dirty_tables) {
        out.emplace_back(m_tables[id], id);
    }
    return out;
}

bool
ServerResources::is_table_dirty(const t_id& id) {
    return m_dirty_tables.contains(id);
}

ProtoServerResp<std::string>
ProtoServer::handle_message(const std::string_view& data) {
    proto::RequestEnvelope req_env;
    req_env.ParseFromString(data);
    ProtoServerResp<std::string> serialized_responses;
    std::vector<proto::Response> responses;
    try {
        auto resp_msg = _handle_message(req_env.payload(), req_env);
        for (auto& resp : resp_msg.responses) {
            serialized_responses.responses.emplace_back(resp.SerializeAsString()
            );
        }
        serialized_responses.should_poll = resp_msg.should_poll;
    } catch (const PerspectiveException& e) {
        proto::Response resp;
        auto* err = resp.mutable_server_error()->mutable_message();
        *err = std::string(e.what());
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

    proto::ResponseEnvelope resp_env;
    resp_env.set_msg_id(req_env.msg_id());
    resp_env.set_entity_id(req_env.entity_id());
    resp_env.set_entity_type(req_env.entity_type());

    serialized_responses.responses.reserve(responses.size());
    for (auto& resp : responses) {
        *resp_env.mutable_payload() = resp;
        serialized_responses.responses.emplace_back(resp_env.SerializeAsString()
        );
    }

    return serialized_responses;
}

std::vector<std::string>
ProtoServer::poll() {
    std::vector<std::string> out;
    for (auto& resp : _poll()) {
        out.emplace_back(resp.SerializeAsString());
    }
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
        case ReqCase::kTableColumnsReq:
        case ReqCase::kTableSchemaReq:
        case ReqCase::kTableMakePortReq:
        case ReqCase::kTableValidateExprReq:
        case ReqCase::kMakeTableReq:
        case ReqCase::kViewDimensionsReq:
        case ReqCase::kViewNumRowsReq:
        case ReqCase::kViewToColumnsStringReq:
        case ReqCase::kViewToCsvReq:
        case ReqCase::kViewToRowsStringReq:
        case ReqCase::kViewToArrowReq:
        case ReqCase::kViewSchemaReq:
        case ReqCase::kViewGetMinMaxReq:
        case ReqCase::kTableRemoveReq:
        case ReqCase::kTableMakeViewReq:
        case ReqCase::kViewOnUpdateReq:
            return true;
        case ReqCase::kTableOnDeleteReq:
        case ReqCase::kViewOnDeleteReq:
        case ReqCase::kViewRemoveDeleteReq:
        case ReqCase::kTableUpdateReq:
        case ReqCase::kTableRemoveDeleteReq:
        case ReqCase::kTableReplaceReq:
        case ReqCase::kTableDeleteReq:
        case ReqCase::kTableClearReq:
        case ReqCase::kViewGetConfigReq:
        case ReqCase::kViewColumnPathsReq:
        case ReqCase::kViewDeleteReq:
        case ReqCase::kViewExpressionSchemaReq:
            return false;
        case proto::Request::CLIENT_REQ_NOT_SET:
            throw std::runtime_error("Unhandled request type");
    }
    throw std::runtime_error("Unhandled request type");
}

void
ProtoServer::handle_process_table(
    const Req& req,
    const RequestEnvelope& env,
    ProtoServerResp<ProtoServer::ResponseEnvelope>& proto_resp
) {
    if (needs_poll(req.client_req_case())) {
        proto_resp.should_poll = true;
        switch (env.entity_type()) {
            case proto::EntityType::TABLE: {
                if (m_resources.is_table_dirty(env.entity_id())) {
                    auto table = m_resources.get_table(env.entity_id());
                    const auto& table_id = env.entity_id();
                    _process_table(table, table_id, proto_resp.responses);
                    m_resources.mark_table_clean(env.entity_id());
                    proto_resp.should_poll = false;
                }
                break;
            }
            case proto::EntityType::VIEW: {
                auto table_id =
                    m_resources.get_table_id_for_view(env.entity_id());
                if (m_resources.is_table_dirty(table_id)) {
                    auto table = m_resources.get_table(table_id);
                    _process_table(table, table_id, proto_resp.responses);
                    m_resources.mark_table_clean(table_id);
                    proto_resp.should_poll = false;
                }
                break;
            }
            default:
                PSP_COMPLAIN_AND_ABORT("Entity type not set");
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
    auto num_hidden = 0;
    switch (view.sides()) {
        case 0:
            break;
        case 1: {
            const auto& cols = config.get_columns();
            for (const auto& s : config.get_sortspec()) {
                if (std::find(cols.begin(), cols.end(), s.m_colname)
                    == cols.end()) {
                    num_hidden++;
                }
            }
        } break;
        case 2: {
            const auto& cols = config.get_columns();
            for (const auto& s : config.get_sortspec()) {
                if (std::find(cols.begin(), cols.end(), s.m_colname)
                    == cols.end()) {
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

ProtoServerResp<ProtoServer::ResponseEnvelope>
ProtoServer::_handle_message(const Req& req, const RequestEnvelope& env) {
    static bool is_init_expr = false;
    if (!is_init_expr) {
        t_computed_expression_parser::init();
        is_init_expr = true;
    }

    ProtoServerResp<ProtoServer::ResponseEnvelope> proto_resp;
    proto::ResponseEnvelope resp_env;
    auto push_resp = [&](Resp&& resp) {
        resp_env.set_msg_id(env.msg_id());
        resp_env.set_entity_id(env.entity_id());
        resp_env.set_entity_type(env.entity_type());
        *resp_env.mutable_payload() = std::move(resp);
        proto_resp.responses.emplace_back(std::move(resp_env));
    };

    handle_process_table(req, env, proto_resp);
    switch (req.client_req_case()) {
        case proto::Request::kMakeTableReq: {
            const auto& r = req.make_table_req();
            std::string index;
            std::uint32_t limit = std::numeric_limits<int>::max();
            std::shared_ptr<Table> table;
            switch (r.options().make_table_type_case()) {
                case proto::MakeTableOptions::kMakeLimitTable: {
                    limit = r.options().make_limit_table().limit();
                    break;
                }
                case proto::MakeTableOptions::kMakeIndexTable: {
                    index = r.options().make_index_table().index();
                    break;
                }
                case proto::MakeTableOptions::MAKE_TABLE_TYPE_NOT_SET:
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

                    table = Table::from_arrow(index, *arrow, limit);
                    break;
                }
                case proto::MakeTableData::kFromArrow: {
                    table =
                        Table::from_arrow(index, r.data().from_arrow(), limit);
                    break;
                }
                case proto::MakeTableData::kFromCsv: {
                    table = Table::from_csv(index, r.data().from_csv(), limit);
                    break;
                }
                case proto::MakeTableData::kFromCols: {
                    table =
                        Table::from_cols(index, r.data().from_cols(), limit);
                    break;
                }
                case proto::MakeTableData::kFromRows: {
                    table =
                        Table::from_rows(index, r.data().from_rows(), limit);
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

            m_resources.host_table(env.entity_id(), table);
            proto::Response resp;
            resp.mutable_make_table_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableSizeReq: {
            auto table = m_resources.get_table(env.entity_id());
            proto::Response resp;
            auto* tbl_size = resp.mutable_table_size_resp();
            tbl_size->set_size(table->size());
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableColumnsReq: {
            auto table = m_resources.get_table(env.entity_id());
            proto::Response resp;
            auto* tbl_cols = resp.mutable_table_columns_resp();
            for (const auto& col : table->get_column_names()) {
                tbl_cols->add_columns(col);
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableSchemaReq: {
            auto table = m_resources.get_table(env.entity_id());

            proto::Response resp;
            auto* output_schema =
                resp.mutable_table_schema_resp()->mutable_schema();
            auto table_schema = table->get_schema();
            auto columns = table_schema.columns();
            auto types = table_schema.types();
            for (std::size_t i = 0; i < table_schema.size(); ++i) {
                (*output_schema)[columns[i]] = dtype_to_column_type(types[i]);
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableMakePortReq: {
            auto table = m_resources.get_table(env.entity_id());
            proto::Response resp;
            auto* make_port = resp.mutable_table_make_port_resp();
            make_port->set_port_id(table->make_port());

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableValidateExprReq: {
            auto table = m_resources.get_table(env.entity_id());
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

            std::vector<std::pair<std::string, proto::ExprValidationError>>
                errors;
            for (const auto& [col_name, err] : res.get_expression_errors()) {
                proto::ExprValidationError proto_err;
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
        case proto::Request::kTableClearReq: {
            auto table = m_resources.get_table(env.entity_id());
            table->clear();
            proto::Response resp;
            resp.mutable_table_clear_resp();

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableReplaceReq: {
            auto table = m_resources.get_table(env.entity_id());
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
            proto_resp.should_poll = true;
            m_resources.mark_table_dirty(env.entity_id());
            proto::Response resp;
            resp.mutable_table_replace_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableRemoveReq: {
            const auto& r = req.table_remove_req();
            auto table = m_resources.get_table(env.entity_id());
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

            proto_resp.should_poll = true;
            m_resources.mark_table_dirty(env.entity_id());
            proto::Response resp;
            resp.mutable_table_remove_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableUpdateReq: {
            const auto& r = req.table_update_req();
            auto table = m_resources.get_table(env.entity_id());
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
                case proto::MakeTableData::kFromSchema:
                case proto::MakeTableData::DATA_NOT_SET:
                default: {
                    PSP_COMPLAIN_AND_ABORT("MakeTableReq malformed");
                    break;
                }
            }
            proto_resp.should_poll = true;
            m_resources.mark_table_dirty(env.entity_id());
            // m_resources.host_table(env.entity_id(), table);
            proto::Response resp;
            resp.mutable_table_update_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableMakeViewReq: {
            auto table = m_resources.get_table(env.entity_id());
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

            std::vector<
                std::tuple<std::string, std::string, std::vector<t_tscalar>>>
                filter;
            for (const auto& f : cfg.filter()) {
                std::vector<t_tscalar> args;
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
                            a.set(arg.float_());
                            args.push_back(a);
                            break;
                        }
                        case proto::Scalar::kInt: {
                            a.set(arg.int_());
                            args.push_back(a);
                            break;
                        }

                        case proto::Scalar::kString: {
                            a.set(arg.string().c_str());
                            args.push_back(a);
                            break;
                        }

                        case proto::Scalar::kDate: {
                            auto date_ts = arg.date();
                            // convert ts to date
                            auto tt = std::chrono::system_clock::to_time_t(
                                std::chrono::system_clock::time_point(
                                    std::chrono::seconds(date_ts)
                                )
                            );

                            auto* date = std::localtime(&tt);

                            t_date d{
                                static_cast<std::int16_t>(date->tm_year + 1900),
                                static_cast<std::int8_t>(date->tm_mon),
                                static_cast<std::int8_t>(date->tm_mday)
                            };
                            a.set(d);
                            args.push_back(a);
                            break;
                        }
                        case proto::Scalar::kDatetime: {
                            auto datetime_ts = arg.datetime();
                            // convert ts to date
                            auto tt = t_time(datetime_ts);

                            a.set(tt);
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

                filter.emplace_back(
                    f.column(),
                    filter_op_to_str(perspective::filter_op_from_proto(f.op())),
                    args
                );
            }

            std::vector<std::shared_ptr<t_computed_expression>> expressions;
            auto exprs = parse_expression_strings(cfg.expressions());
            auto schema = std::make_shared<t_schema>(
                table->get_gnode()->get_output_schema()
            );

            for (const auto& expr : exprs) {
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
                    t_computed_expression_parser::precompute(
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

            auto config = std::make_shared<t_view_config>(
                row_pivots,
                column_pivots,
                aggregates,
                columns,
                filter,
                sort_str,
                expressions,
                "and",
                column_only
            );
            config->init(schema);

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

            m_resources.host_view(r.view_id(), env.entity_id(), erased_view);
            proto::Response resp;
            auto* make_view = resp.mutable_table_make_view_resp();
            make_view->set_view_id(r.view_id());
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kTableOnDeleteReq: {
            Subscription sub_info{.id = env.msg_id()};
            m_resources.create_table_on_delete_sub(env.entity_id(), sub_info);
            break;
        }
        case proto::Request::kTableRemoveDeleteReq: {
            auto sub_id = req.table_remove_delete_req().id();
            m_resources.drop_table_on_delete_sub(env.entity_id(), sub_id);
            proto::Response resp;
            resp.mutable_table_remove_delete_resp();
            push_resp(std::move(resp));
            break;
        }

        case proto::Request::kViewOnDeleteReq: {
            Subscription sub_info{.id = env.msg_id()};
            m_resources.create_view_on_delete_sub(env.entity_id(), sub_info);
            break;
        }
        case proto::Request::kViewRemoveDeleteReq: {
            auto sub_id = req.view_remove_delete_req().id();
            m_resources.drop_view_on_delete_sub(env.entity_id(), sub_id);
            proto::Response resp;
            resp.mutable_view_remove_delete_resp();
            push_resp(std::move(resp));
            break;
        }

        case proto::Request::kViewSchemaReq: {
            auto view = m_resources.get_view(env.entity_id());
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
            auto view = m_resources.get_view(env.entity_id());
            auto table = m_resources.get_table_for_view(env.entity_id());

            proto::Response resp;
            auto* view_dims = resp.mutable_view_dimensions_resp();
            view_dims->set_num_view_columns(view->num_columns());
            view_dims->set_num_view_rows(view->num_rows());
            view_dims->set_num_table_columns(table->get_schema().size());
            view_dims->set_num_table_rows(table->size());

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewGetConfigReq: {
            auto view = m_resources.get_view(env.entity_id());
            auto view_config = view->get_view_config();

            proto::Response resp;
            auto* view_config_proto =
                resp.mutable_view_get_config_resp()->mutable_config();

            for (const auto& col : view_config->get_columns()) {
                view_config_proto->mutable_columns()
                    ->mutable_columns()
                    ->add_columns(col);
            }

            for (const auto& agg : view_config->get_row_pivots()) {
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
                sort.m_sort_type;
            }

            for (const auto& filter : view_config->get_fterm()) {
                auto* proto_filter = view_config_proto->mutable_filter();
                auto* f = proto_filter->Add();
                f->set_column(filter.m_colname);
                f->set_op(filter_op_to_proto(filter.m_op));
                auto vals = std::vector<t_tscalar>(filter.m_bag.size() + 1);
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
                        case DTYPE_FLOAT64:
                            s->set_float_(scalar.get<double>());
                            break;
                        case DTYPE_INT64:
                            s->set_int_(static_cast<std::int32_t>(
                                scalar.get<std::int64_t>()
                            ));
                            break;
                        case DTYPE_STR:
                            s->set_string(scalar.get<const char*>());
                            break;
                        case DTYPE_DATE: {
                            auto tm = scalar.get<t_date>().get_tm();
                            s->set_date(std::mktime(&tm));
                            break;
                        }
                        case DTYPE_TIME:
                            s->set_datetime(scalar.get<t_time>().raw_value());
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

            for (const auto& expr : view_config->get_expressions()) {
                auto* proto_exprs = view_config_proto->mutable_expressions();
                (*proto_exprs)[expr->get_expression_alias()] =
                    expr->get_expression_string();
            }

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewNumRowsReq: {
            auto view = m_resources.get_view(env.entity_id());

            proto::Response resp;
            auto* view_num_rows = resp.mutable_view_num_rows_resp();
            view_num_rows->set_num_rows(view->num_rows());

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewColumnPathsReq: {
            auto view = m_resources.get_view(env.entity_id());

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
            for (auto& col_paths : view->column_paths()) {
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
        case proto::Request::kViewToRowsStringReq: {
            auto view = m_resources.get_view(env.entity_id());
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
            auto view = m_resources.get_view(env.entity_id());
            const auto& r = req.view_to_columns_string_req();
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
            m_resources.delete_table(env.entity_id());
            proto::ResponseEnvelope resp_env;
            for (const auto& sub :
                 m_resources.get_table_on_delete_sub(env.entity_id())) {
                proto::Response resp;
                resp.mutable_table_on_delete_resp();
                resp_env.set_msg_id(sub.id);
                resp_env.set_entity_id(env.entity_id());
                resp_env.set_entity_type(env.entity_type());
                *resp_env.mutable_payload() = std::move(resp);
                proto_resp.responses.emplace_back(std::move(resp_env));
            }

            proto::Response resp;
            resp.mutable_table_delete_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewDeleteReq: {
            m_resources.delete_view(env.entity_id());
            m_resources.delete_table(env.entity_id());
            proto::ResponseEnvelope resp_env;
            for (const auto& sub :
                 m_resources.get_view_on_delete_sub(env.entity_id())) {
                proto::Response resp;
                resp.mutable_view_on_delete_resp();
                resp_env.set_msg_id(sub.id);
                resp_env.set_entity_id(env.entity_id());
                resp_env.set_entity_type(env.entity_type());
                *resp_env.mutable_payload() = std::move(resp);
                proto_resp.responses.emplace_back(std::move(resp_env));
            }

            proto::Response resp;
            resp.mutable_view_delete_resp();
            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewExpressionSchemaReq: {
            auto view = m_resources.get_view(env.entity_id());

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
            auto view = m_resources.get_view(env.entity_id());
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
                dims.start_row, dims.end_row, dims.start_col, dims.end_col
            );

            push_resp(std::move(resp));
            break;
        }
        case proto::Request::kViewToCsvReq: {
            LOG_DEBUG("Handling ViewToCsvReq");
            auto view = m_resources.get_view(env.entity_id());
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
            Subscription sub_info{.id = env.msg_id()};
            m_resources.create_view_on_update_sub(env.entity_id(), sub_info);
            if (req.view_on_update_req().has_mode()
                && req.view_on_update_req().mode()
                    == proto::ViewOnUpdateReq_Mode::ViewOnUpdateReq_Mode_ROW) {
                auto view = m_resources.get_view(env.entity_id());
                view->set_deltas_enabled(true);
            }
            break;
        }
        case proto::Request::kViewGetMinMaxReq: {
            const auto& col = req.view_get_min_max_req().column_name();
            auto view = m_resources.get_view(env.entity_id());
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
        case proto::Request::CLIENT_REQ_NOT_SET: {
            PSP_COMPLAIN_AND_ABORT("Client request unknown variant")
            break;
        }
    }

    return proto_resp;
}

std::vector<ProtoServer::ResponseEnvelope>
ProtoServer::_poll() {
    std::vector<ResponseEnvelope> resp_envs;
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
    std::vector<ProtoServer::ResponseEnvelope>& outs
) {
    table->get_pool()->_process([this, table_id, &outs](auto port_id) {
        // record changes per port.
        auto view_ids = m_resources.get_view_ids(table_id);
        for (const auto& view_id : view_ids) {
            auto view = m_resources.get_view(view_id);
            auto subscriptions = m_resources.get_view_on_update_sub(view_id);
            for (auto& subscription : subscriptions) {
                proto::ResponseEnvelope resp_env;
                resp_env.set_msg_id(subscription.id);
                resp_env.set_entity_id(view_id);
                resp_env.set_entity_type(proto::VIEW);

                Resp out;
                auto* r = out.mutable_view_on_update_resp();
                r->set_port_id(port_id);
                *r->mutable_arrow() = *view->get_row_delta_as_arrow();
                *resp_env.mutable_payload() = out;
                outs.emplace_back(std::move(resp_env));
            }
        }
    });
}

void
ProtoServer::_process_table(
    std::shared_ptr<Table>& table,
    const ServerResources::t_id& table_id,
    std::vector<ProtoServer::ResponseEnvelope>& outs
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

perspective::proto::FilterOp
perspective::filter_op_to_proto(t_filter_op t_filter_op) {
    switch (t_filter_op) {
        case FILTER_OP_LT:
            return proto::FilterOp::FILTER_LT;
        case FILTER_OP_LTEQ:
            return proto::FilterOp::FILTER_LTEQ;
        case FILTER_OP_GT:
            return proto::FilterOp::FILTER_GT;
        case FILTER_OP_GTEQ:
            return proto::FilterOp::FILTER_GTEQ;
        case FILTER_OP_EQ:
            return proto::FilterOp::FILTER_EQ;
        case FILTER_OP_NE:
            return proto::FilterOp::FILTER_NE;
        case FILTER_OP_BEGINS_WITH:
            return proto::FilterOp::FILTER_BEGINS_WITH;
        case FILTER_OP_ENDS_WITH:
            return proto::FilterOp::FILTER_ENDS_WITH;
        case FILTER_OP_CONTAINS:
            return proto::FilterOp::FILTER_CONTAINS;
        case FILTER_OP_OR:
            return proto::FilterOp::FILTER_OR;
        case FILTER_OP_IN:
            return proto::FilterOp::FILTER_IN;
        case FILTER_OP_NOT_IN:
            return proto::FilterOp::FILTER_NOT_IN;
        case FILTER_OP_AND:
            return proto::FilterOp::FILTER_AND;
        case FILTER_OP_IS_NULL:
            return proto::FilterOp::FILTER_IS_NULL;
        case FILTER_OP_IS_NOT_NULL:
            return proto::FilterOp::FILTER_IS_NOT_NULL;
        default:
            PSP_COMPLAIN_AND_ABORT("Invalid filter op");
            return proto::FilterOp::FILTER_IS_NULL;
    }
}

perspective::t_filter_op
perspective::filter_op_from_proto(proto::FilterOp filter_op) {
    switch (filter_op) {
        case proto::FILTER_UNKNOWN:
            PSP_COMPLAIN_AND_ABORT("Invalid filter op");
        case proto::FILTER_LT:
            return FILTER_OP_LT;
        case proto::FILTER_LTEQ:
            return FILTER_OP_LTEQ;
        case proto::FILTER_GT:
            return FILTER_OP_GT;
        case proto::FILTER_GTEQ:
            return FILTER_OP_GTEQ;
        case proto::FILTER_EQ:
            return FILTER_OP_EQ;
        case proto::FILTER_NE:
            return FILTER_OP_NE;
        case proto::FILTER_BEGINS_WITH:
            return FILTER_OP_BEGINS_WITH;
        case proto::FILTER_ENDS_WITH:
            return FILTER_OP_ENDS_WITH;
        case proto::FILTER_IN:
            return FILTER_OP_IN;
        case proto::FILTER_CONTAINS:
            return FILTER_OP_CONTAINS;
        case proto::FILTER_NOT_IN:
            return FILTER_OP_NOT_IN;
        case proto::FILTER_AND:
            return FILTER_OP_AND;
        case proto::FILTER_OR:
            return FILTER_OP_OR;
        case proto::FILTER_IS_NULL:
            return FILTER_OP_IS_NULL;
        case proto::FILTER_IS_NOT_NULL:
            return FILTER_OP_IS_NOT_NULL;
        default:
            PSP_COMPLAIN_AND_ABORT("Invalid filter op");
            return FILTER_OP_IS_NULL;
    }
}
