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

#include "perspective/base.h"
#include "perspective/exports.h"
#include "perspective/schema.h"
#include "perspective/view.h"
#include "perspective/view_config.h"
#include <cstdint>
#include <memory>
#include <tsl/hopscotch_set.h>
#include <utility>
#include <perspective/table.h>
#include <string>
#include <tsl/hopscotch_map.h>
#include <perspective.pb.h>

namespace perspective {

enum ErrorType {};

class Error {
public:
    Error(std::string message) : m_message(std::move(message)) {}

    [[nodiscard]]
    std::string
    message() const {
        return m_message;
    }

    std::string m_message;
    ErrorType m_err_type;
};

template <typename T, typename E>
class Result {
private:
    std::variant<T, E> result;
    bool is_ok;

public:
    // Constructor for success
    Result(T value) : result(value), is_ok(true) {}

    // Constructor for error
    Result(E error) : result(error), is_ok(false) {}

    // Check if it's ok or an error
    [[nodiscard]]
    bool
    isOk() const {
        return is_ok;
    }
    [[nodiscard]]
    bool
    isError() const {
        return !is_ok;
    }

    // Getters for value and error
    T
    unsafe_get_value() const {
        if (is_ok) {
            return std::get<T>(result);
        }
        PSP_COMPLAIN_AND_ABORT("Attempted to get value from an error result");
    }

    E
    unsafe_get_error() const {
        if (!is_ok) {
            return std::get<E>(result);
        }
        PSP_COMPLAIN_AND_ABORT("Attempted to get error from an ok result");
    }

    // Enforce checking by accepting handlers for both cases
    template <typename R>
    void
    match(
        std::function<R(const T&)> handleValue,
        std::function<R(const E&)> handleError
    ) const {
        if (is_ok) {
            return handleValue(std::get<T>(result));
        }
        return handleError(std::get<E>(result));
    }

    template <typename A, typename B>
    [[nodiscard]]
    Result<B, E>
    flat_map(std::function<B(A)> f) const {
        return match(
            [&](const T& value) { return Result<B, E>(f(value)); },
            [&](const E& error) { return Result<B, E>(error); }
        );
    }
};

proto::FilterOp filter_op_to_proto(t_filter_op t_filter_op);
t_filter_op filter_op_from_proto(proto::FilterOp filter_op);
const char* sort_op_str_from_proto(proto::SortOp sort_op);

/**
 * @brief Create a new context of type `CTX_T`, which will be one of 3
 * types:
 *
 * `t_ctx0`, `t_ctx1`, `t_ctx2`.
 *
 *
 * Contexts contain the underlying aggregates, sort specifications, filter
 * terms, and other metadata allowing for data manipulation and view
 * creation.
 *
 * @return std::shared_ptr<CTX_T>
 */
template <typename CTX_T>
std::shared_ptr<CTX_T> make_context(
    std::shared_ptr<Table> table,
    std::shared_ptr<t_schema> schema,
    std::shared_ptr<t_view_config> view_config,
    const std::string& name
);

namespace server {

    class PERSPECTIVE_EXPORT ErasedView {
    public:
        virtual ~ErasedView() = default;

        [[nodiscard]]
        virtual std::map<std::string, std::string> schema() const = 0;

        [[nodiscard]]
        virtual std::uint32_t num_rows() const = 0;
        [[nodiscard]]
        virtual std::uint32_t num_columns() const = 0;
        [[nodiscard]]
        virtual std::shared_ptr<t_view_config> get_view_config() const = 0;

        [[nodiscard]]
        virtual std::shared_ptr<std::string> to_arrow(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col
        ) const = 0;

        [[nodiscard]]
        virtual std::string to_rows(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col,
            t_uindex hidden,
            bool is_formatted,
            bool get_pkeys,
            bool get_ids,
            bool leaves_only,
            t_uindex num_sides,
            bool has_row_path,
            std::string nidx,
            t_uindex columns_length,
            t_uindex group_by_length
        ) const = 0;

        [[nodiscard]]
        virtual std::string to_columns(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col,
            t_uindex hidden,
            bool is_formatted,
            bool get_pkeys,
            bool get_ids,
            bool leaves_only,
            t_uindex num_sides,
            bool has_row_path,
            std::string nidx,
            t_uindex columns_length,
            t_uindex group_by_length
        ) const = 0;

        [[nodiscard]]
        virtual std::shared_ptr<std::string> to_csv(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col
        ) const = 0;

        [[nodiscard]]
        virtual std::uint32_t sides() const = 0;

        [[nodiscard]]
        virtual std::vector<std::vector<std::string>> column_paths() const = 0;

        [[nodiscard]]
        virtual std::map<std::string, std::string>
        expression_schema() const = 0;

        [[nodiscard]]
        virtual std::pair<t_tscalar, t_tscalar>
        get_min_max(const std::string& col_name) const = 0;
    };

    template <typename CTX_T>
    class PERSPECTIVE_EXPORT CtxViewBase : public ErasedView {
    public:
        CtxViewBase() = delete;
        CtxViewBase(std::shared_ptr<View<CTX_T>> view) : m_view(view) {}

        [[nodiscard]]
        std::map<std::string, std::string>
        schema() const override {
            return m_view->schema();
        }

        [[nodiscard]]
        std::uint32_t
        num_rows() const override {
            return m_view->num_rows();
        }

        [[nodiscard]]
        std::uint32_t
        num_columns() const override {
            return m_view->num_columns();
        }

        [[nodiscard]]
        std::shared_ptr<t_view_config>
        get_view_config() const override {
            return m_view->get_view_config();
        }

        [[nodiscard]]
        std::shared_ptr<std::string>
        to_arrow(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col
        ) const override {
            return m_view->to_arrow(
                start_row, end_row, start_col, end_col, true, true
            );
        }

        [[nodiscard]]
        std::string
        to_rows(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col,
            t_uindex hidden,
            bool is_formatted,
            bool get_pkeys,
            bool get_ids,
            bool leaves_only,
            t_uindex num_sides,
            bool has_row_path,
            std::string nidx,
            t_uindex columns_length,
            t_uindex group_by_length
        ) const override {
            return m_view->to_rows(
                start_row,
                end_row,
                start_col,
                end_col,
                hidden,
                is_formatted,
                get_pkeys,
                get_ids,
                leaves_only,
                num_sides,
                has_row_path,
                nidx,
                columns_length,
                group_by_length
            );
        }

        [[nodiscard]]
        std::string
        to_columns(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col,
            t_uindex hidden,
            bool is_formatted,
            bool get_pkeys,
            bool get_ids,
            bool leaves_only,
            t_uindex num_sides,
            bool has_row_path,
            std::string nidx,
            t_uindex columns_length,
            t_uindex group_by_length
        ) const override {
            return m_view->to_columns(
                start_row,
                end_row,
                start_col,
                end_col,
                hidden,
                is_formatted,
                get_pkeys,
                get_ids,
                leaves_only,
                num_sides,
                has_row_path,
                nidx,
                columns_length,
                group_by_length
            );
        }

        [[nodiscard]]
        std::shared_ptr<std::string>
        to_csv(
            t_uindex start_row,
            t_uindex end_row,
            t_uindex start_col,
            t_uindex end_col
        ) const override {
            return m_view->to_csv(start_row, end_row, start_col, end_col);
        }

        [[nodiscard]]
        std::uint32_t
        sides() const override {
            return m_view->sides();
        }

        [[nodiscard]]
        std::vector<std::vector<std::string>>
        column_paths() const override {
            std::vector<std::vector<std::string>> out;
            std::vector<std::vector<t_tscalar>> column_paths =
                m_view->column_paths();

            for (const auto& path : column_paths) {
                std::vector<std::string> path_str;
                path_str.reserve(path.size());
                for (const auto& scalar : path) {
                    path_str.push_back(scalar.to_string());
                }
                out.push_back(path_str);
            }

            return out;
        }

        [[nodiscard]]
        std::map<std::string, std::string>
        expression_schema() const override {
            return m_view->expression_schema();
        }

        [[nodiscard]]
        std::pair<t_tscalar, t_tscalar>
        get_min_max(const std::string& col_name) const override {
            return m_view->get_min_max(col_name);
        }

    private:
        std::shared_ptr<View<CTX_T>> m_view;
    };

    class PERSPECTIVE_EXPORT CtxUnitView : public CtxViewBase<t_ctxunit> {
    public:
        using CtxViewBase<t_ctxunit>::CtxViewBase;
    };
    class PERSPECTIVE_EXPORT Ctx0View : public CtxViewBase<t_ctx0> {
    public:
        using CtxViewBase<t_ctx0>::CtxViewBase;
    };
    class PERSPECTIVE_EXPORT Ctx1View : public CtxViewBase<t_ctx1> {
    public:
        using CtxViewBase<t_ctx1>::CtxViewBase;
    };
    class PERSPECTIVE_EXPORT Ctx2View : public CtxViewBase<t_ctx2> {
    public:
        using CtxViewBase<t_ctx2>::CtxViewBase;
    };

    struct Subscription {
        uint32_t id;
    };

    /**
     * @brief ServerResources is a container for all the resources that the
     * server requires.
     */
    class PERSPECTIVE_EXPORT ServerResources {
    public:
        using t_id = std::string;

        /**
         * @brief Store a table that will be fully managed by the server.
         *
         * @param table The table to store.
         */
        void host_table(const t_id& id, std::shared_ptr<Table> table);
        void host_view(
            const t_id& id,
            const t_id& table_id,
            std::shared_ptr<ErasedView> view
        );

        std::shared_ptr<Table> get_table(const t_id& id);
        std::shared_ptr<Table> get_table_for_view(const t_id& view_id);
        t_id get_table_id_for_view(const t_id& view_id);
        std::vector<t_id> get_view_ids(const t_id& table_id);
        std::shared_ptr<ErasedView> get_view(const t_id& id);

        void delete_view(const t_id& id);
        void delete_table(const t_id& id);

        // `on_update()`
        void create_view_on_update_sub(const t_id& view_id, Subscription sub);
        std::vector<Subscription>& get_view_on_update_sub(const t_id& view_id);
        void drop_view_on_update_sub(const t_id& view_id);

        // `Table::on_delete()`
        void create_table_on_delete_sub(const t_id& table_id, Subscription sub);
        std::vector<Subscription>& get_table_on_delete_sub(const t_id& table_id
        );
        void
        drop_table_on_delete_sub(const t_id& table_id, std::uint32_t sub_id);

        // `View::on_delete()`
        void create_view_on_delete_sub(const t_id& view_id, Subscription sub);
        std::vector<Subscription>& get_view_on_delete_sub(const t_id& view_id);
        void drop_view_on_delete_sub(const t_id& view_id, std::uint32_t sub_id);

        void mark_table_dirty(const t_id& id);
        void mark_table_clean(const t_id& id);
        void mark_all_tables_clean();

        std::vector<std::pair<std::shared_ptr<Table>, const std::string&>>
        get_dirty_tables();
        bool is_table_dirty(const t_id& id);

    protected:
        tsl::hopscotch_map<t_id, t_id> m_view_to_table;
        std::multimap<t_id, t_id> m_table_to_view;
        tsl::hopscotch_map<t_id, std::shared_ptr<Table>> m_tables;
        tsl::hopscotch_map<t_id, std::shared_ptr<ErasedView>> m_views;

        tsl::hopscotch_map<t_id, std::vector<Subscription>>
            m_view_on_update_subs;

        tsl::hopscotch_map<t_id, std::vector<Subscription>>
            m_view_on_delete_subs;

        tsl::hopscotch_map<t_id, std::vector<Subscription>>
            m_table_on_delete_subs;

        tsl::hopscotch_set<t_id> m_dirty_tables;
    };

    template <typename A>
    struct PERSPECTIVE_EXPORT ProtoServerResp {
        std::vector<A> responses;
        bool should_poll;
    };

    class PERSPECTIVE_EXPORT ProtoServer {
    public:
        using Req = perspective::proto::Request;
        using Resp = perspective::proto::Response;
        using RequestEnvelope = perspective::proto::RequestEnvelope;
        using ResponseEnvelope = perspective::proto::ResponseEnvelope;

        ProtoServerResp<std::string> handle_message(const std::string_view& data
        );

        std::vector<std::string> poll();

    private:
        void handle_process_table(
            const Req& req,
            const RequestEnvelope& env,
            ProtoServerResp<ProtoServer::ResponseEnvelope>& proto_resp
        );

        ProtoServerResp<ResponseEnvelope>
        _handle_message(const Req& req, const RequestEnvelope& env);

        std::vector<ResponseEnvelope> _poll();

        void _process_table(
            std::shared_ptr<Table>& table,
            const ServerResources::t_id& table_id,
            std::vector<ProtoServer::ResponseEnvelope>& outs
        );

        void _process_table_unchecked(
            std::shared_ptr<Table>& table,
            const ServerResources::t_id& table_id,
            std::vector<ProtoServer::ResponseEnvelope>& outs
        );

        ServerResources m_resources;
    };

} // namespace server
} // namespace perspective
