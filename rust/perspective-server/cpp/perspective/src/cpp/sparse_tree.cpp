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
#include <algorithm>
#include <cmath>
#include <fstream>
#include <perspective/base.h>
#include <perspective/compat.h>
#include <perspective/extract_aggregate.h>
#include <perspective/multi_sort.h>
#include <perspective/sparse_tree.h>
#include <perspective/sym_table.h>
#include <perspective/tracing.h>
#include <perspective/utils.h>
#include <perspective/env_vars.h>
#include <perspective/dense_tree.h>
#include <perspective/dense_tree_context.h>
#include <perspective/gnode_state.h>
#include <perspective/config.h>
#include <perspective/data_table.h>
#include <perspective/filter_utils.h>
#include <perspective/context_two.h>
#include <set>
#include <utility>

namespace perspective {

// Maximum size for join aggregate strings (64KB)
const t_uindex MAX_JOIN_SIZE = 65536;

t_tscalar
get_dominant(std::vector<t_tscalar>& values) {
    if (values.empty()) {
        return mknone();
    }

    std::sort(values.begin(), values.end());

    t_tscalar delem = values[0];
    t_index dcount = 1;
    t_index count = 1;

    for (t_index idx = 1, loop_end = values.size(); idx < loop_end; ++idx) {
        const t_tscalar& prev = values[idx - 1];
        const t_tscalar& curr = values[idx];

        if (curr == prev && curr.is_valid()) {
            ++count;
        }

        if ((idx + 1) == static_cast<t_index>(values.size()) || curr != prev) {
            if (count > dcount) {
                delem = prev;
                dcount = count;
            }

            count = 1;
        }
    }

    return delem;
}

t_tree_unify_rec::t_tree_unify_rec(
    t_uindex sptidx, t_uindex daggidx, t_uindex saggidx, t_uindex nstrands
) :
    m_sptidx(sptidx),
    m_daggidx(daggidx),
    m_saggidx(saggidx),
    m_nstrands(nstrands) {}

t_stree::t_stree(
    const std::vector<t_pivot>& pivots,
    const std::vector<t_aggspec>& aggspecs,
    t_schema schema,
    const t_config& cfg
) :
    m_pivots(pivots),
    m_init(false),
    m_curidx(1),
    m_aggspecs(aggspecs),
    m_schema(std::move(schema)),
    m_cur_aggidx(1),
    m_has_delta(false) {
    const auto& g_agg_str = cfg.get_grand_agg_str();
    m_grand_agg_str = g_agg_str.empty() ? "Grand Aggregate" : g_agg_str;
}

t_stree::~t_stree() {
    for (auto& iter : m_smap) {
        free(const_cast<char*>(iter.first));
    }
}

t_uindex
t_stree::get_num_aggcols() const {
    return m_aggspecs.size();
}

std::string
t_stree::repr() const {
    std::stringstream ss;
    ss << "t_stree<" << this << ">";
    return ss.str();
}

void
t_stree::init() {
    m_nodes = std::make_shared<t_treenodes>();
    m_idxpkey = std::make_shared<t_idxpkey>();
    m_idxleaf = std::make_shared<t_idxleaf>();

    t_tscalar value = m_symtable.get_interned_tscalar(m_grand_agg_str.c_str());
    t_tnode node(0, root_pidx(), value, 0, value, 1, 0);
    m_nodes->insert(node);

    std::vector<std::string> columns;
    std::vector<t_dtype> dtypes;

    for (const auto& spec : m_aggspecs) {
        auto cinfo = spec.get_output_specs(m_schema);

        for (const auto& ci : cinfo) {
            columns.push_back(ci.m_name);
            dtypes.push_back(ci.m_type);
        }
    }

    t_schema schema(columns, dtypes);

    t_uindex capacity = DEFAULT_EMPTY_CAPACITY;
    m_aggregates = std::make_shared<t_data_table>(schema, capacity);
    m_aggregates->init();
    m_aggregates->set_size(capacity);

    m_aggcols = std::vector<const t_column*>(columns.size());

    for (t_uindex idx = 0, loop_end = columns.size(); idx < loop_end; ++idx) {
        m_aggcols[idx] = m_aggregates->get_const_column(columns[idx]).get();
    }

    m_deltas = std::make_shared<t_tcdeltas>();
    m_features = std::vector<bool>(CTX_FEAT_LAST_FEATURE);
    m_init = true;
}

t_tscalar
t_stree::get_value(t_index idx) const {
    iter_by_idx iter = m_nodes->get<by_idx>().find(idx);
    PSP_VERBOSE_ASSERT(
        iter != m_nodes->get<by_idx>().end(), "Reached end iterator"
    );
    return iter->m_value;
}

t_tscalar
t_stree::get_sortby_value(t_index idx) const {
    iter_by_idx iter = m_nodes->get<by_idx>().find(idx);
    PSP_VERBOSE_ASSERT(
        iter != m_nodes->get<by_idx>().end(), "Reached end iterator"
    );
    return iter->m_sort_value;
}

void
t_stree::build_strand_table_phase_1(
    t_tscalar pkey,
    t_op op,
    t_uindex idx,
    t_uindex npivots,
    t_uindex strand_count_idx,
    t_uindex aggcolsize,
    bool force_current_row,
    const std::vector<const t_column*>& piv_ccols,
    const std::vector<const t_column*>& piv_tcols,
    const std::vector<const t_column*>& agg_ccols,
    const std::vector<const t_column*>& agg_dcols,
    std::vector<t_column*>& piv_scols,
    std::vector<t_column*>& agg_acols,
    t_column* agg_scount,
    t_column* spkey,
    t_uindex& insert_count,
    bool& pivots_neq,
    const std::vector<std::string>& pivot_like
) const {
    pivots_neq = false;
    std::set<std::string> pivmap;

    // if a row has been changed (value change, validity change, removed, etc.),
    // will be false.
    bool no_new_rows = true;

    // for each strand col, take out the value at row `idx` and use the
    // transition to calculate whether the pivot has changed.
    for (t_uindex pidx = 0, ploop_end = pivot_like.size(); pidx < ploop_end;
         ++pidx) {
        const std::string& colname = pivot_like.at(pidx);
        if (pivmap.find(colname) != pivmap.end()) {
            continue;
        }
        pivmap.insert(colname);
        piv_scols[pidx]->push_back(piv_ccols[pidx]->get_scalar(idx));
        const auto* trans_ = piv_tcols[pidx]->get_nth<std::uint8_t>(idx);
        auto trans = static_cast<t_value_transition>(*trans_);

        // `no_new_rows` is used to calculate the strand count for the
        // "count" aggregate. Previously we only checked if the column's
        // value and validity did not change, which led to a long-running bug
        // where the "last" aggregate would increase the "count" of another
        // column even when no new rows were added. Thus, we only need
        // to check if new rows were added, not whether the row's value
        // has changed.
        if (trans != VALUE_TRANSITION_EQ_TT
            && trans != VALUE_TRANSITION_NEQ_TT) {
            no_new_rows = false;
        }

        if (pidx < npivots) {
            pivots_neq = pivots_neq || pivots_changed(trans);
        }
    }

    // For each aggregate col, except "psp_strand_count" as marked by
    // "strand_count_idx" (the number of strands in the table), if the pivot
    // has changed OR force_current_row is true, then use the aggregate
    // from `current`, else use the `delta`.
    for (t_uindex aggidx = 0; aggidx < aggcolsize; ++aggidx) {
        if (aggidx != strand_count_idx) {
            if (pivots_neq || force_current_row) {
                agg_acols[aggidx]->push_back(agg_ccols[aggidx]->get_scalar(idx)
                );
            } else {
                agg_acols[aggidx]->push_back(agg_dcols[aggidx]->get_scalar(idx)
                );
            }
        }
    }

    std::int8_t strand_count;

    if (op == OP_DELETE) {
        // A row has been removed
        strand_count = -1;
    } else {
        // Strand count is 1 if there are no pivots, if new rows have been
        // added, if pivots have been changed, or force_current_row is true.
        strand_count =
            npivots == 0 || !no_new_rows || pivots_neq || force_current_row ? 1
                                                                            : 0;
    }

    agg_scount->push_back<std::int8_t>(strand_count);
    spkey->push_back(pkey);

    ++insert_count;
}

void
t_stree::build_strand_table_phase_2(
    t_tscalar pkey,
    t_uindex idx,
    t_uindex npivots,
    t_uindex strand_count_idx,
    t_uindex aggcolsize,
    const std::vector<const t_column*>& piv_pcols,
    const std::vector<const t_column*>& agg_pcols,
    std::vector<t_column*>& piv_scols,
    std::vector<t_column*>& agg_acols,
    t_column* agg_scount,
    t_column* spkey,
    t_uindex& insert_count,
    const std::vector<std::string>& pivot_like
) const {
    std::set<std::string> pivmap;

    // For each column, insert the prev value to the strand
    for (t_uindex pidx = 0, ploop_end = pivot_like.size(); pidx < ploop_end;
         ++pidx) {
        const std::string& colname = pivot_like.at(pidx);
        if (pivmap.find(colname) != pivmap.end()) {
            continue;
        }
        pivmap.insert(colname);
        piv_scols[pidx]->push_back(piv_pcols[pidx]->get_scalar(idx));
    }

    for (t_uindex aggidx = 0; aggidx < aggcolsize; ++aggidx) {
        if (aggidx != strand_count_idx) {
            agg_acols[aggidx]->push_back(
                agg_pcols[aggidx]->get_scalar(idx).negate()
            );
        }
    }

    agg_scount->push_back<std::int8_t>(std::int8_t(-1));
    spkey->push_back(pkey);
    ++insert_count;
}

t_build_strand_table_metadata
t_stree::build_strand_table_metadata(
    const t_data_table& flattened,
    const std::vector<t_aggspec>& aggspecs,
    const t_config& config
) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    t_build_strand_table_metadata metadata;

    metadata.m_flattened_schema = flattened.get_schema();
    std::set<std::string> sschema_colset;

    for (const auto& piv : m_pivots) {
        const std::string& colname = piv.colname();
        std::string sortby_colname = config.get_sort_by(colname);
        auto add_col = [&sschema_colset, &metadata](const std::string& cname) {
            if (sschema_colset.find(cname) == sschema_colset.end()) {
                metadata.m_pivot_like_columns.push_back(cname);
                metadata.m_strand_schema.add_column(
                    cname, metadata.m_flattened_schema.get_dtype(cname)
                );
                sschema_colset.insert(cname);
            }
        };

        add_col(colname);
        add_col(sortby_colname);
    }

    metadata.m_pivsize = sschema_colset.size();

    std::set<std::string> aggcolset;
    for (const auto& aggspec : aggspecs) {
        for (const auto& dep : aggspec.get_dependencies()) {
            if (dep.type() == DEPTYPE_COLUMN) {
                const std::string& depname = dep.name();
                aggcolset.insert(depname);

                if (aggspec.is_non_delta()
                    && sschema_colset.find(depname) == sschema_colset.end()) {
                    metadata.m_pivot_like_columns.push_back(depname);
                    metadata.m_strand_schema.add_column(
                        depname, metadata.m_flattened_schema.get_dtype(depname)
                    );
                    sschema_colset.insert(depname);
                }
            }
        }
    }

    metadata.m_npivotlike = sschema_colset.size();
    metadata.m_strand_schema.add_column(
        "psp_pkey", flattened.get_const_column("psp_pkey")->get_dtype()
    );

    for (const auto& aggcol : aggcolset) {
        metadata.m_aggschema.add_column(
            aggcol, metadata.m_flattened_schema.get_dtype(aggcol)
        );
    }

    metadata.m_aggschema.add_column("psp_strand_count", DTYPE_INT8);
    return metadata;
}

/**
 * @brief Builds the strand table for all subsequent updates after the first
 * update to the table.
 *
 * @param flattened
 * @param delta
 * @param prev
 * @param current
 * @param transitions
 * @param aggspecs
 * @param config
 * @return std::pair<std::shared_ptr<t_data_table>,
 * std::shared_ptr<t_data_table>>
 */
std::pair<std::shared_ptr<t_data_table>, std::shared_ptr<t_data_table>>
t_stree::build_strand_table(
    const t_data_table& flattened,
    const t_data_table& delta,
    const t_data_table& prev,
    const t_data_table& current,
    const t_data_table& transitions,
    const std::vector<t_aggspec>& aggspecs,
    const t_config& config
) const {

    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    auto metadata = build_strand_table_metadata(flattened, aggspecs, config);

    // strand table
    std::shared_ptr<t_data_table> strands =
        std::make_shared<t_data_table>(metadata.m_strand_schema);
    strands->init();

    // strand table
    std::shared_ptr<t_data_table> aggs =
        std::make_shared<t_data_table>(metadata.m_aggschema);
    aggs->init();

    std::shared_ptr<const t_column> pkey_col =
        flattened.get_const_column("psp_pkey");
    std::shared_ptr<const t_column> op_col =
        flattened.get_const_column("psp_op");

    t_uindex npivotlike = metadata.m_npivotlike;
    std::vector<const t_column*> piv_pcols(npivotlike);
    std::vector<const t_column*> piv_ccols(npivotlike);
    std::vector<const t_column*> piv_tcols(npivotlike);
    std::vector<t_column*> piv_scols(npivotlike);

    t_uindex insert_count = 0;

    // Get each intermediate column, including columns aggregated by
    // last, high, and low as they were added to m_strand_schema in
    // the construction method.
    for (t_uindex pidx = 0; pidx < npivotlike; ++pidx) {
        const std::string& piv = metadata.m_strand_schema.m_columns[pidx];
        piv_pcols[pidx] = prev.get_const_column(piv).get();
        piv_ccols[pidx] = current.get_const_column(piv).get();
        piv_tcols[pidx] = transitions.get_const_column(piv).get();
        piv_scols[pidx] = strands->get_column(piv).get();
    }

    t_uindex aggcolsize = metadata.m_aggschema.m_columns.size();
    std::vector<const t_column*> agg_ccols(aggcolsize);
    std::vector<const t_column*> agg_pcols(aggcolsize);
    std::vector<const t_column*> agg_dcols(aggcolsize);
    std::vector<t_column*> agg_acols(aggcolsize);

    t_uindex strand_count_idx = 0;

    for (t_uindex aggidx = 0; aggidx < aggcolsize; ++aggidx) {
        const std::string& aggcol = metadata.m_aggschema.m_columns[aggidx];
        if (aggcol == "psp_strand_count") {
            agg_dcols[aggidx] = nullptr;
            agg_ccols[aggidx] = nullptr;
            agg_pcols[aggidx] = nullptr;
            strand_count_idx = aggidx;
        } else {
            agg_dcols[aggidx] = delta.get_const_column(aggcol).get();
            agg_ccols[aggidx] = current.get_const_column(aggcol).get();
            agg_pcols[aggidx] = prev.get_const_column(aggcol).get();
        }

        agg_acols[aggidx] = aggs->get_column(aggcol).get();
    }

    t_column* agg_scount = aggs->get_column("psp_strand_count").get();

    t_column* spkey = strands->get_column("psp_pkey").get();

    t_mask msk_prev;
    t_mask msk_curr;

    if (config.has_filters()) {
        msk_prev = filter_table_for_config(prev, config);
        msk_curr = filter_table_for_config(current, config);
    }

    bool has_filters = config.has_filters();

    if (has_filters) {
        for (t_uindex idx = 0, loop_end = flattened.size(); idx < loop_end;
             ++idx) {
            bool filter_prev = msk_prev.get(idx);
            bool filter_curr = msk_curr.get(idx);

            t_tscalar pkey = pkey_col->get_scalar(idx);
            std::uint8_t op_ = *(op_col->get_nth<std::uint8_t>(idx));
            t_op op = static_cast<t_op>(op_);
            bool pivots_neq;

            if (!filter_prev && !filter_curr) {
                // nothing to do
                continue;
            }
            if (!filter_prev && filter_curr) {
                // apply current row
                build_strand_table_phase_1(
                    pkey,
                    op,
                    idx,
                    metadata.m_pivsize,
                    strand_count_idx,
                    aggcolsize,
                    true,
                    piv_ccols,
                    piv_tcols,
                    agg_ccols,
                    agg_dcols,
                    piv_scols,
                    agg_acols,
                    agg_scount,
                    spkey,
                    insert_count,
                    pivots_neq,
                    metadata.m_pivot_like_columns
                );
            } else if (filter_prev && !filter_curr) {
                // reverse prev row
                build_strand_table_phase_2(
                    pkey,
                    idx,
                    metadata.m_pivsize,
                    strand_count_idx,
                    aggcolsize,
                    piv_pcols,
                    agg_pcols,
                    piv_scols,
                    agg_acols,
                    agg_scount,
                    spkey,
                    insert_count,
                    metadata.m_pivot_like_columns
                );
            } else if (filter_prev && filter_curr) {
                // should be handled as normal
                build_strand_table_phase_1(
                    pkey,
                    op,
                    idx,
                    metadata.m_pivsize,
                    strand_count_idx,
                    aggcolsize,
                    false,
                    piv_ccols,
                    piv_tcols,
                    agg_ccols,
                    agg_dcols,
                    piv_scols,
                    agg_acols,
                    agg_scount,
                    spkey,
                    insert_count,
                    pivots_neq,
                    metadata.m_pivot_like_columns
                );

                if (op == OP_DELETE || !pivots_neq) {
                    continue;
                }

                build_strand_table_phase_2(
                    pkey,
                    idx,
                    metadata.m_pivsize,
                    strand_count_idx,
                    aggcolsize,
                    piv_pcols,
                    agg_pcols,
                    piv_scols,
                    agg_acols,
                    agg_scount,
                    spkey,
                    insert_count,
                    metadata.m_pivot_like_columns
                );
            }
        }
    } else {
        for (t_uindex idx = 0, loop_end = flattened.size(); idx < loop_end;
             ++idx) {

            t_tscalar pkey = pkey_col->get_scalar(idx);
            std::uint8_t op_ = *(op_col->get_nth<std::uint8_t>(idx));
            t_op op = static_cast<t_op>(op_);
            bool pivots_neq;

            // FOR EVERY ROW,
            // piv_ccols: current strand col, piv_tcols: current transition
            // col for strand
            build_strand_table_phase_1(
                pkey,
                op,
                idx,
                metadata.m_pivsize,
                strand_count_idx,
                aggcolsize,
                false,
                piv_ccols,
                piv_tcols,
                agg_ccols,
                agg_dcols,
                piv_scols,
                agg_acols,
                agg_scount,
                spkey,
                insert_count,
                pivots_neq,
                metadata.m_pivot_like_columns
            );

            if (op == OP_DELETE || !pivots_neq) {
                continue;
            }

            // FOR EVERY ROW,
            // piv_pcols: prev, piv_scols: strands? final data?
            build_strand_table_phase_2(
                pkey,
                idx,
                metadata.m_pivsize,
                strand_count_idx,
                aggcolsize,
                piv_pcols,
                agg_pcols,
                piv_scols,
                agg_acols,
                agg_scount,
                spkey,
                insert_count,
                metadata.m_pivot_like_columns
            );
        }
    }

    strands->reserve(insert_count);
    strands->set_size(insert_count);
    aggs->reserve(insert_count);
    aggs->set_size(insert_count);
    agg_scount->valid_raw_fill();
    return std::pair<
        std::shared_ptr<t_data_table>,
        std::shared_ptr<t_data_table>>(strands, aggs);
}

/**
 * @brief Builds the strand table immediately after a view's creation, where
 * the only table that matters is `flattened` which contains the dataset
 * from the gnode_state.
 *
 * @param flattened
 * @param aggspecs
 * @param config
 * @return std::pair<std::shared_ptr<t_data_table>,
 * std::shared_ptr<t_data_table>>
 */
std::pair<std::shared_ptr<t_data_table>, std::shared_ptr<t_data_table>>
t_stree::build_strand_table(
    const t_data_table& flattened,
    const std::vector<t_aggspec>& aggspecs,
    const t_config& config
) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    auto metadata = build_strand_table_metadata(flattened, aggspecs, config);

    // strand table
    std::shared_ptr<t_data_table> strands =
        std::make_shared<t_data_table>(metadata.m_strand_schema);
    strands->init();

    // strand table
    std::shared_ptr<t_data_table> aggs =
        std::make_shared<t_data_table>(metadata.m_aggschema);
    aggs->init();

    std::shared_ptr<const t_column> pkey_col =
        flattened.get_const_column("psp_pkey");

    std::shared_ptr<const t_column> op_col =
        flattened.get_const_column("psp_op");

    t_uindex npivotlike = metadata.m_npivotlike;
    std::vector<const t_column*> piv_fcols(npivotlike);
    std::vector<t_column*> piv_scols(npivotlike);
    t_uindex insert_count = 0;
    for (t_uindex pidx = 0; pidx < npivotlike; ++pidx) {
        const std::string& piv = metadata.m_strand_schema.m_columns[pidx];
        piv_fcols[pidx] = flattened.get_const_column(piv).get();
        piv_scols[pidx] = strands->get_column(piv).get();
    }

    t_uindex aggcolsize = metadata.m_aggschema.m_columns.size();
    std::vector<const t_column*> agg_fcols(aggcolsize);
    std::vector<t_column*> agg_acols(aggcolsize);
    t_uindex strand_count_idx = 0;
    for (t_uindex aggidx = 0; aggidx < aggcolsize; ++aggidx) {
        const std::string& aggcol = metadata.m_aggschema.m_columns[aggidx];
        if (aggcol == "psp_strand_count") {
            agg_fcols[aggidx] = nullptr;
            strand_count_idx = aggidx;
        } else {
            agg_fcols[aggidx] = flattened.get_const_column(aggcol).get();
        }

        agg_acols[aggidx] = aggs->get_column(aggcol).get();
    }

    t_column* agg_scount = aggs->get_column("psp_strand_count").get();
    t_column* spkey = strands->get_column("psp_pkey").get();
    t_mask msk;
    if (config.has_filters()) {
        msk = filter_table_for_config(flattened, config);
    }

    bool has_filters = config.has_filters();
    const t_uindex loop_end = flattened.size();
    const t_uindex size = loop_end - msk.count();
    const t_uindex ploop_end = metadata.m_pivot_like_columns.size();
    parallel_for(int(aggcolsize + 1), [&](int aggidx) {
        // This over-allocates for `OP_DELETE`, as it only accounts for
        // filtered count.
        if (aggidx > 0) {
            if (aggidx - 1 != strand_count_idx) {
                agg_acols[aggidx - 1]->reserve(size);
            }
        } else {
            spkey->reserve(size);
            for (t_uindex pidx = 0; pidx < ploop_end; ++pidx) {
                piv_scols[pidx]->reserve(size);
            }
        }

        for (t_uindex idx = 0; idx < loop_end; ++idx) {
            bool filter = !has_filters || msk.get(idx);
            if (!filter) {
                continue;
            }

            std::uint8_t op_ = *(op_col->get_nth<std::uint8_t>(idx));
            t_op op = static_cast<t_op>(op_);
            if (op == OP_DELETE) {
                continue;
            }

            if (aggidx == 0) {
                t_tscalar pkey = pkey_col->get_scalar(idx);
                for (t_uindex pidx = 0; pidx < ploop_end; ++pidx) {
                    piv_scols[pidx]->push_back(piv_fcols[pidx]->get_scalar(idx)
                    );
                }

                agg_scount->push_back<std::int8_t>(1);
                spkey->push_back(pkey);
                ++insert_count;
            } else if (aggidx - 1 != strand_count_idx) {
                agg_acols[aggidx - 1]->push_back(
                    agg_fcols[aggidx - 1]->get_scalar(idx)
                );
            }
        }
    });

    strands->reserve(insert_count);
    strands->set_size(insert_count);
    aggs->reserve(insert_count);
    aggs->set_size(insert_count);
    agg_scount->valid_raw_fill();
    return std::pair<
        std::shared_ptr<t_data_table>,
        std::shared_ptr<t_data_table>>(strands, aggs);
}

bool
t_stree::pivots_changed(t_value_transition t) const {

    return t == VALUE_TRANSITION_NEQ_TF || t == VALUE_TRANSITION_NVEQ_FT
        || t == VALUE_TRANSITION_NEQ_TT;
}

void
t_stree::populate_pkey_idx(
    const t_dtree_ctx& ctx,
    const t_dtree& dtree,
    t_uindex dptidx,
    t_uindex sptidx,
    t_uindex ndepth,
    t_idxpkey& new_idx_pkey
) {
    if (ndepth == dtree.last_level()) {
        auto pkey_col = ctx.get_pkey_col();
        auto strand_count_col = ctx.get_strand_count_col();
        auto liters = ctx.get_leaf_iterators(dptidx);

        for (const auto* lfiter = liters.first; lfiter != liters.second;
             ++lfiter) {

            auto lfidx = *lfiter;
            auto pkey =
                m_symtable.get_interned_tscalar(pkey_col->get_scalar(lfidx));
            auto strand_count =
                *(strand_count_col->get_nth<std::int8_t>(lfidx));

            // Checks the strand count and adds a new primary key if it's
            // increased.
            if (strand_count > 0) {
                t_stpkey s(sptidx, pkey);
                new_idx_pkey.insert(s);
            }

            if (strand_count < 0) {
                remove_pkey(sptidx, pkey);
            }
        }
    }
}

void
t_stree::update_shape_from_static(const t_dtree_ctx& ctx) {

    m_newids.clear();
    m_newleaves.clear();
    m_tree_unification_records.clear();

    const std::shared_ptr<const t_column> scount =
        ctx.get_aggtable().get_const_column("psp_strand_count_sum");

    const t_dtree& dtree = ctx.get_tree();

    // map dptidx to sptidx
    std::map<t_uindex, t_uindex> nmap;
    nmap[0] = 0;

    t_filter filter;

    // update root
    auto root_iter = m_nodes->get<by_idx>().find(0);
    auto root_node = *root_iter;

    // scount = summed strand count
    t_index root_nstrands =
        *(scount->get_nth<t_index>(0)) + root_node.m_nstrands;
    root_node.set_nstrands(std::max(root_nstrands, (t_index)1));
    m_nodes->get<by_idx>().replace(root_iter, root_node);

    t_tree_unify_rec unif_rec(0, 0, 0, root_nstrands);
    m_tree_unification_records.push_back(unif_rec);

    t_idxpkey new_idx_pkey;

    for (auto dptidx : dtree.dfs()) {
        t_uindex sptidx = 0;
        t_depth ndepth = dtree.get_depth(dptidx);

        if (dptidx == 0) {
            populate_pkey_idx(ctx, dtree, dptidx, sptidx, ndepth, new_idx_pkey);
            continue;
        }

        t_uindex p_dptidx = dtree.get_parent(dptidx);
        t_uindex p_sptidx = nmap[p_dptidx];

        t_tscalar value =
            m_symtable.get_interned_tscalar(dtree.get_value(filter, dptidx));

        t_tscalar sortby_value = m_symtable.get_interned_tscalar(
            dtree.get_sortby_value(filter, dptidx)
        );

        t_uindex src_ridx = dptidx;

        auto iter =
            m_nodes->get<by_pidx_hash>().find(std::make_tuple(p_sptidx, value));

        auto nstrands = *(scount->get_nth<std::int64_t>(dptidx));

        if (iter == m_nodes->get<by_pidx_hash>().end() && nstrands < 0) {
            continue;
        }

        if (iter == m_nodes->get<by_pidx_hash>().end()) {
            // create node and enqueue
            sptidx = genidx();
            t_uindex aggsize = m_aggregates->size();
            if (sptidx == aggsize) {
                double scale = 1.3;
                t_uindex new_size = scale * aggsize;
                m_aggregates->extend(new_size);
            }

            t_uindex dst_ridx = gen_aggidx();

            t_tnode node(
                sptidx,
                p_sptidx,
                value,
                ndepth,
                sortby_value,
                nstrands,
                dst_ridx
            );

            m_newids.insert(sptidx);

            if (ndepth == dtree.last_level()) {
                m_newleaves.insert(sptidx);
            }

            auto insert_pair = m_nodes->insert(node);
            if (!insert_pair.second) {
                auto failed_because = *(insert_pair.first);
                std::cout << "failed because of " << failed_because << '\n';
            }
            PSP_VERBOSE_ASSERT(insert_pair.second, "Failed to insert node");
            t_tree_unify_rec unif_rec(sptidx, src_ridx, dst_ridx, nstrands);
            m_tree_unification_records.push_back(unif_rec);
        } else {
            sptidx = iter->m_idx;

            // update node
            t_tnode node = *iter;
            node.set_sort_value(sortby_value);

            t_uindex dst_ridx = node.m_aggidx;

            nstrands = node.m_nstrands + nstrands;

            t_tree_unify_rec unif_rec(sptidx, src_ridx, dst_ridx, nstrands);
            m_tree_unification_records.push_back(unif_rec);

            sptidx = iter->m_idx;
            node.set_nstrands(nstrands);
            PSP_VERBOSE_ASSERT(
                m_nodes->get<by_pidx_hash>().replace(iter, node),
                ,
                "Failed to replace"
            ); // middle argument ignored
        }

        populate_pkey_idx(ctx, dtree, dptidx, sptidx, ndepth, new_idx_pkey);
        nmap[dptidx] = sptidx;
    }

    auto biter = new_idx_pkey.get<by_idx_pkey>().begin();
    auto eiter = new_idx_pkey.get<by_idx_pkey>().end();

    for (auto iter = biter; iter != eiter; ++iter) {
        t_stpkey s(iter->m_idx, iter->m_pkey);
        m_idxpkey->insert(s);
    }

    mark_zero_desc();
}

void
t_stree::mark_zero_desc() {
    auto zeros = zero_strands();
    std::set<t_uindex> z_desc;

    for (auto z : zeros) {
        auto d = get_descendents(z);
        std::copy(d.begin(), d.end(), std::inserter(z_desc, z_desc.end()));
    }

    for (auto n : z_desc) {
        auto iter = m_nodes->get<by_idx>().find(n);
        auto node = *iter;
        node.set_nstrands(0);
        m_nodes->get<by_idx>().replace(iter, node);
    }
}

void
t_stree::update_aggs_from_static(
    const t_dtree_ctx& ctx,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
) {
    const t_data_table& src_aggtable = ctx.get_aggtable();

    t_agg_update_info agg_update_info;
    t_schema aggschema = m_aggregates->get_schema();

    for (const auto& colname : aggschema.m_columns) {
        agg_update_info.m_src.push_back(
            src_aggtable.get_const_column(colname).get()
        );
        agg_update_info.m_dst.push_back(m_aggregates->get_column(colname).get()
        );
        agg_update_info.m_aggspecs.push_back(ctx.get_aggspec(colname));
    }

    auto is_col_scaled_aggregate = [&](int col_idx) -> bool {
        int agg_type = agg_update_info.m_aggspecs[col_idx].agg();

        return agg_type == AGGTYPE_SCALED_DIV || agg_type == AGGTYPE_SCALED_ADD
            || agg_type == AGGTYPE_SCALED_MUL;
    };

    size_t col_cnt = aggschema.m_columns.size();
    auto& cols_topo_sorted = agg_update_info.m_dst_topo_sorted;
    cols_topo_sorted.clear();
    cols_topo_sorted.reserve(col_cnt);

    static bool const enable_aggregate_reordering = true;
    static bool const enable_fix_double_calculation = true;

    tsl::hopscotch_set<t_column*> dst_visited;
    auto push_column = [&](size_t idx) {
        if (enable_fix_double_calculation) {
            t_column* dst = agg_update_info.m_dst[idx];
            if (dst_visited.find(dst) != dst_visited.end()) {
                return;
            }
            dst_visited.insert(dst);
        }
        cols_topo_sorted.push_back(idx);
    };

    if (enable_aggregate_reordering) {
        // Move scaled agg columns to the end
        // This does not handle case where scaled aggregate depends on other
        // scaled aggregate ( not sure if that is possible )
        for (size_t i = 0; i < col_cnt; ++i) {
            if (!is_col_scaled_aggregate(i)) {
                push_column(i);
            }
        }
        for (size_t i = 0; i < col_cnt; ++i) {
            if (is_col_scaled_aggregate(i)) {
                push_column(i);
            }
        }
    } else {
        // If backed out, use same column order as before ( not topo sorted )
        for (size_t i = 0; i < col_cnt; ++i) {
            push_column(i);
        }
    }

    for (const auto& r : m_tree_unification_records) {
        if (!node_exists(r.m_sptidx)) {
            continue;
        }

        update_agg_table(
            r.m_sptidx,
            agg_update_info,
            r.m_daggidx,
            r.m_saggidx,
            r.m_nstrands,
            gstate,
            expression_master_table
        );
    }
}

t_uindex
t_stree::genidx() {
    return m_curidx++;
}

std::vector<t_uindex>
t_stree::get_children(t_uindex idx) const {
    t_by_pidx_ipair iterators = m_nodes->get<by_pidx>().equal_range(idx);

    t_uindex nchild = std::distance(iterators.first, iterators.second);

    std::vector<t_uindex> temp(nchild);

    t_index count = 0;
    for (iter_by_pidx iter = iterators.first; iter != iterators.second;
         ++iter) {
        temp[count] = iter->m_idx;
        ++count;
    }
    return temp;
}

t_uindex
t_stree::size() const {
    return m_nodes->size();
}

void
t_stree::get_child_nodes(t_uindex idx, t_tnodevec& nodes) const {
    t_index num_children = get_num_children(idx);
    t_tnodevec temp(num_children);
    auto iterators = m_nodes->get<by_pidx>().equal_range(idx);
    std::copy(iterators.first, iterators.second, temp.begin());
    std::swap(nodes, temp);
}

t_uindex
t_stree::get_num_children(t_uindex ptidx) const {
    auto iterators = m_nodes->get<by_pidx>().equal_range(ptidx);
    return std::distance(iterators.first, iterators.second);
}

t_uindex
t_stree::gen_aggidx() {
    if (!m_agg_freelist.empty()) {
        t_uindex rval = m_agg_freelist.back();
        m_agg_freelist.pop_back();
        return rval;
    }

    t_uindex cur_cap = m_aggregates->size();
    t_uindex rval = m_cur_aggidx;
    ++m_cur_aggidx;
    if (rval >= cur_cap) {
        double nrows = ceil(.3 * double(rval));
        m_aggregates->extend(static_cast<t_uindex>(nrows));
    }

    return rval;
}

void
t_stree::update_agg_table(
    t_uindex nidx,
    t_agg_update_info& info,
    t_uindex src_ridx,
    t_uindex dst_ridx,
    t_index nstrands,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
) {
    const t_schema& expression_schema = expression_master_table.get_schema();

    for (t_uindex idx : info.m_dst_topo_sorted) {
        const t_column* src = info.m_src[idx];
        t_column* dst = info.m_dst[idx];
        const t_aggspec& spec = info.m_aggspecs[idx];
        t_tscalar new_value = mknone();
        t_tscalar old_value = mknone();
        auto is_expr =
            expression_schema.has_column(spec.get_dependencies()[0].name());

        switch (spec.agg()) {
            case AGGTYPE_PCT_SUM_PARENT:
            case AGGTYPE_PCT_SUM_GRAND_TOTAL:
            case AGGTYPE_SUM: {
                t_tscalar src_scalar = src->get_scalar(src_ridx);
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);
                old_value.set(dst_scalar);

                // is_nan returns false for non-float types
                if (is_expr || old_value.is_nan()) {

                    // if we previously had a NaN, add can't make it finite
                    // again; recalculate entire sum in case it is now finite
                    auto pkeys = get_pkeys(nidx);
                    new_value.set(
                        reduce_from_gstate<
                            std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                            gstate,
                            expression_master_table,
                            spec.get_dependencies()[0].name(),
                            pkeys,
                            [&](std::vector<t_tscalar>& values) {
                                if (values.empty()) {
                                    return mknone();
                                }

                                t_tscalar rval;
                                rval.set(std::uint64_t(0));
                                rval.m_type = dst->get_dtype();
                                for (const auto& v : values) {
                                    if (v.is_nan()) {
                                        continue;
                                    }

                                    rval = rval.add(
                                        v.coerce_numeric_dtype(dst->get_dtype())
                                    );
                                }

                                return rval;
                            }
                        )
                    );
                } else {
                    new_value.set(dst_scalar.add(src_scalar));
                }

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_COUNT: {
                if (nidx == 0) {
                    new_value.set(nstrands - 1);
                } else {
                    new_value.set(nstrands);
                }

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_MEAN: {
                auto pkeys = get_pkeys(nidx);
                std::vector<double> values;

                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values,
                    false
                );

                auto nr =
                    std::accumulate(values.begin(), values.end(), double(0));
                double dr = values.size();

                auto* dst_pair =
                    dst->get_nth<std::pair<double, double>>(dst_ridx);

                old_value.set(dst_pair->first / dst_pair->second);

                dst_pair->first = nr;
                dst_pair->second = dr;

                dst->set_valid(dst_ridx, true);

                new_value.set(nr / dr);
            } break;
            case AGGTYPE_WEIGHTED_MEAN: {
                auto pkeys = get_pkeys(nidx);

                double nr = 0;
                double dr = 0;
                std::vector<t_tscalar> values;
                std::vector<t_tscalar> weights;

                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values
                );

                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[1].name(),
                    pkeys,
                    weights
                );

                auto weights_it = weights.begin();
                auto values_it = values.begin();

                for (; weights_it != weights.end() && values_it != values.end();
                     ++weights_it, ++values_it) {
                    if (weights_it->is_valid() && values_it->is_valid()
                        && !weights_it->is_nan() && !values_it->is_nan()) {
                        nr += weights_it->to_double() * values_it->to_double();
                        dr += weights_it->to_double();
                    }
                }

                auto* dst_pair =
                    dst->get_nth<std::pair<double, double>>(dst_ridx);
                old_value.set(dst_pair->first / dst_pair->second);

                dst_pair->first = nr;
                dst_pair->second = dr;

                bool valid = (dr != 0);
                dst->set_valid(dst_ridx, valid);
                new_value.set(nr / dr);
            } break;
            case AGGTYPE_UNIQUE: {
                auto pkeys = get_pkeys(nidx);
                old_value.set(dst->get_scalar(dst_ridx));

                bool is_unique = is_unique_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    new_value
                );

                if (new_value.m_type == DTYPE_STR) {
                    if (is_unique) {
                        new_value = m_symtable.get_interned_tscalar(new_value);
                        dst->set_scalar(dst_ridx, new_value);
                    } else {
                        // set the row to invalid but don't set new = old
                        // because we need to unintern strings over and over
                        // again if we set new = old.
                        dst->set_valid(dst_ridx, false);
                    }
                } else {
                    if (is_unique) {
                        dst->set_scalar(dst_ridx, new_value);
                    } else {
                        dst->set_valid(dst_ridx, false);
                        new_value = old_value;
                    }
                }
            } break;
            case AGGTYPE_OR:
            case AGGTYPE_ANY: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                apply_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    new_value,
                    [](const t_tscalar& row_value, t_tscalar& output) {
                        if (row_value.as_bool()) {
                            output.set(row_value);
                            return true;
                        }
                        return false;
                    }
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_Q1: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);
                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [&](std::vector<t_tscalar>& values) {
                            return get_aggregate_median(values, 0.25);
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_Q3: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);
                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [&](std::vector<t_tscalar>& values) {
                            return get_aggregate_median(values, 0.75);
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_MEDIAN: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [&](std::vector<t_tscalar>& values) {
                            return get_aggregate_median(values, 0.5);
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_JOIN: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [this](std::vector<t_tscalar>& values) {
                            std::set<t_tscalar> vset;
                            for (const auto& v : values) {
                                vset.insert(v);
                            }

                            std::stringstream ss;
                            t_uindex str_size = 0;
                            for (auto iter = vset.begin(); iter != vset.end();
                                 ++iter) {

                                auto st = iter->to_string();
                                auto next_len = st.size();
                                if (next_len + str_size > MAX_JOIN_SIZE) {
                                    break;
                                }

                                if (iter != vset.begin()) {
                                    str_size += 2;
                                    ss << ", ";
                                }

                                str_size += next_len;
                                ss << st;
                            }
                            return m_symtable.get_interned_tscalar(
                                ss.str().c_str()
                            );
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_SCALED_DIV: {
                const t_column* src_1 = info.m_dst[spec.get_agg_one_idx()];
                const t_column* src_2 = info.m_dst[spec.get_agg_two_idx()];

                t_column* dst = info.m_dst[idx];
                old_value.set(dst->get_scalar(dst_ridx));

                double agg1 = src_1->get_scalar(dst_ridx).to_double();
                double agg2 = src_2->get_scalar(dst_ridx).to_double();

                double w1 = spec.get_agg_one_weight();
                double w2 = spec.get_agg_two_weight();

                double v = (agg1 * w1) / (agg2 * w2);

                new_value.set(v);
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_SCALED_ADD: {

                const t_column* src_1 = info.m_dst[spec.get_agg_one_idx()];
                const t_column* src_2 = info.m_dst[spec.get_agg_two_idx()];

                t_column* dst = info.m_dst[idx];
                old_value.set(dst->get_scalar(dst_ridx));

                double v = (src_1->get_scalar(dst_ridx).to_double()
                            * spec.get_agg_one_weight())
                    + (src_2->get_scalar(dst_ridx).to_double()
                       * spec.get_agg_two_weight());

                new_value.set(v);
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_SCALED_MUL: {
                const t_column* src_1 = info.m_dst[spec.get_agg_one_idx()];
                const t_column* src_2 = info.m_dst[spec.get_agg_two_idx()];

                t_column* dst = info.m_dst[idx];
                old_value.set(dst->get_scalar(dst_ridx));

                double v = (src_1->get_scalar(dst_ridx).to_double()
                            * spec.get_agg_one_weight())
                    * (src_2->get_scalar(dst_ridx).to_double()
                       * spec.get_agg_two_weight());

                new_value.set(v);
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_DOMINANT: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [](std::vector<t_tscalar>& values) {
                            return get_dominant(values);
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_FIRST: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pair = first_last_helper(
                    nidx, spec, gstate, expression_master_table
                );
                new_value.set(pair.first);
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_LAST_BY_INDEX: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pair = first_last_helper(
                    nidx, spec, gstate, expression_master_table
                );
                new_value.set(pair.second);
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_LAST_MINUS_FIRST: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pair = (first_last_helper(
                    nidx, spec, gstate, expression_master_table
                ));
                new_value.set(pair.second.sub_typesafe(pair.first));
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_AND: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [](std::vector<t_tscalar>& values) {
                            t_tscalar rval;
                            rval.set(true);

                            for (const auto& v : values) {
                                if (!v.as_bool()) {
                                    rval.set(false);
                                    break;
                                }
                            }
                            return rval;
                        }
                    )
                );
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_LAST_VALUE: {
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);
                old_value.set(dst_scalar);
                t_uindex leaf;
                if (is_leaf(nidx)) {
                    leaf = nidx;
                } else {
                    auto iters =
                        m_idxleaf->get<by_idx_lfidx>().equal_range(nidx);
                    if (iters.first != iters.second) {
                        leaf = (--iters.second)->m_lfidx;
                    } else {
                        dst->set_scalar(dst_ridx, mknone());
                        break;
                    }
                }

                auto iters = m_idxpkey->get<by_idx_pkey>().equal_range(leaf);
                if (iters.first != iters.second) {
                    t_tscalar pkey = (--iters.second)->m_pkey;

                    dst->set_scalar(
                        dst_ridx,
                        read_by_pkey_from_gstate(
                            gstate,
                            expression_master_table,
                            spec.get_dependencies()[0].name(),
                            pkey
                        )
                    );
                } else {
                    dst->set_scalar(dst_ridx, mknone());
                }
            } break;
            case AGGTYPE_MAX: {
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);
                old_value.set(dst_scalar);
                auto pkeys = get_pkeys(nidx);
                if (pkeys.empty()) {
                    dst->set_scalar(dst_ridx, new_value);
                    break;
                }

                std::vector<t_tscalar> values;
                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values
                );

                new_value.set(*std::max_element(values.begin(), values.end()));
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_MAX_BY: {
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);
                old_value.set(dst_scalar);
                auto pkeys = get_pkeys(nidx);
                if (pkeys.empty()) {
                    dst->set_scalar(dst_ridx, new_value);
                    break;
                }

                std::vector<t_tscalar> values;
                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[1].name(),
                    pkeys,
                    values
                );

                const auto max_row_idx = std::distance(
                    values.begin(),
                    std::max_element(values.begin(), values.end())
                );

                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values
                );

                new_value.set(values.at(max_row_idx));
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_MIN: {
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);
                old_value.set(dst_scalar);
                auto pkeys = get_pkeys(nidx);
                if (pkeys.empty()) {
                    dst->set_scalar(dst_ridx, new_value);
                    break;
                }

                std::vector<t_tscalar> values;
                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values
                );

                new_value.set(*std::min_element(values.begin(), values.end()));
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_MIN_BY: {
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);
                old_value.set(dst_scalar);
                auto pkeys = get_pkeys(nidx);
                if (pkeys.empty()) {
                    dst->set_scalar(dst_ridx, new_value);
                    break;
                }

                std::vector<t_tscalar> values;
                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[1].name(),
                    pkeys,
                    values
                );

                const auto min_row_idx = std::distance(
                    values.begin(),
                    std::min_element(values.begin(), values.end())
                );

                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values
                );

                new_value.set(values.at(min_row_idx));
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_HIGH_WATER_MARK: {
                t_tscalar src_scalar = src->get_scalar(src_ridx);
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);

                old_value.set(dst_scalar);
                new_value.set(src_scalar);

                if (dst_scalar.is_valid()) {
                    new_value.set(std::max(dst_scalar, src_scalar));
                }

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_LOW_WATER_MARK: {
                t_tscalar src_scalar = src->get_scalar(src_ridx);
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);

                old_value.set(dst_scalar);
                new_value.set(src_scalar);

                if (dst_scalar.is_valid()) {
                    new_value.set(std::min(dst_scalar, src_scalar));
                }
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_HIGH_MINUS_LOW: {
                t_tscalar dst_scalar = dst->get_scalar(dst_ridx);
                old_value.set(dst_scalar);
                auto pkeys = get_pkeys(nidx);
                std::vector<t_tscalar> values;
                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values
                );
                auto low_high =
                    std::minmax_element(values.begin(), values.end());
                t_tscalar first;
                first.set(*(low_high.first));
                t_tscalar second;
                second.set(*(low_high.second));
                new_value.set(second.sub_typesafe(first));
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_UDF_COMBINER:
            case AGGTYPE_UDF_REDUCER: {
                // these will be filled in later
            } break;
            case AGGTYPE_SUM_NOT_NULL: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [](std::vector<t_tscalar>& values) {
                            if (values.empty()) {
                                return mknone();
                            }

                            t_tscalar rval;
                            rval.set(std::uint64_t(0));
                            rval.m_type = values[0].m_type;

                            for (const auto& v : values) {
                                if (v.is_nan()) {
                                    continue;
                                }
                                rval = rval.add(v);
                            }

                            return rval;
                        }
                    )
                );
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_SUM_ABS: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [](std::vector<t_tscalar>& values) {
                            if (values.empty()) {
                                return mknone();
                            }

                            t_tscalar rval;
                            rval.set(std::uint64_t(0));
                            rval.m_type = values[0].m_type;
                            for (const auto& v : values) {
                                rval = rval.add(v.abs());
                            }
                            return rval;
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_ABS_SUM: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);
                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [](std::vector<t_tscalar>& values) {
                            if (values.empty()) {
                                return mknone();
                            }
                            t_tscalar rval;
                            rval.set(std::uint64_t(0));
                            rval.m_type = values[0].m_type;
                            for (const auto& v : values) {
                                rval = rval.add(v);
                            }
                            return rval.abs();
                        }
                    )
                );
                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_MUL: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);
                new_value.set(
                    reduce_from_gstate<
                        std::function<t_tscalar(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [](std::vector<t_tscalar>& values) {
                            if (values.empty()) {
                                return t_tscalar();
                            }
                            if (values.size() == 1) {
                                return values[0];
                            }
                            t_tscalar v = values[0];
                            for (t_uindex vidx = 1, vloop_end = values.size();
                                 vidx < vloop_end;
                                 ++vidx) {
                                v = v.mul(values[vidx]);
                            }
                            return v;
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_DISTINCT_COUNT: {
                old_value.set(dst->get_scalar(dst_ridx));
                auto pkeys = get_pkeys(nidx);

                new_value.set(
                    reduce_from_gstate<
                        std::function<std::uint32_t(std::vector<t_tscalar>&)>>(
                        gstate,
                        expression_master_table,
                        spec.get_dependencies()[0].name(),
                        pkeys,
                        [](std::vector<t_tscalar>& values) {
                            tsl::hopscotch_set<t_tscalar> vset;
                            for (const auto& v : values) {
                                vset.insert(v);
                            }
                            std::uint32_t rv = vset.size();
                            return rv;
                        }
                    )
                );

                dst->set_scalar(dst_ridx, new_value);
            } break;
            case AGGTYPE_DISTINCT_LEAF: {
                auto pkeys = get_pkeys(nidx);
                old_value.set(dst->get_scalar(dst_ridx));
                bool skip = false;
                bool is_unique = is_unique_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    new_value
                );

                if (is_leaf(nidx) && is_unique) {
                    if (new_value.m_type == DTYPE_STR) {
                        new_value = m_symtable.get_interned_tscalar(new_value);
                    }
                } else {
                    if (new_value.m_type == DTYPE_STR) {
                        new_value = m_symtable.get_interned_tscalar("");
                    } else {
                        dst->set_valid(dst_ridx, false);
                        new_value = old_value;
                        skip = true;
                    }
                }
                if (!skip) {
                    dst->set_scalar(dst_ridx, new_value);
                }
            } break;
            case AGGTYPE_VARIANCE:
            case AGGTYPE_STANDARD_DEVIATION: {
                old_value.set(dst->get_scalar(dst_ridx));

                auto pkeys = get_pkeys(nidx);
                std::vector<double> values;

                read_column_from_gstate(
                    gstate,
                    expression_master_table,
                    spec.get_dependencies()[0].name(),
                    pkeys,
                    values,
                    false
                );

                // Calculate the count, rolling mean, and sum of squares of
                // differences from the current mean at each iteration.
                double count = 0;
                double mean = 0;
                double m2 = 0;

                for (double num : values) {
                    count++;
                    double next_mean = mean + (num - mean) / count;
                    m2 += (num - mean) * (num - next_mean);
                    mean = next_mean;
                }

                // Only calculate stddev for more than 1 element in the group.
                if (count >= 2) {
                    double value = m2 / count;

                    if (spec.agg() == AGGTYPE_STANDARD_DEVIATION) {
                        value = std::sqrt(value);
                    }

                    new_value.set(value);
                    dst->set_scalar(dst_ridx, new_value);
                    dst->set_valid(dst_ridx, true);
                } else {
                    dst->set_valid(dst_ridx, false);
                }

            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Not implemented");
            }
        } // end switch

        bool val_neq = old_value != new_value;

        m_has_delta = m_has_delta || val_neq;
        bool deltas_enabled = m_features.at(CTX_FEAT_DELTA);
        if (deltas_enabled && val_neq) {
            m_deltas->insert(t_tcdelta(nidx, idx, old_value, new_value));
        }

    } // end for
}

std::vector<t_uindex>
t_stree::zero_strands() const {
    auto iterators = m_nodes->get<by_nstrands>().equal_range(0);
    std::vector<t_uindex> rval;

    for (auto& iter = iterators.first; iter != iterators.second; ++iter) {
        rval.push_back(iter->m_idx);
    }
    return rval;
}

std::set<t_uindex>
t_stree::non_zero_leaves(const std::vector<t_uindex>& zero_strands) const {
    return non_zero_ids(m_newleaves, zero_strands);
}

std::set<t_uindex>
t_stree::non_zero_ids(const std::vector<t_uindex>& zero_strands) const {
    return non_zero_ids(m_newids, zero_strands);
}

std::set<t_uindex>
t_stree::non_zero_ids(
    const std::set<t_uindex>& ptiset, const std::vector<t_uindex>& zero_strands
) const {
    std::set<t_uindex> zeroset;
    for (auto idx : zero_strands) {
        zeroset.insert(idx);
    }

    std::set<t_uindex> rval;

    for (const auto& newid : ptiset) {
        if (zeroset.find(newid) == zeroset.end()) {
            rval.insert(newid);
        }
    }

    return rval;
}

t_uindex
t_stree::get_parent_idx(t_uindex ptidx) const {
    iter_by_idx iter = m_nodes->get<by_idx>().find(ptidx);
    if (iter == m_nodes->get<by_idx>().end()) {
        std::cout << "Failed in tree => " << repr() << '\n';
        PSP_VERBOSE_ASSERT(false, "Did not find node");
    }
    return iter->m_pidx;
}

std::vector<t_uindex>
t_stree::get_ancestry(t_uindex idx) const {
    t_uindex rpidx = root_pidx();
    std::vector<t_uindex> rval;

    while (idx != rpidx) {
        rval.push_back(idx);
        idx = get_parent_idx(idx);
    }

    std::reverse(rval.begin(), rval.end());
    return rval;
}

t_index
t_stree::get_sibling_idx(t_index p_ptidx, t_index p_nchild, t_uindex c_ptidx)
    const {
    t_by_pidx_ipair iterators = m_nodes->get<by_pidx>().equal_range(p_ptidx);
    iter_by_pidx c_iter =
        m_nodes->project<by_pidx>(m_nodes->get<by_idx>().find(c_ptidx));
    return std::distance(iterators.first, c_iter);
}

t_uindex
t_stree::get_aggidx(t_uindex idx) const {
    iter_by_idx iter = m_nodes->get<by_idx>().find(idx);
    PSP_VERBOSE_ASSERT(
        iter != m_nodes->get<by_idx>().end(), "Failed in get_aggidx"
    );
    return iter->m_aggidx;
}

std::shared_ptr<const t_data_table>
t_stree::get_aggtable() const {
    return m_aggregates;
}

t_data_table*
t_stree::_get_aggtable() {
    return m_aggregates.get();
}

t_stree::t_tnode
t_stree::get_node(t_uindex idx) const {
    iter_by_idx iter = m_nodes->get<by_idx>().find(idx);
    PSP_VERBOSE_ASSERT(
        iter != m_nodes->get<by_idx>().end(), "Failed in get_node"
    );
    return *iter;
}

void
t_stree::get_path(t_uindex idx, std::vector<t_tscalar>& rval) const {
    t_uindex curidx = idx;

    if (curidx == 0) {
        return;
    }

    while (1) {
        iter_by_idx iter = m_nodes->get<by_idx>().find(curidx);
        rval.push_back(iter->m_value);
        curidx = iter->m_pidx;
        if (curidx == 0) {
            break;
        }
    }
}

t_uindex
t_stree::resolve_child(t_uindex root, const t_tscalar& datum) const {
    auto iter = m_nodes->get<by_pidx_hash>().find(std::make_tuple(root, datum));

    if (iter == m_nodes->get<by_pidx_hash>().end()) {
        return INVALID_INDEX;
    }

    return iter->m_idx;
}

void
t_stree::clear_aggregates(const std::vector<t_uindex>& indices) {
    auto cols = m_aggregates->get_columns();
    for (auto* c : cols) {
        for (auto aggidx : indices) {
            c->set_valid(aggidx, false);
        }
    }

    m_agg_freelist.insert(
        std::end(m_agg_freelist), std::begin(indices), std::end(indices)
    );
}

void
t_stree::drop_zero_strands() {
    auto iterators = m_nodes->get<by_nstrands>().equal_range(0);

    std::vector<t_uindex> leaves;

    auto lst = last_level();

    std::vector<t_uindex> node_ids;

    for (auto iter = iterators.first; iter != iterators.second; ++iter) {
        if (iter->m_depth == lst) {
            leaves.push_back(iter->m_idx);
        }
        node_ids.push_back(iter->m_aggidx);
    }

    clear_aggregates(node_ids);

    for (auto nidx : leaves) {
        auto ancestry = get_ancestry(nidx);

        for (auto ancidx : ancestry) {
            if (ancidx == nidx) {
                continue;
            }
            remove_leaf(ancidx, nidx);
        }
    }

    auto iterators2 = m_nodes->get<by_nstrands>().equal_range(0);

    m_nodes->get<by_nstrands>().erase(iterators2.first, iterators2.second);
}

void
t_stree::add_pkey(t_uindex idx, t_tscalar pkey) {
    t_stpkey s(idx, pkey);
    m_idxpkey->insert(s);
}

void
t_stree::remove_pkey(t_uindex idx, t_tscalar pkey) {
    auto iter = m_idxpkey->get<by_idx_pkey>().find(std::make_tuple(idx, pkey));

    if (iter == m_idxpkey->get<by_idx_pkey>().end()) {
        return;
    }

    m_idxpkey->get<by_idx_pkey>().erase(iter);
}

void
t_stree::add_leaf(t_uindex nidx, t_uindex lfidx) {
    t_stleaves s(nidx, lfidx);
    m_idxleaf->insert(s);
}

void
t_stree::remove_leaf(t_uindex nidx, t_uindex lfidx) {
    auto iter =
        m_idxleaf->get<by_idx_lfidx>().find(std::make_tuple(nidx, lfidx));

    if (iter == m_idxleaf->get<by_idx_lfidx>().end()) {
        return;
    }

    m_idxleaf->get<by_idx_lfidx>().erase(iter);
}

t_by_idx_pkey_ipair
t_stree::get_pkeys_for_leaf(t_uindex idx) const {
    return m_idxpkey->get<by_idx_pkey>().equal_range(idx);
}

std::vector<t_tscalar>
t_stree::get_pkeys(t_uindex idx) const {
    std::vector<t_tscalar> rval;
    std::vector<t_uindex> leaves = get_leaves(idx);

    for (auto leaf : leaves) {
        auto iters = get_pkeys_for_leaf(leaf);
        for (auto iter = iters.first; iter != iters.second; ++iter) {
            rval.push_back(iter->m_pkey);
        }
    }
    return rval;
}

std::vector<t_uindex>
t_stree::get_leaves(t_uindex idx) const {
    std::vector<t_uindex> rval;

    if (is_leaf(idx)) {
        rval.push_back(idx);
        return rval;
    }

    auto iters = m_idxleaf->get<by_idx_lfidx>().equal_range(idx);
    for (auto iter = iters.first; iter != iters.second; ++iter) {
        rval.push_back(iter->m_lfidx);
    }
    return rval;
}

t_depth
t_stree::get_depth(t_uindex ptidx) const {
    auto iter = m_nodes->get<by_idx>().find(ptidx);
    return iter->m_depth;
}

void
t_stree::get_drd_indices(
    t_uindex ridx, t_depth rel_depth, std::vector<t_uindex>& leaves
) const {
    std::vector<std::pair<t_index, t_index>> pending;

    if (rel_depth == 0) {
        leaves.push_back(ridx);
        return;
    }

    t_depth rdepth = get_depth(ridx);
    t_depth edepth = rdepth + rel_depth;

    pending.emplace_back(ridx, rdepth);

    while (!pending.empty()) {
        std::pair<t_index, t_index> head = pending.back();
        pending.pop_back();

        if (head.second == edepth - 1) {
            auto children = get_child_idx(head.first);
            std::copy(
                children.begin(), children.end(), std::back_inserter(leaves)
            );
        } else {
            auto children = get_child_idx_depth(head.first);
            std::copy(
                children.begin(), children.end(), std::back_inserter(pending)
            );
        }
    }
}

std::vector<t_uindex>
t_stree::get_child_idx(t_uindex idx) const {
    t_index num_children = get_num_children(idx);
    std::vector<t_uindex> children(num_children);
    auto iterators = m_nodes->get<by_pidx>().equal_range(idx);
    t_index count = 0;
    while (iterators.first != iterators.second) {
        children[count] = iterators.first->m_idx;
        ++count;
        ++iterators.first;
    }
    return children;
}

std::vector<std::pair<t_index, t_index>>
t_stree::get_child_idx_depth(t_uindex idx) const {
    t_index num_children = get_num_children(idx);
    std::vector<std::pair<t_index, t_index>> children(num_children);
    auto iterators = m_nodes->get<by_pidx>().equal_range(idx);
    t_index count = 0;
    while (iterators.first != iterators.second) {
        children[count] = std::pair<t_index, t_index>(
            iterators.first->m_idx, iterators.first->m_depth
        );
        ++count;
        ++iterators.first;
    }
    return children;
}

void
t_stree::populate_leaf_index(const std::set<t_uindex>& leaves) {
    for (auto nidx : leaves) {
        std::vector<t_uindex> ancestry = get_ancestry(nidx);

        for (auto ancidx : ancestry) {
            if (ancidx == nidx) {
                continue;
            }

            add_leaf(ancidx, nidx);
        }
    }
}

t_uindex
t_stree::last_level() const {
    return m_pivots.size();
}

bool
t_stree::is_leaf(t_uindex nidx) const {
    auto iter = m_nodes->get<by_idx>().find(nidx);
    PSP_VERBOSE_ASSERT(
        iter != m_nodes->get<by_idx>().end(), "Did not find node"
    );
    return iter->m_depth == last_level();
}

std::vector<t_uindex>
t_stree::get_descendents(t_uindex nidx) const {
    std::vector<t_uindex> rval;

    std::vector<t_uindex> queue;
    queue.push_back(nidx);

    while (!queue.empty()) {
        auto h = queue.back();
        queue.pop_back();
        auto children = get_children(h);
        queue.insert(std::end(queue), std::begin(children), std::end(children));
        rval.insert(std::end(rval), std::begin(children), std::end(children));
    }

    return rval;
}

const std::vector<t_pivot>&
t_stree::get_pivots() const {
    return m_pivots;
}

t_index
t_stree::resolve_path(t_uindex root, const std::vector<t_tscalar>& path) const {
    t_index curidx = root;

    if (path.empty()) {
        return curidx;
    }

    for (t_index i = path.size() - 1; i >= 0; i--) {
        iter_by_pidx_hash iter =
            m_nodes->get<by_pidx_hash>().find(std::make_tuple(curidx, path[i]));
        if (iter == m_nodes->get<by_pidx_hash>().end()) {
            return INVALID_INDEX;
        }
        curidx = iter->m_idx;
    }

    return curidx;
}

// aggregates should be presized to be same size
// as agg_indices
void
t_stree::get_aggregates_for_sorting(
    t_uindex nidx,
    const std::vector<t_index>& agg_indices,
    std::vector<t_tscalar>& aggregates,
    t_ctx2* ctx2
) const {
    t_uindex aggidx = get_aggidx(nidx);
    for (t_uindex idx = 0, loop_end = agg_indices.size(); idx < loop_end;
         ++idx) {
        auto which_agg = agg_indices[idx];
        if (which_agg < 0) {
            aggregates[idx] = get_sortby_value(nidx);
        } else if ((ctx2 != nullptr) || (size_t(which_agg) >= m_aggcols.size())) {
            aggregates[idx].set(t_none());
            if (ctx2 != nullptr) {
                if ((ctx2->get_config().get_totals() == TOTALS_BEFORE)
                    && (size_t(which_agg) < m_aggcols.size())) {
                    aggregates[idx] = m_aggcols[which_agg]->get_scalar(aggidx);
                    continue;
                }

                // two sided pivoted column
                // we don't have enough information here to work out the shape
                // of the data so we have to use ctx2 to resolve

                // fetch the row/column path from ctx2
                std::vector<t_tscalar> col_path =
                    ctx2->get_column_path_userspace(which_agg + 1);
                if (col_path.empty()) {
                    if (ctx2->get_config().get_totals() == TOTALS_AFTER) {
                        aggregates[idx] =
                            m_aggcols[which_agg % m_aggcols.size()]->get_scalar(
                                aggidx
                            );
                    }
                    continue;
                }

                std::vector<t_tscalar> row_path;
                get_path(nidx, row_path);

                auto* target_tree = ctx2->get_trees()[get_node(nidx).m_depth];
                t_index target = target_tree->resolve_path(0, row_path);
                if (target != INVALID_INDEX) {
                    target = target_tree->resolve_path(target, col_path);
                }
                if (target != INVALID_INDEX) {
                    aggregates[idx] = target_tree->get_aggregate(
                        target, which_agg % m_aggcols.size()
                    );
                }
            }
        } else {
            aggregates[idx] = m_aggcols[which_agg]->get_scalar(aggidx);
        }
    }
}

t_tscalar
t_stree::get_aggregate(t_index idx, t_index aggnum) const {
    if (aggnum < 0) {
        return get_value(idx);
    }

    auto aggtable = get_aggtable();
    const auto* c = aggtable->get_const_column(aggnum).get();
    auto agg_ridx = get_aggidx(idx);

    t_index pidx = get_parent_idx(idx);

    t_index agg_pridx =
        pidx == INVALID_INDEX ? INVALID_INDEX : get_aggidx(pidx);

    return extract_aggregate(m_aggspecs[aggnum], c, agg_ridx, agg_pridx);
}

t_tscalar
t_stree::get_aggregate_median(std::vector<t_tscalar>& values, float n) const {
    const auto size = values.size();
    const float raw_size = static_cast<float>(size) * n;
    bool is_even_size = fabsf(roundf(raw_size) - raw_size) <= 0.00001;
    if (size == 0) {
        return {};
    }

    if (size == 1) {
        return values[0];
    }

    const auto split = static_cast<long>(raw_size);
    if (is_even_size && values[0].is_floating_point()) {
        t_tscalar median_average;
        auto middle = values.begin() + split;
        nth_element(values.begin(), middle, values.end());
        median_average.set(
            (*middle + *(middle - 1)) / static_cast<t_tscalar>(2)
        );

        return median_average;
    }

    auto middle = values.begin() + split;
    std::nth_element(values.begin(), middle, values.end());
    return *middle;
}

void
t_stree::get_child_indices(t_index idx, std::vector<t_index>& out_data) const {
    t_index num_children = get_num_children(idx);
    std::vector<t_index> temp(num_children);
    t_by_pidx_ipair iterators = m_nodes->get<by_pidx>().equal_range(idx);
    t_index count = 0;
    for (iter_by_pidx iter = iterators.first; iter != iterators.second;
         ++iter) {
        temp[count] = iter->m_idx;
        ++count;
    }
    std::swap(out_data, temp);
}

void
t_stree::clear_deltas() {
    m_deltas->clear();
    m_has_delta = false;
}

void
t_stree::clear() {
    m_nodes->clear();
    clear_deltas();
}

void
t_stree::set_alerts_enabled(bool enabled_state) {
    m_features[CTX_FEAT_ALERT] = enabled_state;
}

void
t_stree::set_deltas_enabled(bool enabled_state) {
    m_features[CTX_FEAT_DELTA] = enabled_state;
}

void
t_stree::set_feature_state(t_ctx_feature feature, bool state) {
    m_features[feature] = state;
}

const std::shared_ptr<t_tcdeltas>&
t_stree::get_deltas() const {
    return m_deltas;
}

std::pair<t_tscalar, t_tscalar>
t_stree::first_last_helper(
    t_uindex nidx,
    const t_aggspec& spec,
    const t_gstate& gstate,
    const t_data_table& expression_master_table
) const {
    auto pkeys = get_pkeys(nidx);

    if (pkeys.empty()) {
        return std::make_pair(mknone(), mknone());
    }

    std::vector<t_tscalar> values;
    std::vector<t_tscalar> sort_values;

    read_column_from_gstate(
        gstate,
        expression_master_table,
        spec.get_dependencies()[0].name(),
        pkeys,
        values
    );

    read_column_from_gstate(
        gstate,
        expression_master_table,
        spec.get_dependencies()[1].name(),
        pkeys,
        sort_values
    );

    auto minmax_idx = get_minmax_idx(sort_values, spec.get_sort_type());

    std::pair<t_tscalar, t_tscalar> ret;
    switch (spec.get_sort_type()) {
        case SORTTYPE_ASCENDING:
        case SORTTYPE_ASCENDING_ABS: {
            if (minmax_idx.m_min >= 0) {
                ret.first = values[minmax_idx.m_min];
            } else {
                ret.first = mknone();
            }

            if (minmax_idx.m_max >= 0) {
                ret.second = values[minmax_idx.m_max];
            } else {
                ret.second = mknone();
            }
        } break;
        case SORTTYPE_DESCENDING:
        case SORTTYPE_DESCENDING_ABS: {
            if (minmax_idx.m_max >= 0) {
                ret.first = values[minmax_idx.m_max];
            } else {
                ret.first = mknone();
            }

            if (minmax_idx.m_min >= 0) {
                ret.second = values[minmax_idx.m_min];
            } else {
                ret.second = mknone();
            }
        } break;
        default: {
            ret.first = mknone();
            ret.second = mknone();
        }
    }

    return ret;
}

bool
t_stree::node_exists(t_uindex idx) {
    iter_by_idx iter = m_nodes->get<by_idx>().find(idx);
    return iter != m_nodes->get<by_idx>().end();
}

t_data_table*
t_stree::get_aggtable() {
    return m_aggregates.get();
}

std::pair<iter_by_idx, bool>
t_stree::insert_node(const t_tnode& node) {
    return m_nodes->insert(node);
}

bool
t_stree::has_deltas() const {
    return m_has_delta;
}

void
t_stree::get_sortby_path(t_uindex idx, std::vector<t_tscalar>& rval) const {
    t_uindex curidx = idx;

    if (curidx == 0) {
        return;
    }

    while (1) {
        iter_by_idx iter = m_nodes->get<by_idx>().find(curidx);
        rval.push_back(iter->m_sort_value);
        curidx = iter->m_pidx;
        if (curidx == 0) {
            break;
        }
    }
}

void
t_stree::set_has_deltas(bool v) {
    m_has_delta = v;
}

t_bfs_iter<t_stree>
t_stree::bfs() const {
    return {this};
}

t_dfs_iter<t_stree>
t_stree::dfs() const {
    return {this};
}

void
t_stree::pprint() const {
    for (auto idx : dfs()) {
        std::vector<t_tscalar> path;
        get_path(idx, path);
        for (t_uindex space_idx = 0; space_idx < path.size(); ++space_idx) {
            std::cout << "  ";
        }
        std::cout << idx << " <" << path << ">";
        for (t_uindex aidx = 0; aidx < get_num_aggcols(); ++aidx) {
            std::cout << get_aggregate(idx, aidx) << ", ";
        }
        std::cout << '\n';
    }
}

void
t_stree::read_column_from_gstate(
    const t_gstate& gstate,
    const t_data_table& expression_master_table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    std::vector<t_tscalar>& out_data
) const {
    const t_schema& expression_schema = expression_master_table.get_schema();

    if (expression_schema.has_column(colname)) {
        gstate.read_column(expression_master_table, colname, pkeys, out_data);
    } else {
        std::shared_ptr<t_data_table> gstate_master_table = gstate.get_table();
        gstate.read_column(*gstate_master_table, colname, pkeys, out_data);
    }
}

void
t_stree::read_column_from_gstate(
    const t_gstate& gstate,
    const t_data_table& expression_master_table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    std::vector<double>& out_data,
    bool include_none
) const {
    const t_schema& expression_schema = expression_master_table.get_schema();

    if (expression_schema.has_column(colname)) {
        gstate.read_column(
            expression_master_table, colname, pkeys, out_data, include_none
        );
    } else {
        std::shared_ptr<t_data_table> gstate_master_table = gstate.get_table();
        gstate.read_column(
            *gstate_master_table, colname, pkeys, out_data, include_none
        );
    }
}

t_tscalar
t_stree::read_by_pkey_from_gstate(
    const t_gstate& gstate,
    const t_data_table& expression_master_table,
    const std::string& colname,
    t_tscalar& pkey
) const {
    const t_schema& expression_schema = expression_master_table.get_schema();

    if (expression_schema.has_column(colname)) {
        return gstate.read_by_pkey(expression_master_table, colname, pkey);
    }
    std::shared_ptr<t_data_table> gstate_master_table = gstate.get_table();
    return gstate.read_by_pkey(*gstate_master_table, colname, pkey);
}

bool
t_stree::is_unique_from_gstate(
    const t_gstate& gstate,
    const t_data_table& expression_master_table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    t_tscalar& value
) const {
    const t_schema& expression_schema = expression_master_table.get_schema();

    if (expression_schema.has_column(colname)) {
        return gstate.is_unique(expression_master_table, colname, pkeys, value);
    }
    std::shared_ptr<t_data_table> gstate_master_table = gstate.get_table();
    return gstate.is_unique(*gstate_master_table, colname, pkeys, value);
}

bool
t_stree::apply_from_gstate(
    const t_gstate& gstate,
    const t_data_table& expression_master_table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    t_tscalar& value,
    const std::function<bool(const t_tscalar&, t_tscalar&)>& fn
) const {
    const t_schema& expression_schema = expression_master_table.get_schema();

    if (expression_schema.has_column(colname)) {
        return gstate.apply(expression_master_table, colname, pkeys, value, fn);
    }
    std::shared_ptr<t_data_table> gstate_master_table = gstate.get_table();
    return gstate.apply(*gstate_master_table, colname, pkeys, value, fn);
}

template <typename FN_T>
typename FN_T::result_type
t_stree::reduce_from_gstate(
    const t_gstate& gstate,
    const t_data_table& expression_master_table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    FN_T fn
) const {
    const t_schema& expression_schema = expression_master_table.get_schema();

    if (expression_schema.has_column(colname)) {
        return gstate.reduce(expression_master_table, colname, pkeys, fn);
    }
    std::shared_ptr<t_data_table> gstate_master_table = gstate.get_table();
    return gstate.reduce(*gstate_master_table, colname, pkeys, fn);
}

} // end namespace perspective
