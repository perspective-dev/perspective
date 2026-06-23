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
#include <perspective/residency.h>
#include <perspective/storage.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <vector>

namespace perspective {

bool g_residency_active = false;
std::uint64_t g_residency_tick = 0;

t_residency_manager&
t_residency_manager::inst() {
    static t_residency_manager s_inst;
    return s_inst;
}

void
t_residency_manager::register_store(t_lstore* store) {
    std::lock_guard<std::mutex> lk(m_mutex);
    m_stores.insert(store);
}

void
t_residency_manager::unregister_store(t_lstore* store) {
    std::lock_guard<std::mutex> lk(m_mutex);
    m_stores.erase(store);
}

// Hard-coded residency budget (bytes) for WASM. A browser has no environment,
// so `PSP_MEMORY_BUDGET` is unreachable there — without a budget, residency is
// inert, on-disk columns never evict to OPFS, and the heap can grow past the
// 2GB signed-pointer ceiling. This caps resident disk-backed column buffers so
// the cold set is flushed to OPFS. Tunable via `-DPSP_WASM_MEMORY_BUDGET=...`.
#ifndef PSP_WASM_MEMORY_BUDGET
#define PSP_WASM_MEMORY_BUDGET (1024ull * 1024ull * 1024ull) // 1 GiB
#endif

void
t_residency_manager::refresh_config() {
    std::size_t budget = 0;
#ifdef PSP_ENABLE_WASM
    budget = static_cast<std::size_t>(PSP_WASM_MEMORY_BUDGET);
#else
    const char* budget_env = std::getenv("PSP_MEMORY_BUDGET");
    if (budget_env != nullptr) {
        budget = static_cast<std::size_t>(std::strtoull(budget_env, nullptr, 10));
    }
#endif

    bool was_active = g_residency_active;
    m_budget = budget;
    g_residency_active = budget > 0;

    // If residency was just disabled, restore every evicted store so the lazy
    // `ensure_resident()` hook (
    // now a no-op) never sees a null `m_base`.
    if (was_active && !g_residency_active) {
        for (auto* store : m_stores) {
            store->restore();
        }
    }
}

std::size_t
t_residency_manager::resident_bytes() {
    std::lock_guard<std::mutex> lk(m_mutex);
    std::size_t total = 0;
    for (auto* store : m_stores) {
        if (store->is_resident()) {
            total += store->capacity();
        }
    }

    return total;
}

std::size_t
t_residency_manager::prepare() {
    refresh_config();
    std::lock_guard<std::mutex> lk(m_mutex);
    m_pending.clear();
    m_pending_fnames.clear();

    if (!g_residency_active) {
        return 0;
    }

    g_residency_tick = ++m_tick;
    std::size_t resident = 0;
    std::vector<t_lstore*> candidates;
    candidates.reserve(m_stores.size());
    for (auto* store : m_stores) {
        if (store->is_resident()) {
            resident += store->capacity();
            candidates.push_back(store);
        }
    }

    if (resident <= m_budget) {
        return 0;
    }

    std::sort(
        candidates.begin(),
        candidates.end(),
        [](const t_lstore* a, const t_lstore* b) {
            return a->residency_tick() < b->residency_tick();
        }
    );

    // Select victims to bring under budget, but do NOT evict yet — the JS driver
    // must open each victim's OPFS handle before `commit()` can flush it.
    for (auto* store : candidates) {
        if (resident <= m_budget) {
            break;
        }

        resident -= store->capacity();
        m_pending.push_back(store);
        m_pending_fnames.push_back(store->get_fname());
    }

    return m_pending.size();
}

const char*
t_residency_manager::victim_fname(std::size_t i) const {
    if (i >= m_pending_fnames.size()) {
        return "";
    }
    return m_pending_fnames[i].c_str();
}

void
t_residency_manager::commit() {
    std::size_t n = 0;
    {
        std::lock_guard<std::mutex> lk(m_mutex);
        for (auto* store : m_pending) {
            store->evict();
            ++m_evictions;
        }

        n = m_pending.size();
        m_pending.clear();
        m_pending_fnames.clear();
    }

    if (n == 0) {
        return;
    }
}

void
t_residency_manager::safepoint() {
    std::lock_guard<std::mutex> lk(m_safepoint_mutex);
    prepare();
    commit();
}

} // namespace perspective
