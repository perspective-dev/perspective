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

#include "perspective/join_engine.h"
#include "perspective/column.h"
#include "perspective/data_table.h"
#include "perspective/gnode.h"
#include "perspective/scalar.h"
#include <algorithm>
#include <sstream>
#include <tsl/hopscotch_map.h>
#include <tsl/hopscotch_set.h>

namespace perspective::server {

namespace {

// Typed column copy for fixed-size types.
template <typename T>
void
copy_column_typed(
    t_column* dst,
    const t_column* src,
    const std::vector<std::pair<t_uindex, t_uindex>>& matched_rows,
    t_uindex num_matched,
    bool use_first
) {
    for (t_uindex i = 0; i < num_matched; ++i) {
        auto src_idx = use_first ? matched_rows[i].first : matched_rows[i].second;
        if (src_idx == static_cast<t_uindex>(-1)) {
            dst->clear(i);
        } else {
            const T* val = src->get_nth<T>(src_idx);
            const t_status* st =
                src->is_status_enabled() ? src->get_nth_status(src_idx)
                                         : nullptr;
            dst->set_nth<T>(i, *val, st ? *st : STATUS_VALID);
        }
    }
}

void
copy_column_str(
    t_column* dst,
    const t_column* src,
    const std::vector<std::pair<t_uindex, t_uindex>>& matched_rows,
    t_uindex num_matched,
    bool use_first
) {
    for (t_uindex i = 0; i < num_matched; ++i) {
        auto src_idx = use_first ? matched_rows[i].first : matched_rows[i].second;
        if (src_idx == static_cast<t_uindex>(-1)) {
            dst->clear(i);
        } else {
            dst->set_scalar(i, src->get_scalar(src_idx));
        }
    }
}

void
copy_column_dispatch(
    t_column* dst,
    const t_column* src,
    const std::vector<std::pair<t_uindex, t_uindex>>& matched_rows,
    t_uindex num_matched,
    bool use_first
) {
    switch (dst->get_dtype()) {
        case DTYPE_INT64:
            copy_column_typed<std::int64_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_INT32:
            copy_column_typed<std::int32_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_INT16:
            copy_column_typed<std::int16_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_INT8:
            copy_column_typed<std::int8_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_UINT64:
            copy_column_typed<std::uint64_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_UINT32:
            copy_column_typed<std::uint32_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_UINT16:
            copy_column_typed<std::uint16_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_UINT8:
            copy_column_typed<std::uint8_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_FLOAT64:
            copy_column_typed<double>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_FLOAT32:
            copy_column_typed<float>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_BOOL:
            copy_column_typed<bool>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_TIME:
            copy_column_typed<std::int64_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_DATE:
            copy_column_typed<std::int32_t>(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        case DTYPE_STR:
            copy_column_str(
                dst, src, matched_rows, num_matched, use_first
            );
            break;
        default:
            // Fallback for any other types (OBJECT, F64PAIR, etc.)
            for (t_uindex i = 0; i < num_matched; ++i) {
                auto src_idx = use_first ? matched_rows[i].first
                                         : matched_rows[i].second;
                if (src_idx == static_cast<t_uindex>(-1)) {
                    dst->clear(i);
                } else {
                    dst->set_scalar(i, src->get_scalar(src_idx));
                }
            }
            break;
    }
}

// Copy the join key column for OUTER join rows where the left side has no
// match but the right side does. Uses the right key column as the source
// for just those rows; all other rows are already filled from the left.
void
copy_join_key_fallback(
    t_column* dst,
    const t_column* right_key_col,
    const std::vector<std::pair<t_uindex, t_uindex>>& matched_rows,
    t_uindex num_matched
) {
    for (t_uindex i = 0; i < num_matched; ++i) {
        if (matched_rows[i].first == static_cast<t_uindex>(-1)
            && matched_rows[i].second != static_cast<t_uindex>(-1)) {
            dst->set_scalar(
                i, right_key_col->get_scalar(matched_rows[i].second)
            );
        }
    }
}

} // anonymous namespace

void
JoinEngine::register_join(
    const t_id& join_table_id,
    const t_id& left_table_id,
    const t_id& right_table_id,
    const std::string& on_column,
    const std::string& right_on_column,
    proto::JoinType join_type
) {
    auto effective_right_on = right_on_column.empty() ? on_column : right_on_column;
    JoinDef def{left_table_id, right_table_id, on_column, effective_right_on, join_type};
    m_join_defs.emplace(join_table_id, def);
    m_table_to_join_tables.emplace(left_table_id, join_table_id);
    m_table_to_join_tables.emplace(right_table_id, join_table_id);
}

void
JoinEngine::unregister_join(const t_id& join_table_id) {
    auto it = m_join_defs.find(join_table_id);
    if (it == m_join_defs.end()) {
        return;
    }

    auto& def = it->second;

    for (const auto& source_id : {def.left_table_id, def.right_table_id}) {
        auto range = m_table_to_join_tables.equal_range(source_id);
        for (auto jt = range.first; jt != range.second;) {
            if (jt->second == join_table_id) {
                jt = m_table_to_join_tables.erase(jt);
            } else {
                ++jt;
            }
        }
    }

    m_join_defs.erase(it);
    m_caches.erase(join_table_id);
}

bool
JoinEngine::is_join_table(const t_id& id) const {
    return m_join_defs.contains(id);
}

std::vector<JoinEngine::t_id>
JoinEngine::get_dependent_join_tables(const t_id& source_table_id) const {
    std::vector<t_id> result;
    auto range = m_table_to_join_tables.equal_range(source_table_id);
    for (auto it = range.first; it != range.second; ++it) {
        result.push_back(it->second);
    }

    return result;
}

const JoinDef&
JoinEngine::get_join_def(const t_id& join_table_id) const {
    return m_join_defs.at(join_table_id);
}

MakeJoinResult
JoinEngine::make_join_table(
    const std::string& on_column,
    const std::string& right_on_column,
    proto::JoinType join_type,
    const std::shared_ptr<Table>& left_table,
    const std::shared_ptr<Table>& right_table
) {
    auto effective_right_on = right_on_column.empty() ? on_column : right_on_column;
    auto left_schema = left_table->get_schema();
    auto right_schema = right_table->get_schema();
    if (!left_schema.has_column(on_column)) {
        std::stringstream ss;
        ss << "Column \"" << on_column << "\" not found in left table";
        return {nullptr, ss.str()};
    }

    if (!right_schema.has_column(effective_right_on)) {
        std::stringstream ss;
        ss << "Column \"" << effective_right_on << "\" not found in right table";
        return {nullptr, ss.str()};
    }

    if (left_schema.get_dtype(on_column) != right_schema.get_dtype(effective_right_on)) {
        return {nullptr, "Join column type mismatch"};
    }

    for (const auto& rcol : right_schema.columns()) {
        if (rcol == effective_right_on) {
            continue;
        }

        if (left_schema.has_column(rcol)) {
            std::stringstream ss;
            ss << "Column \"" << rcol << "\" exists in both tables";
            return {nullptr, ss.str()};
        }
    }

    std::vector<std::string> merged_columns;
    std::vector<t_dtype> merged_types;
    for (t_uindex i = 0; i < left_schema.columns().size(); ++i) {
        merged_columns.push_back(left_schema.columns()[i]);
        merged_types.push_back(left_schema.types()[i]);
    }

    for (t_uindex i = 0; i < right_schema.columns().size(); ++i) {
        if (right_schema.columns()[i] == effective_right_on) {
            continue;
        }

        merged_columns.push_back(right_schema.columns()[i]);
        merged_types.push_back(right_schema.types()[i]);
    }

    t_schema merged_schema(merged_columns, merged_types);
    auto join_table = Table::from_schema({}, merged_schema);
    return {join_table, ""};
}

void
JoinEngine::build_right_index(
    JoinCache& cache,
    const std::shared_ptr<Table>& right_table,
    const std::string& on_column
) {
    auto right_data = right_table->get_gnode()->get_table_sptr();
    const auto& right_pkey_map = right_table->get_gnode()->get_pkey_map();
    auto right_key_col = right_data->get_column(on_column);
    cache.right_entries.assign(right_pkey_map.begin(), right_pkey_map.end());
    std::sort(
        cache.right_entries.begin(),
        cache.right_entries.end(),
        [](const auto& a, const auto& b) { return a.first < b.first; }
    );

    cache.right_index.clear();
    cache.right_index.reserve(right_pkey_map.size());
    for (const auto& [pkey, row_idx] : cache.right_entries) {
        auto join_key = right_key_col->get_scalar(row_idx);
        if (!join_key.is_none()) {
            cache.right_index[join_key].push_back(row_idx);
        }
    }

    cache.valid = true;
}

void
JoinEngine::recompute(
    const t_id& join_table_id,
    const std::shared_ptr<Table>& left_table,
    const std::shared_ptr<Table>& right_table,
    const std::shared_ptr<Table>& join_table,
    bool left_changed,
    bool right_changed
) {
    const auto& def = m_join_defs.at(join_table_id);
    auto& cache = m_caches[join_table_id];
    auto left_data = left_table->get_gnode()->get_table_sptr();
    auto right_data = right_table->get_gnode()->get_table_sptr();
    const auto& left_pkey_map = left_table->get_gnode()->get_pkey_map();
    auto left_key_col = left_data->get_column(def.on_column);
    auto right_key_col = right_data->get_column(def.right_on_column);

    // Rebuild right-side index only when the right table has changed,
    // or on the first recompute when no cache exists yet.
    if (right_changed || !cache.valid) {
        build_right_index(cache, right_table, def.right_on_column);
    }

    const auto& right_join_key_to_rows = cache.right_index;
    const auto& right_entries = cache.right_entries;

    // Sort left pkey entries so the join result preserves left-table
    // insertion order.
    std::vector<std::pair<t_tscalar, t_uindex>> left_entries(
        left_pkey_map.begin(), left_pkey_map.end()
    );

    std::sort(
        left_entries.begin(),
        left_entries.end(),
        [](const auto& a, const auto& b) { return a.first < b.first; }
    );

    const t_uindex NO_MATCH = static_cast<t_uindex>(-1);
    std::vector<std::pair<t_uindex, t_uindex>> matched_rows;
    matched_rows.reserve(left_entries.size());
    tsl::hopscotch_set<t_uindex> matched_right_rows;
    for (const auto& [pkey, row_idx] : left_entries) {
        auto join_key = left_key_col->get_scalar(row_idx);
        if (join_key.is_none()) {
            if (def.join_type == proto::LEFT
                || def.join_type == proto::OUTER) {
                matched_rows.emplace_back(row_idx, NO_MATCH);
            }

            continue;
        }

        auto it = right_join_key_to_rows.find(join_key);
        if (it != right_join_key_to_rows.end()) {
            for (auto right_row_idx : it->second) {
                matched_rows.emplace_back(row_idx, right_row_idx);
                if (def.join_type == proto::OUTER) {
                    matched_right_rows.insert(right_row_idx);
                }
            }
        } else if (def.join_type == proto::LEFT
                   || def.join_type == proto::OUTER) {
            matched_rows.emplace_back(row_idx, NO_MATCH);
        }
    }

    if (def.join_type == proto::OUTER) {
        for (const auto& [pkey, row_idx] : right_entries) {
            if (matched_right_rows.find(row_idx)
                == matched_right_rows.end()) {
                matched_rows.emplace_back(NO_MATCH, row_idx);
            }
        }
    }

    t_uindex num_matched = matched_rows.size();
    auto join_schema = join_table->get_schema();
    t_data_table joined_data(join_schema);
    joined_data.init();
    joined_data.extend(num_matched);
    auto left_schema = left_table->get_schema();
    auto right_schema = right_table->get_schema();
    for (const auto& col_name : join_schema.columns()) {
        auto dst_col = joined_data.get_column(col_name);
        bool is_join_col = (col_name == def.on_column);
        if (left_schema.has_column(col_name)) {
            auto left_src_col = left_data->get_column(col_name);
            copy_column_dispatch(
                dst_col.get(), left_src_col.get(), matched_rows, num_matched, true
            );

            if (is_join_col) {
                copy_join_key_fallback(
                    dst_col.get(), right_key_col.get(), matched_rows, num_matched
                );
            }
        } else if (right_schema.has_column(col_name)) {
            auto src_col = right_data->get_column(col_name);
            copy_column_dispatch(
                dst_col.get(), src_col.get(), matched_rows, num_matched, false
            );
        }
    }

    joined_data.set_size(num_matched);
    auto* pkey_col = joined_data.add_column("psp_pkey", DTYPE_INT32, true);
    auto* okey_col = joined_data.add_column("psp_okey", DTYPE_INT32, true);
    for (t_uindex i = 0; i < num_matched; ++i) {
        pkey_col->set_nth<std::int32_t>(i, static_cast<std::int32_t>(i), STATUS_VALID);
        okey_col->set_nth<std::int32_t>(i, static_cast<std::int32_t>(i), STATUS_VALID);
    }

    join_table->clear();
    join_table->init(joined_data, num_matched, t_op::OP_INSERT, 0);
}

} // namespace perspective::server
