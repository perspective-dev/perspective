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

#include <perspective/scalar.h>
#include <perspective/expression_compare.h>

namespace exprtk {

using perspective::mknone;
using perspective::mktscalar;
using perspective::t_tscalar;

namespace details {
    namespace numeric {
        namespace details {

            /**
             * Allows for tag dispatching so that the overloads in this header
             * are called for t_tscalar operations.
             */
            struct t_tscalar_type_tag;

            template <typename T>
            inline T const_pi_impl(t_tscalar_type_tag);
            template <typename T>
            inline T const_e_impl(t_tscalar_type_tag);

            template <typename T>
            inline std::int32_t to_int32_impl(const T& v, t_tscalar_type_tag);

            template <typename T>
            inline std::int64_t to_int64_impl(const T& v, t_tscalar_type_tag);

            template <typename T>
            inline std::uint64_t to_uint64_impl(const T& v, t_tscalar_type_tag);

#define define_unary_function_impl_header(FunctionName)                        \
    template <typename T>                                                      \
    inline T FunctionName##_impl(const T v, t_tscalar_type_tag);
            // clang-format off
            define_unary_function_impl_header(abs  )
            define_unary_function_impl_header(acos )
            define_unary_function_impl_header(acosh)
            define_unary_function_impl_header(asin )
            define_unary_function_impl_header(asinh)
            define_unary_function_impl_header(atan )
            define_unary_function_impl_header(atanh)
            define_unary_function_impl_header(ceil )
            define_unary_function_impl_header(cos  )
            define_unary_function_impl_header(cosh )
            define_unary_function_impl_header(exp  )
            define_unary_function_impl_header(expm1)
            define_unary_function_impl_header(floor)
            define_unary_function_impl_header(log  )
            define_unary_function_impl_header(log10)
            define_unary_function_impl_header(log2 )
            define_unary_function_impl_header(log1p)
            define_unary_function_impl_header(neg  )
            define_unary_function_impl_header(pos  )
            define_unary_function_impl_header(round)
            define_unary_function_impl_header(sin  )
            define_unary_function_impl_header(sinc )
            define_unary_function_impl_header(sinh )
            define_unary_function_impl_header(sqrt )
            define_unary_function_impl_header(tan  )
            define_unary_function_impl_header(tanh )
            define_unary_function_impl_header(cot  )
            define_unary_function_impl_header(sec  )
            define_unary_function_impl_header(csc  )
            define_unary_function_impl_header(r2d  )
            define_unary_function_impl_header(d2r  )
            define_unary_function_impl_header(d2g  )
            define_unary_function_impl_header(g2d  )
            define_unary_function_impl_header(notl )
            define_unary_function_impl_header(sgn  )
            define_unary_function_impl_header(erf  )
            define_unary_function_impl_header(erfc )
            define_unary_function_impl_header(ncdf )
            define_unary_function_impl_header(frac )
            define_unary_function_impl_header(trunc)
            // clang-format on

#undef define_unary_function_impl_header

#define define_binary_function_impl_header(FunctionName)                       \
    template <typename T>                                                      \
    inline T FunctionName##_impl(const T v0, const T v1, t_tscalar_type_tag);

                // except reserved words: and, or, xor
                // clang-format off
                define_binary_function_impl_header(min    )
                define_binary_function_impl_header(max    )
                define_binary_function_impl_header(equal  )
                define_binary_function_impl_header(nequal )
                define_binary_function_impl_header(modulus)
                define_binary_function_impl_header(pow    )
                define_binary_function_impl_header(logn   )
                define_binary_function_impl_header(root   )
                define_binary_function_impl_header(roundn )
                define_binary_function_impl_header(hypot  )
                define_binary_function_impl_header(atan2  )
                define_binary_function_impl_header(shr    )
                define_binary_function_impl_header(shl    )
                define_binary_function_impl_header(nand   )
                define_binary_function_impl_header(nor    )
                define_binary_function_impl_header(xnor   )
            // clang-format on

#undef define_binary_function_impl_header

                                        template <typename T>
                                        inline T
                and_impl(const T v0, const T v1, t_tscalar_type_tag);

            template <typename T>
            inline T or_impl(const T v0, const T v1, t_tscalar_type_tag);

            template <typename T>
            inline T xor_impl(const T v0, const T v1, t_tscalar_type_tag);

            template <typename T>
            inline bool is_integer_impl(const T& v, t_tscalar_type_tag);

            // #if (defined(_MSC_VER) && (_MSC_VER >= 1900)) ||
            // !defined(_MSC_VER)
            // #define exprtk_define_erf(TT,impl)           \
            // inline TT erf_impl(TT v) { return impl(v); } \

            // exprtk_define_erf(      float,::erff)
            // exprtk_define_erf(     double,::erf )
            // exprtk_define_erf(long double,::erfl)
            // #undef exprtk_define_erf
            // #endif

            // #if (defined(_MSC_VER) && (_MSC_VER >= 1900)) ||
            // !defined(_MSC_VER)
            // #define exprtk_define_erfc(TT,impl)           \
            // inline TT erfc_impl(TT v) { return impl(v); } \

            // exprtk_define_erfc(      float,::erfcf)
            // exprtk_define_erfc(     double,::erfc )
            // exprtk_define_erfc(long double,::erfcl)
            // #undef exprtk_define_erfc
            // #endif

        } // end namespace details
    }     // end namespace numeric

    inline bool is_true(const t_tscalar& v);

    inline bool is_false(const t_tscalar& v);

    template <typename Iterator>
    inline bool string_to_real(
        Iterator& itr_external,
        const Iterator end,
        t_tscalar& t,
        numeric::details::t_tscalar_type_tag
    );

} // end namespace details
} // end namespace exprtk

// exprtk needs to be imported after the type tags have been declared.
// #define exprtk_enable_debugging

// for some reason, break/continue will break expression.value() when it is
// called, but enabling this ifdef creates a litany of compiler warnings
// about misleading indentation inside exprtk.hpp. Considering that the UI
// will not allow while/continue to be used, this should be ok.
// #define exprtk_disable_break_continue

#define exprtk_disable_return_statement
#define exprtk_disable_rtl_io_file
#include <exprtk.hpp>

namespace exprtk {
namespace details {
    namespace numeric {
        namespace details {

#define UNARY_STD_FUNCTION_BODY(FUNC)                                          \
    t_tscalar rval;                                                            \
    rval.clear();                                                              \
    rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;                         \
    if (v.is_none()) {                                                         \
        return rval;                                                           \
    }                                                                          \
    if (!v.is_numeric()) {                                                     \
        rval.m_status = perspective::t_status::STATUS_CLEAR;                   \
    }                                                                          \
    if (!v.is_valid())                                                         \
        return rval;                                                           \
    rval.set(static_cast<double>(std::FUNC(v.to_double())));                   \
    return rval;

/**
 * @brief a function that returns none for all types besides float.
 *
 */
#define UNARY_STD_INT_FUNCTION_BODY(FUNC)                                      \
    t_tscalar rval;                                                            \
    rval.clear();                                                              \
    rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;                         \
    if (v.is_none()) {                                                         \
        return rval;                                                           \
    }                                                                          \
    if (!v.is_numeric()) {                                                     \
        rval.m_status = perspective::t_status::STATUS_CLEAR;                   \
    }                                                                          \
    if (!v.is_valid())                                                         \
        return rval;                                                           \
    switch (v.get_dtype()) {                                                   \
        case perspective::t_dtype::DTYPE_FLOAT64: {                            \
            rval.set(static_cast<double>(std::FUNC(v.get<double>())));         \
        } break;                                                               \
        case perspective::t_dtype::DTYPE_FLOAT32: {                            \
            rval.set(static_cast<double>(std::FUNC(v.get<float>())));          \
        } break;                                                               \
        default:                                                               \
            return rval;                                                       \
    }                                                                          \
    return rval;

            struct t_tscalar_type_tag {};

            template <>
            struct number_type<t_tscalar> {
                typedef t_tscalar_type_tag type;
                number_type() {}
            };

            template <>
            inline t_tscalar
            const_pi_impl(t_tscalar_type_tag) {
                t_tscalar rval;
                rval.set(constant::pi);
                return rval;
            };

            template <>
            inline t_tscalar
            const_e_impl(t_tscalar_type_tag) {
                t_tscalar rval;
                rval.set(constant::e);
                return rval;
            };

            template <>
            struct epsilon_type<t_tscalar> {
                static inline t_tscalar
                value() {
                    t_tscalar rval;
                    rval.set(0.0000000001);
                    return rval;
                }
            };

            inline bool
            is_nan_impl(const t_tscalar& v, t_tscalar_type_tag) {
                return v.is_nan();
            }

            template <>
            inline std::int32_t
            to_int32_impl(const t_tscalar& v, t_tscalar_type_tag) {
                if (!v.is_valid()) {
                    return std::numeric_limits<std::int32_t>::quiet_NaN();
                }
                switch (v.get_dtype()) {
                    case perspective::t_dtype::DTYPE_INT64:
                        return static_cast<std::int32_t>(v.get<std::int64_t>());
                    case perspective::t_dtype::DTYPE_INT32:
                        return static_cast<std::int32_t>(v.get<std::int32_t>());
                    case perspective::t_dtype::DTYPE_INT16:
                        return static_cast<std::int32_t>(v.get<std::int16_t>());
                    case perspective::t_dtype::DTYPE_INT8:
                        return static_cast<std::int32_t>(v.get<std::int8_t>());
                    case perspective::t_dtype::DTYPE_UINT64:
                        return static_cast<std::int32_t>(v.get<std::uint64_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT32:
                        return static_cast<std::int32_t>(v.get<std::uint32_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT16:
                        return static_cast<std::int32_t>(v.get<std::uint16_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT8:
                        return static_cast<std::int32_t>(v.get<std::uint8_t>());
                    case perspective::t_dtype::DTYPE_FLOAT64:
                        return static_cast<std::int32_t>(v.get<double>());
                    case perspective::t_dtype::DTYPE_FLOAT32:
                        return static_cast<std::int32_t>(v.get<float>());
                    default:
                        return std::numeric_limits<std::int32_t>::quiet_NaN();
                }
            }

            template <>
            inline std::int64_t
            to_int64_impl(const t_tscalar& v, t_tscalar_type_tag) {
                if (!v.is_valid()) {
                    return std::numeric_limits<std::int64_t>::quiet_NaN();
                }
                switch (v.get_dtype()) {
                    case perspective::t_dtype::DTYPE_INT64:
                        return static_cast<std::int64_t>(v.get<std::int64_t>());
                    case perspective::t_dtype::DTYPE_INT32:
                        return static_cast<std::int64_t>(v.get<std::int32_t>());
                    case perspective::t_dtype::DTYPE_INT16:
                        return static_cast<std::int64_t>(v.get<std::int16_t>());
                    case perspective::t_dtype::DTYPE_INT8:
                        return static_cast<std::int64_t>(v.get<std::int8_t>());
                    case perspective::t_dtype::DTYPE_UINT64:
                        return static_cast<std::int64_t>(v.get<std::uint64_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT32:
                        return static_cast<std::int64_t>(v.get<std::uint32_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT16:
                        return static_cast<std::int64_t>(v.get<std::uint16_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT8:
                        return static_cast<std::int64_t>(v.get<std::uint8_t>());
                    case perspective::t_dtype::DTYPE_FLOAT64:
                        return static_cast<std::int64_t>(v.get<double>());
                    case perspective::t_dtype::DTYPE_FLOAT32:
                        return static_cast<std::int64_t>(v.get<float>());
                    default:
                        return std::numeric_limits<std::int64_t>::quiet_NaN();
                }
            }

            template <>
            inline std::uint64_t
            to_uint64_impl(const t_tscalar& v, t_tscalar_type_tag) {
                if (!v.is_valid()) {
                    return std::numeric_limits<std::uint64_t>::quiet_NaN();
                }
                switch (v.get_dtype()) {
                    case perspective::t_dtype::DTYPE_INT64:
                        return static_cast<std::uint64_t>(v.get<std::int64_t>()
                        );
                    case perspective::t_dtype::DTYPE_INT32:
                        return static_cast<std::uint64_t>(v.get<std::int32_t>()
                        );
                    case perspective::t_dtype::DTYPE_INT16:
                        return static_cast<std::uint64_t>(v.get<std::int16_t>()
                        );
                    case perspective::t_dtype::DTYPE_INT8:
                        return static_cast<std::uint64_t>(v.get<std::int8_t>());
                    case perspective::t_dtype::DTYPE_UINT64:
                        return static_cast<std::uint64_t>(v.get<std::uint64_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT32:
                        return static_cast<std::uint64_t>(v.get<std::uint32_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT16:
                        return static_cast<std::uint64_t>(v.get<std::uint16_t>()
                        );
                    case perspective::t_dtype::DTYPE_UINT8:
                        return static_cast<std::uint64_t>(v.get<std::uint8_t>()
                        );
                    case perspective::t_dtype::DTYPE_FLOAT64:
                        return static_cast<std::uint64_t>(v.get<double>());
                    case perspective::t_dtype::DTYPE_FLOAT32:
                        return static_cast<std::uint64_t>(v.get<float>());
                    default:
                        return std::numeric_limits<std::uint64_t>::quiet_NaN();
                }
            }

            /******************************************************************************
             *
             * Unary functions
             */
            template <>
            inline t_tscalar
            abs_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(abs)
            }
            template <>
            inline t_tscalar
            acos_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(acos)
            }
            template <>
            inline t_tscalar
            acosh_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(acosh)
            }
            template <>
            inline t_tscalar
            asin_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(asin)
            }
            template <>
            inline t_tscalar
            asinh_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(asinh)
            }
            template <>
            inline t_tscalar
            atan_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(atan)
            }
            template <>
            inline t_tscalar
            atanh_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(atanh)
            }
            template <>
            inline t_tscalar
            ceil_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(ceil)
            }
            template <>
            inline t_tscalar
            cos_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(cos)
            }
            template <>
            inline t_tscalar
            cosh_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(cosh)
            }
            template <>
            inline t_tscalar
            exp_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(exp)
            }
            template <>
            inline t_tscalar
            expm1_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(expm1)
            }
            template <>
            inline t_tscalar
            floor_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(floor)
            }
            template <>
            inline t_tscalar
            log_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(log)
            }
            template <>
            inline t_tscalar
            log10_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(log10)
            }
            template <>
            inline t_tscalar
            log2_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(log2)
            }
            template <>
            inline t_tscalar
            log1p_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(log1p)
            }
            template <>
            inline t_tscalar
            round_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(round)
            }

            template <>
            inline t_tscalar
            neg_impl(const t_tscalar v, t_tscalar_type_tag) {
                return -v;
            }
            template <>
            inline t_tscalar
            pos_impl(const t_tscalar v, t_tscalar_type_tag) {
                return +v;
            }

            template <>
            inline t_tscalar
            sgn_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_INT32;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                switch (v.get_dtype()) {
                    case perspective::t_dtype::DTYPE_INT64: {
                        std::int64_t val = v.get<std::int64_t>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_INT32: {
                        std::int32_t val = v.get<std::int32_t>();
                        if (val == 0) {
                            rval.set(val);
                        } else {
                            rval.set((0 < val) - (val < 0));
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_INT16: {
                        std::int16_t val = v.get<std::int16_t>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_INT8: {
                        std::int8_t val = v.get<std::int8_t>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_UINT64: {
                        std::uint64_t val = v.get<std::uint64_t>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_UINT32: {
                        std::uint32_t val = v.get<std::uint32_t>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_UINT16: {
                        std::uint16_t val = v.get<std::uint16_t>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_UINT8: {
                        std::uint8_t val = v.get<std::uint8_t>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_FLOAT64: {
                        double val = v.get<double>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    case perspective::t_dtype::DTYPE_FLOAT32: {
                        float val = v.get<float>();
                        if (val == 0) {
                            rval.set(static_cast<std::int32_t>(val));
                        } else {
                            rval.set(
                                static_cast<std::int32_t>((0 < val) - (val < 0))
                            );
                        }
                    } break;
                    default:
                        return rval;
                }

                return rval;
            }

            template <>
            inline t_tscalar
            sin_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(sin)
            }

            template <>
            inline t_tscalar
            sinc_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                double x = v.to_double();

                if (x == 0) {
                    rval.set(static_cast<double>(1.0));
                } else {
                    rval.set(std::sin(x) / x);
                }

                return rval;
            }
            template <>
            inline t_tscalar
            sinh_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(sinh)
            }
            template <>
            inline t_tscalar
            sqrt_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_FUNCTION_BODY(sqrt)
            }
            template <>
            inline t_tscalar
            tan_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(tan)
            }
            template <>
            inline t_tscalar
            tanh_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(tanh)
            }

            template <>
            inline t_tscalar
            cot_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                rval.set(static_cast<double>(1.00 / std::tan(v.to_double())));

                return rval;
            }

            template <>
            inline t_tscalar
            sec_impl(const t_tscalar v, t_tscalar_type_tag) {
                return mknone();
            }
            template <>
            inline t_tscalar
            csc_impl(const t_tscalar v, t_tscalar_type_tag) {
                return mknone();
            }

            template <>
            inline t_tscalar
            r2d_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                // radians to degrees
                rval.set(
                    v.to_double()
                    * 57.29577951308232087679815481410517033240547246656443
                );
                return rval;
            }

            template <>
            inline t_tscalar
            d2r_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                // degrees to radians
                rval.set(
                    v.to_double()
                    * 0.01745329251994329576923690768488612713442871888542
                );
                return rval;
            }

            template <>
            inline t_tscalar
            d2g_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                // degrees to gradians
                rval.set(v.to_double() * (10.0 / 9.0));
                return rval;
            }

            template <>
            inline t_tscalar
            g2d_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                // gradians to degrees
                rval.set(v.to_double() * (9.0 / 10.0));
                return rval;
            }
            template <>
            inline t_tscalar
            notl_impl(const t_tscalar v, t_tscalar_type_tag) {
                return perspective::expr::logical_not(v);
            }

            template <>
            inline t_tscalar
            frac_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                double intpart;

                switch (v.get_dtype()) {
                    case perspective::t_dtype::DTYPE_INT64:
                    case perspective::t_dtype::DTYPE_INT32:
                    case perspective::t_dtype::DTYPE_INT16:
                    case perspective::t_dtype::DTYPE_INT8:
                    case perspective::t_dtype::DTYPE_UINT64:
                    case perspective::t_dtype::DTYPE_UINT32:
                    case perspective::t_dtype::DTYPE_UINT16:
                    case perspective::t_dtype::DTYPE_UINT8: {
                        rval.set(static_cast<double>(0));
                    }; break;
                    case perspective::t_dtype::DTYPE_FLOAT64:
                    case perspective::t_dtype::DTYPE_FLOAT32: {
                        rval.set(std::modf(v.to_double(), &intpart));
                    } break;
                    default:
                        return rval;
                }

                return rval;
            }

            template <>
            inline t_tscalar
            trunc_impl(const t_tscalar v, t_tscalar_type_tag) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_INT64;

                if (v.is_none()) {
                    return rval;
                }

                if (!v.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v.is_valid()) {
                    return rval;
                }

                rval.set(static_cast<std::int64_t>(v.to_double()));

                return rval;
            }

            template <>
            inline t_tscalar
            erf_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(erf)
            }
            template <>
            inline t_tscalar
            erfc_impl(const t_tscalar v, t_tscalar_type_tag) {
                UNARY_STD_INT_FUNCTION_BODY(erfc)
            }
            template <>
            inline t_tscalar
            ncdf_impl(const t_tscalar v, t_tscalar_type_tag) {
                return mknone();
            }

            /******************************************************************************
             *
             * Binary functions
             */
            template <>
            inline t_tscalar
            min_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                t_tscalar rval;
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (!v0.is_valid() || !v1.is_valid() || v0.is_none()
                    || v1.is_none()) {
                    rval.m_status = perspective::t_status::STATUS_INVALID;
                    return rval;
                }

                double x = v0.to_double();
                double y = v1.to_double();

                rval.set(x < y ? x : y);
                return rval;
            }

            template <>
            inline t_tscalar
            max_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                t_tscalar rval;
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (!v0.is_valid() || !v1.is_valid() || v0.is_none()
                    || v1.is_none()) {
                    rval.m_status = perspective::t_status::STATUS_INVALID;
                    return rval;
                }

                double x = v0.to_double();
                double y = v1.to_double();

                rval.set(x > y ? x : y);
                return rval;
            }

            template <>
            inline t_tscalar
            equal_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::compare(
                    v0, v1, perspective::expr::t_cmp_op::EQ
                );
            }
            template <>
            inline t_tscalar
            nequal_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::compare(
                    v0, v1, perspective::expr::t_cmp_op::NE
                );
            }

            template <>
            inline t_tscalar
            modulus_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return v0 % v1;
            }

            template <>
            inline t_tscalar
            pow_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v0.is_none() || v1.is_none()) {
                    return rval;
                }

                if (!v0.is_numeric() || !v1.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v0.is_valid() || !v1.is_valid()) {
                    return rval;
                }

                rval.set(std::pow(v0.to_double(), v1.to_double()));

                return rval;
            }

            template <>
            inline t_tscalar
            logn_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v0.is_none() || v1.is_none()) {
                    return rval;
                }

                if (!v0.is_numeric() || !v1.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v0.is_valid() || !v1.is_valid()) {
                    return rval;
                }

                double base = v1.to_double();

                if (base < 0) {
                    return rval;
                }

                double result = std::log(v0.to_double()) / std::log(base);

                rval.set(result);
                return rval;
            }

            template <>
            inline t_tscalar
            root_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                t_tscalar rval;
                rval.clear();
                rval.m_type = perspective::t_dtype::DTYPE_FLOAT64;

                if (v0.is_none() || v1.is_none()) {
                    return rval;
                }

                if (!v0.is_numeric() || !v1.is_numeric()) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                }

                if (!v0.is_valid() || !v1.is_valid()) {
                    return rval;
                }

                double x = v0.to_double();
                std::int64_t y = static_cast<std::int64_t>(v1.to_double());

                if (y < 0 || (x < 0 && y % 2 == 0)) {
                    return mknone();
                }

                double result =
                    std::pow(v0.to_double(), (1.0 / v1.to_double()));

                rval.set(result);
                return rval;
            }

            template <>
            inline t_tscalar
            roundn_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return mknone();
            }
            template <>
            inline t_tscalar
            hypot_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return mknone();
            }
            template <>
            inline t_tscalar
            atan2_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return mknone();
            }
            template <>
            inline t_tscalar
            shr_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return mknone();
            }
            template <>
            inline t_tscalar
            shl_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return mknone();
            }

            template <>
            inline t_tscalar
            and_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::logical_and(v0, v1);
            }

            template <>
            inline t_tscalar
            or_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::logical_or(v0, v1);
            }

            template <>
            inline t_tscalar
            xor_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::logical_xor(v0, v1);
            }

            template <>
            inline t_tscalar
            nand_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::logical_nand(v0, v1);
            }

            template <>
            inline t_tscalar
            nor_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::logical_nor(v0, v1);
            }

            template <>
            inline t_tscalar
            xnor_impl(
                const t_tscalar v0, const t_tscalar v1, t_tscalar_type_tag
            ) {
                return perspective::expr::logical_xnor(v0, v1);
            }

            template <>
            inline bool
            is_integer_impl(const t_tscalar& v, t_tscalar_type_tag) {
                switch (v.get_dtype()) {
                    case perspective::t_dtype::DTYPE_INT64:
                    case perspective::t_dtype::DTYPE_INT32:
                    case perspective::t_dtype::DTYPE_INT16:
                    case perspective::t_dtype::DTYPE_INT8:
                    case perspective::t_dtype::DTYPE_UINT64:
                    case perspective::t_dtype::DTYPE_UINT32:
                    case perspective::t_dtype::DTYPE_UINT16:
                    case perspective::t_dtype::DTYPE_UINT8:
                        return true;
                    case perspective::t_dtype::DTYPE_FLOAT64:
                    case perspective::t_dtype::DTYPE_FLOAT32:
                        return false;
                    default:
                        return false;
                }
            };

#undef UNARY_STD_FUNCTION_BODY
#undef UNARY_STD_INT_FUNCTION_BODY

            /**
             * @brief Get the result of applying the given operator to
             * two scalars. Explicitly specialize the template here so
             * we return scalars of DTYPE_BOOL instead of the default
             * DTYPE_FLOAT64 from the function-style cast.
             *
             * @tparam
             * @param operation
             * @param arg0
             * @param arg1
             * @return t_tscalar
             */
            template <>
            inline t_tscalar
            process_impl(
                const operator_type operation,
                const t_tscalar arg0,
                const t_tscalar arg1
            ) {
                // use the scalar type tag to dispatch to the right fns
                t_tscalar_type_tag scalar_type_tag;

                switch (operation) {
                    case e_add:
                        return (arg0 + arg1);
                    case e_sub:
                        return (arg0 - arg1);
                    case e_mul:
                        return (arg0 * arg1);
                    case e_div:
                        return (arg0 / arg1);
                    case e_mod:
                        return modulus_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_pow:
                        return pow_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_atan2:
                        return atan2_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_min:
                        return min_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_max:
                        return max_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_logn:
                        return logn_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_lt:
                        return perspective::expr::compare(
                            arg0, arg1, perspective::expr::t_cmp_op::LT
                        );
                    case e_lte:
                        return perspective::expr::compare(
                            arg0, arg1, perspective::expr::t_cmp_op::LTE
                        );
                    case e_eq:
                        return perspective::expr::compare(
                            arg0, arg1, perspective::expr::t_cmp_op::EQ
                        );
                    case e_ne:
                        return perspective::expr::compare(
                            arg0, arg1, perspective::expr::t_cmp_op::NE
                        );
                    case e_gte:
                        return perspective::expr::compare(
                            arg0, arg1, perspective::expr::t_cmp_op::GTE
                        );
                    case e_gt:
                        return perspective::expr::compare(
                            arg0, arg1, perspective::expr::t_cmp_op::GT
                        );
                    case e_and:
                        return and_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_nand:
                        return nand_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_or:
                        return or_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_nor:
                        return nor_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_xor:
                        return xor_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_xnor:
                        return xnor_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_root:
                        return root_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_roundn:
                        return roundn_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_equal:
                        return equal_impl(arg0, arg1, scalar_type_tag);
                    case e_nequal:
                        return nequal_impl(arg0, arg1, scalar_type_tag);
                    case e_hypot:
                        return hypot_impl<t_tscalar>(
                            arg0, arg1, scalar_type_tag
                        );
                    case e_shr:
                        return shr_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    case e_shl:
                        return shl_impl<t_tscalar>(arg0, arg1, scalar_type_tag);
                    default:
                        // return scalar of DTYPE_NONE
                        return std::numeric_limits<t_tscalar>::quiet_NaN();
                }
            }

        } // end namespace details
    }     // end namespace numeric

    /**
     * Override the comparison operators to return a `t_tscalar` of DTYPE_BOOL
     * instead of the default DTYPE_FLOAT64 from the function-style cast.
     */
    template <>
    struct lt_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::compare(
                t1, t2, perspective::expr::t_cmp_op::LT
            );
        }

        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            t_tscalar rval;
            rval.set(t1 < t2);
            return rval;
        }

        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_lt;
        }
        static inline details::operator_type
        operation() {
            return details::e_lt;
        }
    };

    template <>
    struct lte_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::compare(
                t1, t2, perspective::expr::t_cmp_op::LTE
            );
        }
        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            t_tscalar rval;
            rval.set(t1 <= t2);
            return rval;
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_lte;
        }
        static inline details::operator_type
        operation() {
            return details::e_lte;
        }
    };

    template <>
    struct gt_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::compare(
                t1, t2, perspective::expr::t_cmp_op::GT
            );
        }

        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            t_tscalar rval;
            rval.set(t1 > t2);
            return rval;
        }

        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_gt;
        }
        static inline details::operator_type
        operation() {
            return details::e_gt;
        }
    };

    template <>
    struct gte_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::compare(
                t1, t2, perspective::expr::t_cmp_op::GTE
            );
        }

        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            t_tscalar rval;
            rval.set(t1 >= t2);
            return rval;
        }

        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_gte;
        }
        static inline details::operator_type
        operation() {
            return details::e_gte;
        }
    };

    template <>
    struct eq_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;
        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::compare(
                t1, t2, perspective::expr::t_cmp_op::EQ
            );
        }
        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            t_tscalar rval;
            rval.set(t1 == t2);
            return rval;
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_eq;
        }
        static inline details::operator_type
        operation() {
            return details::e_eq;
        }
    };

    template <>
    struct equal_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::compare(
                t1, t2, perspective::expr::t_cmp_op::EQ
            );
        }
        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            t_tscalar rval;
            rval.set(t1 == t2);
            return rval;
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_eq;
        }
        static inline details::operator_type
        operation() {
            return details::e_equal;
        }
    };

    template <>
    struct ne_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::compare(
                t1, t2, perspective::expr::t_cmp_op::NE
            );
        }
        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            t_tscalar rval;
            rval.set(t1 != t2);
            return rval;
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_ne;
        }
        static inline details::operator_type
        operation() {
            return details::e_ne;
        }
    };

    template <>
    struct and_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::logical_and(t1, t2);
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_and;
        }
        static inline details::operator_type
        operation() {
            return details::e_and;
        }
    };

    template <>
    struct nand_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::logical_nand(t1, t2);
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_nand;
        }
        static inline details::operator_type
        operation() {
            return details::e_nand;
        }
    };

    template <>
    struct or_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::logical_or(t1, t2);
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_or;
        }
        static inline details::operator_type
        operation() {
            return details::e_or;
        }
    };

    template <>
    struct nor_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::logical_nor(t1, t2);
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_nor;
        }
        static inline details::operator_type
        operation() {
            return details::e_nor;
        }
    };

    template <>
    struct xor_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::logical_xor(t1, t2);
        }

        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_nor;
        }
        static inline details::operator_type
        operation() {
            return details::e_xor;
        }
    };

    template <>
    struct xnor_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(Type t1, Type t2) {
            return perspective::expr::logical_xnor(t1, t2);
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_nor;
        }
        static inline details::operator_type
        operation() {
            return details::e_xnor;
        }
    };

    /**
     * We don't use ExprTk std::string literals (strings are passed into
     * intern() automatically), so disable the string literal comparison
     * operations. The only time we use string literals explicitly are in
     * the parameter of the `bucket` operation, but that doesn't use these
     * comparison operators.
     */
    template <>
    struct in_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(const t_tscalar&, const t_tscalar&) {
            return std::numeric_limits<t_tscalar>::quiet_NaN();
        }
        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            return std::numeric_limits<t_tscalar>::quiet_NaN();
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_in;
        }
        static inline details::operator_type
        operation() {
            return details::e_in;
        }
    };

    template <>
    struct like_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(const t_tscalar&, const t_tscalar&) {
            return std::numeric_limits<t_tscalar>::quiet_NaN();
        }
        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            return std::numeric_limits<t_tscalar>::quiet_NaN();
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_like;
        }
        static inline details::operator_type
        operation() {
            return details::e_like;
        }
    };

    template <>
    struct ilike_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(const t_tscalar&, const t_tscalar&) {
            return std::numeric_limits<t_tscalar>::quiet_NaN();
        }
        static inline t_tscalar
        process(const std::string& t1, const std::string& t2) {
            return std::numeric_limits<t_tscalar>::quiet_NaN();
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_ilike;
        }
        static inline details::operator_type
        operation() {
            return details::e_ilike;
        }
    };

    template <>
    struct inrange_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        static inline t_tscalar
        process(const t_tscalar& t0, const t_tscalar& t1, const t_tscalar& t2) {
            return perspective::expr::inrange(t0, t1, t2);
        }
        static inline t_tscalar
        process(
            const std::string& t0, const std::string& t1, const std::string& t2
        ) {
            t_tscalar rval;
            rval.set((t0 <= t1) && (t1 <= t2));
            return rval;
        }
        static inline typename expression_node<t_tscalar>::node_type
        type() {
            return expression_node<t_tscalar>::e_inranges;
        }
        static inline details::operator_type
        operation() {
            return details::e_inrange;
        }
    };

    /**
     * @brief mand(a, b, c, ...) returns true if all arguments evaluate to
     * true, else false. All parameters should be of DTYPE_BOOL, or the
     * function will return a scalar of DTYPE_NONE indicating an invalid
     * operation.
     */
    template <>
    struct vararg_mand_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        template <
            typename Type,
            typename Allocator,
            template <typename, typename>
            class Sequence>
        static inline t_tscalar
        process(const Sequence<Type, Allocator>& arg_list) {
            t_tscalar rval = mktscalar(false);

            // Originally, there was specific implementations for up to 5 args
            // that did not use a for loop, but since we do type-checking
            // centralize all the logic here instead.
            for (std::size_t i = 0; i < arg_list.size(); ++i) {
                t_tscalar val = value(arg_list[i]);

                // If scalar is invalid or not a bool, return bool but
                // with STATUS_CLEAR to poison the type-checker.
                if (!val.is_valid()
                    || val.get_dtype() != perspective::t_dtype::DTYPE_BOOL) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                    return rval;
                }

                // if value is equal to False, return False
                if (std::equal_to<t_tscalar>()(rval, val)) {
                    return rval;
                }
            }

            // True if all values are true
            rval.set(true);
            return rval;
        }
    };

    // /**
    //  * @brief mor(a, b, c, ...) returns True if any parameter evalutes to
    //  * True, and False otherwise. All parameters should be scalars of
    //  * `DTYPE_BOOL`.
    //  *
    //  * @tparam T
    //  */
    template <>
    struct vararg_mor_op<t_tscalar> : public opr_base<t_tscalar> {
        typedef typename opr_base<t_tscalar>::Type Type;

        template <
            typename Type,
            typename Allocator,
            template <typename, typename>
            class Sequence>
        static inline t_tscalar
        process(const Sequence<Type, Allocator>& arg_list) {
            t_tscalar rval = mktscalar(false);

            // Originally, there was specific implementations for up to 5 args
            // that did not use a for loop, but since we do type-checking
            // centralize all the logic here instead.
            for (std::size_t i = 0; i < arg_list.size(); ++i) {
                t_tscalar val = value(arg_list[i]);

                // If scalar is invalid or not a bool, return bool but
                // with STATUS_CLEAR to poison the type-checker.
                if (!val.is_valid()
                    || val.get_dtype() != perspective::t_dtype::DTYPE_BOOL) {
                    rval.m_status = perspective::t_status::STATUS_CLEAR;
                    return rval;
                }

                // if any value is True, return True
                if (std::not_equal_to<t_tscalar>()(rval, val)) {
                    rval.set(true);
                    return rval;
                }
            }

            // False if all values are false
            return rval;
        }
    };

    /**
     * @brief Evaluates the truthiness of an expression node that returns a
     * `t_tscalar`. The `t_tscalar` returned must be of type bool.
     *
     * @tparam
     * @param node
     * @return true
     * @return false
     */
    template <>
    inline bool
    is_true(const expression_node<t_tscalar>* node) {
        return perspective::expr::truthy(node->value());
    }

    template <>
    inline bool
    is_true(const std::pair<expression_node<t_tscalar>*, bool>& node) {
        return perspective::expr::truthy(node.first->value());
    }

    template <>
    inline bool
    is_false(const expression_node<t_tscalar>* node) {
        return !perspective::expr::truthy(node->value());
    }

    template <>
    inline bool
    is_false(const std::pair<expression_node<t_tscalar>*, bool>& node) {
        return !perspective::expr::truthy(node.first->value());
    }

    /**
     * @brief Evaluates the truthiness of a single scalar value.
     *
     * @param v
     * @return true
     * @return false
     */
    inline bool
    is_true(const t_tscalar& v) {
        return perspective::expr::truthy(v);
    }

    inline bool
    is_false(const t_tscalar& v) {
        return !is_true(v);
    };

    /******************************************************************************
     *
     * String -> t_tscalar
     */

    /**
     * @brief Parse an infinity value and set `t` to infinity as a DTYPE_FLOAT64
     * scalar.
     *
     * @tparam Iterator
     * @param itr
     * @param end
     * @param t
     * @param negative
     * @return true
     * @return false
     */
    template <typename Iterator>
    static inline bool
    parse_inf(Iterator& itr, const Iterator end, t_tscalar& t, bool negative) {
        static const char_t inf_uc[] = "INFINITY";
        static const char_t inf_lc[] = "infinity";
        static const std::size_t inf_length = 8;

        const std::size_t length =
            static_cast<std::size_t>(std::distance(itr, end));

        if ((3 != length) && (inf_length != length)) {
            return false;
        }

        char_cptr inf_itr = ('i' == (*itr)) ? inf_lc : inf_uc;

        while (end != itr) {
            if (*inf_itr == static_cast<char>(*itr)) {
                ++itr;
                ++inf_itr;
                continue;
            } else {
                return false;
            }
        }

        negative ? t.set(-std::numeric_limits<double>::infinity())
                 : t.set(std::numeric_limits<double>::infinity());
        t.m_type = perspective::t_dtype::DTYPE_FLOAT64;

        return true;
    }

    template <typename T>
    inline bool
    valid_exponent(const int exponent, numeric::details::t_tscalar_type_tag) {
        using namespace details::numeric;
        return (numeric_info<T>::min_exp <= exponent)
            && (exponent <= numeric_info<T>::max_exp);
    }

    /**
     * @brief Parse a string to a real number, setting `t` to the parsed value
     * and giving it DTYPE_FLOAT64. Returns true if the parse succeeded, and
     * false otherwise.
     *
     * @tparam Iterator
     * @param itr_external
     * @param end
     * @param t
     * @return true
     * @return false
     */
    template <typename Iterator>
    inline bool
    string_to_real(
        Iterator& itr_external,
        const Iterator end,
        t_tscalar& t,
        numeric::details::t_tscalar_type_tag
    ) {
        bool parsed = string_to_real(
            itr_external,
            end,
            t.m_data.m_float64,
            numeric::details::real_type_tag()
        );

        if (parsed) {
            t.m_type = perspective::DTYPE_FLOAT64;
            t.m_status = perspective::STATUS_VALID;
        }

        return parsed;
    }

} // end namespace details
} // end namespace exprtk
