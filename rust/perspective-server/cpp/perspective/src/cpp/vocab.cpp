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
#include <perspective/vocab.h>
#include <tsl/hopscotch_set.h>

#include <memory>

namespace perspective {

t_vocab::t_vocab() : m_vlenidx(0) {
    m_vlendata = std::make_shared<t_lstore>();
    m_extents = std::make_shared<t_lstore>();
}

t_vocab::t_vocab(const t_column_recipe& r) : m_vlenidx(r.m_vlenidx) {
    if (is_vlen_dtype(r.m_dtype)) {
        m_vlendata = std::make_shared<t_lstore>(r.m_vlendata);
        m_extents = std::make_shared<t_lstore>(r.m_extents);
    } else {
        m_vlendata = std::make_shared<t_lstore>();
        m_extents = std::make_shared<t_lstore>();
    }
}

t_vocab::t_vocab(
    const t_lstore_recipe& vlendata_recipe,
    const t_lstore_recipe& extents_recipe
) :
    m_vlenidx(0) {
    m_vlendata = std::make_shared<t_lstore>(vlendata_recipe);
    m_extents = std::make_shared<t_lstore>(extents_recipe);
}

void
t_vocab::rebuild_map() {
    m_map.clear();
    m_map.reserve((size_t)m_vlenidx);
    for (t_uindex idx = 0; idx < m_vlenidx; ++idx) {
        m_map[unintern_c(idx)] = idx;
    }
}

void
t_vocab::reserve(size_t total_string_size, size_t string_count) {
    m_vlendata->reserve(total_string_size);
    m_extents->reserve(sizeof(std::pair<t_uindex, t_uindex>) * string_count);
    rebuild_map();
}

bool
t_vocab::string_exists(const char* c, t_uindex& interned) const {
    auto iter = m_map.find(c);

    if (iter == m_map.end()) {
        return false;
    }

    interned = iter->second;
    return true;
}

bool
t_vocab::string_exists(
    const char* c, std::size_t hash, t_uindex& interned
) const {
    auto iter = m_map.find(c, hash);

    if (iter == m_map.end()) {
        return false;
    }

    interned = iter->second;
    return true;
}

t_uindex
t_vocab::get_interned(const char* s) {
    std::size_t bytelength = strlen(s);
    return get_interned(s, bytelength, boost::hash_range(s, s + bytelength));
}

t_uindex
t_vocab::get_interned(
    const char* s, std::size_t bytelength, std::size_t hash
) {
#ifdef PSP_COLUMN_VERIFY
    PSP_VERBOSE_ASSERT(s != 0, "Null string");
#endif

    t_sidxmap::iterator iter = m_map.find(s, hash);

    t_uindex idx;
    t_uindex bidx;
    t_uindex eidx;
    t_uindex len = bytelength + 1;

    if (iter == m_map.end()) {
        idx = genidx();

        bidx = m_vlendata->size();
        eidx = bidx + len;
        const void* obase = m_vlendata->get_nth<const char>(0);
        const void* oebase =
            m_extents->get_nth<std::pair<t_uindex, t_uindex>>(0);
        m_vlendata->push_back(static_cast<const void*>(s), len);
        m_extents->push_back(std::pair<t_uindex, t_uindex>(bidx, eidx));
        const void* nbase = m_vlendata->get_nth<const char>(0);
        const void* nebase =
            m_extents->get_nth<std::pair<t_uindex, t_uindex>>(0);
        if ((obase == nbase) && (oebase == nebase)) {
            m_map[unintern_c(idx)] = idx;
        } else {
            rebuild_map();
        }
    } else {
        idx = iter->second;
    }

    return idx;
}

t_uindex
t_vocab::genidx() {
    return m_vlenidx++;
}

void
t_vocab::init(bool from_recipe) {
    m_vlendata->init();
    m_extents->init();
    if (from_recipe) {
        rebuild_map();
    }
}

t_uindex
t_vocab::get_interned(const std::string& s) {
    return get_interned(s.c_str());
}

void
t_vocab::verify() const {
    std::map<t_uindex, const char*> rlookup;

    for (const auto& kv : m_map) {
        rlookup[kv.second] = kv.first;
    }

    tsl::hopscotch_set<std::string> seen;

    for (t_uindex idx = 1; idx < m_vlenidx; ++idx) {
        std::stringstream ss;
        ss << "idx => " << idx << " not found";
        PSP_VERBOSE_ASSERT(rlookup.find(idx) != rlookup.end(), ss.str());

        std::string curstr = std::string(rlookup.at(idx));

        PSP_VERBOSE_ASSERT(
            seen.find(curstr) == seen.end(), "string encountered again"
        );

        PSP_VERBOSE_ASSERT(
            std::string(unintern_c(idx)) == curstr, "String mismatch"
        );
    }
}

void
t_vocab::verify_size() const {
    PSP_VERBOSE_ASSERT(
        m_vlenidx == m_map.size(), "Size and vlenidx size dont line up"
    );

    PSP_VERBOSE_ASSERT(
        m_vlenidx * sizeof(std::pair<t_uindex, t_uindex>)
            <= m_extents->capacity(),
        "Not enough space reserved for extents"
    );
}

t_uindex
t_vocab::nbytes() const {
    t_uindex rv = 0;
    rv += m_vlendata->capacity();
    rv += m_extents->capacity();
    return rv;
}

void
t_vocab::fill(
    const t_lstore& o_vlen, const t_lstore& o_extents, t_uindex vlenidx
) {
    m_vlendata->fill(o_vlen);
    m_extents->fill(o_extents);
    m_vlenidx = vlenidx;
}

void
t_vocab::copy_vocabulary(const t_vocab& other) {
    m_vlenidx = other.m_vlenidx;
    m_vlendata = other.m_vlendata->clone();
    m_extents = other.m_extents->clone();
    rebuild_map();
}

void
t_vocab::pprint_vocabulary() const {
    std::cout << "vocabulary =========\n";
    for (t_uindex idx = 0; idx < m_vlenidx; ++idx) {
        std::cout << "\t" << idx << " => '" << unintern_c(idx) << "'" << '\n';
    }

    std::cout << "end vocabulary =========\n";
}

const char*
t_vocab::unintern_c(t_uindex idx) const {
    const std::pair<t_uindex, t_uindex>* p =
        m_extents->get_nth<std::pair<t_uindex, t_uindex>>(idx);
    const char* rv = static_cast<const char*>(m_vlendata->get_ptr(p->first));
    return rv;
}

void
t_vocab::clone(const t_vocab& v) {
    m_vlendata->fill(*(v.m_vlendata));
    m_extents->fill(*(v.m_extents));
    m_vlenidx = v.m_vlenidx;
    rebuild_map();
}

void
t_vocab::set_vlenidx(t_uindex idx) {
    m_vlenidx = idx;
}

t_extent_pair*
t_vocab::get_extents_base() {
    return m_extents->get<t_extent_pair>(0);
}

unsigned char*
t_vocab::get_vlen_base() {
    return m_vlendata->get<unsigned char>(0);
}

std::shared_ptr<t_lstore>
t_vocab::get_vlendata() {
    return m_vlendata;
}

std::shared_ptr<t_lstore>
t_vocab::get_extents() {
    return m_extents;
}

t_uindex
t_vocab::get_vlenidx() const {
    return m_vlenidx;
}

} // end namespace perspective
