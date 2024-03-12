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
#include <perspective/raw_types.h>
#include <perspective/exports.h>
#include <perspective/date.h>
#include <perspective/time.h>
#include <perspective/none.h>
#include <chrono>
#include <cstring>
#include <cstdio>
#include <functional>
#include <cstdint>
#include <vector>
#include <date/date.h>
#include <tsl/hopscotch_set.h>
#include <tsl/hopscotch_map.h>
#include <boost/algorithm/string/case_conv.hpp>
#include <sstream>
#include <functional> //std::hash

namespace perspective {

template <template <typename COMPARED_T> class COMPARER_T>
struct PERSPECTIVE_EXPORT t_const_char_comparator {
    inline bool
    operator()(const char* s1, const char* s2) const {
        COMPARER_T<t_index> cmp;
        int cmpval = std::strcmp(s1, s2);
        return cmp(cmpval, 0);
    }
};

const int SCALAR_INPLACE_LEN = 13;

union t_scalar_u {
    std::int64_t m_int64;
    std::int32_t m_int32;
    std::int16_t m_int16;
    std::int8_t m_int8;

    std::uint64_t m_uint64;
    std::uint32_t m_uint32;
    std::uint16_t m_uint16;
    std::uint8_t m_uint8;

    double m_float64;
    float m_float32;

    bool m_bool;

    const char* m_charptr;
    char m_inplace_char[SCALAR_INPLACE_LEN];
};

// t_scalar should remain a POD type.
struct PERSPECTIVE_EXPORT t_tscalar {

    t_tscalar() = default;

    /**
     * @brief A functional-style cast from int to `t_tscalar` used widely
     * by Exprtk. The scalar returned is of DTYPE_FLOAT64, so we don't have
     * to promote from int to float later on.
     *
     * @param v
     */
    t_tscalar(int v);

    template <typename T>
    T get() const = delete;

    void set(std::int64_t v);
    void set(std::int32_t v);
    void set(std::int16_t v);
    void set(std::int8_t v);

    void set(std::uint64_t v);
    void set(std::uint32_t v);
    void set(std::uint16_t v);
    void set(std::uint8_t v);

    void set(bool v);
    void set(t_date v);
    void set(t_time v);
    void set(const char* v);
    void set(t_none v);
    void set(double v);
    void set(float v);
    void set(t_tscalar v);

    void set_status(t_status s);

    bool is_nan() const;
    bool is_none() const;
    bool is_str() const;
    bool is_of_type(unsigned char t) const;
    bool is_floating_point() const;
    bool is_signed() const;

    template <template <typename COMPARED_T> class COMPARER_T>
    bool compare_common(const t_tscalar& rhs) const;

    bool operator==(const t_tscalar& rhs) const;
    bool operator!=(const t_tscalar& rhs) const;
    bool operator<(const t_tscalar& rhs) const;
    bool operator>(const t_tscalar& rhs) const;
    bool operator>=(const t_tscalar& rhs) const;
    bool operator<=(const t_tscalar& rhs) const;

    t_tscalar operator+() const;
    t_tscalar operator-() const;

    t_tscalar operator+(const t_tscalar& other) const;
    t_tscalar operator-(const t_tscalar& other) const;
    t_tscalar operator*(const t_tscalar& other) const;
    t_tscalar operator/(const t_tscalar& other) const;
    t_tscalar operator%(const t_tscalar& other) const;

    template <typename T>
    t_tscalar operator+(T other) const;
    template <typename T>
    t_tscalar operator-(T other) const;
    template <typename T>
    t_tscalar operator*(T other) const;
    template <typename T>
    t_tscalar operator/(T other) const;
    template <typename T>
    t_tscalar operator%(T other) const;

    t_tscalar& operator+=(const t_tscalar& rhs);
    t_tscalar& operator-=(const t_tscalar& rhs);
    t_tscalar& operator*=(const t_tscalar& rhs);
    t_tscalar& operator/=(const t_tscalar& rhs);
    t_tscalar& operator%=(const t_tscalar& rhs);

    t_tscalar add_typesafe(const t_tscalar& rhs) const;
    t_tscalar sub_typesafe(const t_tscalar& rhs) const;

    bool is_numeric() const;

    static t_tscalar canonical(t_dtype dtype);

    t_tscalar abs() const;
    t_tscalar negate() const;

    t_tscalar add(const t_tscalar& other) const;
    t_tscalar mul(const t_tscalar& other) const;
    t_tscalar difference(const t_tscalar& other) const;

    bool cmp(t_filter_op op, const t_tscalar& other) const;

    std::string repr() const;
    std::string to_string(bool for_expr = false) const;
    double to_double() const;
    std::int64_t to_int64() const;
    std::int32_t to_int32() const;
    std::uint64_t to_uint64() const;

    bool begins_with(const t_tscalar& other) const;
    bool ends_with(const t_tscalar& other) const;
    bool contains(const t_tscalar& other) const;
    bool is_valid() const;

    /**
     * @brief Identical to operator bool(), but less ambiguous.
     *
     * @return true
     * @return false
     */
    bool as_bool() const;

    void clear();
    t_dtype get_dtype() const;
    const char* get_char_ptr() const;
    bool is_inplace() const;
    static bool can_store_inplace(const char* s);

    template <typename DATA_T>
    t_tscalar coerce_numeric() const;

    t_tscalar coerce_numeric_dtype(t_dtype dtype) const;

    t_scalar_u m_data;
    unsigned char m_type;
    t_status m_status;
    bool m_inplace;
};

// inline t_tscalar operator"" _ts(long double v) {
//     t_tscalar rv;
//     double tmp = v;
//     rv.set(tmp);
//     return rv;
// }

// inline t_tscalar operator"" _ts(unsigned long long int v) {
//     t_tscalar rv;
//     std::int64_t tmp = v;
//     rv.set(tmp);
//     return rv;
// }

// inline t_tscalar operator"" _ts(const char* v, std::size_t len) {
//     t_tscalar rv;
//     rv.set(v);
//     return rv;
// }

// inline t_tscalar operator"" _ns(long double v) {
//     t_tscalar rv;
//     rv.m_data.m_uint64 = 0;
//     rv.m_type = DTYPE_FLOAT64;
//     rv.m_status = STATUS_INVALID;
//     return rv;
// }

// inline t_tscalar operator"" _ns(unsigned long long int v) {
//     t_tscalar rv;
//     rv.m_data.m_uint64 = 0;
//     rv.m_type = DTYPE_INT64;
//     rv.m_status = STATUS_INVALID;
//     return rv;
// }

// inline t_tscalar operator"" _ns(const char* v, std::size_t len) {
//     t_tscalar rv;
//     rv.m_data.m_uint64 = 0;
//     rv.m_type = DTYPE_STR;
//     rv.m_status = STATUS_INVALID;
//     return rv;
// }

PERSPECTIVE_EXPORT t_tscalar mknone();
PERSPECTIVE_EXPORT t_tscalar mknull(t_dtype dtype);
PERSPECTIVE_EXPORT t_tscalar mkclear(t_dtype dtype);

template <typename DATA_T>
t_tscalar
t_tscalar::coerce_numeric() const {
    auto v = to_double();
    DATA_T converted(v);
    t_tscalar rv = mknone();
    rv.set(converted);
    return rv;
}

template <>
t_tscalar t_tscalar::coerce_numeric<bool>() const;

template <>
PERSPECTIVE_EXPORT std::int64_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT std::int32_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT std::int16_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT std::int8_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT std::uint64_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT std::uint32_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT std::uint16_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT std::uint8_t t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT t_date t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT t_time t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT const char* t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT t_none t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT double t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT float t_tscalar::get() const;

template <>
PERSPECTIVE_EXPORT bool t_tscalar::get() const;

template <template <typename COMPARED_T> class COMPARER_T>
bool
t_tscalar::compare_common(const t_tscalar& rhs) const {
    // TODO: compare_common only works for equal types. This is probably
    // something we don't want to change on a whim, as it is probably
    // widely used and not something that we can easily trace through
    // text-search or profiling, and changing this behavior will result in
    // a whole load of edge cases.
    if (m_type != rhs.m_type) {
        COMPARER_T<unsigned char> cmp;
        return cmp(m_type, rhs.m_type);
    }

    if (m_status != rhs.m_status) {
        COMPARER_T<unsigned char> cmp;
        return cmp(m_status, rhs.m_status);
    }

    switch (m_type) {
        case DTYPE_INT64: {
            COMPARER_T<std::int64_t> cmp;
            return cmp(m_data.m_int64, rhs.m_data.m_int64);
        } break;
        case DTYPE_INT32: {
            COMPARER_T<std::int32_t> cmp;
            return cmp(m_data.m_int32, rhs.m_data.m_int32);
        } break;
        case DTYPE_INT16: {
            COMPARER_T<std::int16_t> cmp;
            return cmp(m_data.m_int16, rhs.m_data.m_int16);
        } break;
        case DTYPE_INT8: {
            COMPARER_T<std::int8_t> cmp;
            return cmp(m_data.m_int8, rhs.m_data.m_int8);
        } break;
        case DTYPE_UINT64: {
            COMPARER_T<std::uint64_t> cmp;
            return cmp(m_data.m_uint64, rhs.m_data.m_uint64);
        } break;
        case DTYPE_UINT32: {
            COMPARER_T<std::uint32_t> cmp;
            return cmp(m_data.m_uint32, rhs.m_data.m_uint32);
        } break;
        case DTYPE_UINT16: {
            COMPARER_T<std::uint16_t> cmp;
            return cmp(m_data.m_uint16, rhs.m_data.m_uint16);
        } break;
        case DTYPE_UINT8: {
            COMPARER_T<std::uint8_t> cmp;
            return cmp(m_data.m_uint8, rhs.m_data.m_uint8);
        } break;
        case DTYPE_FLOAT64: {
            COMPARER_T<double> cmp;
            return cmp(m_data.m_float64, rhs.m_data.m_float64);
        } break;
        case DTYPE_FLOAT32: {
            COMPARER_T<float> cmp;
            return cmp(m_data.m_float32, rhs.m_data.m_float32);
        } break;
        case DTYPE_DATE: {
            COMPARER_T<std::uint32_t> cmp;
            return cmp(m_data.m_uint32, rhs.m_data.m_uint32);
        } break;
        case DTYPE_TIME: {
            COMPARER_T<std::int64_t> cmp;
            return cmp(m_data.m_int64, rhs.m_data.m_int64);
        } break;
        case DTYPE_BOOL: {
            COMPARER_T<bool> cmp;
            return cmp(m_data.m_bool, rhs.m_data.m_bool);
        } break;
        case DTYPE_NONE: {
            COMPARER_T<t_none> cmp;
            return cmp(t_none(), t_none());
        } break;
        case DTYPE_STR: {
            t_const_char_comparator<COMPARER_T> cmp;
            return cmp(get_char_ptr(), rhs.get_char_ptr());
        } break;
        case DTYPE_OBJECT: {
            PSP_COMPLAIN_AND_ABORT("Object columns not supported");
        } break;
        default: {
#ifdef PSP_DEBUG
            std::cout << __FILE__ << ":" << __LINE__ << " Reached unknown type "
                      << m_type << "\n";
#endif
            return false;
        }
    }
}

template <typename T>
struct t_tscal_extractor {
    static bool
    extract(T& output, const t_tscalar& in) {
        if (in.is_none()) {
            return false;
        }
        output = in.get<T>();
        return true;
    }
};

std::string repr(const t_tscalar& s);

size_t hash_value(const t_tscalar& s);

template <typename T>
t_tscalar
mktscalar(const T& v) {
    t_tscalar rval;
    rval.set(v);
    return rval;
}

t_tscalar mktscalar();

/**
 * @brief Overload comparisons between size_t and t_tscalar as the comparison
 * is used in exprtk for scalar initialization.
 *
 * @param lhs
 * @param rhs
 * @return true
 * @return false
 */
bool operator>(const std::size_t& lhs, const t_tscalar& rhs);

} // end namespace perspective

namespace std {

template <>
struct hash<perspective::t_tscalar> {
    // Enable the use of tsl::hopscotch_map
    size_t
    operator()(const perspective::t_tscalar& key) const {
        return perspective::hash_value(key);
    }
};

PERSPECTIVE_EXPORT std::ostream&
operator<<(std::ostream& os, const perspective::t_tscalar& t);
PERSPECTIVE_EXPORT std::ostream&
operator<<(std::ostream& os, const std::vector<perspective::t_tscalar>& t);

/**
 * exprtk uses std::numeric_limits<T>::quiet_NaN() and min_exponent10.
 */
template <>
class numeric_limits<perspective::t_tscalar> {
public:
    static perspective::t_tscalar
    quiet_NaN() {
        // TODO: could stop allocating all those nans and fallback to
        // a static nan value?
        return perspective::mknone();
    }

    static perspective::t_tscalar
    infinity() {
        perspective::t_tscalar rval;
        rval.set(std::numeric_limits<double>::infinity());
        return rval;
    }
};
} // namespace std
