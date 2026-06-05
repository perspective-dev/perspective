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

#ifdef PSP_ENABLE_WASM

#include <perspective/base.h>
#include <perspective/raw_types.h>
#include <perspective/storage.h>
#include <perspective/raii.h>
#include <perspective/defaults.h>
#include <perspective/compat.h>
#include <perspective/utils.h>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>

namespace perspective {

// ┌─────────────────────────────────────────────────────────────────────────┐
// │ Emulated mmap over WasmFS/OPFS                                            │
// │                                                                           │
// │ WasmFS has no usable file-backed `mmap` (and even where one exists it     │
// │ copies the whole file into linear memory), so `BACKING_STORE_DISK` on     │
// │ WASM keeps a resident `malloc` buffer (`m_base`) that mirrors the backing │
// │ file. Reads/writes go through `m_base`; the file is the durable copy that │
// │ is (re)read via `pread` on mapping and written via `pwrite` on flush.     │
// │                                                                           │
// │ Within a session `m_base` is the source of truth — the file is sized to   │
// │ match (so a later read/restore is correct) but is only written when the   │
// │ buffer is flushed. This is the substrate the residency manager (Phase 4)  │
// │ evicts: `pwrite` the buffer, `free` it, keep the file; restore by         │
// │ re-`pread`ing into a fresh buffer.                                        │
// └─────────────────────────────────────────────────────────────────────────┘

t_lstore::t_lstore(const t_lstore_recipe& a) :
    m_base(nullptr),
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

// A disk-backed column on WASM is just a resident `malloc` buffer; there is no
// OS file (the build is `NO_FILESYSTEM`). Persistence to OPFS is performed by
// the residency manager (`t_lstore::evict`/`restore` in storage.cpp) via the
// `psp_opfs_*` bridge, at promising safepoints. `m_fname` is the OPFS key.

t_handle
t_lstore::create_file() {
    // No OS file; return a sentinel handle.
    return 1;
}

void*
t_lstore::create_mapping() {
    auto cap = static_cast<size_t>(capacity());
    void* base = calloc(std::max(cap, static_cast<size_t>(1)), 1);
    PSP_VERBOSE_ASSERT(base != nullptr, "calloc failed");
    return base;
}

void
t_lstore::resize_mapping(t_uindex cap_new) {
    void* base = realloc(m_base, static_cast<size_t>(cap_new));
    PSP_VERBOSE_ASSERT(base != nullptr, "realloc failed");
    m_base = base;
    m_capacity = cap_new;
}

void
t_lstore::destroy_mapping() {
    if (m_base != nullptr) {
        free(m_base);
        m_base = nullptr;
    }
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
