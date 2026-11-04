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

#include <perspective/arrow_normalize.h>
#include "perspective/base.h"
#include <arrow/array/array_nested.h>
#include <arrow/array/concatenate.h>
#include <arrow/builder.h>
#include <arrow/compute/api_vector.h>
#include <arrow/util/bit_util.h>
#include <arrow/util/bitmap_ops.h>
#include <algorithm>
#include <cstdint>
#include <deque>
#include <limits>
#include <memory>
#include <set>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace perspective::apachearrow {

const char* const FLATTEN_SEPARATOR = ".";

namespace {

    bool
    is_list_id(arrow::Type::type id) {
        return id == arrow::Type::LIST || id == arrow::Type::LARGE_LIST;
    }

    bool
    type_expands(const arrow::DataType& type, t_flatten_mode mode) {
        if (is_list_id(type.id())) {
            return true;
        }

        if (type.id() == arrow::Type::STRUCT && !stringifies(mode.structs)) {
            for (const auto& child : type.fields()) {
                if (type_expands(*child->type(), mode)) {
                    return true;
                }
            }
        }

        if (type.id() == arrow::Type::MAP && !stringifies(mode.maps)) {
            return type_expands(
                *static_cast<const arrow::MapType&>(type).item_type(), mode
            );
        }

        return false;
    }

    [[noreturn]] void
    abort_with(const std::string& msg) {
        PSP_COMPLAIN_AND_ABORT(msg);
        std::abort();
    }

    template <typename T>
    T
    unwrap(arrow::Result<T> result, const char* what) {
        if (!result.ok()) {
            std::stringstream ss;
            ss << what << ": " << result.status().ToString() << "\n";
            abort_with(ss.str());
        }

        return result.MoveValueUnsafe();
    }

    /**
     * Project child `c` out of a `StructArray`, combining the parent's validity
     * into the child's.
     */
    std::shared_ptr<arrow::Array>
    struct_child(const std::shared_ptr<arrow::StructArray>& parent, int c) {
        auto child = parent->field(c);
        if (parent->null_count() == 0) {
            return child;
        }

        const auto length = child->length();
        const auto c_offset = child->offset();
        const auto p_offset = parent->offset();
        const auto* p_bitmap = parent->null_bitmap_data();
        auto data = child->data()->Copy();
        if (child->null_count() == 0 && c_offset == p_offset) {
            data->buffers[0] = parent->data()->buffers[0];
            data->null_count = parent->null_count();
            return arrow::MakeArray(data);
        }

        auto buffer = unwrap(
            arrow::AllocateEmptyBitmap(
                c_offset + length, arrow::default_memory_pool()
            ),
            "Could not allocate struct validity bitmap"
        );

        if (child->null_count() == 0) {
            arrow::internal::CopyBitmap(
                p_bitmap, p_offset, length, buffer->mutable_data(), c_offset
            );
        } else {
            arrow::internal::BitmapAnd(
                p_bitmap,
                p_offset,
                child->null_bitmap_data(),
                c_offset,
                length,
                c_offset,
                buffer->mutable_data()
            );
        }

        data->buffers[0] = std::move(buffer);
        data->null_count = arrow::kUnknownNullCount;
        return arrow::MakeArray(data);
    }

    /**
     * Hoist every top-level struct column's children into dotted columns.
     * Returns whether anything changed.
     */
    bool
    flatten_structs(
        std::vector<std::shared_ptr<arrow::Field>>& fields,
        std::vector<std::shared_ptr<arrow::ChunkedArray>>& columns,
        std::vector<std::vector<std::int64_t>>& gathers,
        std::vector<bool>& per_element
    ) {
        bool changed = false;
        for (const auto& field : fields) {
            if (field->type()->id() == arrow::Type::STRUCT) {
                changed = true;
                break;
            }
        }

        if (!changed) {
            return false;
        }

        std::vector<std::shared_ptr<arrow::Field>> out_fields;
        std::vector<std::shared_ptr<arrow::ChunkedArray>> out_columns;
        std::vector<std::vector<std::int64_t>> out_gathers;
        std::vector<bool> out_per_element;
        for (std::size_t i = 0; i < fields.size(); ++i) {
            if (fields[i]->type()->id() != arrow::Type::STRUCT) {
                out_fields.push_back(fields[i]);
                out_columns.push_back(columns[i]);
                out_gathers.push_back(gathers[i]);
                out_per_element.push_back(per_element[i]);
                continue;
            }

            const auto& children = fields[i]->type()->fields();
            for (int c = 0; c < static_cast<int>(children.size()); ++c) {
                std::vector<std::shared_ptr<arrow::Array>> chunks;
                chunks.reserve(columns[i]->num_chunks());
                for (const auto& chunk : columns[i]->chunks()) {
                    chunks.push_back(struct_child(
                        std::static_pointer_cast<arrow::StructArray>(chunk), c
                    ));
                }

                out_fields.push_back(arrow::field(
                    fields[i]->name() + FLATTEN_SEPARATOR + children[c]->name(),
                    children[c]->type()
                ));

                out_columns.push_back(std::make_shared<arrow::ChunkedArray>(
                    std::move(chunks), children[c]->type()
                ));

                out_gathers.push_back(gathers[i]);
                out_per_element.push_back(per_element[i]);
            }
        }

        fields = std::move(out_fields);
        columns = std::move(out_columns);
        gathers = std::move(out_gathers);
        per_element = std::move(out_per_element);
        return true;
    }

    bool
    is_string_id(arrow::Type::type id) {
        return id == arrow::Type::STRING || id == arrow::Type::LARGE_STRING;
    }

    std::string_view
    string_at(const arrow::Array& array, std::int64_t i) {
        if (array.type_id() == arrow::Type::LARGE_STRING) {
            const auto view =
                static_cast<const arrow::LargeStringArray&>(array).GetView(i);
            return {view.data(), view.size()};
        }

        const auto view =
            static_cast<const arrow::StringArray&>(array).GetView(i);
        return {view.data(), view.size()};
    }

    /**
     * The distinct keys of a map column in first-appearance order.
     */
    struct t_key_table {
        std::unordered_map<std::string_view, std::size_t> ordinals;
        std::deque<std::string> names;

        std::size_t
        ordinal(std::string_view key) {
            const auto it = ordinals.find(key);
            if (it != ordinals.end()) {
                return it->second;
            }

            names.emplace_back(key);
            const auto ord = names.size() - 1;
            ordinals.emplace(std::string_view{names.back()}, ord);
            return ord;
        }
    };

    /**
     * One chunk of a map column, addressed by global row and global entry.
     */
    struct t_map_chunk {
        std::shared_ptr<arrow::MapArray> map;
        std::shared_ptr<arrow::Array> keys;
        std::int64_t first;
        std::int64_t item_base;
        std::vector<std::int64_t> dict_ordinals;

        std::size_t
        ordinal(t_key_table& table, std::int64_t e) {
            if (keys->type_id() != arrow::Type::DICTIONARY) {
                return table.ordinal(string_at(*keys, e));
            }

            const auto& dict = static_cast<const arrow::DictionaryArray&>(*keys);
            const auto di = dict.GetValueIndex(e);
            auto& cached = dict_ordinals[di];
            if (cached < 0) {
                cached = static_cast<std::int64_t>(
                    table.ordinal(string_at(*dict.dictionary(), di))
                );
            }

            return static_cast<std::size_t>(cached);
        }
    };

    void
    check_map_key_type(
        const std::string& name, const arrow::DataType& key_type
    ) {
        auto id = key_type.id();
        if (id == arrow::Type::DICTIONARY) {
            id = static_cast<const arrow::DictionaryType&>(key_type)
                     .value_type()
                     ->id();
        }

        if (!is_string_id(id)) {
            std::stringstream ss;
            ss << "Cannot pivot map column `" << name << "` with key type `"
               << key_type.ToString() << "`; only string keys are supported\n";
            abort_with(ss.str());
        }
    }

    /**
     * Collapse to a single chunk, so a gather index needs no chunk resolution.
     */
    std::shared_ptr<arrow::ChunkedArray>
    combine_chunks(const std::shared_ptr<arrow::ChunkedArray>& column) {
        if (column->num_chunks() <= 1) {
            return column;
        }

        auto combined = unwrap(
            arrow::Concatenate(column->chunks(), arrow::default_memory_pool()),
            "Could not combine chunks of an expanded column"
        );

        return std::make_shared<arrow::ChunkedArray>(
            arrow::ArrayVector{std::move(combined)}, column->type()
        );
    }

    /**
     * Pivot every top-level map column into one column per distinct key, each
     * a gather into the map's items. Returns whether anything changed.
     */
    bool
    pivot_maps(
        std::vector<std::shared_ptr<arrow::Field>>& fields,
        std::vector<std::shared_ptr<arrow::ChunkedArray>>& columns,
        std::vector<std::vector<std::int64_t>>& gathers,
        std::vector<bool>& per_element,
        std::int64_t num_rows
    ) {
        bool has_map = false;
        for (const auto& field : fields) {
            if (field->type()->id() == arrow::Type::MAP) {
                has_map = true;
                break;
            }
        }

        if (!has_map) {
            return false;
        }

        std::vector<std::shared_ptr<arrow::Field>> out_fields;
        std::vector<std::shared_ptr<arrow::ChunkedArray>> out_columns;
        std::vector<std::vector<std::int64_t>> out_gathers;
        std::vector<bool> out_per_element;
        for (std::size_t i = 0; i < fields.size(); ++i) {
            if (fields[i]->type()->id() != arrow::Type::MAP) {
                out_fields.push_back(fields[i]);
                out_columns.push_back(columns[i]);
                out_gathers.push_back(std::move(gathers[i]));
                out_per_element.push_back(per_element[i]);
                continue;
            }

            const auto& map_type =
                static_cast<const arrow::MapType&>(*fields[i]->type());
            check_map_key_type(fields[i]->name(), *map_type.key_type());

            std::vector<t_map_chunk> chunks;
            std::vector<std::int64_t> row_base;
            arrow::ArrayVector item_slices;
            std::int64_t rows = 0;
            std::int64_t items_total = 0;
            for (const auto& chunk : columns[i]->chunks()) {
                auto map = std::static_pointer_cast<arrow::MapArray>(chunk);
                auto entries =
                    std::static_pointer_cast<arrow::StructArray>(map->values()
                    );

                const auto* offsets = map->raw_value_offsets();
                const auto len = map->length();
                const auto first = len > 0 ? offsets[0] : 0;
                const auto last = len > 0 ? offsets[len] : 0;
                t_map_chunk mc{map, entries->field(0), first, items_total, {}};
                if (mc.keys->type_id() == arrow::Type::DICTIONARY) {
                    mc.dict_ordinals.assign(
                        static_cast<const arrow::DictionaryArray&>(*mc.keys)
                            .dictionary()
                            ->length(),
                        -1
                    );
                }

                item_slices.push_back(entries->field(1)->Slice(first, last - first)
                );

                row_base.push_back(rows);
                rows += len;
                items_total += last - first;
                chunks.push_back(std::move(mc));
            }

            t_key_table keys;
            std::vector<std::vector<std::int64_t>> cells;
            const auto& parent = gathers[i];
            for (std::int64_t r = 0; r < num_rows; ++r) {
                const auto src = parent.empty() ? r : parent[r];
                if (src < 0) {
                    continue;
                }

                const auto c = static_cast<std::size_t>(
                    std::upper_bound(row_base.begin(), row_base.end(), src)
                    - row_base.begin() - 1
                );

                auto& chunk = chunks[c];
                const auto local = src - row_base[c];
                if (chunk.map->IsNull(local)) {
                    continue;
                }

                const auto* offsets = chunk.map->raw_value_offsets();
                for (auto e = offsets[local]; e < offsets[local + 1]; ++e) {
                    const auto ord = chunk.ordinal(keys, e);
                    if (ord == cells.size()) {
                        cells.emplace_back(num_rows, -1);
                    }

                    cells[ord][r] = chunk.item_base + (e - chunk.first);
                }
            }

            auto items = combine_chunks(std::make_shared<arrow::ChunkedArray>(
                std::move(item_slices), map_type.item_type()
            ));

            for (std::size_t ord = 0; ord < keys.names.size(); ++ord) {
                out_fields.push_back(arrow::field(
                    fields[i]->name() + FLATTEN_SEPARATOR + keys.names[ord],
                    map_type.item_type()
                ));

                out_columns.push_back(items);
                out_gathers.push_back(std::move(cells[ord]));
                out_per_element.push_back(per_element[i]);
            }
        }

        fields = std::move(out_fields);
        columns = std::move(out_columns);
        gathers = std::move(out_gathers);
        per_element = std::move(out_per_element);
        return true;
    }

    /**
     * The per-row geometry of one list column, flattened across chunks so that
     * rows can be addressed globally. Chunk layout is per-column in an
     * `arrow::Table` and need not agree between columns.
     */
    struct t_list_column {
        std::size_t index;
        std::vector<std::int64_t> start;
        std::vector<std::int64_t> length;
        std::shared_ptr<arrow::ChunkedArray> values;
    };

    template <typename ARRAY_T>
    void
    read_list_offsets(
        const std::shared_ptr<arrow::ChunkedArray>& column, t_list_column& out
    ) {
        std::vector<std::shared_ptr<arrow::Array>> value_slices;
        std::int64_t base = 0;
        for (const auto& chunk : column->chunks()) {
            auto list = std::static_pointer_cast<ARRAY_T>(chunk);
            const auto* offsets = list->raw_value_offsets();
            const auto len = list->length();
            const auto first = len > 0 ? offsets[0] : 0;
            const auto last = len > 0 ? offsets[len] : 0;
            for (std::int64_t i = 0; i < len; ++i) {
                if (list->IsNull(i)) {
                    out.start.push_back(0);
                    out.length.push_back(0);
                } else {
                    out.start.push_back(base + (offsets[i] - first));
                    out.length.push_back(offsets[i + 1] - offsets[i]);
                }
            }

            value_slices.push_back(list->values()->Slice(first, last - first));
            base += last - first;
        }

        out.values = std::make_shared<arrow::ChunkedArray>(
            std::move(value_slices),
            std::static_pointer_cast<arrow::BaseListType>(column->type())
                ->value_type()
        );
    }

    std::shared_ptr<arrow::Array>
    build_indices(const std::vector<std::int64_t>& indices, bool has_null) {
        arrow::Int64Builder builder;
        if (!builder.Reserve(static_cast<std::int64_t>(indices.size())).ok()) {
            abort_with("Could not reserve list expansion indices\n");
        }

        for (auto index : indices) {
            if (has_null && index < 0) {
                builder.UnsafeAppendNull();
            } else {
                builder.UnsafeAppend(index);
            }
        }

        std::shared_ptr<arrow::Array> out;
        if (!builder.Finish(&out).ok()) {
            abort_with("Could not build list expansion indices\n");
        }

        return out;
    }

    std::shared_ptr<arrow::ChunkedArray>
    take(
        const std::shared_ptr<arrow::ChunkedArray>& values,
        const std::shared_ptr<arrow::Array>& indices
    ) {
        auto result = unwrap(
            arrow::compute::Take(
                arrow::Datum(values),
                arrow::Datum(indices),
                arrow::compute::TakeOptions::NoBoundsCheck()
            ),
            "Could not expand list column"
        );

        return result.chunked_array();
    }

    /**
     * Apply every pending gather, so a subsequent expansion pass can read
     * offsets positionally again.
     */
    void
    materialize(
        std::vector<std::shared_ptr<arrow::ChunkedArray>>& columns,
        std::vector<std::vector<std::int64_t>>& gathers
    ) {
        for (std::size_t i = 0; i < columns.size(); ++i) {
            if (gathers[i].empty()) {
                continue;
            }

            bool has_null = false;
            for (auto index : gathers[i]) {
                if (index < 0) {
                    has_null = true;
                    break;
                }
            }

            columns[i] = take(columns[i], build_indices(gathers[i], has_null));
            gathers[i].clear();
        }
    }

    /**
     * Expand every top-level list column into rows. Returns whether anything
     * changed.
     */
    bool
    explode_lists(
        std::vector<std::shared_ptr<arrow::Field>>& fields,
        std::vector<std::shared_ptr<arrow::ChunkedArray>>& columns,
        std::vector<std::vector<std::int64_t>>& gathers,
        std::vector<bool>& per_element,
        std::int64_t& num_rows,
        t_list_flatten mode
    ) {
        bool has_list = false;
        for (const auto& field : fields) {
            if (is_list_id(field->type()->id())) {
                has_list = true;
                break;
            }
        }

        if (!has_list) {
            return false;
        }

        for (const auto& gather : gathers) {
            if (!gather.empty()) {
                materialize(columns, gathers);
                break;
            }
        }

        std::vector<t_list_column> lists;
        for (std::size_t i = 0; i < fields.size(); ++i) {
            const auto id = fields[i]->type()->id();
            if (!is_list_id(id)) {
                continue;
            }

            t_list_column list;
            list.index = i;
            list.start.reserve(num_rows);
            list.length.reserve(num_rows);
            if (id == arrow::Type::LIST) {
                read_list_offsets<arrow::ListArray>(columns[i], list);
            } else {
                read_list_offsets<arrow::LargeListArray>(columns[i], list);
            }

            lists.push_back(std::move(list));
        }

        std::vector<std::int64_t> parents;
        std::vector<std::vector<std::int64_t>> children(lists.size());
        std::vector<bool> has_null(lists.size(), false);
        bool identity = mode == LIST_FLATTEN_ZIP;

        for (std::int64_t row = 0; row < num_rows; ++row) {
            std::int64_t width = 1;
            if (mode == LIST_FLATTEN_ZIP) {
                std::int64_t zipped = -1;
                std::size_t witness = 0;
                for (std::size_t l = 0; l < lists.size(); ++l) {
                    const auto len = lists[l].length[row];
                    if (len == 0) {
                        identity = false;
                        continue;
                    }

                    if (zipped < 0) {
                        witness = l;
                    } else if (len != zipped) {
                        std::stringstream ss;
                        ss << "Cannot zip list columns `"
                           << fields[lists[witness].index]->name() << "` ("
                           << zipped << ") and `"
                           << fields[lists[l].index]->name() << "` (" << len
                           << ") of differing length in row " << row
                           << "; use the `cartesian` list flatten mode.\n";
                        abort_with(ss.str());
                    }

                    zipped = len;
                }

                if (zipped > 0) {
                    width = zipped;
                }
            } else {
                for (const auto& list : lists) {
                    const auto len = std::max<std::int64_t>(list.length[row], 1);
                    if (width > std::numeric_limits<std::int64_t>::max() / len) {
                        std::stringstream ss;
                        ss << "Cartesian list expansion overflows in row " << row
                           << "\n";
                        abort_with(ss.str());
                    }

                    width *= len;
                }
            }

            const auto base = static_cast<std::int64_t>(parents.size());
            parents.resize(base + width, row);
            for (std::size_t l = 0; l < lists.size(); ++l) {
                const auto len = lists[l].length[row];
                const auto start = lists[l].start[row];
                children[l].resize(base + width);
                if (len == 0) {
                    has_null[l] = true;
                    for (std::int64_t k = 0; k < width; ++k) {
                        children[l][base + k] = -1;
                    }

                    continue;
                }

                if (mode == LIST_FLATTEN_ZIP) {
                    for (std::int64_t k = 0; k < width; ++k) {
                        children[l][base + k] = start + k;
                    }
                } else {
                    std::int64_t stride = 1;
                    for (std::size_t r = l + 1; r < lists.size(); ++r) {
                        stride *= std::max<std::int64_t>(lists[r].length[row], 1);
                    }

                    for (std::int64_t k = 0; k < width; ++k) {
                        children[l][base + k] = start + ((k / stride) % len);
                    }
                }
            }
        }

        const auto expanded = static_cast<std::int64_t>(parents.size());
        if (expanded > std::numeric_limits<std::uint32_t>::max()) {
            std::stringstream ss;
            ss << "List expansion produced " << expanded
               << " rows, which exceeds the maximum supported size\n";
            abort_with(ss.str());
        }

        const bool row_aligned = expanded == num_rows;
        const bool marks_per_element =
            mode != LIST_FLATTEN_CARTESIAN || lists.size() == 1;

        std::vector<std::shared_ptr<arrow::Field>> out_fields;
        std::vector<std::shared_ptr<arrow::ChunkedArray>> out_columns;
        std::vector<std::vector<std::int64_t>> out_gathers;
        std::vector<bool> out_per_element;
        std::size_t l = 0;
        for (std::size_t i = 0; i < fields.size(); ++i) {
            if (l < lists.size() && lists[l].index == i) {
                out_fields.push_back(
                    arrow::field(fields[i]->name(), lists[l].values->type())
                );

                if (identity) {
                    out_columns.push_back(lists[l].values);
                    out_gathers.emplace_back();
                } else {
                    out_columns.push_back(combine_chunks(lists[l].values));
                    out_gathers.push_back(std::move(children[l]));
                }

                out_per_element.push_back(marks_per_element);
                l += 1;
                continue;
            }

            out_fields.push_back(fields[i]);
            if (row_aligned) {
                out_columns.push_back(columns[i]);
                out_gathers.emplace_back();
            } else {
                out_columns.push_back(combine_chunks(columns[i]));
                out_gathers.push_back(parents);
            }

            out_per_element.push_back(false);
        }

        fields = std::move(out_fields);
        columns = std::move(out_columns);
        gathers = std::move(out_gathers);
        per_element = std::move(out_per_element);
        num_rows = expanded;
        return true;
    }

} // namespace

bool
normalize_table_is_noop(const arrow::Table& input, t_flatten_mode mode) {
    for (const auto& field : input.schema()->fields()) {
        const auto id = field->type()->id();
        if (!stringifies(mode.structs) && id == arrow::Type::STRUCT) {
            return false;
        }

        if (!stringifies(mode.maps) && id == arrow::Type::MAP) {
            return false;
        }

        if (!stringifies(mode.list) && is_list_id(id)) {
            return false;
        }
    }

    return true;
}

bool
normalize_table_expands(const arrow::Table& input, t_flatten_mode mode) {
    if (stringifies(mode.list)) {
        return false;
    }

    for (const auto& field : input.schema()->fields()) {
        if (type_expands(*field->type(), mode)) {
            return true;
        }
    }

    return false;
}

t_normalized_table
normalize_table(std::shared_ptr<arrow::Table> input, t_flatten_mode mode) {
    t_normalized_table out;
    out.fields = input->schema()->fields();
    out.columns = input->columns();
    out.gathers.resize(out.fields.size());
    out.per_element.assign(out.fields.size(), false);
    out.num_rows = input->num_rows();
    while (true) {
        bool changed = false;
        if (!stringifies(mode.structs)
            && flatten_structs(
                out.fields, out.columns, out.gathers, out.per_element
            )) {
            changed = true;
        }

        if (!stringifies(mode.maps)
            && pivot_maps(
                out.fields,
                out.columns,
                out.gathers,
                out.per_element,
                out.num_rows
            )) {
            changed = true;
        }

        if (!stringifies(mode.list)
            && explode_lists(
                out.fields,
                out.columns,
                out.gathers,
                out.per_element,
                out.num_rows,
                mode.list
            )) {
            changed = true;
        }

        if (!changed) {
            break;
        }
    }

    std::set<std::string> seen;
    for (const auto& field : out.fields) {
        if (!seen.insert(field->name()).second) {
            std::stringstream ss;
            ss << "Flattening produced duplicate column `" << field->name()
               << "`\n";
            abort_with(ss.str());
        }
    }

    return out;
}

} // namespace perspective::apachearrow
