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
#include <perspective/scalar.h>
#include <perspective/exports.h>
#include <perspective/comparators.h>
#include <array>
#include <vector>

namespace perspective {

// Inline fixed-capacity vector for sort rows, avoiding heap allocation.
// Max 8 sort columns covers all practical use cases.
struct PERSPECTIVE_EXPORT t_sortrow_vec {
    static constexpr std::size_t MAX_CAPACITY = 8;

    t_sortrow_vec() : m_size(0) {}

    t_sortrow_vec(const std::vector<t_tscalar>& v) : m_size(v.size()) {
        for (std::size_t i = 0; i < m_size; ++i) {
            m_data[i] = v[i];
        }
    }

    t_sortrow_vec(const t_sortrow_vec&) = default;
    t_sortrow_vec& operator=(const t_sortrow_vec&) = default;
    t_sortrow_vec(t_sortrow_vec&&) = default;
    t_sortrow_vec& operator=(t_sortrow_vec&&) = default;

    void reserve(std::size_t) {}

    void push_back(const t_tscalar& v) { m_data[m_size++] = v; }

    const t_tscalar& operator[](std::size_t i) const { return m_data[i]; }
    t_tscalar& operator[](std::size_t i) { return m_data[i]; }

    std::size_t size() const { return m_size; }

    const t_tscalar* begin() const { return m_data.data(); }
    const t_tscalar* end() const { return m_data.data() + m_size; }

    std::array<t_tscalar, MAX_CAPACITY> m_data;
    std::uint8_t m_size;
};

struct PERSPECTIVE_EXPORT t_mselem {
    t_mselem();
    t_mselem(const std::vector<t_tscalar>& row);
    t_mselem(const std::vector<t_tscalar>& row, t_uindex order);
    t_mselem(const t_tscalar& pkey, const std::vector<t_tscalar>& row);
    t_mselem(const t_mselem& other) = default;
    t_mselem(t_mselem&& other) noexcept = default;
    t_mselem& operator=(const t_mselem& other) = default;
    t_mselem& operator=(t_mselem&& other) noexcept = default;

    t_sortrow_vec m_row;
    t_tscalar m_pkey;
    t_uindex m_order;
    bool m_deleted;
    bool m_updated;
};

} // end namespace perspective

namespace std {

inline std::ostream&
operator<<(std::ostream& os, const perspective::t_sortrow_vec& v) {
    os << "[";
    for (std::size_t i = 0; i < v.size(); ++i) {
        if (i > 0) {
            os << ", ";
        }
        os << v[i];
    }
    os << "]";
    return os;
}

inline std::ostream&
operator<<(std::ostream& os, const perspective::t_mselem& t) {
    os << "mse<pkey => " << t.m_pkey << " row => " << t.m_row << " deleted => "
       << t.m_deleted << " order => " << t.m_order << ">";
    return os;
}

} // end namespace std

namespace perspective {

inline void
swap(t_mselem& a, t_mselem& b) {
    t_mselem c(std::move(a));
    a = std::move(b);
    b = std::move(c);
}

struct PERSPECTIVE_EXPORT t_minmax_idx {
    t_minmax_idx(t_index mn, t_index mx);

    t_index m_min;
    t_index m_max;
};

// Given a vector return the indices of the
// minimum and maximum elements in it.
PERSPECTIVE_EXPORT t_minmax_idx
get_minmax_idx(const std::vector<t_tscalar>& vec, t_sorttype stype);

PERSPECTIVE_EXPORT double to_double(const t_tscalar& c);

struct PERSPECTIVE_EXPORT t_nancmp {
    t_nancmp();

    bool m_active;
    t_cmp_op m_cmpval;
};

PERSPECTIVE_EXPORT t_nancmp
nan_compare(t_sorttype order, const t_tscalar& a, const t_tscalar& b);

inline PERSPECTIVE_EXPORT bool
cmp_mselem(
    const t_mselem& a,
    const t_mselem& b,
    const std::vector<t_sorttype>& sort_order
) {
    typedef std::pair<double, t_tscalar> dpair;

    if (a.m_row.size() != b.m_row.size()
        || a.m_row.size() != sort_order.size()) {
        std::cout << "ERROR detected in MultiSort."
                  << "\n";
        return false;
    }

    t_tscalar first_pkey = a.m_pkey;
    t_tscalar second_pkey = b.m_pkey;

    for (int idx = 0, loop_end = sort_order.size(); idx < loop_end; ++idx) {
        const t_tscalar& first = a.m_row[idx];
        const t_tscalar& second = b.m_row[idx];

        t_sorttype order = sort_order[idx];

        if (first.is_floating_point() || second.is_floating_point()) {
            t_nancmp nancmp = nan_compare(order, first, second);

            if (nancmp.m_active) {
                switch (nancmp.m_cmpval) {
                    case CMP_OP_LT: {
                        return true;
                    } break;
                    case CMP_OP_GT: {
                        return false;
                    } break;
                    case CMP_OP_EQ:
                    default: {
                        continue;
                    } break;
                }
            }
        }

        if (first == second) {
            continue;
        }

        switch (order) {
            case SORTTYPE_ASCENDING: {
                return (first < second);
            } break;
            case SORTTYPE_DESCENDING: {
                return (first > second);
            } break;
            case SORTTYPE_ASCENDING_ABS: {
                double val_a = first.to_double();
                double val_b = second.to_double();
                return dpair(std::abs(val_a), first_pkey)
                    < dpair(std::abs(val_b), second_pkey);
            } break;
            case SORTTYPE_DESCENDING_ABS: {
                double val_a = first.to_double();
                double val_b = second.to_double();
                return dpair(std::abs(val_a), first_pkey)
                    > dpair(std::abs(val_b), second_pkey);
            } break;
            case SORTTYPE_NONE: {
                return first_pkey < second_pkey;
            }
        }
    }

    if (a.m_order != b.m_order) {
        return a.m_order < b.m_order;
    }

    return first_pkey < second_pkey;
}

inline PERSPECTIVE_EXPORT bool
cmp_mselem(
    const t_mselem* a,
    const t_mselem* b,
    const std::vector<t_sorttype>& sort_order
) {
    return cmp_mselem(*a, *b, sort_order);
}

// Helper for sorting taking multiple sort specifications
// into account
struct PERSPECTIVE_EXPORT t_multisorter {
    t_multisorter(const std::vector<t_sorttype>& order);

    t_multisorter(
        std::shared_ptr<const std::vector<t_mselem>> elems,
        const std::vector<t_sorttype>& order
    );

    bool operator()(const t_mselem& a, const t_mselem& b) const;

    bool operator()(t_index a, t_index b) const;

    std::vector<t_sorttype> m_sort_order;
    std::shared_ptr<const std::vector<t_mselem>> m_elems;
};

} // end namespace perspective
