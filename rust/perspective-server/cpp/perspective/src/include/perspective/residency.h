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
#include <perspective/exports.h>
#include <perspective/raw_types.h>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_set>
#include <vector>

namespace perspective {

class t_lstore;

// Hot-path flags read by `t_lstore::ensure_resident()`. Plain globals so the
// common (residency-disabled) case is a single predicted-not-taken branch with
// no indirection. Owned/updated by `t_residency_manager`.
PERSPECTIVE_EXPORT extern bool g_residency_active;
PERSPECTIVE_EXPORT extern std::uint64_t g_residency_tick;

/**
 * @brief Bounds the resident (in linear-memory) footprint of `BACKING_STORE_DISK`
 * column buffers, evicting the coldest ones to their backing files when over a
 * configured byte budget and transparently restoring them on next access.
 *
 * This is what turns on-disk backing into actual *memory relief* on WASM, where
 * there is no demand paging: an evicted store's `m_base` buffer is freed (its
 * data flushed to the backing file) and re-read on demand. Eviction runs only at
 * request *safepoints* (between requests, when no live raw column pointer
 * exists — see the safepoint audit), and restoration is lazy via
 * `ensure_resident()` on every `t_lstore` data accessor.
 *
 * Disabled by default (zero overhead). Enabled by setting the `PSP_MEMORY_BUDGET`
 * environment variable (bytes), re-read at each safepoint.
 */
class PERSPECTIVE_EXPORT t_residency_manager {
public:
    static t_residency_manager& inst();

    // Disk-backed stores register on `init()` and unregister on destruction.
    void register_store(t_lstore* store);
    void unregister_store(t_lstore* store);

    std::size_t prepare();
    const char* victim_fname(std::size_t i) const;
    void commit();
    void safepoint();

    // Total bytes currently resident across registered disk-backed stores.
    std::size_t resident_bytes();

    bool active() const { return g_residency_active; }
    std::size_t budget() const { return m_budget; }
    std::uint64_t evictions() const { return m_evictions; }
    std::uint64_t restores() const { return m_restores; }

    // Serializes lazy restores (which may occur from parallel-for workers within
    // a request) against each other and the safepoint eviction pass.
    std::mutex& mutex() { return m_mutex; }
    void note_restore() { ++m_restores; }

private:
    t_residency_manager() = default;
    void refresh_config();

    std::size_t m_budget = 0;
    std::uint64_t m_tick = 0;
    std::uint64_t m_evictions = 0;
    std::uint64_t m_restores = 0;
    std::unordered_set<t_lstore*> m_stores;
    // Victims selected by `prepare()`, evicted by `commit()`. Held between the
    // two phases while the JS driver opens their OPFS handles. `m_pending_fnames`
    // owns stable C-strings for `victim_fname()` (a `t_lstore::get_fname()` temp
    // would dangle).
    std::vector<t_lstore*> m_pending;
    std::vector<std::string> m_pending_fnames;
    std::mutex m_mutex;
};

} // namespace perspective
