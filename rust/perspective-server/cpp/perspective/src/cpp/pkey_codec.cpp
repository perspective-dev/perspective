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


#include <perspective/pkey_codec.h>
#include <perspective/date.h>
#include <perspective/time.h>
#include <cmath>
#include <cstring>
#include <limits>
#include <sstream>

namespace perspective {

namespace {
    constexpr unsigned char NULL_MARK = 0x00;
    constexpr unsigned char VALUE_MARK = 0x01;
    constexpr unsigned char ESCAPE = 0x01;

    template <typename T>
    void
    append_be(std::string& raw, T v) {
        for (int shift = (int)(sizeof(T) * 8) - 8; shift >= 0; shift -= 8) {
            raw.push_back(static_cast<char>((v >> shift) & 0xFF));
        }
    }

    template <typename T>
    T
    read_be(const unsigned char*& p) {
        T v = 0;
        for (std::size_t i = 0; i < sizeof(T); ++i) {
            v = (v << 8) | static_cast<T>(*p++);
        }

        return v;
    }

    template <typename U, typename S>
    U
    flip_sign(S v) {
        U u;
        std::memcpy(&u, &v, sizeof(U));
        return u ^ (static_cast<U>(1) << (sizeof(U) * 8 - 1));
    }

    template <typename S, typename U>
    S
    unflip_sign(U u) {
        u ^= (static_cast<U>(1) << (sizeof(U) * 8 - 1));
        S s;
        std::memcpy(&s, &u, sizeof(S));
        return s;
    }

    std::uint64_t
    float_to_ordered(double v) {
        if (std::isnan(v)) {
            v = std::numeric_limits<double>::quiet_NaN();
        } else if (v == 0.0) {
            v = 0.0;
        }

        std::uint64_t bits;
        std::memcpy(&bits, &v, sizeof(bits));
        if ((bits >> 63) != 0) {
            return ~bits;
        }

        return bits ^ (static_cast<std::uint64_t>(1) << 63);
    }

    double
    ordered_to_float(std::uint64_t bits) {
        if ((bits >> 63) != 0) {
            bits ^= (static_cast<std::uint64_t>(1) << 63);
        } else {
            bits = ~bits;
        }

        double v;
        std::memcpy(&v, &bits, sizeof(v));
        return v;
    }

    std::uint32_t
    float32_to_ordered(float v) {
        if (std::isnan(v)) {
            v = std::numeric_limits<float>::quiet_NaN();
        } else if (v == 0.0F) {
            v = 0.0F;
        }

        std::uint32_t bits;
        std::memcpy(&bits, &v, sizeof(bits));
        if ((bits >> 31) != 0) {
            return ~bits;
        }

        return bits ^ (static_cast<std::uint32_t>(1) << 31);
    }

    float
    ordered_to_float32(std::uint32_t bits) {
        if ((bits >> 31) != 0) {
            bits ^= (static_cast<std::uint32_t>(1) << 31);
        } else {
            bits = ~bits;
        }

        float v;
        std::memcpy(&v, &bits, sizeof(v));
        return v;
    }

    void
    escape_nul_free(const std::string& raw, std::string& out) {
        out.clear();
        out.reserve(raw.size() + 8);
        for (const char c : raw) {
            const auto b = static_cast<unsigned char>(c);
            if (b == 0x00) {
                out.push_back(static_cast<char>(ESCAPE));
                out.push_back(static_cast<char>(0x01));
            } else if (b == ESCAPE) {
                out.push_back(static_cast<char>(ESCAPE));
                out.push_back(static_cast<char>(0x02));
            } else {
                out.push_back(c);
            }
        }
    }

    std::string
    unescape_nul_free(const char* bytes) {
        std::string raw;
        for (const char* p = bytes; *p != '\0'; ++p) {
            const auto b = static_cast<unsigned char>(*p);
            if (b == ESCAPE) {
                ++p;
                raw.push_back(static_cast<char>(*p == 0x01 ? 0x00 : ESCAPE));
            } else {
                raw.push_back(*p);
            }
        }

        return raw;
    }
} // namespace

t_pkey_codec::t_pkey_codec(std::vector<t_dtype> dtypes) :
    m_dtypes(std::move(dtypes)) {
    for (const auto dtype : m_dtypes) {
        if (!is_supported(dtype)) {
            std::stringstream ss;
            ss << "Unsupported type `" << get_dtype_descr(dtype)
               << "` for `index`.\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }
}

t_pkey_codec
t_pkey_codec::from_schema(
    const t_schema& schema, const std::vector<std::string>& index
) {
    std::vector<t_dtype> dtypes;
    dtypes.reserve(index.size());
    for (const auto& name : index) {
        if (!schema.has_column(name)) {
            std::stringstream ss;
            ss << "Specified index `" << name
               << "` does not appear in the Table.\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        dtypes.push_back(schema.get_dtype(name));
    }

    return t_pkey_codec(std::move(dtypes));
}

bool
t_pkey_codec::is_supported(t_dtype dtype) {
    switch (dtype) {
        case DTYPE_INT64:
        case DTYPE_INT32:
        case DTYPE_INT16:
        case DTYPE_INT8:
        case DTYPE_UINT64:
        case DTYPE_UINT32:
        case DTYPE_UINT16:
        case DTYPE_UINT8:
        case DTYPE_FLOAT64:
        case DTYPE_FLOAT32:
        case DTYPE_BOOL:
        case DTYPE_DATE:
        case DTYPE_TIME:
        case DTYPE_STR:
            return true;
        default:
            return false;
    }
}

const std::vector<t_dtype>&
t_pkey_codec::dtypes() const {
    return m_dtypes;
}

std::size_t
t_pkey_codec::arity() const {
    return m_dtypes.size();
}

t_tscalar
t_pkey_codec::coerce(const t_tscalar& value, t_dtype dtype) const {
    if (!value.is_valid()) {
        return mknull(dtype);
    }

    if (value.get_dtype() == dtype) {
        return value;
    }

    t_tscalar rval;
    rval.clear();
    switch (dtype) {
        case DTYPE_INT64:
            rval.set(static_cast<std::int64_t>(value.to_int64()));
            break;
        case DTYPE_INT32:
            rval.set(static_cast<std::int32_t>(value.to_int64()));
            break;
        case DTYPE_INT16:
            rval.set(static_cast<std::int16_t>(value.to_int64()));
            break;
        case DTYPE_INT8:
            rval.set(static_cast<std::int8_t>(value.to_int64()));
            break;
        case DTYPE_UINT64:
            rval.set(static_cast<std::uint64_t>(value.to_int64()));
            break;
        case DTYPE_UINT32:
            rval.set(static_cast<std::uint32_t>(value.to_int64()));
            break;
        case DTYPE_UINT16:
            rval.set(static_cast<std::uint16_t>(value.to_int64()));
            break;
        case DTYPE_UINT8:
            rval.set(static_cast<std::uint8_t>(value.to_int64()));
            break;
        case DTYPE_FLOAT64:
            rval.set(value.to_double());
            break;
        case DTYPE_FLOAT32:
            rval.set(static_cast<float>(value.to_double()));
            break;
        case DTYPE_BOOL:
            rval.set(value.as_bool());
            break;
        case DTYPE_DATE:
            rval.set(t_date(static_cast<std::uint32_t>(value.to_int64())));
            break;
        case DTYPE_TIME:
            rval.set(t_time(value.to_int64()));
            break;
        case DTYPE_STR: {
            std::stringstream ss;
            ss << "Cannot use a value of type `"
               << get_dtype_descr(value.get_dtype())
               << "` as a string index column.\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        } break;
        default:
            PSP_COMPLAIN_AND_ABORT("Unsupported type for `index`.");
    }

    return rval;
}

void
t_pkey_codec::encode_field(
    const t_tscalar& value, t_dtype dtype, std::string& raw
) const {
    if (!value.is_valid()) {
        raw.push_back(static_cast<char>(NULL_MARK));
        return;
    }

    raw.push_back(static_cast<char>(VALUE_MARK));
    const t_tscalar v = coerce(value, dtype);
    switch (dtype) {
        case DTYPE_INT64:
            append_be(raw, flip_sign<std::uint64_t>(v.m_data.m_int64));
            break;
        case DTYPE_INT32:
            append_be(raw, flip_sign<std::uint32_t>(v.m_data.m_int32));
            break;
        case DTYPE_INT16:
            append_be(raw, flip_sign<std::uint16_t>(v.m_data.m_int16));
            break;
        case DTYPE_INT8:
            append_be(raw, flip_sign<std::uint8_t>(v.m_data.m_int8));
            break;
        case DTYPE_UINT64:
            append_be(raw, v.m_data.m_uint64);
            break;
        case DTYPE_UINT32:
        case DTYPE_DATE:
            append_be(raw, v.m_data.m_uint32);
            break;
        case DTYPE_UINT16:
            append_be(raw, v.m_data.m_uint16);
            break;
        case DTYPE_UINT8:
            append_be(raw, v.m_data.m_uint8);
            break;
        case DTYPE_TIME:
            append_be(raw, flip_sign<std::uint64_t>(v.m_data.m_int64));
            break;
        case DTYPE_FLOAT64:
            append_be(raw, float_to_ordered(v.m_data.m_float64));
            break;
        case DTYPE_FLOAT32:
            append_be(raw, float32_to_ordered(v.m_data.m_float32));
            break;
        case DTYPE_BOOL:
            raw.push_back(static_cast<char>(v.m_data.m_bool ? 1 : 0));
            break;
        case DTYPE_STR: {
            const char* s = v.get_char_ptr();
            if (s != nullptr) {
                raw.append(s);
            }

            raw.push_back('\0');
        } break;
        default:
            PSP_COMPLAIN_AND_ABORT("Unsupported type for `index`.");
    }
}

void
t_pkey_codec::encode(
    const std::vector<const t_column*>& cols, t_uindex ridx, std::string& out
) const {
    std::string raw;
    for (std::size_t i = 0; i < m_dtypes.size(); ++i) {
        encode_field(cols[i]->get_scalar(ridx), m_dtypes[i], raw);
    }

    escape_nul_free(raw, out);
}

void
t_pkey_codec::encode(const std::vector<t_tscalar>& key, std::string& out)
    const {
    if (key.size() != m_dtypes.size()) {
        std::stringstream ss;
        ss << "Composite index expects " << m_dtypes.size()
           << " values but received " << key.size() << ".\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    std::string raw;
    for (std::size_t i = 0; i < m_dtypes.size(); ++i) {
        encode_field(key[i], m_dtypes[i], raw);
    }

    escape_nul_free(raw, out);
}

std::vector<t_tscalar>
t_pkey_codec::decode(const char* bytes, std::vector<std::string>& storage)
    const {
    std::vector<t_tscalar> rval;
    rval.reserve(m_dtypes.size());
    storage.assign(m_dtypes.size(), std::string());
    if (bytes == nullptr) {
        for (const auto dtype : m_dtypes) {
            rval.push_back(mknull(dtype));
        }

        return rval;
    }

    const std::string raw = unescape_nul_free(bytes);
    const auto* p = reinterpret_cast<const unsigned char*>(raw.data());
    const auto* end = p + raw.size();
    for (std::size_t i = 0; i < m_dtypes.size(); ++i) {
        const auto dtype = m_dtypes[i];
        if (p >= end || *p == NULL_MARK) {
            if (p < end) {
                ++p;
            }

            rval.push_back(mknull(dtype));
            continue;
        }

        ++p;
        t_tscalar v;
        v.clear();
        switch (dtype) {
            case DTYPE_INT64:
                v.set(unflip_sign<std::int64_t>(read_be<std::uint64_t>(p)));
                break;
            case DTYPE_INT32:
                v.set(unflip_sign<std::int32_t>(read_be<std::uint32_t>(p)));
                break;
            case DTYPE_INT16:
                v.set(unflip_sign<std::int16_t>(read_be<std::uint16_t>(p)));
                break;
            case DTYPE_INT8:
                v.set(unflip_sign<std::int8_t>(read_be<std::uint8_t>(p)));
                break;
            case DTYPE_UINT64:
                v.set(read_be<std::uint64_t>(p));
                break;
            case DTYPE_UINT32:
                v.set(read_be<std::uint32_t>(p));
                break;
            case DTYPE_DATE:
                v.set(t_date(read_be<std::uint32_t>(p)));
                break;
            case DTYPE_UINT16:
                v.set(read_be<std::uint16_t>(p));
                break;
            case DTYPE_UINT8:
                v.set(read_be<std::uint8_t>(p));
                break;
            case DTYPE_TIME:
                v.set(t_time(unflip_sign<std::int64_t>(read_be<std::uint64_t>(p)
                )));
                break;
            case DTYPE_FLOAT64:
                v.set(ordered_to_float(read_be<std::uint64_t>(p)));
                break;
            case DTYPE_FLOAT32:
                v.set(ordered_to_float32(read_be<std::uint32_t>(p)));
                break;
            case DTYPE_BOOL:
                v.set(*p++ != 0);
                break;
            case DTYPE_STR: {
                const auto* start = reinterpret_cast<const char*>(p);
                const auto len = std::strlen(start);
                storage[i].assign(start, len);
                p += len + 1;
                v.set(storage[i].c_str());
            } break;
            default:
                PSP_COMPLAIN_AND_ABORT("Unsupported type for `index`.");
        }

        rval.push_back(v);
    }

    return rval;
}

void
fill_pkey_from_index(
    t_data_table& tbl,
    const std::vector<std::string>& index,
    const t_pkey_codec& codec,
    bool is_update,
    bool fill_okey
) {
    std::vector<std::shared_ptr<t_column>> owned;
    std::vector<const t_column*> cols;
    for (const auto& name : index) {
        auto col = tbl.get_column_safe(name);
        if (!col) {
            std::stringstream ss;
            if (is_update) {
                ss << "Update is missing index column `" << name << "`\n";
            } else {
                ss << "Specified index `" << name
                   << "` does not exist in dataset.\n";
            }

            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        owned.push_back(col);
        cols.push_back(col.get());
    }

    auto pkey = tbl.add_column_sptr("psp_pkey", DTYPE_STR, true);
    std::shared_ptr<t_column> okey;
    if (fill_okey) {
        okey = tbl.add_column_sptr("psp_okey", DTYPE_STR, true);
    }

    std::string key;
    for (t_uindex ridx = 0; ridx < tbl.size(); ++ridx) {
        codec.encode(cols, ridx, key);
        pkey->set_nth<const char*>(ridx, key.c_str());
        if (okey) {
            okey->set_nth<const char*>(ridx, key.c_str());
        }
    }
}

} // namespace perspective
