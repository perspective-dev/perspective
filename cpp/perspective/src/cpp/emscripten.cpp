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

#include <optional>
#include <perspective/emscripten.h>
#include <perspective/arrow_loader.h>
#include <perspective/arrow_writer.h>
#include <arrow/csv/api.h>
#include <boost/optional.hpp>

using namespace emscripten;
using namespace perspective;

namespace perspective {
namespace binding {

    /******************************************************************************
     *
     * Utility
     */

    template <typename T>
    std::vector<T>
    make_vector() {
        return std::vector<T>{};
    }

    template <>
    bool
    has_value(t_val item) {
        return (!item.isUndefined() && !item.isNull());
    }

    /******************************************************************************
     *
     * Date Parsing
     */

    t_date
    jsdate_to_t_date(t_val date) {
        // Javascript stores month as [0-11], so we don't need to do any
        // conversion for compatibility with `t_date`
        return t_date(
            date.call<t_val>("getFullYear").as<std::int32_t>(),
            date.call<t_val>("getMonth").as<std::int32_t>(),
            date.call<t_val>("getDate").as<std::int32_t>()
        );
    }

    t_val
    t_date_to_jsdate(t_date date) {
        t_val jsdate =
            t_val::global("Date").new_(date.year(), date.month(), date.day());
        return jsdate;
    }

    t_val
    is_valid_datetime(t_val filter_term) {
        return t_val(
            apachearrow::parseAsArrowTimestamp(filter_term.as<std::string>())
            != std::nullopt
        );
    }

    bool
    val_to_date(t_val& item, t_date* out) {
        time_t tt;
        if (item.typeOf().as<std::string>().compare("string") == 0) {
            tt = time_t(
                *apachearrow::parseAsArrowTimestamp(item.as<std::string>())
                / 1000
            );
        } else if (item.typeOf().as<std::string>().compare("number") == 0) {
            tt = time_t(static_cast<int64_t>(item.as<double>()) / 1000);
        } else if (item.typeOf().as<std::string>().compare("object") == 0) {
            tt = time_t(
                static_cast<int64_t>(item.call<t_val>("getTime").as<double>())
                / 1000
            );
        } else {
            return false;
        }
        tm local_tm = *localtime(&tt);
        (*out) =
            t_date(local_tm.tm_year + 1900, local_tm.tm_mon, local_tm.tm_mday);
        return true;
    }

    bool
    val_to_datetime(t_val& item, int64_t* out) {
        if (item.typeOf().as<std::string>().compare("string") == 0) {
            (*out) =
                *apachearrow::parseAsArrowTimestamp(item.as<std::string>());
        } else if (item.typeOf().as<std::string>().compare("number") == 0) {
            (*out) = static_cast<int64_t>(item.as<double>());
        } else if (item.typeOf().as<std::string>().compare("object") == 0) {
            (*out) =
                static_cast<int64_t>(item.call<t_val>("getTime").as<double>());
        } else {
            return false;
        }
        return true;
    }

    /******************************************************************************
     *
     * Manipulate scalar values
     */
    t_val
    scalar_to_val(const t_tscalar& scalar, bool cast_double, bool cast_string) {
        if (!scalar.is_valid()) {
            return t_val::null();
        }
        switch (scalar.get_dtype()) {
            case DTYPE_BOOL: {
                return t_val(scalar.as_bool());
            }
            case DTYPE_TIME: {
                if (cast_double) {
                    auto x = scalar.to_uint64();
                    double y = *reinterpret_cast<double*>(&x);
                    return t_val(y);
                } else if (cast_string) {
                    double ms = scalar.to_double();
                    t_val date = t_val::global("Date").new_(ms);
                    return date.call<t_val>("toLocaleString");
                } else {
                    return t_val(scalar.to_double());
                }
            }
            case DTYPE_FLOAT64:
            case DTYPE_FLOAT32: {
                if (cast_double) {
                    auto x = scalar.to_uint64();
                    double y = *reinterpret_cast<double*>(&x);
                    return t_val(y);
                } else {
                    return t_val(scalar.to_double());
                }
            }
            case DTYPE_DATE: {
                return t_date_to_jsdate(scalar.get<t_date>())
                    .call<t_val>("getTime");
            }
            case DTYPE_UINT8:
            case DTYPE_UINT16:
            case DTYPE_UINT32:
            case DTYPE_INT8:
            case DTYPE_INT16:
            case DTYPE_INT32: {
                return t_val(static_cast<std::int32_t>(scalar.to_int64()));
            }
            case DTYPE_UINT64:
            case DTYPE_INT64: {
                // This could potentially lose precision
                return t_val(static_cast<std::int32_t>(scalar.to_int64()));
            }
            case DTYPE_NONE: {
                return t_val::null();
            }
            case DTYPE_STR:
            default: {
                std::wstring_convert<utf8convert_type, wchar_t> converter(
                    "", L"<Invalid>"
                );
                return t_val(converter.from_bytes(scalar.get<const char*>()));
            }
        }
    }

    template <typename T, typename U>
    std::vector<U>
    vecFromArray(T& arr) {
        return vecFromJSArray<U>(arr);
    }

    /**
     * Converts a std::vector<T> to a Typed Array, slicing directly from the
     * WebAssembly heap.
     */
    template <typename T>
    t_val
    vector_to_typed_array(std::vector<T>& xs) {
        T* st = &xs[0];
        uintptr_t offset = reinterpret_cast<uintptr_t>(st);
        return t_val::module_property("HEAPU8").call<t_val>(
            "slice", offset, offset + (sizeof(T) * xs.size())
        );
    }

    t_val
    to_arraybuffer(std::shared_ptr<std::vector<uint8_t>> xs) {
        uint8_t* st = &(*xs)[0];
        uintptr_t offset = reinterpret_cast<uintptr_t>(st);
        return t_val::module_property("HEAPU8").call<t_val>(
            "slice", offset, offset + (sizeof(uint8_t) * xs->size())
        );
    }

    t_val
    str_to_arraybuffer(std::shared_ptr<std::string> str) {
        char* start = &(*str)[0];
        uintptr_t offset = reinterpret_cast<uintptr_t>(start);
        return t_val::module_property("HEAPU8").call<t_val>(
            "slice", offset, offset + (sizeof(char) * str->size())
        );
    }

    template <typename CTX_T>
    t_val
    to_arrow(
        std::shared_ptr<View<CTX_T>> view,
        std::int32_t start_row,
        std::int32_t end_row,
        std::int32_t start_col,
        std::int32_t end_col,
        bool compress
    ) {
        std::shared_ptr<std::string> s = view->to_arrow(
            start_row, end_row, start_col, end_col, true, compress
        );
        return str_to_arraybuffer(s)["buffer"];
    }

    template <typename CTX_T>
    t_val
    to_csv(
        std::shared_ptr<View<CTX_T>> view,
        std::int32_t start_row,
        std::int32_t end_row,
        std::int32_t start_col,
        std::int32_t end_col
    ) {
        std::shared_ptr<std::string> s =
            view->to_csv(start_row, end_row, start_col, end_col);
        return t_val(*s);
    }

    template <typename CTX_T>
    t_val
    get_row_delta(std::shared_ptr<View<CTX_T>> view) {
        auto slice = view->get_row_delta();
        auto row_delta = view->data_slice_to_arrow(slice, false, false);
        return str_to_arraybuffer(row_delta)["buffer"];
    }

    /******************************************************************************
     *
     * Write data in the Apache Arrow format
     */
    namespace arraybuffer {

        template <>
        void
        vecFromTypedArray(
            const t_val& typedArray,
            void* data,
            std::int32_t length,
            const char* destType
        ) {
            t_val constructor = destType == nullptr ? typedArray["constructor"]
                                                    : t_val::global(destType);
            t_val memory = t_val::module_property("HEAP8")["buffer"];
            std::uintptr_t ptr = reinterpret_cast<std::uintptr_t>(data);
            t_val memoryView = constructor.new_(memory, ptr, length);
            t_val slice = typedArray.call<t_val>("slice", 0, length);
            memoryView.call<void>("set", slice);
        }

        template <>
        void
        fill_col_valid(t_val dcol, std::shared_ptr<t_column> col) {
            // dcol should be the Uint8Array containing the null bitmap
            t_uindex nrows = col->size();

            // arrow packs bools into a bitmap
            for (auto i = 0; i < nrows; ++i) {
                std::uint8_t elem = dcol[i / 8].as<std::uint8_t>();
                bool v = elem & (1 << (i % 8));
                col->set_valid(i, v);
            }
        }

        template <>
        void
        fill_col_dict(t_val dictvec, std::shared_ptr<t_column> col) {
            // ptaylor: This assumes the dictionary is either a Binary or Utf8
            // Vector. Should it support other Vector types?
            t_val vdata = dictvec["values"];
            std::int32_t vsize = vdata["length"].as<std::int32_t>();
            std::vector<unsigned char> data;
            data.reserve(vsize);
            data.resize(vsize);
            vecFromTypedArray(vdata, data.data(), vsize);

            t_val voffsets = dictvec["valueOffsets"];
            std::int32_t osize = voffsets["length"].as<std::int32_t>();
            std::vector<std::int32_t> offsets;
            offsets.reserve(osize);
            offsets.resize(osize);
            vecFromTypedArray(voffsets, offsets.data(), osize);

            // Get number of dictionary entries
            std::uint32_t dsize = dictvec["length"].as<std::uint32_t>();

            t_vocab* vocab = col->_get_vocab();
            std::string elem;

            for (std::uint32_t i = 0; i < dsize; ++i) {
                std::int32_t bidx = offsets[i];
                std::size_t es = offsets[i + 1] - bidx;
                elem.assign(reinterpret_cast<char*>(data.data()) + bidx, es);
#ifdef PSP_DEBUG
                // Make sure there are no duplicates in the arrow dictionary
                t_uindex idx = vocab->get_interned(elem);
                assert(idx == i);
#else
                vocab->get_interned(elem);
#endif
            }
        }
    } // namespace arraybuffer

    namespace js_typed_array {
        t_val ArrayBuffer = t_val::global("ArrayBuffer");
        t_val Int8Array = t_val::global("Int8Array");
        t_val Int16Array = t_val::global("Int16Array");
        t_val Int32Array = t_val::global("Int32Array");
        t_val UInt8Array = t_val::global("Uint8Array");
        t_val UInt32Array = t_val::global("Uint32Array");
        t_val Float32Array = t_val::global("Float32Array");
        t_val Float64Array = t_val::global("Float64Array");
    } // namespace js_typed_array

    template <typename T>
    const t_val typed_array = t_val::null();

    template <>
    const t_val typed_array<double> = js_typed_array::Float64Array;
    template <>
    const t_val typed_array<float> = js_typed_array::Float32Array;
    template <>
    const t_val typed_array<std::int8_t> = js_typed_array::Int8Array;
    template <>
    const t_val typed_array<std::int16_t> = js_typed_array::Int16Array;
    template <>
    const t_val typed_array<std::int32_t> = js_typed_array::Int32Array;
    template <>
    const t_val typed_array<std::uint32_t> = js_typed_array::UInt32Array;

    template <>
    double
    get_scalar<double>(t_tscalar& t) {
        return t.to_double();
    }
    template <>
    float
    get_scalar<float>(t_tscalar& t) {
        return t.to_double();
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
    double
    get_scalar<t_date, double>(t_tscalar& t) {
        auto x = t.to_uint64();
        return *reinterpret_cast<double*>(&x);
    }

    template <typename T, typename F, typename O>
    val
    col_to_typed_array(const std::vector<t_tscalar>& data) {
        int data_size = data.size();
        std::vector<T> vals;
        vals.reserve(data.size());

        // Validity map must have a length that is a multiple of 64
        int nullSize = ceil(data_size / 64.0) * 2;
        int nullCount = 0;
        std::vector<std::uint32_t> validityMap;
        validityMap.resize(nullSize);

        for (int idx = 0; idx < data_size; idx++) {
            t_tscalar scalar = data[idx];
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                vals.push_back(get_scalar<F, T>(scalar));
                // Mark the slot as non-null (valid)
                validityMap[idx / 32] |= 1 << (idx % 32);
            } else {
                vals.push_back({});
                nullCount++;
            }
        }

        t_val arr = t_val::global("Array").new_();
        arr.call<void>(
            "push", typed_array<O>.new_(vector_to_typed_array(vals)["buffer"])
        );
        arr.call<void>("push", nullCount);
        arr.call<void>("push", vector_to_typed_array(validityMap));
        return arr;
    }

    template <>
    val
    col_to_typed_array<bool>(const std::vector<t_tscalar>& data) {
        int data_size = data.size();

        std::vector<std::int8_t> vals;
        vals.reserve(data.size());

        // Validity map must have a length that is a multiple of 64
        int nullSize = ceil(data_size / 64.0) * 2;
        int nullCount = 0;
        std::vector<std::uint32_t> validityMap;
        validityMap.resize(nullSize);

        for (int idx = 0; idx < data_size; idx++) {
            t_tscalar scalar = data[idx];
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                // get boolean and write into array
                std::int8_t t_val = get_scalar<std::int8_t>(scalar);
                vals.push_back(t_val);
                // bit mask based on value in array
                vals[idx / 8] |= t_val << (idx % 8);
                // Mark the slot as non-null (valid)
                validityMap[idx / 32] |= 1 << (idx % 32);
            } else {
                vals.push_back({});
                nullCount++;
            }
        }

        t_val arr = t_val::global("Array").new_();
        arr.call<void>(
            "push",
            typed_array<std::int8_t>.new_(vector_to_typed_array(vals)["buffer"])
        );
        arr.call<void>("push", nullCount);
        arr.call<void>("push", vector_to_typed_array(validityMap));
        return arr;
    }

    template <>
    val
    col_to_typed_array<std::string>(const std::vector<t_tscalar>& data) {
        int data_size = data.size();

        t_vocab vocab;
        vocab.init(false);

        int nullSize = ceil(data_size / 64.0) * 2;
        int nullCount = 0;
        std::vector<std::int32_t> validityMap; // = new std::uint32_t[nullSize];
        validityMap.resize(nullSize);
        t_val indexBuffer = js_typed_array::ArrayBuffer.new_(data_size * 4);
        t_val indexArray = js_typed_array::Int32Array.new_(indexBuffer);

        for (int idx = 0; idx < data_size; idx++) {
            t_tscalar scalar = data[idx];
            if (scalar.is_valid() && scalar.get_dtype() != DTYPE_NONE) {
                auto adx = vocab.get_interned(scalar.get<const char*>());
                indexArray.call<void>("fill", t_val(adx), idx, idx + 1);
                validityMap[idx / 32] |= 1 << (idx % 32);
            } else {
                nullCount++;
            }
        }
        t_val dictBuffer = js_typed_array::ArrayBuffer.new_(
            vocab.get_vlendata()->size() - vocab.get_vlenidx()
        );
        t_val dictArray = js_typed_array::Int8Array.new_(dictBuffer);
        std::vector<std::int32_t> offsets;
        offsets.reserve(vocab.get_vlenidx() + 1);
        std::int32_t index = 0;
        for (auto i = 0; i < vocab.get_vlenidx(); i++) {
            const char* str = vocab.unintern_c(i);
            offsets.push_back(index);
            while (*str) {
                dictArray.call<void>("fill", t_val(*str++), index, index + 1);
                index++;
            }
        }
        offsets.push_back(index);

        t_val arr = t_val::global("Array").new_();
        arr.call<void>("push", dictArray);
        arr.call<void>(
            "push",
            js_typed_array::Int32Array.new_(vector_to_typed_array(offsets
            )["buffer"])
        );
        arr.call<void>("push", indexArray);
        arr.call<void>("push", nullCount);
        arr.call<void>("push", vector_to_typed_array(validityMap));
        return arr;
    }

    t_val
    col_to_js_typed_array(
        const std::vector<t_tscalar>& data, t_dtype dtype, t_index idx
    ) {
        switch (dtype) {
            case DTYPE_INT8: {
                return col_to_typed_array<std::int8_t>(data);
            } break;
            case DTYPE_INT16: {
                return col_to_typed_array<std::int16_t>(data);
            } break;
            case DTYPE_DATE:
            case DTYPE_TIME: {
                return col_to_typed_array<double, t_date, std::int32_t>(data);
            } break;
            case DTYPE_INT32:
            case DTYPE_UINT32: {
                return col_to_typed_array<std::uint32_t>(data);
            } break;
            case DTYPE_INT64: {
                return col_to_typed_array<std::int32_t>(data);
            } break;
            case DTYPE_FLOAT32: {
                return col_to_typed_array<float>(data);
            } break;
            case DTYPE_FLOAT64: {
                return col_to_typed_array<double>(data);
            } break;
            case DTYPE_BOOL: {
                return col_to_typed_array<bool>(data);
            } break;
            case DTYPE_STR: {
                return col_to_typed_array<std::string>(data);
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unhandled aggregate type");
                return t_val::undefined();
            }
        }
    }

    /******************************************************************************
     *
     * Data accessor API
     */

    std::vector<std::string>
    get_column_names(t_val data, std::int32_t format) {
        std::vector<std::string> names;
        t_val Object = t_val::global("Object");

        if (format == 0) {
            std::int32_t max_check = 50;
            t_val data_names = Object.call<t_val>("keys", data[0]);
            names = vecFromArray<t_val, std::string>(data_names);
            std::int32_t check_index =
                std::min(max_check, data["length"].as<std::int32_t>());

            for (auto ix = 0; ix < check_index; ix++) {
                t_val next = Object.call<t_val>("keys", data[ix]);

                if (names.size() != next["length"].as<std::int32_t>()) {
                    auto old_size = names.size();
                    auto new_names = vecFromJSArray<std::string>(next);
                    if (max_check == 50) {
                        std::cout << "Data parse warning: Array data has "
                                     "inconsistent rows"
                                  << std::endl;
                    }

                    for (auto s = new_names.begin(); s != new_names.end();
                         ++s) {
                        if (std::find(names.begin(), names.end(), *s)
                            == names.end()) {
                            names.push_back(*s);
                        }
                    }

                    std::cout << "Extended from " << old_size << "to "
                              << names.size() << std::endl;
                    max_check *= 2;
                }
            }
        } else if (format == 1 || format == 2) {
            t_val keys = Object.call<t_val>("keys", data);
            names = vecFromArray<t_val, std::string>(keys);
        }

        return names;
    }

    t_dtype
    infer_type(t_val x) {
        std::string jstype = x.typeOf().as<std::string>();
        t_dtype t = t_dtype::DTYPE_STR;

        // Unwrap numbers inside strings
        t_val x_number =
            t_val::global("Number").call<t_val>("call", t_val::object(), x);
        bool number_in_string = (jstype == "string")
            && (x["length"].as<std::int32_t>() != 0)
            && (!t_val::global("isNaN").call<bool>(
                "call", t_val::object(), x_number
            ));

        if (x.isNull()) {
            t = t_dtype::DTYPE_NONE;
        } else if (jstype == "number" || number_in_string) {
            if (number_in_string) {
                x = x_number;
            }
            double x_float64 = x.as<double>();
            if ((std::fmod(x_float64, 1.0) == 0.0) && (x_float64 < 10000.0)
                && (x_float64 != 0.0)) {
                t = t_dtype::DTYPE_INT32;
            } else {
                t = t_dtype::DTYPE_FLOAT64;
            }
        } else if (jstype == "boolean") {
            t = t_dtype::DTYPE_BOOL;
        } else if (x.instanceof (t_val::global("Date"))) {
            std::int32_t hours = x.call<t_val>("getHours").as<std::int32_t>();
            std::int32_t minutes =
                x.call<t_val>("getMinutes").as<std::int32_t>();
            std::int32_t seconds =
                x.call<t_val>("getSeconds").as<std::int32_t>();
            std::int32_t milliseconds =
                x.call<t_val>("getMilliseconds").as<std::int32_t>();

            if (hours == 0 && minutes == 0 && seconds == 0
                && milliseconds == 0) {
                t = t_dtype::DTYPE_DATE;
            } else {
                t = t_dtype::DTYPE_TIME;
            }
        } else if (jstype == "string") {
            if (apachearrow::parseAsArrowTimestamp(x.as<std::string>())
                != std::nullopt) {
                t = t_dtype::DTYPE_TIME;
            } else {
                std::string lower =
                    x.call<t_val>("toLowerCase").as<std::string>();
                if (lower == "true" || lower == "false") {
                    t = t_dtype::DTYPE_BOOL;
                } else {
                    t = t_dtype::DTYPE_STR;
                }
            }
        }

        return t;
    }

    t_dtype
    get_data_type(t_val data, std::int32_t format, const std::string& name) {
        std::int32_t i = 0;
        boost::optional<t_dtype> inferredType;

        if (format == 0) {
            // loop parameters differ slightly so rewrite the loop
            while (!inferredType.is_initialized() && i < 100
                   && i < data["length"].as<std::int32_t>()) {
                if (data[i].call<t_val>("hasOwnProperty", name).as<bool>()
                    == true) {
                    if (!data[i][name].isNull()) {
                        inferredType = infer_type(data[i][name]);
                    } else {
                        inferredType = t_dtype::DTYPE_STR;
                    }
                }

                i++;
            }
        } else if (format == 1) {
            while (!inferredType.is_initialized() && i < 100
                   && i < data[name]["length"].as<std::int32_t>()) {
                if (!data[name][i].isNull()) {
                    inferredType = infer_type(data[name][i]);
                } else {
                    inferredType = t_dtype::DTYPE_STR;
                }

                i++;
            }
        }

        if (!inferredType.is_initialized()) {
            return t_dtype::DTYPE_STR;
        } else {
            return inferredType.get();
        }
    }

    std::vector<t_dtype>
    get_data_types(
        t_val data, std::int32_t format, const std::vector<std::string>& names
    ) {
        if (names.size() == 0) {
            PSP_COMPLAIN_AND_ABORT(
                "Cannot determine data types without column names!\n"
            );
        }

        std::vector<t_dtype> types;

        if (format == 2) {
            t_val keys =
                t_val::global("Object").template call<t_val>("keys", data);
            std::vector<std::string> data_names =
                vecFromArray<t_val, std::string>(keys);

            for (const std::string& name : data_names) {
                if (name == "__INDEX__") {
                    std::cout << "Warning: __INDEX__ column should not be in "
                                 "the Table schema."
                              << std::endl;
                    continue;
                }
                std::string value = data[name].as<std::string>();
                t_dtype type;

                if (value == "integer") {
                    type = t_dtype::DTYPE_INT32;
                } else if (value == "float") {
                    type = t_dtype::DTYPE_FLOAT64;
                } else if (value == "string") {
                    type = t_dtype::DTYPE_STR;
                } else if (value == "boolean") {
                    type = t_dtype::DTYPE_BOOL;
                } else if (value == "datetime") {
                    type = t_dtype::DTYPE_TIME;
                } else if (value == "date") {
                    type = t_dtype::DTYPE_DATE;
                } else {
                    std::stringstream ss;
                    ss << "Unknown type '" << value << "' for key '" << name
                       << "'" << std::endl;
                    PSP_COMPLAIN_AND_ABORT(ss.str());
                }

                types.push_back(type);
            }

            return types;
        } else {
            for (const std::string& name : names) {
                // infer type for each column
                t_dtype type = get_data_type(data, format, name);
                types.push_back(type);
            }
        }

        return types;
    }

    /******************************************************************************
     *
     * Fill columns with data
     */

    void
    _fill_col_time(
        t_data_accessor accessor,
        std::shared_ptr<t_column> col,
        std::string name,
        std::int32_t cidx,
        t_dtype type,
        bool is_update,
        bool is_limit
    ) {
        t_uindex nrows = col->size();
        for (auto i = 0; i < nrows; ++i) {
            t_val item = accessor.call<t_val>("marshal", cidx, i, type);
            bool is_undefined = item.isUndefined();

            if (is_undefined && !is_limit) {
                continue;
            }

            if (item.isNull() || is_undefined) {
                if (is_update) {
                    col->unset(i);
                } else {
                    col->clear(i);
                }
                continue;
            }

            int64_t out;
            if (val_to_datetime(item, &out)) {
                col->set_nth(i, out);
            } else if (is_update) {
                col->unset(i);
            } else {
                col->clear(i);
            }
        }
    }

    void
    _fill_col_date(
        t_data_accessor accessor,
        std::shared_ptr<t_column> col,
        const std::string& name,
        std::int32_t cidx,
        t_dtype type,
        bool is_update,
        bool is_limit
    ) {
        t_uindex nrows = col->size();
        for (auto i = 0; i < nrows; ++i) {
            t_val item = accessor.call<t_val>("marshal", cidx, i, type);
            bool is_undefined = item.isUndefined();

            if (is_undefined && !is_limit) {
                continue;
            }

            if (item.isNull() || is_undefined) {
                if (is_update) {
                    col->unset(i);
                } else {
                    col->clear(i);
                }
                continue;
            }

            t_date out;
            if (val_to_date(item, &out)) {
                col->set_nth(i, out);
            } else if (is_update) {
                col->unset(i);
            } else {
                col->clear(i);
            }
        }
    }

    void
    _fill_col_bool(
        t_data_accessor accessor,
        std::shared_ptr<t_column> col,
        const std::string& name,
        std::int32_t cidx,
        t_dtype type,
        bool is_update,
        bool is_limit
    ) {
        t_uindex nrows = col->size();
        for (auto i = 0; i < nrows; ++i) {
            t_val item = accessor.call<t_val>("marshal", cidx, i, type);
            bool is_undefined = item.isUndefined();

            if (is_undefined && !is_limit) {
                continue;
            }

            if (item.isNull() || is_undefined) {
                if (is_update) {
                    col->unset(i);
                } else {
                    col->clear(i);
                }
                continue;
            }

            auto elem = item.as<bool>();
            col->set_nth(i, elem);
        }
    }

    void
    _fill_col_string(
        t_data_accessor accessor,
        std::shared_ptr<t_column> col,
        const std::string& name,
        std::int32_t cidx,
        t_dtype type,
        bool is_update,
        bool is_limit
    ) {
        t_uindex nrows = col->size();
        for (auto i = 0; i < nrows; ++i) {
            t_val item = accessor.call<t_val>("marshal", cidx, i, type);
            bool is_undefined = item.isUndefined();

            if (is_undefined && !is_limit) {
                continue;
            }

            if (item.isNull() || is_undefined) {
                if (is_update) {
                    col->unset(i);
                } else {
                    col->clear(i);
                }
                continue;
            }

            col->set_nth(i, item.as<std::string>());
        }
    }

    void
    _fill_col_int64(
        t_data_accessor accessor,
        t_data_table& tbl,
        std::shared_ptr<t_column> col,
        const std::string& name,
        std::int32_t cidx,
        t_dtype type,
        bool is_update,
        bool is_limit
    ) {
        t_uindex nrows = col->size();
        for (auto i = 0; i < nrows; ++i) {
            t_val item = accessor.call<t_val>("marshal", cidx, i, type);
            bool is_undefined = item.isUndefined();

            if (is_undefined && !is_limit) {
                continue;
            }

            if (item.isNull() || is_undefined) {
                if (is_update) {
                    col->unset(i);
                } else {
                    col->clear(i);
                }
                continue;
            }

            double fval = item.as<double>();
            if (!is_update && isnan(fval)) {
                std::cout << "Promoting column `" << name
                          << "` from int64 to string because `" << fval
                          << "` is nan" << std::endl;
                tbl.promote_column(name, DTYPE_STR, i, false);
                col = tbl.get_column(name);
                _fill_col_string(
                    accessor, col, name, cidx, DTYPE_STR, is_update, is_limit
                );
                return;
            } else {
                col->set_nth(i, static_cast<std::int64_t>(fval));
            }
        }
    }

    void
    _fill_col_numeric(
        t_data_accessor accessor,
        t_data_table& tbl,
        std::shared_ptr<t_column> col,
        const std::string& name,
        std::int32_t cidx,
        t_dtype type,
        bool is_update,
        bool is_limit
    ) {
        t_uindex nrows = col->size();
        for (auto i = 0; i < nrows; ++i) {
            t_val item = accessor.call<t_val>("marshal", cidx, i, type);
            bool is_undefined = item.isUndefined();

            if (is_undefined && !is_limit) {
                continue;
            }

            if (item.isNull() || is_undefined) {
                if (is_update) {
                    col->unset(i);
                } else {
                    col->clear(i);
                }
                continue;
            }

            switch (type) {
                case DTYPE_INT8: {
                    col->set_nth(i, item.as<std::int8_t>());
                } break;
                case DTYPE_INT16: {
                    col->set_nth(i, item.as<std::int16_t>());
                } break;
                case DTYPE_INT32: {
                    // This handles cases where a long sequence of e.g. 0
                    // precedes a clearly float value in an inferred column.
                    // Would not be needed if the type inference checked the
                    // entire column/we could reset parsing.
                    double fval = item.as<double>();
                    if (!is_update
                        && (fval > 2147483647 || fval < -2147483648)) {
                        std::cout << "Promoting to float" << std::endl;
                        tbl.promote_column(name, DTYPE_FLOAT64, i, true);
                        col = tbl.get_column(name);
                        type = DTYPE_FLOAT64;
                        col->set_nth(i, fval);
                    } else if (!is_update && isnan(fval)) {
                        std::cout << "Promoting column `" << name
                                  << "` from int32 to string because `" << fval
                                  << "` is nan" << std::endl;
                        tbl.promote_column(name, DTYPE_STR, i, false);
                        col = tbl.get_column(name);
                        _fill_col_string(
                            accessor,
                            col,
                            name,
                            cidx,
                            DTYPE_STR,
                            is_update,
                            is_limit
                        );
                        return;
                    } else {
                        col->set_nth(i, static_cast<std::int32_t>(fval));
                    }
                } break;
                case DTYPE_FLOAT32: {
                    col->set_nth(i, item.as<float>());
                } break;
                case DTYPE_FLOAT64: {
                    col->set_nth(i, item.as<double>());
                } break;
                default:
                    break;
            }
        }
    }

    template <>
    void
    set_column_nth(std::shared_ptr<t_column> col, t_uindex idx, t_val value) {

        // Check if the value is a javascript null
        if (value.isNull()) {
            col->unset(idx);
            return;
        }

        switch (col->get_dtype()) {
            case DTYPE_BOOL: {
                col->set_nth<bool>(idx, value.as<bool>(), STATUS_VALID);
                break;
            }
            case DTYPE_FLOAT64: {
                col->set_nth<double>(idx, value.as<double>(), STATUS_VALID);
                break;
            }
            case DTYPE_FLOAT32: {
                col->set_nth<float>(idx, value.as<float>(), STATUS_VALID);
                break;
            }
            case DTYPE_UINT32: {
                col->set_nth<std::uint32_t>(
                    idx, value.as<std::uint32_t>(), STATUS_VALID
                );
                break;
            }
            case DTYPE_UINT64: {
                col->set_nth<std::uint64_t>(
                    idx, value.as<std::uint64_t>(), STATUS_VALID
                );
                break;
            }
            case DTYPE_INT32: {
                col->set_nth<std::int32_t>(
                    idx, value.as<std::int32_t>(), STATUS_VALID
                );
                break;
            }
            case DTYPE_INT64: {
                col->set_nth<std::int64_t>(
                    idx, value.as<std::int64_t>(), STATUS_VALID
                );
                break;
            }
            case DTYPE_STR: {
                col->set_nth(idx, value.as<std::string>(), STATUS_VALID);
                break;
            }
            case DTYPE_DATE: {
                col->set_nth<t_date>(
                    idx, jsdate_to_t_date(value), STATUS_VALID
                );
                break;
            }
            case DTYPE_TIME: {
                auto elem = static_cast<std::int64_t>(
                    value.call<t_val>("getTime").as<double>()
                ); // dcol[i].as<T>();
                col->set_nth(idx, elem, STATUS_VALID);
                break;
            }
            case DTYPE_UINT8:
            case DTYPE_UINT16:
            case DTYPE_INT8:
            case DTYPE_INT16:
            default: {
                // Other types not implemented
            }
        }
    }

    /******************************************************************************
     *
     * Fill tables with data
     */
    void
    _fill_data_helper(
        t_data_accessor accessor,
        t_data_table& tbl,
        std::shared_ptr<t_column> col,
        const std::string& name,
        std::int32_t cidx,
        t_dtype type,
        bool is_update,
        bool is_limit
    ) {
        switch (type) {
            case DTYPE_INT64: {
                _fill_col_int64(
                    accessor, tbl, col, name, cidx, type, is_update, is_limit
                );
            } break;
            case DTYPE_BOOL: {
                _fill_col_bool(
                    accessor, col, name, cidx, type, is_update, is_limit
                );
            } break;
            case DTYPE_DATE: {
                _fill_col_date(
                    accessor, col, name, cidx, type, is_update, is_limit
                );
            } break;
            case DTYPE_TIME: {
                _fill_col_time(
                    accessor, col, name, cidx, type, is_update, is_limit
                );
            } break;
            case DTYPE_STR: {
                _fill_col_string(
                    accessor, col, name, cidx, type, is_update, is_limit
                );
            } break;
            case DTYPE_NONE: {
                break;
            }
            default:
                _fill_col_numeric(
                    accessor, tbl, col, name, cidx, type, is_update, is_limit
                );
        }
    }

    void
    _fill_data(
        t_data_table& tbl,
        t_data_accessor dcol,
        const t_schema& input_schema,
        const std::string& index,
        std::uint32_t offset,
        std::uint32_t limit,
        bool is_update
    ) {
        bool implicit_index = false;
        bool is_limit = limit != UINT32_MAX;
        std::vector<std::string> col_names(input_schema.columns());
        std::vector<t_dtype> data_types(input_schema.types());

        for (auto cidx = 0; cidx < col_names.size(); ++cidx) {
            auto name = col_names[cidx];
            auto type = data_types[cidx];

            if (name == "__INDEX__") {
                implicit_index = true;
                std::shared_ptr<t_column> pkey_col_sptr =
                    tbl.add_column_sptr("psp_pkey", type, true);
                _fill_data_helper(
                    dcol,
                    tbl,
                    pkey_col_sptr,
                    "psp_pkey",
                    cidx,
                    type,
                    is_update,
                    is_limit
                );
                tbl.clone_column("psp_pkey", "psp_okey");
                continue;
            }

            auto col = tbl.get_column(name);
            _fill_data_helper(
                dcol, tbl, col, name, cidx, type, is_update, is_limit
            );
        }

        // Fill index column - recreated every time a `t_data_table` is created.
        if (!implicit_index) {
            if (index == "") {
                // Use row number as index if not explicitly provided or
                // provided with `__INDEX__`
                auto key_col = tbl.add_column("psp_pkey", DTYPE_INT32, true);
                auto okey_col = tbl.add_column("psp_okey", DTYPE_INT32, true);

                for (std::uint32_t ridx = 0; ridx < tbl.size(); ++ridx) {
                    key_col->set_nth<std::int32_t>(
                        ridx, (ridx + offset) % limit
                    );
                    okey_col->set_nth<std::int32_t>(
                        ridx, (ridx + offset) % limit
                    );
                }
            } else {
                tbl.clone_column(index, "psp_pkey");
                tbl.clone_column(index, "psp_okey");
            }
        }
    }

    /******************************************************************************
     *
     * Table API
     */

    template <>
    std::shared_ptr<Table>
    make_table(
        t_val table,
        t_data_accessor accessor,
        std::uint32_t limit,
        const std::string& index,
        t_op op,
        bool is_update,
        bool is_arrow,
        bool is_csv,
        t_uindex port_id
    ) {
        bool table_initialized = has_value(table);
        std::shared_ptr<t_pool> pool;
        std::shared_ptr<Table> tbl;
        std::shared_ptr<t_gnode> gnode;
        std::uint32_t offset;

        // If the Table has already been created, use it
        if (table_initialized) {
            tbl = table.as<std::shared_ptr<Table>>();
            pool = tbl->get_pool();
            gnode = tbl->get_gnode();
            offset = tbl->get_offset();
            is_update = (is_update || gnode->mapping_size() > 0);
        }

        std::vector<std::string> column_names;
        std::vector<t_dtype> data_types;
        apachearrow::ArrowLoader arrow_loader;
        std::uintptr_t ptr;

        // Determine metadata
        bool is_delete = op == OP_DELETE;

        if (is_arrow && !is_delete) {
            if (is_csv) {
                std::string s = accessor.as<std::string>();
                auto map = std::unordered_map<
                    std::string,
                    std::shared_ptr<arrow::DataType>>();
                if (is_update) {
                    auto gnode_output_schema = gnode->get_output_schema();
                    auto schema = gnode_output_schema.drop({"psp_okey"});
                    auto column_names = schema.columns();
                    auto data_types = schema.types();

                    for (auto idx = 0; idx < column_names.size(); ++idx) {
                        const std::string& name = column_names[idx];
                        const t_dtype& type = data_types[idx];
                        switch (type) {
                            case DTYPE_FLOAT32:
                                map[name] =
                                    std::make_shared<arrow::FloatType>();
                                break;
                            case DTYPE_FLOAT64:
                                map[name] =
                                    std::make_shared<arrow::DoubleType>();
                                break;
                            case DTYPE_STR:
                                map[name] =
                                    std::make_shared<arrow::StringType>();
                                break;
                            case DTYPE_BOOL:
                                map[name] =
                                    std::make_shared<arrow::BooleanType>();
                                break;
                            case DTYPE_UINT32:
                                map[name] =
                                    std::make_shared<arrow::UInt32Type>();
                                break;
                            case DTYPE_UINT64:
                                map[name] =
                                    std::make_shared<arrow::UInt64Type>();
                                break;
                            case DTYPE_INT32:
                                map[name] =
                                    std::make_shared<arrow::Int32Type>();
                                break;
                            case DTYPE_INT64:
                                map[name] =
                                    std::make_shared<arrow::Int64Type>();
                                break;
                            case DTYPE_TIME:
                                map[name] =
                                    std::make_shared<arrow::TimestampType>();
                                break;
                            case DTYPE_DATE:
                                map[name] =
                                    std::make_shared<arrow::Date64Type>();
                                break;
                            default:
                                std::stringstream ss;
                                ss << "Error loading arrow type "
                                   << dtype_to_str(type) << " for column "
                                   << name << std::endl;
                                PSP_COMPLAIN_AND_ABORT(ss.str())
                                break;
                        }
                    }
                }
                arrow_loader.init_csv(s, is_update, map);
            } else {
                t_val constructor = accessor["constructor"];
                std::int32_t length = accessor["byteLength"].as<std::int32_t>();

                // Allocate memory
                ptr = reinterpret_cast<std::uintptr_t>(malloc(length));
                if (ptr == NULL) {
                    std::cout << "Unable to load arrow of size 0" << std::endl;
                    return nullptr;
                }

                // Write to the C++ heap where we allocated the space
                t_val memory = t_val::module_property("HEAP8")["buffer"];
                t_val memoryView = constructor.new_(memory, ptr, length);
                memoryView.call<void>("set", accessor);

                // Parse the arrow and get its metadata
                arrow_loader.initialize(ptr, length);
            }

            // Always use the `Table` column names and data types on update
            if (table_initialized && is_update) {
                auto gnode_output_schema = gnode->get_output_schema();
                auto schema = gnode_output_schema.drop({"psp_okey"});
                column_names = schema.columns();
                data_types = schema.types();

                auto data_table = gnode->get_table();
                if (data_table->size() == 0) {
                    /**
                     * If updating a table created from schema, a 32-bit
                     * int/float needs to be promoted to a 64-bit int/float if
                     * specified in the Arrow schema.
                     */
                    std::vector<t_dtype> arrow_dtypes = arrow_loader.types();
                    for (auto idx = 0; idx < column_names.size(); ++idx) {
                        const std::string& name = column_names[idx];
                        // Do not promote columns which are used as the index,
                        // or if they are internal columns.
                        bool can_retype = name != index && name != "psp_okey"
                            && name != "psp_pkey" && name != "psp_op";
                        bool is_32_bit = data_types[idx] == DTYPE_INT32
                            || data_types[idx] == DTYPE_FLOAT32;
                        if (can_retype && is_32_bit) {
                            t_dtype arrow_dtype = arrow_dtypes[idx];
                            switch (arrow_dtype) {
                                case DTYPE_INT64:
                                case DTYPE_FLOAT64: {
                                    std::cout << "Promoting column `"
                                              << column_names[idx]
                                              << "` to maintain consistency "
                                                 "with Arrow type."
                                              << std::endl;
                                    gnode->promote_column(name, arrow_dtype);
                                } break;
                                default: {
                                    continue;
                                }
                            }
                        }
                    }

                    // Updated data types need to reflect in new data table
                    auto new_schema =
                        gnode->get_output_schema().drop({"psp_okey"});
                    data_types = new_schema.types();
                }
            } else {
                column_names = arrow_loader.names();
                data_types = arrow_loader.types();
            }
        } else if (is_update || is_delete) {
            t_val names = accessor["names"];
            t_val types = accessor["types"];
            column_names = vecFromArray<t_val, std::string>(names);
            data_types = vecFromArray<t_val, t_dtype>(types);
        } else {
            // Infer names and types
            t_val data = accessor["data"];
            std::int32_t format = accessor["format"].as<std::int32_t>();
            column_names = get_column_names(data, format);
            data_types = get_data_types(data, format, column_names);
        }

        if (!table_initialized) {
            std::shared_ptr<t_pool> pool = std::make_shared<t_pool>();
            tbl = std::make_shared<Table>(
                pool, column_names, data_types, limit, index
            );
            offset = 0;
        }

        // Create input schema - an input schema contains all columns to be
        // displayed, as well as `__INDEX__` column
        t_schema input_schema(column_names, data_types);

        // strip implicit index, if present
        auto implicit_index_it =
            std::find(column_names.begin(), column_names.end(), "__INDEX__");

        if (implicit_index_it != column_names.end()) {
            auto idx = std::distance(column_names.begin(), implicit_index_it);
            // position of the column is at the same index in both vectors
            column_names.erase(column_names.begin() + idx);
            data_types.erase(data_types.begin() + idx);
        }

        // Create output schema - contains only columns to be displayed to the
        // user, as names and types may have been mutated after implicit
        // index removal.
        t_schema output_schema(column_names, data_types);

        std::uint32_t row_count = 0;
        if (is_arrow) {
            row_count = arrow_loader.row_count();
        } else {
            row_count = accessor["row_count"].as<std::int32_t>();
        }

        t_data_table data_table(output_schema);
        data_table.init();
        data_table.extend(row_count);

        if (is_arrow) {
            arrow_loader.fill_table(
                data_table, input_schema, index, offset, limit, is_update
            );
        } else {
            _fill_data(
                data_table,
                accessor,
                input_schema,
                index,
                offset,
                limit,
                is_update
            );
        }

        if (is_arrow && !is_csv) {
            free((void*)ptr);
        }

        // calculate offset, limit, and set the gnode
        tbl->init(data_table, row_count, op, port_id);
        return tbl;
    }

    /******************************************************************************
     *
     * View API
     */

    template <>
    bool
    is_valid_filter(
        t_dtype column_type,
        t_val date_parser,
        t_filter_op filter_operator,
        t_val filter_term
    ) {
        if (filter_operator == t_filter_op::FILTER_OP_IS_NULL
            || filter_operator == t_filter_op::FILTER_OP_IS_NOT_NULL) {
            return true;
        } else if (column_type == DTYPE_DATE || column_type == DTYPE_TIME) {
            if (filter_term.typeOf().as<std::string>().compare("string") == 0) {
                return has_value(filter_term)
                    && apachearrow::parseAsArrowTimestamp(
                           filter_term.as<std::string>()
                       )
                    != std::nullopt;
            } else {
                return has_value(filter_term);
            }
        } else {
            return has_value(filter_term);
        }
    };

    template <>
    std::tuple<std::string, std::string, std::vector<t_tscalar>>
    make_filter_term(
        t_dtype column_type,
        t_val date_parser,
        const std::string& column_name,
        const std::string& filter_op_str,
        t_val filter_term
    ) {
        t_filter_op filter_op = str_to_filter_op(filter_op_str);
        std::vector<t_tscalar> terms;

        switch (filter_op) {
            case FILTER_OP_NOT_IN:
            case FILTER_OP_IN: {
                std::vector<std::string> filter_terms =
                    vecFromArray<t_val, std::string>(filter_term);
                for (auto term : filter_terms) {
                    terms.push_back(mktscalar(get_interned_cstr(term.c_str())));
                }
            } break;
            case FILTER_OP_IS_NULL:
            case FILTER_OP_IS_NOT_NULL: {
                terms.push_back(mktscalar(0));
            } break;
            default: {
                switch (column_type) {
                    case DTYPE_INT32: {
                        terms.push_back(mktscalar(filter_term.as<std::int32_t>()
                        ));
                    } break;
                    case DTYPE_INT64:
                    case DTYPE_FLOAT64: {
                        terms.push_back(mktscalar(filter_term.as<double>()));
                    } break;
                    case DTYPE_BOOL: {
                        terms.push_back(mktscalar(filter_term.as<bool>()));
                    } break;
                    case DTYPE_DATE: {
                        t_date out;
                        if (val_to_date(filter_term, &out)) {
                            terms.push_back(mktscalar(out));
                        } else {
                            terms.push_back(mknone());
                        }
                    } break;
                    case DTYPE_TIME: {
                        int64_t out;
                        if (val_to_datetime(filter_term, &out)) {
                            terms.push_back(mktscalar(t_time(out)));
                        } else {
                            terms.push_back(mknone());
                        }
                    } break;
                    default: {
                        terms.push_back(mktscalar(get_interned_cstr(
                            filter_term.as<std::string>().c_str()
                        )));
                    }
                }
            }
        }

        return std::make_tuple(column_name, filter_op_str, terms);
    }

    template <>
    std::shared_ptr<t_view_config>
    make_view_config(
        const t_gnode& gnode,
        std::shared_ptr<t_schema> schema,
        t_val date_parser,
        t_val config
    ) {
        // extract vectors from JS, where they were created
        auto row_pivots = config.call<std::vector<std::string>>("get_group_by");
        auto column_pivots =
            config.call<std::vector<std::string>>("get_split_by");
        auto columns = config.call<std::vector<std::string>>("get_columns");
        auto sort =
            config.call<std::vector<std::vector<std::string>>>("get_sort");
        auto filter_op = config["filter_op"].as<std::string>();

        // aggregates require manual parsing - std::maps read from JS are empty
        t_val j_aggregate_keys =
            t_val::global("Object").call<t_val>("keys", config["aggregates"]);
        auto aggregate_names =
            vecFromArray<t_val, std::string>(j_aggregate_keys);

        tsl::ordered_map<std::string, std::vector<std::string>> aggregates;
        for (const auto& name : aggregate_names) {
            t_val val = config["aggregates"][name];
            bool is_array = t_val::global("Array").call<bool>("isArray", val);
            if (is_array) {
                auto agg = vecFromArray<t_val, std::string>(val);
                aggregates[name] = agg;
            } else {
                std::vector<std::string> agg{val.as<std::string>()};
                aggregates[name] = agg;
            }
        };

        bool column_only = false;

        // make sure that primary keys are created for column-only views
        if (row_pivots.size() == 0 && column_pivots.size() > 0) {
            row_pivots.push_back("psp_okey");
            column_only = true;
        }

        auto js_expressions =
            config.call<std::vector<std::vector<t_val>>>("get_expressions");
        std::vector<std::shared_ptr<t_computed_expression>> expressions;
        expressions.reserve(js_expressions.size());

        t_expression_vocab& expression_vocab = *(gnode.get_expression_vocab());
        t_regex_mapping& regex_mapping =
            *(gnode.get_expression_regex_mapping());

        // Will either abort() or succeed completely, and this isn't a public
        // API so we can directly index for speed.
        for (t_uindex idx = 0; idx < js_expressions.size(); ++idx) {
            const auto& expr = js_expressions[idx];
            std::string expression_alias = expr[0].as<std::string>();
            std::string expression_string = expr[1].as<std::string>();
            std::string parsed_expression_string = expr[2].as<std::string>();
            std::vector<std::pair<std::string, std::string>> column_ids;

            // Don't allow overwriting of "real" table columns or multiple
            // columns with the same alias.
            if (schema->has_column(expression_alias)) {
                std::stringstream ss;
                ss << "View creation failed: cannot create expression column '"
                   << expression_alias
                   << "' that overwrites a column that already exists."
                   << std::endl;
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }

            // Read the Javascript map of column IDs to column names, and
            // convert them into string pairs. This guarantees iteration
            // order at the cost of constant time access (which we don't use).
            t_val j_column_id_keys =
                t_val::global("Object").call<t_val>("keys", expr[3]);
            auto column_id_keys =
                vecFromArray<t_val, std::string>(j_column_id_keys);
            column_ids.resize(column_id_keys.size());

            for (t_uindex cidx = 0; cidx < column_id_keys.size(); ++cidx) {
                const std::string& column_id = column_id_keys[cidx];
                column_ids[cidx] = std::pair<std::string, std::string>(
                    column_id, expr[3][column_id].as<std::string>()
                );
            }

            // If the expression cannot be parsed, it will abort() here.
            std::shared_ptr<t_computed_expression> expression =
                t_computed_expression_parser::precompute(
                    expression_alias,
                    expression_string,
                    parsed_expression_string,
                    column_ids,
                    gnode.get_table_sptr(),
                    gnode.get_pkey_map(),
                    schema,
                    expression_vocab,
                    regex_mapping
                );

            schema->add_column(expression_alias, expression->get_dtype());
            expressions.push_back(expression);
        }

        // construct filters with filter terms, and fill the vector of tuples
        auto js_filter =
            config.call<std::vector<std::vector<t_val>>>("get_filter");
        std::vector<
            std::tuple<std::string, std::string, std::vector<t_tscalar>>>
            filter;

        for (auto f : js_filter) {
            // parse filter details
            std::string column_name = f.at(0).as<std::string>();
            std::string filter_op_str = f.at(1).as<std::string>();
            t_dtype column_type = schema->get_dtype(column_name);
            t_filter_op filter_operator = str_to_filter_op(filter_op_str);

            // validate the filter before it goes into the core engine
            t_val filter_term = t_val::null();
            if (f.size() > 2) {
                // null/not null filters do not have a filter term
                filter_term = f.at(2);
            }

            if (is_valid_filter(
                    column_type, date_parser, filter_operator, filter_term
                )) {
                filter.push_back(make_filter_term(
                    column_type,
                    date_parser,
                    column_name,
                    filter_op_str,
                    filter_term
                ));
            }
        }

        // create the `t_view_config`
        auto view_config = std::make_shared<t_view_config>(
            row_pivots,
            column_pivots,
            aggregates,
            columns,
            filter,
            sort,
            expressions,
            filter_op,
            column_only
        );

        // transform primitive values into abstractions that the engine can use
        view_config->init(schema);

        // set pivot depths if provided
        if (has_value(config["group_by_depth"])) {
            view_config->set_row_pivot_depth(
                config["group_by_depth"].as<std::int32_t>()
            );
        }

        if (has_value(config["split_by_depth"])) {
            view_config->set_column_pivot_depth(
                config["split_by_depth"].as<std::int32_t>()
            );
        }

        return view_config;
    }

    template <typename CTX_T>
    std::shared_ptr<View<CTX_T>>
    make_view(
        std::shared_ptr<Table> table,
        const std::string& name,
        const std::string& separator,
        t_val view_config,
        t_val date_parser
    ) {
        // Use a copy of the table schema that we can freely mutate during
        // `make_view_config`.
        std::shared_ptr<t_schema> schema =
            std::make_shared<t_schema>(table->get_schema());

        // Pass the gnode into `make_view_config` so we can use its vocab to
        // validate expressions.
        const t_gnode& gnode = *(table->get_gnode());

        std::shared_ptr<t_view_config> config =
            make_view_config<t_val>(gnode, schema, date_parser, view_config);

        auto ctx = make_context<CTX_T>(table, schema, config, name);

        auto view_ptr =
            std::make_shared<View<CTX_T>>(table, ctx, name, separator, config);

        return view_ptr;
    }

    /******************************************************************************
     *
     * Context API
     */
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
        auto ctx_unit = std::make_shared<t_ctxunit>(*(schema.get()), cfg);
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
        auto ctx0 = std::make_shared<t_ctx0>(*(schema.get()), cfg);
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

        auto cfg =
            t_config(row_pivots, aggspecs, fterm, filter_op, expressions);
        auto ctx1 = std::make_shared<t_ctx1>(*(schema.get()), cfg);

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

        t_totals total = sortspec.size() > 0 ? TOTALS_BEFORE : TOTALS_HIDDEN;

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
        auto ctx2 = std::make_shared<t_ctx2>(*(schema.get()), cfg);

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

        if (sortspec.size() > 0) {
            ctx2->sort_by(sortspec);
        }

        if (col_sortspec.size() > 0) {
            ctx2->column_sort_by(col_sortspec);
        }

        return ctx2;
    }

    /******************************************************************************
     *
     * Expression Metadata
     */

    template <>
    t_validated_expression_map
    validate_expressions(
        std::shared_ptr<Table> table,
        const std::vector<std::vector<t_val>>& j_expressions
    ) {
        // Don't create a expression object - just pass the values as a
        // tuple for validation.
        std::vector<std::tuple<
            std::string,
            std::string,
            std::string,
            std::vector<std::pair<std::string, std::string>>>>
            expressions;
        expressions.resize(j_expressions.size());

        // Convert from vector of t_val into vector of tuples
        for (t_uindex idx = 0; idx < j_expressions.size(); ++idx) {
            const auto& expr = j_expressions[idx];
            std::string expression_alias = expr[0].as<std::string>();
            std::string expression_string = expr[1].as<std::string>();
            std::string parsed_expression_string = expr[2].as<std::string>();
            std::vector<std::pair<std::string, std::string>> column_ids;

            // Read the Javascript map of column IDs to column names, and
            // convert them into string pairs. This guarantees iteration
            // order at the cost of constant time access (which we don't use).
            t_val j_column_id_keys =
                t_val::global("Object").call<t_val>("keys", expr[3]);
            auto column_id_keys =
                vecFromArray<t_val, std::string>(j_column_id_keys);
            column_ids.resize(column_id_keys.size());

            for (t_uindex cidx = 0; cidx < column_id_keys.size(); ++cidx) {
                const std::string& column_id = column_id_keys[cidx];
                column_ids[cidx] = std::pair<std::string, std::string>(
                    column_id, expr[3][column_id].as<std::string>()
                );
            }

            auto tp = std::make_tuple(
                expression_alias,
                expression_string,
                parsed_expression_string,
                column_ids
            );

            expressions[idx] = tp;
        }

        return table->validate_expressions(expressions);
    };

    /******************************************************************************
     *
     * Data serialization
     */

    template <>
    t_val
    get_column_data(
        std::shared_ptr<t_data_table> table, const std::string& colname
    ) {
        t_val arr = t_val::array();
        auto col = table->get_column(colname);
        for (auto idx = 0; idx < col->size(); ++idx) {
            arr.set(idx, scalar_to_val(col->get_scalar(idx)));
        }
        return arr;
    }

    template <typename CTX_T>
    std::shared_ptr<t_data_slice<CTX_T>>
    get_data_slice(
        std::shared_ptr<View<CTX_T>> view,
        std::uint32_t start_row,
        std::uint32_t end_row,
        std::uint32_t start_col,
        std::uint32_t end_col
    ) {
        auto data_slice =
            view->get_data(start_row, end_row, start_col, end_col);
        return data_slice;
    }

    template <typename CTX_T>
    t_val
    get_from_data_slice(
        std::shared_ptr<t_data_slice<CTX_T>> data_slice,
        t_uindex ridx,
        t_uindex cidx
    ) {
        auto d = data_slice->get(ridx, cidx);
        return scalar_to_val(d);
    }

    template <typename CTX_T>
    t_val
    get_min_max(std::shared_ptr<View<CTX_T>> view, const std::string& colname) {
        t_val arr = t_val::array();
        std::pair<t_tscalar, t_tscalar> min_max = view->get_min_max(colname);
        arr.set(0, scalar_to_val(min_max.first));
        arr.set(1, scalar_to_val(min_max.second));
        return arr;
    }

} // end namespace binding
} // end namespace perspective

using namespace perspective::binding;

/******************************************************************************
 *
 * Embind
 */

EMSCRIPTEN_BINDINGS(perspective) {
    /******************************************************************************
     *
     * Table
     */
    class_<Table>("Table")
        .constructor<
            std::shared_ptr<t_pool>,
            const std::vector<std::string>&,
            const std::vector<t_dtype>&,
            std::uint32_t,
            const std::string&>()
        .smart_ptr<std::shared_ptr<Table>>("shared_ptr<Table>")
        .function("size", &Table::size)
        .function("get_schema", &Table::get_schema)
        .function("unregister_gnode", &Table::unregister_gnode)
        .function("reset_gnode", &Table::reset_gnode)
        .function("make_port", &Table::make_port)
        .function("remove_port", &Table::remove_port)
        .function("get_id", &Table::get_id)
        .function("get_pool", &Table::get_pool)
        .function("get_gnode", &Table::get_gnode);
    /******************************************************************************
     *
     * View
     */
    // Bind a View for each context type
    class_<View<t_ctxunit>>("View_ctxunit")
        .constructor<
            std::shared_ptr<Table>,
            std::shared_ptr<t_ctxunit>,
            const std::string&,
            const std::string&,
            std::shared_ptr<t_view_config>>()
        .smart_ptr<std::shared_ptr<View<t_ctxunit>>>("shared_ptr<View_ctxunit>")
        .function("sides", &View<t_ctxunit>::sides)
        .function("num_rows", &View<t_ctxunit>::num_rows)
        .function("num_columns", &View<t_ctxunit>::num_columns)
        .function("get_row_expanded", &View<t_ctxunit>::get_row_expanded)
        .function("schema", &View<t_ctxunit>::schema)
        .function("expression_schema", &View<t_ctxunit>::expression_schema)
        .function("column_names", &View<t_ctxunit>::column_names)
        .function("column_paths", &View<t_ctxunit>::column_paths_string)
        .function("_get_deltas_enabled", &View<t_ctxunit>::_get_deltas_enabled)
        .function("_set_deltas_enabled", &View<t_ctxunit>::_set_deltas_enabled)
        .function(
            "get_context", &View<t_ctxunit>::get_context, allow_raw_pointers()
        )
        .function("get_row_pivots", &View<t_ctxunit>::get_row_pivots)
        .function("get_column_pivots", &View<t_ctxunit>::get_column_pivots)
        .function("get_aggregates", &View<t_ctxunit>::get_aggregates)
        .function("get_filter", &View<t_ctxunit>::get_filter)
        .function("get_sort", &View<t_ctxunit>::get_sort)
        .function("get_step_delta", &View<t_ctxunit>::get_step_delta)
        .function("get_column_dtype", &View<t_ctxunit>::get_column_dtype)
        .function("is_column_only", &View<t_ctxunit>::is_column_only)
        .function("to_columns", &View<t_ctxunit>::to_columns);

    class_<View<t_ctx0>>("View_ctx0")
        .constructor<
            std::shared_ptr<Table>,
            std::shared_ptr<t_ctx0>,
            const std::string&,
            const std::string&,
            std::shared_ptr<t_view_config>>()
        .smart_ptr<std::shared_ptr<View<t_ctx0>>>("shared_ptr<View_ctx0>")
        .function("sides", &View<t_ctx0>::sides)
        .function("num_rows", &View<t_ctx0>::num_rows)
        .function("num_columns", &View<t_ctx0>::num_columns)
        .function("get_row_expanded", &View<t_ctx0>::get_row_expanded)
        .function("schema", &View<t_ctx0>::schema)
        .function("expression_schema", &View<t_ctx0>::expression_schema)
        .function("column_names", &View<t_ctx0>::column_names)
        .function("column_paths", &View<t_ctx0>::column_paths_string)
        .function("_get_deltas_enabled", &View<t_ctx0>::_get_deltas_enabled)
        .function("_set_deltas_enabled", &View<t_ctx0>::_set_deltas_enabled)
        .function(
            "get_context", &View<t_ctx0>::get_context, allow_raw_pointers()
        )
        .function("get_row_pivots", &View<t_ctx0>::get_row_pivots)
        .function("get_column_pivots", &View<t_ctx0>::get_column_pivots)
        .function("get_aggregates", &View<t_ctx0>::get_aggregates)
        .function("get_filter", &View<t_ctx0>::get_filter)
        .function("get_sort", &View<t_ctx0>::get_sort)
        .function("get_step_delta", &View<t_ctx0>::get_step_delta)
        .function("get_column_dtype", &View<t_ctx0>::get_column_dtype)
        .function("is_column_only", &View<t_ctx0>::is_column_only)
        .function("to_columns", &View<t_ctx0>::to_columns);
    ;

    class_<View<t_ctx1>>("View_ctx1")
        .constructor<
            std::shared_ptr<Table>,
            std::shared_ptr<t_ctx1>,
            const std::string&,
            const std::string&,
            std::shared_ptr<t_view_config>>()
        .smart_ptr<std::shared_ptr<View<t_ctx1>>>("shared_ptr<View_ctx1>")
        .function("sides", &View<t_ctx1>::sides)
        .function("num_rows", &View<t_ctx1>::num_rows)
        .function("num_columns", &View<t_ctx1>::num_columns)
        .function("get_row_expanded", &View<t_ctx1>::get_row_expanded)
        .function("expand", &View<t_ctx1>::expand)
        .function("collapse", &View<t_ctx1>::collapse)
        .function("set_depth", &View<t_ctx1>::set_depth)
        .function("schema", &View<t_ctx1>::schema)
        .function("expression_schema", &View<t_ctx1>::expression_schema)
        .function("column_names", &View<t_ctx1>::column_names)
        .function("column_paths", &View<t_ctx1>::column_paths_string)
        .function("_get_deltas_enabled", &View<t_ctx1>::_get_deltas_enabled)
        .function("_set_deltas_enabled", &View<t_ctx1>::_set_deltas_enabled)
        .function(
            "get_context", &View<t_ctx1>::get_context, allow_raw_pointers()
        )
        .function("get_row_pivots", &View<t_ctx1>::get_row_pivots)
        .function("get_column_pivots", &View<t_ctx1>::get_column_pivots)
        .function("get_aggregates", &View<t_ctx1>::get_aggregates)
        .function("get_filter", &View<t_ctx1>::get_filter)
        .function("get_sort", &View<t_ctx1>::get_sort)
        .function("get_step_delta", &View<t_ctx1>::get_step_delta)
        .function("get_column_dtype", &View<t_ctx1>::get_column_dtype)
        .function("is_column_only", &View<t_ctx1>::is_column_only)
        .function("to_columns", &View<t_ctx1>::to_columns);

    class_<View<t_ctx2>>("View_ctx2")
        .constructor<
            std::shared_ptr<Table>,
            std::shared_ptr<t_ctx2>,
            const std::string&,
            const std::string&,
            std::shared_ptr<t_view_config>>()
        .smart_ptr<std::shared_ptr<View<t_ctx2>>>("shared_ptr<View_ctx2>")
        .function("sides", &View<t_ctx2>::sides)
        .function("num_rows", &View<t_ctx2>::num_rows)
        .function("num_columns", &View<t_ctx2>::num_columns)
        .function("get_row_expanded", &View<t_ctx2>::get_row_expanded)
        .function("expand", &View<t_ctx2>::expand)
        .function("collapse", &View<t_ctx2>::collapse)
        .function("set_depth", &View<t_ctx2>::set_depth)
        .function("schema", &View<t_ctx2>::schema)
        .function("expression_schema", &View<t_ctx2>::expression_schema)
        .function("column_names", &View<t_ctx2>::column_names)
        .function("column_paths", &View<t_ctx2>::column_paths_string)
        .function("_get_deltas_enabled", &View<t_ctx2>::_get_deltas_enabled)
        .function("_set_deltas_enabled", &View<t_ctx2>::_set_deltas_enabled)
        .function(
            "get_context", &View<t_ctx2>::get_context, allow_raw_pointers()
        )
        .function("get_row_pivots", &View<t_ctx2>::get_row_pivots)
        .function("get_column_pivots", &View<t_ctx2>::get_column_pivots)
        .function("get_aggregates", &View<t_ctx2>::get_aggregates)
        .function("get_filter", &View<t_ctx2>::get_filter)
        .function("get_sort", &View<t_ctx2>::get_sort)
        .function("get_row_path", &View<t_ctx2>::get_row_path)
        .function("get_step_delta", &View<t_ctx2>::get_step_delta)
        .function("get_column_dtype", &View<t_ctx2>::get_column_dtype)
        .function("is_column_only", &View<t_ctx2>::is_column_only)
        .function("to_columns", &View<t_ctx2>::to_columns);

    /******************************************************************************
     *
     * t_view_config
     */
    class_<t_view_config>("t_view_config")
        .constructor<
            const std::vector<std::string>&,
            const std::vector<std::string>&,
            const tsl::ordered_map<std::string, std::vector<std::string>>&,
            const std::vector<std::string>&,
            const std::vector<
                std::tuple<std::string, std::string, std::vector<t_tscalar>>>&,
            const std::vector<std::vector<std::string>>&,
            const std::vector<std::shared_ptr<t_computed_expression>>&,
            const std::string,
            bool>()
        .smart_ptr<std::shared_ptr<t_view_config>>("shared_ptr<t_view_config>")
        .function("add_filter_term", &t_view_config::add_filter_term);

    /******************************************************************************
     *
     * t_data_table
     */
    class_<t_data_table>("t_data_table")
        .smart_ptr<std::shared_ptr<t_data_table>>("shared_ptr<t_data_table>")
        .function(
            "size",
            reinterpret_cast<unsigned long (t_data_table::*)() const>(
                &t_data_table::size
            )
        );

    /******************************************************************************
     *
     * t_schema
     */
    class_<t_schema>("t_schema")
        .function("columns", &t_schema::columns, allow_raw_pointers())
        .function("types", &t_schema::types, allow_raw_pointers());

    /******************************************************************************
     *
     * t_gnode
     */
    class_<t_gnode>("t_gnode")
        .smart_ptr<std::shared_ptr<t_gnode>>("shared_ptr<t_gnode>")
        .function(
            "get_id",
            reinterpret_cast<t_uindex (t_gnode::*)() const>(&t_gnode::get_id)
        );

    /******************************************************************************
     *
     * t_data_slice
     */
    class_<t_data_slice<t_ctxunit>>("t_data_slice_ctxunit")
        .smart_ptr<std::shared_ptr<t_data_slice<t_ctxunit>>>(
            "shared_ptr<t_data_slice<t_ctxunit>>>"
        )
        .function(
            "get_column_slice", &t_data_slice<t_ctxunit>::get_column_slice
        )
        .function("get_slice", &t_data_slice<t_ctxunit>::get_slice)
        .function("get_pkeys", &t_data_slice<t_ctxunit>::get_pkeys)
        .function(
            "get_column_names", &t_data_slice<t_ctxunit>::get_column_names
        );

    class_<t_data_slice<t_ctx0>>("t_data_slice_ctx0")
        .smart_ptr<std::shared_ptr<t_data_slice<t_ctx0>>>(
            "shared_ptr<t_data_slice<t_ctx0>>>"
        )
        .function("get_column_slice", &t_data_slice<t_ctx0>::get_column_slice)
        .function("get_slice", &t_data_slice<t_ctx0>::get_slice)
        .function("get_pkeys", &t_data_slice<t_ctx0>::get_pkeys)
        .function("get_column_names", &t_data_slice<t_ctx0>::get_column_names);

    class_<t_data_slice<t_ctx1>>("t_data_slice_ctx1")
        .smart_ptr<std::shared_ptr<t_data_slice<t_ctx1>>>(
            "shared_ptr<t_data_slice<t_ctx1>>>"
        )
        .function("get_column_slice", &t_data_slice<t_ctx1>::get_column_slice)
        .function("get_slice", &t_data_slice<t_ctx1>::get_slice)
        .function("get_pkeys", &t_data_slice<t_ctx1>::get_pkeys)
        .function("get_column_names", &t_data_slice<t_ctx1>::get_column_names)
        .function("get_row_path", &t_data_slice<t_ctx1>::get_row_path);

    class_<t_data_slice<t_ctx2>>("t_data_slice_ctx2")
        .smart_ptr<std::shared_ptr<t_data_slice<t_ctx2>>>(
            "shared_ptr<t_data_slice<t_ctx2>>>"
        )
        .function("get_column_slice", &t_data_slice<t_ctx2>::get_column_slice)
        .function("get_slice", &t_data_slice<t_ctx2>::get_slice)
        .function("get_pkeys", &t_data_slice<t_ctx2>::get_pkeys)
        .function("get_column_names", &t_data_slice<t_ctx2>::get_column_names)
        .function("get_row_path", &t_data_slice<t_ctx2>::get_row_path);

    /******************************************************************************
     *
     * t_ctxunit
     */
    class_<t_ctxunit>("t_ctxunit")
        .smart_ptr<std::shared_ptr<t_ctxunit>>("shared_ptr<t_ctxunit>");

    /******************************************************************************
     *
     * t_ctx0
     */
    class_<t_ctx0>("t_ctx0").smart_ptr<std::shared_ptr<t_ctx0>>(
        "shared_ptr<t_ctx0>"
    );

    /******************************************************************************
     *
     * t_ctx1
     */
    class_<t_ctx1>("t_ctx1").smart_ptr<std::shared_ptr<t_ctx1>>(
        "shared_ptr<t_ctx1>"
    );

    /******************************************************************************
     *
     * t_ctx2
     */
    class_<t_ctx2>("t_ctx2").smart_ptr<std::shared_ptr<t_ctx2>>(
        "shared_ptr<t_ctx2>"
    );

    /******************************************************************************
     *
     * t_pool
     */
    class_<t_pool>("t_pool")
        .constructor<>()
        .smart_ptr<std::shared_ptr<t_pool>>("shared_ptr<t_pool>")
        .function("unregister_gnode", &t_pool::unregister_gnode)
        .function("_process", &t_pool::_process)
        .function("set_update_delegate", &t_pool::set_update_delegate);

    /******************************************************************************
     *
     * t_tscalar
     */
    class_<t_tscalar>("t_tscalar");

    /******************************************************************************
     *
     * t_validated_expression_map
     */
    class_<t_validated_expression_map>("t_validated_expression_map")
        .constructor<>()
        .function(
            "get_expression_schema",
            &t_validated_expression_map::get_expression_schema
        )
        .function(
            "get_expression_errors",
            &t_validated_expression_map::get_expression_errors
        );

    /******************************************************************************
     *
     * t_expression_error
     */
    value_object<t_expression_error>("t_expression_error")
        .field("error_message", &t_expression_error::m_error_message)
        .field("line", &t_expression_error::m_line)
        .field("column", &t_expression_error::m_column);

    /******************************************************************************
     *
     * t_updctx
     */
    value_object<t_updctx>("t_updctx")
        .field("gnode_id", &t_updctx::m_gnode_id)
        .field("ctx_name", &t_updctx::m_ctx);

    /******************************************************************************
     *
     * t_cellupd
     */
    value_object<t_cellupd>("t_cellupd")
        .field("row", &t_cellupd::row)
        .field("column", &t_cellupd::column)
        .field("old_value", &t_cellupd::old_value)
        .field("new_value", &t_cellupd::new_value);

    /******************************************************************************
     *
     * t_stepdelta
     */
    value_object<t_stepdelta>("t_stepdelta")
        .field("rows_changed", &t_stepdelta::rows_changed)
        .field("columns_changed", &t_stepdelta::columns_changed)
        .field("cells", &t_stepdelta::cells);

    /******************************************************************************
     *
     * vector
     */
    register_vector<std::int32_t>("std::vector<std::int32_t>");
    register_vector<std::string>("std::vector<std::string>");
    register_vector<t_dtype>("std::vector<t_dtype>");
    register_vector<t_cellupd>("std::vector<t_cellupd>");
    register_vector<t_tscalar>("std::vector<t_tscalar>");
    register_vector<t_updctx>("std::vector<t_updctx>");
    register_vector<t_uindex>("std::vector<t_uindex>");
    register_vector<t_val>("std::vector<t_val>");
    register_vector<std::vector<t_tscalar>>(
        "std::vector<std::vector<t_tscalar>>"
    );
    register_vector<std::vector<std::string>>(
        "std::vector<std::vector<std::string>>"
    );
    register_vector<std::vector<t_val>>("std::vector<std::vector<t_val>>");

    /******************************************************************************
     *
     * map
     */
    register_map<std::string, std::string>("std::map<std::string, std::string>"
    );

    register_map<std::string, std::map<std::string, std::string>>(
        "std::map<std::string, std::map<std::string, std::string>>"
    );

    register_map<std::string, t_expression_error>(
        "std::map<std::string, t_expression_error>"
    );

    /******************************************************************************
     *
     * t_dtype
     */
    enum_<t_dtype>("t_dtype")
        .value("DTYPE_NONE", DTYPE_NONE)
        .value("DTYPE_INT64", DTYPE_INT64)
        .value("DTYPE_INT32", DTYPE_INT32)
        .value("DTYPE_INT16", DTYPE_INT16)
        .value("DTYPE_INT8", DTYPE_INT8)
        .value("DTYPE_UINT64", DTYPE_UINT64)
        .value("DTYPE_UINT32", DTYPE_UINT32)
        .value("DTYPE_UINT16", DTYPE_UINT16)
        .value("DTYPE_UINT8", DTYPE_UINT8)
        .value("DTYPE_FLOAT64", DTYPE_FLOAT64)
        .value("DTYPE_FLOAT32", DTYPE_FLOAT32)
        .value("DTYPE_BOOL", DTYPE_BOOL)
        .value("DTYPE_TIME", DTYPE_TIME)
        .value("DTYPE_DATE", DTYPE_DATE)
        .value("DTYPE_ENUM", DTYPE_ENUM)
        .value("DTYPE_OID", DTYPE_OID)
        .value("DTYPE_F64PAIR", DTYPE_F64PAIR)
        .value("DTYPE_USER_FIXED", DTYPE_USER_FIXED)
        .value("DTYPE_STR", DTYPE_STR)
        .value("DTYPE_USER_VLEN", DTYPE_USER_VLEN)
        .value("DTYPE_LAST_VLEN", DTYPE_LAST_VLEN)
        .value("DTYPE_LAST", DTYPE_LAST);

    /******************************************************************************
     *
     * t_op
     */
    enum_<t_op>("t_op")
        .value("OP_INSERT", OP_INSERT)
        .value("OP_DELETE", OP_DELETE)
        .value("OP_CLEAR", OP_CLEAR);

    /******************************************************************************
     *
     * Construct `std::vector`s
     */
    function("make_string_vector", &make_vector<std::string>);
    function("make_val_vector", &make_vector<t_val>);
    function("make_2d_string_vector", &make_vector<std::vector<std::string>>);
    function("make_2d_val_vector", &make_vector<std::vector<t_val>>);

    /******************************************************************************
     *
     * Perspective functions
     */
    function("make_table", &make_table<t_val>);
    function("col_to_js_typed_array", &col_to_js_typed_array);
    function("make_view_unit", &make_view<t_ctxunit>);
    function("make_view_zero", &make_view<t_ctx0>);
    function("make_view_one", &make_view<t_ctx1>);
    function("make_view_two", &make_view<t_ctx2>);
    function(
        "get_data_slice_unit", &get_data_slice<t_ctxunit>, allow_raw_pointers()
    );
    function(
        "get_from_data_slice_unit",
        &get_from_data_slice<t_ctxunit>,
        allow_raw_pointers()
    );
    function(
        "get_data_slice_zero", &get_data_slice<t_ctx0>, allow_raw_pointers()
    );
    function(
        "get_from_data_slice_zero",
        &get_from_data_slice<t_ctx0>,
        allow_raw_pointers()
    );
    function(
        "get_data_slice_one", &get_data_slice<t_ctx1>, allow_raw_pointers()
    );
    function(
        "get_from_data_slice_one",
        &get_from_data_slice<t_ctx1>,
        allow_raw_pointers()
    );
    function(
        "get_data_slice_two", &get_data_slice<t_ctx2>, allow_raw_pointers()
    );
    function(
        "get_from_data_slice_two",
        &get_from_data_slice<t_ctx2>,
        allow_raw_pointers()
    );
    function("get_min_max_unit", &get_min_max<t_ctxunit>);
    function("get_min_max_zero", &get_min_max<t_ctx0>);
    function("get_min_max_one", &get_min_max<t_ctx1>);
    function("get_min_max_two", &get_min_max<t_ctx2>);
    function("to_arrow_unit", &to_arrow<t_ctxunit>);
    function("to_arrow_zero", &to_arrow<t_ctx0>);
    function("to_arrow_one", &to_arrow<t_ctx1>);
    function("to_arrow_two", &to_arrow<t_ctx2>);
    function("to_csv_unit", &to_csv<t_ctxunit>);
    function("to_csv_zero", &to_csv<t_ctx0>);
    function("to_csv_one", &to_csv<t_ctx1>);
    function("to_csv_two", &to_csv<t_ctx2>);
    function("get_row_delta_unit", &get_row_delta<t_ctxunit>);
    function("get_row_delta_zero", &get_row_delta<t_ctx0>);
    function("get_row_delta_one", &get_row_delta<t_ctx1>);
    function("get_row_delta_two", &get_row_delta<t_ctx2>);
    function("scalar_to_val", &scalar_to_val);
    function("validate_expressions", &validate_expressions<t_val>);
    function("is_valid_datetime", &is_valid_datetime);
    function("init", &t_computed_expression_parser::init);
}
