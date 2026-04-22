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
#include <perspective/port.h>
#include <perspective/schema.h>
#include <perspective/exports.h>
#include <perspective/context_handle.h>
#include <perspective/pivot.h>
#include <perspective/env_vars.h>
#include <perspective/rlookup.h>
#include <perspective/gnode_state.h>
#include <perspective/sparse_tree.h>
#include <perspective/process_state.h>
#include <perspective/computed_expression.h>
#include <perspective/computed_function.h>
#include <perspective/expression_tables.h>
#include <perspective/regex.h>
#include <tsl/ordered_map.h>
#include <perspective/parallel_for.h>
#include <chrono>

#ifdef PSP_PARALLEL_FOR
#include <thread>
#include <shared_mutex>
#endif

namespace perspective {

PERSPECTIVE_EXPORT t_tscalar
calc_delta(t_value_transition trans, t_tscalar oval, t_tscalar nval);

PERSPECTIVE_EXPORT t_tscalar
calc_newer(t_value_transition trans, t_tscalar oval, t_tscalar nval);

PERSPECTIVE_EXPORT t_tscalar calc_negate(t_tscalar val);

class t_ctxunit;
class t_ctx0;
class t_ctx1;
class t_ctx2;
class t_ctx_grouped_pkey;

#ifdef PSP_GNODE_VERIFY
#define PSP_GNODE_VERIFY_TABLE(X) (X)->verify()
#else
#define PSP_GNODE_VERIFY_TABLE(X)
#endif

/**
 * @brief The struct returned from `_process_table`, which contains a
 * pointer to the flattened and processed `t_data_table`, and a boolean showing
 * whether the user's `on_update` callbacks should be called, i.e. whether the
 * update contained new data or not.
 *
 * Given that `_process_table` may be called multiple times, as is `_process`,
 * `t_update_task` will accumulate the values of `m_should_notify_userspace`
 * over multiple calls and only consider an update a no-op if all values of
 * `m_should_notify_userspace` are false.
 */
struct PERSPECTIVE_EXPORT t_process_table_result {
    std::shared_ptr<t_data_table> m_flattened_data_table;
    bool m_should_notify_userspace;
};
class PERSPECTIVE_EXPORT t_gnode {
public:
    /**
     * @brief Construct a new `t_gnode`. A `t_gnode` manages the accumulated
     * internal state of a `Table` - it handles updates, calculates the
     * transition state between each `update()` call, and manages/notifies
     * contexts (`View`s) created from the `Table`.
     *
     * A `t_gnode` is created with two `t_schema`s:
     *
     * `input_schema`: the canonical `t_schema` for the `Table`, which cannot
     * be mutated after creation. This schema contains the `psp_pkey` and
     * `psp_op` columns, which are used internally.
     *
     * `output_schema`: the `t_schema` that contains all columns provided
     * by the dataset, excluding `psp_pkey` and `psp_op`.
     *
     * @param input_schema
     * @param output_schema
     */
    t_gnode(t_schema input_schema, t_schema output_schema);
    ~t_gnode();

    void init();
    void reset();

    /**
     * @brief Send a t_data_table with a schema that matches the gnode's
     * input schema to the input port at `port_id`.
     *
     * @param port_id
     * @param fragments
     */
    void send(t_uindex port_id, const t_data_table& fragments);

    /**
     * @brief Bulk-initialize an empty gnode directly from `data_table`,
     * bypassing the input port, `flatten()`, and `update_master_table()`
     * pipeline.
     *
     * The caller must guarantee that (a) the gnode's gstate is empty,
     * (b) all rows are `OP_INSERT`, and (c) `psp_pkey` contains no
     * duplicates (e.g. an implicit row-index primary key). Columns of
     * `data_table` are aliased into the master table instead of being
     * copied.
     *
     * @param data_table
     */
    void init_bulk(const std::shared_ptr<t_data_table>& data_table);

    /**
     * @brief Given a port_id, call `process_table` on the port's data table,
     * reconciling all queued calls to `update` and `remove` on that port.
     * Returns a boolean indicating whether the update was valid and whether
     * contexts were notified.
     *
     * @param port_id
     */
    bool process(t_uindex port_id);

    /**
     * @brief Create a new input port, store it in `m_input_ports`, and
     * return the integer ID that references the new port.
     *
     * @return t_uindex
     */
    t_uindex make_input_port();

    /**
     * @brief Given a port ID, remove the input port that belongs to that
     * input ID and clean up its associated table.
     *
     * @param port_id
     */
    void remove_input_port(t_uindex port_id);

    /**
     * @brief Given a new context, register it with the gnode, compute and
     * add its expression columns.
     *
     * @param name
     * @param type
     * @param ptr
     */
    void _register_context(
        const std::string& name, t_ctx_type type, std::uintptr_t ptr
    );

    /**
     * @brief Remove a context by name from the gnode, and remove its
     * computed expression columns.
     *
     * @param name
     */
    void _unregister_context(const std::string& name);

    const t_data_table* get_table() const;
    t_data_table* get_table();

    std::shared_ptr<t_data_table> get_table_sptr() const;
    std::shared_ptr<t_data_table> get_pkeyed_table() const;

    t_data_table* _get_otable(t_uindex port_id);
    t_data_table* _get_itable(t_uindex port_id);

    t_schema get_output_schema() const;
    const t_schema& get_state_input_schema() const;

    t_uindex num_input_ports() const;
    t_uindex num_output_ports() const;

    std::vector<t_pivot> get_pivots() const;
    std::vector<t_stree*> get_trees();

    void set_id(t_uindex id);
    t_uindex get_id() const;

    void release_inputs();
    void release_outputs();

    std::vector<std::string> get_registered_contexts() const;
    std::vector<std::string> get_contexts_last_updated() const;

    void clear_input_ports();
    void clear_output_ports();

    bool has_pkey(t_tscalar pkey) const;

    std::vector<t_tscalar>
    get_row_data_pkeys(const std::vector<t_tscalar>& pkeys) const;
    std::vector<t_tscalar> has_pkeys(const std::vector<t_tscalar>& pkeys) const;
    std::vector<t_tscalar> get_pkeys() const;

    void set_pool_cleanup(std::function<void()> cleanup);
    bool was_updated() const;
    void clear_updated();

    t_uindex mapping_size() const;

    // helper function for JS interface
    void promote_column(const std::string& name, t_dtype new_type);

    // Gnode will steal a reference to the context
    void register_context(
        const std::string& name, const std::shared_ptr<t_ctxunit>& ctx
    );
    void register_context(
        const std::string& name, const std::shared_ptr<t_ctx0>& ctx
    );
    void register_context(
        const std::string& name, const std::shared_ptr<t_ctx1>& ctx
    );
    void register_context(
        const std::string& name, const std::shared_ptr<t_ctx2>& ctx
    );
    void register_context(
        const std::string& name, const std::shared_ptr<t_ctx_grouped_pkey>& ctx
    );

    void pprint() const;
    std::string repr() const;

    std::shared_ptr<t_expression_vocab> get_expression_vocab() const;
    std::shared_ptr<t_regex_mapping> get_expression_regex_mapping() const;

    const t_gstate::t_mapping& get_pkey_map() const;

#ifdef PSP_PARALLEL_FOR
    void set_lock(std::shared_mutex* lock);
#endif

protected:
    /**
     * @brief Given `tbl`, notify each registered context with `tbl`.
     *
     * @param tbl
     */
    void _update_contexts_from_state(std::shared_ptr<t_data_table> tbl);

    /**
     * @brief Notify a single registered `ctx` with `tbl`.
     *
     * @tparam CTX_T
     * @param ctx
     * @param tbl
     * @param flattened
     * @param delta
     * @param prev
     * @param current
     * @param transitions
     * @param changed_rows
     */
    template <typename CTX_T>
    void update_context_from_state(
        CTX_T* ctx,
        const std::string& name,
        std::shared_ptr<t_data_table> flattened,
        bool is_registration
    );

    /**
     * @brief Provide the registered `t_ctx*` with a pointer to this gnode's
     * `m_gstate` object. `t_ctx*` are assumed to access/mutate this state
     * object arbitrarily at runtime.
     *
     * @tparam CTX_T
     * @param ptr
     */
    template <typename CTX_T>
    void set_ctx_state(void* ptr);

    bool have_context(const std::string& name) const;
    void notify_contexts(std::shared_ptr<t_data_table> flattened);

    template <typename CTX_T>
    void notify_context(
        std::shared_ptr<t_data_table> flattened,
        const t_ctx_handle& ctxh,
        const std::string& name
    );

    /**
     * @brief Given the process state, create a `t_mask` bitset set to true for
     * all rows in `flattened`, UNLESS the row is an `OP_DELETE`.
     *
     * Mutates the `t_process_state` object that is passed in.
     *
     * @param process_state
     */
    t_mask _process_mask_existed_rows(t_process_state& process_state);

    /**
     * @brief Given a flattened column, the master column from `m_gstate`, and
     * all transitional columns containing metadata, process and calculate
     * transitional values.
     *
     * @tparam DATA_T
     * @param fcolumn
     * @param scolumn
     * @param dcolumn
     * @param pcolumn
     * @param ccolumn
     * @param tcolumn
     * @param process_state
     */
    template <typename T>
    void _process_column(
        const t_column* fcolumn,
        const t_column* scolumn,
        t_column* dcolumn,
        t_column* pcolumn,
        t_column* ccolumn,
        t_column* tcolumn,
        const t_process_state& process_state
    );

    /**
     * @brief Calculate the transition state for a single cell, which depends
     * on whether the cell is/was valid, existed, or is new.
     *
     * @param prev_existed
     * @param row_pre_existed
     * @param exists
     * @param prev_valid
     * @param cur_valid
     * @param prev_cur_eq
     * @param prev_pkey_eq
     * @return t_value_transition
     */
    t_value_transition calc_transition(
        bool prev_existed,
        bool row_pre_existed,
        bool exists,
        bool prev_valid,
        bool cur_valid,
        bool prev_cur_eq,
        bool prev_pkey_eq
    );

    /******************************************************************************
     *
     * Expression Column Operations
     */

    /**
     * @brief Compute all expressions on each registered context using the
     * flattened table. This method is called on the first update applied
     * on an empty gstate master table.
     */
    void
    _compute_expressions(const std::shared_ptr<t_data_table>& flattened_masked);

    /**
     * @brief Compute all expressions on each registered context using all
     * data and transition tables. This method is called on all subsequent
     * updates applied after the first update.
     */
    void _compute_expressions(
        const std::shared_ptr<t_data_table>& master,
        const std::shared_ptr<t_data_table>& flattened
    );

private:
    /**
     * @brief Process the input data table by flattening it, calculating
     * transitional values, and returning a new masked version.
     *
     * @return t_process_table_result
     */
    t_process_table_result _process_table(t_uindex port_id);

    t_gnode_processing_mode m_mode;
    t_gnode_type m_gnode_type;

    // A `t_schema` containing all columns, including internal metadata columns.
    t_schema m_input_schema;

    // A `t_schema` containing all columns (excluding internal columns).
    t_schema m_output_schema;

    // A vector of `t_schema`s for each transitional `t_data_table`.
    std::vector<t_schema> m_transitional_schemas;

    bool m_init;
    t_uindex m_id;

    // Input ports mapped by integer id
    tsl::ordered_map<t_uindex, std::shared_ptr<t_port>> m_input_ports;

    // Input port IDs are sequential, starting from 0
    t_uindex m_last_input_port_id;

    // Output ports stored sequentially in a vector, keyed by the
    // `t_gnode_port` enum.
    std::vector<std::shared_ptr<t_port>> m_oports;
    tsl::ordered_map<std::string, t_ctx_handle> m_contexts;
    std::shared_ptr<t_gstate> m_gstate;

    std::chrono::high_resolution_clock::time_point m_epoch;
    std::function<void()> m_pool_cleanup;
    bool m_was_updated;

    std::shared_ptr<t_expression_vocab> m_expression_vocab;
    std::shared_ptr<t_regex_mapping> m_expression_regex_mapping;

#ifdef PSP_PARALLEL_FOR
    std::shared_mutex* m_lock;
#endif
};

/**
 * @brief Given a t_data_table and a context handler, construct the t_tables
 * relating to delta calculation and notify the context with the constructed
 * tables.
 *
 * @tparam CTX_T
 * @param flattened
 * @param ctxh
 */
template <typename CTX_T>
void
t_gnode::notify_context(
    std::shared_ptr<t_data_table> flattened,
    const t_ctx_handle& ctxh,
    const std::string& name
) {
    CTX_T* ctx = ctxh.get<CTX_T>();

    // Tables from the gnode which do not have the expressions applied yet
    std::shared_ptr<t_data_table> delta = m_oports[PSP_PORT_DELTA]->get_table();
    std::shared_ptr<t_data_table> prev = m_oports[PSP_PORT_PREV]->get_table();
    std::shared_ptr<t_data_table> current =
        m_oports[PSP_PORT_CURRENT]->get_table();
    std::shared_ptr<t_data_table> transitions =
        m_oports[PSP_PORT_TRANSITIONS]->get_table();

    // Existed is special - it will never have any expression columns and can
    // be used as-is from the gnode.
    const t_data_table& existed = *(m_oports[PSP_PORT_EXISTED]->get_table());

    ctx->step_begin();

    if (ctx->num_expressions() > 0) {
        // Join expression tables on the context with gnode tables and pass
        // those into the context so there is no distinction between expression
        // and real columns for the context.
        std::shared_ptr<t_expression_tables> ctx_expression_tables =
            ctx->get_expression_tables();

        auto joined_flattened =
            flattened->join(ctx_expression_tables->m_flattened);
        auto joined_delta = delta->join(ctx_expression_tables->m_delta);
        auto joined_prev = prev->join(ctx_expression_tables->m_prev);
        auto joined_current = current->join(ctx_expression_tables->m_current);
        auto joined_transitions =
            transitions->join(ctx_expression_tables->m_transitions);

        // pass the tables as const references - the destructors for all of the
        // joined tables will be called after this function finishes executing,
        // as the contexts do not retain a reference to these tables.
        ctx->notify(
            *joined_flattened,
            *joined_delta,
            *joined_prev,
            *joined_current,
            *joined_transitions,
            existed
        );
    } else {
        ctx->notify(*flattened, *delta, *prev, *current, *transitions, existed);
    }

    ctx->step_end();
}

/**
 * @brief Given a flattened `t_data_table`, update the context with the table.
 *
 * Called with the context is initialized with a table.
 *
 * @tparam CTX_T the template type
 * @param ctx a pointer to a `t_context` object
 * @param flattened the flattened `t_data_table` containing data for the context
 */
template <typename CTX_T>
void
t_gnode::update_context_from_state(
    CTX_T* ctx,
    const std::string& name,
    std::shared_ptr<t_data_table> flattened,
    bool is_registration
) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_VERBOSE_ASSERT(
        m_mode == NODE_PROCESSING_SIMPLE_DATAFLOW,
        "Only simple dataflows supported currently"
    )

    if (flattened->size() == 0) {
        return;
    }

    ctx->step_begin();

    // This method is called in two places:
    //
    // 1. when a new context is created and it needs to get the current state
    //  of the gstate master table in order to calculate aggregates, etc.
    //  `is_registration` is `true` in this case — no subscriber can observe
    //  deltas populated during this initial notify, so we skip populating
    //  `m_delta_pkeys` to save O(N) allocations.
    //
    // 2. when a table created from schema (0 rows) gets data and now needs
    //  to update its registered contexts with the new data. `is_registration`
    //  is `false` here — a subscriber may have attached between context
    //  creation and the first update, and expects to see all rows as deltas.
    if (ctx->num_expressions() > 0) {
        // If the context has expression columns, it has already been computed
        // in `process_table` and we can join the "real" and expression columns
        // together and pass it to the context.
        std::shared_ptr<t_expression_tables> ctx_expression_tables =
            ctx->get_expression_tables();
        std::shared_ptr<t_data_table> joined_flattened =
            flattened->join(ctx_expression_tables->m_flattened);
        ctx->notify(*joined_flattened, is_registration);
    } else {
        // Just use the table from the gnode
        ctx->notify(*flattened, is_registration);
    }

    ctx->step_end();
}

template <>
void t_gnode::_process_column<std::string>(
    const t_column* fcolumn,
    const t_column* scolumn,
    t_column* dcolumn,
    t_column* pcolumn,
    t_column* ccolumn,
    t_column* tcolumn,
    const t_process_state& process_state
);

template <typename DATA_T>
void
t_gnode::_process_column(
    const t_column* fcolumn,
    const t_column* scolumn,
    t_column* dcolumn,
    t_column* pcolumn,
    t_column* ccolumn,
    t_column* tcolumn,
    const t_process_state& process_state
) {
    for (t_uindex idx = 0, loop_end = fcolumn->size(); idx < loop_end; ++idx) {
        std::uint8_t op_ = process_state.m_op_base[idx];
        t_op op = static_cast<t_op>(op_);
        t_uindex added_count = process_state.m_added_offset[idx];

        const t_rlookup& rlookup = process_state.m_lookup[idx];
        bool row_pre_existed = rlookup.m_exists;
        auto prev_pkey_eq = process_state.m_prev_pkey_eq_vec[idx];

        switch (op) {
            case OP_INSERT: {
                row_pre_existed = row_pre_existed && !prev_pkey_eq;

                DATA_T prev_value;
                memset(&prev_value, 0, sizeof(DATA_T));
                bool prev_valid = false;

                DATA_T cur_value = *(fcolumn->get_nth<DATA_T>(idx));
                bool cur_valid = fcolumn->is_valid(idx);

                if (row_pre_existed) {
                    prev_value = *(scolumn->get_nth<DATA_T>(rlookup.m_idx));
                    prev_valid = scolumn->is_valid(rlookup.m_idx);
                }

                bool exists = cur_valid;
                bool prev_existed = row_pre_existed && prev_valid;
                bool prev_cur_eq = prev_value == cur_value;

                auto trans = calc_transition(
                    prev_existed,
                    row_pre_existed,
                    exists,
                    prev_valid,
                    cur_valid,
                    prev_cur_eq,
                    prev_pkey_eq
                );

                dcolumn->set_nth<DATA_T>(
                    added_count, cur_valid ? cur_value - prev_value : DATA_T(0)
                );
                dcolumn->set_valid(added_count, true);

                pcolumn->set_nth<DATA_T>(added_count, prev_value);
                pcolumn->set_valid(added_count, prev_valid);

                ccolumn->set_nth<DATA_T>(
                    added_count, cur_valid ? cur_value : prev_value
                );
                ccolumn->set_valid(
                    added_count, cur_valid ? cur_valid : prev_valid
                );

                tcolumn->set_nth<std::uint8_t>(idx, trans);
            } break;
            case OP_DELETE: {
                if (row_pre_existed) {
                    DATA_T prev_value =
                        *(scolumn->get_nth<DATA_T>(rlookup.m_idx));
                    bool prev_valid = scolumn->is_valid(rlookup.m_idx);

                    pcolumn->set_nth<DATA_T>(added_count, prev_value);
                    pcolumn->set_valid(added_count, prev_valid);

                    ccolumn->set_nth<DATA_T>(added_count, prev_value);
                    ccolumn->set_valid(added_count, prev_valid);

                    SUPPRESS_WARNINGS_VC(4146)
                    dcolumn->set_nth<DATA_T>(added_count, -prev_value);
                    RESTORE_WARNINGS_VC()
                    dcolumn->set_valid(added_count, true);

                    tcolumn->set_nth<std::uint8_t>(
                        added_count, VALUE_TRANSITION_NEQ_TDF
                    );
                }
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unknown OP");
            }
        }
    }
}

} // end namespace perspective
