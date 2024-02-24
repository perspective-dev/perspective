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
#include <perspective/portable.h>
SUPPRESS_WARNINGS_VC(4505)
#include <cstdlib>
#include <cassert>
#include <csignal>
#include <iostream>
#include <map>
#include <perspective/base.h>
#include <perspective/compat.h>
#include <perspective/defaults.h>
#include <perspective/raii.h>
#include <perspective/raw_types.h>
#include <perspective/storage.h>
#include <perspective/tracing.h>
#include <perspective/utils.h>
#include <perspective/env_vars.h>
#include <sstream>
#include <utility>
#include <vector>
#include <fstream>
#ifndef WIN32
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace perspective {

t_lstore_recipe::t_lstore_recipe() : m_alignment(0), m_from_recipe(false) {}

t_lstore_recipe::t_lstore_recipe(t_uindex capacity) :
    m_capacity(capacity),
    m_size(0),
    m_alignment(0),
    m_fflags(PSP_DEFAULT_FFLAGS),
    m_fmode(PSP_DEFAULT_FMODE),
    m_creation_disposition(PSP_DEFAULT_CREATION_DISPOSITION),
    m_mprot(PSP_DEFAULT_MPROT),
    m_mflags(PSP_DEFAULT_MFLAGS),
    m_backing_store(BACKING_STORE_MEMORY),
    m_from_recipe(false)

{
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore_recipe");
}

t_lstore_recipe::t_lstore_recipe(
    std::string dirname,
    std::string colname,
    t_uindex capacity,
    t_backing_store backing_store
) :
    m_dirname(std::move(dirname)),
    m_colname(std::move(colname)),
    m_capacity(capacity),
    m_size(0),
    m_alignment(0),
    m_fflags(PSP_DEFAULT_FFLAGS),
    m_fmode(PSP_DEFAULT_FMODE),
    m_creation_disposition(PSP_DEFAULT_CREATION_DISPOSITION),
    m_mprot(PSP_DEFAULT_MPROT),
    m_mflags(PSP_DEFAULT_MFLAGS),
    m_backing_store(backing_store),
    m_from_recipe(false) {
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore_recipe");
}

t_lstore_recipe::t_lstore_recipe(
    std::string dirname,
    std::string colname,
    t_uindex capacity,
    t_fflag fflags,
    t_fflag fmode,
    t_fflag creation_disposition,
    t_fflag mprot,
    t_fflag mflags,
    t_backing_store backing_store
) :
    m_dirname(std::move(dirname)),
    m_colname(std::move(colname)),
    m_capacity(capacity),
    m_size(0),
    m_alignment(0),
    m_fflags(fflags),
    m_fmode(fmode),
    m_creation_disposition(creation_disposition),
    m_mprot(mprot),
    m_mflags(mflags),
    m_backing_store(backing_store),
    m_from_recipe(false) {
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore_recipe");
}

t_lstore_recipe::t_lstore_recipe(
    std::string colname,
    t_uindex capacity,
    t_fflag mprot,
    t_fflag mflags,
    t_backing_store backing_store
) :
    m_colname(std::move(colname)),
    m_capacity(capacity),
    m_size(0),
    m_alignment(0),
    m_fflags(PSP_DEFAULT_FFLAGS),
    m_fmode(PSP_DEFAULT_FMODE),
    m_creation_disposition(PSP_DEFAULT_CREATION_DISPOSITION),
    m_mprot(mprot),
    m_mflags(mflags),
    m_backing_store(backing_store),
    m_from_recipe(false) {
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore_recipe");
}

t_lstore::t_lstore() :
    m_base(nullptr),
    m_fd(0),
    m_capacity(0),
    m_size(0),
    m_alignment(0),
    m_backing_store(BACKING_STORE_MEMORY),
    m_init(false),
    m_resize_factor(1.2),
    m_version(0) {

    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore");
#ifdef PSP_MPROTECT
    PSP_VERBOSE_ASSERT(
        sizeof(t_lstore) == get_page_size(), "Bad lstore sizeof"
    );
#endif
}

t_lstore::t_lstore(const t_lstore& s, t_lstore_tmp_init_tag t) {
    PSP_VERBOSE_ASSERT(this != &s, "Initializing from self");
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore");
    copy_helper(s);
    m_version = 0;
    m_base = nullptr;
    m_size = 0;
    m_alignment = 0;
    m_fd = 0;
    m_init = false;
    if (s.m_backing_store == BACKING_STORE_DISK) {
        m_fname = s.get_desc_fname();
    }
    init();
    set_size(s.size());
#ifdef PSP_MPROTECT
    PSP_VERBOSE_ASSERT(
        sizeof(t_lstore) == get_page_size(), "Bad lstore sizeof"
    );
    freeze_impl();
#endif
}

std::string
t_lstore::repr() const {
    std::stringstream ss;
    ss << "t_lstore<" << this << ">";
    return ss.str();
}

void
t_lstore::copy_helper(t_lstore& other) {
    PSP_TRACE_SENTINEL();
    copy_helper_(other);
}

void
t_lstore::copy_helper(const t_lstore& other) {
    PSP_TRACE_SENTINEL();
    copy_helper_(other);
}

void
t_lstore::copy_helper_(const t_lstore& other) {
    PSP_TRACE_SENTINEL();
    m_dirname = other.m_dirname;
    m_fname = other.m_fname;
    m_colname = other.m_colname;
    m_base = nullptr;
    m_fd = other.m_fd;
    m_capacity = other.m_capacity;
    m_size = other.m_size;
    m_alignment = other.m_alignment;
    m_fflags = other.m_fflags;
    m_fmode = other.m_fmode;
    m_creation_disposition = other.m_creation_disposition;
    m_mprot = other.m_mprot;
    m_mflags = other.m_mflags;
    m_backing_store = other.m_backing_store;
    m_init = false;
    m_resize_factor = other.m_resize_factor;
    m_version = other.m_version;
    m_from_recipe = other.m_from_recipe;
    PSP_CHECK_CAPACITY();
}

t_lstore::t_lstore(t_lstore&& other) noexcept {
    PSP_VERBOSE_ASSERT(this != &other, "Constructing from self");
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore");
    copy_helper(other);
    m_init = false;
}

t_lstore&
t_lstore::operator=(t_lstore&& other) noexcept {
    PSP_VERBOSE_ASSERT(this != &other, "Assigning self");
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_lstore");
    copy_helper(other);
    m_init = false;
    return *this;
}

t_lstore::~t_lstore() {
    PSP_TRACE_SENTINEL();
    if (!m_init) {
        return;
    }

    switch (m_backing_store) {
        case BACKING_STORE_DISK: {
            destroy_mapping();
            close_file(m_fd);

            bool dont_delete =
                std::getenv("PSP_DO_NOT_DELETE_TABLES") != nullptr;

            if (!dont_delete) {
                rmfile(m_fname);
            }
        } break;
        case BACKING_STORE_MEMORY: {
#ifdef _MSC_VER
            if (m_alignment >= 2) {
                _aligned_free(m_base); // seriously
            } else
#endif // _MSC_VER
            {
                free(m_base);
            }

#ifdef PSP_MPROTECT
            unfreeze_impl();
#endif
        } break;
        default: {
            PSP_VERBOSE_ASSERT(false, "Unknown backing store");
        } break;
    }
}

void
t_lstore::set_size(t_uindex idx) // in bytes
{
    PSP_TRACE_SENTINEL();
    t_unlock_store tmp(this);
#ifdef PSP_VERIFY
    PSP_VERBOSE_ASSERT(m_size <= m_capacity, "Setting bad size");
#endif
    m_size = idx;
}

void
t_lstore::init() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(!m_init, "Already inited column");
    LOG_INIT("t_lstore");

    t_unlock_store tmp(this);
    switch (m_backing_store) {
        case BACKING_STORE_DISK: {
            PSP_VERBOSE_ASSERT(
                m_alignment < 2,
                "nontrivial alignments currently "
                "unsupported for BACKING_STORE_DISK"
            );
            m_fd = create_file();
            m_base = create_mapping();
        } break;
        case BACKING_STORE_MEMORY: {
            size_t const alloc_size = std::max(
                std::max(size_t(m_alignment), size_t(8U)), size_t(capacity())
            );

            if (m_alignment < 2) {
                m_base = calloc(alloc_size, 1);
            } else {
                // nontrivial alignment
                PSP_VERBOSE_ASSERT(
                    !(m_alignment & (m_alignment - 1)),
                    "store alignment must be a power of two!"
                );

#ifdef _MSC_VER
                m_base = _aligned_malloc(alloc_size, size_t(m_alignment));
#else
                int result = posix_memalign(
                    &m_base,
                    std::max(sizeof(void*), size_t(m_alignment)),
                    alloc_size
                );
                if (result != 0) {
                    m_base = nullptr;
                }
#endif

                PSP_VERBOSE_ASSERT(
                    m_base,
                    "MALLOC_FAILED"
                ); // ensure we check before trying to
                   // memset() in this case
                memset(m_base, 0, alloc_size);
            }

            PSP_VERBOSE_ASSERT(m_base, "MALLOC_FAILED");
        } break;
        default: {
            PSP_VERBOSE_ASSERT(false, "Unknown backing store");
        } break;
    }

    m_init = true;
}

void
t_lstore::reserve(t_uindex capacity) {
    reserve_impl(capacity, false);
}

void
t_lstore::shrink(t_uindex capacity) {
    reserve_impl(capacity, true);
}

void
t_lstore::reserve_impl(t_uindex capacity, bool allow_shrink) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    if ((capacity < m_capacity) && !allow_shrink) {
        return;
    }

    PSP_VERBOSE_ASSERT(
        capacity >= m_size, "reduce size before reducing capacity!"
    );
    capacity = std::max(capacity, m_size);

    capacity = 4 * std::uint64_t(ceil(double(capacity * m_resize_factor) / 4));
    capacity = std::max(capacity, static_cast<t_uindex>(8));
    if (m_alignment > 1) {
        capacity = (capacity + m_alignment - 1) & ~(m_alignment - 1);
    }
    t_uindex ocapacity = m_capacity;

    if (t_env::log_storage_resize()) {
        std::cout << repr() << " ocap => " << ocapacity << " ncap => "
                  << capacity << std::endl;
    }

    switch (m_backing_store) {
        case BACKING_STORE_MEMORY: {
            void* base = nullptr;

            if (m_alignment < 2) {
                base = realloc(m_base, size_t(capacity));
            } else {
// nontrivial alignment
#if _MSC_VER
                base = _aligned_realloc(
                    m_base, size_t(capacity), size_t(m_alignment)
                );
#else
                base = realloc(m_base, size_t(capacity));

                if ((uintptr_t(base) & (m_alignment - 1)) != 0) {
                    // realloc() hasn't given us the correct alignment
                    // so we need to fix it up
                    PSP_VERBOSE_ASSERT(
                        !(m_alignment & (m_alignment - 1)),
                        "store alignment must be a power of two!"
                    );

                    void* aligned_base = nullptr;
                    int result = posix_memalign(
                        &aligned_base,
                        std::max(sizeof(void*), size_t(m_alignment)),
                        size_t(capacity)
                    );
                    PSP_VERBOSE_ASSERT(result, == 0, "posix_memalign failed");

                    memcpy(aligned_base, base, ocapacity);
                    free(base);
                    base = aligned_base;
                }
#endif
            }

            PSP_VERBOSE_ASSERT(base != nullptr, "realloc failed");
            {
                t_unlock_store tmp(this);
                m_base = base;
                m_capacity = capacity;
                ++m_version;
            }
        } break;
        case BACKING_STORE_DISK: {
            PSP_VERBOSE_ASSERT(
                m_alignment < 2,
                "nontrivial alignments currently "
                "unsupported for BACKING_STORE_DISK"
            );
            resize_mapping(capacity);
            ++m_version;
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("unknown backing medium");
        }
    }

    if (capacity > ocapacity) {
        memset(
            static_cast<unsigned char*>(m_base) + ocapacity,
            0,
            size_t(capacity - ocapacity)
        );
    }
}

// Assumes store has been initted
void
t_lstore::load(const std::string& fname) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    t_rfmapping imap;
    map_file_read(fname, imap);
    reserve(imap.m_size);
    memcpy(m_base, imap.m_base, size_t(imap.m_size));
    m_size = imap.m_size;
    PSP_CHECK_CAPACITY();
}

void
t_lstore::save(const std::string& fname) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_VERBOSE_ASSERT(m_init, "Store not inited.");

    t_rfmapping omap;
    map_file_write(fname, capacity(), omap);
    memcpy(omap.m_base, m_base, size_t(capacity()));
}

void
t_lstore::copy(t_lstore& out) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_COMPLAIN_AND_ABORT("copy is unimplemented!");
}

void
t_lstore::warmup() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
}

t_uindex
t_lstore::size() const {
    PSP_TRACE_SENTINEL();
    return m_size;
}

t_uindex
t_lstore::capacity() const {
    PSP_TRACE_SENTINEL();
    return m_capacity;
}

std::pair<std::uint32_t, std::uint32_t>
t_lstore::capacity_pair() const {
    PSP_TRACE_SENTINEL();
    t_uindex cap = capacity();
    return std::pair<std::uint32_t, std::uint32_t>(upper32(cap), lower32(cap));
}

std::string
t_lstore::get_fname() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_fname;
}

void
t_lstore::push_back(const void* ptr, t_uindex len) {
    PSP_TRACE_SENTINEL();
    if (m_size + len >= m_capacity) {
        reserve(static_cast<t_uindex>(m_size + len)
        ); // reserve() will multiply by m_resize_factor internally
    }

    PSP_VERBOSE_ASSERT(m_size + len < m_capacity, "Insufficient capacity.");

    memcpy(static_cast<unsigned char*>(m_base) + m_size, ptr, size_t(len));

    {
        t_unlock_store tmp(this);
        m_size += len;
    }
    PSP_CHECK_CAPACITY();
}

void*
t_lstore::get_ptr(t_uindex offset) {
    return static_cast<void*>(static_cast<unsigned char*>(m_base) + offset);
}

const void*
t_lstore::get_ptr(t_uindex offset) const {
    return static_cast<void*>(static_cast<unsigned char*>(m_base) + offset);
}

std::string
t_lstore::get_desc_fname() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return unique_path(m_fname);
}

t_uindex
t_lstore::get_version() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_version;
}

void
t_lstore::append(const t_lstore& other) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    push_back(other.m_base, other.size());
}

void
t_lstore::clear() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
#ifndef PSP_ENABLE_WASM
    memset(m_base, 0, size_t(capacity()));
#endif
    {
        t_unlock_store tmp(this);
        m_size = 0;
    }
}

t_lstore_recipe
t_lstore::get_recipe() const {
    t_lstore_recipe rval(
        m_dirname,
        m_colname,
        m_capacity,
        PSP_DEFAULT_SHARED_RO_FFLAGS,
        PSP_DEFAULT_SHARED_RO_FMODE,
        PSP_DEFAULT_SHARED_RO_CREATION_DISPOSITION,
        PSP_DEFAULT_SHARED_RO_MPROT,
        PSP_DEFAULT_SHARED_RO_MFLAGS,
        m_backing_store
    );
    rval.m_fname = m_fname;
    rval.m_from_recipe = true;
    rval.m_size = m_size;
    rval.m_alignment = m_alignment;
    return rval;
}

void
t_lstore::fill(const t_lstore& other) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    reserve(other.size());
    memcpy(m_base, const_cast<void*>(other.m_base), size_t(other.size()));
    set_size(other.size());
}

void
t_lstore::fill(const t_lstore& other, const t_mask& mask, t_uindex elem_size) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    reserve(mask.size() * elem_size);

    PSP_VERBOSE_ASSERT(
        mask.size() * elem_size <= m_size, "Not enough space to fill"
    );

    t_uindex offset = 0;

    const auto* src_base = reinterpret_cast<const char*>(other.get_ptr(0));
    auto* dst_base = reinterpret_cast<char*>(m_base);

    for (t_uindex idx = 0, loop_end = mask.size(); idx < loop_end; ++idx) {
        if (mask.get(idx)) {
            memcpy(
                dst_base + offset, src_base + idx * elem_size, size_t(elem_size)
            );
            offset += elem_size;
        }
    }

    set_size(mask.count() * elem_size);
}

void
t_lstore::pprint() const {
    std::cout << repr() << std::endl;
    t_uindex nelems = size() / sizeof(std::uint8_t);
    for (t_uindex idx = 0; idx < size() / nelems; ++idx) {

        std::cout << idx << " => "
                  << static_cast<t_uindex>(*(get_nth<std::uint8_t>(idx)))
                  << std::endl;
    }
}

std::shared_ptr<t_lstore>
t_lstore::clone() const {
    auto recipe = get_recipe();
    std::shared_ptr<t_lstore> rval(new t_lstore(recipe));
    rval->init();
    rval->set_size(m_size);
    rval->fill(*this);
    return rval;
}

} // end namespace perspective
