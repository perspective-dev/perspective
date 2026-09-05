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

#include <perspective/arrow_writer.h>

namespace perspective::apachearrow {
using namespace perspective;

// TODO: unsure about efficacy of these functions when get<T> exists
template <>
double
get_scalar<double>(t_tscalar& t) {
    return t.to_double();
}
template <>
float
get_scalar<float>(t_tscalar& t) {
    return static_cast<float>(t.to_double());
}
template <>
std::uint8_t
get_scalar<std::uint8_t>(t_tscalar& t) {
    return static_cast<std::uint8_t>(t.to_int64());
}
template <>
std::int8_t
get_scalar<std::int8_t>(t_tscalar& t) {
    return static_cast<std::int8_t>(t.to_int64());
}
template <>
std::int16_t
get_scalar<std::int16_t>(t_tscalar& t) {
    return static_cast<std::int16_t>(t.to_int64());
}
template <>
std::uint16_t
get_scalar<std::uint16_t>(t_tscalar& t) {
    return static_cast<std::uint16_t>(t.to_int64());
}
template <>
std::int32_t
get_scalar<std::int32_t>(t_tscalar& t) {
    return static_cast<std::int32_t>(t.to_int64());
}
template <>
std::uint32_t
get_scalar<std::uint32_t>(t_tscalar& t) {
    return static_cast<std::uint32_t>(t.to_int64());
}
template <>
std::int64_t
get_scalar<std::int64_t>(t_tscalar& t) {
    return static_cast<std::int64_t>(t.to_int64());
}
template <>
std::uint64_t
get_scalar<std::uint64_t>(t_tscalar& t) {
    return static_cast<std::uint64_t>(t.to_int64());
}
template <>
bool
get_scalar<bool>(t_tscalar& t) {
    return t.get<bool>();
}

// std::int32_t
// get_idx(std::int32_t cidx, std::int32_t ridx, std::int32_t stride,
//     t_get_data_extents extents) {
//     return (ridx - extents.m_srow) * stride + (cidx - extents.m_scol);
// }


std::shared_ptr<std::string>
column_to_arrow_ipc(
    const t_column& col, const std::string& name, t_uindex nrows
) {
    t_get_data_extents extents{
        0, static_cast<t_index>(nrows), 0, 1
    };
    auto get = [&col](t_uindex ridx) { return col.get_scalar(ridx); };
    std::shared_ptr<arrow::Field> field;
    std::shared_ptr<arrow::Array> array;
    switch (col.get_dtype()) {
        case DTYPE_INT8: {
            field = arrow::field(name, arrow::int8());
            array = numeric_col_to_array<arrow::Int8Type, std::int8_t>(
                extents, get
            );
        } break;
        case DTYPE_UINT8: {
            field = arrow::field(name, arrow::uint8());
            array = numeric_col_to_array<arrow::UInt8Type, std::uint8_t>(
                extents, get
            );
        } break;
        case DTYPE_INT16: {
            field = arrow::field(name, arrow::int16());
            array = numeric_col_to_array<arrow::Int16Type, std::int16_t>(
                extents, get
            );
        } break;
        case DTYPE_UINT16: {
            field = arrow::field(name, arrow::uint16());
            array = numeric_col_to_array<arrow::UInt16Type, std::uint16_t>(
                extents, get
            );
        } break;
        case DTYPE_INT32: {
            field = arrow::field(name, arrow::int32());
            array = numeric_col_to_array<arrow::Int32Type, std::int32_t>(
                extents, get
            );
        } break;
        case DTYPE_UINT32: {
            field = arrow::field(name, arrow::uint32());
            array = numeric_col_to_array<arrow::UInt32Type, std::uint32_t>(
                extents, get
            );
        } break;
        case DTYPE_INT64: {
            field = arrow::field(name, arrow::int64());
            array = numeric_col_to_array<arrow::Int64Type, std::int64_t>(
                extents, get
            );
        } break;
        case DTYPE_UINT64: {
            field = arrow::field(name, arrow::uint64());
            array = numeric_col_to_array<arrow::UInt64Type, std::uint64_t>(
                extents, get
            );
        } break;
        case DTYPE_FLOAT32: {
            field = arrow::field(name, arrow::float32());
            array = numeric_col_to_array<arrow::FloatType, float>(
                extents, get
            );
        } break;
        case DTYPE_FLOAT64: {
            field = arrow::field(name, arrow::float64());
            array = numeric_col_to_array<arrow::DoubleType, double>(
                extents, get
            );
        } break;
        case DTYPE_DATE: {
            field = arrow::field(name, arrow::date32());
            array = date_col_to_array(extents, get);
        } break;
        case DTYPE_TIME: {
            field = arrow::field(
                name, arrow::timestamp(arrow::TimeUnit::MILLI)
            );
            array = timestamp_col_to_array(extents, get);
        } break;
        case DTYPE_BOOL: {
            field = arrow::field(name, arrow::boolean());
            array = boolean_col_to_array(extents, get);
        } break;
        case DTYPE_STR: {
            field = arrow::field(
                name, arrow::dictionary(arrow::int32(), arrow::utf8())
            );
            array = string_col_to_dictionary_array(extents, get);
        } break;
        default: {
            std::stringstream ss;
            ss << "Cannot serialize column `" << name << "` of type `"
               << get_dtype_descr(col.get_dtype()) << "` to Arrow format."
               << std::endl;
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    auto schema = arrow::schema({field});
    auto batch = arrow::RecordBatch::Make(
        schema, static_cast<std::int64_t>(nrows), {array}
    );
    arrow::Result<std::shared_ptr<arrow::ResizableBuffer>> allocated =
        arrow::AllocateResizableBuffer(0);
    if (!allocated.ok()) {
        std::stringstream ss;
        ss << "Failed to allocate buffer: " << allocated.status().message()
           << std::endl;
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    std::shared_ptr<arrow::ResizableBuffer> buffer = *allocated;
    arrow::io::BufferOutputStream sink(buffer);
    auto options = arrow::ipc::IpcWriteOptions::Defaults();
    options.use_threads = false;
    auto res = arrow::ipc::MakeStreamWriter(&sink, schema, options);
    std::shared_ptr<arrow::ipc::RecordBatchWriter> writer = *res;
    PSP_CHECK_ARROW_STATUS(writer->WriteRecordBatch(*batch));
    PSP_CHECK_ARROW_STATUS(writer->Close());
    PSP_CHECK_ARROW_STATUS(sink.Close());
    return std::make_shared<std::string>(buffer->ToString());
}

} // namespace perspective::apachearrow