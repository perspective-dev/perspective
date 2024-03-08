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
#include <perspective/base.h>
#include <perspective/exports.h>
#include <map>
namespace perspective {

struct PERSPECTIVE_EXPORT t_schema {

    t_schema();
    t_schema(
        const std::vector<std::string>& columns,
        const std::vector<t_dtype>& types
    );

    t_uindex size() const;
    t_uindex get_num_columns() const;

    t_uindex get_colidx(const std::string& colname) const;
    t_dtype get_dtype(const std::string& colname) const;

    t_uindex get_colidx_safe(const std::string& colname) const;

    void add_column(const std::string& colname, t_dtype dtype);
    void retype_column(const std::string& colname, t_dtype dtype);
    t_schema drop(const std::set<std::string>& columns) const;
    bool has_column(std::string_view colname) const;

    bool is_pkey() const;

    const std::vector<std::string>& columns() const;
    std::vector<t_dtype> types() const;

    std::string str() const;

    t_schema operator+(const t_schema& o) const;
    bool operator==(const t_schema& rhs) const;

    std::vector<std::string> m_columns;
    std::vector<t_dtype> m_types;
    std::map<std::string, t_uindex> m_colidx_map;
    std::map<std::string, t_dtype> m_coldt_map;
    std::vector<bool> m_status_enabled;
    bool m_is_pkey;
    t_uindex m_pkeyidx;
    t_uindex m_opidx;
};

} // end namespace perspective

namespace std {

PERSPECTIVE_EXPORT std::ostream&
operator<<(std::ostream& os, const perspective::t_schema& s);
}
