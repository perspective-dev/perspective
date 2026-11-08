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
#include <perspective/raw_types.h>
#include <perspective/dense_tree.h>
#include <perspective/aggspec.h>
#include <perspective/column.h>
#include <perspective/storage.h>
#include <perspective/exports.h>
#include <algorithm>
#include <functional>
#include <numeric>
#include <type_traits>

namespace perspective {

template <typename RAW_DATA_T, typename ROLLING_T, typename RESULT_T>
class PERSPECTIVE_EXPORT t_aggimpl {
public:
    typedef RAW_DATA_T t_raw_data;
    typedef ROLLING_T t_rolling;
    typedef RESULT_T t_result;

    static constexpr bool skip_invalid = false;

    RESULT_T value(ROLLING_T rs);
    ROLLING_T reduce(const RAW_DATA_T* biter, const RAW_DATA_T* eiter);
    ROLLING_T roll_up(const ROLLING_T* biter, const ROLLING_T* eiter);
};

template <typename RAW_DATA_T, typename ROLLING_T, typename RESULT_T>
class PERSPECTIVE_EXPORT t_aggimpl_sum
    : public t_aggimpl<RAW_DATA_T, ROLLING_T, RESULT_T> {
public:
    RESULT_T
    value(ROLLING_T rs) { return RESULT_T(rs); }

    ROLLING_T
    reduce(const RAW_DATA_T* biter, const RAW_DATA_T* eiter) {
        ROLLING_T value = static_cast<ROLLING_T>(0);
        auto n = eiter - biter;
#pragma omp simd reduction(+ : value)
        for (decltype(n) i = 0; i < n; ++i) {
            value += static_cast<ROLLING_T>(biter[i]);
        }
        return value;
    }

    ROLLING_T
    roll_up(const ROLLING_T* biter, const ROLLING_T* eiter) {
        ROLLING_T value = static_cast<ROLLING_T>(0);
        auto n = eiter - biter;
#pragma omp simd reduction(+ : value)
        for (decltype(n) i = 0; i < n; ++i) {
            value += biter[i];
        }
        return value;
    }
};

template <typename RAW_DATA_T, typename ROLLING_T, typename RESULT_T>
class PERSPECTIVE_EXPORT t_aggimpl_mul
    : public t_aggimpl<RAW_DATA_T, ROLLING_T, RESULT_T> {
public:
    RESULT_T
    value(ROLLING_T rs) { return RESULT_T(rs); }

    ROLLING_T
    reduce(const RAW_DATA_T* biter, const RAW_DATA_T* eiter) {
        ROLLING_T value = std::accumulate(
            biter,
            eiter,
            static_cast<ROLLING_T>(1),
            std::multiplies<ROLLING_T>()
        );
        return value;
    }

    ROLLING_T
    roll_up(const ROLLING_T* biter, const ROLLING_T* eiter) {
        ROLLING_T value = std::accumulate(
            biter,
            eiter,
            static_cast<ROLLING_T>(1),
            std::multiplies<ROLLING_T>()
        );
        return value;
    }
};

template <typename RAW_DATA_T, typename ROLLING_T, typename RESULT_T>
class PERSPECTIVE_EXPORT t_aggimpl_count
    : public t_aggimpl<RAW_DATA_T, ROLLING_T, RESULT_T> {
public:
    RESULT_T
    value(ROLLING_T rs) { return RESULT_T(rs); }

    ROLLING_T
    reduce(const RAW_DATA_T* biter, const RAW_DATA_T* eiter) {
        // count will be filled in later based on nstrands
        ROLLING_T value(0);
        return value;
    }

    ROLLING_T
    roll_up(const ROLLING_T* biter, const ROLLING_T* eiter) {
        ROLLING_T value(0);
        return value;
    }
};

template <typename RAW_DATA_T, typename ROLLING_T, typename RESULT_T>
class PERSPECTIVE_EXPORT t_aggimpl_mean
    : public t_aggimpl<RAW_DATA_T, ROLLING_T, RESULT_T> {
public:
    RESULT_T
    value(ROLLING_T rs) { return rs.first / rs.second; }

    ROLLING_T
    reduce(const RAW_DATA_T* biter, const RAW_DATA_T* eiter) {
        double sum = 0.0;
        auto n = eiter - biter;
#pragma omp simd reduction(+ : sum)
        for (decltype(n) i = 0; i < n; ++i) {
            sum += static_cast<double>(biter[i]);
        }

        double count = static_cast<double>(n);
        return ROLLING_T(sum, count);
    }

    ROLLING_T
    roll_up(const ROLLING_T* biter, const ROLLING_T* eiter) {
        double sum = 0.0;
        double count = 0.0;
        auto niter = eiter - biter;

        for (decltype(niter) idx = 0; idx < niter; ++idx) {
            sum += biter[idx].first;
            count += biter[idx].second;
        }

        return ROLLING_T(sum, count);
    }
};

template <typename RAW_DATA_T, typename ROLLING_T, typename RESULT_T>
class PERSPECTIVE_EXPORT t_aggimpl_hwm
    : public t_aggimpl<RAW_DATA_T, ROLLING_T, RESULT_T> {
public:
    static constexpr bool skip_invalid = true;

    RESULT_T
    value(ROLLING_T rs) { return RESULT_T(rs); }

    ROLLING_T
    reduce(const RAW_DATA_T* biter, const RAW_DATA_T* eiter) {
        if (biter >= eiter) {
            return ROLLING_T();
        }
        return ROLLING_T(*(std::max_element(biter, eiter)));
    }

    ROLLING_T
    roll_up(const ROLLING_T* biter, const ROLLING_T* eiter) {
        if (biter >= eiter) {
            return ROLLING_T();
        }
        return *(std::max_element(biter, eiter));
    }
};

template <typename RAW_DATA_T, typename ROLLING_T, typename RESULT_T>
class PERSPECTIVE_EXPORT t_aggimpl_lwm
    : public t_aggimpl<RAW_DATA_T, ROLLING_T, RESULT_T> {
public:
    static constexpr bool skip_invalid = true;

    RESULT_T
    value(ROLLING_T rs) { return RESULT_T(rs); }

    ROLLING_T
    reduce(const RAW_DATA_T* biter, const RAW_DATA_T* eiter) {
        if (biter >= eiter) {
            return ROLLING_T();
        }
        return ROLLING_T(*(std::min_element(biter, eiter)));
    }

    ROLLING_T
    roll_up(const ROLLING_T* biter, const ROLLING_T* eiter) {
        if (biter >= eiter) {
            return ROLLING_T();
        }
        return *(std::min_element(biter, eiter));
    }
};

class PERSPECTIVE_EXPORT t_aggregate {
public:
    t_aggregate(
        const t_dtree& tree,
        t_aggtype aggtype,
        std::vector<std::shared_ptr<const t_column>> icolumns,
        std::shared_ptr<t_column> column
    );
    void init();

    template <typename AGGIMPL_T>
    void build_aggregate();

private:
    const t_dtree& m_tree;
    t_aggtype m_aggtype;
    std::vector<std::shared_ptr<const t_column>> m_icolumns;
    std::shared_ptr<t_column> m_ocolumn;
};

template <
    typename AGGIMPL_T,
    typename std::enable_if<
        !std::is_same<const char*, typename AGGIMPL_T::t_rolling>::value,
        int>::type = 0>
void
build_aggregate_helper(
    AGGIMPL_T& aggimpl,
    t_index bcidx,
    t_index ecidx,
    t_column* ocolumn,
    t_index nidx
) {
    typedef typename AGGIMPL_T::t_rolling t_rolling;
    const t_rolling* base = ocolumn->get_nth_base<t_rolling>();

    if constexpr (AGGIMPL_T::skip_invalid) {
        if (ocolumn->is_status_enabled()) {
            std::vector<t_rolling> sbuf;
            sbuf.reserve(ecidx - bcidx);
            for (t_index cidx = bcidx; cidx < ecidx; ++cidx) {
                const auto uidx = static_cast<t_uindex>(cidx);
                if (*ocolumn->get_nth_status(uidx) == STATUS_VALID) {
                    sbuf.push_back(base[cidx]);
                }
            }

            if (sbuf.empty()) {
                ocolumn->set_valid(nidx, false);
                return;
            }

            t_rolling rolling =
                aggimpl.roll_up(sbuf.data(), sbuf.data() + sbuf.size());
            ocolumn->set_nth<t_rolling>(nidx, rolling);
            return;
        }
    }

    const t_rolling* biter = base + bcidx;
    const t_rolling* eiter = base + ecidx;
    t_rolling rolling = aggimpl.roll_up(biter, eiter);
    ocolumn->set_nth<t_rolling>(nidx, rolling);
}

template <
    typename AGGIMPL_T,
    typename std::enable_if<
        std::is_same<const char*, typename AGGIMPL_T::t_rolling>::value,
        int>::type = 0>
void
build_aggregate_helper(
    AGGIMPL_T& aggimpl,
    t_index bcidx,
    t_index ecidx,
    t_column* ocolumn,
    t_index nidx
) {
    const t_column* c_ocolumn = ocolumn;
    typedef typename AGGIMPL_T::t_rolling t_rolling;
    const bool skip_invalid =
        AGGIMPL_T::skip_invalid && ocolumn->is_status_enabled();
    std::vector<t_rolling> sbuf;
    sbuf.reserve(ecidx - bcidx);
    for (t_index sidx = bcidx; sidx < ecidx; ++sidx) {
        const auto uidx = static_cast<t_uindex>(sidx);
        if (skip_invalid && *c_ocolumn->get_nth_status(uidx) != STATUS_VALID) {
            continue;
        }

        sbuf.push_back(c_ocolumn->get_nth<const char>(uidx));
    }

    if (sbuf.empty()) {
        if (skip_invalid) {
            ocolumn->set_valid(nidx, false);
        }

        return;
    }

    t_rolling rolling =
        aggimpl.roll_up(sbuf.data(), sbuf.data() + sbuf.size());
    ocolumn->set_nth<t_rolling>(nidx, rolling);
}

template <typename AGGIMPL_T>
void
t_aggregate::build_aggregate() {

    typedef typename AGGIMPL_T::t_rolling t_rolling;
    typedef typename AGGIMPL_T::t_raw_data t_raw_data;
    typedef typename t_dtree::t_tnode t_node;

    t_depth n_levels = m_tree.last_level();

    AGGIMPL_T aggimpl;

    typedef typename t_dtree::t_tnode t_tnode;
    t_column* ocolumn = m_ocolumn.get();

    PSP_VERBOSE_ASSERT(
        m_icolumns.size() == 1, "Multiple input dependencies not supported yet"
    );

    const t_column* icptr = m_icolumns[0].get();
    t_uindex icptr_size = icptr->size();

    if (icptr_size == 0) {
        return;
    }

    const t_column* lcptr = m_tree.get_leaf_cptr();
    const t_uindex* base_lcptr = lcptr->get<const t_uindex>(0);

    // Lazily sized buffer — allocated to max leaf range, not entire column.
    std::vector<t_raw_data> buffer;

    for (t_index level_idx = n_levels; level_idx > -1; level_idx--) {
        std::pair<t_index, t_index> markers =
            m_tree.get_level_markers(level_idx);

        t_index bidx = markers.first;
        t_index eidx = markers.second;

        if (level_idx == n_levels) {
            for (t_index nidx = bidx; nidx < eidx; nidx++) {
                const t_node* n_ = m_tree.get_node_ptr(nidx);
                const t_tnode& n = *n_;
                const t_uindex* blptr = base_lcptr + n.m_flidx;
                const t_uindex* elptr = blptr + n.m_nleaves;

                PSP_VERBOSE_ASSERT(elptr > blptr, "Unexpected pointers");

                t_uindex leaf_count = elptr - blptr;
                if (buffer.size() < leaf_count) {
                    buffer.resize(leaf_count);
                }

                icptr->fill(buffer, blptr, elptr);

                t_raw_data* biter = &buffer[0];
                t_raw_data* eiter = biter + leaf_count;

                if constexpr (AGGIMPL_T::skip_invalid) {
                    if (icptr->is_status_enabled()) {
                        eiter = biter;
                        for (t_uindex lidx = 0; lidx < leaf_count; ++lidx) {
                            if (*icptr->get_nth_status(blptr[lidx])
                                == STATUS_VALID) {
                                *eiter++ = buffer[lidx];
                            }
                        }

                        if (biter == eiter && ocolumn->is_status_enabled()) {
                            ocolumn->set_valid(nidx, false);
                            continue;
                        }
                    }
                }

                auto tmp = aggimpl.reduce(biter, eiter);
                ocolumn->set_nth<t_rolling>(nidx, tmp);
            }
        } else {
            // for all nodes in level
            for (t_index nidx = bidx; nidx < eidx; nidx++) {
                const t_node* n_ = m_tree.get_node_ptr(nidx);
                const t_node& n = *n_;

                t_index bcidx = n.m_fcidx;
                t_index ecidx = bcidx + n.m_nchild;

                build_aggregate_helper(aggimpl, bcidx, ecidx, ocolumn, nidx);
            }
        }
    }
}

} // end namespace perspective
