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
#include "perspective/raw_types.h"
#include <arrow/array/array_binary.h>
#include <arrow/array/array_nested.h>
#include <arrow/array/array_primitive.h>
#include <arrow/type.h>
#include <arrow/type_fwd.h>
#include <algorithm>
#include <cstdint>
#include <exception>
#include <limits>
#include <memory>
#include <mutex>
#include <perspective/arrow_loader.h>
#include "perspective/exception.h"
#include <sstream>
#include <type_traits>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/writer.h>

namespace perspective::apachearrow {

std::shared_ptr<::arrow::Table>
deduplicate_table(std::shared_ptr<::arrow::Table> input) {
    auto columns = input->ColumnNames();
    std::set<std::string> columns_seen;
    bool is_changed;
    for (auto& column : columns) {
        std::stringstream ss;
        ss << column;
        while (columns_seen.find(ss.str()) != columns_seen.end()) {
            ss << "*";
            is_changed = true;
        }

        if (is_changed) {
            column = ss.str();
        }

        columns_seen.insert(column);
    }

    if (is_changed) {
        input = *input->RenameColumns(columns);
    }

    return input;
}

void
load_stream(
    const std::uint8_t* ptr,
    const uint32_t length,
    std::shared_ptr<arrow::Table>& table
) {
    arrow::io::BufferReader buffer_reader(std::make_shared<arrow::Buffer>(
        reinterpret_cast<const std::uint8_t*>(ptr), length
    ));

    auto status = arrow::ipc::RecordBatchStreamReader::Open(&buffer_reader);
    if (!status.ok()) {
        std::stringstream ss;
        ss << "Failed to open RecordBatchStreamReader: "
           << status.status().ToString() << "\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    } else {
        auto batch_reader = *status;
        auto status5 = batch_reader->ToTable();
        if (!status5.ok()) {
            std::stringstream ss;
            ss << "Failed to read stream record batch: "
               << status5.status().ToString() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        };

        table = deduplicate_table(*status5);
    }
}

void
load_file(
    const std::uint8_t* ptr,
    const uint32_t length,
    std::shared_ptr<arrow::Table>& table
) {
    arrow::io::BufferReader buffer_reader(std::make_shared<arrow::Buffer>(
        reinterpret_cast<const std::uint8_t*>(ptr), length
    ));

    auto status = arrow::ipc::RecordBatchFileReader::Open(&buffer_reader);
    if (!status.ok()) {
        std::stringstream ss;
        ss << "Failed to open RecordBatchFileReader: "
           << status.status().ToString() << "\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    } else {
        std::shared_ptr<arrow::ipc::RecordBatchFileReader> batch_reader =
            *status;

        std::vector<std::shared_ptr<arrow::RecordBatch>> batches;
        auto num_batches = batch_reader->num_record_batches();
        batches.reserve(num_batches);
        for (int i = 0; i < num_batches; ++i) {
            auto status2 = batch_reader->ReadRecordBatch(i);
            if (!status2.ok()) {
                PSP_COMPLAIN_AND_ABORT(
                    "Failed to read file record batch: "
                    + status2.status().ToString()
                );
            }
            std::shared_ptr<arrow::RecordBatch> chunk = *status2;
            batches.push_back(chunk);
        }

        auto status3 =
            arrow::Table::FromRecordBatches(batch_reader->schema(), batches);

        if (!status3.ok()) {
            std::stringstream ss;
            ss << "Failed to create Table from RecordBatches: "
               << status3.status().ToString() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        };
        table = deduplicate_table(std::move(*status3));
    };
}

using namespace perspective;

ArrowLoader::ArrowLoader() = default;
ArrowLoader::~ArrowLoader() = default;
ArrowLoader::ArrowLoader(ArrowLoader&&) noexcept = default;

t_dtype
convert_type(const std::string& src) {
    if (src == "dictionary" || src == "utf8" || src == "binary"
        || src == "large_utf8") {
        return DTYPE_STR;
    }
    if (src == "bool") {
        return DTYPE_BOOL;
    }
    if (src == "int8") {
        return DTYPE_INT8;
    }
    if (src == "uint8") {
        return DTYPE_UINT8;
    }
    if (src == "int16") {
        return DTYPE_INT16;
    }
    if (src == "uint16") {
        return DTYPE_UINT16;
    }
    if (src == "int32") {
        return DTYPE_INT32;
    }
    if (src == "uint32") {
        return DTYPE_UINT32;
    }
    if (src == "uint64") {
        return DTYPE_UINT64;
    }
    if (src == "int64") {
        return DTYPE_INT64;
    }
    if (src == "decimal" || src == "decimal128") {
        return DTYPE_FLOAT64;
    }
    if (src == "float") {
        return DTYPE_FLOAT32;
    }
    if (src == "double") {
        return DTYPE_FLOAT64;
    }
    if (src == "timestamp") {
        return DTYPE_TIME;
    }
    if (src == "time32" || src == "time64" || src == "time32[s]" ) {
        return DTYPE_UINT32;
    }
    if (src == "date32" || src == "date64") {
        return DTYPE_DATE;
    }
    if (src == "null") {
        return DTYPE_STR;
    }
    if (src == "list") {
        return DTYPE_STR;
    }
    std::stringstream ss;
    ss << "Could not load arrow column of type `" << src << "`\n";
    PSP_COMPLAIN_AND_ABORT(ss.str());
    return DTYPE_STR;
}

void
ArrowLoader::initialize(
    const std::uint8_t* ptr, const uint32_t length, t_list_flatten mode
) {
    if (std::memcmp("ARROW1", (const void*)ptr, 6) == 0) {
        load_file(ptr, length, m_table);
    } else {
        load_stream(ptr, length, m_table);
    }

    const auto validation = m_table->ValidateFull();
    if (!validation.ok()) {
        PSP_COMPLAIN_AND_ABORT(validation.ToString());
    }

    if (!normalize_table_is_noop(*m_table, mode)) {
        m_expanded = normalize_table_expands(*m_table, mode);
        m_normalized = std::make_unique<t_normalized_table>(
            normalize_table(m_table, mode)
        );
    }

    for (const auto& field : fields()) {
        m_names.push_back(field->name());
        m_types.push_back(convert_type(field->type()->name()));
    }
}

const std::vector<std::shared_ptr<arrow::Field>>&
ArrowLoader::fields() const {
    return m_normalized ? m_normalized->fields : m_table->schema()->fields();
}

void
ArrowLoader::init_csv(
    const std::string_view& csv,
    bool is_update,
    std::unordered_map<std::string, std::shared_ptr<arrow::DataType>>&
        psp_schema
) {
    m_table = deduplicate_table(csvToTable(csv, is_update, psp_schema));
    for (const auto& field : fields()) {
        m_names.push_back(field->name());
        m_types.push_back(convert_type(field->type()->name()));
    }
}

void
ArrowLoader::fill_table(
    t_data_table& tbl,
    const t_schema& input_schema,
    const std::string& index,
    std::uint32_t offset,
    bool is_update
) {
    bool implicit_index = false;
    const auto& arrow_fields = fields();

    parallel_for(int(m_names.size()), [&](int cidx) {
        auto name = m_names[cidx];
        t_dtype type = m_types[cidx];

        if (input_schema.has_column(name)) {
            // Skip columns that are defined in the arrow but not
            // in the Table's input schema.

            auto raw_type = arrow_fields[cidx]->type()->name();

            if (name == "__INDEX__") {
                implicit_index = true;
                auto input_schema_type = input_schema.get_dtype(name);
                std::shared_ptr<t_column> pkey_col_sptr =
                    tbl.add_column_sptr("psp_pkey", input_schema_type, true);
                fill_column(
                    tbl, pkey_col_sptr, name, cidx, type, raw_type, is_update
                );
                tbl.clone_column("psp_pkey", "psp_okey");
                // continue;
            } else {
                auto col = tbl.get_column(name);
                fill_column(tbl, col, name, cidx, type, raw_type, is_update);
            }
        }
    });

    // Fill index column - recreated every time a `t_data_table` is created.
    if (!implicit_index) {
        if (index.empty()) {
            // Use row number as index if not explicitly provided or
            // provided with
            // `__INDEX__`
            auto* key_col = tbl.add_column("psp_pkey", DTYPE_INT32, true);
            auto* okey_col = tbl.add_column("psp_okey", DTYPE_INT32, true);

            for (std::uint32_t ridx = 0; ridx < tbl.size(); ++ridx) {
                key_col->set_nth<std::uint32_t>(ridx, (ridx + offset));
                okey_col->set_nth<std::uint32_t>(ridx, (ridx + offset));
            }
        } else {
            if (!input_schema.has_column(index)) {
                std::stringstream ss;
                ss << "Specified index `" << index
                   << "` is invalid as it does not appear in the Table.\n";
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }

            tbl.clone_column(index, "psp_pkey");
            tbl.clone_column(index, "psp_okey");
        }
    }
}

/**
 * Read output row `i` straight through, i.e. no row expansion.
 */
struct t_identity_gather {
    static constexpr bool is_identity = true;

    std::int64_t operator[](std::int64_t i) const { return i; }

    bool is_null(std::int64_t) const { return false; }
};

/**
 * Read output row `i` from the source row an expansion assigned to it.
 */
struct t_index_gather {
    static constexpr bool is_identity = false;
    const std::int64_t* m_indices;
    std::int64_t operator[](std::int64_t i) const {
        return m_indices[i] < 0 ? 0 : m_indices[i];
    }

    bool is_null(std::int64_t i) const { return m_indices[i] < 0; }
};

#define COPY_COLUMN_PRIMITIVE(CTYPE, ARROW_TYPE)                               \
    {                                                                          \
        auto scol = std::static_pointer_cast<ARROW_TYPE>(src);                 \
        const auto* vals = scol->raw_values();                                 \
        if constexpr (GATHER::is_identity) {                                   \
            std::memcpy(                                                       \
                dest->get_nth<CTYPE>(offset),                                  \
                (void*)vals,                                                   \
                len * sizeof(CTYPE)                                            \
            );                                                                 \
        } else {                                                               \
            for (std::int64_t i = 0; i < len; ++i) {                           \
                dest->set_nth<CTYPE>(                                          \
                    offset + i, static_cast<CTYPE>(vals[gather[i]])            \
                );                                                             \
            }                                                                  \
        }                                                                      \
    }

template <typename T, typename V, typename GATHER>
void
iter_col_copy(
    const std::shared_ptr<t_column>& dest,
    std::shared_ptr<arrow::Array> src,
    const int64_t offset,
    const int64_t len,
    const GATHER& gather
) {
    std::shared_ptr<T> scol = std::static_pointer_cast<T>(src);
    const typename T::value_type* vals = scol->raw_values();
    for (int64_t i = 0; i < len; i++) {
        dest->set_nth<V>(offset + i, static_cast<V>(vals[gather[i]]));
    }
}

void
copy_string_list(
    std::shared_ptr<arrow::ListArray>& list,
    const std::shared_ptr<t_column>& dest,
    const int64_t num_rows
) {
    const auto typed_data =
        std::static_pointer_cast<::arrow::StringArray>(list->values());

    // the raw bytes of the strings.
    const uint8_t* raw_data = typed_data->value_data()->data();
    // col_offsets are the column level offsets, so each element is the boundary
    // of a row.
    const auto* col_offsets = list->raw_value_offsets();
    // these are the offset locations of the strings within the raw data.
    // each element is the boundary of a string.
    const auto* string_offsets = typed_data->raw_value_offsets();

    for (uint32_t i = 0; i < num_rows; i++) {
        rapidjson::StringBuffer s;
        rapidjson::Writer<rapidjson::StringBuffer> writer(s);
        writer.StartArray();
        auto row_array_length = col_offsets[i + 1] - col_offsets[i];
        for (uint32_t j = 0; j < row_array_length; j++) {
            const auto elem_location = col_offsets[i] + j;
            const auto start_loc = string_offsets[elem_location];
            const auto string_len =
                string_offsets[elem_location + 1] - start_loc;
            writer.String((const char*)raw_data + start_loc, string_len);
        }
        writer.EndArray();
        dest->set_nth(i, s.GetString());
    }
}

template <typename T>
void
copy_integer_list(
    std::shared_ptr<arrow::ListArray>& list,
    const std::shared_ptr<t_column>& dest,
    const int64_t num_rows
) {
    const auto typed_data = std::static_pointer_cast<T>(list->values());
    const auto* array_offsets = list->raw_value_offsets();
    const auto* raw_values = typed_data->raw_values();
    for (uint32_t i = 0; i < num_rows; i++) {
        rapidjson::StringBuffer s;
        rapidjson::Writer<rapidjson::StringBuffer> writer(s);
        writer.StartArray();
        const auto row_array_length = array_offsets[i + 1] - array_offsets[i];
        for (uint32_t j = 0; j < row_array_length; j++) {
            const auto elem_location = array_offsets[i] + j;
            const auto elem = raw_values[elem_location];
            if constexpr (std::is_unsigned_v<typename T::value_type>) {
                writer.Uint64(elem);
            } else {
                writer.Int64(elem);
            }
        }
        writer.EndArray();
        dest->set_nth(i, s.GetString());
    }
}

void
copy_bool_list(
    std::shared_ptr<arrow::ListArray>& list,
    const std::shared_ptr<t_column>& dest,
    const int64_t num_rows
) {
    const auto typed_data =
        std::static_pointer_cast<arrow::BooleanArray>(list->values());
    const auto* array_offsets = list->raw_value_offsets();
    for (uint32_t i = 0; i < num_rows; i++) {
        rapidjson::StringBuffer s;
        rapidjson::Writer<rapidjson::StringBuffer> writer(s);
        writer.StartArray();
        const auto row_array_length = array_offsets[i + 1] - array_offsets[i];
        for (uint32_t j = 0; j < row_array_length; j++) {
            const auto elem_location = array_offsets[i] + j;
            const auto elem = typed_data->Value(elem_location);
            writer.Bool(elem);
        }
        writer.EndArray();
        dest->set_nth(i, s.GetString());
    }
}

template <typename T>
void
copy_float_list(
    std::shared_ptr<arrow::ListArray>& list,
    const std::shared_ptr<t_column>& dest,
    const int64_t num_rows
) {
    const auto typed_data = std::static_pointer_cast<T>(list->values());
    const auto* array_offsets = list->raw_value_offsets();
    const auto* raw_values = typed_data->raw_values();
    for (uint32_t i = 0; i < num_rows; i++) {
        rapidjson::StringBuffer s;
        rapidjson::Writer<rapidjson::StringBuffer> writer(s);
        writer.StartArray();
        const auto row_array_length = array_offsets[i + 1] - array_offsets[i];
        for (uint32_t j = 0; j < row_array_length; j++) {
            const auto elem_location = array_offsets[i] + j;
            const auto elem = raw_values[elem_location];
            writer.Double(elem);
        }
        writer.EndArray();
        dest->set_nth(i, s.GetString());
    }
}

template <typename GATHER>
void
copy_array_impl(
    const std::shared_ptr<t_column>& dest,
    const std::shared_ptr<arrow::Array>& src,
    const int64_t offset,
    const int64_t len,
    const GATHER& gather
) {
    switch (src->type()->id()) {
        case arrow::ListType::type_id: {
            if constexpr (!GATHER::is_identity) {
                PSP_COMPLAIN_AND_ABORT(
                    "Cannot expand rows of a stringified list column\n"
                );
            }

            auto list = std::static_pointer_cast<::arrow::ListArray>(src);

            switch (list->value_type()->id()) {
                case arrow::BooleanType::type_id: {
                    copy_bool_list(list, dest, len);
                } break;
                case arrow::HalfFloatType::type_id: {
                    copy_float_list<arrow::HalfFloatArray>(list, dest, len);
                } break;
                case arrow::FloatType::type_id: {
                    copy_float_list<arrow::FloatArray>(list, dest, len);
                } break;
                case arrow::DoubleType::type_id: {
                    copy_float_list<arrow::DoubleArray>(list, dest, len);
                } break;
                case ::arrow::Int8Type::type_id: {
                    copy_integer_list<arrow::Int8Array>(list, dest, len);
                } break;
                case ::arrow::Int16Type::type_id: {
                    copy_integer_list<arrow::Int16Array>(list, dest, len);
                } break;
                case ::arrow::Int32Type::type_id: {
                    copy_integer_list<arrow::Int32Array>(list, dest, len);
                } break;
                case ::arrow::Int64Type::type_id: {
                    copy_integer_list<arrow::Int64Array>(list, dest, len);
                } break;
                case ::arrow::UInt8Type::type_id: {
                    copy_integer_list<arrow::UInt8Array>(list, dest, len);
                } break;
                case ::arrow::UInt16Type::type_id: {
                    copy_integer_list<arrow::UInt16Array>(list, dest, len);
                } break;
                case ::arrow::UInt32Type::type_id: {
                    copy_integer_list<arrow::UInt32Array>(list, dest, len);
                } break;
                case ::arrow::UInt64Type::type_id: {
                    copy_integer_list<arrow::UInt64Array>(list, dest, len);
                } break;
                case ::arrow::StringType::type_id: {
                    copy_string_list(list, dest, len);
                } break;
                default:
                    auto val = list->value_type();
                    std::stringstream ss;
                    ss << "Given Unsupported type '" << *val << "'.\n";
                    auto cc = ss.str();
                    PSP_COMPLAIN_AND_ABORT(cc);
            }
        } break;
        case arrow::DictionaryType::type_id: {
            auto dictionary_type =
                static_cast<const arrow::DictionaryType*>(src->type().get());

            auto value_type = dictionary_type->value_type();

            // If there are duplicate values in the dictionary
            // at different indices, i.e. [0 => a, 1 => b, 2 =>
            // a], tables with explicit indexes on a string
            // column created from a dictionary array may have
            // duplicate primary keys.
            auto scol = std::static_pointer_cast<arrow::DictionaryArray>(src);
            if (value_type->id() == arrow::large_utf8()->id()) {
                auto dict = std::static_pointer_cast<arrow::LargeStringArray>(
                    scol->dictionary()
                );

                const uint8_t* values = dict->value_data()->data();
                const std::uint64_t dsize = dict->length();
                t_vocab* vocab = dest->_get_vocab();
                std::string elem;
                // vocab len + null bytes
                vocab->reserve(dict->value_data()->size() + dsize, dsize);
                for (std::uint64_t i = 0; i < dsize; ++i) {
                    std::int64_t bidx = dict->value_offset(i);
                    std::size_t es = dict->value_length(i);
                    elem.assign(
                        reinterpret_cast<const char*>(values) + bidx, es
                    );

                    vocab->get_interned(elem);
                }
            } else {
                auto dict = std::static_pointer_cast<arrow::StringArray>(
                    scol->dictionary()
                );

                const uint8_t* values = dict->value_data()->data();
                const std::uint64_t dsize = dict->length();
                t_vocab* vocab = dest->_get_vocab();
                std::string elem;
                vocab->reserve(dict->value_data()->size() + dsize, dsize);
                for (std::uint64_t i = 0; i < dsize; ++i) {
                    std::int32_t bidx = dict->value_offset(i);
                    std::size_t es = dict->value_length(i);
                    elem.assign(
                        reinterpret_cast<const char*>(values) + bidx, es
                    );

                    vocab->get_interned(elem);
                }
            }

            auto indices = scol->indices();
            switch (indices->type()->id()) {
                case arrow::Int8Type::type_id: {
                    iter_col_copy<::arrow::Int8Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                case ::arrow::UInt8Type::type_id: {
                    iter_col_copy<::arrow::UInt8Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                case ::arrow::Int16Type::type_id: {
                    iter_col_copy<::arrow::Int16Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                case ::arrow::UInt16Type::type_id: {
                    iter_col_copy<::arrow::UInt16Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                case ::arrow::Int32Type::type_id: {
                    iter_col_copy<::arrow::Int32Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                case ::arrow::UInt32Type::type_id: {
                    iter_col_copy<::arrow::UInt32Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                case ::arrow::Int64Type::type_id: {
                    iter_col_copy<::arrow::Int64Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                case ::arrow::UInt64Type::type_id: {
                    iter_col_copy<::arrow::UInt64Array, t_uindex>(
                        dest, indices, offset, len, gather
                    );
                } break;
                default: {
                    std::stringstream ss;
                    ss << "Could not copy dictionary array "
                          "indices of type'"
                       << indices->type()->name() << "'\n";
                    PSP_COMPLAIN_AND_ABORT(ss.str());
                }
            }
        } break;
        case arrow::LargeStringType::type_id: {
            std::shared_ptr<arrow::LargeStringArray> scol =
                std::static_pointer_cast<arrow::LargeStringArray>(src);
            const arrow::LargeStringArray::offset_type* offsets =
                scol->raw_value_offsets();
            const uint8_t* values = scol->value_data()->data();

            std::string elem;

            for (std::int64_t i = 0; i < len; ++i) {
                const auto src_i = gather[i];
                arrow::LargeStringArray::offset_type bidx = offsets[src_i];
                std::size_t es = offsets[src_i + 1] - bidx;
                elem.assign(reinterpret_cast<const char*>(values) + bidx, es);
                dest->set_nth(offset + i, elem);
            }
        } break;
        case arrow::BinaryType::type_id:
        case arrow::StringType::type_id: {
            std::shared_ptr<arrow::StringArray> scol =
                std::static_pointer_cast<arrow::StringArray>(src);
            const int32_t* offsets = scol->raw_value_offsets();
            const uint8_t* values = scol->value_data()->data();

            std::string elem;

            for (std::int64_t i = 0; i < len; ++i) {
                const auto src_i = gather[i];
                std::int32_t bidx = offsets[src_i];
                std::size_t es = offsets[src_i + 1] - bidx;
                elem.assign(reinterpret_cast<const char*>(values) + bidx, es);
                dest->set_nth(offset + i, elem);
            }
        } break;
        case arrow::Int8Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::int8_t, arrow::Int8Array);
        } break;
        case arrow::UInt8Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::uint8_t, arrow::UInt8Array);
        } break;
        case arrow::Int16Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::int16_t, arrow::Int16Array);
        } break;
        case arrow::UInt16Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::uint16_t, arrow::UInt16Array);
        } break;
        case arrow::Int32Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::int32_t, arrow::Int32Array);
        } break;
        case arrow::UInt32Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::uint32_t, arrow::UInt32Array);
        } break;
        case arrow::Int64Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::int64_t, arrow::Int64Array);
        } break;
        case arrow::UInt64Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::uint64_t, arrow::UInt64Array);
        } break;
        case arrow::TimestampType::type_id: {
            std::shared_ptr<arrow::TimestampType> tunit =
                std::static_pointer_cast<arrow::TimestampType>(src->type());
            auto scol = std::static_pointer_cast<arrow::TimestampArray>(src);
            switch (tunit->unit()) {
                case arrow::TimeUnit::MILLI: {
                    const int64_t* vals = scol->raw_values();
                    if constexpr (GATHER::is_identity) {
                        std::memcpy(
                            dest->get_nth<double>(offset), (void*)vals, len * 8
                        );
                    } else {
                        for (int64_t i = 0; i < len; i++) {
                            dest->set_nth<int64_t>(offset + i, vals[gather[i]]);
                        }
                    }
                } break;
                case arrow::TimeUnit::NANO: {
                    const int64_t* vals = scol->raw_values();
                    for (int64_t i = 0; i < len; i++) {
                        dest->set_nth<int64_t>(
                            offset + i, vals[gather[i]] / 1000000
                        );
                    }
                } break;
                case arrow::TimeUnit::MICRO: {
                    const int64_t* vals = scol->raw_values();
                    for (int64_t i = 0; i < len; i++) {
                        dest->set_nth<int64_t>(
                            offset + i, vals[gather[i]] / 1000
                        );
                    }
                } break;
                case arrow::TimeUnit::SECOND: {
                    const int64_t* vals = scol->raw_values();
                    for (int64_t i = 0; i < len; i++) {
                        dest->set_nth<int64_t>(
                            offset + i, vals[gather[i]] * 1000
                        );
                    }
                } break;
            }
        } break;
        case arrow::Date64Type::type_id: {
            std::shared_ptr<arrow::Date64Type> date_type =
                std::static_pointer_cast<arrow::Date64Type>(src->type());
            auto scol = std::static_pointer_cast<arrow::Date64Array>(src);
            const int64_t* vals = scol->raw_values();
            for (int64_t i = 0; i < len; i++) {
                std::chrono::milliseconds timestamp(vals[gather[i]]);
                date::sys_days days(date::floor<date::days>(timestamp));
                auto ymd = date::year_month_day{days};
                std::int32_t year = static_cast<std::int32_t>(ymd.year());
                std::uint32_t month = static_cast<std::uint32_t>(ymd.month());
                std::uint32_t day = static_cast<std::uint32_t>(ymd.day());
                // Decrement month by 1, as date::month is
                // [1-12] but t_date::month() is [0-11]
                dest->set_nth(offset + i, t_date(year, month - 1, day));
            }
        } break;
        case arrow::Date32Type::type_id: {
            std::shared_ptr<arrow::Date32Type> date_type =
                std::static_pointer_cast<arrow::Date32Type>(src->type());
            auto scol = std::static_pointer_cast<arrow::Date32Array>(src);
            const int32_t* vals = scol->raw_values();
            for (int64_t i = 0; i < len; i++) {
                date::days days{vals[gather[i]]};
                auto ymd = date::year_month_day{date::sys_days{days}};
                // years are signed, month/day are unsigned
                std::int32_t year = static_cast<std::int32_t>(ymd.year());
                std::uint32_t month = static_cast<std::uint32_t>(ymd.month());
                std::uint32_t day = static_cast<std::uint32_t>(ymd.day());
                // Decrement month by 1, as date::month is
                // [1-12] but t_date::month() is [0-11]
                dest->set_nth(offset + i, t_date(year, month - 1, day));
            }
        } break;
        case arrow::FloatType::type_id: {
            COPY_COLUMN_PRIMITIVE(float, arrow::FloatArray);
        } break;
        case arrow::DoubleType::type_id: {
            COPY_COLUMN_PRIMITIVE(double, arrow::DoubleArray);
        } break;
        case arrow::Decimal128Type::type_id:
        case arrow::DecimalType::type_id: {
            std::shared_ptr<arrow::Decimal128Array> scol =
                std::static_pointer_cast<arrow::Decimal128Array>(src);
            auto decimal_type =
                std::static_pointer_cast<arrow::Decimal128Type>(src->type());
            int32_t scale = decimal_type->scale();
            auto* vals = (arrow::Decimal128*)scol->raw_values();
            for (int64_t i = 0; i < len; ++i) {
                dest->set_nth<double>(
                    offset + i, vals[gather[i]].ToDouble(scale)
                );
            }
        } break;
        case arrow::BooleanType::type_id: {
            auto scol = std::static_pointer_cast<arrow::BooleanArray>(src);
            const uint8_t* bitmap = scol->values()->data();
            for (int64_t i = 0; i < len; ++i) {
                const auto src_i = gather[i] + scol->offset();
                std::uint8_t elem = bitmap[src_i / 8];
                bool v = (elem & (1 << (src_i % 8))) != 0;
                dest->set_nth<bool>(offset + i, v);
            }
        } break;
        case arrow::NullType::type_id: {
            for (uint32_t i = 0; i < len; ++i) {
                dest->set_valid(i, false);
            }
        } break;
        case arrow::Time32Type::type_id: {
            COPY_COLUMN_PRIMITIVE(std::uint32_t, arrow::Time32Array);
        } break;
        // case arrow::Type {
            
        // } break;
        default: {
            std::stringstream ss;
            std::string arrow_type = src->type()->ToString();
            ss << "Could not load Arrow column of type `" << arrow_type
               << "`.\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }
}

void
copy_array(
    const std::shared_ptr<t_column>& dest,
    const std::shared_ptr<arrow::Array>& src,
    const int64_t offset,
    const int64_t len
) {
    copy_array_impl(dest, src, offset, len, t_identity_gather{});
}

// Defines the full matrix of type interactions between arrow arrays and
// schema-defined tables.
#define FILL_COLUMN_ITER(ARRAY_TYPE)                                           \
    switch (column_dtype) {                                                    \
        case DTYPE_INT8: {                                                     \
            iter_col_copy<ARRAY_TYPE, std::int8_t>(col, array, offset, len, gather);   \
        } break;                                                               \
        case DTYPE_UINT8: {                                                    \
            iter_col_copy<ARRAY_TYPE, std::uint8_t>(col, array, offset, len, gather);  \
        } break;                                                               \
        case DTYPE_INT16: {                                                    \
            iter_col_copy<ARRAY_TYPE, std::int16_t>(col, array, offset, len, gather);  \
        } break;                                                               \
        case DTYPE_UINT16: {                                                   \
            iter_col_copy<ARRAY_TYPE, std::uint16_t>(col, array, offset, len, gather); \
        } break;                                                               \
        case DTYPE_INT32: {                                                    \
            iter_col_copy<ARRAY_TYPE, std::int32_t>(col, array, offset, len, gather);  \
        } break;                                                               \
        case DTYPE_UINT32: {                                                   \
            iter_col_copy<ARRAY_TYPE, std::uint32_t>(col, array, offset, len, gather); \
        } break;                                                               \
        case DTYPE_INT64: {                                                    \
            iter_col_copy<ARRAY_TYPE, std::int64_t>(col, array, offset, len, gather);  \
        } break;                                                               \
        case DTYPE_UINT64: {                                                   \
            iter_col_copy<ARRAY_TYPE, std::uint64_t>(col, array, offset, len, gather); \
        } break;                                                               \
        case DTYPE_FLOAT32: {                                                  \
            iter_col_copy<ARRAY_TYPE, float>(col, array, offset, len, gather);         \
        } break;                                                               \
        case DTYPE_FLOAT64: {                                                  \
            iter_col_copy<ARRAY_TYPE, double>(col, array, offset, len, gather);        \
        } break;                                                               \
        default: {                                                             \
            std::stringstream ss;                                              \
            ss << "Could not fill arrow column `" << name << "` iteratively"   \
               << " due to mismatched types.";                                 \
            PSP_COMPLAIN_AND_ABORT(ss.str());                                  \
        }                                                                      \
    }

/**
 * Mark `[offset, offset + len)` valid or invalid from `array`'s null bitmap,
 * read through `gather`.
 */
template <typename GATHER>
static void
fill_validity(
    const std::shared_ptr<t_column>& col,
    const std::shared_ptr<arrow::Array>& array,
    const std::int64_t offset,
    const std::int64_t len,
    bool is_update,
    const GATHER& gather
) {
    const auto invalidate = [&](std::int64_t i) {
        if (is_update) {
            col->unset(offset + i);
        } else {
            col->clear(offset + i);
        }
    };

    const std::int64_t null_count = array->null_count();
    if (null_count == 0 && GATHER::is_identity) {
        col->set_valid_range(offset, len);
        return;
    }

    const uint8_t* null_bitmap = array->null_bitmap_data();
    if (null_count != 0 && null_bitmap == nullptr) {
        for (std::int64_t i = 0; i < len; ++i) {
            invalidate(i);
        }

        return;
    }

    const std::int64_t bit_base = array->offset();
    for (std::int64_t i = 0; i < len; ++i) {
        bool valid = !gather.is_null(i);
        if (valid && null_bitmap != nullptr) {
            const std::int64_t bit = bit_base + gather[i];
            valid = (null_bitmap[bit / 8] & (1 << (bit % 8))) != 0;
        }

        if (valid) {
            col->set_valid(offset + i, true);
        } else {
            invalidate(i);
        }
    }
}

template <typename GATHER>
void fill_column_chunk(
    const std::shared_ptr<t_column>& col,
    const std::shared_ptr<arrow::Array>& array,
    const std::string& name,
    t_dtype type,
    std::int64_t offset,
    std::int64_t len,
    bool is_update,
    const GATHER& gather
);

void
ArrowLoader::fill_column(
    t_data_table& tbl,
    const std::shared_ptr<t_column>& col,
    const std::string& name,
    std::int32_t cidx,
    t_dtype type,
    std::string& raw_type,
    bool is_update
) {
    std::shared_ptr<arrow::ChunkedArray> carray;
    const std::vector<std::int64_t>* indices = nullptr;
    if (m_normalized) {
        carray = m_normalized->columns[cidx];
        if (!m_normalized->gathers[cidx].empty()) {
            indices = &m_normalized->gathers[cidx];
        }
    } else {
        carray = m_table->GetColumnByName(name);
    }

    if (carray == nullptr) {
        LOG_DEBUG(
            "Could not find column `" << name << "` in arrow table."
                                      << "\n"
        );
        return;
    }

    if (indices != nullptr) {
        if (carray->num_chunks() == 0 || carray->chunk(0)->length() == 0) {
            for (std::size_t i = 0; i < indices->size(); ++i) {
                if (is_update) {
                    col->unset(i);
                } else {
                    col->clear(i);
                }
            }

            return;
        }

        fill_column_chunk(
            col,
            carray->chunk(0),
            name,
            type,
            0,
            static_cast<std::int64_t>(indices->size()),
            is_update,
            t_index_gather{indices->data()}
        );

        return;
    }

    int64_t offset = 0;
    for (auto i = 0; i < carray->num_chunks(); ++i) {
        std::shared_ptr<arrow::Array> array = carray->chunk(i);
        int64_t len = array->length();
        fill_column_chunk(
            col, array, name, type, offset, len, is_update, t_identity_gather{}
        );

        offset += len;
    }
}

template <typename GATHER>
void
fill_column_chunk(
    const std::shared_ptr<t_column>& col,
    const std::shared_ptr<arrow::Array>& array,
    const std::string& name,
    t_dtype type,
    std::int64_t offset,
    std::int64_t len,
    bool is_update,
    const GATHER& gather
) {
    {

        // If the Arrow array schema is different from the data
        // table schema, iteratively fill.
        t_dtype column_dtype = col->get_dtype();

        // `type`: arrow array dtype converted to `t_dtype`
        // `column_dtype`: dtype of the `t_column`
        if (type != column_dtype) {
            LOG_DEBUG(
                "Type " << type << " != " << column_dtype << " for column "
                        << name << " - filling iteratively"
            );
            switch (type) {
                case DTYPE_INT8: {
                    FILL_COLUMN_ITER(::arrow::Int8Array);
                } break;
                case DTYPE_UINT8: {
                    FILL_COLUMN_ITER(::arrow::UInt8Array);
                } break;
                case DTYPE_INT16: {
                    FILL_COLUMN_ITER(::arrow::Int16Array);
                } break;
                case DTYPE_UINT16: {
                    FILL_COLUMN_ITER(::arrow::UInt16Array);
                } break;
                case DTYPE_INT32: {
                    FILL_COLUMN_ITER(::arrow::Int32Array);
                } break;
                case DTYPE_UINT32: {
                    FILL_COLUMN_ITER(::arrow::UInt32Array);
                } break;
                case DTYPE_INT64: {
                    FILL_COLUMN_ITER(::arrow::Int64Array);
                } break;
                case DTYPE_UINT64: {
                    FILL_COLUMN_ITER(::arrow::UInt64Array);
                } break;
                case DTYPE_FLOAT32: {
                    FILL_COLUMN_ITER(::arrow::FloatArray);
                } break;
                case DTYPE_FLOAT64: {
                    FILL_COLUMN_ITER(::arrow::DoubleArray);
                } break;
                default: {
                    std::stringstream ss;
                    ss << "Could not fill column `" << name << "` with "
                       << "t_dtype: `" << get_dtype_descr(column_dtype) << "`, "
                       << "array type: `" << get_dtype_descr(type) << "`\n";
                    PSP_COMPLAIN_AND_ABORT(ss.str());
                };
            }
        } else {
            copy_array_impl(col, array, offset, len, gather);
        }

        fill_validity(col, array, offset, len, is_update, gather);
    }
}

// Getters

std::uint32_t
ArrowLoader::row_count() const {
    const std::int64_t n =
        m_normalized ? m_normalized->num_rows : m_table->num_rows();
    if (n < 0
        || static_cast<std::uint64_t>(n)
            > std::numeric_limits<std::uint32_t>::max()) {
        PSP_COMPLAIN_AND_ABORT(
            "Arrow table row count exceeds maximum supported size"
        );
    }

    return static_cast<std::uint32_t>(n);
}

std::optional<std::string>
ArrowLoader::repeated_index(const std::string& index) const {
    if (!m_expanded) {
        return std::nullopt;
    }

    const auto is_per_element = [&](const std::string& name) {
        const auto it = std::find(m_names.begin(), m_names.end(), name);
        return it != m_names.end() && m_normalized
            && m_normalized->per_element[std::distance(m_names.begin(), it)];
    };

    if (!index.empty() && !is_per_element(index)) {
        return index;
    }

    const std::string implicit{"__INDEX__"};
    const auto has_implicit =
        std::find(m_names.begin(), m_names.end(), implicit) != m_names.end();

    if (has_implicit && !is_per_element(implicit)) {
        return implicit;
    }

    return std::nullopt;
}

std::vector<std::string>
ArrowLoader::names() const {
    return m_names;
}

std::vector<t_dtype>
ArrowLoader::types() const {
    return m_types;
}

} // namespace perspective::apachearrow