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
#include <perspective/date.h>
#include <perspective/exports.h>
#include <perspective/scalar.h>
#include <perspective/data_table.h>
#include <perspective/get_data_extents.h>
#include <perspective/last.h>

#include <arrow/api.h>
#include <arrow/util/decimal.h>
#include <arrow/io/memory.h>
#include <arrow/ipc/reader.h>
#include <arrow/ipc/writer.h>

#include <chrono>
#include <date/date.h>

namespace perspective {
namespace apachearrow {

    /**
     * @brief Return a value from a `t_scalar` cast to `T`.
     *
     * @tparam DataType
     * @tparam ArrowDataType
     * @tparam ArrowValueType
     * @param t
     * @return ArrowValueType
     */
    template <typename T>
    T get_scalar(t_tscalar& t);

    /**
     * @brief Retrieve the correct index into the data slice for the given
     * column and row. This is a redefinition of the method in `t_data_slice`,
     * except it does not rely on any instance variables.
     *
     * @param cidx
     * @param ridx
     * @param stride
     * @param extents
     * @return std::int32_t
     */
    std::int32_t get_idx(
        std::int32_t cidx,
        std::int32_t ridx,
        std::int32_t stride,
        t_get_data_extents extents
    );

    std::shared_ptr<std::string> column_to_arrow_ipc(
        const t_column& col, const std::string& name, t_uindex nrows
    );

    /**
     * @brief Build an `arrow::Array` from a column typed as `DTYPE_BOOL.`
     *
     * @param data
     * @param offset
     * @param stride
     */
    std::shared_ptr<arrow::Array> boolean_col_to_array(
        const std::vector<t_tscalar>& data,
        std::int32_t cidx,
        std::int32_t stride,
        t_get_data_extents extents
    );

    /**
     * @brief Build an `arrow::Array` from a column typed as `DTYPE_DATE.`
     * Separated out from the main templated `col_to_array` as `t_date` is an
     * `uint32_t` that needs to be written into the `arrow::Array` as an
     * `int32_t`.
     *
     * @param data
     * @param offset
     * @param stride
     */
    std::shared_ptr<arrow::Array> date_col_to_array(
        const std::vector<t_tscalar>& data,
        std::int32_t cidx,
        std::int32_t stride,
        t_get_data_extents extents
    );

    /**
     * @brief Build an `arrow::Array` from a column typed as `DTYPE_TIME`.
     * Separated out from the main templated `col_to_array` as
     * `arrow::timestamp()` has parameters that need to be filled.
     *
     * @param data
     * @param offset
     * @param stride
     */
    std::shared_ptr<arrow::Array> timestamp_col_to_array(
        const std::vector<t_tscalar>& data,
        std::int32_t cidx,
        std::int32_t stride,
        t_get_data_extents extents
    );

    /**
     * @brief Build an `arrow::Array` from a column typed as `DTYPE_STR`, using
     * arrow's `DictionaryArray` constructors.
     *
     * @param data
     * @param offset
     * @param stride
     * @return std::shared_ptr<arrow::Array>
     */
    template <typename F>
    std::shared_ptr<arrow::Array>
    string_col_to_dictionary_array(t_get_data_extents extents, F f) {
        t_vocab vocab;
        vocab.init(false);
        arrow::Int32Builder indices_builder;
        arrow::StringBuilder values_builder;
        auto reserve_status =
            indices_builder.Reserve(extents.m_erow - extents.m_srow);
        if (!reserve_status.ok()) {
            std::stringstream ss;
            ss << "Failed to allocate buffer for column: "
               << reserve_status.message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        for (int ridx = extents.m_srow; ridx < extents.m_erow; ++ridx) {
            // auto idx = get_idx(cidx, ridx, stride, extents);
            t_tscalar scalar = f(ridx);
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                auto adx = vocab.get_interned(scalar.get<const char*>());
                indices_builder.UnsafeAppend(adx);
            } else {
                indices_builder.UnsafeAppendNull();
            }
        }

        // get str out of vocab
        for (auto i = 0; i < vocab.get_vlenidx(); i++) {
            const char* str = vocab.unintern_c(i);
            arrow::Status s = values_builder.Append(str, strlen(str));
            if (!s.ok()) {
                std::stringstream ss;
                ss << "Could not append string to dictionary array: "
                   << s.message() << "\n";
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
        }

        // Write dictionary indices
        std::shared_ptr<arrow::Array> indices_array;
        arrow::Status indices_status = indices_builder.Finish(&indices_array);
        if (!indices_status.ok()) {
            std::stringstream ss;
            ss << "Could not write indices for dictionary array: "
               << indices_status.message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        // Write dictionary values
        std::shared_ptr<arrow::Array> values_array;
        arrow::Status values_status = values_builder.Finish(&values_array);
        if (!values_status.ok()) {
            std::stringstream ss;
            ss << "Could not write values for dictionary array: "
               << values_status.message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
        auto dictionary_type = arrow::dictionary(arrow::int32(), arrow::utf8());

        arrow::Result<std::shared_ptr<arrow::Array>> result =
            arrow::DictionaryArray::FromArrays(
                dictionary_type, indices_array, values_array
            );

        if (!result.ok()) {
            std::stringstream ss;
            ss << "Could not write values for dictionary array: "
               << result.status().message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        return *result;
    }

    /**
     * @brief Build an `arrow::Array` from a column contained in `data`. Column
     * building methods read from the vector of scalars that make up the data
     * slice, as `t_data_slice` is templated on the context type and we'd like
     * to avoid template hell.
     *
     * @tparam ArrowDataType
     * @param data
     * @param offset
     * @param stride
     * @return std::shared_ptr<arrow::Array>
     */
    template <typename ArrowDataType, typename ArrowValueType, typename F>
    std::shared_ptr<arrow::Array>
    numeric_col_to_array(t_get_data_extents extents, F f) {
        // NumericBuilder encompasses the most types (int/float/datetime)
        arrow::NumericBuilder<ArrowDataType> array_builder;
        auto reserve_status =
            array_builder.Reserve(extents.m_erow - extents.m_srow);
        if (!reserve_status.ok()) {
            std::stringstream ss;
            ss << "Failed to allocate buffer for column: "
               << reserve_status.message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        for (int ridx = extents.m_srow; ridx < extents.m_erow; ++ridx) {
            t_tscalar scalar = f(ridx);
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                ArrowValueType val = get_scalar<ArrowValueType>(scalar);
                array_builder.UnsafeAppend(val);
            } else {
                array_builder.UnsafeAppendNull();
            }
        }

        // Point to base `arrow::Array` instead of derived, so we don't have to
        // template the caller.
        std::shared_ptr<arrow::Array> array;
        arrow::Status status = array_builder.Finish(&array);
        if (!status.ok()) {
            PSP_COMPLAIN_AND_ABORT(status.message());
        }
        return array;
    }

    template <typename F>
    std::shared_ptr<arrow::Array>
    boolean_col_to_array(t_get_data_extents extents, F f) {
        arrow::BooleanBuilder array_builder;
        auto reserve_status =
            array_builder.Reserve(extents.m_erow - extents.m_srow);
        if (!reserve_status.ok()) {
            std::stringstream ss;
            ss << "Failed to allocate buffer for column: "
               << reserve_status.message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        for (int ridx = extents.m_srow; ridx < extents.m_erow; ++ridx) {
            t_tscalar scalar = f(ridx);
            arrow::Status s;
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                array_builder.UnsafeAppend(get_scalar<bool>(scalar));
            } else {
                array_builder.UnsafeAppendNull();
            }
        }

        std::shared_ptr<arrow::Array> array;
        arrow::Status status = array_builder.Finish(&array);
        if (!status.ok()) {
            PSP_COMPLAIN_AND_ABORT(
                "Could not serialize boolean column: " + status.message()
            );
        }
        return array;
    }

    template <typename F>
    std::shared_ptr<arrow::Array>
    date_col_to_array(t_get_data_extents extents, F f) {
        arrow::Date32Builder array_builder;
        auto reserve_status =
            array_builder.Reserve(extents.m_erow - extents.m_srow);
        if (!reserve_status.ok()) {
            std::stringstream ss;
            ss << "Failed to allocate buffer for column: "
               << reserve_status.message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        for (int ridx = extents.m_srow; ridx < extents.m_erow; ++ridx) {
            t_tscalar scalar = f(ridx);
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                t_date val = scalar.get<t_date>();
                // years are signed, while month/days are unsigned
                date::year year{val.year()};
                // Increment month by 1, as date::month is [1-12] but
                // t_date::month() is [0-11]
                date::month month{static_cast<std::uint32_t>(val.month() + 1)};
                date::day day{static_cast<std::uint32_t>(val.day())};
                date::year_month_day ymd(year, month, day);
                date::sys_days days_since_epoch = ymd;
                array_builder.UnsafeAppend(static_cast<std::int32_t>(
                    days_since_epoch.time_since_epoch().count()
                ));
            } else {
                array_builder.UnsafeAppendNull();
            }
        }

        std::shared_ptr<arrow::Array> array;
        arrow::Status status = array_builder.Finish(&array);
        if (!status.ok()) {
            PSP_COMPLAIN_AND_ABORT(
                "Could not serialize date column: " + status.message()
            );
        }
        return array;
    }

    template <typename F>
    std::shared_ptr<arrow::Array>
    timestamp_col_to_array(t_get_data_extents extents, F f) {
        // TimestampType requires parameters, so initialize them here
        std::shared_ptr<arrow::DataType> type =
            arrow::timestamp(arrow::TimeUnit::MILLI);
        arrow::TimestampBuilder array_builder(
            type, arrow::default_memory_pool()
        );
        auto reserve_status =
            array_builder.Reserve(extents.m_erow - extents.m_srow);
        if (!reserve_status.ok()) {
            std::stringstream ss;
            ss << "Failed to allocate buffer for column: "
               << reserve_status.message() << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        for (int ridx = extents.m_srow; ridx < extents.m_erow; ++ridx) {
            t_tscalar scalar = f(ridx);
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                array_builder.UnsafeAppend(get_scalar<std::int64_t>(scalar));
            } else {
                array_builder.UnsafeAppendNull();
            }
        }

        std::shared_ptr<arrow::Array> array;
        arrow::Status status = array_builder.Finish(&array);
        if (!status.ok()) {
            PSP_COMPLAIN_AND_ABORT(
                "Could not serialize timestamp column: " + status.message()
            );
        }
        return array;
    }

} // namespace apachearrow
} // namespace perspective