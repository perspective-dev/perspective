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
#include <vector>
#include <tsl/hopscotch_set.h>
#include <boost/multi_index_container.hpp>
#include <boost/multi_index/member.hpp>
#include <boost/multi_index/hashed_index.hpp>
#include <boost/multi_index/ordered_index.hpp>
#include <boost/multi_index/composite_key.hpp>

namespace perspective {

using boost::multi_index_container;
using namespace boost::multi_index;

// Deltas for various contexts

struct t_zcdelta {
    t_zcdelta(
        t_tscalar pkey, t_index colidx, t_tscalar old_value, t_tscalar new_value
    );

    t_tscalar m_pkey;
    t_index m_colidx;
    t_tscalar m_old_value;
    t_tscalar m_new_value;
};

struct by_zc_pkey_colidx {};

typedef multi_index_container<
    t_zcdelta,
    indexed_by<ordered_unique<
        tag<by_zc_pkey_colidx>,
        composite_key<
            t_zcdelta,
            BOOST_MULTI_INDEX_MEMBER(t_zcdelta, t_tscalar, m_pkey),
            BOOST_MULTI_INDEX_MEMBER(t_zcdelta, t_index, m_colidx)>>>>
    t_zcdeltas;

struct t_tcdelta {
    t_tcdelta(
        t_uindex nidx, t_uindex aggidx, t_tscalar old_value, t_tscalar new_value
    );

    t_uindex m_nidx;
    t_uindex m_aggidx;
    t_tscalar m_old_value;
    t_tscalar m_new_value;
};

struct by_tc_nidx_aggidx {};

typedef multi_index_container<
    t_tcdelta,
    indexed_by<ordered_unique<
        tag<by_tc_nidx_aggidx>,
        composite_key<
            t_tcdelta,
            BOOST_MULTI_INDEX_MEMBER(t_tcdelta, t_uindex, m_nidx),
            BOOST_MULTI_INDEX_MEMBER(t_tcdelta, t_uindex, m_aggidx)>>>>
    t_tcdeltas;

struct PERSPECTIVE_EXPORT t_cellupd {
    t_cellupd(
        t_index row,
        t_index column,
        const t_tscalar& old_value,
        const t_tscalar& new_value
    );

    t_cellupd();

    std::int32_t row;
    std::int32_t column;
    t_tscalar old_value;
    t_tscalar new_value;
};

struct PERSPECTIVE_EXPORT t_stepdelta {
    t_stepdelta();

    t_stepdelta(
        bool rows_changed,
        bool columns_changed,
        const std::vector<t_cellupd>& cells
    );

    bool rows_changed;
    bool columns_changed;
    std::vector<t_cellupd> cells;
};

struct PERSPECTIVE_EXPORT t_rowdelta {
    t_rowdelta();

    t_rowdelta(
        bool rows_changed,
        t_uindex num_rows_changed,
        const std::vector<t_tscalar>& data
    );

    t_rowdelta(
        bool rows_changed,
        const std::vector<t_uindex>& rows,
        const std::vector<t_tscalar>& data
    );

    bool rows_changed;
    t_uindex num_rows_changed;
    std::vector<t_tscalar> data;

    /// The view row index of each delta row, empty for a flat context.
    std::vector<t_uindex> rows;
};

} // end namespace perspective

namespace std {
std::ostream& operator<<(std::ostream& os, const perspective::t_cellupd& cell);
}
