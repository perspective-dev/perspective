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
#include <perspective/schema.h>

namespace perspective {

t_schema::t_schema() = default;

t_schema::t_schema(
    const std::vector<std::string>& columns, const std::vector<t_dtype>& types
) :
    m_columns(columns),
    m_types(types),
    m_status_enabled(columns.size()),
    m_pkeyidx(0),
    m_opidx(0) {
    PSP_VERBOSE_ASSERT(columns.size() == types.size(), "Size mismatch");

    bool pkey_found = false;
    bool op_found = false;

    std::string pkey_str("psp_pkey");
    std::string op_str("psp_op");
    for (std::vector<std::string>::size_type idx = 0, loop_end = types.size();
         idx < loop_end;
         ++idx) {
        m_colidx_map[columns[idx]] = idx;
        m_coldt_map[columns[idx]] = types[idx];
        m_status_enabled[idx] = true;
        if (columns[idx] == pkey_str) {
            pkey_found = true;
            m_pkeyidx = idx;
        }

        if (columns[idx] == op_str) {
            op_found = true;
            m_opidx = idx;
        }
    }

    m_is_pkey = pkey_found && op_found;
}

t_uindex
t_schema::get_num_columns() const {
    return m_columns.size();
}

t_uindex
t_schema::size() const {
    return m_columns.size();
}

t_uindex
t_schema::get_colidx(const std::string& colname) const {
    auto iter = m_colidx_map.find(colname);
    if (iter == m_colidx_map.end()) {
        std::stringstream ss;
        ss << "Could not find column index for `" << colname
           << "` as it does not exist in the schema." << '\n';
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }
    return iter->second;
}

t_uindex
t_schema::get_colidx_safe(const std::string& colname) const {
    auto iter = m_colidx_map.find(colname);
    if (iter == m_colidx_map.end()) {
        return -1;
    }
    return iter->second;
}

t_dtype
t_schema::get_dtype(const std::string& colname) const {
    auto iter = m_coldt_map.find(colname);
    if (iter == m_coldt_map.end()) {
        std::stringstream ss;
        ss << "Could not get dtype for column `" << colname
           << "` as it does not exist in the schema." << '\n';
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }
    return iter->second;
}

bool
t_schema::is_pkey() const {
    return m_is_pkey;
}

bool
t_schema::operator==(const t_schema& rhs) const {
    return m_columns == rhs.m_columns && m_types == rhs.m_types
        && m_status_enabled == rhs.m_status_enabled;
}

void
t_schema::add_column(const std::string& colname, t_dtype dtype) {
    t_uindex idx = m_columns.size();
    m_columns.push_back(colname);
    m_status_enabled.push_back(true);
    m_types.push_back(dtype);
    m_colidx_map[colname] = idx;
    m_coldt_map[colname] = dtype;

    if (colname == std::string("psp_pkey")) {
        m_pkeyidx = idx;
        m_is_pkey = true;
    }

    if (colname == std::string("psp_op")) {
        m_opidx = idx;
        m_is_pkey = true;
    }
}

void
t_schema::retype_column(const std::string& colname, t_dtype dtype) {
    if (colname == std::string("psp_pkey")
        || colname == std::string("psp_op")) {
        PSP_COMPLAIN_AND_ABORT("Cannot retype primary key or operation columns."
        );
    }
    if (!has_column(colname)) {
        std::stringstream ss;
        ss << "Cannot retype column `" << colname << "` as it does not exist."
           << '\n';
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    t_uindex idx = get_colidx(colname);
    m_types[idx] = dtype;
    m_colidx_map[colname] = idx;
    m_coldt_map[colname] = dtype;
}

bool
t_schema::has_column(std::string_view colname) const {
    auto iter = m_colidx_map.find(colname.data());
    return iter != m_colidx_map.end();
}

const std::vector<std::string>&
t_schema::columns() const {
    return m_columns;
}

std::vector<t_dtype>
t_schema::types() const {
    return m_types;
}

std::string
t_schema::str() const {
    std::stringstream ss;
    ss << *this;
    return ss.str();
}

t_schema
t_schema::drop(const std::set<std::string>& columns) const {
    std::vector<std::string> cols;
    std::vector<t_dtype> types;

    for (t_uindex idx = 0, loop_end = m_columns.size(); idx < loop_end; ++idx) {
        if (columns.find(m_columns[idx]) == columns.end()) {
            cols.push_back(m_columns[idx]);
            types.push_back(m_types[idx]);
        }
    }
    return t_schema(cols, types);
}

t_schema
t_schema::operator+(const t_schema& o) const {
    t_schema rv(m_columns, m_types);
    for (t_uindex idx = 0, loop_end = o.m_columns.size(); idx < loop_end;
         ++idx) {
        rv.add_column(o.m_columns[idx], o.m_types[idx]);
    }
    return rv;
}

} // end namespace perspective

namespace std {

std::ostream&
operator<<(std::ostream& os, const perspective::t_schema& s) {
    using namespace perspective;
    const std::vector<std::string>& cols = s.columns();
    const std::vector<t_dtype>& types = s.types();

    os << "t_schema<\n";
    for (size_t idx = 0, loop_end = cols.size(); idx < loop_end; ++idx) {
        os << "\t" << idx << ". " << cols[idx] << ", "
           << get_dtype_descr(types[idx]) << '\n';
    }
    os << ">\n";
    return os;
}
} // namespace std
