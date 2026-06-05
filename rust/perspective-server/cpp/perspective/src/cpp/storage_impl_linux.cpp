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

// NB: `first.h` force-defines `__linux__` on any non-mac/non-win platform,
// *including emscripten*. Exclude WASM here so `storage_impl_wasm.cpp` (and not
// this `open`/`mmap` implementation) provides the storage backend on WASM.
#if defined(__linux__) && !defined(PSP_ENABLE_WASM)
#include <perspective/base.h>
#include <perspective/raw_types.h>
#include <perspective/storage.h>
#include <perspective/raii.h>
#include <perspective/defaults.h>
#include <perspective/compat.h>
#include <perspective/utils.h>
#include <iostream>
#include <assert.h>
#include <csignal>
#include <iostream>
#include <map>
#include <sstream>
#include <vector>
#include <csignal>
#include <unistd.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <sys/stat.h>

namespace perspective {

t_lstore::t_lstore(const t_lstore_recipe& a) :
    m_base(0),
    m_dirname(a.m_dirname),
    m_colname(a.m_colname),
    m_fd(-1),
    m_capacity(a.m_capacity),
    m_size(0),
    m_alignment(a.m_alignment),
    m_fflags(a.m_fflags),
    m_fmode(a.m_fmode),
    m_creation_disposition(a.m_creation_disposition),
    m_mprot(a.m_mprot),
    m_mflags(a.m_mflags),
    m_backing_store(a.m_backing_store),
    m_init(false),
    m_resize_factor(1.3),
    m_version(0),
    m_from_recipe(a.m_from_recipe) {
    if (m_from_recipe) {
        m_fname = a.m_fname;
        return;
    }

    if (m_backing_store == BACKING_STORE_DISK) {
        std::stringstream ss;
        ss << a.m_dirname << "/"
           << "_col_" << a.m_colname << "_" << this;
        m_fname = unique_path(ss.str());
    }
}

t_handle
t_lstore::create_file() {
    t_handle fd = open(m_fname.c_str(), m_fflags, m_fmode);
    PSP_VERBOSE_ASSERT(fd != -1, "Error opening file");

    if (m_from_recipe) {
        return fd;
    }

    t_index truncate_bytes = static_cast<t_index>(capacity());

    t_index rcode = ftruncate(fd, truncate_bytes);

    PSP_VERBOSE_ASSERT(rcode >= 0, "Ftruncate failed");
    return fd;
}

void*
// NOLINTNEXTLINE
t_lstore::create_mapping() {
    void* rval = mmap(0, capacity(), m_mprot, m_mflags, m_fd, 0);
    PSP_VERBOSE_ASSERT(rval != MAP_FAILED, "mmap failed");
    return rval;
}

void
t_lstore::resize_mapping(t_uindex cap_new) {
    t_index rcode = ftruncate(m_fd, cap_new);
    PSP_VERBOSE_ASSERT(rcode == 0, "ftruncate failed");
    void* base = mremap(m_base, capacity(), cap_new, MREMAP_MAYMOVE);

    if (base == MAP_FAILED) {
        PSP_COMPLAIN_AND_ABORT("mremap failed!");
    }

    m_base = base;
    m_capacity = cap_new;
}

void
t_lstore::destroy_mapping() {
    if (m_base == nullptr) {
        return; // already evicted
    }
    t_index rc = munmap(m_base, capacity());
    PSP_VERBOSE_ASSERT(!rc, "Failed to destroy mapping");
}

void
t_lstore::freeze_impl() {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

void
t_lstore::unfreeze_impl() {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

} // end namespace perspective

#endif
