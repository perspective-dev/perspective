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

#ifdef PSP_ENABLE_WASM

#include <perspective/first.h>
#include <perspective/base.h>
#include <perspective/compat.h>
#include <perspective/opfs.h>
#include <perspective/raii.h>
#include <perspective/raw_types.h>
#include <perspective/utils.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <unistd.h>
#include <stdio.h>

namespace perspective {
static void map_file_internal_(
    const std::string& fname,
    t_fflag fflag,
    t_fflag fmode,
    t_fflag creation_disposition,
    t_fflag mprot,
    t_fflag mflag,
    bool is_read,
    t_uindex size,
    t_rfmapping& out
);

t_uindex
file_size(t_handle h) {
    struct stat st {};
    if (fstat(h, &st) != 0) {
        return 0;
    }
    return static_cast<t_uindex>(st.st_size);
}

void
close_file(t_handle h) {
    // On WASM (NO_FILESYSTEM) disk stores are backed by the OPFS/node-fs bridge
    // keyed by filename, not real fds — `create_file()` returns a sentinel (1).
    // Closing it issued `fd_close(1)` (stdout) on every disk-column free; never
    // touch the std streams (0/1/2). Real fds (none under NO_FILESYSTEM) close.
    if (h > 2) {
        close(h);
    }
}

void
flush_mapping(void* base, t_uindex len) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

t_rfmapping::~t_rfmapping() {}

static void
map_file_internal_(
    const std::string& fname,
    t_fflag fflag,
    t_fflag fmode,
    t_fflag creation_disposition,
    t_fflag mprot,
    t_fflag mflag,
    bool is_read,
    t_uindex size,
    t_rfmapping& out
) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

void
map_file_read(const std::string& fname, t_rfmapping& out) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

void
map_file_write(const std::string& fname, t_uindex size, t_rfmapping& out) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

std::int64_t
psp_curtime() {
    // CLOCK_MONOTONIC and clock_gettime are not implemented in OSX < 10.12,
    // and it breaks builds on conda-forge. Because this method is only called
    // in logging and trace functions that are not called in the codebase,
    // deprecate this method for OSX and return 0.

    // struct timespec t;
    // std::int32_t rcode = clock_gettime(CLOCK_MONOTONIC, &t);
    // PSP_VERBOSE_ASSERT(rcode, == 0, "Failure in clock_gettime");
    // std::int64_t ns = t.tv_nsec + t.tv_sec * 1000000000;
    return 0;
}

std::int64_t
get_page_size() {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

std::int64_t
psp_curmem() {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

void
set_thread_name(std::thread& thr, const std::string& name) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

void
set_thread_name(const std::string& name) {
    // prctl(PR_SET_NAME, name.c_str(), 0, 0, 0);
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

void
rmfile(const std::string& fname) {
#ifdef PSP_HAS_OPFS_BRIDGE
    // Close the kept-open OPFS sync access handle and delete the backing file.
    // (`unlink` is a no-op under `NO_FILESYSTEM`, and would leak the open handle
    // the residency bridge holds for this file.)
    psp_opfs_remove(fname.c_str());
#else
    unlink(fname.c_str());
#endif
}

void
launch_proc(const std::string& cmdline) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

std::string
cwd() {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
    return "";
}

void*
psp_dbg_malloc(size_t size) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
    return nullptr;
}

void
psp_dbg_free(void* mem) {
    PSP_COMPLAIN_AND_ABORT("Not implemented");
}

} // end namespace perspective

#endif
