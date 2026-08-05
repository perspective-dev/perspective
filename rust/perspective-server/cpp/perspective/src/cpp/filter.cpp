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
#include <perspective/filter.h>

#include <utility>

namespace perspective {

t_fterm::t_fterm() = default;

t_fterm::t_fterm(
    std::string colname,
    t_filter_op op,
    t_tscalar threshold,
    const std::vector<t_tscalar>& bag,
    bool negated,
    bool is_primary
) :
    m_colname(std::move(colname)),
    m_op(op),
    m_threshold(threshold),
    m_bag(bag),
    m_negated(negated),
    m_is_primary(is_primary) {
    m_use_interned = (op == FILTER_OP_EQ || op == FILTER_OP_NE)
        && threshold.m_type == DTYPE_STR;
    compile_pattern();
}

t_fterm::t_fterm(
    std::string colname,
    t_filter_op op,
    t_tscalar threshold,
    const std::vector<t_tscalar>& bag
) :
    m_colname(std::move(colname)),
    m_op(op),
    m_threshold(threshold),
    m_bag(bag),
    m_negated(false),
    m_is_primary(false) {
    m_use_interned = (op == FILTER_OP_EQ || op == FILTER_OP_NE)
        && threshold.m_type == DTYPE_STR;
    compile_pattern();
}

void
t_fterm::compile_pattern() {
    if ((m_op == FILTER_OP_MATCHES || m_op == FILTER_OP_NOT_MATCHES)
        && m_threshold.m_type == DTYPE_STR) {
        m_pattern =
            std::make_shared<RE2>(m_threshold.to_string(), RE2::Quiet);
    }
}

void
t_fterm::coerce_numeric(t_dtype dtype) {
    m_threshold.set(m_threshold.coerce_numeric_dtype(dtype));
    for (auto& f : m_bag) {
        f.set(f.coerce_numeric_dtype(dtype));
    }
}

std::string
t_fterm::get_expr() const {
    std::stringstream ss;

    ss << m_colname << " ";

    switch (m_op) {
        case FILTER_OP_LT:
        case FILTER_OP_LTEQ:
        case FILTER_OP_GT:
        case FILTER_OP_GTEQ:
        case FILTER_OP_EQ:
        case FILTER_OP_NE:
        case FILTER_OP_CONTAINS:
        case FILTER_OP_NOT_CONTAINS:
        case FILTER_OP_MATCHES:
        case FILTER_OP_NOT_MATCHES: {
            ss << filter_op_to_str(m_op) << " ";
            ss << m_threshold.to_string(true);
        } break;
        case FILTER_OP_NOT_IN:
        case FILTER_OP_IN: {
            ss << " " << filter_op_to_str(m_op) << " (";
            for (auto v : m_bag) {
                ss << v.to_string(true) << ", ";
            }
            ss << " )";
        } break;
        case FILTER_OP_BEGINS_WITH:
        case FILTER_OP_ENDS_WITH:
        case FILTER_OP_NOT_BEGINS_WITH:
        case FILTER_OP_NOT_ENDS_WITH: {
            ss << "." << filter_op_to_str(m_op) << "( "
               << m_threshold.to_string(true) << " )";
        } break;
        default: {
            ss << " is failed_compilation";
        }
    }

    return ss.str();
}

t_filter::t_filter() : m_mode(SELECT_MODE_ALL) {}

t_filter::t_filter(const std::vector<std::string>& columns) :
    m_mode(SELECT_MODE_ALL),
    m_columns(columns) {}

t_filter::t_filter(
    const std::vector<std::string>& columns, t_uindex bidx, t_uindex eidx
) :
    m_mode(SELECT_MODE_RANGE),
    m_bidx(bidx),
    m_eidx(eidx),
    m_columns(columns) {}

t_filter::t_filter(
    const std::vector<std::string>& columns, t_uindex mask_size
) :
    m_mode(SELECT_MODE_MASK),
    m_columns(columns),
    m_mask(std::make_shared<t_mask>(mask_size)) {}

t_uindex
t_filter::num_cols() const {
    return m_columns.size();
}

bool
t_filter::has_filter() const {
    return m_mode != SELECT_MODE_ALL;
}

const std::vector<std::string>&
t_filter::columns() const {
    return m_columns;
}

t_select_mode
t_filter::mode() const {
    return m_mode;
}

t_uindex
t_filter::bidx() const {
    return m_bidx;
}

t_uindex
t_filter::eidx() const {
    return m_eidx;
}

t_maskcsptr
t_filter::cmask() const {
    return t_maskcsptr(m_mask);
}

t_masksptr
t_filter::mask() const {
    return t_masksptr(m_mask);
}

t_uindex
t_filter::count() const {
    return m_mask->count();
}

} // end namespace perspective
