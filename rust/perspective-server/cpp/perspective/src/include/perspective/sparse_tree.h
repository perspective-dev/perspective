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
#include <perspective/portable.h>
SUPPRESS_WARNINGS_VC(4503)

#include <perspective/first.h>
#include <perspective/base.h>
#include <perspective/exports.h>
#include <boost/multi_index_container.hpp>
#include <boost/multi_index/member.hpp>
#include <boost/multi_index/hashed_index.hpp>
#include <boost/multi_index/ordered_index.hpp>
#include <boost/multi_index/composite_key.hpp>
#include <perspective/sort_specification.h>
#include <perspective/sparse_tree_node.h>
#include <perspective/pivot.h>
#include <perspective/aggspec.h>
#include <perspective/step_delta.h>
#include <perspective/mask.h>
#include <perspective/sym_table.h>
#include <perspective/data_table.h>
#include <perspective/dense_tree.h>
#include <vector>
#include <algorithm>
#include <deque>
#include <sstream>
#include <queue>

namespace perspective {

class t_gstate;
class t_dtree_ctx;
class t_config;
class t_ctx2;

using boost::multi_index_container;
using namespace boost::multi_index;

typedef std::pair<t_depth, t_index> t_dptipair;
typedef std::vector<t_dptipair> t_dptipairvec;

struct by_idx {};

struct by_depth {};

struct by_pidx {};

struct by_pidx_hash {};

struct by_nstrands {};

struct by_idx_pkey {};

struct by_idx_lfidx {};

PERSPECTIVE_EXPORT t_tscalar get_dominant(std::vector<t_tscalar>& values);

struct t_build_strand_table_metadata {
    t_schema m_flattened_schema;
    t_schema m_strand_schema;
    t_schema m_aggschema;
    t_uindex m_npivotlike;
    std::vector<std::string> m_pivot_like_columns;
    t_uindex m_pivsize;
};

typedef multi_index_container<
    t_stnode,
    indexed_by<
        ordered_unique<
            tag<by_idx>,
            BOOST_MULTI_INDEX_MEMBER(t_stnode, t_uindex, m_idx)>,
        hashed_non_unique<
            tag<by_depth>,
            BOOST_MULTI_INDEX_MEMBER(t_stnode, std::uint8_t, m_depth)>,
        hashed_non_unique<
            tag<by_nstrands>,
            BOOST_MULTI_INDEX_MEMBER(t_stnode, t_uindex, m_nstrands)>,
        ordered_unique<
            tag<by_pidx>,
            composite_key<
                t_stnode,
                BOOST_MULTI_INDEX_MEMBER(t_stnode, t_uindex, m_pidx),
                BOOST_MULTI_INDEX_MEMBER(t_stnode, t_tscalar, m_sort_value),
                BOOST_MULTI_INDEX_MEMBER(t_stnode, t_tscalar, m_value)>>,
        ordered_unique<
            tag<by_pidx_hash>,
            composite_key<
                t_stnode,
                BOOST_MULTI_INDEX_MEMBER(t_stnode, t_uindex, m_pidx),
                BOOST_MULTI_INDEX_MEMBER(t_stnode, t_tscalar, m_value)>>>>
    t_treenodes;

typedef multi_index_container<
    t_stpkey,
    indexed_by<ordered_unique<
        tag<by_idx_pkey>,
        composite_key<
            t_stpkey,
            BOOST_MULTI_INDEX_MEMBER(t_stpkey, t_uindex, m_idx),
            BOOST_MULTI_INDEX_MEMBER(t_stpkey, t_tscalar, m_pkey)>>>>
    t_idxpkey;

typedef multi_index_container<
    t_stleaves,
    indexed_by<ordered_unique<
        tag<by_idx_lfidx>,
        composite_key<
            t_stleaves,
            BOOST_MULTI_INDEX_MEMBER(t_stleaves, t_uindex, m_idx),
            BOOST_MULTI_INDEX_MEMBER(t_stleaves, t_uindex, m_lfidx)>>>>
    t_idxleaf;

typedef t_treenodes::index<by_idx>::type index_by_idx;
typedef t_treenodes::index<by_pidx>::type index_by_pidx;

typedef t_treenodes::index<by_idx>::type::iterator iter_by_idx;
typedef t_treenodes::index<by_pidx>::type::iterator iter_by_pidx;
typedef t_treenodes::index<by_pidx_hash>::type::iterator iter_by_pidx_hash;
typedef std::pair<iter_by_pidx, iter_by_pidx> t_by_pidx_ipair;

typedef t_idxpkey::index<by_idx_pkey>::type::iterator iter_by_idx_pkey;

typedef std::pair<iter_by_idx_pkey, iter_by_idx_pkey> t_by_idx_pkey_ipair;

struct PERSPECTIVE_EXPORT t_agg_update_info {
    std::vector<const t_column*> m_src;
    std::vector<t_column*> m_dst;
    std::vector<t_aggspec> m_aggspecs;

    std::vector<t_uindex> m_dst_topo_sorted;
};

struct t_tree_unify_rec {
    t_tree_unify_rec(
        t_uindex sptidx, t_uindex daggidx, t_uindex saggidx, t_uindex nstrands
    );

    t_uindex m_sptidx;
    t_uindex m_daggidx;
    t_uindex m_saggidx;
    t_uindex m_nstrands;
};

typedef std::vector<t_tree_unify_rec> t_tree_unify_rec_vec;

class PERSPECTIVE_EXPORT t_stree {
public:
    typedef const t_stree* t_cptr;
    typedef std::shared_ptr<t_stree> t_sptr;
    typedef std::shared_ptr<const t_stree> t_csptr;
    typedef t_stnode t_tnode;
    typedef std::vector<t_stnode> t_tnodevec;

    typedef std::map<const char*, const char*, t_cmp_charptr> t_sidxmap;

    t_stree(
        const std::vector<t_pivot>& pivots,
        const std::vector<t_aggspec>& aggspecs,
        t_schema schema,
        const t_config& cfg
    );
    ~t_stree();

    void init();

    std::string repr() const;

    t_tscalar get_value(t_index idx) const;
    t_tscalar get_sortby_value(t_index idx) const;

    void build_strand_table_phase_1(
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
        t_column* agg_scountspar,
        t_column* spkey,
        t_uindex& insert_count,
        bool& pivots_neq,
        const std::vector<std::string>& pivot_like
    ) const;

    void build_strand_table_phase_2(
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
    ) const;

    std::pair<std::shared_ptr<t_data_table>, std::shared_ptr<t_data_table>>
    build_strand_table(
        const t_data_table& flattened,
        const t_data_table& delta,
        const t_data_table& prev,
        const t_data_table& current,
        const t_data_table& transitions,
        const std::vector<t_aggspec>& aggspecs,
        const t_config& config
    ) const;

    std::pair<std::shared_ptr<t_data_table>, std::shared_ptr<t_data_table>>
    build_strand_table(
        const t_data_table& flattened,
        const std::vector<t_aggspec>& aggspecs,
        const t_config& config
    ) const;

    void update_shape_from_static(const t_dtree_ctx& ctx);

    void update_aggs_from_static(
        const t_dtree_ctx& ctx,
        const t_gstate& gstate,
        const t_data_table& expression_master_table
    );

    t_uindex size() const;

    t_uindex get_num_children(t_uindex idx) const;
    void get_child_nodes(t_uindex idx, t_tnodevec& nodes) const;
    std::vector<t_uindex> zero_strands() const;

    std::set<t_uindex> non_zero_leaves(const std::vector<t_uindex>& zero_strands
    ) const;

    std::set<t_uindex> non_zero_ids(const std::vector<t_uindex>& zero_strands
    ) const;

    std::set<t_uindex> non_zero_ids(
        const std::set<t_uindex>& ptiset,
        const std::vector<t_uindex>& zero_strands
    ) const;

    t_uindex get_parent_idx(t_uindex idx) const;
    std::vector<t_uindex> get_ancestry(t_uindex idx) const;

    t_index
    get_sibling_idx(t_index p_ptidx, t_index p_nchild, t_uindex c_ptidx) const;
    t_uindex get_aggidx(t_uindex idx) const;

    std::shared_ptr<const t_data_table> get_aggtable() const;

    t_data_table* _get_aggtable();

    t_tnode get_node(t_uindex idx) const;

    void get_path(t_uindex idx, std::vector<t_tscalar>& rval) const;
    void get_sortby_path(t_uindex idx, std::vector<t_tscalar>& rval) const;

    t_uindex resolve_child(t_uindex root, const t_tscalar& datum) const;

    void drop_zero_strands();

    void add_pkey(t_uindex idx, t_tscalar pkey);
    void remove_pkey(t_uindex idx, t_tscalar pkey);
    void add_leaf(t_uindex nidx, t_uindex lfidx);
    void remove_leaf(t_uindex nidx, t_uindex lfidx);

    t_by_idx_pkey_ipair get_pkeys_for_leaf(t_uindex idx) const;
    t_depth get_depth(t_uindex ptidx) const;
    void get_drd_indices(
        t_uindex ridx, t_depth rel_depth, std::vector<t_uindex>& leaves
    ) const;
    std::vector<t_uindex> get_leaves(t_uindex idx) const;
    std::vector<t_tscalar> get_pkeys(t_uindex idx) const;
    std::vector<t_uindex> get_child_idx(t_uindex idx) const;
    std::vector<std::pair<t_index, t_index>> get_child_idx_depth(t_uindex idx
    ) const;

    void populate_leaf_index(const std::set<t_uindex>& leaves);

    t_uindex last_level() const;

    const std::vector<t_pivot>& get_pivots() const;
    t_index
    resolve_path(t_uindex root, const std::vector<t_tscalar>& path) const;

    // aggregates should be presized to be same size
    // as agg_indices
    void
    get_aggregates_for_sorting(t_uindex nidx, const std::vector<t_index>& agg_indices, std::vector<t_tscalar>& aggregates, t_ctx2*)
        const;

    t_tscalar get_aggregate(t_index idx, t_index aggnum) const;

    t_tscalar
    get_aggregate_median(std::vector<t_tscalar>& values, float n) const;

    void get_child_indices(t_index idx, std::vector<t_index>& out_data) const;

    void set_alerts_enabled(bool enabled_state);

    void set_deltas_enabled(bool enabled_state);

    void set_feature_state(t_ctx_feature feature, bool state);

    void clear_deltas();

    const std::shared_ptr<t_tcdeltas>& get_deltas() const;

    void clear();

    std::pair<t_tscalar, t_tscalar> first_last_helper(
        t_uindex nidx,
        const t_aggspec& spec,
        const t_gstate& gstate,
        const t_data_table& expression_master_table
    ) const;

    bool node_exists(t_uindex nidx);

    t_data_table* get_aggtable();

    void clear_aggregates(const std::vector<t_uindex>& indices);

    std::pair<iter_by_idx, bool> insert_node(const t_tnode& node);
    bool has_deltas() const;
    void set_has_deltas(bool v);

    std::vector<t_uindex> get_descendents(t_uindex nidx) const;

    t_uindex get_num_leaves(t_uindex depth) const;
    std::vector<t_index> get_indices_for_depth(t_uindex depth) const;

    t_bfs_iter<t_stree> bfs() const;
    t_dfs_iter<t_stree> dfs() const;
    void pprint() const;

protected:
    void mark_zero_desc();
    t_uindex get_num_aggcols() const;

    bool pivots_changed(t_value_transition t) const;
    t_uindex genidx();
    t_uindex gen_aggidx();
    std::vector<t_uindex> get_children(t_uindex idx) const;

    void update_agg_table(
        t_uindex nidx,
        t_agg_update_info& info,
        t_uindex src_ridx,
        t_uindex dst_ridx,
        t_index nstrands,
        const t_gstate& gstate,
        const t_data_table& expression_master_table
    );

    bool is_leaf(t_uindex nidx) const;

    t_build_strand_table_metadata build_strand_table_metadata(
        const t_data_table& flattened,
        const std::vector<t_aggspec>& aggspecs,
        const t_config& config
    ) const;

    void populate_pkey_idx(
        const t_dtree_ctx& ctx,
        const t_dtree& dtree,
        t_uindex dptidx,
        t_uindex sptidx,
        t_uindex ndepth,
        t_idxpkey& new_idx_pkey
    );

    // Methods that use `t_gstate`'s mapping of primary keys to row indices
    // to extract values from a data table. Because these methods can either
    // extract from the expressions table or the master table of the gnode,
    // these methods abstract away the "is_expression" check.

    void read_column_from_gstate(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const std::string& colname,
        const std::vector<t_tscalar>& pkeys,
        std::vector<t_tscalar>& out_data
    ) const;

    void read_column_from_gstate(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const std::string& colname,
        const std::vector<t_tscalar>& pkeys,
        std::vector<double>& out_data,
        bool include_none
    ) const;

    t_tscalar read_by_pkey_from_gstate(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const std::string& colname,
        t_tscalar& pkey
    ) const;

    bool is_unique_from_gstate(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const std::string& colname,
        const std::vector<t_tscalar>& pkeys,
        t_tscalar& value
    ) const;

    bool apply_from_gstate(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const std::string& colname,
        const std::vector<t_tscalar>& pkeys,
        t_tscalar& value,
        const std::function<bool(const t_tscalar&, t_tscalar&)>& fn
    ) const;

    template <typename FN_T>
    typename FN_T::result_type reduce_from_gstate(
        const t_gstate& gstate,
        const t_data_table& expression_master_table,
        const std::string& colname,
        const std::vector<t_tscalar>& pkeys,
        FN_T fn
    ) const;

private:
    std::vector<t_pivot> m_pivots;
    bool m_init;
    std::shared_ptr<t_treenodes> m_nodes;
    std::shared_ptr<t_idxpkey> m_idxpkey;
    std::shared_ptr<t_idxleaf> m_idxleaf;
    t_uindex m_curidx;
    std::shared_ptr<t_data_table> m_aggregates;
    std::vector<t_aggspec> m_aggspecs;
    t_schema m_schema;
    std::vector<t_uindex> m_agg_freelist;
    t_uindex m_cur_aggidx;
    std::set<t_uindex> m_newids;
    std::set<t_uindex> m_newleaves;
    t_sidxmap m_smap;
    std::vector<const t_column*> m_aggcols;
    std::shared_ptr<t_tcdeltas> m_deltas;
    t_tree_unify_rec_vec m_tree_unification_records;
    std::vector<bool> m_features;
    t_symtable m_symtable;
    bool m_has_delta;
    std::string m_grand_agg_str;

    // Used by AGGTYPE_GMV under split_by. For t_ctx1 (group_by only) the
    // tree's pivots are exactly the row pivots, so the default
    // `m_num_row_pivots_in_tree == m_pivots.size()` makes every tree-leaf
    // a "real" leaf and the next-row-pivot lookup unused. For t_ctx2 each
    // m_trees[k] is initialized with the row+col split via
    // `set_gmv_row_pivot_meta(k, next_row_pivot_name)`, so the gmv kernel
    // can detect a "tree-leaf but row-parent" node and roll up across the
    // missing row pivot dimension via the gstate.
    t_uindex m_num_row_pivots_in_tree;
    std::string m_next_row_pivot_name;

public:
    void set_gmv_row_pivot_meta(
        t_uindex num_row_pivots_in_tree,
        const std::string& next_row_pivot_name
    );
    t_uindex get_num_row_pivots_in_tree() const;
    const std::string& get_next_row_pivot_name() const;
};

} // end namespace perspective
