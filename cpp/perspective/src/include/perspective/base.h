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

#ifdef WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif // WIN32

#include <perspective/first.h>
#include <perspective/raw_types.h>
#include <perspective/exports.h>
#include <sstream>
#include <csignal>
#include <iostream>
#include <cstring>
#include <cstdint>
#include <memory>
#include <functional>
#include <algorithm>
#include <iomanip>
#include <chrono>
#include <fstream>
#include <perspective/portable.h>
#include <boost/functional/hash.hpp>
#include <stdlib.h>
#if defined(PSP_DEBUG) && defined(PSP_ENABLE_WASM)
#include <emscripten.h>
#endif

namespace perspective {

const std::int32_t PSP_VERSION = 67;
const double PSP_TABLE_GROW_RATIO = 1.3;

#ifdef WIN32
#define PSP_RESTRICT __restrict
#define PSP_THR_LOCAL __declspec(thread)
#else
#define PSP_RESTRICT __restrict__
#define PSP_THR_LOCAL __thread
#endif // WIN32

const t_index INVALID_INDEX = -1;

#define DEFAULT_CAPACITY 4000
#define DEFAULT_CHUNK_SIZE 4000
#define DEFAULT_EMPTY_CAPACITY 8
#define ROOT_AGGIDX 0
#ifndef CHAR_BIT
#define CHAR_BIT 8
#endif

/**
 * @brief Given an error message, throw the error in the binding language:
 *
 * WASM and Pyodide: throws an `Error()` with the error message.
 * Python: throws a `PerspectiveCppException` with the error message.
 *
 * @param message
 * @return PERSPECTIVE_EXPORT
 */
[[noreturn]]
PERSPECTIVE_EXPORT void psp_abort(const std::string& message);

// #define PSP_TRACE_SENTINEL() t_trace _psp_trace_sentinel;
#define PSP_TRACE_SENTINEL()
#define _ID(x)                                                                 \
    x // https://stackoverflow.com/questions/25144589/c-macro-overloading-is-not-working
#define GET_PSP_VERBOSE_ASSERT(_1, _2, _3, NAME, ...) NAME

#define PSP_CHECK_ARROW_STATUS(X)                                              \
    {                                                                          \
        ::arrow::Status st = X;                                                \
        if (!st.ok()) {                                                        \
            std::stringstream ss;                                              \
            ss << "Arrow operation failed: " << st.message();                  \
            PSP_COMPLAIN_AND_ABORT(ss.str())                                   \
        }                                                                      \
    }

#ifdef PSP_DEBUG
#define PSP_VERBOSE_ASSERT1(COND, MSG)                                         \
    {                                                                          \
        if (!(COND)) {                                                         \
            std::stringstream ss;                                              \
            ss << __FILE__ << ":" << __LINE__ << ": " << MSG << " : "          \
               << perspective::get_error_str();                                \
            perror(ss.str().c_str());                                          \
            psp_abort("Verbose assert failed!");                               \
        }                                                                      \
    }

#define PSP_VERBOSE_ASSERT2(COND, EXPR, MSG)                                   \
    {                                                                          \
        if (!(COND EXPR)) {                                                    \
            std::stringstream ss;                                              \
            ss << __FILE__ << ":" << __LINE__ << ": " << MSG << " : "          \
               << perspective::get_error_str();                                \
            perror(ss.str().c_str());                                          \
            psp_abort("Verbose assert failed!");                               \
        }                                                                      \
    }

#define PSP_ASSERT_SIMPLE_TYPE(X)                                              \
static_assert(                                               \
std::is_pod<X>::value && std::is_standard_layout<X>::value , \
" Unsuitable type found. "

// #define LOG_LIFETIMES 1

#ifdef LOG_LIFETIMES
#define LOG_CONSTRUCTOR(X)                                                     \
    std::cout << "constructing L: " << __LINE__ << " " << (X) << " <" << this  \
              << ">"                                                           \
              << "\n";

#define LOG_DESTRUCTOR(X)                                                      \
    std::cout << "destroying L: " << __LINE__ << " " << (X) << " <" << this    \
              << ">"                                                           \
              << "\n";

#define LOG_INIT(X)                                                            \
    std::cout << "initing L: " << __LINE__ << " " << (X) << " <" << this       \
              << ">"                                                           \
              << "\n";
#else
#define LOG_CONSTRUCTOR(X)
#define LOG_DESTRUCTOR(X)
#define LOG_INIT(X)
#endif
#define LOG_DEBUG(X)                                                           \
    std::cout << __FILE__ << ":" << __LINE__ << " DEBUG: " << X << '\n'
#else
#define PSP_VERBOSE_ASSERT1(COND, MSG)                                         \
    {                                                                          \
        if (!(COND)) {                                                         \
            std::stringstream ss;                                              \
            ss << MSG;                                                         \
            psp_abort(ss.str());                                               \
        }                                                                      \
    }

#define PSP_VERBOSE_ASSERT2(EXPR, COND, MSG)                                   \
    {                                                                          \
        if (!(EXPR COND)) {                                                    \
            std::stringstream ss;                                              \
            ss << MSG;                                                         \
            psp_abort(ss.str());                                               \
        }                                                                      \
    }

#define PSP_ASSERT_SIMPLE_TYPE(X)
#define LOG_CONSTRUCTOR(X)
#define LOG_DESTRUCTOR(X)
#define LOG_INIT(X)
#define LOG_DEBUG(X)
#endif

#if defined(PSP_DEBUG) && defined(PSP_ENABLE_WASM)
#define PSP_COMPLAIN_AND_ABORT(X)                                              \
    {                                                                          \
        std::stringstream __SS__;                                              \
        __SS__ << (X) << "\n";                                                 \
        auto flags = EM_LOG_NO_PATHS;                                          \
        auto len = emscripten_get_callstack(flags, 0, 0);                      \
        std::string err;                                                       \
        err.resize(len);                                                       \
        emscripten_get_callstack(flags, err.data(), len);                      \
        __SS__ << err << "\n";                                                 \
        psp_abort(__SS__.str());                                               \
    }
#else
#define PSP_COMPLAIN_AND_ABORT(X)                                              \
    {                                                                          \
        std::stringstream __SS__;                                              \
        __SS__ << (X) << "\n  at " << __FILE__ << ":" << __LINE__ << "\n";     \
        psp_abort(__SS__.str());                                               \
    }
#endif

#define PSP_VERBOSE_ASSERT(...)                                                        \
    _ID(GET_PSP_VERBOSE_ASSERT(__VA_ARGS__, PSP_VERBOSE_ASSERT2, PSP_VERBOSE_ASSERT1)( \
        __VA_ARGS__                                                                    \
    ))

// Currently only supporting single ports
enum t_gnode_processing_mode {
    NODE_PROCESSING_SIMPLE_DATAFLOW,
    NODE_PROCESSING_KERNEL
};

enum t_pivot_mode {
    PIVOT_MODE_NORMAL,
    PIVOT_MODE_KERNEL,
    PIVOT_MODE_CONCATENATE,
    PIVOT_MODE_TIME_BUCKET_MIN,
    PIVOT_MODE_TIME_BUCKET_HOUR,
    PIVOT_MODE_TIME_BUCKET_DAY,
    PIVOT_MODE_TIME_BUCKET_WEEK,
    PIVOT_MODE_TIME_BUCKET_MONTH,
    PIVOT_MODE_TIME_BUCKET_YEAR
};

enum t_select_mode {
    SELECT_MODE_ALL,
    SELECT_MODE_RANGE,
    SELECT_MODE_MASK,
    SELECT_MODE_PKEY,
    SELECT_MODE_KERNEL
};

enum t_backing_store { BACKING_STORE_MEMORY, BACKING_STORE_DISK };

enum t_filter_op {
    FILTER_OP_LT,
    FILTER_OP_LTEQ,
    FILTER_OP_GT,
    FILTER_OP_GTEQ,
    FILTER_OP_EQ,
    FILTER_OP_NE,
    FILTER_OP_BEGINS_WITH,
    FILTER_OP_ENDS_WITH,
    FILTER_OP_CONTAINS,
    FILTER_OP_OR,
    FILTER_OP_IN,
    FILTER_OP_NOT_IN,
    FILTER_OP_AND,
    FILTER_OP_IS_NULL,
    FILTER_OP_IS_NOT_NULL
};

PERSPECTIVE_EXPORT std::string filter_op_to_str(t_filter_op op);
PERSPECTIVE_EXPORT t_filter_op str_to_filter_op(const std::string& str);

enum t_header { HEADER_ROW, HEADER_COLUMN };

enum t_sorttype {
    SORTTYPE_ASCENDING,
    SORTTYPE_DESCENDING,
    SORTTYPE_NONE,
    SORTTYPE_ASCENDING_ABS,
    SORTTYPE_DESCENDING_ABS
};

PERSPECTIVE_EXPORT t_sorttype str_to_sorttype(const std::string& str);
PERSPECTIVE_EXPORT std::string sorttype_to_str(t_sorttype type);

enum t_aggtype {
    AGGTYPE_SUM,
    AGGTYPE_MUL,
    AGGTYPE_COUNT,
    AGGTYPE_MEAN,
    AGGTYPE_WEIGHTED_MEAN,
    AGGTYPE_UNIQUE,
    AGGTYPE_ANY,
    AGGTYPE_MEDIAN,
    AGGTYPE_JOIN,
    AGGTYPE_SCALED_DIV,
    AGGTYPE_SCALED_ADD,
    AGGTYPE_SCALED_MUL,
    AGGTYPE_DOMINANT,
    AGGTYPE_FIRST,
    AGGTYPE_LAST_BY_INDEX,
    AGGTYPE_LAST_MINUS_FIRST,
    AGGTYPE_PY_AGG,
    AGGTYPE_AND,
    AGGTYPE_OR,
    AGGTYPE_LAST_VALUE,
    AGGTYPE_HIGH_WATER_MARK,
    AGGTYPE_LOW_WATER_MARK,
    AGGTYPE_MAX,
    AGGTYPE_MIN,
    AGGTYPE_HIGH_MINUS_LOW,
    AGGTYPE_UDF_COMBINER,
    AGGTYPE_UDF_REDUCER,
    AGGTYPE_SUM_ABS,
    AGGTYPE_ABS_SUM,
    AGGTYPE_SUM_NOT_NULL,
    AGGTYPE_MEAN_BY_COUNT,
    AGGTYPE_IDENTITY,
    AGGTYPE_DISTINCT_COUNT,
    AGGTYPE_DISTINCT_LEAF,
    AGGTYPE_PCT_SUM_PARENT,
    AGGTYPE_PCT_SUM_GRAND_TOTAL,
    AGGTYPE_VARIANCE,
    AGGTYPE_STANDARD_DEVIATION
};

PERSPECTIVE_EXPORT t_aggtype str_to_aggtype(const std::string& str);
PERSPECTIVE_EXPORT t_aggtype _get_default_aggregate(t_dtype dtype);
PERSPECTIVE_EXPORT std::string _get_default_aggregate_string(t_dtype dtype);

enum t_totals { TOTALS_BEFORE, TOTALS_HIDDEN, TOTALS_AFTER };

enum t_ctx_type {
    UNIT_CONTEXT,
    ZERO_SIDED_CONTEXT,
    ONE_SIDED_CONTEXT,
    TWO_SIDED_CONTEXT,
    GROUPED_ZERO_SIDED_CONTEXT,
    GROUPED_PKEY_CONTEXT,
    GROUPED_COLUMNS_CONTEXT
};

enum t_op { OP_INSERT, OP_DELETE, OP_CLEAR };

enum t_value_transition {
    VALUE_TRANSITION_EQ_FF, // Value did not change, and row remains invalid
    // VALUE_TRANSITION_EQ_FT nonsensical
    // VALUE_TRANSITION_EQ_TF nonsensical
    VALUE_TRANSITION_EQ_TT, // Value did not change, and row remains valid
    // VALUE_TRANSITION_NEQ_FF nonsensical
    VALUE_TRANSITION_NEQ_FT, // Value changed, and row changed from invalid to
                             // valid
    VALUE_TRANSITION_NEQ_TF, // Value changed, and row changed from valid to
                             // invalid
    VALUE_TRANSITION_NEQ_TT, // Value changed and row remains valid
    // VALUE_TRANSITION_EQ_FDF, nonsensical
    // VALUE_TRANSITION_EQ_FDT, nonsensical
    // VALUE_TRANSITION_EQ_TDF, nonsensical
    // VALUE_TRANSITION_EQ_TDT, nonsensical
    // VALUE_TRANSITION_NEQ_FDF, nonsensical
    // VALUE_TRANSITION_NEQ_FDT, nonsensical
    VALUE_TRANSITION_NEQ_TDF,
    VALUE_TRANSITION_NEQ_TDT,
    VALUE_TRANSITION_NVEQ_FT
};

enum t_gnode_type {
    GNODE_TYPE_PKEYED, // Explicit user set pkey
};

enum t_gnode_port {
    PSP_PORT_FLATTENED,   // same schema as iport (pkey,op)
    PSP_PORT_DELTA,       // same schema as state
    PSP_PORT_PREV,        // same schema as state
    PSP_PORT_CURRENT,     // same schema as state
    PSP_PORT_TRANSITIONS, // same schema as state
    PSP_PORT_EXISTED      // same schema as state
};

enum t_ctx_feature {
    CTX_FEAT_PROCESS,
    CTX_FEAT_DELTA,
    CTX_FEAT_ALERT,
    CTX_FEAT_ENABLED,
    CTX_FEAT_LAST_FEATURE
};

enum t_deptype { DEPTYPE_COLUMN, DEPTYPE_AGG, DEPTYPE_SCALAR };

enum t_cmp_op {
    CMP_OP_LT,
    CMP_OP_LTEQ,
    CMP_OP_GT,
    CMP_OP_GTEQ,
    CMP_OP_EQ,
    CMP_OP_NE,
    CMP_OP_BEGINS_WITH,
    CMP_OP_ENDS_WITH,
    CMP_OP_CONTAINS,
    CMP_OP_OR,
    CMP_OP_IN,
    CMP_OP_AND
};

enum t_invmode {
    INV_SUBST_CANONICAL, // Substitute canonical data with canonical
                         // forms
    INV_EXCLUDE,         // Exclude invalid data from calculations
    INV_PROPAGATE        // Propagate invalid virally
};

enum t_range_mode {
    RANGE_ROW,
    RANGE_ROW_COLUMN,
    RANGE_ROW_PATH,
    RANGE_ROW_COLUMN_PATH,
    RANGE_ALL,
    RANGE_EXPR
};

enum t_fetch {
    FETCH_RANGE,
    FETCH_ROW_PATHS,
    FETCH_COLUMN_PATHS,
    FETCH_ROW_INDICES,
    FETCH_COLUMN_INDICES,
    FETCH_ROW_DATA_SLICE,
    FETCH_COLUMN_DATA_SLICE,
    FETCH_STYLE_SLICE,
    FETCH_USER_DATA_SLICE,
    FETCH_ROW_DEPTH,
    FETCH_COLUMN_DEPTH,
    FETCH_IS_ROW_EXPANDED,
    FETCH_IS_COLUMN_EXPANDED,
    FETCH_IS_ROOT,
    FETCH_COLUMN_NAMES,
    FETCH_CONFIG
};

enum t_fmode { FMODE_SIMPLE_CLAUSES, FMODE_JIT_EXPR };

#ifdef WIN32
#define PSP_NON_COPYABLE(X)
#else
#define PSP_NON_COPYABLE(X)                                                    \
    X(const X&) = delete;                                                      \
    X& operator=(const X&) = delete
#endif

PERSPECTIVE_EXPORT std::string get_error_str();
PERSPECTIVE_EXPORT bool is_numeric_type(t_dtype dtype);
PERSPECTIVE_EXPORT bool is_floating_point(t_dtype dtype);
PERSPECTIVE_EXPORT bool is_linear_order_type(t_dtype dtype);
PERSPECTIVE_EXPORT std::string get_dtype_descr(t_dtype dtype);
PERSPECTIVE_EXPORT std::string dtype_to_str(t_dtype dtype);
PERSPECTIVE_EXPORT t_dtype str_to_dtype(const std::string& typestring);
PERSPECTIVE_EXPORT std::string get_status_descr(t_status dtype);
PERSPECTIVE_EXPORT t_uindex get_dtype_size(t_dtype dtype);
PERSPECTIVE_EXPORT bool is_vlen_dtype(t_dtype dtype);
PERSPECTIVE_EXPORT bool is_neq_transition(t_value_transition t);
PERSPECTIVE_EXPORT std::string value_transition_to_str(t_value_transition t);

template <typename T>
inline std::ostream&
operator<<(std::ostream& os, const std::vector<T>& row) {
    for (int i = 0, loop_end = row.size(); i < loop_end; ++i) {
        os << row[i] << ", ";
    }

    return os;
}

template <typename FIRST_T, typename SECOND_T>
inline std::ostream&
operator<<(std::ostream& os, const std::pair<FIRST_T, SECOND_T>& p) {
    os << "<" << p.first << ", " << p.second << ">";
    return os;
}

void check_init(bool init, const char* file, std::int32_t line);

t_uindex root_pidx();

struct PERSPECTIVE_EXPORT t_cmp_charptr {
    bool
    operator()(const char* a, const char* b) const {
        return std::strcmp(a, b) < 0;
    }
};

template <class Arg1, class Arg2, class Result>
struct binary_function {
    using first_argument_type = Arg1;
    using second_argument_type = Arg2;
    using result_type = Result;
};

struct t_cchar_umap_cmp
    : public binary_function<const char*, const char*, bool> {
    inline bool
    operator()(const char* x, const char* y) const {
        return strcmp(x, y) == 0;
    }
};

struct t_cchar_umap_hash {
    inline t_uindex
    operator()(const char* s) const {
        return boost::hash_range(s, s + std::strlen(s));
    }
};

bool is_internal_colname(const std::string& c);

bool is_deterministic_sized(t_dtype dtype);

template <typename DATA_T>
std::string
psp_to_str(const DATA_T& s) {
    std::stringstream ss;
    ss << s;
    return ss.str();
}

template <typename T>
PERSPECTIVE_EXPORT t_dtype type_to_dtype();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::int64_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::int32_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::int16_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::int8_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::uint64_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::uint32_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::uint16_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::uint8_t>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<double>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<float>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<bool>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<t_time>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<t_date>();

template <>
PERSPECTIVE_EXPORT t_dtype type_to_dtype<std::string>();

} // end namespace perspective

namespace std {
template <>
struct hash<std::pair<perspective::t_uindex, perspective::t_uindex>> {
    typedef std::pair<perspective::t_uindex, perspective::t_uindex>
        argument_type;
    typedef std::size_t result_type;

    result_type
    operator()(argument_type const& s) const {
        result_type const h1(std::hash<perspective::t_uindex>()(s.first));
        result_type const h2(std::hash<perspective::t_uindex>()(s.second));
        return h1 ^ (h2 << 1);
    }
};

void string_to_lower(string& str);

} // end namespace std
