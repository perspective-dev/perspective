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
#include <perspective/data_table.h>
#include <perspective/gnode.h>
#include <perspective/exports.h>
#include <mutex>
#include <atomic>
#ifdef PSP_PARALLEL_FOR
#include <thread>
#include <shared_mutex>
#endif

namespace perspective {

struct PERSPECTIVE_EXPORT t_updctx {
    t_updctx();
    t_updctx(t_uindex gnode_id, std::string ctx);

    t_uindex m_gnode_id;
    std::string m_ctx;
};

class t_update_task;

class PERSPECTIVE_EXPORT t_pool {
    friend class t_update_task;
    using t_ctx_id = std::pair<t_uindex, std::string>;

public:
    PSP_NON_COPYABLE(t_pool);

    t_pool();
    t_uindex register_gnode(t_gnode* node);

    // #if defined PSP_ENABLE_WASM || defined PSP_ENABLE_PYTHON
    //   void set_update_delegate(t_val ud);
    // #endif

    void register_context(
        t_uindex gnode_id,
        const std::string& name,
        t_ctx_type type,
        std::uintptr_t ptr
    );

#ifdef PSP_PARALLEL_FOR
    std::shared_mutex* get_lock() const;
#endif

    /**
     * @brief Call the binding language's `update_callback` method,
     * set at initialize time.
     *
     * @param port_id
     */
    void notify_userspace(t_uindex port_id);

    ~t_pool();

    void unregister_gnode(t_uindex idx);

    void unregister_context(t_uindex gnode_id, const std::string& name);

    void send(t_uindex gnode_id, t_uindex port_id, const t_data_table& table);

    void reset_gnode(t_uindex gnode_id);

    void _process(
        std::optional<std::function<void(std::uint32_t)>> callback =
            std::nullopt
    );

    void init();
    void stop();
    void set_sleep(t_uindex ms);
    std::vector<t_stree*> get_trees();

    bool get_data_remaining() const;
    std::vector<t_updctx> get_contexts_last_updated();
    std::string repr() const;

    void pprint_registered() const;

    t_uindex epoch() const;
    void inc_epoch();
    std::vector<t_uindex> get_gnodes_last_updated();
    t_gnode* get_gnode(t_uindex idx);

protected:
    // Unused methods
    std::vector<t_tscalar>
    get_row_data_pkeys(t_uindex gnode_id, const std::vector<t_tscalar>& pkeys);

    // Following three functions
    // use the python api
    bool validate_gnode_id(t_uindex gnode_id) const;

private:
#ifdef PSP_PARALLEL_FOR
    std::shared_mutex* m_lock;
#endif
    std::vector<t_gnode*> m_gnodes;
    std::atomic_flag m_run;
    std::atomic<bool> m_data_remaining;
    std::atomic<t_uindex> m_sleep;
    std::atomic<t_uindex> m_epoch;
};

} // end namespace perspective
