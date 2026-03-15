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
#include <perspective/gnode_state.h>
#include <perspective/mask.h>
#include <perspective/sym_table.h>
#include <perspective/parallel_for.h>

#include <utility>

namespace perspective {

t_gstate::t_gstate(t_schema input_schema, t_schema output_schema) :
    m_input_schema(std::move(input_schema)),
    m_output_schema(std::move(output_schema)),
    m_init(false) {
    LOG_CONSTRUCTOR("t_gstate");
}

t_gstate::~t_gstate() { LOG_DESTRUCTOR("t_gstate"); }

void
t_gstate::init() {
    m_table = std::make_shared<t_data_table>(
        "", "", m_input_schema, DEFAULT_EMPTY_CAPACITY, BACKING_STORE_MEMORY
    );
    m_table->init();
    m_pkcol = m_table->get_column("psp_pkey");
    m_opcol = m_table->get_column("psp_op");
    m_init = true;
}

t_rlookup
t_gstate::lookup(t_tscalar pkey) const {
    t_rlookup rval(0, false);

    t_mapping::const_iterator iter = m_mapping.find(pkey);

    if (iter == m_mapping.end()) {
        return rval;
    }

    rval.m_idx = iter->second;
    rval.m_exists = true;
    return rval;
}

void
t_gstate::_mark_deleted(t_uindex idx) {
    m_free.insert(idx);
}

void
t_gstate::erase(const t_tscalar& pkey) {
    t_mapping::const_iterator iter = m_mapping.find(pkey);

    if (iter == m_mapping.end()) {
        return;
    }

    auto columns = m_table->get_columns();

    t_uindex idx = iter->second;

    for (auto* c : columns) {
        c->clear(idx);
    }

    m_mapping.erase(iter);
    _mark_deleted(idx);
}

t_uindex
t_gstate::lookup_or_create(const t_tscalar& pkey) {
    auto pkey_ = m_symtable.get_interned_tscalar(pkey);
    t_mapping::const_iterator iter = m_mapping.find(pkey_);

    if (iter != m_mapping.end()) {
        return iter->second;
    }

    if (!m_free.empty()) {
        t_free_items::const_iterator iter = m_free.begin();
        t_uindex idx = *iter;
        m_free.erase(iter);
        m_mapping.emplace(pkey_, idx);
        return idx;
    }

    t_uindex nrows = m_table->num_rows();
    if (nrows >= m_table->get_capacity() - 1) {
        m_table->reserve(std::max(
            nrows + 1,
            static_cast<t_uindex>(
                m_table->get_capacity() * PSP_TABLE_GROW_RATIO
            )
        ));
    }

    m_table->set_size(nrows + 1);
    m_opcol->set_nth<std::uint8_t>(nrows, OP_INSERT);
    m_pkcol->set_scalar(nrows, pkey);
    m_mapping.emplace(pkey_, nrows);
    return nrows;
}

void
t_gstate::fill_master_table(const t_data_table* flattened) {
    // insert into empty `m_table`
    m_free.clear();
    m_mapping.clear();

    const t_schema& master_table_schema = m_table->get_schema();

    const t_column* flattened_pkey_col =
        flattened->_get_const_column("psp_pkey");
    const t_column* flattened_op_col =
        flattened->_get_const_column("psp_op");

    t_uindex ncols = m_table->num_columns();
    auto* master_table = m_table.get();

    parallel_for(
        int(ncols),
        [&master_table, &master_table_schema, &flattened](int idx) {
            // Clone each column from flattened into `m_table`
            const std::string& column_name = master_table_schema.m_columns[idx];
            // No need for safe lookup as master_table schema == flattened
            // schema
            const t_column* flattened_column =
                flattened->_get_const_column_safe(column_name);
            if (!flattened_column) {
                return;
            }
            master_table->set_column(idx, flattened_column->clone());
        }
    );

    m_pkcol = master_table->get_column("psp_pkey");
    m_opcol = master_table->get_column("psp_op");

    master_table->set_capacity(flattened->get_capacity());
    master_table->set_size(flattened->size());

    const std::uint8_t* flattened_op_base =
        flattened_op_col->get_nth_base<std::uint8_t>();
    for (t_uindex idx = 0, loop_end = flattened->num_rows(); idx < loop_end;
         ++idx) {
        t_tscalar pkey = flattened_pkey_col->get_scalar(idx);
        t_op op = static_cast<t_op>(flattened_op_base[idx]);

        switch (op) {
            case OP_INSERT: {
                // Write new primary keys into `m_mapping`
                m_mapping.emplace(
                    m_symtable.get_interned_tscalar(pkey), idx
                );
                m_opcol->set_nth<std::uint8_t>(idx, OP_INSERT);
                m_pkcol->set_scalar(idx, pkey);
            } break;
            case OP_DELETE: {
                _mark_deleted(idx);
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected OP");
            } break;
        }
    }

#ifdef PSP_TABLE_VERIFY
    master_table->verify();
#endif
}

void
t_gstate::update_master_table(const t_data_table* flattened) {
    if (num_rows() == 0) {
        fill_master_table(flattened);
        return;
    }

    // Update existing `m_table`
    const t_column* flattened_pkey_col =
        flattened->_get_const_column("psp_pkey");
    const t_column* flattened_op_col =
        flattened->_get_const_column("psp_op");

    t_data_table* master_table = m_table.get();
    std::vector<t_uindex> master_table_indexes(flattened->num_rows());
    const std::uint8_t* flattened_op_base =
        flattened_op_col->get_nth_base<std::uint8_t>();

    for (t_uindex idx = 0, loop_end = flattened->num_rows(); idx < loop_end;
         ++idx) {
        t_tscalar pkey = flattened_pkey_col->get_scalar(idx);
        t_op op = static_cast<t_op>(flattened_op_base[idx]);

        switch (op) {
            case OP_INSERT: {
                // Lookup/create the row index in `m_table` based on pkey
                master_table_indexes[idx] = lookup_or_create(pkey);

                // Write the op and pkey to `m_table`
                m_opcol->set_nth<std::uint8_t>(
                    master_table_indexes[idx], OP_INSERT
                );
                m_pkcol->set_scalar(master_table_indexes[idx], pkey);
            } break;
            case OP_DELETE: {
                // Erase the pkey from the master table, but this does not
                // change the size as the row isn't removed, just cleared out.
                erase(pkey);
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected OP");
            } break;
        }
    }

    const t_schema& master_schema = m_table->get_schema();
    t_uindex ncols = master_table->num_columns();

    parallel_for(
        int(ncols),
        [flattened,
         flattened_op_col,
         &master_schema,
         &master_table,
         &master_table_indexes,
         this](int idx) {
            const std::string& column_name = master_schema.m_columns[idx];
            t_column* master_column =
                master_table->_get_column(column_name);
            const t_column* flattened_column =
                flattened->_get_const_column_safe(column_name);
            if (!flattened_column) {
                return;
            }
            update_master_column(
                master_column,
                flattened_column,
                flattened_op_col,
                master_table_indexes,
                flattened->num_rows()
            );
        }
    );
}

void
t_gstate::update_master_column(
    t_column* master_column,
    const t_column* flattened_column,
    const t_column* op_column,
    const std::vector<t_uindex>& master_table_indexes,
    t_uindex num_rows
) {
    const std::uint8_t* op_base = op_column->get_nth_base<std::uint8_t>();
    for (t_uindex idx = 0, loop_end = num_rows; idx < loop_end; ++idx) {
        bool is_valid = flattened_column->is_valid(idx);
        t_uindex master_table_idx = master_table_indexes[idx];

        if (!is_valid) {
            bool is_cleared = flattened_column->is_cleared(idx);
            if (is_cleared) {
                master_column->clear(master_table_idx);
            }
            continue;
        }

        t_op op = static_cast<t_op>(op_base[idx]);

        if (op == OP_DELETE) {
            continue;
        }

        switch (flattened_column->get_dtype()) {
            case DTYPE_NONE: {
            } break;
            case DTYPE_INT64: {
                master_column->set_nth<std::int64_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::int64_t>(idx))
                );
            } break;
            case DTYPE_INT32: {
                master_column->set_nth<std::int32_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::int32_t>(idx))
                );
            } break;
            case DTYPE_INT16: {
                master_column->set_nth<std::int16_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::int16_t>(idx))
                );
            } break;
            case DTYPE_INT8: {
                master_column->set_nth<std::int8_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::int8_t>(idx))
                );
            } break;
            case DTYPE_UINT64: {
                master_column->set_nth<std::uint64_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::uint64_t>(idx))
                );
            } break;
            case DTYPE_UINT32: {
                master_column->set_nth<std::uint32_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::uint32_t>(idx))
                );
            } break;
            case DTYPE_UINT16: {
                master_column->set_nth<std::uint16_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::uint16_t>(idx))
                );
            } break;
            case DTYPE_UINT8: {
                master_column->set_nth<std::uint8_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::uint8_t>(idx))
                );
            } break;
            case DTYPE_FLOAT64: {
                master_column->set_nth<double>(
                    master_table_idx, *(flattened_column->get_nth<double>(idx))
                );
            } break;
            case DTYPE_FLOAT32: {
                master_column->set_nth<float>(
                    master_table_idx, *(flattened_column->get_nth<float>(idx))
                );
            } break;
            case DTYPE_BOOL: {
                master_column->set_nth<std::uint8_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::uint8_t>(idx))
                );
            } break;
            case DTYPE_TIME: {
                master_column->set_nth<std::int64_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::int64_t>(idx))
                );
            } break;
            case DTYPE_DATE: {
                master_column->set_nth<std::uint32_t>(
                    master_table_idx,
                    *(flattened_column->get_nth<std::uint32_t>(idx))
                );
            } break;
            case DTYPE_STR: {
                master_column->set_nth<const char*>(
                    master_table_idx, flattened_column->get_nth<const char>(idx)
                );
            } break;
            case DTYPE_OBJECT:
            default: {
                PSP_COMPLAIN_AND_ABORT("Unexpected type");
            }
        }
    }
}

void
t_gstate::pprint() const {
    std::vector<t_uindex> indices(m_mapping.size());
    t_uindex idx = 0;
    for (const auto& iter : m_mapping) {
        indices[idx] = iter.second;
        ++idx;
    }
    m_table->pprint(indices);
}

t_mask
t_gstate::get_cpp_mask() const {
    t_uindex sz = m_table->size();
    t_mask msk(sz);
    for (const auto& iter : m_mapping) {
        msk.set(iter.second, true);
    }
    return msk;
}

std::shared_ptr<t_data_table>
t_gstate::get_table() const {
    return m_table;
}

t_tscalar
t_gstate::read_by_pkey(
    const t_data_table& table, const std::string& colname, t_tscalar& pkey
) const {
    const t_column* col_ = table._get_const_column(colname);
    t_mapping::const_iterator iter = m_mapping.find(pkey);
    if (iter != m_mapping.end()) {
        return col_->get_scalar(iter->second);
    }
    PSP_COMPLAIN_AND_ABORT("Called without pkey");
}

void
t_gstate::resolve_pkeys(
    const std::vector<t_tscalar>& pkeys,
    std::vector<t_uindex>& out_row_indices
) const {
    t_uindex num_rows = pkeys.size();
    out_row_indices.resize(num_rows);
    constexpr t_uindex INVALID_ROW = t_uindex(-1);
    for (t_uindex idx = 0; idx < num_rows; ++idx) {
        t_mapping::const_iterator iter = m_mapping.find(pkeys[idx]);
        if (iter != m_mapping.end()) {
            out_row_indices[idx] = iter->second;
        } else {
            out_row_indices[idx] = INVALID_ROW;
        }
    }
}

void
t_gstate::read_column(
    const t_data_table& table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    std::vector<t_tscalar>& out_data
) const {
    t_index num_rows = pkeys.size();
    const t_column* col_ = table._get_const_column(colname);
    out_data.resize(num_rows);

    for (t_index idx = 0; idx < num_rows; ++idx) {
        t_mapping::const_iterator iter = m_mapping.find(pkeys[idx]);
        if (iter != m_mapping.end()) {
            out_data[idx].set(col_->get_scalar(iter->second));
        } else {
            out_data[idx] = t_tscalar();
        }
    }
}

void
t_gstate::read_column(
    const t_data_table& table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    std::vector<double>& out_data
) const {
    read_column(table, colname, pkeys, out_data, true);
}

void
t_gstate::read_column(
    const t_data_table& table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    std::vector<double>& out_data,
    bool include_nones
) const {
    t_index num_rows = pkeys.size();
    const t_column* col_ = table._get_const_column(colname);

    out_data.clear();
    out_data.reserve(num_rows);
    for (t_index idx = 0; idx < num_rows; ++idx) {
        t_mapping::const_iterator iter = m_mapping.find(pkeys[idx]);
        if (iter != m_mapping.end()) {
            auto tscalar = col_->get_scalar(iter->second);
            if (include_nones || tscalar.is_valid()) {
                out_data.push_back(tscalar.to_double());
            }
        }
    }
}

void
t_gstate::read_column(
    const t_data_table& table,
    const std::string& colname,
    t_uindex start_idx,
    t_uindex end_idx,
    std::vector<t_tscalar>& out_data
) const {
    t_index num_rows = end_idx - start_idx;

    // Don't read invalid row indices.
    if (num_rows <= 0) {
        return;
    }

    const t_column* col_ = table._get_const_column(colname);

    out_data.resize(num_rows);

    t_uindex i = 0;
    for (t_uindex idx = start_idx; idx < end_idx; ++idx) {
        out_data[i] = col_->get_scalar(idx);
        i++;
    }
}

void
t_gstate::read_column(
    const t_data_table& table,
    const std::string& colname,
    const std::vector<t_uindex>& row_indices,
    std::vector<t_tscalar>& out_data
) const {
    const t_column* col_ = table._get_const_column(colname);

    t_index num_rows = row_indices.size();
    out_data.resize(num_rows);

    t_uindex i = 0;
    for (auto idx : row_indices) {
        out_data[i] = col_->get_scalar(idx);
        i++;
    }
}

t_tscalar
t_gstate::get(
    const t_data_table& table, const std::string& colname, t_tscalar pkey
) const {
    t_mapping::const_iterator iter = m_mapping.find(pkey);
    if (iter != m_mapping.end()) {
        return table._get_const_column(colname)->get_scalar(iter->second);
    }

    return {};
}

t_tscalar
t_gstate::get_value(
    const t_data_table& table, const std::string& colname, const t_tscalar& pkey
) const {
    const t_column* col_ = table._get_const_column(colname);
    t_tscalar rval = mknone();

    auto iter = m_mapping.find(pkey);
    if (iter != m_mapping.end()) {
        rval.set(col_->get_scalar(iter->second));
    }

    return rval;
}

bool
t_gstate::is_unique(
    const t_data_table& table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    t_tscalar& value
) const {
    const t_column* col_ = table._get_const_column(colname);
    value = mknone();

    for (const auto& pkey : pkeys) {
        t_mapping::const_iterator iter = m_mapping.find(pkey);
        if (iter != m_mapping.end()) {
            auto tmp = col_->get_scalar(iter->second);
            if (!value.is_none() && value != tmp) {
                return false;
            }
            value = tmp;
        }
    }

    return true;
}

bool
t_gstate::apply(
    const t_data_table& table,
    const std::string& colname,
    const std::vector<t_tscalar>& pkeys,
    t_tscalar& value,
    const std::function<bool(const t_tscalar&, t_tscalar&)>& fn
) const {
    const t_column* col_ = table._get_const_column(colname);

    value = mknone();

    for (const auto& pkey : pkeys) {
        t_mapping::const_iterator iter = m_mapping.find(pkey);
        if (iter != m_mapping.end()) {
            auto tmp = col_->get_scalar(iter->second);
            bool done = fn(tmp, value);
            if (done) {
                value = tmp;
                return done;
            }
        }
    }

    return false;
}

const t_schema&
t_gstate::get_output_schema() const {
    return m_output_schema;
}

const t_gstate::t_mapping&
t_gstate::get_pkey_map() const {
    return m_mapping;
}

t_dtype
t_gstate::get_pkey_dtype() const {
    if (m_mapping.empty()) {
        return DTYPE_STR;
    }
    auto iter = m_mapping.begin();
    return iter->first.get_dtype();
}

std::shared_ptr<t_data_table>
t_gstate::get_pkeyed_table() const {
    return get_pkeyed_table(m_input_schema, m_table);
}

std::shared_ptr<t_data_table>
t_gstate::get_pkeyed_table(
    const t_schema& schema, const std::shared_ptr<t_data_table>& table
) const {
    // If there are no removes, just return the gstate table. Removes would
    // cause m_mapping to be smaller than m_table.
    if (m_mapping.size() == table->size()) {
        return table;
    }

    // Otherwise mask out the removed rows and return the table.
    auto mask = get_cpp_mask();

    // count = total number of rows - number of removed rows
    t_uindex table_size = mask.count();

    const auto& schema_columns = schema.m_columns;
    t_uindex num_columns = schema_columns.size();

    std::shared_ptr<t_data_table> rval =
        std::make_shared<t_data_table>(schema, table_size);
    rval->init();
    rval->set_size(table_size);

    parallel_for(
        int(num_columns),
        [&schema_columns, rval, table, &mask](int colidx) {
            const std::string& colname = schema_columns[colidx];
            rval->set_column(
                colname, table->_get_const_column(colname)->clone(mask)
            );
        }

    );

    return rval;
}

t_uindex
t_gstate::num_rows() const {
    return m_table->num_rows();
}

t_uindex
t_gstate::num_columns() const {
    return m_table->num_columns();
}

std::vector<t_tscalar>
t_gstate::get_row_data_pkeys(const std::vector<t_tscalar>& pkeys) const {
    t_uindex ncols = m_table->num_columns();
    const t_schema& schema = m_table->get_schema();
    std::vector<t_tscalar> rval;
    rval.reserve(pkeys.size() * ncols);

    std::vector<const t_column*> columns(ncols);
    for (t_uindex idx = 0, loop_end = schema.size(); idx < loop_end; ++idx) {
        const std::string& cname = schema.m_columns[idx];
        columns[idx] = m_table->_get_const_column(cname);
    }

    auto none = mknone();

    for (const auto& pkey : pkeys) {
        t_mapping::const_iterator iter = m_mapping.find(pkey);
        if (iter == m_mapping.end()) {
            continue;
        }

        for (t_uindex cidx = 0; cidx < ncols; ++cidx) {
            auto v = columns[cidx]->get_scalar(iter->second);
            if (v.is_valid()) {
                rval.push_back(v);
            } else {
                rval.push_back(none);
            }
        }
    }
    return rval;
}

bool
t_gstate::has_pkey(t_tscalar pkey) const {
    return m_mapping.find(pkey) != m_mapping.end();
}

std::vector<t_tscalar>
t_gstate::has_pkeys(const std::vector<t_tscalar>& pkeys) const {
    if (pkeys.empty()) {
        return {};
    }

    std::vector<t_tscalar> rval(pkeys.size());
    t_uindex idx = 0;

    for (const auto& p : pkeys) {
        t_tscalar tval;
        tval.set(m_mapping.find(p) != m_mapping.end());
        rval[idx].set(tval);
        ++idx;
    }

    return rval;
}

std::vector<t_tscalar>
t_gstate::get_pkeys() const {
    std::vector<t_tscalar> rval(m_mapping.size());
    t_uindex idx = 0;
    for (const auto& kv : m_mapping) {
        rval[idx].set(kv.first);
        ++idx;
    }
    return rval;
}

std::pair<t_tscalar, t_tscalar>
get_vec_min_max(const std::vector<t_tscalar>& vec) {
    t_tscalar min = mknone();
    t_tscalar max = mknone();

    for (const auto& v : vec) {
        if (min.is_none()) {
            min = v;
        } else {
            min = std::min(v, min);
        }

        if (max.is_none()) {
            max = v;
        } else {
            max = std::max(v, max);
        }
    }

    return std::pair<t_tscalar, t_tscalar>(min, max);
}

t_uindex
t_gstate::mapping_size() const {
    return m_mapping.size();
}

void
t_gstate::reset() {
    m_table->reset();
    m_mapping.clear();
    m_free.clear();
}

const t_schema&
t_gstate::get_input_schema() const {
    return m_input_schema;
}

std::vector<t_uindex>
t_gstate::get_pkeys_idx(const std::vector<t_tscalar>& pkeys) const {
    std::vector<t_uindex> rv;
    rv.reserve(pkeys.size());

    for (const auto& p : pkeys) {
        auto lk = lookup(p);
        std::cout << "pkey " << p << " exists " << lk.m_exists << '\n';
        if (lk.m_exists) {
            rv.push_back(lk.m_idx);
        }
    }
    return rv;
}

} // end namespace perspective
