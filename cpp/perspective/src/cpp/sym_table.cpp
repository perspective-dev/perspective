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
#include <perspective/base.h>
#include <perspective/sym_table.h>
#include <perspective/column.h>
#include <tsl/hopscotch_map.h>
#include <mutex>

namespace perspective {

std::mutex sym_table_mutex;

t_symtable::t_symtable() = default;

t_symtable::~t_symtable() {
    for (const auto& kv : m_mapping) {
        free(const_cast<char*>(kv.second));
    }
}

const char*
t_symtable::get_interned_cstr(const char* s) {
    auto iter = m_mapping.find(s);

    if (iter != m_mapping.end()) {
        return iter->second;
    }

    auto* scopy = strdup(s);
    m_mapping[scopy] = scopy;
    return scopy;
}

t_tscalar
t_symtable::get_interned_tscalar(const char* s) {
    if (t_tscalar::can_store_inplace(s)) {
        t_tscalar rval;
        rval.set(s);
        return rval;
    }

    t_tscalar rval;
    rval.set(get_interned_cstr(s));
    return rval;
}

t_tscalar
t_symtable::get_interned_tscalar(const t_tscalar& s) {
    if (!s.is_str() || s.is_inplace()) {
        return s;
    }

    t_tscalar rval;
    rval.set(get_interned_cstr(s.get_char_ptr()));
    rval.m_status = s.m_status;
    return rval;
}

t_uindex
t_symtable::size() const {
    return m_mapping.size();
}

static t_symtable*
get_symtable() {
    static t_symtable* sym = nullptr;

    if (sym == nullptr) {
        sym = new t_symtable;
    }
    return sym;
}

const char*
get_interned_cstr(const char* s) {
    std::lock_guard<std::mutex> guard(sym_table_mutex);
    auto* sym = get_symtable();
    return sym->get_interned_cstr(s);
}

t_tscalar
get_interned_tscalar(const char* s) {
    if (t_tscalar::can_store_inplace(s)) {
        t_tscalar rval;
        rval.set(s);
        return rval;
    }
    t_tscalar rval;
    rval.set(get_interned_cstr(s));
    return rval;
}

t_tscalar
get_interned_tscalar(const t_tscalar& s) {
    if (!s.is_str() || s.is_inplace()) {
        return s;
    }

    t_tscalar rval;
    rval.set(get_interned_cstr(s.get_char_ptr()));
    return rval;
}

} // end namespace perspective
