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
#include <iomanip>
#include <utility>
#include <perspective/dense_tree_context.h>
#include <perspective/dependency.h>
#include <perspective/schema.h>

namespace perspective {

t_dtree_ctx::t_dtree_ctx(
    std::shared_ptr<const t_data_table> strands,
    std::shared_ptr<const t_data_table> strand_deltas,
    const t_dtree& tree,
    const std::vector<t_aggspec>& aggspecs
) :
    m_strands(std::move(std::move(strands))),
    m_strand_deltas(std::move(std::move(strand_deltas))),
    m_tree(tree),
    m_aggspecs(aggspecs),
    m_init(false) {
    std::vector<t_dep> depvec = {t_dep("psp_strand_count", DEPTYPE_COLUMN)};

    m_aggspecs.emplace_back("psp_strand_count_sum", AGGTYPE_SUM, depvec);

    t_uindex aggidx = 0;
    for (const auto& spec : m_aggspecs) {
        m_aggspecmap[spec.name()] = aggidx;
        ++aggidx;
    }
}

void
t_dtree_ctx::init() {
    build_aggregates();
    m_init = true;
}

t_uindex
t_dtree_ctx::get_num_aggcols() const {
    return m_aggspecs.size();
}

void
t_dtree_ctx::build_aggregates() {
    std::vector<std::string> columns;
    std::vector<t_dtype> dtypes;

    t_schema delta_schema = m_strand_deltas->get_schema();

    for (const auto& spec : m_aggspecs) {
        auto cinfo = spec.get_output_specs(delta_schema);
        for (const auto& ci : cinfo) {
            PSP_VERBOSE_ASSERT(
                ci.m_type != DTYPE_NONE, "NULL type encountered"
            );
            columns.push_back(ci.m_name);
            dtypes.push_back(ci.m_type);
        }
    }

    t_schema aggschema(columns, dtypes);

    m_aggregates = std::make_shared<t_data_table>(aggschema, m_tree.size());

    m_aggregates->init();
    m_aggregates->set_size(m_tree.size());

    for (const auto& aggspec : m_aggspecs) {
        const std::vector<t_dep>& deps = aggspec.get_dependencies();

        const t_data_table* tbl =
            aggspec.is_non_delta() ? m_strands.get() : m_strand_deltas.get();

        std::vector<std::shared_ptr<const t_column>> icolumns;
        icolumns.reserve(deps.size());
        for (const auto& d : deps) {
            icolumns.push_back(tbl->get_const_column(d.name()));
        }

        auto output_col = m_aggregates->get_column(aggspec.name());

        t_aggregate agg(m_tree, aggspec.agg(), icolumns, output_col);
        agg.init();
    }
}

const t_data_table&
t_dtree_ctx::get_aggtable() const {
    return *(m_aggregates);
}

const t_dtree&
t_dtree_ctx::get_tree() const {
    return m_tree;
}

const std::vector<t_aggspec>&
t_dtree_ctx::get_aggspecs() const {
    return m_aggspecs;
}

const t_aggspec&
t_dtree_ctx::get_aggspec(const std::string& aggname) const {
    auto iter = m_aggspecmap.find(aggname);
    PSP_VERBOSE_ASSERT(iter != m_aggspecmap.end(), "Failed to find aggspec");
    PSP_VERBOSE_ASSERT(
        static_cast<t_uindex>(iter->second) < m_aggspecs.size(),
        "Invalid aggspec index"
    );
    return m_aggspecs[iter->second];
}

void
t_dtree_ctx::pprint(const t_filter& fltr) const {
    std::vector<const t_column*> aggcols;

    t_uindex ncols = 0;
    for (const std::string& colname : m_aggregates->get_schema().m_columns) {
        aggcols.push_back(m_aggregates->_get_const_column(colname));
        std::cout << colname << ", ";
        ++ncols;
    }
    std::cout << "\n====================================\n";

    for (auto idx : m_tree.dfs()) {
        auto depth = m_tree.get_depth(idx);
        for (t_uindex spidx = 0; spidx < static_cast<t_uindex>(depth);
             ++spidx) {
            std::cout << "\t";
        }

        auto value = m_tree.get_value(fltr, idx);
        std::cout << "(" << idx << "). " << value << " => ";

        for (t_uindex aggidx = 0; aggidx < ncols; ++aggidx) {
            std::cout << aggcols[aggidx]->get_scalar(idx) << ", ";
        }
        std::cout << "\n";
    }
}

std::pair<const t_uindex*, const t_uindex*>
t_dtree_ctx::get_leaf_iterators(t_index idx) const {
    const t_dense_tnode* node = m_tree.get_node_ptr(idx);
    const auto* lbaseptr = m_tree.get_leaf_cptr()->get_nth<t_uindex>(0);
    return std::pair<const t_uindex*, const t_uindex*>(
        lbaseptr + node->m_flidx, lbaseptr + node->m_flidx + node->m_nleaves
    );
}

std::shared_ptr<const t_column>
t_dtree_ctx::get_pkey_col() const {
    return m_strands->get_const_column("psp_pkey");
}

std::shared_ptr<const t_column>
t_dtree_ctx::get_strand_count_col() const {
    return m_strand_deltas->get_const_column("psp_strand_count");
}

std::shared_ptr<const t_data_table>
t_dtree_ctx::get_strands() const {
    return m_strands;
}

std::shared_ptr<const t_data_table>
t_dtree_ctx::get_strand_deltas() const {
    return m_strand_deltas;
}

void
t_dtree_ctx::pprint_strands() const {
    std::vector<const t_column*> columns;
    const auto* scount_col =
        m_strand_deltas->_get_const_column("psp_strand_count");
    const auto* pkey_col = m_strands->_get_const_column("psp_pkey");
    auto strand_schema = m_strands->get_schema();

    t_uindex width = 18;

    std::vector<std::string> colnames = {"psp_pkey", "psp_strand_count"};

    for (const auto& colname : strand_schema.m_columns) {
        const auto* col = m_strands->_get_const_column(colname);
        if (col != pkey_col) {
            columns.push_back(col);
            colnames.push_back(colname);
        }
    }

    auto strand_delta_schema = m_strand_deltas->get_schema();
    for (const auto& colname : strand_delta_schema.m_columns) {
        const auto* col = m_strand_deltas->_get_const_column(colname);
        if (col != scount_col) {
            columns.push_back(col);
            std::stringstream ss;
            ss << "delta(" << colname << ")";
            colnames.push_back(ss.str());
        }
    }

    for (const auto& c : colnames) {
        std::cout << std::setw(width) << c;
    }

    std::cout << "\n====================================\n";

    for (t_uindex idx = 0, loop_end = m_strands->size(); idx < loop_end;
         ++idx) {

        std::vector<t_tscalar> vec;
        vec.push_back(pkey_col->get_scalar(idx));
        t_tscalar sc;
        sc.set(t_index(*(scount_col->get<std::int8_t>(idx))));
        vec.push_back(sc);

        for (const auto* col : columns) {
            vec.push_back(col->get_scalar(idx));
        }

        std::cout << idx << ".";
        for (const auto& val : vec) {
            std::cout << std::setw(width) << val;
        }

        std::cout << '\n';
    }
}

void
t_dtree_ctx::pprint_strands_tree() const {
    typedef std::pair<std::string, const t_column*> t_colname_cptr_pair;

    std::vector<t_colname_cptr_pair> columns;

    columns.emplace_back(
        "psp_pkey", m_strands->_get_const_column("psp_pkey")
    );

    columns.emplace_back(
        "psp_strand_count",
        m_strand_deltas->_get_const_column("psp_strand_count")
    );

    for (const auto& piv : m_tree.get_pivots()) {
        columns.emplace_back(
            piv.colname(), m_strands->_get_const_column(piv.colname())
        );
    }

    for (auto dptidx : m_tree.dfs()) {
        std::cout << "nidx(" << dptidx << ") => " << '\n';

        t_depth ndepth = m_tree.get_depth(dptidx);

        auto liters = get_leaf_iterators(dptidx);

        for (const auto* lfiter = liters.first; lfiter != liters.second;
             ++lfiter) {
            for (t_uindex idx = 0; idx < ndepth; ++idx) {
                std::cout << "\t";
            }

            std::cout << "\tleaf# " << *lfiter << "\n";

            for (const auto& colinfo : columns) {
                for (t_uindex idx = 0; idx < ndepth + 1; ++idx) {
                    std::cout << "\t";
                }
                std::cout << "    " << colinfo.first << ": "
                          << colinfo.second->get_scalar(*lfiter) << "\n";
            }
        }

        std::cout << '\n';
    }
}
} // end namespace perspective
