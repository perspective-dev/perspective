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
#include <perspective/raw_types.h>
#include <perspective/data_table.h>
#include <perspective/gnode_state.h>
#include <perspective/rlookup.h>
#include <map>

namespace perspective {

enum class t_window_op : std::uint8_t {
    WINDOW_OP_SUM,
    WINDOW_OP_AVG,
    WINDOW_OP_COUNT,
    WINDOW_OP_MIN,
    WINDOW_OP_MAX,
    WINDOW_OP_STDDEV,
    WINDOW_OP_VAR,
    WINDOW_OP_FIRST,
    WINDOW_OP_LAST,
    WINDOW_OP_LAG,
    WINDOW_OP_LEAD,
    WINDOW_OP_DIFF,
    WINDOW_OP_RATE,
    WINDOW_OP_EMA
};

enum class t_window_frame_type : std::uint8_t {
    WINDOW_FRAME_ROWS,
    WINDOW_FRAME_RANGE,
    WINDOW_FRAME_CUMULATIVE
};

/**
 * @brief A single window column declaration: `m_op` applied over an ordered,
 * partitioned frame of rows, producing output column `m_name` in a context's
 * expression tables. Validated and dtype-resolved at `View` construction
 * (`server.cpp`), inert afterwards.
 */
struct PERSPECTIVE_EXPORT t_window_spec {
    std::string m_name;
    std::string m_source;
    std::string m_order_by;

    // The sorted direction IS the window's row order: cumulative frames
    // accumulate in it, lag/lead offsets and Range intervals are relative
    // to it. Invalid order keys sort first in either direction; pkey
    // tiebreaks stay ascending.
    bool m_order_desc;

    std::vector<std::string> m_partition_by;
    t_window_op m_op;
    t_window_frame_type m_frame_type;
    t_uindex m_frame_rows;
    double m_frame_range;
    t_uindex m_offset;
    double m_alpha;
    t_dtype m_dtype;
};

/**
 * @brief The computation shape of a spec, which keys both the recompute
 * dispatch and the invalidation reach of an update:
 *
 * - `AGG_ROWS`/`AGG_RANGE`: an aggregating op over a positional/key-interval
 *   trailing frame; a touched row invalidates the rows whose frames can
 *   contain it (`n` successors / the `[key, key + range]` key interval).
 * - `CUMULATIVE`: running aggregates and `ema` (recursive, so
 *   cumulative-class regardless of declared frame); a touched row
 *   invalidates the partition suffix.
 * - `LAG_LIKE` (`lag`, `diff`): reads `offset` rows back, so a touched row
 *   invalidates `offset` successors. `LEAD_LIKE` reads forward and
 *   invalidates `offset` PREDECESSORS - the one backward reach.
 */
enum class t_window_class : std::uint8_t {
    WINDOW_CLASS_AGG_ROWS,
    WINDOW_CLASS_AGG_RANGE,
    WINDOW_CLASS_CUMULATIVE,
    WINDOW_CLASS_LAG_LIKE,
    WINDOW_CLASS_LEAD_LIKE
};

/**
 * @brief Per-context window computation engine.
 *
 * Owns, per spec, a sorted (order key, pkey) index of each partition plus
 * prefix accumulators for cumulative frames, maintained incrementally from
 * each update batch. An update is processed in two steps, both inside one
 * gnode `_process_table` pass:
 *
 * 1. `collect_invalidations` (called by the gnode widening pass, before
 *    contexts compute): maintains the indexes from the batch, records the
 *    dirty recompute ranges, and returns the primary keys OUTSIDE the batch
 *    whose window outputs may change. The gnode appends those rows to the
 *    flattened/transitional tables so the ordinary pipeline reports their
 *    deltas; over-approximation is suppressed by the pipeline's own
 *    prev/current diffing.
 * 2. `compute_update` (called by the context's `compute_expressions`):
 *    recomputes only the dirty ranges into the expression master table, then
 *    fills the transitional tables for the (widened) batch rows by pkey.
 *
 * `compute_master` performs a full state rebuild + full recompute; it is the
 * registration path, the fallback when no `collect_invalidations` preceded
 * `compute_update`, and the permanent correctness oracle.
 */
class PERSPECTIVE_EXPORT t_window_engine {
public:
    explicit t_window_engine(std::vector<t_window_spec> specs);

    /**
     * @brief The output dtype for `op` applied to a `source_dtype` column,
     * or `DTYPE_NONE` if the combination is invalid.
     */
    static t_dtype resolve_dtype(t_window_op op, t_dtype source_dtype);

    /**
     * @brief Whether `op`/`frame` is implemented by this engine.
     */
    static bool is_implemented(t_window_op op, t_window_frame_type frame);

    /**
     * @brief The computation shape of a validated spec.
     */
    static t_window_class class_of(const t_window_spec& spec);

    bool enabled() const;

    /**
     * @brief Rebuild all index state and recompute every window column over
     * the live rows of `master`, writing output columns into `dst_master`
     * (which also supplies expression-alias `m_source` columns, so
     * expressions must be computed into it first).
     */
    void compute_master(
        const std::shared_ptr<t_data_table>& master,
        const t_gstate::t_mapping& pkey_map,
        const std::shared_ptr<t_data_table>& dst_master
    );

    /**
     * @brief Incremental step 1: apply the update batch to the indexes and
     * return the invalidated pkeys outside the batch. `flattened` is the
     * masked update batch (including `psp_op` deletes); `lookup` holds the
     * PRE-update row lookups aligned with `flattened`'s rows (dead output
     * slots of deleted rows are unknowable after the master update);
     * `master`/`pkey_map` are POST-update.
     */
    std::vector<t_tscalar> collect_invalidations(
        const t_data_table& flattened,
        const std::vector<t_rlookup>& lookup,
        const std::shared_ptr<t_data_table>& master,
        const t_gstate::t_mapping& pkey_map
    );

    /**
     * @brief Incremental step 2: capture per-row previous window values for
     * the (widened) update batch into `expr_prev`, recompute the dirty
     * ranges recorded by `collect_invalidations` into `expr_master`, then
     * fill `expr_flattened`/`expr_current`/`expr_delta` rows by primary key.
     *
     * Falls back to `compute_master` when no collection preceded this call.
     * Must run after the context's expression loop and before
     * `t_expression_tables::calculate_transitions`.
     */
    void compute_update(
        const std::shared_ptr<t_data_table>& master,
        const t_gstate::t_mapping& pkey_map,
        const std::shared_ptr<t_data_table>& expr_master,
        const std::shared_ptr<t_data_table>& expr_flattened,
        const std::shared_ptr<t_data_table>& expr_prev,
        const std::shared_ptr<t_data_table>& expr_current,
        const std::shared_ptr<t_data_table>& expr_delta,
        const std::shared_ptr<t_data_table>& flattened,
        const std::shared_ptr<t_data_table>& existed
    );

private:
    struct t_window_row {
        t_uindex m_ridx;
        t_tscalar m_order;
        t_tscalar m_pkey;
    };

    struct t_scalar_vec_cmp {
        bool operator()(
            const std::vector<t_tscalar>& a, const std::vector<t_tscalar>& b
        ) const;
    };

    struct t_window_partition {
        std::vector<t_window_row> m_rows;

        // Prefix accumulators for cumulative sum/avg/count/stddev/var
        // frames, aligned with `m_rows`; slots past a dirty range's start
        // are garbage until that range is recomputed.
        std::vector<double> m_prefix_sum;
        std::vector<double> m_prefix_sumsq;
        std::vector<std::int64_t> m_prefix_count;
    };

    struct t_window_location {
        // Points at the owning partition's `m_partitions` map node KEY -
        // stable for the node's lifetime (`std::map` nodes never move). A
        // row's location is erased before its partition node can become
        // empty (and be erased), so a live location never dangles. Storing
        // the pointer instead of a key copy removes a per-row heap
        // allocation per spec.
        const std::vector<t_tscalar>* m_part_key;
        t_tscalar m_order;
        t_uindex m_ridx;
    };

    struct t_dirty_range {
        std::vector<t_tscalar> m_part_key;
        std::size_t m_lo;
        std::size_t m_hi; // exclusive
    };

    // One partition's buffered index mutations for the current update -
    // `collect_invalidations`' batch scan RECORDS removals/additions here
    // and applies each partition's set in a single compaction + sorted
    // merge pass, bounding maintenance at O(n + k log k) where per-row
    // `erase`/`insert` was O(k * n).
    struct t_partition_edits {
        // (order key, pkey) of every row touched in this partition - both
        // the old and new positions of moved rows - resolved to
        // invalidation reaches against the POST-edit index.
        std::vector<std::pair<t_tscalar, t_tscalar>> m_touched;

        // (order key, pkey) of rows to remove from the index.
        std::vector<std::pair<t_tscalar, t_tscalar>> m_removals;

        // Rows to insert into the index.
        std::vector<t_window_row> m_additions;
    };

    struct t_spec_state {
        t_window_spec m_spec;
        bool m_needs_prefix;
        std::map<std::vector<t_tscalar>, t_window_partition, t_scalar_vec_cmp>
            m_partitions;
        tsl::hopscotch_map<t_tscalar, t_window_location> m_locations;

        // Per-update scratch, valid between `collect_invalidations` and
        // `compute_update`. Keyed by partition (an ordered map so widened
        // row emission order is deterministic across runs).
        std::map<std::vector<t_tscalar>, t_partition_edits, t_scalar_vec_cmp>
            m_edits;
        std::vector<t_uindex> m_dead_ridxs;
        std::vector<t_dirty_range> m_dirty;
    };

    void reset_state();

    const t_column* source_column(
        const t_spec_state& state,
        const std::shared_ptr<t_data_table>& master,
        const std::shared_ptr<t_data_table>& dst_master
    ) const;

    void recompute_range(
        t_spec_state& state,
        t_window_partition& partition,
        std::size_t lo,
        std::size_t hi,
        const t_column& src,
        t_column& out
    ) const;

    void fill_transitional(
        const t_gstate::t_mapping& pkey_map,
        const std::shared_ptr<t_data_table>& expr_master,
        const std::shared_ptr<t_data_table>& expr_flattened,
        const std::shared_ptr<t_data_table>& expr_prev,
        const std::shared_ptr<t_data_table>& expr_current,
        const std::shared_ptr<t_data_table>& expr_delta,
        const std::shared_ptr<t_data_table>& flattened
    ) const;

    std::vector<t_spec_state> m_states;
    bool m_collected;
};

} // end namespace perspective
