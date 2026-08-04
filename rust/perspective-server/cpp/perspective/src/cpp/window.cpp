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

#include <perspective/window.h>
#include <perspective/column.h>
#include <perspective/scalar.h>
#include <tsl/hopscotch_set.h>
#include <algorithm>
#include <cmath>
#include <deque>

namespace perspective {

namespace {

// Strict-weak scalar order: invalid (null) sorts first, then by value.
bool
scalar_less(const t_tscalar& a, const t_tscalar& b) {
    bool av = a.is_valid();
    bool bv = b.is_valid();
    if (av != bv) {
        return !av;
    }

    return av && a < b;
}

// (order, pkey) pair order shared by sort, insert and search - the ONE
// comparator that defines a spec's sorted direction (a second definition
// anywhere would let insert and sort disagree and silently corrupt
// positions). Rows with invalid order keys sort first in EITHER direction;
// valid keys compare ascending or descending per `desc`; ties broken by
// pkey (always ascending) so replays are deterministic.
bool
key_less(
    const t_tscalar& a_order,
    const t_tscalar& a_pkey,
    const t_tscalar& b_order,
    const t_tscalar& b_pkey,
    bool desc
) {
    const t_tscalar& first = desc ? b_order : a_order;
    const t_tscalar& second = desc ? a_order : b_order;
    bool av = a_order.is_valid();
    bool bv = b_order.is_valid();
    if (av != bv) {
        return !av;
    }

    if (av) {
        if (first < second) {
            return true;
        }

        if (second < first) {
            return false;
        }
    }

    return a_pkey < b_pkey;
}

template <typename ROWS_T>
std::size_t
lower_bound_row(
    const ROWS_T& rows,
    const t_tscalar& order,
    const t_tscalar& pkey,
    bool desc
) {
    std::size_t lo = 0;
    std::size_t hi = rows.size();
    while (lo < hi) {
        std::size_t mid = lo + (hi - lo) / 2;
        if (key_less(rows[mid].m_order, rows[mid].m_pkey, order, pkey, desc)) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

// First position whose order key is valid. Invalid keys sort first, so
// validity is monotone over a sorted partition.
template <typename ROWS_T>
std::size_t
partition_first_valid(const ROWS_T& rows) {
    std::size_t lo = 0;
    std::size_t hi = rows.size();
    while (lo < hi) {
        std::size_t mid = lo + (hi - lo) / 2;
        if (!rows[mid].m_order.is_valid()) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

// Range-frame interval arithmetic. Keys compared as doubles (`Range`
// frames require a numeric or temporal order key, so intervals are defined
// on the column's raw units); keys are sorted in the spec's direction, so
// "before" any boundary is a positional prefix in either direction.

// First position in [first_valid, size) at or inside a boundary key:
// ascending the first key >= `boundary`, descending the first key <=
// `boundary`. A row's Range frame starts here with `boundary = key -+
// range` (its preceding interval in sort order); the invalidation reach of
// a touched key starts here with `boundary = key`.
template <typename ROWS_T>
std::size_t
frame_lower_bound(
    const ROWS_T& rows, double boundary, std::size_t first_valid, bool desc
) {
    std::size_t lo = first_valid;
    std::size_t hi = rows.size();
    while (lo < hi) {
        std::size_t mid = lo + (hi - lo) / 2;
        double v = rows[mid].m_order.to_double();
        if (desc ? v > boundary : v < boundary) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

// First position in [first_valid, size) PAST the invalidation reach of a
// touched key `k` - the rows whose Range frames can contain `k`: keys in
// `[k, k + range]` ascending, `[k - range, k]` descending.
template <typename ROWS_T>
std::size_t
reach_upper_bound(
    const ROWS_T& rows,
    double k,
    double range,
    std::size_t first_valid,
    bool desc
) {
    double limit = desc ? k - range : k + range;
    std::size_t lo = first_valid;
    std::size_t hi = rows.size();
    while (lo < hi) {
        std::size_t mid = lo + (hi - lo) / 2;
        double v = rows[mid].m_order.to_double();
        if (desc ? v >= limit : v <= limit) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

void
write_float(t_column& out, t_uindex ridx, double value) {
    t_tscalar s;
    s.clear();
    s.set(value);
    out.set_scalar(ridx, s);
}

void
write_int(t_column& out, t_uindex ridx, std::int64_t value) {
    t_tscalar s;
    s.clear();
    s.set(value);
    out.set_scalar(ridx, s);
}

// Aggregate the frame positions [lo, hi] of one ordered partition and write
// the result for the row at position `hi`. Direct recompute per output row -
// no accumulator state, no float drift (WINDOW_FUNCTIONS_PLAN §2.4).
// Aggregating ops only; positional/recursive ops dispatch in
// `recompute_range`.
template <typename ROWS_T>
void
apply_frame(
    t_window_op op,
    const ROWS_T& rows,
    std::size_t lo,
    std::size_t hi,
    const t_column& src,
    t_column& out
) {
    t_uindex out_ridx = rows[hi].m_ridx;
    switch (op) {
        case t_window_op::WINDOW_OP_SUM:
        case t_window_op::WINDOW_OP_AVG: {
            double sum = 0;
            double c = 0;
            std::int64_t n = 0;
            for (std::size_t pos = lo; pos <= hi; ++pos) {
                t_uindex ridx = rows[pos].m_ridx;
                if (!src.is_valid(ridx)) {
                    continue;
                }

                double x = src.get_scalar(ridx).to_double();
                double y = x - c;
                double t = sum + y;
                c = (t - sum) - y;
                sum = t;
                ++n;
            }

            if (n == 0) {
                out.clear(out_ridx);
            } else if (op == t_window_op::WINDOW_OP_SUM) {
                write_float(out, out_ridx, sum);
            } else {
                write_float(out, out_ridx, sum / static_cast<double>(n));
            }
        } break;
        case t_window_op::WINDOW_OP_COUNT: {
            std::int64_t n = 0;
            for (std::size_t pos = lo; pos <= hi; ++pos) {
                if (src.is_valid(rows[pos].m_ridx)) {
                    ++n;
                }
            }

            write_int(out, out_ridx, n);
        } break;
        case t_window_op::WINDOW_OP_MIN:
        case t_window_op::WINDOW_OP_MAX: {
            bool has = false;
            t_tscalar best;
            best.clear();
            for (std::size_t pos = lo; pos <= hi; ++pos) {
                t_uindex ridx = rows[pos].m_ridx;
                if (!src.is_valid(ridx)) {
                    continue;
                }

                t_tscalar v = src.get_scalar(ridx);
                if (!has) {
                    best = v;
                    has = true;
                } else if (op == t_window_op::WINDOW_OP_MIN ? v < best : best < v) {
                    best = v;
                }
            }

            if (has) {
                out.set_scalar(out_ridx, best);
            } else {
                out.clear(out_ridx);
            }
        } break;
        case t_window_op::WINDOW_OP_STDDEV:
        case t_window_op::WINDOW_OP_VAR: {
            // Welford: numerically stable over small frames.
            double mean = 0;
            double m2 = 0;
            std::int64_t n = 0;
            for (std::size_t pos = lo; pos <= hi; ++pos) {
                t_uindex ridx = rows[pos].m_ridx;
                if (!src.is_valid(ridx)) {
                    continue;
                }

                double x = src.get_scalar(ridx).to_double();
                ++n;
                double d = x - mean;
                mean += d / static_cast<double>(n);
                m2 += d * (x - mean);
            }

            if (n < 2) {
                out.clear(out_ridx);
            } else {
                double var = m2 / static_cast<double>(n - 1);
                write_float(
                    out,
                    out_ridx,
                    op == t_window_op::WINDOW_OP_VAR ? var : std::sqrt(var)
                );
            }
        } break;
        default:
            PSP_COMPLAIN_AND_ABORT(
                "[t_window_engine] window op not implemented"
            );
    }
}

double
sample_var(double sum, double sumsq, std::int64_t n) {
    double nn = static_cast<double>(n);
    double var = (sumsq - (sum * sum) / nn) / (nn - 1);
    return var < 0 ? 0 : var;
}

// Sliding float accumulators re-prime from a direct frame scan this often,
// bounding subtract-induced drift; the min/max deque is exact and never
// refreshes. Integer sources never drift (exact adds/subtracts), which is
// what keeps the JS property test's incremental-vs-oracle comparison
// bit-identical.
constexpr std::size_t WINDOW_REFRESH_INTERVAL = 4096;

// One in-pass sliding aggregate over an ordered partition walk. State lives
// only for the duration of a single `recompute_range` call - nothing slides
// across updates, so a bug here cannot corrupt persistent index state.
template <typename ROWS_T>
struct t_sliding {
    t_window_op m_op;
    const ROWS_T& m_rows;
    const t_column& m_src;
    double m_sum = 0;
    double m_c = 0;
    double m_sumsq = 0;
    double m_csq = 0;
    std::int64_t m_n = 0;
    std::deque<std::size_t> m_minmax;
    std::size_t m_since_refresh = 0;

    t_sliding(t_window_op op, const ROWS_T& rows, const t_column& src) :
        m_op(op),
        m_rows(rows),
        m_src(src) {}

    bool
    is_float_acc() const {
        switch (m_op) {
            case t_window_op::WINDOW_OP_SUM:
            case t_window_op::WINDOW_OP_AVG:
            case t_window_op::WINDOW_OP_STDDEV:
            case t_window_op::WINDOW_OP_VAR:
                return true;
            default:
                return false;
        }
    }

    static void
    kadd(double& sum, double& c, double x) {
        double y = x - c;
        double t = sum + y;
        c = (t - sum) - y;
        sum = t;
    }

    void
    enter(std::size_t pos) {
        t_uindex ridx = m_rows[pos].m_ridx;
        if (!m_src.is_valid(ridx)) {
            return;
        }

        switch (m_op) {
            case t_window_op::WINDOW_OP_MIN:
            case t_window_op::WINDOW_OP_MAX: {
                t_tscalar x = m_src.get_scalar(ridx);
                while (!m_minmax.empty()) {
                    t_tscalar back =
                        m_src.get_scalar(m_rows[m_minmax.back()].m_ridx);
                    bool dominated = m_op == t_window_op::WINDOW_OP_MIN
                        ? !(back < x)
                        : !(x < back);
                    if (!dominated) {
                        break;
                    }
                    m_minmax.pop_back();
                }
                m_minmax.push_back(pos);
            } break;
            case t_window_op::WINDOW_OP_COUNT:
                ++m_n;
                break;
            default: {
                double x = m_src.get_scalar(ridx).to_double();
                kadd(m_sum, m_c, x);
                kadd(m_sumsq, m_csq, x * x);
                ++m_n;
            } break;
        }
    }

    // Remove the row at `pos` (a position strictly below the new frame
    // start). The min/max deque instead drops stale positions lazily in
    // `settle`.
    void
    evict(std::size_t pos) {
        t_uindex ridx = m_rows[pos].m_ridx;
        if (!m_src.is_valid(ridx)) {
            return;
        }

        switch (m_op) {
            case t_window_op::WINDOW_OP_MIN:
            case t_window_op::WINDOW_OP_MAX:
                break;
            case t_window_op::WINDOW_OP_COUNT:
                --m_n;
                break;
            default: {
                double x = m_src.get_scalar(ridx).to_double();
                kadd(m_sum, m_c, -x);
                kadd(m_sumsq, m_csq, -(x * x));
                --m_n;
            } break;
        }
    }

    void
    settle(std::size_t frame_start) {
        while (!m_minmax.empty() && m_minmax.front() < frame_start) {
            m_minmax.pop_front();
        }
    }

    // Direct rescan of the current frame - drift refresh for the float
    // accumulators.
    void
    reprime(std::size_t frame_start, std::size_t pos) {
        m_sum = 0;
        m_c = 0;
        m_sumsq = 0;
        m_csq = 0;
        m_n = 0;
        for (std::size_t p = frame_start; p <= pos; ++p) {
            t_uindex ridx = m_rows[p].m_ridx;
            if (!m_src.is_valid(ridx)) {
                continue;
            }

            double x = m_src.get_scalar(ridx).to_double();
            kadd(m_sum, m_c, x);
            kadd(m_sumsq, m_csq, x * x);
            ++m_n;
        }
        m_since_refresh = 0;
    }

    void
    write(std::size_t pos, t_column& out) {
        t_uindex out_ridx = m_rows[pos].m_ridx;
        switch (m_op) {
            case t_window_op::WINDOW_OP_SUM:
                if (m_n == 0) {
                    out.clear(out_ridx);
                } else {
                    write_float(out, out_ridx, m_sum);
                }
                break;
            case t_window_op::WINDOW_OP_AVG:
                if (m_n == 0) {
                    out.clear(out_ridx);
                } else {
                    write_float(
                        out, out_ridx, m_sum / static_cast<double>(m_n)
                    );
                }
                break;
            case t_window_op::WINDOW_OP_COUNT:
                write_int(out, out_ridx, m_n);
                break;
            case t_window_op::WINDOW_OP_STDDEV:
            case t_window_op::WINDOW_OP_VAR:
                if (m_n < 2) {
                    out.clear(out_ridx);
                } else {
                    double var = sample_var(m_sum, m_sumsq, m_n);
                    write_float(
                        out,
                        out_ridx,
                        m_op == t_window_op::WINDOW_OP_VAR ? var
                                                          : std::sqrt(var)
                    );
                }
                break;
            case t_window_op::WINDOW_OP_MIN:
            case t_window_op::WINDOW_OP_MAX:
                if (m_minmax.empty()) {
                    out.clear(out_ridx);
                } else {
                    out.set_scalar(
                        out_ridx,
                        m_src.get_scalar(m_rows[m_minmax.front()].m_ridx)
                    );
                }
                break;
            default:
                PSP_COMPLAIN_AND_ABORT(
                    "[t_window_engine] window op not implemented"
                );
        }
    }
};

} // anonymous namespace

bool
t_window_engine::t_scalar_vec_cmp::operator()(
    const std::vector<t_tscalar>& a, const std::vector<t_tscalar>& b
) const {
    return std::lexicographical_compare(
        a.begin(), a.end(), b.begin(), b.end(), scalar_less
    );
}

t_window_engine::t_window_engine(std::vector<t_window_spec> specs) :
    m_collected(false) {
    m_states.reserve(specs.size());
    for (auto& spec : specs) {
        t_spec_state state;
        state.m_needs_prefix =
            class_of(spec) == t_window_class::WINDOW_CLASS_CUMULATIVE
            && (spec.m_op == t_window_op::WINDOW_OP_SUM
                || spec.m_op == t_window_op::WINDOW_OP_AVG
                || spec.m_op == t_window_op::WINDOW_OP_COUNT
                || spec.m_op == t_window_op::WINDOW_OP_STDDEV
                || spec.m_op == t_window_op::WINDOW_OP_VAR);
        state.m_spec = std::move(spec);
        m_states.push_back(std::move(state));
    }
}

bool
t_window_engine::enabled() const {
    return !m_states.empty();
}

t_dtype
t_window_engine::resolve_dtype(t_window_op op, t_dtype source_dtype) {
    bool numeric = false;
    switch (source_dtype) {
        case DTYPE_INT8:
        case DTYPE_INT16:
        case DTYPE_INT32:
        case DTYPE_INT64:
        case DTYPE_UINT8:
        case DTYPE_UINT16:
        case DTYPE_UINT32:
        case DTYPE_UINT64:
        case DTYPE_FLOAT32:
        case DTYPE_FLOAT64:
            numeric = true;
            break;
        default:
            break;
    }

    switch (op) {
        case t_window_op::WINDOW_OP_SUM:
        case t_window_op::WINDOW_OP_AVG:
        case t_window_op::WINDOW_OP_STDDEV:
        case t_window_op::WINDOW_OP_VAR:
        case t_window_op::WINDOW_OP_RATE:
        case t_window_op::WINDOW_OP_EMA:
        case t_window_op::WINDOW_OP_DIFF:
            return numeric ? DTYPE_FLOAT64 : DTYPE_NONE;
        case t_window_op::WINDOW_OP_COUNT:
            return DTYPE_INT64;
        case t_window_op::WINDOW_OP_MIN:
        case t_window_op::WINDOW_OP_MAX:
        case t_window_op::WINDOW_OP_FIRST:
        case t_window_op::WINDOW_OP_LAST:
        case t_window_op::WINDOW_OP_LAG:
        case t_window_op::WINDOW_OP_LEAD:
            return source_dtype;
        default:
            return DTYPE_NONE;
    }
}

bool
t_window_engine::is_implemented(t_window_op op, t_window_frame_type frame) {
    switch (op) {
        case t_window_op::WINDOW_OP_SUM:
        case t_window_op::WINDOW_OP_AVG:
        case t_window_op::WINDOW_OP_COUNT:
        case t_window_op::WINDOW_OP_MIN:
        case t_window_op::WINDOW_OP_MAX:
        case t_window_op::WINDOW_OP_STDDEV:
        case t_window_op::WINDOW_OP_VAR:
            // Aggregating ops accept every frame type.
            return true;
        case t_window_op::WINDOW_OP_LAG:
        case t_window_op::WINDOW_OP_LEAD:
        case t_window_op::WINDOW_OP_DIFF:
        case t_window_op::WINDOW_OP_EMA:
            // Frame-independent; frame legality is enforced at `View`
            // construction.
            return true;
        case t_window_op::WINDOW_OP_RATE:
            return frame == t_window_frame_type::WINDOW_FRAME_RANGE;
        default:
            // FIRST/LAST remain unimplemented.
            return false;
    }
}

t_window_class
t_window_engine::class_of(const t_window_spec& spec) {
    switch (spec.m_op) {
        case t_window_op::WINDOW_OP_EMA:
            return t_window_class::WINDOW_CLASS_CUMULATIVE;
        case t_window_op::WINDOW_OP_LAG:
        case t_window_op::WINDOW_OP_DIFF:
            return t_window_class::WINDOW_CLASS_LAG_LIKE;
        case t_window_op::WINDOW_OP_LEAD:
            return t_window_class::WINDOW_CLASS_LEAD_LIKE;
        case t_window_op::WINDOW_OP_RATE:
            return t_window_class::WINDOW_CLASS_AGG_RANGE;
        default:
            break;
    }

    switch (spec.m_frame_type) {
        case t_window_frame_type::WINDOW_FRAME_ROWS:
            return t_window_class::WINDOW_CLASS_AGG_ROWS;
        case t_window_frame_type::WINDOW_FRAME_RANGE:
            return t_window_class::WINDOW_CLASS_AGG_RANGE;
        default:
            return t_window_class::WINDOW_CLASS_CUMULATIVE;
    }
}

void
t_window_engine::reset_state() {
    for (auto& state : m_states) {
        state.m_partitions.clear();
        state.m_locations.clear();
        state.m_edits.clear();
        state.m_dead_ridxs.clear();
        state.m_dirty.clear();
    }

    m_collected = false;
}

const t_column*
t_window_engine::source_column(
    const t_spec_state& state,
    const std::shared_ptr<t_data_table>& master,
    const std::shared_ptr<t_data_table>& dst_master
) const {
    const t_data_table* src_table =
        master->get_schema().has_column(state.m_spec.m_source)
        ? master.get()
        : dst_master.get();
    return src_table->get_const_column(state.m_spec.m_source).get();
}

// Recompute one dirty range of one partition.
//
// - `AGG_ROWS`/`AGG_RANGE`: direct per-output-row frame recompute (a
//   `Range` frame's start is found by key search; rows with invalid order
//   keys frame together in the invalid prefix).
// - `CUMULATIVE`: one seeded pass to the partition end. sum/avg/count/
//   stddev/var seed from the prefix accumulators; min/max and ema seed from
//   the last clean OUTPUT row (the output IS the running state).
// - `LAG_LIKE`/`LEAD_LIKE`: direct positional reads.
void
t_window_engine::recompute_range(
    t_spec_state& state,
    t_window_partition& partition,
    std::size_t lo,
    std::size_t hi,
    const t_column& src,
    t_column& out
) const {
    auto& rows = partition.m_rows;
    const t_window_spec& spec = state.m_spec;
    switch (class_of(spec)) {
        case t_window_class::WINDOW_CLASS_AGG_ROWS: {
            std::size_t n = spec.m_frame_rows;
            t_sliding<std::vector<t_window_row>> sliding(
                spec.m_op, rows, src
            );
            std::size_t frame_start = lo > n ? lo - n : 0;
            for (std::size_t p = frame_start; p < lo; ++p) {
                sliding.enter(p);
            }

            for (std::size_t pos = lo; pos < hi; ++pos) {
                std::size_t fs = pos > n ? pos - n : 0;
                for (; frame_start < fs; ++frame_start) {
                    sliding.evict(frame_start);
                }

                sliding.enter(pos);
                sliding.settle(fs);
                if (sliding.is_float_acc()
                    && ++sliding.m_since_refresh >= WINDOW_REFRESH_INTERVAL) {
                    sliding.reprime(fs, pos);
                }

                sliding.write(pos, out);
            }
        } break;
        case t_window_class::WINDOW_CLASS_AGG_RANGE: {
            std::size_t first_valid = partition_first_valid(rows);

            // Invalid order keys frame together at partition start - a
            // grow-only frame, computed directly (rare).
            for (std::size_t pos = lo; pos < std::min(hi, first_valid);
                 ++pos) {
                if (spec.m_op == t_window_op::WINDOW_OP_RATE) {
                    out.clear(rows[pos].m_ridx);
                } else {
                    apply_frame(spec.m_op, rows, 0, pos, src, out);
                }
            }

            std::size_t start = std::max(lo, first_valid);
            if (start >= hi) {
                break;
            }

            const bool desc = spec.m_order_desc;
            if (spec.m_op == t_window_op::WINDOW_OP_RATE) {
                for (std::size_t pos = start; pos < hi; ++pos) {
                    t_uindex out_ridx = rows[pos].m_ridx;
                    double key = rows[pos].m_order.to_double();
                    std::size_t frame_lo = frame_lower_bound(
                        rows,
                        desc ? key + spec.m_frame_range
                             : key - spec.m_frame_range,
                        first_valid,
                        desc
                    );
                    t_uindex lo_ridx = rows[frame_lo].m_ridx;
                    if (frame_lo >= pos || !src.is_valid(out_ridx)
                        || !src.is_valid(lo_ridx)) {
                        out.clear(out_ridx);
                        continue;
                    }

                    // Δv/Δk is the same slope whichever end of the frame is
                    // "first" - for desc both deltas negate.
                    double dk = key - rows[frame_lo].m_order.to_double();
                    if (dk == 0) {
                        out.clear(out_ridx);
                        continue;
                    }

                    double dv = src.get_scalar(out_ridx).to_double()
                        - src.get_scalar(lo_ridx).to_double();
                    write_float(out, out_ridx, dv / dk);
                }
                break;
            }

            // Two-pointer sliding pass: keys are sorted (in the spec's
            // direction), so each frame start is monotone non-decreasing
            // in `pos`. The frame boundary is `key -+ range` - the
            // preceding interval in sort order.
            t_sliding<std::vector<t_window_row>> sliding(
                spec.m_op, rows, src
            );
            std::size_t frame_start = frame_lower_bound(
                rows,
                desc ? rows[start].m_order.to_double() + spec.m_frame_range
                     : rows[start].m_order.to_double() - spec.m_frame_range,
                first_valid,
                desc
            );
            for (std::size_t p = frame_start; p < start; ++p) {
                sliding.enter(p);
            }

            for (std::size_t pos = start; pos < hi; ++pos) {
                double key = rows[pos].m_order.to_double();
                double boundary =
                    desc ? key + spec.m_frame_range
                         : key - spec.m_frame_range;
                for (; frame_start < pos
                     && (desc
                             ? rows[frame_start].m_order.to_double()
                                 > boundary
                             : rows[frame_start].m_order.to_double()
                                 < boundary);
                     ++frame_start) {
                    sliding.evict(frame_start);
                }

                sliding.enter(pos);
                sliding.settle(frame_start);
                if (sliding.is_float_acc()
                    && ++sliding.m_since_refresh >= WINDOW_REFRESH_INTERVAL) {
                    sliding.reprime(frame_start, pos);
                }

                sliding.write(pos, out);
            }
        } break;
        case t_window_class::WINDOW_CLASS_LAG_LIKE: {
            std::size_t k = spec.m_offset;
            for (std::size_t pos = lo; pos < hi; ++pos) {
                t_uindex out_ridx = rows[pos].m_ridx;
                if (pos < k) {
                    out.clear(out_ridx);
                    continue;
                }

                t_uindex src_ridx = rows[pos - k].m_ridx;
                if (spec.m_op == t_window_op::WINDOW_OP_LAG) {
                    if (src.is_valid(src_ridx)) {
                        out.set_scalar(out_ridx, src.get_scalar(src_ridx));
                    } else {
                        out.clear(out_ridx);
                    }
                } else {
                    // DIFF
                    if (src.is_valid(src_ridx) && src.is_valid(out_ridx)) {
                        write_float(
                            out,
                            out_ridx,
                            src.get_scalar(out_ridx).to_double()
                                - src.get_scalar(src_ridx).to_double()
                        );
                    } else {
                        out.clear(out_ridx);
                    }
                }
            }
        } break;
        case t_window_class::WINDOW_CLASS_LEAD_LIKE: {
            std::size_t k = spec.m_offset;
            for (std::size_t pos = lo; pos < hi; ++pos) {
                t_uindex out_ridx = rows[pos].m_ridx;
                if (pos + k >= rows.size()) {
                    out.clear(out_ridx);
                    continue;
                }

                t_uindex src_ridx = rows[pos + k].m_ridx;
                if (src.is_valid(src_ridx)) {
                    out.set_scalar(out_ridx, src.get_scalar(src_ridx));
                } else {
                    out.clear(out_ridx);
                }
            }
        } break;
        case t_window_class::WINDOW_CLASS_CUMULATIVE: {
            if (state.m_needs_prefix) {
                partition.m_prefix_sum.resize(rows.size());
                partition.m_prefix_sumsq.resize(rows.size());
                partition.m_prefix_count.resize(rows.size());
            }

            double sum = 0;
            double c = 0;
            double sumsq = 0;
            double csq = 0;
            std::int64_t n = 0;
            bool has = false;
            t_tscalar best;
            best.clear();
            double ema = 0;

            if (lo > 0) {
                if (state.m_needs_prefix) {
                    sum = partition.m_prefix_sum[lo - 1];
                    sumsq = partition.m_prefix_sumsq[lo - 1];
                    n = partition.m_prefix_count[lo - 1];
                } else {
                    // min/max/ema: the output of the last clean row IS the
                    // running state.
                    t_uindex prev_ridx = rows[lo - 1].m_ridx;
                    if (out.is_valid(prev_ridx)) {
                        best = out.get_scalar(prev_ridx);
                        ema = best.to_double();
                        has = true;
                    }
                }
            }

            for (std::size_t pos = lo; pos < rows.size(); ++pos) {
                t_uindex ridx = rows[pos].m_ridx;
                if (src.is_valid(ridx)) {
                    t_tscalar v = src.get_scalar(ridx);
                    switch (spec.m_op) {
                        case t_window_op::WINDOW_OP_SUM:
                        case t_window_op::WINDOW_OP_AVG:
                        case t_window_op::WINDOW_OP_COUNT:
                        case t_window_op::WINDOW_OP_STDDEV:
                        case t_window_op::WINDOW_OP_VAR: {
                            double x = v.to_double();
                            double y = x - c;
                            double t = sum + y;
                            c = (t - sum) - y;
                            sum = t;
                            double ysq = x * x - csq;
                            double tsq = sumsq + ysq;
                            csq = (tsq - sumsq) - ysq;
                            sumsq = tsq;
                            ++n;
                        } break;
                        case t_window_op::WINDOW_OP_MIN:
                        case t_window_op::WINDOW_OP_MAX: {
                            if (!has) {
                                best = v;
                                has = true;
                            } else if (
                                spec.m_op == t_window_op::WINDOW_OP_MIN
                                    ? v < best
                                    : best < v
                            ) {
                                best = v;
                            }
                        } break;
                        case t_window_op::WINDOW_OP_EMA: {
                            double x = v.to_double();
                            ema = has
                                ? spec.m_alpha * x + (1 - spec.m_alpha) * ema
                                : x;
                            has = true;
                        } break;
                        default:
                            PSP_COMPLAIN_AND_ABORT(
                                "[t_window_engine] window op not implemented"
                            );
                    }
                }

                if (state.m_needs_prefix) {
                    partition.m_prefix_sum[pos] = sum;
                    partition.m_prefix_sumsq[pos] = sumsq;
                    partition.m_prefix_count[pos] = n;
                }

                switch (spec.m_op) {
                    case t_window_op::WINDOW_OP_SUM:
                        if (n == 0) {
                            out.clear(ridx);
                        } else {
                            write_float(out, ridx, sum);
                        }
                        break;
                    case t_window_op::WINDOW_OP_AVG:
                        if (n == 0) {
                            out.clear(ridx);
                        } else {
                            write_float(
                                out, ridx, sum / static_cast<double>(n)
                            );
                        }
                        break;
                    case t_window_op::WINDOW_OP_COUNT:
                        write_int(out, ridx, n);
                        break;
                    case t_window_op::WINDOW_OP_STDDEV:
                    case t_window_op::WINDOW_OP_VAR:
                        if (n < 2) {
                            out.clear(ridx);
                        } else {
                            double var = sample_var(sum, sumsq, n);
                            write_float(
                                out,
                                ridx,
                                spec.m_op == t_window_op::WINDOW_OP_VAR
                                    ? var
                                    : std::sqrt(var)
                            );
                        }
                        break;
                    case t_window_op::WINDOW_OP_MIN:
                    case t_window_op::WINDOW_OP_MAX:
                        if (has) {
                            out.set_scalar(ridx, best);
                        } else {
                            out.clear(ridx);
                        }
                        break;
                    case t_window_op::WINDOW_OP_EMA:
                        if (has) {
                            write_float(out, ridx, ema);
                        } else {
                            out.clear(ridx);
                        }
                        break;
                    default:
                        break;
                }
            }
        } break;
    }
}

void
t_window_engine::compute_master(
    const std::shared_ptr<t_data_table>& master,
    const t_gstate::t_mapping& pkey_map,
    const std::shared_ptr<t_data_table>& dst_master
) {
    if (m_states.empty()) {
        return;
    }

    reset_state();

    t_uindex nrows = master->size();

    for (auto& state : m_states) {
        const auto& spec = state.m_spec;
        auto out = dst_master->add_column_sptr(spec.m_name, spec.m_dtype, true);
        out->reserve(nrows);

        // Dead (freed) master slots are not present in `pkey_map`;
        // pre-clearing every row leaves them invalid.
        for (t_uindex ridx = 0; ridx < nrows; ++ridx) {
            out->clear(ridx);
        }

        const t_column* src = source_column(state, master, dst_master);

        // Empty `m_order_by` = NATURAL order: every order key is left
        // invalid, so `key_less` degenerates to its (always-ascending)
        // pkey tiebreak - index-column order for indexed tables, insertion
        // order otherwise.
        const t_column* ord = spec.m_order_by.empty()
            ? nullptr
            : master->get_const_column(spec.m_order_by).get();

        std::vector<std::shared_ptr<const t_column>> parts;
        parts.reserve(spec.m_partition_by.size());
        for (const auto& colname : spec.m_partition_by) {
            parts.push_back(master->get_const_column(colname));
        }

        std::vector<t_tscalar> key(parts.size());
        for (const auto& kv : pkey_map) {
            t_uindex ridx = kv.second;
            if (ridx >= nrows) {
                continue;
            }

            for (std::size_t i = 0; i < parts.size(); ++i) {
                key[i] = parts[i]->get_scalar(ridx);
            }

            t_tscalar order;
            order.clear();
            if (ord != nullptr) {
                order = ord->get_scalar(ridx);
            }
            auto part_it = state.m_partitions.try_emplace(key).first;
            part_it->second.m_rows.push_back({ridx, order, kv.first});
            state.m_locations[kv.first] = {&part_it->first, order, ridx};
        }

        for (auto& partition : state.m_partitions) {
            auto& rows = partition.second.m_rows;
            const bool desc = spec.m_order_desc;
            std::sort(
                rows.begin(),
                rows.end(),
                [desc](const t_window_row& a, const t_window_row& b) {
                    return key_less(
                        a.m_order, a.m_pkey, b.m_order, b.m_pkey, desc
                    );
                }
            );

            recompute_range(
                state, partition.second, 0, rows.size(), *src, *out
            );
        }
    }
}

std::vector<t_tscalar>
t_window_engine::collect_invalidations(
    const t_data_table& flattened,
    const std::vector<t_rlookup>& lookup,
    const std::shared_ptr<t_data_table>& master,
    const t_gstate::t_mapping& pkey_map
) {
    std::vector<t_tscalar> invalidated;
    if (m_states.empty()) {
        return invalidated;
    }

    for (auto& state : m_states) {
        state.m_edits.clear();
        state.m_dead_ridxs.clear();
        state.m_dirty.clear();
    }

    m_collected = true;

    t_uindex num_rows = flattened.size();
    const auto pkey_col = flattened.get_const_column("psp_pkey");
    const auto op_col = flattened.get_const_column("psp_op");

    tsl::hopscotch_set<t_tscalar> batch_pkeys;
    batch_pkeys.reserve(num_rows);

    struct t_spec_cols {
        const t_column* m_ord;
        std::vector<std::shared_ptr<const t_column>> m_parts;

        // Partition-key scratch, reused across every batch row.
        std::vector<t_tscalar> m_key_buf;
    };
    std::vector<t_spec_cols> spec_cols;
    spec_cols.reserve(m_states.size());
    for (const auto& state : m_states) {
        t_spec_cols cols;

        // Empty `m_order_by` = natural order (see `compute_master`).
        cols.m_ord = state.m_spec.m_order_by.empty()
            ? nullptr
            : master->get_const_column(state.m_spec.m_order_by).get();
        for (const auto& colname : state.m_spec.m_partition_by) {
            cols.m_parts.push_back(master->get_const_column(colname));
        }
        cols.m_key_buf.resize(cols.m_parts.size());
        spec_cols.push_back(std::move(cols));
    }

    // Pass 1: scan the batch, RECORDING each row's index mutation in its
    // partition's `t_partition_edits` (no index vectors are touched here) -
    // locations update immediately since they are keyed by pkey, not
    // position.
    for (t_uindex idx = 0; idx < num_rows; ++idx) {
        t_tscalar pkey = pkey_col->get_scalar(idx);
        const auto* op_ptr = op_col->get_nth<std::uint8_t>(idx);
        t_op op = static_cast<t_op>(*op_ptr);
        batch_pkeys.insert(pkey);

        for (std::size_t sidx = 0; sidx < m_states.size(); ++sidx) {
            auto& state = m_states[sidx];

            auto loc_it = state.m_locations.find(pkey);
            if (loc_it != state.m_locations.end()) {
                const t_window_location& loc = loc_it->second;
                t_partition_edits& edits = state.m_edits[*loc.m_part_key];
                edits.m_removals.emplace_back(loc.m_order, pkey);
                edits.m_touched.emplace_back(loc.m_order, pkey);
                state.m_locations.erase(loc_it);
            }

            if (op != OP_DELETE) {
                auto pkey_it = pkey_map.find(pkey);
                if (pkey_it == pkey_map.end()) {
                    continue;
                }

                t_uindex ridx = pkey_it->second;
                auto& cols = spec_cols[sidx];
                for (std::size_t i = 0; i < cols.m_parts.size(); ++i) {
                    cols.m_key_buf[i] = cols.m_parts[i]->get_scalar(ridx);
                }

                t_tscalar order;
                order.clear();
                if (cols.m_ord != nullptr) {
                    order = cols.m_ord->get_scalar(ridx);
                }

                // `try_emplace` guarantees the partition node (and thus the
                // stable key the location points at) exists even before
                // pass 2 merges the row in.
                auto part_it =
                    state.m_partitions.try_emplace(cols.m_key_buf).first;
                t_partition_edits& edits = state.m_edits[cols.m_key_buf];
                edits.m_additions.push_back({ridx, order, pkey});
                edits.m_touched.emplace_back(order, pkey);
                state.m_locations[pkey] = {&part_it->first, order, ridx};
            } else if (idx < lookup.size() && lookup[idx].m_exists) {
                state.m_dead_ridxs.push_back(lookup[idx].m_idx);
            }
        }
    }

    // Pass 2: apply each partition's buffered edits in ONE compaction +
    // sorted-merge pass - O(n + k log k) per partition, where the removed
    // per-row `erase`/`insert` was O(k * n). The prefix accumulators only
    // track SIZE here: positions at or past the first edit are
    // garbage-by-contract until `recompute_range` rewrites them, and its
    // dirty range always starts at or before the first edited position;
    // positions below it are untouched by the resize.
    for (auto& state : m_states) {
        const bool desc = state.m_spec.m_order_desc;
        for (auto& kv : state.m_edits) {
            auto part_it = state.m_partitions.find(kv.first);
            if (part_it == state.m_partitions.end()) {
                continue;
            }

            t_window_partition& partition = part_it->second;
            auto& rows = partition.m_rows;
            t_partition_edits& edits = kv.second;

            // Removal positions, resolved against the PRE-edit index.
            std::vector<std::size_t> rpos;
            rpos.reserve(edits.m_removals.size());
            for (const auto& rem : edits.m_removals) {
                std::size_t pos =
                    lower_bound_row(rows, rem.first, rem.second, desc);
                if (pos < rows.size() && rows[pos].m_pkey == rem.second) {
                    rpos.push_back(pos);
                }
            }

            std::sort(rpos.begin(), rpos.end());
            if (!rpos.empty()) {
                std::size_t w = rpos[0];
                std::size_t next = 0;
                for (std::size_t r = rpos[0]; r < rows.size(); ++r) {
                    if (next < rpos.size() && rpos[next] == r) {
                        ++next;
                        continue;
                    }

                    rows[w++] = rows[r];
                }

                rows.resize(w);
            }

            if (!edits.m_additions.empty()) {
                auto& adds = edits.m_additions;
                std::sort(
                    adds.begin(),
                    adds.end(),
                    [desc](const t_window_row& a, const t_window_row& b) {
                        return key_less(
                            a.m_order, a.m_pkey, b.m_order, b.m_pkey, desc
                        );
                    }
                );

                // In-place backward merge; (order, pkey) keys are unique
                // (a re-added pkey was removed above), so ties cannot
                // occur.
                std::size_t old_n = rows.size();
                rows.resize(old_n + adds.size());
                std::size_t i = old_n;
                std::size_t j = adds.size();
                std::size_t w = rows.size();
                while (j > 0) {
                    if (i > 0
                        && key_less(
                            adds[j - 1].m_order,
                            adds[j - 1].m_pkey,
                            rows[i - 1].m_order,
                            rows[i - 1].m_pkey,
                            desc
                        )) {
                        rows[--w] = rows[--i];
                    } else {
                        rows[--w] = adds[--j];
                    }
                }
            }

            if (state.m_needs_prefix) {
                partition.m_prefix_sum.resize(rows.size());
                partition.m_prefix_sumsq.resize(rows.size());
                partition.m_prefix_count.resize(rows.size());
            }
        }
    }

    // Resolve touched keys to positions on the FINAL (post-maintenance)
    // partition contents, extend to the spec class's invalidation reach,
    // merge, and emit the pkeys outside the batch. Over-approximation is
    // safe: the pipeline's prev/current diff suppresses rows whose outputs
    // did not change.
    tsl::hopscotch_set<t_tscalar> seen;
    for (auto& state : m_states) {
        const t_window_spec& spec = state.m_spec;
        t_window_class klass = class_of(spec);

        for (const auto& touched : state.m_edits) {
            auto part_it = state.m_partitions.find(touched.first);
            if (part_it == state.m_partitions.end()
                || part_it->second.m_rows.empty()) {
                if (part_it != state.m_partitions.end()) {
                    state.m_partitions.erase(part_it);
                }
                continue;
            }

            const auto& rows = part_it->second.m_rows;
            std::size_t first_valid = partition_first_valid(rows);
            std::vector<std::pair<std::size_t, std::size_t>> ranges;
            std::size_t min_pos = rows.size();

            for (const auto& key : touched.second.m_touched) {
                std::size_t pos = lower_bound_row(
                    rows, key.first, key.second, spec.m_order_desc
                );
                switch (klass) {
                    case t_window_class::WINDOW_CLASS_CUMULATIVE:
                        min_pos = std::min(min_pos, pos);
                        break;
                    case t_window_class::WINDOW_CLASS_AGG_ROWS:
                        if (pos < rows.size()) {
                            ranges.emplace_back(
                                pos,
                                std::min<std::size_t>(
                                    rows.size(), pos + spec.m_frame_rows + 1
                                )
                            );
                        }
                        break;
                    case t_window_class::WINDOW_CLASS_AGG_RANGE: {
                        if (!key.first.is_valid()) {
                            // Rows with invalid order keys frame together
                            // in the invalid prefix.
                            if (pos < first_valid) {
                                ranges.emplace_back(pos, first_valid);
                            }
                            break;
                        }

                        double k = key.first.to_double();
                        std::size_t lo = frame_lower_bound(
                            rows, k, first_valid, spec.m_order_desc
                        );
                        std::size_t hi = reach_upper_bound(
                            rows,
                            k,
                            spec.m_frame_range,
                            first_valid,
                            spec.m_order_desc
                        );
                        if (lo < hi) {
                            ranges.emplace_back(lo, hi);
                        }
                    } break;
                    case t_window_class::WINDOW_CLASS_LAG_LIKE:
                        if (pos < rows.size()) {
                            ranges.emplace_back(
                                pos,
                                std::min<std::size_t>(
                                    rows.size(), pos + spec.m_offset + 1
                                )
                            );
                        }
                        break;
                    case t_window_class::WINDOW_CLASS_LEAD_LIKE: {
                        std::size_t lo =
                            pos > spec.m_offset ? pos - spec.m_offset : 0;
                        std::size_t hi = std::min(rows.size(), pos + 1);
                        if (lo < hi) {
                            ranges.emplace_back(lo, hi);
                        }
                    } break;
                }
            }

            if (klass == t_window_class::WINDOW_CLASS_CUMULATIVE) {
                if (min_pos < rows.size()) {
                    ranges.emplace_back(min_pos, rows.size());
                }
            } else {
                std::sort(ranges.begin(), ranges.end());
                std::vector<std::pair<std::size_t, std::size_t>> merged;
                for (const auto& r : ranges) {
                    if (!merged.empty() && r.first <= merged.back().second) {
                        merged.back().second =
                            std::max(merged.back().second, r.second);
                    } else {
                        merged.push_back(r);
                    }
                }
                ranges = std::move(merged);
            }

            for (const auto& r : ranges) {
                state.m_dirty.push_back({touched.first, r.first, r.second});
                for (std::size_t pos = r.first; pos < r.second; ++pos) {
                    const t_tscalar& pk = rows[pos].m_pkey;
                    if (batch_pkeys.find(pk) == batch_pkeys.end()
                        && seen.insert(pk).second) {
                        invalidated.push_back(pk);
                    }
                }
            }
        }
    }

    return invalidated;
}

void
t_window_engine::compute_update(
    const std::shared_ptr<t_data_table>& master,
    const t_gstate::t_mapping& pkey_map,
    const std::shared_ptr<t_data_table>& expr_master,
    const std::shared_ptr<t_data_table>& expr_flattened,
    const std::shared_ptr<t_data_table>& expr_prev,
    const std::shared_ptr<t_data_table>& expr_current,
    const std::shared_ptr<t_data_table>& expr_delta,
    const std::shared_ptr<t_data_table>& flattened,
    const std::shared_ptr<t_data_table>& existed
) {
    if (m_states.empty()) {
        return;
    }

    t_uindex num_rows = flattened->size();
    const auto pkey_col = flattened->get_const_column("psp_pkey");
    const auto existed_col = existed->get_const_column("psp_existed");

    // Previous window values must be captured from `expr_master` BEFORE the
    // recompute below overwrites it - it still holds the pre-update
    // outputs. Rows-outer so the existed check and pkey hash lookup happen
    // ONCE per row, shared by every spec.
    struct t_prev_cols {
        t_column* m_prev;
        const t_column* m_old;
    };
    std::vector<t_prev_cols> prev_cols;
    prev_cols.reserve(m_states.size());
    for (const auto& state : m_states) {
        const auto& spec = state.m_spec;
        auto prev_col =
            expr_prev->add_column_sptr(spec.m_name, spec.m_dtype, true);
        prev_col->reserve(num_rows);
        auto old_col =
            expr_master->add_column_sptr(spec.m_name, spec.m_dtype, true);
        prev_cols.push_back({prev_col.get(), old_col.get()});
    }

    for (t_uindex ridx = 0; ridx < num_rows; ++ridx) {
        // Value read: `get_nth` never returns nullptr in bounds.
        bool row_existed = *(existed_col->get_nth<bool>(ridx));
        t_uindex mridx = 0;
        bool found = false;
        if (row_existed) {
            t_tscalar pkey = pkey_col->get_scalar(ridx);
            auto it = pkey_map.find(pkey);
            if (it != pkey_map.end() && it->second < expr_master->size()) {
                mridx = it->second;
                found = true;
            }
        }

        for (const auto& cols : prev_cols) {
            if (found && cols.m_old->is_valid(mridx)) {
                cols.m_prev->set_scalar(ridx, cols.m_old->get_scalar(mridx));
            } else {
                cols.m_prev->clear(ridx);
            }
        }
    }

    if (!m_collected) {
        // No widening pass preceded this update (e.g. a code path that does
        // not run the gnode `_process_table` hook) - fall back to the full
        // rebuild, which is always correct.
        compute_master(master, pkey_map, expr_master);
    } else {
        for (auto& state : m_states) {
            const auto& spec = state.m_spec;
            auto out =
                expr_master->add_column_sptr(spec.m_name, spec.m_dtype, true);
            out->reserve(expr_master->size());

            for (t_uindex dead : state.m_dead_ridxs) {
                if (dead < expr_master->size()) {
                    out->clear(dead);
                }
            }

            const t_column* src = source_column(state, master, expr_master);
            for (const auto& dirty : state.m_dirty) {
                auto part_it = state.m_partitions.find(dirty.m_part_key);
                if (part_it == state.m_partitions.end()) {
                    continue;
                }

                recompute_range(
                    state,
                    part_it->second,
                    dirty.m_lo,
                    std::min(dirty.m_hi, part_it->second.m_rows.size()),
                    *src,
                    *out
                );
            }

            state.m_edits.clear();
            state.m_dead_ridxs.clear();
            state.m_dirty.clear();
        }

        m_collected = false;
    }

    fill_transitional(
        pkey_map,
        expr_master,
        expr_flattened,
        expr_prev,
        expr_current,
        expr_delta,
        flattened
    );
}

void
t_window_engine::fill_transitional(
    const t_gstate::t_mapping& pkey_map,
    const std::shared_ptr<t_data_table>& expr_master,
    const std::shared_ptr<t_data_table>& expr_flattened,
    const std::shared_ptr<t_data_table>& expr_prev,
    const std::shared_ptr<t_data_table>& expr_current,
    const std::shared_ptr<t_data_table>& expr_delta,
    const std::shared_ptr<t_data_table>& flattened
) const {
    t_uindex num_rows = flattened->size();
    const auto pkey_col = flattened->get_const_column("psp_pkey");

    // Rows-outer so the pkey hash lookup happens ONCE per row, shared by
    // every spec.
    struct t_fill_cols {
        t_dtype m_dtype;
        const t_column* m_new;
        const t_column* m_prev;
        t_column* m_flattened;
        t_column* m_current;
        t_column* m_delta;
    };
    std::vector<t_fill_cols> fill_cols;
    fill_cols.reserve(m_states.size());
    for (const auto& state : m_states) {
        const auto& spec = state.m_spec;
        auto new_col = expr_master->get_column(spec.m_name);
        auto prev_col = expr_prev->get_column(spec.m_name);
        auto flattened_col =
            expr_flattened->add_column_sptr(spec.m_name, spec.m_dtype, true);
        auto current_col =
            expr_current->add_column_sptr(spec.m_name, spec.m_dtype, true);
        auto delta_col =
            expr_delta->add_column_sptr(spec.m_name, spec.m_dtype, true);
        flattened_col->reserve(num_rows);
        current_col->reserve(num_rows);
        delta_col->reserve(num_rows);
        fill_cols.push_back(
            {spec.m_dtype,
             new_col.get(),
             prev_col.get(),
             flattened_col.get(),
             current_col.get(),
             delta_col.get()}
        );
    }

    for (t_uindex ridx = 0; ridx < num_rows; ++ridx) {
        t_tscalar pkey = pkey_col->get_scalar(ridx);
        auto it = pkey_map.find(pkey);
        bool found = it != pkey_map.end() && it->second < expr_master->size();
        for (const auto& cols : fill_cols) {
            if (!found || !cols.m_new->is_valid(it->second)) {
                cols.m_flattened->clear(ridx);
                cols.m_current->clear(ridx);
                cols.m_delta->clear(ridx);
                continue;
            }

            t_tscalar value = cols.m_new->get_scalar(it->second);
            cols.m_flattened->set_scalar(ridx, value);
            cols.m_current->set_scalar(ridx, value);

            bool prev_valid = cols.m_prev->is_valid(ridx);
            if (cols.m_dtype == DTYPE_FLOAT64 && prev_valid) {
                write_float(
                    *cols.m_delta,
                    ridx,
                    value.to_double()
                        - cols.m_prev->get_scalar(ridx).to_double()
                );
            } else if (cols.m_dtype == DTYPE_INT64 && prev_valid) {
                write_int(
                    *cols.m_delta,
                    ridx,
                    value.get<std::int64_t>()
                        - cols.m_prev->get_scalar(ridx).get<std::int64_t>()
                );
            } else {
                cols.m_delta->set_scalar(ridx, value);
            }
        }
    }
}

} // end namespace perspective
