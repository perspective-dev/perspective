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
#include <perspective/context_unit.h>
#include <perspective/context_zero.h>
#include <perspective/context_one.h>
#include <perspective/context_two.h>
#include <perspective/context_grouped_pkey.h>
#include <perspective/gnode.h>
#include <perspective/gnode_state.h>
#include <perspective/mask.h>
#include <perspective/tracing.h>
#include <perspective/env_vars.h>
#include <perspective/expression_vocab.h>
#include <perspective/utils.h>
#include <perspective/parallel_for.h>
#include <perspective/pyutils.h>

#include <utility>

namespace perspective {

t_tscalar
calc_delta(t_value_transition trans, t_tscalar oval, t_tscalar nval) {
    return nval.difference(oval);
}

t_tscalar
calc_newer(t_value_transition trans, t_tscalar oval, t_tscalar nval) {
    if (nval.is_valid()) {
        return nval;
    }
    return oval;
}

t_tscalar
calc_negate(t_tscalar val) {
    return val.negate();
}

t_gnode::t_gnode(t_schema input_schema, t_schema output_schema) :
    m_mode(NODE_PROCESSING_SIMPLE_DATAFLOW)
#ifdef PSP_PARALLEL_FOR
    ,
    m_lock(nullptr)
#endif
    ,
    m_gnode_type(GNODE_TYPE_PKEYED),
    m_input_schema(std::move(input_schema)),
    m_output_schema(std::move(output_schema)),
    m_init(false),
    m_id(0),
    m_last_input_port_id(0),
    m_pool_cleanup([]() {}) {
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_gnode");

    std::vector<t_dtype> trans_types(m_output_schema.size());
    for (auto& trans_type : trans_types) {
        trans_type = DTYPE_UINT8;
    }

    t_schema trans_schema(m_output_schema.columns(), trans_types);
    t_schema existed_schema(
        std::vector<std::string>{"psp_existed"},
        std::vector<t_dtype>{DTYPE_BOOL}
    );

    m_transitional_schemas = std::vector<t_schema>{
        m_input_schema,
        m_output_schema,
        m_output_schema,
        m_output_schema,
        trans_schema,
        existed_schema
    };
    m_epoch = std::chrono::high_resolution_clock::now();
}

t_gnode::~t_gnode() {
    PSP_TRACE_SENTINEL();
    LOG_DESTRUCTOR("t_gnode");
    m_pool_cleanup();
}

void
t_gnode::init() {
    PSP_TRACE_SENTINEL();

    m_gstate = std::make_shared<t_gstate>(m_input_schema, m_output_schema);
    m_gstate->init();

    // Create and store the main input port, which is always port 0. The next
    // input port will be port 1, and so on
    std::shared_ptr<t_port> input_port =
        std::make_shared<t_port>(PORT_MODE_PKEYED, m_input_schema);

    input_port->init();

    m_input_ports[0] = input_port;

    for (t_uindex idx = 0, loop_end = m_transitional_schemas.size();
         idx < loop_end;
         ++idx) {
        t_port_mode mode = idx == 0 ? PORT_MODE_PKEYED : PORT_MODE_RAW;

        std::shared_ptr<t_port> port =
            std::make_shared<t_port>(mode, m_transitional_schemas[idx]);

        port->init();
        m_oports.push_back(port);
    }

    for (const auto& iter : m_input_ports) {
        std::shared_ptr<t_port> input_port = iter.second;
        input_port->get_table()->flatten();
    }

    // Initialize expression-related state
    m_expression_vocab = std::make_shared<t_expression_vocab>();
    m_expression_regex_mapping = std::make_shared<t_regex_mapping>();

    m_init = true;
}

t_uindex
t_gnode::make_input_port() {
    PSP_VERBOSE_ASSERT(
        m_init, "Cannot `make_input_port` on an uninited gnode."
    );
    std::shared_ptr<t_port> input_port =
        std::make_shared<t_port>(PORT_MODE_PKEYED, m_input_schema);
    input_port->init();

    t_uindex port_id = m_last_input_port_id + 1;
    m_input_ports[port_id] = input_port;

    // increment the global input port id
    m_last_input_port_id = port_id;

    return port_id;
}

void
t_gnode::remove_input_port(t_uindex port_id) {
    PSP_VERBOSE_ASSERT(
        m_init, "Cannot `remove_input_port` on an uninited gnode."
    );

    if (m_input_ports.count(port_id) == 0) {
        std::cerr << "Input port `" << port_id
                  << "` cannot be removed, as it does not exist.";
        return;
    }

    std::shared_ptr<t_port> input_port = m_input_ports[port_id];

    // clear the table at the port
    input_port->clear();

    // remove from the map
    m_input_ports.erase(port_id);
}

t_value_transition
t_gnode::calc_transition(
    bool prev_existed,
    bool row_pre_existed,
    bool exists,
    bool prev_valid,
    bool cur_valid,
    bool prev_cur_eq,
    bool prev_pkey_eq
) {
    t_value_transition trans = VALUE_TRANSITION_EQ_FF;

    if (!row_pre_existed && !cur_valid && !t_env::backout_invalid_neq_ft()) {
        trans = VALUE_TRANSITION_NEQ_FT;
    } else if (row_pre_existed && !prev_valid && !cur_valid && !t_env::backout_eq_invalid_invalid()) {
        trans = VALUE_TRANSITION_EQ_TT;
    } else if (!prev_existed && !exists) {
        trans = VALUE_TRANSITION_EQ_FF;
    } else if (row_pre_existed && exists && !prev_valid && cur_valid && !t_env::backout_nveq_ft()) {
        trans = VALUE_TRANSITION_NVEQ_FT;
    } else if (prev_existed && exists && prev_cur_eq) {
        trans = VALUE_TRANSITION_EQ_TT;
    } else if (!prev_existed && exists) {
        trans = VALUE_TRANSITION_NEQ_FT;
    } else if (prev_existed && !exists) {
        trans = VALUE_TRANSITION_NEQ_TF;
    } else if (prev_existed && exists && !prev_cur_eq) {
        trans = VALUE_TRANSITION_NEQ_TT;
    } else if (prev_pkey_eq) {
        // prev op must have been a delete
        trans = VALUE_TRANSITION_NEQ_TDT;
    } else {
        PSP_COMPLAIN_AND_ABORT("Hit unexpected condition");
    }
    return trans;
}

t_mask
t_gnode::_process_mask_existed_rows(t_process_state& process_state) {
    // Make sure `existed_data_table` has enough space to write without resizing
    auto flattened_num_rows = process_state.m_flattened_data_table->num_rows();
    process_state.m_existed_data_table->set_size(flattened_num_rows);

    t_column* op_col =
        process_state.m_flattened_data_table->_get_column("psp_op");
    process_state.m_op_base = op_col->get_nth<std::uint8_t>(0);
    t_column* pkey_col =
        process_state.m_flattened_data_table->_get_column("psp_pkey");

    process_state.m_added_offset.resize(flattened_num_rows);
    process_state.m_prev_pkey_eq_vec.resize(flattened_num_rows);

    t_mask mask(flattened_num_rows);
    t_uindex added_count = 0;
    t_tscalar prev_pkey;
    prev_pkey.clear();

    t_column* existed_column =
        process_state.m_existed_data_table->_get_column("psp_existed");

    for (t_uindex idx = 0; idx < flattened_num_rows; ++idx) {
        t_tscalar pkey = pkey_col->get_scalar(idx);
        std::uint8_t op_ = process_state.m_op_base[idx];
        t_op op = static_cast<t_op>(op_);

        PSP_VERBOSE_ASSERT(
            idx < process_state.m_lookup.size(),
            "process_state.m_lookup[idx] out of bounds"
        );
        bool row_pre_existed = process_state.m_lookup[idx].m_exists;
        process_state.m_prev_pkey_eq_vec[idx] = pkey == prev_pkey;

        process_state.m_added_offset[idx] = added_count;

        switch (op) {
            case OP_INSERT: {
                row_pre_existed =
                    row_pre_existed && !process_state.m_prev_pkey_eq_vec[idx];
                mask.set(idx, true);
                existed_column->set_nth(added_count, row_pre_existed);
                ++added_count;
            } break;
            case OP_DELETE: {
                if (row_pre_existed) {
                    mask.set(idx, true);
                    existed_column->set_nth(added_count, row_pre_existed);
                    ++added_count;
                } else {
                    mask.set(idx, false);
                }
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unknown OP");
            }
        }

        prev_pkey = pkey;
    }

    PSP_VERBOSE_ASSERT(mask.count() == added_count, "Expected equality");
    return mask;
}

t_process_table_result
t_gnode::_process_table(t_uindex port_id) {
    m_was_updated = false;

    t_process_table_result result;
    result.m_flattened_data_table = nullptr;
    result.m_should_notify_userspace = false;

    std::shared_ptr<t_data_table> flattened = nullptr;

    if (m_input_ports.count(port_id) == 0) {
        std::cerr << "Cannot process table on port `" << port_id
                  << "` as it does not exist." << '\n';
        return result;
    }

    std::shared_ptr<t_port>& input_port = m_input_ports[port_id];

    if (input_port->get_table()->size() == 0) {
        return result;
    }

    m_was_updated = true;
    flattened = input_port->get_table()->flatten();

    PSP_GNODE_VERIFY_TABLE(flattened);
    PSP_GNODE_VERIFY_TABLE(get_table());

    t_uindex flattened_num_rows = flattened->num_rows();

    std::vector<t_rlookup> row_lookup(flattened_num_rows);
    t_column* pkey_col = flattened->_get_column("psp_pkey");

    for (t_uindex idx = 0; idx < flattened_num_rows; ++idx) {
        // See if each primary key in flattened already exist in the dataset
        t_tscalar pkey = pkey_col->get_scalar(idx);
        row_lookup[idx] = m_gstate->lookup(pkey);
    }

    // first update - master table is empty
    if (m_gstate->mapping_size() == 0) {
        m_gstate->update_master_table(flattened.get());
        m_oports[PSP_PORT_FLATTENED]->set_table(flattened);

        _compute_expressions(flattened);

        // Update all contexts registered with the gnode with data.
        _update_contexts_from_state(m_gstate->get_pkeyed_table());

        input_port->release();
        release_outputs();

#ifdef PSP_GNODE_VERIFY
        auto state_table = get_table();
        PSP_GNODE_VERIFY_TABLE(state_table);
#endif
        // Make sure user is notified after first update.
        result.m_should_notify_userspace = true;
        return result;
    }

    input_port->release_or_clear();

    // Use `t_process_state` to manage intermediate structures
    t_process_state _process_state;

    _process_state.m_state_data_table = get_table_sptr();
    _process_state.m_flattened_data_table = flattened;
    _process_state.m_lookup = row_lookup;

    // Get data tables for process state
    _process_state.m_delta_data_table = m_oports[PSP_PORT_DELTA]->get_table();
    _process_state.m_prev_data_table = m_oports[PSP_PORT_PREV]->get_table();
    _process_state.m_current_data_table =
        m_oports[PSP_PORT_CURRENT]->get_table();
    _process_state.m_transitions_data_table =
        m_oports[PSP_PORT_TRANSITIONS]->get_table();
    _process_state.m_existed_data_table =
        m_oports[PSP_PORT_EXISTED]->get_table();

    // Clear delta, prev, current, transitions, existed on EACH call.
    _process_state.clear_transitional_data_tables();

    // And re-reserved for the amount of data in `flattened`
    _process_state.reserve_transitional_data_tables(flattened_num_rows);

    t_mask existed_mask = _process_mask_existed_rows(_process_state);
    auto mask_count = existed_mask.count();

    // mask_count = flattened_num_rows - number of rows that were removed
    _process_state.set_size_transitional_data_tables(mask_count);

    // Only real columns from the gstate table here
    const std::vector<std::string>& column_names =
        get_output_schema().m_columns;
    t_uindex ncols = column_names.size();

    parallel_for(
        int(ncols),
        [&_process_state, &column_names, this](int colidx) {
            const std::string& cname = column_names[colidx];
            auto* fcolumn =
                _process_state.m_flattened_data_table->_get_column(cname);
            auto* scolumn =
                _process_state.m_state_data_table->_get_column(cname);
            auto* dcolumn =
                _process_state.m_delta_data_table->_get_column(cname);
            auto* pcolumn =
                _process_state.m_prev_data_table->_get_column(cname);
            auto* ccolumn =
                _process_state.m_current_data_table->_get_column(cname);
            auto* tcolumn =
                _process_state.m_transitions_data_table->_get_column(cname);

            t_dtype col_dtype = fcolumn->get_dtype();

            switch (col_dtype) {
                case DTYPE_INT64: {
                    _process_column<std::int64_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_INT32: {
                    _process_column<std::int32_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_INT16: {
                    _process_column<std::int16_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_INT8: {
                    _process_column<std::int8_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_UINT64: {
                    _process_column<std::uint64_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_UINT32: {
                    _process_column<std::uint32_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_UINT16: {
                    _process_column<std::uint16_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_UINT8: {
                    _process_column<std::uint8_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_FLOAT64: {
                    _process_column<double>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_FLOAT32: {
                    _process_column<float>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_BOOL: {
                    _process_column<std::uint8_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_TIME: {
                    _process_column<std::int64_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_DATE: {
                    _process_column<std::uint32_t>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_STR: {
                    _process_column<std::string>(
                        fcolumn,
                        scolumn,
                        dcolumn,
                        pcolumn,
                        ccolumn,
                        tcolumn,
                        _process_state
                    );
                } break;
                case DTYPE_OBJECT:
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unsupported column dtype");
                }
            }
        }
    );

    /**
     * After all columns have been processed (transitional tables written into),
     * `_process_state.m_flattened_data_table` contains the accumulated state
     * of the dataset that updates the master table on `m_gstate`, including
     * added rows, updated in-place rows, and rows to be removed.
     *
     * `existed_mask` is a bitset marked true for `OP_INSERT`, and false for
     * `OP_DELETE`. If there are any `OP_DELETE`s, the next step returns a
     * new `t_data_table` with the deleted rows masked out.
     */
    std::shared_ptr<t_data_table> flattened_masked;

    if (existed_mask.count() == _process_state.m_flattened_data_table->size()) {
        flattened_masked = _process_state.m_flattened_data_table;
    } else {
        flattened_masked =
            _process_state.m_flattened_data_table->clone(existed_mask);
    }

    PSP_GNODE_VERIFY_TABLE(flattened_masked);

#ifdef PSP_GNODE_VERIFY
    {
        auto updated_table = get_table();
        PSP_GNODE_VERIFY_TABLE(updated_table);
    }
#endif

    m_gstate->update_master_table(flattened_masked.get());

#ifdef PSP_GNODE_VERIFY
    {
        auto updated_table = get_table();
        PSP_GNODE_VERIFY_TABLE(updated_table);
    }
#endif

    m_oports[PSP_PORT_FLATTENED]->set_table(flattened_masked);

    _compute_expressions(get_table_sptr(), flattened_masked);

    result.m_flattened_data_table = flattened_masked;
    result.m_should_notify_userspace = true;

    return result;
}

template <>
void
t_gnode::_process_column<std::string>(
    const t_column* fcolumn,
    const t_column* scolumn,
    t_column* dcolumn,
    t_column* pcolumn,
    t_column* ccolumn,
    t_column* tcolumn,
    const t_process_state& process_state
) {
    pcolumn->borrow_vocabulary(*scolumn);

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

                const char* prev_value = nullptr;
                bool prev_valid = false;

                const auto* cur_value = fcolumn->get_nth<const char>(idx);
                std::string curs(cur_value);

                bool cur_valid = fcolumn->is_valid(idx);

                if (row_pre_existed) {
                    prev_value = scolumn->get_nth<const char>(rlookup.m_idx);
                    prev_valid = scolumn->is_valid(rlookup.m_idx);
                }

                bool exists = cur_valid;
                bool prev_existed = row_pre_existed && prev_valid;
                bool prev_cur_eq = (prev_value != nullptr)
                    && (cur_value != nullptr)
                    && strcmp(prev_value, cur_value) == 0;

                auto trans = calc_transition(
                    prev_existed,
                    row_pre_existed,
                    exists,
                    prev_valid,
                    cur_valid,
                    prev_cur_eq,
                    prev_pkey_eq
                );

                if (prev_valid) {
                    pcolumn->set_nth<t_uindex>(
                        added_count,
                        *(scolumn->get_nth<t_uindex>(rlookup.m_idx))
                    );
                }

                pcolumn->set_valid(added_count, prev_valid);

                if (cur_valid) {
                    ccolumn->set_nth<const char*>(added_count, cur_value);
                }

                if (!cur_valid && prev_valid) {
                    ccolumn->set_nth<const char*>(added_count, prev_value);
                }

                ccolumn->set_valid(
                    added_count, cur_valid ? cur_valid : prev_valid
                );

                tcolumn->set_nth<std::uint8_t>(idx, trans);
            } break;
            case OP_DELETE: {
                if (row_pre_existed) {
                    const auto* prev_value =
                        scolumn->get_nth<const char>(rlookup.m_idx);

                    bool prev_valid = scolumn->is_valid(rlookup.m_idx);

                    pcolumn->set_nth<const char*>(added_count, prev_value);

                    pcolumn->set_valid(added_count, prev_valid);

                    ccolumn->set_nth<const char*>(added_count, prev_value);

                    ccolumn->set_valid(added_count, prev_valid);

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

void
t_gnode::send(t_uindex port_id, const t_data_table& fragments) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `send` to an uninited gnode.");

    if (m_input_ports.count(port_id) == 0) {
        std::cerr << "Cannot send table to port `" << port_id
                  << "`, which does not exist." << '\n';
        return;
    }

    std::shared_ptr<t_port>& input_port = m_input_ports[port_id];
    input_port->send(fragments);
}

bool
t_gnode::process(t_uindex port_id) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `process` on an uninited gnode.");
    PSP_GIL_UNLOCK();
    PSP_WRITE_LOCK(*m_lock);
    t_process_table_result result = _process_table(port_id);

    if (result.m_flattened_data_table) {
        notify_contexts(result.m_flattened_data_table);
    }

    // Whether the user should be notified - False if process_table exited
    // early, True otherwise.
    return result.m_should_notify_userspace;
}

t_uindex
t_gnode::mapping_size() const {
    return m_gstate->mapping_size();
}

t_data_table*
t_gnode::_get_otable(t_uindex port_id) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `_get_otable` on an uninited gnode.");
    PSP_VERBOSE_ASSERT(port_id < m_oports.size(), "Invalid port number");
    return m_oports[port_id]->get_table().get();
}

t_data_table*
t_gnode::_get_itable(t_uindex port_id) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `_get_itable` on an uninited gnode.");
    PSP_VERBOSE_ASSERT(
        m_input_ports.count(port_id) != 0, "Invalid port number"
    );
    return m_input_ports[port_id]->get_table().get();
}

t_data_table*
t_gnode::get_table() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `get_table` on an uninited gnode.");
    return m_gstate->get_table().get();
}

const t_data_table*
t_gnode::get_table() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `get_table` on an uninited gnode.");
    return m_gstate->get_table().get();
}

std::shared_ptr<t_data_table>
t_gnode::get_table_sptr() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `get_table_sptr` on an uninited gnode.");
    return m_gstate->get_table();
}

/**
 * Convenience method for promoting a column.  This is a hack used to
 * interop with javascript more efficiently, and does not handle all
 * possible type conversions.  Non-public.
 */
void
t_gnode::promote_column(const std::string& name, t_dtype new_type) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "Cannot `promote_column` on an uninited gnode.");
    get_table()->promote_column(name, new_type, 0, false);
    _get_otable(0)->promote_column(name, new_type, 0, false);

    for (const auto& iter : m_input_ports) {
        std::shared_ptr<t_port> input_port = iter.second;
        std::shared_ptr<t_data_table> input_table = input_port->get_table();
        input_table->promote_column(name, new_type, 0, false);
    }

    m_output_schema.retype_column(name, new_type);
    m_input_schema.retype_column(name, new_type);
    m_transitional_schemas[0].retype_column(name, new_type);
}

void
t_gnode::pprint() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_gstate->pprint();
}

template <typename CTX_T>
void
t_gnode::set_ctx_state(void* ptr) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    auto* ctx = static_cast<CTX_T*>(ptr);
    ctx->set_state(m_gstate);
}

template <>
void
t_gnode::update_context_from_state(
    t_ctxunit* ctx,
    const std::string& name,
    std::shared_ptr<t_data_table> flattened
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

    // Need to cast shared ptr to a const reference before passing to notify,
    // reference is valid as `notify` is not async
    const auto& const_flattened = const_cast<const t_data_table&>(*flattened);

    ctx->step_begin();
    ctx->notify(const_flattened);
    ctx->step_end();
}

void
t_gnode::_update_contexts_from_state(std::shared_ptr<t_data_table> tbl) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    t_index num_contexts = m_contexts.size();

    // Iterate over contexts in parallel
    std::vector<std::string> context_names(num_contexts);
    std::vector<t_ctx_handle> context_handles(num_contexts);

    t_index count = 0;

    for (const auto& iter : m_contexts) {
        context_names[count] = iter.first;
        context_handles[count] = iter.second;
        count++;
    }

    auto update_contexts_helper = [this,
                                   &context_names,
                                   &context_handles,
                                   &tbl](t_index ctx_idx) {
        const std::string& name = context_names[ctx_idx];
        const t_ctx_handle& ctxh = context_handles[ctx_idx];

        switch (ctxh.get_type()) {
            case TWO_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx2*>(ctxh.m_ctx);
                // Do not reset the expression tables on the context,
                // as they've already been computed.
                ctx->reset(false);
                update_context_from_state<t_ctx2>(ctx, name, tbl);
            } break;
            case ONE_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx1*>(ctxh.m_ctx);
                ctx->reset(false);
                update_context_from_state<t_ctx1>(ctx, name, tbl);
            } break;
            case ZERO_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx0*>(ctxh.m_ctx);
                ctx->reset(false);
                update_context_from_state<t_ctx0>(ctx, name, tbl);
            } break;
            case UNIT_CONTEXT: {
                auto* ctx = static_cast<t_ctxunit*>(ctxh.m_ctx);
                ctx->reset();
                update_context_from_state<t_ctxunit>(ctx, name, tbl);
            } break;
            case GROUPED_PKEY_CONTEXT: {
                auto* ctx = static_cast<t_ctx_grouped_pkey*>(ctxh.m_ctx);
                ctx->reset(false);
                update_context_from_state<t_ctx_grouped_pkey>(ctx, name, tbl);
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }
    };

    parallel_for(int(num_contexts), [&update_contexts_helper](int ctx_idx) {
        update_contexts_helper(ctx_idx);
    });
}

/**
 * @brief Separate `notify_context` for `t_ctxunit` as it does not need to
 * compute any expressions.
 *
 * @tparam
 * @param flattened
 * @param ctxh
 * @param name
 */
template <>
void
t_gnode::notify_context<t_ctxunit>(
    std::shared_ptr<t_data_table> flattened,
    const t_ctx_handle& ctxh,
    const std::string& name
) {
    auto* ctx = ctxh.get<t_ctxunit>();

    std::shared_ptr<t_data_table> delta = m_oports[PSP_PORT_DELTA]->get_table();
    std::shared_ptr<t_data_table> prev = m_oports[PSP_PORT_PREV]->get_table();
    std::shared_ptr<t_data_table> current =
        m_oports[PSP_PORT_CURRENT]->get_table();
    std::shared_ptr<t_data_table> transitions =
        m_oports[PSP_PORT_TRANSITIONS]->get_table();
    const t_data_table& existed = *(m_oports[PSP_PORT_EXISTED]->get_table());

    ctx->step_begin();

    // pass the tables as const references - the destructors for all of the
    // joined tables will be called after this function finishes executing,
    // as the contexts do not retain a reference to these tables.
    ctx->notify(
        *(flattened), *(delta), *(prev), *(current), *(transitions), existed
    );

    ctx->step_end();
}

std::vector<std::string>
t_gnode::get_registered_contexts() const {
    std::vector<std::string> rval;
    rval.reserve(m_contexts.size());

    for (const auto& kv : m_contexts) {
        std::stringstream ss;
        const auto& ctxh = kv.second;
        ss << "(ctx_name => " << kv.first << ", ";

        switch (ctxh.m_ctx_type) {
            case TWO_SIDED_CONTEXT: {
                const auto* ctx = static_cast<const t_ctx2*>(ctxh.m_ctx);
                ss << ctx->repr() << ")";
            } break;
            case ONE_SIDED_CONTEXT: {
                const auto* ctx = static_cast<const t_ctx1*>(ctxh.m_ctx);
                ss << ctx->repr() << ")";
            } break;
            case ZERO_SIDED_CONTEXT: {
                const auto* ctx = static_cast<const t_ctx0*>(ctxh.m_ctx);
                ss << ctx->repr() << ")";
            } break;
            case UNIT_CONTEXT: {
                const auto* ctx = static_cast<const t_ctxunit*>(ctxh.m_ctx);
                ss << ctx->repr() << ")";
            } break;
            case GROUPED_PKEY_CONTEXT: {
                const auto* ctx =
                    static_cast<const t_ctx_grouped_pkey*>(ctxh.m_ctx);
                ss << ctx->repr() << ")";
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }

        rval.push_back(ss.str());
    }

    return rval;
}

void
t_gnode::_register_context(
    const std::string& name, t_ctx_type type, std::uintptr_t ptr
) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    void* ptr_ = reinterpret_cast<void*>(ptr);
    t_ctx_handle ch(ptr_, type);
    m_contexts[name] = ch;

    bool should_update = m_gstate->mapping_size() > 0;
    std::shared_ptr<t_data_table> pkeyed_table;

    if (should_update) {
        pkeyed_table = m_gstate->get_pkeyed_table();
    }

    t_expression_vocab& expression_vocab = *(m_expression_vocab);
    t_regex_mapping& expression_regex_mapping = *(m_expression_regex_mapping);

    switch (type) {
        case TWO_SIDED_CONTEXT: {
            set_ctx_state<t_ctx2>(ptr_);
            auto* ctx = static_cast<t_ctx2*>(ptr_);
            ctx->reset();

            if (should_update) {
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );

                update_context_from_state<t_ctx2>(ctx, name, pkeyed_table);
            }
        } break;
        case ONE_SIDED_CONTEXT: {
            set_ctx_state<t_ctx1>(ptr_);
            auto* ctx = static_cast<t_ctx1*>(ptr_);
            ctx->reset();
            if (should_update) {
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );

                update_context_from_state<t_ctx1>(ctx, name, pkeyed_table);
            }
        } break;
        case ZERO_SIDED_CONTEXT: {
            set_ctx_state<t_ctx0>(ptr_);
            auto* ctx = static_cast<t_ctx0*>(ptr_);
            ctx->reset();
            if (should_update) {
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );

                update_context_from_state<t_ctx0>(ctx, name, pkeyed_table);
            }
        } break;
        case UNIT_CONTEXT: {
            set_ctx_state<t_ctxunit>(ptr_);
            auto* ctx = static_cast<t_ctxunit*>(ptr_);
            ctx->reset();

            // No expressions here to deal with
            if (should_update) {
                update_context_from_state<t_ctxunit>(ctx, name, pkeyed_table);
            }
        } break;
        case GROUPED_PKEY_CONTEXT: {
            set_ctx_state<t_ctx0>(ptr_);
            auto* ctx = static_cast<t_ctx_grouped_pkey*>(ptr_);
            ctx->reset();

            if (should_update) {
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );

                update_context_from_state<t_ctx_grouped_pkey>(
                    ctx, name, pkeyed_table
                );
            }
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unexpected context type");
        } break;
    }
}

void
t_gnode::_unregister_context(const std::string& name) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    if (m_contexts.count(name) != 0) {
        m_contexts.erase(name);
    }
}

void
t_gnode::notify_contexts(std::shared_ptr<t_data_table> flattened) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    t_index num_contexts = m_contexts.size();
    std::vector<std::string> context_names(num_contexts);
    std::vector<t_ctx_handle> ctxhvec(num_contexts);

    t_index ctxh_count = 0;

    for (const auto& iter : m_contexts) {
        context_names[ctxh_count] = iter.first;
        ctxhvec[ctxh_count] = iter.second;
        ctxh_count++;
    }

    auto notify_context_helper =
        [this, &context_names, &ctxhvec, &flattened](t_index ctx_idx) {
            const std::string& name = context_names[ctx_idx];
            const t_ctx_handle& ctxh = ctxhvec[ctx_idx];

            switch (ctxh.get_type()) {
                case TWO_SIDED_CONTEXT: {
                    notify_context<t_ctx2>(flattened, ctxh, name);
                } break;
                case ONE_SIDED_CONTEXT: {
                    notify_context<t_ctx1>(flattened, ctxh, name);
                } break;
                case ZERO_SIDED_CONTEXT: {
                    notify_context<t_ctx0>(flattened, ctxh, name);
                } break;
                case UNIT_CONTEXT: {
                    notify_context<t_ctxunit>(flattened, ctxh, name);
                } break;
                case GROUPED_PKEY_CONTEXT: {
                    notify_context<t_ctx_grouped_pkey>(flattened, ctxh, name);
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unexpected context type");
                } break;
            }
        };

    parallel_for(int(num_contexts), [&notify_context_helper](int ctx_idx) {
        notify_context_helper(ctx_idx);
    });
}

/******************************************************************************
 *
 * Expressions
 */

void
t_gnode::_compute_expressions(
    const std::shared_ptr<t_data_table>& flattened_masked
) {
    t_expression_vocab& expression_vocab = *(m_expression_vocab);
    t_regex_mapping& expression_regex_mapping = *(m_expression_regex_mapping);

    for (const auto& iter : m_contexts) {
        const t_ctx_handle& ctxh = iter.second;
        switch (ctxh.get_type()) {
            case TWO_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx2*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );
            } break;
            case ONE_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx1*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );
            } break;
            case ZERO_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx0*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );
            } break;
            case GROUPED_PKEY_CONTEXT: {
                auto* ctx = static_cast<t_ctx_grouped_pkey*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    m_gstate->get_table(),
                    m_gstate->get_pkey_map(),
                    expression_vocab,
                    expression_regex_mapping
                );
                ctx->get_expression_tables()->set_flattened(
                    m_gstate->get_pkeyed_table(
                        ctx->get_expression_tables()->m_master->get_schema(),
                        ctx->get_expression_tables()->m_master
                    )
                );
            } break;
            case UNIT_CONTEXT:
                break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }
    }
}

void
t_gnode::_compute_expressions(
    const std::shared_ptr<t_data_table>& master,
    const std::shared_ptr<t_data_table>& flattened
) {
    std::shared_ptr<t_data_table> delta = m_oports[PSP_PORT_DELTA]->get_table();
    std::shared_ptr<t_data_table> prev = m_oports[PSP_PORT_PREV]->get_table();
    std::shared_ptr<t_data_table> current =
        m_oports[PSP_PORT_CURRENT]->get_table();
    std::shared_ptr<t_data_table> transitions =
        m_oports[PSP_PORT_TRANSITIONS]->get_table();
    std::shared_ptr<t_data_table> existed =
        m_oports[PSP_PORT_EXISTED]->get_table();

    t_expression_vocab& expression_vocab = *(m_expression_vocab);
    t_regex_mapping& expression_regex_mapping = *(m_expression_regex_mapping);

    for (const auto& iter : m_contexts) {
        const t_ctx_handle& ctxh = iter.second;

        switch (ctxh.get_type()) {
            case TWO_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx2*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    master,
                    m_gstate->get_pkey_map(),
                    flattened,
                    delta,
                    prev,
                    current,
                    transitions,
                    existed,
                    expression_vocab,
                    expression_regex_mapping
                );
            } break;
            case ONE_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx1*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    master,
                    m_gstate->get_pkey_map(),
                    flattened,
                    delta,
                    prev,
                    current,
                    transitions,
                    existed,
                    expression_vocab,
                    expression_regex_mapping
                );
            } break;
            case ZERO_SIDED_CONTEXT: {
                auto* ctx = static_cast<t_ctx0*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    master,
                    m_gstate->get_pkey_map(),
                    flattened,
                    delta,
                    prev,
                    current,
                    transitions,
                    existed,
                    expression_vocab,
                    expression_regex_mapping
                );
            } break;
            case GROUPED_PKEY_CONTEXT: {
                auto* ctx = static_cast<t_ctx_grouped_pkey*>(ctxh.m_ctx);
                ctx->compute_expressions(
                    master,
                    m_gstate->get_pkey_map(),
                    flattened,
                    delta,
                    prev,
                    current,
                    transitions,
                    existed,
                    expression_vocab,
                    expression_regex_mapping
                );
            } break;
            case UNIT_CONTEXT:
                break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }
    }
}

/******************************************************************************
 *
 * Getters
 */

const t_gstate::t_mapping&
t_gnode::get_pkey_map() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_gstate->get_pkey_map();
}

std::shared_ptr<t_expression_vocab>
t_gnode::get_expression_vocab() const {
    return m_expression_vocab;
}

std::shared_ptr<t_regex_mapping>
t_gnode::get_expression_regex_mapping() const {
    return m_expression_regex_mapping;
}

t_schema
t_gnode::get_output_schema() const {
    return m_output_schema;
}

std::vector<t_pivot>
t_gnode::get_pivots() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    std::vector<t_pivot> rval;

    for (const auto& iter : m_contexts) {
        auto ctxh = iter.second;

        switch (ctxh.m_ctx_type) {
            case TWO_SIDED_CONTEXT: {
                const auto* ctx = static_cast<const t_ctx2*>(ctxh.m_ctx);
                auto pivots = ctx->get_pivots();
                rval.insert(
                    std::end(rval), std::begin(pivots), std::end(pivots)
                );
            } break;
            case ONE_SIDED_CONTEXT: {
                const auto* ctx = static_cast<const t_ctx1*>(ctxh.m_ctx);
                auto pivots = ctx->get_pivots();
                rval.insert(
                    std::end(rval), std::begin(pivots), std::end(pivots)
                );
            } break;
            case UNIT_CONTEXT:
            case ZERO_SIDED_CONTEXT:
            case GROUPED_PKEY_CONTEXT: {
                // no pivots
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }
    }

    return rval;
}

std::vector<t_stree*>
t_gnode::get_trees() {

    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    std::vector<t_stree*> rval;

    for (const auto& kv : m_contexts) {
        const auto& ctxh = kv.second;

        switch (ctxh.m_ctx_type) {
            // `get_trees()` not implemented, as unit contexts have no
            // traversal of their own.
            case UNIT_CONTEXT:
                break;
            case TWO_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx2*>(ctxh.m_ctx);
                auto trees = ctx->get_trees();
                rval.insert(rval.end(), std::begin(trees), std::end(trees));
            } break;
            case ONE_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx1*>(ctxh.m_ctx);
                auto trees = ctx->get_trees();
                rval.insert(rval.end(), std::begin(trees), std::end(trees));
            } break;
            case ZERO_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx0*>(ctxh.m_ctx);
                auto trees = ctx->get_trees();
                rval.insert(rval.end(), std::begin(trees), std::end(trees));
            } break;
            case GROUPED_PKEY_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx_grouped_pkey*>(ctxh.m_ctx);
                auto trees = ctx->get_trees();
                rval.insert(rval.end(), std::begin(trees), std::end(trees));
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }
    }
    return rval;
}

void
t_gnode::set_id(t_uindex id) {
    m_id = id;
}

t_uindex
t_gnode::get_id() const {
    return m_id;
}

t_uindex
t_gnode::num_input_ports() const {
    return m_input_ports.size();
}

t_uindex
t_gnode::num_output_ports() const {
    return m_oports.size();
}

void
t_gnode::release_inputs() {
    for (const auto& iter : m_input_ports) {
        std::shared_ptr<t_port> input_port = iter.second;
        input_port->release();
    }
}

void
t_gnode::release_outputs() {
    for (const auto& p : m_oports) {
        p->release();
    }
}

std::vector<std::string>
t_gnode::get_contexts_last_updated() const {
    std::vector<std::string> rval;

    for (const auto& kv : m_contexts) {
        auto ctxh = kv.second;
        switch (ctxh.m_ctx_type) {
            case TWO_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx2*>(ctxh.m_ctx);
                if (ctx->has_deltas()) {
                    rval.push_back(kv.first);
                }
            } break;
            case ONE_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx1*>(ctxh.m_ctx);
                if (ctx->has_deltas()) {
                    rval.push_back(kv.first);
                }
            } break;
            case ZERO_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx0*>(ctxh.m_ctx);
                if (ctx->has_deltas()) {
                    rval.push_back(kv.first);
                }
            } break;
            case UNIT_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctxunit*>(ctxh.m_ctx);
                if (ctx->has_deltas()) {
                    rval.push_back(kv.first);
                }
            } break;
            case GROUPED_PKEY_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx_grouped_pkey*>(ctxh.m_ctx);
                if (ctx->has_deltas()) {
                    rval.push_back(kv.first);
                }
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }
    }

    if (t_env::log_progress()) {
        std::cout << "get_contexts_last_updated<" << '\n';
        for (const auto& s : rval) {
            std::cout << "\t" << s << '\n';
        }
        std::cout << ">\n";
    }
    return rval;
}

std::vector<t_tscalar>
t_gnode::get_row_data_pkeys(const std::vector<t_tscalar>& pkeys) const {
    return m_gstate->get_row_data_pkeys(pkeys);
}

void
t_gnode::reset() {
    std::vector<std::string> rval;

    for (const auto& kv : m_contexts) {
        auto ctxh = kv.second;
        switch (ctxh.m_ctx_type) {
            case TWO_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx2*>(ctxh.m_ctx);
                ctx->reset();
            } break;
            case ONE_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx1*>(ctxh.m_ctx);
                ctx->reset();
            } break;
            case ZERO_SIDED_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx0*>(ctxh.m_ctx);
                ctx->reset();
            } break;
            case UNIT_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctxunit*>(ctxh.m_ctx);
                ctx->reset();
            } break;
            case GROUPED_PKEY_CONTEXT: {
                auto* ctx = reinterpret_cast<t_ctx_grouped_pkey*>(ctxh.m_ctx);
                ctx->reset();
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected context type");
            } break;
        }
    }

    m_gstate->reset();

    // Clear expression-related state
    m_expression_vocab->clear();
    m_expression_regex_mapping->clear();
}

void
t_gnode::clear_input_ports() {
    for (const auto& iter : m_input_ports) {
        std::shared_ptr<t_port> input_port = iter.second;
        input_port->get_table()->clear();
    }
}

void
t_gnode::clear_output_ports() {
    PSP_GIL_UNLOCK();
    PSP_WRITE_LOCK(*m_lock);
    for (const auto& m_oport : m_oports) {
        m_oport->get_table()->clear();
    }
}

void
t_gnode::set_pool_cleanup(std::function<void()> cleanup) {
    m_pool_cleanup = std::move(cleanup);
}

const t_schema&
t_gnode::get_state_input_schema() const {
    return m_gstate->get_input_schema();
}

bool
t_gnode::was_updated() const {
    return m_was_updated;
}

void
t_gnode::clear_updated() {
    m_was_updated = false;
}

std::string
t_gnode::repr() const {
    std::stringstream ss;
    ss << "t_gnode<" << this << ">";
    return ss.str();
}

#ifdef PSP_PARALLEL_FOR
void
t_gnode::set_lock(std::shared_mutex* lock) {
    m_lock = lock;
}
#endif

void
t_gnode::register_context(
    const std::string& name, const std::shared_ptr<t_ctxunit>& ctx
) {
    _register_context(
        name, UNIT_CONTEXT, reinterpret_cast<std::int64_t>(ctx.get())
    );
}

void
t_gnode::register_context(
    const std::string& name, const std::shared_ptr<t_ctx0>& ctx
) {
    _register_context(
        name, ZERO_SIDED_CONTEXT, reinterpret_cast<std::int64_t>(ctx.get())
    );
}

void
t_gnode::register_context(
    const std::string& name, const std::shared_ptr<t_ctx1>& ctx
) {
    _register_context(
        name, ONE_SIDED_CONTEXT, reinterpret_cast<std::int64_t>(ctx.get())
    );
}

void
t_gnode::register_context(
    const std::string& name, const std::shared_ptr<t_ctx2>& ctx
) {
    _register_context(
        name, TWO_SIDED_CONTEXT, reinterpret_cast<std::int64_t>(ctx.get())
    );
}
void
t_gnode::register_context(
    const std::string& name, const std::shared_ptr<t_ctx_grouped_pkey>& ctx
) {
    _register_context(
        name, GROUPED_PKEY_CONTEXT, reinterpret_cast<std::int64_t>(ctx.get())
    );
}

} // end namespace perspective
