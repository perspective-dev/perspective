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
#include <perspective/exports.h>
#include <perspective/scalar.h>
#include <cmath>

namespace perspective {

struct t_multisorter;

PERSPECTIVE_EXPORT void
argsort(std::vector<t_index>& output, const t_multisorter& sorter);

template <t_sorttype SORT_TYPE>
struct t_argsort_comparator_impl {
    explicit t_argsort_comparator_impl(const std::vector<t_tscalar>& v) :
        m_v(v) {}

    bool operator()(t_index a, t_index b) const;

    const std::vector<t_tscalar>& m_v;
};

template <>
inline bool
t_argsort_comparator_impl<SORTTYPE_ASCENDING>::operator()(
    t_index a, t_index b
) const {
    return m_v[a] < m_v[b];
}

template <>
inline bool
t_argsort_comparator_impl<SORTTYPE_DESCENDING>::operator()(
    t_index a, t_index b
) const {
    return m_v[a] > m_v[b];
}

template <>
inline bool
t_argsort_comparator_impl<SORTTYPE_ASCENDING_ABS>::operator()(
    t_index a, t_index b
) const {
    return std::abs(m_v[a].to_double()) < std::abs(m_v[b].to_double());
}

template <>
inline bool
t_argsort_comparator_impl<SORTTYPE_DESCENDING_ABS>::operator()(
    t_index a, t_index b
) const {
    return std::abs(m_v[a].to_double()) > std::abs(m_v[b].to_double());
}

template <>
inline bool
t_argsort_comparator_impl<SORTTYPE_NONE>::operator()(
    t_index a, t_index b
) const {
    return a < b;
}

// Legacy non-template comparator kept for API compatibility
struct PERSPECTIVE_EXPORT t_argsort_comparator {
    t_argsort_comparator(
        const std::vector<t_tscalar>& v, const t_sorttype& sort_type
    );

    bool operator()(t_index a, t_index b) const;

    const std::vector<t_tscalar>& m_v;
    t_sorttype m_sort_type;
};

PERSPECTIVE_EXPORT void simple_argsort(
    std::vector<t_tscalar>& v,
    std::vector<t_index>& output,
    const t_sorttype& sort_type
);

} // namespace perspective
