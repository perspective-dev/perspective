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
#include <functional>
#include <perspective/arg_sort.h>
#include <perspective/multi_sort.h>
#include <perspective/scalar.h>

namespace perspective {

void
argsort(std::vector<t_index>& output, const t_multisorter& sorter) {
    if (output.empty()) {
        return;
    }
    // Output should be the same size is v
    for (t_index i = 0, loop_end = output.size(); i != loop_end; ++i) {
        output[i] = i;
    }
    std::sort(output.begin(), output.end(), sorter);
}

t_argsort_comparator::t_argsort_comparator(
    const std::vector<t_tscalar>& v, const t_sorttype& sort_type
) :
    m_v(v),
    m_sort_type(sort_type) {}

bool
t_argsort_comparator::operator()(t_index a, t_index b) const {
    switch (m_sort_type) {
        case SORTTYPE_ASCENDING:
            return t_argsort_comparator_impl<SORTTYPE_ASCENDING>(m_v)(a, b);
        case SORTTYPE_DESCENDING:
            return t_argsort_comparator_impl<SORTTYPE_DESCENDING>(m_v)(a, b);
        case SORTTYPE_ASCENDING_ABS:
            return t_argsort_comparator_impl<SORTTYPE_ASCENDING_ABS>(m_v)(a, b);
        case SORTTYPE_DESCENDING_ABS:
            return t_argsort_comparator_impl<SORTTYPE_DESCENDING_ABS>(m_v)(
                a, b
            );
        case SORTTYPE_NONE:
            return t_argsort_comparator_impl<SORTTYPE_NONE>(m_v)(a, b);
    }

    return a < b;
}

namespace {

void
init_output(std::vector<t_index>& output) {
    for (t_index i = 0, loop_end = output.size(); i != loop_end; ++i) {
        output[i] = i;
    }
}

} // anonymous namespace

void
simple_argsort(
    std::vector<t_tscalar>& v,
    std::vector<t_index>& output,
    const t_sorttype& sort_type
) {
    init_output(output);

    switch (sort_type) {
        case SORTTYPE_ASCENDING: {
            std::sort(
                output.begin(),
                output.end(),
                t_argsort_comparator_impl<SORTTYPE_ASCENDING>(v)
            );
        } break;
        case SORTTYPE_DESCENDING: {
            std::sort(
                output.begin(),
                output.end(),
                t_argsort_comparator_impl<SORTTYPE_DESCENDING>(v)
            );
        } break;
        case SORTTYPE_ASCENDING_ABS: {
            std::sort(
                output.begin(),
                output.end(),
                t_argsort_comparator_impl<SORTTYPE_ASCENDING_ABS>(v)
            );
        } break;
        case SORTTYPE_DESCENDING_ABS: {
            std::sort(
                output.begin(),
                output.end(),
                t_argsort_comparator_impl<SORTTYPE_DESCENDING_ABS>(v)
            );
        } break;
        case SORTTYPE_NONE: {
            // output is already identity-initialized
        } break;
    }
}

} // namespace perspective
