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


#include <perspective/json_loader.h>
#include "perspective/base.h"
#include "perspective/raw_types.h"
#include "perspective/arrow_csv.h"
#include "rapidjson/document.h"
#include <rapidjson/stringbuffer.h>
#include <rapidjson/writer.h>
#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstring>
#include <ctime>
#include <limits>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <type_traits>

namespace perspective::json {

static bool
ichar_equals(char a, char b) {
    return std::tolower(static_cast<unsigned char>(a))
        == std::tolower(static_cast<unsigned char>(b));
}

static bool
istrequals(std::string_view a, std::string_view b) {
    return a.size() == b.size()
        && std::equal(a.begin(), a.end(), b.begin(), ichar_equals);
}

t_dtype
rapidjson_type_to_dtype(const rapidjson::Value& value) {
    switch (value.GetType()) {
        case rapidjson::Type::kStringType: {
            const auto& str = value.GetString();
            if (str[0] == '\0') {
                return t_dtype::DTYPE_STR;
            }

            if (istrequals(str, "true") || istrequals(str, "false")) {
                return t_dtype::DTYPE_BOOL;
            }

            // TODO JSON will no longer support date/datetime inference. The
            // only way to load JSON data with these types will be with a
            // Schema!

            char* endptr;
            strtol(str, &endptr, 10);
            if (*endptr == '\0') {
                return t_dtype::DTYPE_INT32;
            }

            strtof(str, &endptr);
            if (*endptr == '\0') {
                return t_dtype::DTYPE_FLOAT64;
            }

            std::tm tm;
            std::memset(&tm, 0, sizeof(tm));
            std::chrono::system_clock::time_point tp;

            if (parse_all_date_time(tm, tp, str)) {
                if (tm.tm_hour == 0 && tm.tm_min == 0 && tm.tm_sec == 0) {
                    return t_dtype::DTYPE_DATE;
                }
                return t_dtype::DTYPE_TIME;
            }

            auto datetime = apachearrow::parseAsArrowTimestamp(str);
            if (datetime != std::nullopt) {
                return t_dtype::DTYPE_TIME;
            }

            return t_dtype::DTYPE_STR;
        }
        case rapidjson::Type::kNumberType: {
            if (value.IsInt64()) {
                if (value.GetInt64()
                    > std::numeric_limits<std::int32_t>::max()) {
                    return t_dtype::DTYPE_FLOAT64;
                }
                return t_dtype::DTYPE_INT32;
            }
            if (value.IsInt()) {
                return t_dtype::DTYPE_INT32;
            }

            return t_dtype::DTYPE_FLOAT64;
        }
        case rapidjson::Type::kTrueType:
        case rapidjson::Type::kFalseType:
            return t_dtype::DTYPE_BOOL;
        case rapidjson::kNullType:
            return t_dtype::DTYPE_NONE;
        case rapidjson::kArrayType:
            // Only reachable under `stringify`; the expanding modes descend.
            return t_dtype::DTYPE_STR;
        case rapidjson::kObjectType:
            PSP_COMPLAIN_AND_ABORT("Unknown JSON type");
            return t_dtype::DTYPE_NONE;
        default:
            PSP_COMPLAIN_AND_ABORT("Unknown JSON type");
            return t_dtype::DTYPE_NONE;
    }
}
template <t_dtype A, t_dtype B>
struct promote {
    constexpr static t_dtype dtype = DTYPE_NONE;
};

#define PROMOTE_IMPL(A, B, C)                                                  \
    template <>                                                                \
    struct promote<A, B> {                                                     \
        constexpr static t_dtype dtype = C;                                    \
    };

PROMOTE_IMPL(DTYPE_INT32, DTYPE_INT64, DTYPE_INT64)
// PROMOTE_IMPL(std::int32_t, std::float_t, DTYPE_FLOAT32)
// PROMOTE_IMPL(std::int32_t, std::double_t, DTYPE_FLOAT64)

template <typename A>
static A
json_into(const rapidjson::Value& value) {
    if constexpr (std::is_same_v<A, std::int32_t> || std::is_same_v<A, std::int64_t> || std::is_same_v<A, double>) {
        if (value.IsInt()) {
            return value.GetInt();
        }
        if (value.IsInt64()) {
            return value.GetInt64();
        }
        if (value.IsDouble()) {
            return value.GetDouble();
        }
        if (value.IsFloat()) {
            return value.GetFloat();
        }
        if (value.IsString()) {
            if constexpr (std::is_same_v<A, std::int32_t>) {
                return std::atoi(value.GetString());
            } else if constexpr (std::is_same_v<A, std::int64_t>) {
                return std::atoll(value.GetString());
            } else if constexpr (std::is_same_v<A, double> || std::is_same_v<A, float>) {
                return std::atof(value.GetString());
            } else {
                static_assert(!std::is_same_v<A, A>, "No coercion for type");
            }
        }
        if (value.IsNull()) {
            return 0;
        }

        std::stringstream ss;
        ss << "Could not coerce " << value.GetType() << " to "
           << "a number";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    } else if constexpr (std::is_same_v<A, std::string>) {
        switch (value.GetType()) {
            case rapidjson::kNullType:
                return "";
            case rapidjson::kFalseType:
                return "false";
            case rapidjson::kTrueType:
                return "true";
            case rapidjson::kObjectType:
                PSP_COMPLAIN_AND_ABORT("Cannot coerce object to string");
            case rapidjson::kArrayType: {
                // `stringify` keeps the array as its JSON text.
                rapidjson::StringBuffer buffer;
                rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
                value.Accept(writer);
                return buffer.GetString();
            }
            case rapidjson::kStringType:
                return value.GetString();
            case rapidjson::kNumberType:
                if (value.IsInt()) {
                    return std::to_string(value.GetInt());
                }
                if (value.IsInt64()) {
                    return std::to_string(value.GetInt64());
                }
                if (value.IsDouble()) {
                    return std::to_string(value.GetDouble());
                }
                if (value.IsFloat()) {
                    return std::to_string(value.GetFloat());
                }
        }

        std::stringstream ss;
        ss << "Could not coerce " << value.GetType() << " to "
           << "a string";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    } else if constexpr (std::is_same_v<A, t_date>) {
        std::tm tm;
        if (value.IsString()) {
            if (!parse_all_date_time(tm, value.GetString())) {
                PSP_COMPLAIN_AND_ABORT("Could not coerce to date");
            }
        } else if (value.IsInt64()) {
            return t_date::from_epoch_ms(value.GetInt64());
        } else {
            PSP_COMPLAIN_AND_ABORT("Could not coerce to date");
        }

        return t_date(tm.tm_year + 1900, tm.tm_mon, tm.tm_mday);
    } else if constexpr (std::is_same_v<A, t_time>) {
        if (value.IsString()) {
            std::chrono::system_clock::time_point tp;
            if (!parse_all_date_time(tp, value.GetString())) {
                PSP_COMPLAIN_AND_ABORT("Could not coerce to time");
            }

            return t_time(std::chrono::duration_cast<std::chrono::milliseconds>(
                              tp.time_since_epoch()
            )
                              .count());
        }
        if (value.IsDouble()) {
            return t_time(value.GetDouble());
        }
        if (value.IsInt64()) {
            return t_time(value.GetInt64());
        }
        if (value.IsInt()) {
            return t_time(value.GetInt());
        }
        PSP_COMPLAIN_AND_ABORT(
            "Could not coerce " + std::to_string(value.GetType())
            + " to a time."
        );
    } else {
        static_assert(!std::is_same_v<A, A>, "No coercion for type");
    }
}

std::optional<t_dtype>
fill_column_json(
    const std::shared_ptr<t_column>& col,
    const t_uindex i,
    const rapidjson::Value& value,
    const bool is_update
) {
    if (value.IsNull()) {
        if (is_update) {
            col->unset(i);
        } else {
            col->clear(i);
        }
        return std::nullopt;
    }

    switch (col->get_dtype()) {
        case t_dtype::DTYPE_STR: {
            if (!value.IsString()) {
                auto v = json_into<std::string>(value);
                col->set_nth(i, v);
            } else {
                col->set_nth(i, value.GetString());
            }
            return std::nullopt;
        }
        case t_dtype::DTYPE_INT32: {
            if (value.IsInt()) {
                col->set_nth<std::int32_t>(i, value.GetInt());
                return std::nullopt;
            }

            if (value.IsInt64()) {
                if (value.GetInt64() > std::numeric_limits<std::int32_t>::max())
                    [[likely]] {
                    if (!is_update) {
                        LOG_DEBUG("Promoting due to int32 overflow");
                        return {DTYPE_FLOAT64};
                    }
                }

                // Coerce in update mode
                col->set_nth<std::int32_t>(
                    i, static_cast<std::int32_t>(value.GetInt64())
                );

                return std::nullopt;
            }

            if (value.IsDouble()) {
                if (is_update) {
                    col->set_nth<std::int32_t>(
                        i, static_cast<std::int32_t>(value.GetDouble())
                    );
                    return std::nullopt;
                }

                return {DTYPE_FLOAT64};
            }

            if (value.IsString()) {
                const auto& str = value.GetString();
                if (str[0] == '\0') {
                    if (is_update) {
                        col->set_valid(i, false);
                        return std::nullopt;
                    }

                    return {t_dtype::DTYPE_STR};
                }

                char* endptr;
                std::int32_t result = strtol(str, &endptr, 10);
                if (*endptr == '\0') {
                    col->set_nth(i, result);
                    return std::nullopt;
                }

                float result2 = strtof(str, &endptr);
                if (*endptr == '\0') {
                    if (is_update) {
                        col->set_nth<std::int32_t>(
                            i, static_cast<std::int32_t>(result2)
                        );
                        return std::nullopt;
                    }

                    return {t_dtype::DTYPE_FLOAT64};
                }

                return {t_dtype::DTYPE_STR};
            }

            std::stringstream ss;
            ss << "Expected int, found " << value.GetType();
            PSP_COMPLAIN_AND_ABORT(ss.str());
            return std::nullopt;
        }
        case t_dtype::DTYPE_INT64: {
            if (value.IsInt64()) [[likely]] {
                col->set_nth<std::int64_t>(i, value.GetInt());
            } else if (value.IsDouble()) {
                return {DTYPE_FLOAT64};
            } else if (value.IsString()) {
                col->set_nth(i, std::atoll(value.GetString()));
            } else {
                std::stringstream ss;
                ss << "Expected int64, found " << value.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
            return std::nullopt;
        }
        case t_dtype::DTYPE_FLOAT64: {
            if (value.IsDouble()) [[likely]] {
                col->set_nth<double>(i, value.GetDouble());
            } else if (value.IsInt64()) {
                col->set_nth<double>(i, static_cast<double>(value.GetInt64()));
            } else if (value.IsInt()) {
                col->set_nth<double>(i, value.GetInt());
            } else if (value.IsString()) {
                col->set_nth(i, std::atof(value.GetString()));
            } else {
                std::stringstream ss;
                ss << "Expected double, found " << value.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
            return std::nullopt;
        }
        case t_dtype::DTYPE_BOOL: {
            if (value.IsBool()) [[likely]] {
                col->set_nth<bool>(i, value.GetBool());
            } else if (value.IsString() && istrequals(value.GetString(), "true")) {
                col->set_nth<bool>(i, true);
            } else if (value.IsString() && istrequals(value.GetString(), "false")) {
                col->set_nth<bool>(i, false);
            } else if (value.IsInt()) {
                col->set_nth<bool>(i, value.GetInt() != 0);
            } else {
                std::stringstream ss;
                ss << "Expected bool, found " << value.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
            return std::nullopt;
        }
        case t_dtype::DTYPE_TIME: {
            col->set_nth(i, json_into<t_time>(value));
            return std::nullopt;
        }
        case t_dtype::DTYPE_DATE: {
            col->set_nth(i, json_into<t_date>(value));
            return std::nullopt;
        }
        default:
            PSP_COMPLAIN_AND_ABORT("JSON field not yet implemented");
            return std::nullopt;
    }
}

/**
 * The separator joining an object's key to its childrens'. MUST match
 * `apachearrow::FLATTEN_SEPARATOR`, or the same logical record would land in
 * different columns depending on whether it arrived as JSON or as Arrow.
 */
static const char FLATTEN_SEPARATOR = '.';

/**
 * Visit every scalar beneath `value`, naming it by its dotted path from
 * `prefix`. An object contributes its leaves rather than itself, because
 * Perspective's column model is flat; an empty object contributes nothing.
 *
 * `prefix` is grown and restored in place rather than copied per leaf.
 */
template <typename F>
static void
for_each_leaf(
    std::string& prefix,
    const rapidjson::Value& value,
    t_list_flatten mode,
    F&& fn,
    bool through_array = false
) {
    if (mode != LIST_FLATTEN_STRINGIFY && value.IsArray()) {
        // Inference only needs one element to learn the leaves' types; any
        // path a later element introduces is grown into by `resolve_column`.
        if (!value.Empty()) {
            for_each_leaf(prefix, value[0], mode, fn, true);
        }

        return;
    }

    if (!value.IsObject()) {
        fn(static_cast<const std::string&>(prefix), value, through_array);
        return;
    }

    const auto len = prefix.size();
    for (const auto& child : value.GetObj()) {
        prefix += FLATTEN_SEPARATOR;
        prefix += child.name.GetString();
        for_each_leaf(prefix, child.value, mode, fn, through_array);
        prefix.resize(len);
    }
}

/**
 * The value written when an expansion has no element for a slot -- an empty or
 * absent array yields one row rather than none, matching the Arrow path.
 */
static const rapidjson::Value NULL_LEAF;

/**
 * Row indices are 32 bit, and expansion is the only ingest path that can
 * multiply an input's size.
 */
static void
check_row_count(std::uint64_t rows) {
    if (rows > std::numeric_limits<std::uint32_t>::max()) {
        std::stringstream ss;
        ss << "Array expansion produced " << rows
           << " rows, which exceeds the maximum supported size\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }
}

/**
 * How many output rows `value` expands to.
 *
 * An object combines its children: `zip` requires every child wider than one
 * to agree, while `cartesian` multiplies them. An array contributes the SUM of
 * its elements' widths, so a nested array expands at each level -- the same
 * fixpoint the Arrow path reaches by re-running its pass.
 */
static t_uindex
leaf_width(const rapidjson::Value& value, t_list_flatten mode) {
    if (mode == LIST_FLATTEN_STRINGIFY || value.IsNull()) {
        return 1;
    }

    if (value.IsArray()) {
        t_uindex total = 0;
        for (const auto& element : value.GetArray()) {
            total += leaf_width(element, mode);
        }

        // An empty array still occupies a row, carrying a null.
        return std::max<t_uindex>(total, 1);
    }

    if (!value.IsObject()) {
        return 1;
    }

    t_uindex width = 1;
    const char* witness = nullptr;
    for (const auto& child : value.GetObj()) {
        const auto child_width = leaf_width(child.value, mode);
        if (mode == LIST_FLATTEN_CARTESIAN) {
            width *= child_width;
            continue;
        }

        if (child_width == 1) {
            continue;
        }

        if (witness != nullptr && child_width != width) {
            std::stringstream ss;
            ss << "Cannot zip `" << witness << "` (" << width << ") and `"
               << child.name.GetString() << "` (" << child_width
               << ") of differing length; use the `cartesian` list flatten "
                  "mode.\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        width = child_width;
        witness = child.name.GetString();
    }

    return width;
}

/**
 * Whether `value` needs the descending, expanding path at all. A value that is
 * neither an object nor an expandable array is written straight to the column
 * named by its key, with no path string and no width arithmetic.
 */
static bool
is_nested(const rapidjson::Value& value, t_list_flatten mode) {
    return value.IsObject()
        || (mode != LIST_FLATTEN_STRINGIFY && value.IsArray());
}

/**
 * A key's name as a view, using `rapidjson`'s length rather than `strlen`.
 */
static std::string_view
key_name(const rapidjson::Value& name) {
    return {name.GetString(), name.GetStringLength()};
}

/**
 * The slot a child of width `child_width` contributes to its record's slot `k`.
 *
 * `zip` passes `k` straight through, since every child wider than one shares
 * the record's width. `cartesian` decomposes it mixed-radix: `stride` starts at
 * the record's width and is consumed left to right, so the LAST child varies
 * fastest, matching `itertools.product` and the Arrow implementation.
 *
 * INVARIANT: under `cartesian` this must be called for EVERY child in order,
 * including ones the caller then skips, or the remaining children decompose
 * against the wrong stride.
 */
static t_uindex
child_slot(
    t_uindex k,
    t_uindex child_width,
    t_uindex& stride,
    t_list_flatten mode
) {
    if (mode != LIST_FLATTEN_CARTESIAN) {
        return child_width > 1 ? k : 0;
    }

    stride /= child_width;
    return (k / stride) % child_width;
}

/**
 * Visit the leaves `value` contributes to output slot `k`, which must be less
 * than `width`.
 *
 * `width` is `leaf_width(value, mode)`, passed in rather than recomputed:
 * every caller already holds it, and recomputing walks the whole subtree once
 * per slot.
 */
template <typename F>
static void
emit_leaves(
    std::string& prefix,
    const rapidjson::Value& value,
    t_uindex k,
    t_uindex width,
    t_list_flatten mode,
    F&& fn
) {
    if (mode == LIST_FLATTEN_STRINGIFY || value.IsNull()) {
        fn(std::string_view{prefix}, value);
        return;
    }

    if (value.IsArray()) {
        // The width is the sum of the elements' and each is at least one, so
        // equality means every element is exactly one -- an array of scalars
        // or of flat objects, which is the common case. Slot `k` is then
        // element `k`, rather than a scan accumulating widths, which would
        // make emitting a whole array quadratic in its length.
        if (width == value.Size()) {
            emit_leaves(prefix, value[k], 0, 1, mode, fn);
            return;
        }

        // Otherwise find the element covering slot `k`, and the slot within it.
        for (const auto& element : value.GetArray()) {
            const auto element_width = leaf_width(element, mode);
            if (k < element_width) {
                emit_leaves(prefix, element, k, element_width, mode, fn);
                return;
            }

            k -= element_width;
        }

        // Empty array: the row survives carrying a null.
        fn(std::string_view{prefix}, NULL_LEAF);
        return;
    }

    if (!value.IsObject()) {
        fn(std::string_view{prefix}, value);
        return;
    }

    t_uindex stride = width;
    const auto len = prefix.size();
    for (const auto& child : value.GetObj()) {
        const auto child_width = leaf_width(child.value, mode);
        const auto child_k = child_slot(k, child_width, stride, mode);
        prefix += FLATTEN_SEPARATOR;
        prefix += child.name.GetString();
        emit_leaves(prefix, child.value, child_k, child_width, mode, fn);
        prefix.resize(len);
    }
}

/**
 * A column name reached both as a literal key and by descending into an
 * object cannot be filled coherently, as two different cells would write it.
 */
static void
check_path_collision(
    const std::set<std::string>& literal, const std::set<std::string>& descended
) {
    for (const auto& name : literal) {
        if (descended.count(name) > 0) {
            std::stringstream ss;
            ss << "Column `" << name
               << "` is both a key and the flattened path of an object\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }
}

JsonLoader::JsonLoader() = default;
JsonLoader::~JsonLoader() = default;

const std::vector<std::string>&
JsonLoader::names() const {
    return m_names;
}

const std::vector<t_dtype>&
JsonLoader::types() const {
    return m_types;
}

bool
JsonLoader::is_implicit() const {
    return m_is_implicit;
}

bool
JsonLoader::empty() const {
    return m_empty;
}

void
JsonLoader::release() {
    // Move-construct and let the temporary die: `rapidjson::Document` frees
    // its allocator's chunks on destruction, where `SetNull` would not.
    { auto _ = std::move(m_document); }

    m_stream = rapidjson::StringStream{nullptr};
}

void
JsonLoader::init(
    std::string_view data,
    t_json_format format,
    const std::string& index,
    const t_schema* existing,
    t_list_flatten mode
) {
    m_format = format;
    m_mode = mode;
    if (format == JSON_FORMAT_NDJSON) {
        m_stream = rapidjson::StringStream(data.data());
        m_document.ParseStream<rapidjson::kParseStopWhenDoneFlag>(m_stream);
    } else {
        m_document.Parse(data.data());
    }

    switch (format) {
        case JSON_FORMAT_ROWS: {
            if (m_document.Size() == 0) {
                m_empty = true;
            } else if (!m_document[0].IsObject()) {
                // TODO Legacy error message
                PSP_COMPLAIN_AND_ABORT(
                    "Cannot determine data types without column names!\n"
                )
            }
        } break;
        case JSON_FORMAT_COLUMNS: {
            if (!m_document.IsObject()) {
                // TODO Legacy error message
                PSP_COMPLAIN_AND_ABORT(
                    "Cannot determine data types without column names!\n"
                )
            }
        } break;
        case JSON_FORMAT_NDJSON: {
            if (m_document.Size() == 0) {
                m_empty = true;
            } else if (!m_document.IsObject()) {
                std::stringstream ss;
                ss << "Received non-object " << m_document.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str())
            }
        } break;
    }

    if (existing != nullptr) {
        // An update takes its columns from the Table, and its primary key from
        // whether that Table was created with one.
        m_names = existing->columns();
        m_types = existing->types();
        m_is_implicit = index.empty();
        return;
    }

    if (m_empty) {
        return;
    }

    switch (format) {
        case JSON_FORMAT_ROWS:
            infer_rows(index);
            break;
        case JSON_FORMAT_COLUMNS:
            infer_cols(index);
            break;
        case JSON_FORMAT_NDJSON:
            infer_ndjson(index);
            break;
    }

    m_expands = !m_per_element.empty();
    if (mode == LIST_FLATTEN_CARTESIAN && m_per_element.size() > 1) {
        // A product repeats every factor against the others' dimensions, so
        // with more than one expansion point nothing varies per row.
        m_per_element.clear();
    }
}

std::optional<std::string>
JsonLoader::repeated_index(const std::string& index) const {
    if (!m_expands) {
        return std::nullopt;
    }

    // An index this payload does not carry cannot be established as
    // per-element, so it is treated as repeated.
    if (!index.empty() && m_per_element.count(index) == 0) {
        return index;
    }

    const std::string implicit{"__INDEX__"};
    const auto has_implicit =
        std::find(m_names.begin(), m_names.end(), implicit) != m_names.end();

    if (has_implicit && m_per_element.count(implicit) == 0) {
        return implicit;
    }

    return std::nullopt;
}

std::uint32_t
JsonLoader::fill_table(
    t_data_table& tbl,
    const std::string& index,
    std::uint32_t offset,
    bool is_update
) {
    if (m_empty) {
        return 0;
    }

    switch (m_format) {
        case JSON_FORMAT_ROWS:
            return fill_rows(tbl, index, offset, is_update);
        case JSON_FORMAT_COLUMNS:
            return fill_cols(tbl, index, offset, is_update);
        case JSON_FORMAT_NDJSON:
            return fill_ndjson(tbl, index, offset, is_update);
    }

    return 0;
}

/**
 * Accumulate types from one record, used once by ndjson and per-record by the
 * row format. `seen` grows with every key encountered; `known` with the keys
 * that have produced a non-null value, so the caller can tell when it may stop.
 */
static void
infer_record(
    const rapidjson::Value& record,
    const std::string& index,
    std::set<std::string>& seen,
    std::set<std::string>& known,
    std::vector<std::string>& names,
    std::vector<t_dtype>& types,
    bool& is_implicit,
    std::set<std::string>& literal,
    std::set<std::string>& descended,
    std::set<std::string>& per_element,
    t_list_flatten mode
) {
    std::string path;
    for (const auto& col : record.GetObj()) {
        path.assign(col.name.GetString());
        const auto top = path.size();
        for_each_leaf(
            path,
            col.value,
            mode,
            [&](const auto& name, const auto&, bool through_array) {
                seen.insert(name);
                (name.size() == top ? literal : descended).insert(name);
                if (through_array) {
                    per_element.insert(name);
                }
            }
        );
    }

    // https://github.com/Tencent/rapidjson/issues/1994
    for (const auto& col : record.GetObj()) {
        path.assign(col.name.GetString());
        for_each_leaf(path, col.value, mode, [&](const auto& name, const auto& leaf, bool) {
            if (name == index) {
                is_implicit = false;
            }

            if (known.count(name) > 0) {
                return;
            }

            auto dtype = rapidjson_type_to_dtype(leaf);
            if (dtype != DTYPE_NONE) {
                known.insert(name);
                types.push_back(dtype);
                names.emplace_back(name);
            }
        });
    }
}

/**
 * Columns which never produced a non-null value have no inferrable type.
 */
static void
default_untyped_to_string(
    const std::set<std::string>& seen,
    const std::set<std::string>& known,
    std::vector<std::string>& names,
    std::vector<t_dtype>& types
) {
    for (const auto& col : seen) {
        if (known.count(col) == 0) {
            types.push_back(DTYPE_STR);
            names.emplace_back(col);
        }
    }
}

std::shared_ptr<t_column>
JsonLoader::resolve_column(
    t_data_table& tbl,
    std::string_view name,
    const rapidjson::Value& leaf,
    bool is_update
) {
    auto col = tbl.get_column_safe(name);
    if (col) {
        return col;
    }

    if (is_update) {
        LOG_DEBUG("Ignoring column " << name);
        return nullptr;
    }

    auto dtype = rapidjson_type_to_dtype(leaf);
    if (dtype == DTYPE_NONE) {
        // A `null` carries no type; wait for a record that does.
        return nullptr;
    }

    m_names.emplace_back(name);
    m_types.push_back(dtype);

    // Sizes the new column to the table, leaving the preceding rows invalid.
    return tbl.add_column_sptr(m_names.back(), dtype, true);
}

void
JsonLoader::infer_rows(const std::string& index) {
    std::set<std::string> seen;
    std::set<std::string> known;
    std::set<std::string> literal;
    std::set<std::string> descended;
    for (const auto& row : m_document.GetArray()) {
        infer_record(
            row,
            index,
            seen,
            known,
            m_names,
            m_types,
            m_is_implicit,
            literal,
            descended,
            m_per_element,
            m_mode
        );

        // Theoretically there can end too early if the first
        // few rows are missing columns that are present in later rows.
        if (known.size() == seen.size()) {
            break;
        }
    }

    check_path_collision(literal, descended);
    default_untyped_to_string(seen, known, m_names, m_types);
}

void
JsonLoader::infer_ndjson(const std::string& index) {
    // Only the first record is available without consuming the stream; later
    // records grow the schema during the fill instead.
    std::set<std::string> seen;
    std::set<std::string> known;
    std::set<std::string> literal;
    std::set<std::string> descended;
    infer_record(
        m_document,
        index,
        seen,
        known,
        m_names,
        m_types,
        m_is_implicit,
        literal,
        descended,
        m_per_element,
        m_mode
    );

    check_path_collision(literal, descended);
    default_untyped_to_string(seen, known, m_names, m_types);
}

void
JsonLoader::infer_cols(const std::string& index) {
    // https://github.com/Tencent/rapidjson/issues/1994
    for (const auto& it : m_document.GetObj()) {
        if (!it.value.IsArray()) {
            PSP_COMPLAIN_AND_ABORT("Malformed column")
        }

        if (it.value.Empty()) {
            PSP_COMPLAIN_AND_ABORT("Can't create table from empty columns")
        }

        if (it.name.GetString() == index) {
            m_is_implicit = false;
        }

        std::set<std::string> known;
        std::string path;
        bool saw_leaf = false;
        for (const auto& cell : it.value.GetArray()) {
            // Whether this cell contributes the column itself rather than
            // paths beneath it -- the same test `for_each_leaf` applies.
            const bool is_leaf = !cell.IsObject()
                && (m_mode == LIST_FLATTEN_STRINGIFY || !cell.IsArray());

            saw_leaf = saw_leaf || is_leaf;
            path.assign(it.name.GetString());
            for_each_leaf(
                path,
                cell,
                m_mode,
                [&](const auto& name, const auto& v, bool through_array) {
                    if (through_array) {
                        m_per_element.insert(name);
                    }

                    if (known.count(name) > 0) {
                        return;
                    }

                    auto dtype = rapidjson_type_to_dtype(v);
                    if (dtype != DTYPE_NONE) {
                        known.insert(name);
                        m_types.push_back(dtype);
                        m_names.emplace_back(name);
                    }
                }
            );

            // The first cell that yields any type ends the scan, for objects
            // as well as scalars -- structure is inferred from the first row.
            // A later cell carrying a path this one lacked is picked up by
            // `resolve_column` during the fill, so nothing is dropped and no
            // column costs more than one cell to infer.
            if (!known.empty()) {
                break;
            }
        }

        // Every cell was null, so there is no type to infer -- but only if the
        // column has leaf cells at all. A column of objects contributing no
        // paths contributes no column either.
        if (known.empty() && saw_leaf) {
            m_types.push_back(DTYPE_STR);
            m_names.emplace_back(it.name.GetString());
        }
    }
}

/**
 * Write one cell, resolving a type conflict the only way each mode can: table
 * creation widens the column and rewrites, while an update cannot change the
 * schema of a live Table and so must reject the value.
 */
static void
fill_cell(
    t_data_table& tbl,
    const std::shared_ptr<t_column>& col,
    std::string_view col_name,
    t_uindex ii,
    const rapidjson::Value& cell,
    bool is_update
) {
    auto promote = fill_column_json(col, ii, cell, is_update);
    if (!promote) {
        return;
    }

    if (is_update) {
        std::stringstream ss;
        ss << "Cannot append value of type " << dtype_to_str(*promote)
           << " to column \"" << col_name << "\" of type "
           << dtype_to_str(col->get_dtype()) << " at index " << ii << std::endl;
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    LOG_DEBUG(
        "Promoting column " << col_name << " from "
                            << dtype_to_str(col->get_dtype()) << " to "
                            << dtype_to_str(*promote)
    );

    const std::string name{col_name};
    tbl.promote_column(name, *promote, ii, true);
    fill_column_json(tbl.get_column(name), ii, cell, is_update);
}

std::uint32_t
JsonLoader::fill_rows(
    t_data_table& tbl,
    const std::string& index,
    std::uint32_t offset,
    bool is_update
) {
    const auto nrows = static_cast<t_uindex>(m_document.Size());
    tbl.extend(nrows);
    t_uindex extended = nrows;

    const auto& psp_pkey_col = tbl.get_column("psp_pkey");
    const auto psp_okey_col =
        is_update ? nullptr : tbl.get_column("psp_okey");

    t_uindex ii = 0;
    for (const auto& row : m_document.GetArray()) {
        bool nested = false;
        if (m_is_implicit && is_update) {
            psp_pkey_col->set_nth<std::uint32_t>(ii, (ii + offset));
        }

        for (const auto& it : row.GetObj()) {
            if (is_nested(it.value, m_mode)) {
                nested = true;
                break;
            }

            const auto name = key_name(it.name);
            if (is_update && name == "__INDEX__") {
                fill_cell(
                    tbl, psp_pkey_col, "psp_pkey", ii, it.value, is_update
                );

                continue;
            }

            auto col = resolve_column(tbl, name, it.value, is_update);
            if (!col) {
                continue;
            }

            fill_cell(tbl, col, name, ii, it.value, is_update);
            if (!m_is_implicit && index == name) {
                fill_column_json(psp_pkey_col, ii, it.value, is_update);
                if (psp_okey_col) {
                    fill_column_json(psp_okey_col, ii, it.value, is_update);
                }
            }
        }

        if (!nested) {
            if (m_is_implicit && !is_update) {
                psp_pkey_col->set_nth<std::int32_t>(ii, ii);
                psp_okey_col->set_nth<std::int32_t>(ii, ii);
            }

            ii++;
            continue;
        }

        const auto width = leaf_width(row, m_mode);
        m_child_widths.clear();
        for (const auto& it : row.GetObj()) {
            m_child_widths.push_back(leaf_width(it.value, m_mode));
        }

        check_row_count(static_cast<std::uint64_t>(ii) + width);
        if (ii + width > extended) {
            extended = ii + width;
            tbl.extend(extended);
        }

        for (t_uindex k = 0; k < width; ++k) {
        if (m_is_implicit && is_update) {
            psp_pkey_col->set_nth<std::uint32_t>(ii, (ii + offset));
        }

        std::string path;
        t_uindex stride = width;
        std::size_t ci = 0;
        for (const auto& it : row.GetObj()) {
            const auto child_width = m_child_widths[ci++];
            const auto sub = child_slot(k, child_width, stride, m_mode);
            if (is_update
                && std::string_view{it.name.GetString()} == "__INDEX__") {
                fill_cell(
                    tbl, psp_pkey_col, "psp_pkey", ii, it.value, is_update
                );

                continue;
            }

            path.assign(it.name.GetString());
            emit_leaves(
                path,
                it.value,
                sub,
                child_width,
                m_mode,
                [&](const auto& name, const auto& v) {
                    auto col = resolve_column(tbl, name, v, is_update);
                    if (!col) {
                        return;
                    }

                    fill_cell(tbl, col, name, ii, v, is_update);
                    if (!m_is_implicit && index == name) {
                        fill_column_json(psp_pkey_col, ii, v, is_update);
                        if (psp_okey_col) {
                            fill_column_json(psp_okey_col, ii, v, is_update);
                        }
                    }
                }
            );
        }

        if (m_is_implicit && !is_update) {
            psp_pkey_col->set_nth<std::int32_t>(ii, ii);
            psp_okey_col->set_nth<std::int32_t>(ii, ii);
        }

        ii++;
        }
    }

    return ii;
}

std::uint32_t
JsonLoader::fill_cols(
    t_data_table& tbl,
    const std::string& index,
    std::uint32_t offset,
    bool is_update
) {
    std::vector<const rapidjson::Value*> cells;
    std::vector<std::string> col_names;
    std::vector<bool> is_pkey_column;
    t_uindex nrows = 0;
    for (const auto& it : m_document.GetObj()) {
        if (is_update) {
            // Creation validated these while inferring.
            if (!it.value.IsArray()) {
                PSP_COMPLAIN_AND_ABORT("Malformed column")
            }

            if (it.value.Empty()) {
                PSP_COMPLAIN_AND_ABORT("Can't create table from empty columns")
            }
        }

        cells.push_back(&it.value);
        col_names.emplace_back(it.name.GetString());
        is_pkey_column.push_back(
            is_update
            && std::string_view{it.name.GetString()} == "__INDEX__"
        );

        nrows = std::max(nrows, static_cast<t_uindex>(it.value.Size()));
    }

    const auto& psp_pkey_col = tbl.get_column("psp_pkey");
    const auto psp_okey_col = is_update ? nullptr : tbl.get_column("psp_okey");
    const bool implicit_pkey_from_offset = m_is_implicit && is_update
        && !m_document.GetObj().HasMember("__INDEX__");

    tbl.extend(nrows);
    bool expands = false;
    if (implicit_pkey_from_offset) {
        for (t_uindex ii = 0; ii < nrows; ii++) {
            psp_pkey_col->set_nth<std::uint32_t>(ii, (offset + ii));
        }
    }

    for (std::size_t c = 0; c < cells.size() && !expands; ++c) {
        const auto len = static_cast<t_uindex>(cells[c]->Size());
        for (t_uindex r = 0; r < len; ++r) {
            const auto& cell = (*cells[c])[r];
            if (is_nested(cell, m_mode)) {
                expands = true;
                break;
            }

            if (is_pkey_column[c]) {
                fill_cell(tbl, psp_pkey_col, "psp_pkey", r, cell, is_update);
                continue;
            }

            auto col = resolve_column(tbl, col_names[c], cell, is_update);
            if (!col) {
                continue;
            }

            fill_cell(tbl, col, col_names[c], r, cell, is_update);
            if (!m_is_implicit && index == col_names[c]) {
                fill_column_json(psp_pkey_col, r, cell, is_update);
                if (psp_okey_col) {
                    fill_column_json(psp_okey_col, r, cell, is_update);
                }
            }
        }
    }

    if (!expands) {
        if (m_is_implicit && !is_update) {
            for (t_uindex ii = 0; ii < nrows; ii++) {
                psp_pkey_col->set_nth<std::int32_t>(ii, ii);
                psp_okey_col->set_nth<std::int32_t>(ii, ii);
            }
        }

        return nrows;
    }

    std::vector<std::vector<t_uindex>> widths(cells.size());
    for (std::size_t c = 0; c < cells.size(); ++c) {
        const auto len = static_cast<t_uindex>(cells[c]->Size());
        widths[c].assign(nrows, 1);
        for (t_uindex r = 0; r < len; ++r) {
            widths[c][r] = leaf_width((*cells[c])[r], m_mode);
        }
    }

    std::vector<t_uindex> row_width(nrows, 1);
    std::vector<t_uindex> row_start(nrows, 0);
    std::uint64_t total = 0;
    for (t_uindex r = 0; r < nrows; ++r) {
        t_uindex width = 1;
        const std::string* witness = nullptr;
        for (std::size_t c = 0; c < cells.size(); ++c) {
            const auto w = widths[c][r];
            if (m_mode == LIST_FLATTEN_CARTESIAN) {
                width *= w;
                continue;
            }

            if (w == 1) {
                continue;
            }

            if (witness != nullptr && w != width) {
                std::stringstream ss;
                ss << "Cannot zip `" << *witness << "` (" << width << ") and `"
                   << col_names[c] << "` (" << w << ") of differing length in "
                   << "row " << r
                   << "; use the `cartesian` list flatten mode.\n";
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }

            width = w;
            witness = &col_names[c];
        }

        row_width[r] = width;
        row_start[r] = static_cast<t_uindex>(total);
        total += width;
    }

    check_row_count(total);
    const auto size = static_cast<t_uindex>(total);
    tbl.extend(size);
    if (implicit_pkey_from_offset) {
        for (t_uindex ii = 0; ii < size; ii++) {
            psp_pkey_col->set_nth<std::uint32_t>(ii, (offset + ii));
        }
    }

    std::string path;
    for (std::size_t c = 0; c < cells.size(); ++c) {
        const auto len = static_cast<t_uindex>(cells[c]->Size());
        for (t_uindex r = 0; r < len; ++r) {
            const auto& cell = (*cells[c])[r];
            for (t_uindex k = 0; k < row_width[r]; ++k) {
                const auto ii = row_start[r] + k;
                if (is_pkey_column[c]) {
                    fill_cell(
                        tbl, psp_pkey_col, "psp_pkey", ii, cell, is_update
                    );

                    continue;
                }

                t_uindex sub = 0;
                if (m_mode == LIST_FLATTEN_CARTESIAN) {
                    t_uindex stride = 1;
                    for (std::size_t d = c + 1; d < cells.size(); ++d) {
                        stride *= widths[d][r];
                    }

                    sub = (k / stride) % widths[c][r];
                } else if (widths[c][r] > 1) {
                    sub = k;
                }

                path.assign(col_names[c]);
                emit_leaves(
                    path,
                    cell,
                    sub,
                    widths[c][r],
                    m_mode,
                    [&](const auto& name, const auto& v) {
                        auto col = resolve_column(tbl, name, v, is_update);
                        if (!col) {
                            return;
                        }

                        fill_cell(tbl, col, name, ii, v, is_update);
                        if (!m_is_implicit && index == name) {
                            fill_column_json(psp_pkey_col, ii, v, is_update);
                            if (psp_okey_col) {
                                fill_column_json(
                                    psp_okey_col, ii, v, is_update
                                );
                            }
                        }
                    }
                );
            }
        }
    }

    if (m_is_implicit && !is_update) {
        for (t_uindex ii = 0; ii < size; ii++) {
            psp_pkey_col->set_nth<std::int32_t>(ii, ii);
            psp_okey_col->set_nth<std::int32_t>(ii, ii);
        }
    }

    return size;
}

std::uint32_t
JsonLoader::fill_ndjson(
    t_data_table& tbl,
    const std::string& index,
    std::uint32_t offset,
    bool is_update
) {
    const auto& psp_pkey_col = tbl.get_column("psp_pkey");
    const auto psp_okey_col =
        is_update ? nullptr : tbl.get_column("psp_okey");

    t_uindex ii = 0;
    bool is_finished = false;
    while (!is_finished) {
        bool nested = false;
        for (const auto& it : m_document.GetObj()) {
            if (is_nested(it.value, m_mode)) {
                nested = true;
                break;
            }
        }

        if (!nested) {
            tbl.extend(ii + 1);
            if (m_is_implicit && is_update) {
                psp_pkey_col->set_nth<std::uint32_t>(ii, (ii + offset));
            }

            for (const auto& it : m_document.GetObj()) {
                const auto name = key_name(it.name);
                if (is_update && name == "__INDEX__") {
                    fill_cell(
                        tbl, psp_pkey_col, "psp_pkey", ii, it.value, is_update
                    );

                    continue;
                }

                auto col = resolve_column(tbl, name, it.value, is_update);
                if (!col) {
                    continue;
                }

                fill_cell(tbl, col, name, ii, it.value, is_update);
                if (!m_is_implicit && index == name) {
                    fill_column_json(psp_pkey_col, ii, it.value, is_update);
                    if (psp_okey_col) {
                        fill_column_json(psp_okey_col, ii, it.value, is_update);
                    }
                }
            }

            if (m_is_implicit && !is_update) {
                psp_pkey_col->set_nth<std::int32_t>(ii, ii);
                psp_okey_col->set_nth<std::int32_t>(ii, ii);
            }

            ii++;
            m_document.ParseStream<rapidjson::kParseStopWhenDoneFlag>(m_stream);
            if (m_document.HasParseError()) {
                is_finished = true;
            }

            continue;
        }

        const auto width = leaf_width(m_document, m_mode);
        check_row_count(static_cast<std::uint64_t>(ii) + width);
        tbl.extend(ii + width);

        m_child_widths.clear();
        for (const auto& it : m_document.GetObj()) {
            m_child_widths.push_back(leaf_width(it.value, m_mode));
        }

        for (t_uindex k = 0; k < width; ++k) {
        if (m_is_implicit && is_update) {
            psp_pkey_col->set_nth<std::uint32_t>(ii, (ii + offset));
        }

        std::string path;
        t_uindex stride = width;
        std::size_t ci = 0;
        for (const auto& it : m_document.GetObj()) {
            const auto child_width = m_child_widths[ci++];
            const auto sub = child_slot(k, child_width, stride, m_mode);
            if (is_update
                && std::string_view{it.name.GetString()} == "__INDEX__") {
                fill_cell(
                    tbl, psp_pkey_col, "psp_pkey", ii, it.value, is_update
                );

                continue;
            }

            path.assign(it.name.GetString());
            emit_leaves(
                path,
                it.value,
                sub,
                child_width,
                m_mode,
                [&](const auto& name, const auto& v) {
                auto col = resolve_column(tbl, name, v, is_update);
                if (!col) {
                    return;
                }

                fill_cell(tbl, col, name, ii, v, is_update);
                if (!m_is_implicit && index == name) {
                    fill_column_json(psp_pkey_col, ii, v, is_update);
                    if (psp_okey_col) {
                        fill_column_json(psp_okey_col, ii, v, is_update);
                    }
                }
                }
            );
        }

        if (m_is_implicit && !is_update) {
            psp_pkey_col->set_nth<std::int32_t>(ii, ii);
            psp_okey_col->set_nth<std::int32_t>(ii, ii);
        }

        ii++;
        }

        m_document.ParseStream<rapidjson::kParseStopWhenDoneFlag>(m_stream);
        if (m_document.HasParseError()) {
            is_finished = true;
        }
    }

    tbl.extend(ii);
    return ii;
}

} // namespace perspective::json
