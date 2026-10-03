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
#include <cstdlib>

namespace perspective {

struct PERSPECTIVE_EXPORT t_env {
    static inline bool
    log_time() {
        static const bool rv = std::getenv("PSP_LOG_TIME") != 0;
        return rv;
    }

    static inline bool
    log_storage_resize() {
        static const bool rv = std::getenv("PSP_LOG_STORAGE_RESIZE") != 0;
        return rv;
    }

    static inline bool
    log_schema_gnode_flattened() {
        static const bool rv =
            std::getenv("PSP_LOG_SCHEMA_GNODE_FLATTENED") != 0;
        return rv;
    }

    static inline bool
    log_data_pool_send() {
        static const bool rv = std::getenv("PSP_LOG_DATA_POOL_SEND") != 0;
        return rv;
    }

    static inline bool
    log_time_gnode_process() {
        static const bool rv = std::getenv("PSP_LOG_TIME_GNODE_PROCESS") != 0;
        return rv;
    }

    static inline bool
    log_time_ctx_notify() {
        static const bool rv = std::getenv("PSP_LOG_TIME_CTX_NOTIFY") != 0;
        return rv;
    }

    static inline bool
    log_data_gnode_flattened() {
        static const bool rv = std::getenv("PSP_LOG_DATA_GNODE_FLATTENED") != 0;
        return rv;
    }

    static inline bool
    log_data_gnode_delta() {
        static const bool rv = std::getenv("PSP_LOG_DATA_GNODE_DELTA") != 0;
        return rv;
    }

    static inline bool
    log_data_gnode_prev() {
        static const bool rv = std::getenv("PSP_LOG_DATA_GNODE_PREV") != 0;
        return rv;
    }

    static inline bool
    log_data_gnode_current() {
        static const bool rv = std::getenv("PSP_LOG_DATA_GNODE_CURRENT") != 0;
        return rv;
    }

    static inline bool
    log_data_gnode_transitions() {
        static const bool rv =
            std::getenv("PSP_LOG_DATA_GNODE_TRANSITIONS") != 0;
        return rv;
    }

    static inline bool
    log_data_gnode_existed() {
        static const bool rv = std::getenv("PSP_LOG_DATA_GNODE_EXISTED") != 0;
        return rv;
    }

    /// Read-once developer toggle: the sum family reports an exact zero
    /// instead of null for a group with no valid values.
    static inline bool
    sum_empty_zero() {
        static const bool rv = std::getenv("PSP_SUM_EMPTY_ZERO") != 0;
        return rv;
    }

    /// Read-once developer toggle: force every sum-family aggregate onto
    /// the full re-reduce path.
    static inline bool
    force_reaggregate() {
        static const bool rv = std::getenv("PSP_FORCE_REAGGREGATE") != 0;
        return rv;
    }

    static inline bool
    log_data_nsparse_strands() {
        static const bool rv = std::getenv("PSP_LOG_DATA_NSPARSE_STRANDS") != 0;
        return rv;
    }

    static inline bool
    log_data_nsparse_strand_deltas() {
        static const bool rv =
            std::getenv("PSP_LOG_DATA_NSPARSE_STRAND_DELTAS") != 0;
        return rv;
    }

    static inline bool
    log_data_nsparse_dtree() {
        static const bool rv = std::getenv("PSP_LOG_DATA_NSPARSE_DTREE") != 0;
        return rv;
    }

    static inline bool
    log_data_nsparse_dctx() {
        static const bool rv = std::getenv("PSP_LOG_DATA_NSPARSE_DCTX") != 0;
        return rv;
    }

    static inline bool
    log_data_nsparse_stree_prev() {
        static const bool rv =
            std::getenv("PSP_LOG_DATA_NSPARSE_STREE_PREV") != 0;
        return rv;
    }

    static inline bool
    log_data_nsparse_stree_after() {
        static const bool rv =
            std::getenv("PSP_LOG_DATA_NSPARSE_STREE_AFTER") != 0;
        return rv;
    }

    static inline bool
    log_progress() {
        static const bool rv = std::getenv("PSP_LOG_PROGRESS") != 0;
        return rv;
    }

    static inline bool
    show_svg_browser() {
        static const bool rv = std::getenv("PSP_SHOW_SVG_BROWSER") != 0;
        return rv;
    }

    static inline bool
    backout_nveq_ft() {
        static const bool rv = std::getenv("PSP_BACKOUT_NVEQ_FT") != 0;
        return rv;
    }

    static inline bool
    backout_invalid_neq_ft() {
        static const bool rv = std::getenv("PSP_BACKOUT_INVALID_NEQ_FT") != 0;
        return rv;
    }

    static inline bool
    backout_force_current_row() {
        static const bool rv =
            std::getenv("PSP_BACKOUT_FORCE_CURRENT_ROW") != 0;
        return rv;
    }

    static inline bool
    backout_eq_invalid_invalid() {
        static const bool rv =
            std::getenv("PSP_BACKOUT_EQ_INVALID_INVALID") != 0;
        return rv;
    }
};

} // end namespace perspective
