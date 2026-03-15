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
#include <perspective/storage.h>
#include <perspective/exports.h>
#include <perspective/scalar.h>

#include <perspective/mask.h>
#include <perspective/compat.h>
#include <perspective/vocab.h>
#include <functional>
#include <limits>
#include <cmath>
#include <tsl/hopscotch_map.h>

/*
TODO -
1. Implement implicit typepunning based on cardinality.
2. No pointers should be returned from columns. Only
accessors!
3. Add get_nth for strings
*/

namespace perspective {

class t_column;

#ifdef PSP_COLUMN_VERIFY
#define COLUMN_CHECK_ACCESS(idx)                                               \
    PSP_VERBOSE_ASSERT((idx) <= m_size, "Invalid column access")
#define COLUMN_CHECK_VALUES() verify()
#define COLUMN_CHECK_STRCOL()                                                  \
    PSP_VERBOSE_ASSERT(m_isvlen, "Expected to use string column")
#else
#define COLUMN_CHECK_ACCESS(idx)
#define COLUMN_CHECK_VALUES()
#define COLUMN_CHECK_STRCOL()
#endif

class PERSPECTIVE_EXPORT t_column {
public:
#ifdef PSP_DBG_MALLOC
    PSP_NEW_DELETE(t_column)
#endif
    t_column();
    t_column(const t_column_recipe& recipe);
    t_column(t_dtype dtype, bool missing_enabled, const t_lstore_recipe& a);
    t_column(
        t_dtype dtype,
        bool missing_enabled,
        const t_lstore_recipe& a,
        t_uindex row_capacity
    );
    ~t_column();

    void column_copy_helper(const t_column& other);

    t_column(const t_column& c);
    t_column& operator=(const t_column&);

    void init();

    template <typename DATA_T>
    void push_back(DATA_T elem);

    template <typename DATA_T>
    void push_back(DATA_T elem, t_status status);

    t_dtype get_dtype() const;

    // Increases size by one and returns reference
    // to new element
    template <typename T>
    T* extend();

    template <typename T>
    T* extend(t_uindex idx);

    void extend_dtype(t_uindex idx);

    // idx is in bytes
    template <typename T>
    T* get(t_uindex idx);

    // idx is in bytes
    template <typename T>
    const T* get(t_uindex idx) const;

    // idx is in items
    template <typename T>
    T* get_nth(t_uindex idx);

    // idx is in items
    template <typename T>
    const T* get_nth(t_uindex idx) const;

    // Returns a raw pointer to the beginning of the typed data array.
    // Use for sequential/batched access to avoid per-element get_nth calls.
    template <typename T>
    const T* get_nth_base() const;

    template <typename T>
    T* get_nth_base();

    // idx is in items
    const t_status* get_nth_status(t_uindex idx) const;

    // idx is in items
    template <typename T>
    void set_nth(t_uindex idx, T v);

    template <typename T>
    void set_nth(t_uindex idx, T v, t_status status);

    void set_valid(t_uindex idx, bool valid);

    void set_status(t_uindex idx, t_status status);

    void set_size(t_uindex size);

    void reserve(t_uindex size);

    // object storage
    template <typename T>
    void object_copied(t_uindex ptr) const;
    void notify_object_copied(t_uindex idx) const;

    template <typename T>
    void object_cleared(t_uindex ptr) const;
    void notify_object_cleared(t_uindex idx) const;

    const t_lstore& data_lstore() const;

    t_uindex size() const;

    t_uindex get_vlenidx() const;

    const char* unintern_c(t_uindex idx) const;

    // Internal apis

    t_lstore* _get_data_lstore();

    t_vocab* _get_vocab();

    t_tscalar get_scalar(t_uindex idx) const;
    void set_scalar(t_uindex idx, t_tscalar value);

    bool is_status_enabled() const;

    bool is_valid(t_uindex idx) const;

    bool is_cleared(t_uindex idx) const;

    bool is_vlen() const;

    void append(const t_column& other);

    void clear();
    void clear_objects() const;

    template <typename VEC_T>
    void fill(VEC_T& vec, const t_uindex* bidx, const t_uindex* eidx) const;

    void pprint() const;

    template <typename DATA_T>
    void set_nth_body(t_uindex idx, DATA_T elem, t_status status);

    t_column_recipe get_recipe() const;

    // vocabulary must not contain empty string
    // indices should be > 0
    // scalars will be implicitly understood to be of dtype str
    template <typename VOCAB_T>
    void set_vocabulary(const VOCAB_T& vocab, size_t total_size = 0);

    void copy_vocabulary(const t_column* other);

    void pprint_vocabulary() const;

    template <typename DATA_T>
    void raw_fill(DATA_T v);

    std::shared_ptr<t_column> clone() const;

    std::shared_ptr<t_column> clone(const t_mask& mask) const;

    void valid_raw_fill();
    void invalid_raw_fill();

    template <typename DATA_T>
    void copy_helper(
        const t_column* other,
        const std::vector<t_uindex>& indices,
        t_uindex offset
    );

    void copy(
        const t_column* other,
        const std::vector<t_uindex>& indices,
        t_uindex offset
    );

    void clear(t_uindex idx);
    void clear(t_uindex idx, t_status status);

    void unset(t_uindex idx);

    void verify() const;
    void verify_size() const;
    void verify_size(t_uindex idx) const;

    t_uindex get_interned(const std::string& s);
    t_uindex get_interned(const char* s);
    void _rebuild_map();

    void borrow_vocabulary(const t_column& o);

private:
    t_dtype m_dtype;
    bool m_init;
    bool m_isvlen;

    // For varlen columns this
    // contains t_uindex encoded ids
    std::shared_ptr<t_lstore> m_data;

    std::shared_ptr<t_vocab> m_vocab;

    // Missing value support
    std::shared_ptr<t_lstore> m_status;

    t_uindex m_size;

    bool m_status_enabled;

    bool m_from_recipe;

    std::uint32_t m_elemsize;
};

template <>
PERSPECTIVE_EXPORT void t_column::push_back<const char*>(const char* elem);

template <>
PERSPECTIVE_EXPORT void t_column::push_back<char*>(char* elem);

template <>
PERSPECTIVE_EXPORT void t_column::push_back<std::string>(std::string elem);

template <>
PERSPECTIVE_EXPORT void t_column::push_back<t_tscalar>(t_tscalar elem);

template <>
PERSPECTIVE_EXPORT void
t_column::set_nth<const char*>(t_uindex idx, const char* elem);

template <>
PERSPECTIVE_EXPORT void
t_column::set_nth<std::string>(t_uindex idx, std::string elem);

template <>
PERSPECTIVE_EXPORT void
t_column::set_nth<const char*>(t_uindex idx, const char* elem, t_status status);

template <>
PERSPECTIVE_EXPORT void
t_column::set_nth<std::string>(t_uindex idx, std::string elem, t_status status);

template <>
PERSPECTIVE_EXPORT const char* t_column::get_nth<const char>(t_uindex idx
) const;

template <typename T>
T*
t_column::get(t_uindex idx) {
    return m_data->get<T>(idx);
}

template <typename T>
const T*
t_column::get(t_uindex idx) const {
    return m_data->get<T>(idx);
}

template <typename T>
T*
t_column::get_nth(t_uindex idx) {
    COLUMN_CHECK_ACCESS(idx);
    return m_data->get_nth<T>(idx);
}

template <typename T>
const T*
t_column::get_nth(t_uindex idx) const {
    COLUMN_CHECK_ACCESS(idx);
    return m_data->get_nth<T>(idx);
}

template <typename T>
const T*
t_column::get_nth_base() const {
    return m_data->get_nth<T>(0);
}

template <typename T>
T*
t_column::get_nth_base() {
    return m_data->get_nth<T>(0);
}

template <typename T>
T*
t_column::extend() {
    return extend<T>(1);
}

template <typename T>
T*
t_column::extend(t_uindex idx) {
    T* rv = m_data->extend<T>(idx);
    m_size += idx;
    return rv;
}

template <typename DATA_T>
void
t_column::push_back(DATA_T elem) {
    m_data->push_back(elem);
    ++m_size;
}

template <typename DATA_T>
void
t_column::push_back(DATA_T elem, t_status status) {
    PSP_VERBOSE_ASSERT(is_status_enabled(), "Validity not enabled for column");
    m_data->push_back(elem);
    m_status->push_back(status);
    ++m_size;
}

// idx is in items

template <typename T>
void
t_column::set_nth(t_uindex idx, T v) {
    COLUMN_CHECK_ACCESS(idx);
    m_data->set_nth<T>(idx, v);

    if (is_status_enabled()) {
        m_status->set_nth<t_status>(idx, STATUS_VALID);
    }
}

template <typename T>
void
t_column::set_nth(t_uindex idx, T v, t_status status) {
    COLUMN_CHECK_ACCESS(idx);
    m_data->set_nth<T>(idx, v);

    if (is_status_enabled()) {
        m_status->set_nth<t_status>(idx, status);
    }
}

template <>
void t_column::fill<std::vector<const char*>>(
    std::vector<const char*>& vec, const t_uindex* bidx, const t_uindex* eidx
) const;

template <typename VEC_T>
void
t_column::fill(VEC_T& vec, const t_uindex* bidx, const t_uindex* eidx) const {

    PSP_VERBOSE_ASSERT(eidx - bidx > 0, "Invalid pointers passed in");

    for (t_uindex idx = 0, loop_end = eidx - bidx; idx < loop_end; ++idx)

    {
        vec[idx] = *(get_nth<typename VEC_T::value_type>(*(bidx + idx)));
    }
}

template <typename DATA_T>
void
t_column::set_nth_body(t_uindex idx, DATA_T elem, t_status status) {
    COLUMN_CHECK_ACCESS(idx);
    PSP_VERBOSE_ASSERT(m_dtype == DTYPE_STR, "Setting non string column");
    t_uindex interned = m_vocab->get_interned(elem);
    m_data->set_nth<t_uindex>(idx, interned);

    if (is_status_enabled()) {
        m_status->set_nth<t_status>(idx, status);
    }
}

// object storage, specialize only for std::uint64_t
template <>
void t_column::object_copied<std::uint64_t>(t_uindex ptr) const;

template <>
void t_column::object_cleared<std::uint64_t>(t_uindex ptr) const;

template <typename DATA_T>
void
t_column::raw_fill(DATA_T v) {
    m_data->raw_fill(v);
}

template <typename VOCAB_T>
void
t_column::set_vocabulary(const VOCAB_T& vocab, size_t total_size) {
    if (total_size) {
        m_vocab->reserve(total_size, vocab.size() + 1);
    }

    for (const auto& kv : vocab) {
        m_vocab->get_interned(kv.first.get_char_ptr());
    }
}

template <>
void t_column::copy_helper<const char>(
    const t_column* other, const std::vector<t_uindex>& indices, t_uindex offset
);

template <typename DATA_T>
void
t_column::copy_helper(
    const t_column* other, const std::vector<t_uindex>& indices, t_uindex offset
) {

    t_uindex eidx =
        std::min(other->size(), static_cast<t_uindex>(indices.size()));
    reserve(eidx + offset);

    const DATA_T* o_base = other->get_nth<DATA_T>(0);
    DATA_T* base = get_nth<DATA_T>(0);

    for (t_uindex idx = 0; idx < eidx; ++idx) {
        base[idx + offset] = o_base[indices[idx]];
    }

    if (is_status_enabled() && other->is_status_enabled()) {
        for (t_uindex idx = 0; idx < eidx; ++idx) {
            set_status(idx + offset, *other->get_nth_status(indices[idx]));
        }
    }
    COLUMN_CHECK_VALUES();
}

inline void
scol_set(t_column* c, t_uindex row_idx, const char* s) {
    c->set_nth<const char*>(row_idx, s);
}

} // end namespace perspective
