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
#include <perspective/scalar.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

/**
 * Comparison, equality and boolean semantics for scalars inside expressions:
 * numeric dtypes promote, other dtypes must match, and mismatches poison the
 * validator with a recorded reason.
 */
namespace perspective {
namespace expr {

    enum class t_cmp_op : std::uint8_t { LT, LTE, GT, GTE, EQ, NE };

    enum class t_cmp_class : std::uint8_t {
        NUMERIC,
        BOOL,
        STR,
        DATE,
        TIME,
        NULL_RESULT,
        INCOMPATIBLE
    };

    enum class t_ordering : std::uint8_t { LESS, EQUAL, GREATER, UNORDERED };

    struct t_expression_type_error {
        std::string m_op;
        t_dtype m_lhs;
        t_dtype m_rhs;
    };

    struct t_expression_type_check_sink {
        std::vector<t_expression_type_error> m_errors;
    };

    /**
     * @brief The active validation sink, non-null only inside a
     * `t_expression_type_check_scope`.
     */
    inline thread_local t_expression_type_check_sink* g_type_check_sink =
        nullptr;

    struct t_expression_type_check_scope {
        t_expression_type_check_scope(const t_expression_type_check_scope&) =
            delete;
        t_expression_type_check_scope&
        operator=(const t_expression_type_check_scope&) = delete;

        explicit t_expression_type_check_scope(
            t_expression_type_check_sink& sink
        ) :
            m_previous(g_type_check_sink) {
            g_type_check_sink = &sink;
        }

        ~t_expression_type_check_scope() { g_type_check_sink = m_previous; }

        t_expression_type_check_sink* m_previous;
    };

    inline void
    report_type_error(const char* op, t_dtype lhs, t_dtype rhs) {
        if (g_type_check_sink != nullptr) {
            g_type_check_sink->m_errors.push_back(
                t_expression_type_error{op, lhs, rhs}
            );
        }
    }

    inline const char*
    cmp_op_name(t_cmp_op op) {
        switch (op) {
            case t_cmp_op::LT:
                return "<";
            case t_cmp_op::LTE:
                return "<=";
            case t_cmp_op::GT:
                return ">";
            case t_cmp_op::GTE:
                return ">=";
            case t_cmp_op::EQ:
                return "==";
            case t_cmp_op::NE:
                return "!=";
        }
        return "?";
    }

    inline bool
    is_comparison_op_name(const std::string& op) {
        return op == "<" || op == "<=" || op == ">" || op == ">=" || op == "=="
            || op == "!=";
    }

    /**
     * @brief Human-readable validation message for a recorded type error.
     */
    inline std::string
    describe_type_error(const t_expression_type_error& err) {
        const std::string lhs = dtype_to_str(err.m_lhs);
        const std::string rhs = dtype_to_str(err.m_rhs);

        if (is_comparison_op_name(err.m_op)) {
            return "Type Error - cannot compare " + lhs + " and " + rhs
                + " with '" + err.m_op + "'";
        }

        return "Type Error - '" + err.m_op + "' cannot be applied to " + lhs
            + " and " + rhs;
    }

    /**
     * @brief Resolve the comparison class of an operand dtype pair.
     */
    inline t_cmp_class
    classify(t_dtype lhs, t_dtype rhs) {
        if (lhs == DTYPE_NONE || rhs == DTYPE_NONE) {
            return t_cmp_class::NULL_RESULT;
        }

        if (is_numeric_type(lhs) && is_numeric_type(rhs)) {
            return t_cmp_class::NUMERIC;
        }

        if (lhs != rhs) {
            return t_cmp_class::INCOMPATIBLE;
        }

        switch (lhs) {
            case DTYPE_BOOL:
                return t_cmp_class::BOOL;
            case DTYPE_STR:
                return t_cmp_class::STR;
            case DTYPE_DATE:
                return t_cmp_class::DATE;
            case DTYPE_TIME:
                return t_cmp_class::TIME;
            default:
                return t_cmp_class::INCOMPATIBLE;
        }
    }

    template <typename T>
    inline t_ordering
    order_of(T x, T y) {
        if (x < y) {
            return t_ordering::LESS;
        }
        if (y < x) {
            return t_ordering::GREATER;
        }
        return t_ordering::EQUAL;
    }

    inline t_ordering
    order_double(double x, double y) {
        if (std::isnan(x) || std::isnan(y)) {
            return t_ordering::UNORDERED;
        }
        return order_of(x, y);
    }

    /**
     * @brief Order two numeric scalars by value, exactly for integers and
     * through `double` when either side is floating point.
     */
    inline t_ordering
    order_numeric(const t_tscalar& a, const t_tscalar& b) {
        if (a.is_floating_point() || b.is_floating_point()) {
            return order_double(a.to_double(), b.to_double());
        }

        const bool a_signed = a.is_signed();
        const bool b_signed = b.is_signed();

        if (a_signed && b_signed) {
            return order_of(a.to_int64(), b.to_int64());
        }

        if (!a_signed && !b_signed) {
            return order_of(a.to_uint64(), b.to_uint64());
        }

        if (a_signed) {
            const std::int64_t x = a.to_int64();
            if (x < 0) {
                return t_ordering::LESS;
            }
            return order_of(static_cast<std::uint64_t>(x), b.to_uint64());
        }

        const std::int64_t y = b.to_int64();
        if (y < 0) {
            return t_ordering::GREATER;
        }
        return order_of(a.to_uint64(), static_cast<std::uint64_t>(y));
    }

    inline t_ordering
    order_scalar(const t_tscalar& a, const t_tscalar& b, t_cmp_class cls) {
        switch (cls) {
            case t_cmp_class::NUMERIC:
                return order_numeric(a, b);
            case t_cmp_class::BOOL:
                return order_of(a.get<bool>(), b.get<bool>());
            case t_cmp_class::STR:
                return order_of(
                    std::strcmp(a.get_char_ptr(), b.get_char_ptr()), 0
                );
            case t_cmp_class::DATE:
                return order_of(a.m_data.m_uint32, b.m_data.m_uint32);
            case t_cmp_class::TIME:
                return order_of(a.m_data.m_int64, b.m_data.m_int64);
            default:
                return t_ordering::UNORDERED;
        }
    }

    inline bool
    apply_op(t_cmp_op op, t_ordering ord) {
        switch (op) {
            case t_cmp_op::EQ:
                return ord == t_ordering::EQUAL;
            case t_cmp_op::NE:
                return ord != t_ordering::EQUAL;
            case t_cmp_op::LT:
                return ord == t_ordering::LESS;
            case t_cmp_op::LTE:
                return ord == t_ordering::LESS || ord == t_ordering::EQUAL;
            case t_cmp_op::GT:
                return ord == t_ordering::GREATER;
            case t_cmp_op::GTE:
                return ord == t_ordering::GREATER || ord == t_ordering::EQUAL;
        }
        return false;
    }

    inline t_tscalar
    make_bool_result() {
        t_tscalar rval;
        rval.clear();
        rval.m_type = DTYPE_BOOL;
        return rval;
    }

    /**
     * @brief Whether `v` carries a validation-time type error, which is only
     * distinguishable from a null cell while a sink is installed.
     */
    inline bool
    is_poisoned(const t_tscalar& v) {
        return g_type_check_sink != nullptr && v.m_status == STATUS_CLEAR;
    }

    /**
     * @brief `a <op> b` as a `DTYPE_BOOL` scalar, poisoned for incompatible
     * dtypes, with `==` / `!=` against the `null` literal acting as a null
     * test.
     */
    inline t_tscalar
    compare(const t_tscalar& a, const t_tscalar& b, t_cmp_op op) {
        t_tscalar rval = make_bool_result();
        const t_dtype lhs = a.get_dtype();
        const t_dtype rhs = b.get_dtype();

        const t_cmp_class cls = classify(lhs, rhs);

        if (cls == t_cmp_class::INCOMPATIBLE) {
            rval.m_status = STATUS_CLEAR;
            report_type_error(cmp_op_name(op), lhs, rhs);
            return rval;
        }

        if (is_poisoned(a) || is_poisoned(b)) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        if (cls == t_cmp_class::NULL_RESULT) {
            if (op == t_cmp_op::EQ || op == t_cmp_op::NE) {
                const t_tscalar& other = a.is_none() ? b : a;
                const bool is_null = other.is_none() || !other.is_valid();
                rval.set(op == t_cmp_op::EQ ? is_null : !is_null);
            }
            return rval;
        }

        const bool a_valid = a.is_valid();
        const bool b_valid = b.is_valid();

        if (!a_valid && !b_valid) {
            rval.set(
                op == t_cmp_op::EQ || op == t_cmp_op::LTE
                || op == t_cmp_op::GTE
            );
            return rval;
        }

        if (!a_valid || !b_valid) {
            rval.set(op == t_cmp_op::NE);
            return rval;
        }

        rval.set(apply_op(op, order_scalar(a, b, cls)));
        return rval;
    }

    /**
     * @brief `low <= val <= high`; null if any operand is null.
     */
    inline t_tscalar
    inrange(const t_tscalar& low, const t_tscalar& val, const t_tscalar& high) {
        t_tscalar rval = make_bool_result();
        const t_tscalar lo = compare(low, val, t_cmp_op::LTE);
        const t_tscalar hi = compare(val, high, t_cmp_op::LTE);

        if (is_poisoned(lo) || is_poisoned(hi)) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        if (!lo.is_valid() || !hi.is_valid() || !low.is_valid()
            || !val.is_valid() || !high.is_valid()) {
            return rval;
        }

        rval.set(lo.get<bool>() && hi.get<bool>());
        return rval;
    }

    /**
     * @brief The boolean cast used by every boolean context: null is `false`,
     * numbers are `true` when non-zero, strings when non-null.
     */
    inline bool
    to_bool(const t_tscalar& v) {
        return v.as_bool();
    }

    template <typename F>
    inline t_tscalar
    logical(const t_tscalar& a, const t_tscalar& b, F fn) {
        t_tscalar rval = make_bool_result();

        if (is_poisoned(a) || is_poisoned(b)) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        rval.set(fn(to_bool(a), to_bool(b)));
        return rval;
    }

    inline t_tscalar
    logical_and(const t_tscalar& a, const t_tscalar& b) {
        return logical(a, b, [](bool x, bool y) { return x && y; });
    }

    inline t_tscalar
    logical_or(const t_tscalar& a, const t_tscalar& b) {
        return logical(a, b, [](bool x, bool y) { return x || y; });
    }

    inline t_tscalar
    logical_nand(const t_tscalar& a, const t_tscalar& b) {
        return logical(a, b, [](bool x, bool y) { return !(x && y); });
    }

    inline t_tscalar
    logical_nor(const t_tscalar& a, const t_tscalar& b) {
        return logical(a, b, [](bool x, bool y) { return !(x || y); });
    }

    inline t_tscalar
    logical_xor(const t_tscalar& a, const t_tscalar& b) {
        return logical(a, b, [](bool x, bool y) { return x != y; });
    }

    inline t_tscalar
    logical_xnor(const t_tscalar& a, const t_tscalar& b) {
        return logical(a, b, [](bool x, bool y) { return x == y; });
    }

    inline t_tscalar
    logical_not(const t_tscalar& v) {
        t_tscalar rval = make_bool_result();

        if (is_poisoned(v)) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        rval.set(!to_bool(v));
        return rval;
    }

    /**
     * @brief Truthiness of a condition, with a null condition selecting the
     * consequent while validating so the `if` is typed by that branch.
     */
    inline bool
    truthy(const t_tscalar& v) {
        if (g_type_check_sink != nullptr && !v.is_valid()) {
            return true;
        }

        return to_bool(v);
    }

} // namespace expr
} // namespace perspective
