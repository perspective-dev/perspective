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
#include <perspective/step_delta.h>

namespace perspective {

// Deltas for various contexts

t_zcdelta::t_zcdelta(
    t_tscalar pkey, t_index colidx, t_tscalar old_value, t_tscalar new_value
) :
    m_pkey(pkey),
    m_colidx(colidx),
    m_old_value(old_value),
    m_new_value(new_value) {}

t_tcdelta::t_tcdelta(
    t_uindex nidx, t_uindex aggidx, t_tscalar old_value, t_tscalar new_value
) :
    m_nidx(nidx),
    m_aggidx(aggidx),
    m_old_value(old_value),
    m_new_value(new_value) {}

t_cellupd::t_cellupd(
    t_index row,
    t_index column,
    const t_tscalar& old_value,
    const t_tscalar& new_value
) :
    row(row),
    column(column),
    old_value(old_value),
    new_value(new_value) {}

t_cellupd::t_cellupd() = default;

// t_stepdelta contains a vector of t_cellupd objects showing the cells that
// have been changed
t_stepdelta::t_stepdelta() = default;

t_stepdelta::t_stepdelta(
    bool rows_changed, bool columns_changed, const std::vector<t_cellupd>& cells
) :
    rows_changed(rows_changed),
    columns_changed(columns_changed),
    cells(cells) {}

// t_rowdelta contains a vector of row indices that have been changed
t_rowdelta::t_rowdelta() = default;

t_rowdelta::t_rowdelta(
    bool rows_changed,
    t_uindex num_rows_changed,
    const std::vector<t_tscalar>& data
) :
    rows_changed(rows_changed),
    num_rows_changed(num_rows_changed),
    data(data) {}

t_rowdelta::t_rowdelta(
    bool rows_changed,
    const std::vector<t_uindex>& rows,
    const std::vector<t_tscalar>& data
) :
    rows_changed(rows_changed),
    num_rows_changed(rows.size()),
    data(data),
    rows(rows) {}
} // end namespace perspective

namespace std {

std::ostream&
operator<<(std::ostream& os, const perspective::t_cellupd& cell) {
    os << "t_cellupd \n{"
       << "\n\trow => " << cell.row << "\n\tcolumn => " << cell.column
       << "\n\told_value => " << cell.old_value << "\n\tnew_value => "
       << cell.new_value << "\n}" << '\n';

    return os;
}

} // end namespace std
