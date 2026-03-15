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

#include <perspective/first.h>
#include <perspective/base.h>
#include <perspective/raw_types.h>
#include <perspective/scalar.h>
#include <perspective/sym_table.h>
#include <cstring>
#include <cstdio>
#include <functional>
#include <cstdint>
#include <vector>
#include <boost/algorithm/string/case_conv.hpp>
#include <sstream>
#include <cmath>
#include <limits>
SUPPRESS_WARNINGS_VC(4800)

namespace perspective {

bool
operator>(const std::size_t& lhs, const t_tscalar& rhs) {
    return rhs.operator<(lhs);
}

#define BINARY_OPERATOR_BODY(OP)                                               \
    t_tscalar rval;                                                            \
    rval.clear();                                                              \
    rval.m_type = DTYPE_FLOAT64;                                               \
    if (!is_numeric() || !other.is_numeric()) {                                \
        rval.m_status = STATUS_CLEAR;                                          \
    }                                                                          \
    if (!other.is_valid() || !is_valid()) {                                    \
        return rval;                                                           \
    }                                                                          \
    if (m_type == DTYPE_FLOAT64 && other.m_type == DTYPE_FLOAT64) {            \
        rval.set(m_data.m_float64 OP other.m_data.m_float64);                 \
        return rval;                                                           \
    }                                                                          \
    if (m_type == DTYPE_INT64 && other.m_type == DTYPE_INT64) {                \
        rval.set(static_cast<double>(                                          \
            m_data.m_int64 OP other.m_data.m_int64));                          \
        return rval;                                                           \
    }                                                                          \
    if (m_type == DTYPE_INT32 && other.m_type == DTYPE_INT32) {                \
        rval.set(static_cast<double>(                                          \
            m_data.m_int32 OP other.m_data.m_int32));                          \
        return rval;                                                           \
    }                                                                          \
    rval.set(to_double() OP other.to_double());                                \
    return rval;

/**
 * @brief A function-style cast used only by ExprTk. Because ExprTk was
 * designed to be used with numeric inputs or numeric-like inputs, it makes
 * various assertions of its input type, which include calling this
 * function-style cast through `T(0)`, `T(1)` etc. Because we can't guarantee
 * what int this function is called with, we treat it as a double to
 * prevent overflow.
 *
 * DO NOT USE THIS CONSTRUCTOR IN PERSPECTIVE - all `t_tscalar` objects
 * should be constructed without initializer and then `set` should be called:
 *
 * t_tscalar x;
 * x.set(1.2345);
 *
 * @param v
 */
t_tscalar::t_tscalar(int v) { this->set(static_cast<double>(v)); }

bool
t_tscalar::is_none() const {
    return m_type == DTYPE_NONE;
}

bool
t_tscalar::is_str() const {
    return m_type == DTYPE_STR;
}

bool
t_tscalar::is_of_type(unsigned char t) const {
    return m_type == t;
}

bool
t_tscalar::operator==(const t_tscalar& rhs) const {
    if (m_type != rhs.m_type || m_status != rhs.m_status) {
        return false;
    }

    if ((m_status == STATUS_INVALID || m_status == STATUS_CLEAR)
        && (rhs.m_status == STATUS_INVALID || rhs.m_status == STATUS_CLEAR)) {
        return true;
    }

    if (m_type == DTYPE_BOOL) {
        return get<bool>() == rhs.get<bool>();
    }

    if (m_type != DTYPE_STR) {
        return m_data.m_uint64 == rhs.m_data.m_uint64;
    }

    return strcmp(get_char_ptr(), rhs.get_char_ptr()) == 0;
}

bool
t_tscalar::operator!=(const t_tscalar& rhs) const {
    return !operator==(rhs);
}

bool
t_tscalar::operator<(const t_tscalar& rhs) const {
    return compare_common<std::less>(rhs);
}

bool
t_tscalar::operator>(const t_tscalar& rhs) const {
    return compare_common<std::greater>(rhs);
}

bool
t_tscalar::operator>=(const t_tscalar& rhs) const {
    return compare_common<std::greater_equal>(rhs);
}

bool
t_tscalar::operator<=(const t_tscalar& rhs) const {
    return compare_common<std::less_equal>(rhs);
}

t_tscalar
t_tscalar::operator+() const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = m_type;

    if (!is_numeric()) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!is_valid()) {
        return rval;
    }

    switch (m_type) {
        case DTYPE_INT64: {
            rval.set(+(m_data.m_int64));
        } break;
        case DTYPE_INT32: {
            rval.set(+(m_data.m_int32));
        } break;
        case DTYPE_INT16: {
            rval.set(+(m_data.m_int16));
        } break;
        case DTYPE_INT8: {
            rval.set(+(m_data.m_int8));
        } break;
        case DTYPE_UINT64: {
            rval.set(+(m_data.m_uint64));
        } break;
        case DTYPE_UINT32: {
            rval.set(+(m_data.m_uint32));
        } break;
        case DTYPE_UINT16: {
            rval.set(+(m_data.m_uint16));
        } break;
        case DTYPE_UINT8: {
            rval.set(+(m_data.m_uint8));
        } break;
        case DTYPE_FLOAT64: {
            rval.set(+(m_data.m_float64));
        } break;
        case DTYPE_FLOAT32: {
            rval.set(+(m_data.m_float32));
        } break;
        default:
            return mknone();
    }

    return rval;
}

t_tscalar
t_tscalar::operator-() const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = m_type;

    if (!is_numeric()) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!is_valid()) {
        return rval;
    }

    switch (m_type) {
        case DTYPE_INT64: {
            rval.set(-m_data.m_int64);
        } break;
        case DTYPE_INT32: {
            rval.set(-m_data.m_int32);
        } break;
        case DTYPE_INT16: {
            rval.set(-m_data.m_int16);
        } break;
        case DTYPE_INT8: {
            rval.set(-m_data.m_int8);
        } break;
        case DTYPE_UINT64: {
            rval.set(-m_data.m_uint64);
        } break;
        case DTYPE_UINT32: {
            rval.set(-m_data.m_uint32);
        } break;
        case DTYPE_UINT16: {
            rval.set(-m_data.m_uint16);
        } break;
        case DTYPE_UINT8: {
            rval.set(-m_data.m_uint8);
        } break;
        case DTYPE_FLOAT64: {
            rval.set(-m_data.m_float64);
        } break;
        case DTYPE_FLOAT32: {
            rval.set(-m_data.m_float32);
        } break;
        default:
            return mknone();
    }

    return rval;
}

t_tscalar
t_tscalar::operator+(const t_tscalar& other) const {BINARY_OPERATOR_BODY(+)}

t_tscalar t_tscalar::operator-(const t_tscalar& other
) const {BINARY_OPERATOR_BODY(-)}

t_tscalar t_tscalar::operator*(const t_tscalar& other
) const {BINARY_OPERATOR_BODY(*)}

t_tscalar t_tscalar::operator/(const t_tscalar& other) const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;

    if (!is_numeric() || !other.is_numeric()) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!is_valid() || !other.is_valid()) {
        return rval;
    }

    if (other.to_double() == 0) {
        return rval;
    }

    rval.set(to_double() / other.to_double());

    return rval;
}

t_tscalar
t_tscalar::operator%(const t_tscalar& other) const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;

    if (!is_numeric() || !other.is_numeric()) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!is_valid() || !other.is_valid()) {
        return rval;
    }

    if (other.to_double() == 0) {
        return rval;
    }

    rval.set(fmod(to_double(), other.to_double()));

    return rval;
}

template <typename T>
t_tscalar
t_tscalar::operator+(T other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator+(other_scalar);
}

template <>
t_tscalar
t_tscalar::operator+(unsigned int other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator+(other_scalar);
}

template <typename T>
t_tscalar
t_tscalar::operator-(T other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator-(other_scalar);
}

template <typename T>
t_tscalar
t_tscalar::operator*(T other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator*(other_scalar);
}

template <>
t_tscalar
t_tscalar::operator*(int other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator*(other_scalar);
}

template <>
t_tscalar
t_tscalar::operator*(double other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator*(other_scalar);
}

template <typename T>
t_tscalar
t_tscalar::operator/(T other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator/(other_scalar);
}

/**
 * Win32 build complains if the std::uint64_t specialization is unset, and
 * Linux complains if the std::uint64_t is set as it somehow conflicts with
 * the unsigned long specialization below the ifdef.
 */
#ifdef WIN32
template <>
t_tscalar
t_tscalar::operator/(std::uint64_t other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator/(other_scalar);
}
#endif

template <>
t_tscalar
t_tscalar::operator/(unsigned long other) const {
    t_tscalar other_scalar;
    other_scalar.set(static_cast<std::uint32_t>(other));
    return this->operator/(other_scalar);
}

template <>
t_tscalar
t_tscalar::operator/(double other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator/(other_scalar);
}

template <typename T>
t_tscalar
t_tscalar::operator%(T other) const {
    t_tscalar other_scalar;
    other_scalar.set(other);
    return this->operator%(other_scalar);
}

t_tscalar&
t_tscalar::operator+=(const t_tscalar& rhs) {
    t_tscalar tmp = this->operator+(rhs);
    this->set(tmp);
    return *this;
}

t_tscalar&
t_tscalar::operator-=(const t_tscalar& rhs) {
    t_tscalar tmp = this->operator-(rhs);
    this->set(tmp);
    return *this;
}

t_tscalar&
t_tscalar::operator*=(const t_tscalar& rhs) {
    t_tscalar tmp = this->operator*(rhs);
    this->set(tmp);
    return *this;
}

t_tscalar&
t_tscalar::operator/=(const t_tscalar& rhs) {
    t_tscalar tmp = this->operator/(rhs);
    this->set(tmp);
    return *this;
}

t_tscalar&
t_tscalar::operator%=(const t_tscalar& rhs) {
    t_tscalar tmp = this->operator%(rhs);
    this->set(tmp);
    return *this;
}

t_tscalar::operator std::size_t() const {
    switch (get_dtype()) {
        case perspective::t_dtype::DTYPE_INT64:
            return static_cast<std::size_t>(get<std::int64_t>());
        case perspective::t_dtype::DTYPE_INT32:
            return static_cast<std::size_t>(get<std::int32_t>());
        case perspective::t_dtype::DTYPE_INT16:
            return static_cast<std::size_t>(get<std::int16_t>());
        case perspective::t_dtype::DTYPE_INT8:
            return static_cast<std::size_t>(get<std::int8_t>());
        case perspective::t_dtype::DTYPE_UINT64:
            return static_cast<std::size_t>(get<std::uint64_t>());
        case perspective::t_dtype::DTYPE_UINT32:
            return static_cast<std::size_t>(get<std::uint32_t>());
        case perspective::t_dtype::DTYPE_UINT16:
            return static_cast<std::size_t>(get<std::uint16_t>());
        case perspective::t_dtype::DTYPE_UINT8:
            return static_cast<std::size_t>(get<std::uint8_t>());
        case perspective::t_dtype::DTYPE_FLOAT64:
            return static_cast<std::size_t>(get<double>());
        case perspective::t_dtype::DTYPE_FLOAT32:
            return static_cast<std::size_t>(get<float>());
        default:
            return std::numeric_limits<std::size_t>::max();
    }

    return std::numeric_limits<std::size_t>::max();
}

t_tscalar
t_tscalar::add_typesafe(const t_tscalar& rhs) const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;
    if (!is_numeric() || !rhs.is_numeric()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }
    if (!rhs.is_valid() || !is_valid()) {
        return rval;
    }
    if (is_floating_point() || rhs.is_floating_point()) {
        rval.m_type = DTYPE_FLOAT64;
        rval.set(to_double() + rhs.to_double());
        return rval;
    }
    rval.m_type = DTYPE_INT64;
    rval.set(to_int64() + rhs.to_int64());
    return rval;
}

t_tscalar
t_tscalar::sub_typesafe(const t_tscalar& rhs) const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;
    if (!is_numeric() || !rhs.is_numeric()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }
    if (!rhs.is_valid() || !is_valid()) {
        return rval;
    }
    if (is_floating_point()) {
        rval.m_type = DTYPE_FLOAT64;
        rval.set(to_double() - rhs.to_double());
        return rval;
    }
    rval.m_type = DTYPE_INT32;
    rval.set(to_int32() - rhs.to_int32());
    return rval;
}

bool
t_tscalar::is_numeric() const {
    return is_numeric_type(static_cast<t_dtype>(m_type));
}

void
t_tscalar::clear() {
    m_type = DTYPE_NONE;
    m_data.m_uint64 = 0;
    m_status = STATUS_INVALID;
}

t_tscalar
t_tscalar::canonical(t_dtype dtype) {
    t_tscalar rval;
    rval.clear();
    rval.m_status = STATUS_VALID;

    switch (dtype) {
        case DTYPE_INT64: {
            rval.set(std::int64_t(0));
        } break;
        case DTYPE_INT32: {
            rval.set(std::int32_t(0));
        } break;
        case DTYPE_INT16: {
            rval.set(std::int16_t(0));
        } break;
        case DTYPE_INT8: {
            rval.set(std::int8_t(0));
        } break;

        case DTYPE_UINT64: {
            rval.set(std::uint64_t(0));
        } break;
        case DTYPE_UINT32: {
            rval.set(std::uint32_t(0));
        } break;
        case DTYPE_UINT16: {
            rval.set(std::uint16_t(0));
        } break;
        case DTYPE_UINT8: {
            rval.set(std::uint8_t(0));
        } break;

        case DTYPE_FLOAT64: {
            rval.set(double(0));
        } break;
        case DTYPE_FLOAT32: {
            rval.set(float(0));
        } break;
        case DTYPE_DATE: {
            rval.set(t_date(std::uint32_t(0)));
        } break;
        case DTYPE_TIME: {
            rval.set(t_time(0));
        } break;
        case DTYPE_BOOL: {
            rval.set(false);
        } break;
        case DTYPE_NONE: {
            // handled trivially
        } break;
        case DTYPE_STR: {
            rval.m_type = DTYPE_STR;
        } break;
        case DTYPE_OBJECT:
        default: {
            PSP_COMPLAIN_AND_ABORT("Found unknown dtype.");
        }
    }

    return rval;
}

void
t_tscalar::set(std::int64_t v) {
    m_type = DTYPE_INT64;
    m_data.m_int64 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(std::int32_t v) {
    m_type = DTYPE_INT32;
    m_data.m_uint64 = 0;
    m_data.m_int32 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(std::int16_t v) {
    m_type = DTYPE_INT16;
    m_data.m_uint64 = 0;
    m_data.m_int16 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(std::int8_t v) {
    m_type = DTYPE_INT8;
    m_data.m_uint64 = 0;
    m_data.m_int8 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(std::uint64_t v) {
    m_type = DTYPE_UINT64;
    m_data.m_uint64 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(std::uint32_t v) {
    m_type = DTYPE_UINT32;
    m_data.m_uint64 = 0;
    m_data.m_uint32 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(std::uint16_t v) {
    m_type = DTYPE_UINT16;
    m_data.m_uint64 = 0;
    m_data.m_uint16 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(std::uint8_t v) {
    m_type = DTYPE_UINT8;
    m_data.m_uint64 = 0;
    m_data.m_uint8 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(double v) {
    m_type = DTYPE_FLOAT64;
    m_data.m_float64 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(float v) {
    m_type = DTYPE_FLOAT32;
    m_data.m_uint64 = 0;
    m_data.m_float32 = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(bool v) {
    m_type = DTYPE_BOOL;
    m_data.m_uint64 = 0;
    m_data.m_bool = v;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(const char* v) {
    m_type = DTYPE_STR;
#ifdef PSP_SSO_SCALAR
    if (can_store_inplace(v)) {
        strncpy(reinterpret_cast<char*>(&m_data), v, SCALAR_INPLACE_LEN);
        m_inplace = true;
    } else {
        m_data.m_charptr = v;
        m_inplace = false;
    }
#else
    m_data.m_charptr = v;
#endif
    m_status = STATUS_VALID;
}

void
t_tscalar::set(const t_date v) {
    m_type = DTYPE_DATE;
    m_data.m_uint64 = 0;
    m_data.m_uint32 = v.raw_value();
    m_status = STATUS_VALID;
}

void
t_tscalar::set(const t_time v) {
    m_type = DTYPE_TIME;
    m_data.m_int64 = v.raw_value();
    m_status = STATUS_VALID;
}

void
t_tscalar::set(const t_none v) {
    m_data.m_uint64 = 0;
    m_type = DTYPE_NONE;
    m_status = STATUS_VALID;
}

void
t_tscalar::set(const t_tscalar v) {
    m_type = v.m_type;
    memcpy(&m_data, &(v.m_data), sizeof(t_scalar_u));
    m_status = v.m_status;
#ifdef PSP_SSO_SCALAR
    m_inplace = v.m_inplace;
#endif
}

void
t_tscalar::set_status(t_status s) {
    m_status = s;
};

t_tscalar
t_tscalar::abs() const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = m_type;

    if (!is_valid()) {
        return rval;
    }

    switch (m_type) {
        case DTYPE_INT64: {
            std::int64_t v = std::abs(to_double());
            rval.set(v);
        } break;
        case DTYPE_INT32: {
            std::int32_t v = std::abs(to_double());
            rval.set(v);
        } break;
        case DTYPE_INT16: {
            std::int16_t v = std::abs(to_double());
            rval.set(v);
        } break;
        case DTYPE_INT8: {
            std::int8_t v = std::abs(to_double());
            rval.set(v);
        } break;
        case DTYPE_UINT64:
        case DTYPE_UINT32:
        case DTYPE_UINT16:
        case DTYPE_UINT8: {
            return *this;
        } break;

        case DTYPE_FLOAT64: {
            rval.set(std::abs(m_data.m_float64));
        } break;
        case DTYPE_FLOAT32: {
            rval.set(std::abs(m_data.m_float32));
        } break;
        default: {
            // no-op
        }
    }
    return rval;
}

t_tscalar
t_tscalar::negate() const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = m_type;

    if (!is_valid()) {
        return rval;
    }

    switch (m_type) {
        case DTYPE_INT64: {
            rval.set(-(m_data.m_int64));
        } break;
        case DTYPE_INT32: {
            rval.set(-(m_data.m_int32));
        } break;
        case DTYPE_INT16: {
            rval.set(-(m_data.m_int16));
        } break;
        case DTYPE_INT8: {
            rval.set(-(m_data.m_int8));
        } break;

        case DTYPE_UINT64: {
            rval.set(~m_data.m_uint64);
        } break;
        case DTYPE_UINT32: {
            rval.set(~m_data.m_uint32);
        } break;
        case DTYPE_UINT16: {
            rval.set(~m_data.m_uint16);
        } break;
        case DTYPE_UINT8: {
            rval.set(~m_data.m_uint8);
        } break;

        case DTYPE_FLOAT64: {
            rval.set(-(m_data.m_float64));
        } break;
        case DTYPE_FLOAT32: {
            rval.set(-(m_data.m_float32));
        } break;
        default: {
            // no-op
        }
    }
    return rval;
}

t_tscalar
t_tscalar::add(const t_tscalar& other) const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = m_type;

    if (!other.is_valid()) {
        return *this;
    }

    if (!is_valid()) {
        return other;
    }

    if (m_type != other.m_type) {
        return rval;
    }

    if (m_type == DTYPE_NONE) {
        rval.set(other);
        return rval;
    }

    if (other.m_type == DTYPE_NONE) {
        return *this;
    }

    switch (m_type) {
        case DTYPE_INT64: {
            rval.set(m_data.m_int64 + other.m_data.m_int64);
        } break;
        case DTYPE_INT32: {
            rval.set(m_data.m_int32 + other.m_data.m_int32);
        } break;
        case DTYPE_INT16: {
            rval.set(m_data.m_int16 + other.m_data.m_int16);
        } break;
        case DTYPE_INT8: {
            rval.set(m_data.m_int8 + other.m_data.m_int8);
        } break;

        case DTYPE_UINT64: {
            rval.set(m_data.m_uint64 + other.m_data.m_uint64);
        } break;
        case DTYPE_UINT32: {
            rval.set(m_data.m_uint32 + other.m_data.m_uint32);
        } break;
        case DTYPE_UINT16: {
            rval.set(m_data.m_uint16 + other.m_data.m_uint16);
        } break;
        case DTYPE_UINT8: {
            rval.set(m_data.m_uint8 + other.m_data.m_uint8);
        } break;

        case DTYPE_FLOAT64: {
            rval.set(m_data.m_float64 + other.m_data.m_float64);
        } break;
        case DTYPE_FLOAT32: {
            rval.set(m_data.m_float32 + other.m_data.m_float32);
        } break;
        default: {
            // no-op
        }
    }
    return rval;
}

t_tscalar
t_tscalar::difference(const t_tscalar& other) const {
    t_tscalar rval;
    rval.clear();
    rval.m_type = m_type;

    if (!other.is_valid()) {
        return *this;
    }

    if (!is_valid()) {
        return other.negate();
    }

    if (m_type != other.m_type) {
        return rval;
    }

    if (m_type == DTYPE_NONE) {
        rval.set(other.negate());
        return rval;
    }

    if (other.m_type == DTYPE_NONE) {
        return *this;
    }

    switch (m_type) {
        case DTYPE_INT64: {
            rval.set(m_data.m_int64 - other.m_data.m_int64);
        } break;
        case DTYPE_INT32: {
            rval.set(m_data.m_int32 - other.m_data.m_int32);
        } break;
        case DTYPE_INT16: {
            rval.set(m_data.m_int16 - other.m_data.m_int16);
        } break;
        case DTYPE_INT8: {
            rval.set(m_data.m_int8 - other.m_data.m_int8);
        } break;

        case DTYPE_UINT64: {
            rval.set(m_data.m_uint64 - other.m_data.m_uint64);
        } break;
        case DTYPE_UINT32: {
            rval.set(m_data.m_uint32 - other.m_data.m_uint32);
        } break;
        case DTYPE_UINT16: {
            rval.set(m_data.m_uint16 - other.m_data.m_uint16);
        } break;
        case DTYPE_UINT8: {
            rval.set(m_data.m_uint8 - other.m_data.m_uint8);
        } break;

        case DTYPE_FLOAT64: {
            rval.set(m_data.m_float64 - other.m_data.m_float64);
        } break;
        case DTYPE_FLOAT32: {
            rval.set(m_data.m_float32 - other.m_data.m_float32);
        } break;
        default: {
            // no-op
        }
    }
    return rval;
}

t_tscalar
t_tscalar::mul(const t_tscalar& other) const {

    bool fp = is_floating_point() || other.is_floating_point();
    t_tscalar rval;

    if (fp) {
        rval.set(to_double() * other.to_double());
        return rval;
    }

    bool is_s = is_signed() || other.is_signed();
    if (is_s) {
        rval.set(to_int64() * other.to_int64());
        return rval;
    }

    rval.set(to_uint64() * other.to_uint64());
    return rval;
}

std::string
t_tscalar::repr() const {
    std::stringstream ss;
    ss << get_dtype_descr(static_cast<t_dtype>(m_type)) << ":"
       << get_status_descr(m_status) << ":" << to_string();
    return ss.str();
}

bool
t_tscalar::is_valid() const {
    return m_status == STATUS_VALID;
}

bool
t_tscalar::is_floating_point() const {
    return (m_type == DTYPE_FLOAT32 || m_type == DTYPE_FLOAT64);
}

bool
t_tscalar::is_signed() const {
    return (
        m_type == DTYPE_INT64 || m_type == DTYPE_INT32 || m_type == DTYPE_INT16
        || m_type == DTYPE_INT8
    );
}

bool
t_tscalar::as_bool() const {
    if (m_status != STATUS_VALID) {
        return false;
    }

    switch (m_type) {
        case DTYPE_INT64: {
            return bool(get<std::int64_t>());
        } break;
        case DTYPE_INT32: {
            return bool(get<std::int32_t>());
        } break;
        case DTYPE_INT16: {
            return bool(get<std::int16_t>());
        } break;
        case DTYPE_INT8: {
            return bool(get<std::int8_t>());
        } break;
        case DTYPE_UINT64: {
            return bool(get<std::uint64_t>());
        } break;
        case DTYPE_UINT32: {
            return bool(get<std::uint32_t>());
        } break;
        case DTYPE_UINT16: {
            return bool(get<std::uint16_t>());
        } break;
        case DTYPE_UINT8: {
            return bool(get<std::uint8_t>());
        } break;
        case DTYPE_FLOAT64: {
            return bool(get<double>());
        } break;
        case DTYPE_FLOAT32: {
            return bool(get<float>());
        } break;
        case DTYPE_DATE: {
            return bool(get<std::uint32_t>());
        } break;
        case DTYPE_TIME: {
            return bool(get<std::int64_t>());
        } break;
        case DTYPE_BOOL: {
            return bool(get<bool>());
        } break;
        case DTYPE_NONE: {
            return bool(false);
        } break;
        case DTYPE_STR: {
            return m_data.m_charptr != nullptr;
        } break;
        case DTYPE_OBJECT:
        default: {
#ifdef PSP_DEBUG
            std::cout << __FILE__ << ":" << __LINE__ << " Reached unknown type "
                      << m_type << "\n";
#endif
        }
    }
    return false;
}

std::string
t_tscalar::to_string(bool for_expr) const {
    if (m_status != STATUS_VALID) {
        return {"null"};
    }

    std::stringstream ss;

    switch (m_type) {
        case DTYPE_NONE: {
            return {""};
        } break;
        case DTYPE_INT64: {
            ss << get<std::int64_t>();
            return ss.str();
        } break;
        case DTYPE_INT32: {
            ss << get<std::int32_t>();
            return ss.str();
        } break;
        case DTYPE_INT16: {
            ss << get<std::int16_t>();
            return ss.str();
        } break;
        case DTYPE_UINT64: {
            // treat object pointers as unsigned 64 bit ints
            ss << get<std::uint64_t>();
            return ss.str();
        } break;
        case DTYPE_UINT32: {
            ss << get<std::uint32_t>();
            return ss.str();
        } break;
        case DTYPE_UINT16: {
            ss << get<std::uint16_t>();
            return ss.str();
        } break;
        case DTYPE_FLOAT64: {
            ss << get<double>();
            return ss.str();
        } break;
        case DTYPE_FLOAT32: {
            ss << get<float>();
            return ss.str();
        } break;
        case DTYPE_DATE: {
            if (for_expr) {
                auto d = get<t_date>();
                ss << "date(" << d.year() << ", " << d.month() << ", "
                   << d.day() << ")";

                return ss.str();
            }
            t_date date_val = get<t_date>();
            tm t = date_val.get_tm();
            time_t epoch_delta = mktime(&t);
            std::chrono::milliseconds timestamp(epoch_delta * 1000);
            date::sys_time<std::chrono::milliseconds> ts(timestamp);
            return date::format("%F", ts);

        } break;
        case DTYPE_BOOL: {
            ss << std::boolalpha << get<bool>();
            return ss.str();
        } break;
        case DTYPE_INT8: {
            ss << std::int32_t(get<std::int8_t>());
            return ss.str();
        } break;
        case DTYPE_UINT8: {
            ss << std::uint32_t(get<std::uint8_t>());
            return ss.str();
        } break;
        case DTYPE_TIME: {
            // Convert a millisecond UTC timestamp to a formatted datestring in
            // local time, as all datetimes exported to the user happens in
            // local time and not UTC.
            std::chrono::milliseconds timestamp(to_int64());
            date::sys_time<std::chrono::milliseconds> ts(timestamp);
            return date::format("%F %T", ts);
        } break;
        case DTYPE_STR: {
            if (for_expr) {
                ss << "'";
            }

            if (m_data.m_charptr == nullptr) {
                if (for_expr) {
                    ss << "'";
                }

                return ss.str();
            }

            ss << get_char_ptr();
            if (for_expr) {
                ss << "'";
            }
            return ss.str();
        } break;
        case DTYPE_OBJECT:
        default: {
            PSP_COMPLAIN_AND_ABORT("Unrecognized dtype");
        }
    }
    return {"null"};
}

double
t_tscalar::to_double() const {
    switch (m_type) {
        case DTYPE_INT64: {
            return get<std::int64_t>();
        } break;
        case DTYPE_INT32: {
            return get<std::int32_t>();
        } break;
        case DTYPE_INT16: {
            return get<std::int16_t>();
        } break;
        case DTYPE_INT8: {
            return get<std::int8_t>();
        } break;
        case DTYPE_UINT64: {
            return get<std::uint64_t>();
        } break;
        case DTYPE_UINT32: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_UINT16: {
            return get<std::uint16_t>();
        } break;
        case DTYPE_UINT8: {
            return get<std::uint8_t>();
        } break;
        case DTYPE_FLOAT64: {
            return get<double>();
        } break;
        case DTYPE_FLOAT32: {
            return get<float>();
        } break;
        case DTYPE_DATE: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_TIME: {
            return get<std::int64_t>();
        } break;
        case DTYPE_BOOL: {
            return static_cast<double>(get<bool>());
        } break;
        case DTYPE_NONE:
        default: {
            return 0;
        }
    }

    return 0;
}

t_tscalar
t_tscalar::coerce_numeric_dtype(t_dtype dtype) const {
    if (dtype == m_type) {
        return *this;
    }

    switch (dtype) {
        case DTYPE_INT64: {
            return coerce_numeric<std::int64_t>();
        } break;
        case DTYPE_INT32: {
            return coerce_numeric<std::int32_t>();
        } break;
        case DTYPE_INT16: {
            return coerce_numeric<std::int16_t>();
        } break;
        case DTYPE_INT8: {
            return coerce_numeric<std::int8_t>();
        } break;
        case DTYPE_UINT64: {
            return coerce_numeric<std::uint64_t>();
        } break;
        case DTYPE_UINT32: {
            return coerce_numeric<std::uint32_t>();
        } break;
        case DTYPE_UINT16: {
            return coerce_numeric<std::uint16_t>();
        } break;
        case DTYPE_UINT8: {
            return coerce_numeric<std::uint8_t>();
        } break;
        case DTYPE_FLOAT64: {
            return coerce_numeric<double>();
        } break;
        case DTYPE_FLOAT32: {
            return coerce_numeric<float>();
        } break;
        case DTYPE_BOOL: {
            return coerce_numeric<bool>();
        } break;
        default: {
            return *this;
        }
    }

    return mknone();
}

std::int64_t
t_tscalar::to_int64() const {
    switch (m_type) {
        case DTYPE_INT64: {
            return get<std::int64_t>();
        } break;
        case DTYPE_INT32: {
            return get<std::int32_t>();
        } break;
        case DTYPE_INT16: {
            return get<std::int16_t>();
        } break;
        case DTYPE_INT8: {
            return get<std::int8_t>();
        } break;
        case DTYPE_UINT64: {
            return get<std::uint64_t>();
        } break;
        case DTYPE_UINT32: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_UINT16: {
            return get<std::uint16_t>();
        } break;
        case DTYPE_UINT8: {
            return get<std::uint8_t>();
        } break;
        case DTYPE_FLOAT64: {
            return get<double>();
        } break;
        case DTYPE_FLOAT32: {
            return get<float>();
        } break;
        case DTYPE_DATE: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_TIME: {
            return get<std::int64_t>();
        } break;
        case DTYPE_BOOL: {
            return static_cast<std::int64_t>(get<bool>());
        } break;
        case DTYPE_NONE:
        default: {
            return 0;
        }
    }

    return 0;
}

std::int32_t
t_tscalar::to_int32() const {
    switch (m_type) {
        case DTYPE_INT64: {
            return get<std::int64_t>();
        } break;
        case DTYPE_INT32: {
            return get<std::int32_t>();
        } break;
        case DTYPE_INT16: {
            return get<std::int16_t>();
        } break;
        case DTYPE_INT8: {
            return get<std::int8_t>();
        } break;
        case DTYPE_UINT64: {
            return get<std::uint64_t>();
        } break;
        case DTYPE_UINT32: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_UINT16: {
            return get<std::uint16_t>();
        } break;
        case DTYPE_UINT8: {
            return get<std::uint8_t>();
        } break;
        case DTYPE_FLOAT64: {
            return get<double>();
        } break;
        case DTYPE_FLOAT32: {
            return get<float>();
        } break;
        case DTYPE_DATE: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_TIME: {
            return get<std::int64_t>();
        } break;
        case DTYPE_BOOL: {
            return static_cast<std::int32_t>(get<bool>());
        } break;
        case DTYPE_NONE:
        default: {
            return 0;
        }
    }

    return 0;
}

std::uint64_t
t_tscalar::to_uint64() const {
    switch (m_type) {
        case DTYPE_INT64: {
            return get<std::int64_t>();
        } break;
        case DTYPE_INT32: {
            return get<std::int32_t>();
        } break;
        case DTYPE_INT16: {
            return get<std::int16_t>();
        } break;
        case DTYPE_INT8: {
            return get<std::int8_t>();
        } break;
        case DTYPE_UINT64: {
            return get<std::uint64_t>();
        } break;
        case DTYPE_UINT32: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_UINT16: {
            return get<std::uint16_t>();
        } break;
        case DTYPE_UINT8: {
            return get<std::uint8_t>();
        } break;
        case DTYPE_FLOAT64: {
            return get<double>();
        } break;
        case DTYPE_FLOAT32: {
            return get<float>();
        } break;
        case DTYPE_DATE: {
            return get<std::uint32_t>();
        } break;
        case DTYPE_TIME: {
            return get<std::int64_t>();
        } break;
        case DTYPE_BOOL: {
            return static_cast<std::uint64_t>(get<bool>());
        } break;
        case DTYPE_OBJECT:
        case DTYPE_NONE:
        default: {
            return 0;
        }
    }

    return 0;
}

bool
t_tscalar::begins_with(const t_tscalar& other) const {
    if (m_status != STATUS_VALID || m_type != DTYPE_STR
        || other.m_type != DTYPE_STR) {
        return false;
    }
    std::string sstr = to_string();
    std::string ostr = other.to_string();
    std::string_to_lower(sstr);
    std::string_to_lower(ostr);
    return sstr.find(ostr) == 0;
}

bool
t_tscalar::ends_with(const t_tscalar& other) const {
    if (m_status != STATUS_VALID || m_type != DTYPE_STR
        || other.m_type != DTYPE_STR) {
        return false;
    }
    std::string sstr = to_string();
    std::string ostr = other.to_string();
    std::string_to_lower(sstr);
    std::string_to_lower(ostr);
    size_t idx = sstr.rfind(ostr);
    return (idx != std::string::npos) && (idx + ostr.size() == sstr.size());
}

bool
t_tscalar::contains(const t_tscalar& other) const {
    if (m_status != STATUS_VALID || m_type != DTYPE_STR
        || other.m_type != DTYPE_STR) {
        return false;
    }
    std::string sstr = to_string();
    std::string ostr = other.to_string();
    std::string_to_lower(sstr);
    std::string_to_lower(ostr);
    size_t idx = sstr.find(ostr);
    return idx != std::string::npos;
}

std::string
repr(const t_tscalar& s) {
    return s.to_string();
}

size_t
hash_value(const t_tscalar& s) {
    std::size_t seed = 0;
    if (s.m_status == STATUS_VALID) {
        boost::hash_combine(seed, s.m_status);
        boost::hash_combine(seed, s.m_type);
        if (s.m_type == DTYPE_STR) {
            const char* c = s.get_char_ptr();
            boost::hash_combine(seed, boost::hash_range(c, c + std::strlen(c)));
        } else {
            boost::hash_combine(seed, s.m_data.m_uint64);
        }
    } else {
        boost::hash_combine(seed, STATUS_INVALID);
        boost::hash_combine(seed, s.m_type);
    }

    return seed;
}

t_tscalar
mktscalar() {
    t_tscalar rval;
    rval.set(t_none());
    return rval;
}

template <>
std::int64_t
t_tscalar::get() const {
    return m_data.m_int64;
}

template <>
std::int32_t
t_tscalar::get() const {
    return m_data.m_int32;
}

template <>
std::int16_t
t_tscalar::get() const {
    return m_data.m_int16;
}

template <>
std::int8_t
t_tscalar::get() const {
    return m_data.m_int8;
}

template <>
std::uint64_t
t_tscalar::get() const {
    return m_data.m_uint64;
}

template <>
std::uint32_t
t_tscalar::get() const {
    return m_data.m_uint32;
}

template <>
std::uint16_t
t_tscalar::get() const {
    return m_data.m_uint16;
}

template <>
std::uint8_t
t_tscalar::get() const {
    return m_data.m_uint8;
}

template <>
double
t_tscalar::get() const {
    return m_data.m_float64;
}

template <>
float
t_tscalar::get() const {
    return m_data.m_float32;
}

template <>
bool
t_tscalar::get() const {
    return m_data.m_bool;
}

template <>
const char*
t_tscalar::get() const {
    return get_char_ptr();
}

template <>
t_date
t_tscalar::get() const {
    return t_date(m_data.m_uint32);
}

template <>
t_time
t_tscalar::get() const {
    return t_time(m_data.m_int64);
}

template <>
t_none
t_tscalar::get() const {
    return {};
}

t_dtype
t_tscalar::get_dtype() const {
    return static_cast<t_dtype>(m_type);
}

bool
t_tscalar::cmp(t_filter_op op, const t_tscalar& other) const {
    const t_tscalar& value = *this;

    switch (op) {
        case FILTER_OP_LT: {
            return m_status == STATUS_VALID && other.m_status == STATUS_VALID
                && value < other;
        } break;
        case FILTER_OP_LTEQ: {
            return (m_status == STATUS_VALID && other.m_status == STATUS_VALID
                    && value < other)
                || other == value;
        } break;
        case FILTER_OP_GT: {
            return m_status == STATUS_VALID && other.m_status == STATUS_VALID
                && value > other;
        } break;
        case FILTER_OP_GTEQ: {
            return (m_status == STATUS_VALID && other.m_status == STATUS_VALID
                    && value > other)
                || other == value;
        } break;
        case FILTER_OP_EQ: {
            return other == value;
        } break;
        case FILTER_OP_NE: {
            return other != value;
        } break;
        case FILTER_OP_BEGINS_WITH: {
            return value.begins_with(other);
        } break;
        case FILTER_OP_ENDS_WITH: {
            return value.ends_with(other);
        } break;
        case FILTER_OP_CONTAINS: {
            return value.contains(other);
        } break;
        case FILTER_OP_IS_NULL: {
            return m_status != STATUS_VALID;
        } break;
        case FILTER_OP_IS_NOT_NULL: {
            return m_status == STATUS_VALID;
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Invalid filter op");
        } break;
    }

    return false;
}

const char*
t_tscalar::get_char_ptr() const {
#ifdef PSP_SSO_SCALAR
    if (is_inplace()) {
        return m_data.m_inplace_char;
    }
#endif
    return m_data.m_charptr;
}

#ifdef PSP_SSO_SCALAR
bool
t_tscalar::is_inplace() const {
    return m_inplace;
}

bool
t_tscalar::can_store_inplace(const char* s) {
    return strlen(s) + 1 <= static_cast<size_t>(SCALAR_INPLACE_LEN);
}

bool
t_tscalar::can_store_inplace(const std::string& s) {
    return s.size() + 1 <= static_cast<size_t>(SCALAR_INPLACE_LEN);
}
#endif

bool
t_tscalar::is_nan() const {
    if (m_type == DTYPE_FLOAT64) {
        return std::isnan(get<double>()) || std::isinf(get<double>());
    }
    if (m_type == DTYPE_FLOAT32) {
        return std::isnan(get<float>()) || std::isinf(get<float>());
    }
    return false;
}

t_tscalar
mknone() {
    t_tscalar rval;
    rval.set(t_none());
    return rval;
}

t_tscalar
mknull(t_dtype dtype) {
    t_tscalar rval;
    rval.m_data.m_uint64 = 0;
    rval.m_status = STATUS_INVALID;
    rval.m_type = dtype;
#ifdef PSP_SSO_SCALAR
    if (dtype == DTYPE_STR) {
        rval.m_inplace = true;
    }
#endif
    return rval;
}

t_tscalar
mkclear(t_dtype dtype) {
    t_tscalar rval = mknull(dtype);
    rval.m_status = STATUS_CLEAR;
    return rval;
}

template <>
t_tscalar
t_tscalar::coerce_numeric<bool>() const {
    t_tscalar rv;

    if (m_type == DTYPE_STR) {
        const auto* v = get<const char*>();
        std::string s1("True");
        std::string s2("true");
        std::string s3("TRUE");

        if (strcmp(v, s1.c_str()) == 0 || strcmp(v, s2.c_str()) == 0
            || strcmp(v, s3.c_str()) == 0) {
            rv.set(true);
            return rv;
        }
        rv.set(false);
        return rv;
    }
    bool v = static_cast<bool>(m_data.m_uint64);
    rv.set(v);
    return rv;
}

} // end namespace perspective

namespace std {
std::ostream&
operator<<(std::ostream& os, const perspective::t_tscalar& t) {
    os << repr(t);
    return os;
}

std::ostream&
operator<<(std::ostream& os, const std::vector<perspective::t_tscalar>& t) {
    os << "[";
    auto length = t.size();

    for (auto i = 0; i < length; ++i) {
        os << t[i];

        if (i != length - 1) {
            os << ",";
        }
    }

    os << "]";
    return os;
}

} // end namespace std
