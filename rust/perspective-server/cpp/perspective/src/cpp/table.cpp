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

#include "perspective/arrow_loader.h"
#include "perspective/base.h"
#include "perspective/column.h"
#include "perspective/computed_expression.h"
#include "perspective/data_table.h"
#include "perspective/raw_types.h"
#include "perspective/json_loader.h"
#include "perspective/schema.h"
#include "rapidjson/document.h"
#include <chrono>
#include <ctime>
#include <memory>
#include <optional>
#include <perspective/table.h>
#include <rapidjson/writer.h>
#include <sstream>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>

// Give each Table a unique ID so that operations on it map back correctly
static perspective::t_uindex GLOBAL_TABLE_ID = 0;

namespace perspective {
Table::Table(
    std::shared_ptr<t_pool> pool,
    std::vector<std::string> column_names,
    std::vector<t_dtype> data_types,
    std::uint32_t limit,
    std::string index,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) :
    m_init(false),
    m_id(GLOBAL_TABLE_ID++),
    m_pool(std::move(pool)),
    m_column_names(std::move(column_names)),
    m_data_types(std::move(data_types)),
    m_offset(0),
    m_limit(limit),
    m_index(std::move(index)),
    m_gnode_set(false),
    m_backing_store(backing_store),
    m_list_flatten(list_flatten) {

    validate_columns(m_column_names);
}

void
Table::init(
    t_data_table& data_table,
    std::uint32_t row_count,
    const t_op op,
    const t_uindex port_id
) {
    /**
     * For the Table to be initialized correctly, make sure that the operation
     * and index columns are processed before the new offset is calculated.
     * Calculating the offset before the `process_op_column` and
     * `process_index_column` causes primary keys to be misaligned.
     */
    process_op_column(data_table, op);
    calculate_offset(row_count);

    if (!m_gnode_set) {
        // create a new gnode, send it to the table
        auto new_gnode = make_gnode(data_table.get_schema());
        set_gnode(new_gnode);
        m_pool->register_gnode(m_gnode.get());
    }

    PSP_VERBOSE_ASSERT(m_gnode_set, "gnode is not set!");
    m_pool->send(m_gnode->get_id(), port_id, data_table);

    m_init = true;
}

void
Table::init_bulk(
    const std::shared_ptr<t_data_table>& data_table,
    std::uint32_t row_count
) {
    PSP_VERBOSE_ASSERT(
        !m_gnode_set,
        "`init_bulk` can only be used for the initial load of a `Table`."
    );

    process_op_column(*data_table, t_op::OP_INSERT);
    calculate_offset(row_count);

    auto new_gnode = make_gnode(data_table->get_schema());
    set_gnode(new_gnode);
    m_pool->register_gnode(m_gnode.get());

    m_gnode->init_bulk(data_table);

    m_init = true;
}

t_uindex
Table::size() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    // the gstate master table has all rows including removed ones; the mapping
    // contains only the current rows in the table.
    return m_gnode->mapping_size();
}

t_schema
Table::get_schema() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    auto schema = m_gnode->get_output_schema();
    std::vector<std::string> names = schema.columns();
    std::vector<t_dtype> types = schema.types();
    auto implicit_index_it = std::find(names.begin(), names.end(), "psp_okey");
    if (implicit_index_it != names.end()) {
        auto idx = std::distance(names.begin(), implicit_index_it);
        names.erase(names.begin() + idx);
        types.erase(types.begin() + idx);
    }

    return {names, types};
}

t_validated_expression_map
Table::validate_expressions(
    const std::vector<std::tuple<
        std::string,
        std::string,
        std::string,
        std::vector<std::pair<std::string, std::string>>>>& expressions
) const {
    t_validated_expression_map rval = t_validated_expression_map();

    // Expression columns live on the `t_gstate` master table, so this
    // schema will always contain ALL expressions columns created by ALL views
    // on this table instance.
    auto master_table_schema = m_gnode->get_table_sptr()->get_schema();

    // However, we need to keep track of the "real" columns at the time the
    // table was instantiated, which exists on the output schema. This means
    // that we cannot create an expression column that references another
    // expression column - expressions can only reference "real" columns.
    auto gnode_schema = get_schema();

    // Use the gnode's expression vocab to validate expressions so we never
    // have string-typed scalars with nullptr.
    t_expression_vocab& expression_vocab = *(m_gnode->get_expression_vocab());
    t_regex_mapping& regex_mapping = *(m_gnode->get_expression_regex_mapping());

    for (const auto& expr : expressions) {
        const std::string& expression_alias = std::get<0>(expr);
        const std::string& expression_string = std::get<1>(expr);
        const std::string& parsed_expression_string = std::get<2>(expr);

        t_expression_error error;
        error.m_line = -1;
        error.m_column = -1;

        // Cannot overwrite a "real" column with an expression column
        if (gnode_schema.has_column(expression_alias)) {
            error.m_error_message = "Value Error - expression \""
                + expression_alias + "\" cannot overwrite an existing column.";
            error.m_line = 0;
            error.m_column = 0;
            rval.add_error(expression_alias, error);
            continue;
        }

        const auto& column_ids = std::get<3>(expr);

        t_dtype expression_dtype = m_computed_expression_parser.get_dtype(
            expression_alias,
            expression_string,
            parsed_expression_string,
            column_ids,
            m_gnode->get_table_sptr(),
            m_gnode->get_pkey_map(),
            gnode_schema,
            error,
            expression_vocab,
            regex_mapping
        );

        // FIXME: none == bad type? what about clear
        if (expression_dtype == DTYPE_NONE) {
            // extract the error from the stream and set it in the returned map
            rval.add_error(expression_alias, error);
        } else {
            rval.add_expression(
                expression_alias, dtype_to_str(expression_dtype)
            );
        }
    }

    return rval;
}

std::shared_ptr<t_gnode>
Table::make_gnode(const t_schema& in_schema) {
    t_schema out_schema = in_schema.drop({"psp_pkey", "psp_op"});
    auto gnode =
        std::make_shared<t_gnode>(in_schema, out_schema, m_backing_store);
    gnode->init();
    return gnode;
}

void
Table::set_gnode(std::shared_ptr<t_gnode> gnode) {
    m_gnode = std::move(gnode);
    m_gnode_set = true;
}

void
Table::unregister_gnode(t_uindex id) const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_pool->unregister_gnode(id);
}

void
Table::reset_gnode(t_uindex id) const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_pool->reset_gnode(id);
}

t_uindex
Table::make_port() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_VERBOSE_ASSERT(
        m_gnode_set, "Cannot make input port on a gnode that does not exist."
    );
    return m_gnode->make_input_port();
}

void
Table::remove_port(t_uindex port_id) const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_VERBOSE_ASSERT(
        m_gnode_set, "Cannot remove input port on a gnode that does not exist."
    );
    m_gnode->remove_input_port(port_id);
}

void
Table::calculate_offset(std::uint32_t row_count) {
    m_offset = m_offset + row_count;
}

t_uindex
Table::get_id() const {
    return m_id;
}

std::shared_ptr<t_pool>
Table::get_pool() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_pool;
}

std::shared_ptr<t_gnode>
Table::get_gnode() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_gnode;
}

const std::vector<std::string>&
Table::get_column_names() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_column_names;
}

const std::vector<t_dtype>&
Table::get_data_types() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_data_types;
}

const std::string&
Table::get_index() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_index;
}

std::uint32_t
Table::get_offset() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_offset;
}

std::uint32_t
Table::get_limit() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_limit;
}

t_backing_store
Table::get_backing_store() const {
    return m_backing_store;
}

void
Table::set_column_names(const std::vector<std::string>& column_names) {
    validate_columns(column_names);
    m_column_names = column_names;
}

void
Table::set_data_types(const std::vector<t_dtype>& data_types) {
    m_data_types = data_types;
}

std::unordered_map<std::string, std::shared_ptr<arrow::DataType>>
schema_to_arrow_map(const t_schema& gnode_output_schema) {
    auto map =
        std::unordered_map<std::string, std::shared_ptr<arrow::DataType>>();

    auto schema = gnode_output_schema.drop({"psp_okey"});
    auto column_names = schema.columns();
    auto data_types = schema.types();
    for (auto idx = 0; idx < column_names.size(); ++idx) {
        const std::string& name = column_names[idx];
        const t_dtype& type = data_types[idx];
        switch (type) {
            case DTYPE_FLOAT32:
                map[name] = std::make_shared<arrow::FloatType>();
                break;
            case DTYPE_FLOAT64:
                map[name] = std::make_shared<arrow::DoubleType>();
                break;
            case DTYPE_STR:
                map[name] = std::make_shared<arrow::StringType>();
                break;
            case DTYPE_BOOL:
                map[name] = std::make_shared<arrow::BooleanType>();
                break;
            case DTYPE_UINT32:
                map[name] = std::make_shared<arrow::UInt32Type>();
                break;
            case DTYPE_UINT64:
                map[name] = std::make_shared<arrow::UInt64Type>();
                break;
            case DTYPE_INT32:
                map[name] = std::make_shared<arrow::Int32Type>();
                break;
            case DTYPE_INT64:
                map[name] = std::make_shared<arrow::Int64Type>();
                break;
            case DTYPE_TIME:
                map[name] = std::make_shared<arrow::TimestampType>();
                break;
            case DTYPE_DATE:
                map[name] = std::make_shared<arrow::Date64Type>();
                break;
            default:
                std::stringstream ss;
                ss << "Error loading arrow type " << dtype_to_str(type)
                   << " for column " << name << "\n";
                PSP_COMPLAIN_AND_ABORT(ss.str())
                break;
        }
    }
    return map;
}

void
Table::update_csv(const std::string_view& data, std::uint32_t port_id) {
    auto type_map = schema_to_arrow_map(get_gnode()->get_output_schema());
    apachearrow::ArrowLoader arrow_loader;
    arrow_loader.init_csv(data, true, type_map);
    std::uint32_t row_count = 0;
    row_count = arrow_loader.row_count();
    t_data_table data_table(get_schema());
    data_table.init();
    data_table.extend(row_count);
    arrow_loader.fill_table(data_table, get_schema(), m_index, m_offset, true);
    process_op_column(data_table, t_op::OP_INSERT);
    calculate_offset(row_count);
    m_pool->send(get_gnode()->get_id(), port_id, data_table);
}

std::shared_ptr<Table>
Table::from_csv(
    const std::string& index,
    std::string&& data,
    std::uint32_t limit,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    auto map =
        std::unordered_map<std::string, std::shared_ptr<arrow::DataType>>();

    apachearrow::ArrowLoader arrow_loader;
    arrow_loader.init_csv(data, false, map);

    // Arrow has materialized the CSV into its own buffers at this point; drop
    // the raw CSV string so it does not live concurrently with the Arrow table
    // and the `t_data_table`.
    { auto _ = std::move(data); }

    std::vector<std::string> column_names = arrow_loader.names();
    std::vector<t_dtype> data_types = arrow_loader.types();
    t_schema input_schema(column_names, data_types);
    auto implicit_index_it =
        std::find(column_names.begin(), column_names.end(), "__INDEX__");
    const bool has_index_column = implicit_index_it != column_names.end();

    if (has_index_column) {
        auto idx = std::distance(column_names.begin(), implicit_index_it);
        // position of the column is at the same index in both vectors
        column_names.erase(column_names.begin() + idx);
        data_types.erase(data_types.begin() + idx);
    }

    t_schema output_schema(column_names, data_types);
    std::uint32_t row_count = arrow_loader.row_count();

    auto data_table = std::make_shared<t_data_table>(output_schema);
    data_table->init();

    {
        auto loader = std::move(arrow_loader);
        data_table->extend(row_count);
        loader.fill_table(*data_table, input_schema, index, 0, false);
    }

    auto pool = std::make_shared<t_pool>();
    pool->init();
    auto tbl = std::make_shared<Table>(
        pool, column_names, data_types, limit, index, backing_store, list_flatten
    );

    // `psp_pkey` is guaranteed unique only when the index is implicit (a
    // generated row-number). Explicit indexes or `__INDEX__` columns can
    // contain duplicates, which must be deduplicated via the `flatten()`
    // path.
    const bool can_bulk_init = index.empty() && !has_index_column;
    if (can_bulk_init) {
        tbl->init_bulk(data_table, row_count);
    } else {
        tbl->init(*data_table, row_count, t_op::OP_INSERT, 0);
        data_table.reset();
        pool->_process();
    }
    return tbl;
}


void
Table::clear() {
    reset_gnode(m_gnode->get_id());
}


void
Table::remove_rows(const std::string_view& data) {
    // 1.) Infer schema
    rapidjson::Document document;
    document.Parse(data.data());
    if (!document.IsArray()) {
        PSP_COMPLAIN_AND_ABORT("Cannot remove fish!\n")
    }

    if (m_index.empty()) {
        PSP_COMPLAIN_AND_ABORT("Cannot remove from unindexed Table\n")
    }

    const t_schema& output_schema = get_gnode()->get_output_schema();

    std::vector<std::string> column_names{m_index};
    std::vector<t_dtype> data_types{output_schema.get_dtype(m_index)};

    t_schema schema(column_names, data_types);

    // 2.) Create table
    t_data_table data_table(schema);
    data_table.init();
    data_table.extend(document.Size());

    data_table.add_column("psp_pkey", schema.get_dtype(m_index), true);

    const auto& psp_pkey_col = data_table.get_column("psp_pkey");

    // 3.) Fill table
    t_uindex ii = 0;
    auto col = data_table.get_column(m_index);
    for (const auto& cell : document.GetArray()) {
        auto promote = json::fill_column_json(col, ii, cell, true);
        if (promote) {
            std::stringstream ss;
            ss << "Cannot append value of type " << dtype_to_str(*promote)
               << " to column \"" << m_index << "\" of type " << dtype_to_str(col->get_dtype())
               << " at index " << ii
               << std::endl;
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        // if (!is_implicit && m_index == col_name) {
        json::fill_column_json(psp_pkey_col, ii, cell, true);
        // }

        ii++;
    }

    data_table.clone_column("psp_pkey", "psp_okey");
    // calculate_offset(data_table.size());
    process_op_column(data_table, OP_DELETE);
    m_pool->send(get_gnode()->get_id(), 0, data_table);
}

void
Table::remove_cols(const std::string_view& data) {
    // 1.) Infer schema
    rapidjson::Document document;
    document.Parse(data.data());
    if (!document.IsArray()) {
        PSP_COMPLAIN_AND_ABORT("Cannot remove fish!\n")
    }

    if (m_index.empty()) {
        PSP_COMPLAIN_AND_ABORT("Cannot remove from unindexed Table\n")
    }

    const t_schema& output_schema = get_gnode()->get_output_schema();

    std::vector<std::string> column_names{m_index};
    std::vector<t_dtype> data_types{output_schema.get_dtype(m_index)};

    t_schema schema(column_names, data_types);

    // 2.) Create table
    t_data_table data_table(schema);
    data_table.init();
    data_table.extend(document.Size());

    data_table.add_column("psp_pkey", schema.get_dtype(m_index), true);
    data_table.add_column("psp_okey", schema.get_dtype(m_index), true);

    const auto& psp_pkey_col = data_table.get_column("psp_pkey");
    const auto& psp_okey_col = data_table.get_column("psp_okey");

    // 3.) Fill table
    t_uindex ii = 0;
    auto col = data_table.get_column(m_index);
    for (const auto& cell : document.GetArray()) {
        auto promote = json::fill_column_json(col, ii, cell, true);
        if (promote) {
            std::stringstream ss;
            ss << "Cannot append value of type " << dtype_to_str(*promote)
               << " to column \"" << m_index << "\" of type " << dtype_to_str(col->get_dtype())
               << " at index " << ii
               << std::endl;
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        // if (!is_implicit && m_index == col_name) {
        json::fill_column_json(psp_pkey_col, ii, cell, true);
        json::fill_column_json(psp_okey_col, ii, cell, true);
        // }

        ii++;
    }

    // calculate_offset(nrows);
    calculate_offset(data_table.size());
    process_op_column(data_table, OP_DELETE);
    m_pool->send(get_gnode()->get_id(), 0, data_table);
}

void
Table::remove_arrow(const std::string_view& data) {
    if (m_index.empty()) {
        PSP_COMPLAIN_AND_ABORT("Cannot remove from unindexed Table\n")
    }

    apachearrow::ArrowLoader arrow_loader;
    arrow_loader.initialize(
        reinterpret_cast<const std::uint8_t*>(data.data()),
        data.size(),
        m_list_flatten
    );

    const auto names = arrow_loader.names();
    if (std::find(names.begin(), names.end(), m_index) == names.end()) {
        std::stringstream ss;
        ss << "Cannot remove: Arrow is missing index column `" << m_index
           << "`\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    const t_schema& output_schema = get_gnode()->get_output_schema();
    t_schema schema({m_index}, {output_schema.get_dtype(m_index)});
    t_data_table data_table(schema);
    data_table.init();
    data_table.extend(arrow_loader.row_count());
    arrow_loader.fill_table(data_table, schema, m_index, m_offset, true);
    process_op_column(data_table, OP_DELETE);
    m_pool->send(get_gnode()->get_id(), 0, data_table);
}

std::shared_ptr<Table>
Table::from_json_loader(
    json::JsonLoader& loader,
    const std::string& index,
    std::string&& data,
    std::uint32_t limit,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    if (const auto repeated = loader.repeated_index(index)) {
        std::stringstream ss;
        ss << "Cannot create a Table indexed on `" << *repeated
           << "` from an expanded array.\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    t_schema schema(loader.names(), loader.types());
    auto data_table = std::make_unique<t_data_table>(schema);
    data_table->init();
    const auto pkey_dtype =
        loader.is_implicit() ? DTYPE_INT32 : schema.get_dtype(index);

    data_table->add_column("psp_pkey", pkey_dtype, true);
    data_table->add_column("psp_okey", pkey_dtype, true);

    const auto nrows = loader.fill_table(*data_table, index, 0, false);

    // `names`/`types` may have grown during the fill -- an ndjson record can
    // introduce a column -- so the Table's column list is read back from the
    // loader rather than from `schema`. Copy them out before releasing.
    auto column_names = loader.names();
    auto data_types = loader.types();

    // Drop the parsed document and the source text before the gnode allocates
    // its master table, so the two peaks do not overlap.
    loader.release();
    { auto _ = std::move(data); }

    auto pool = std::make_shared<t_pool>();
    pool->init();
    auto tbl = std::make_shared<Table>(
        pool,
        std::move(column_names),
        std::move(data_types),
        limit,
        index,
        backing_store,
        list_flatten
    );

    tbl->init(*data_table, nrows, t_op::OP_INSERT, 0);
    data_table.reset();
    pool->_process();
    return tbl;
}

void
Table::update_json(
    const std::string_view& data,
    json::t_json_format format,
    std::uint32_t port_id
) {
    t_schema table_schema = get_schema();
    json::JsonLoader loader;
    loader.init(data, format, m_index, &table_schema, m_list_flatten);
    if (loader.empty()) {
        return;
    }

    if (const auto repeated = loader.repeated_index(m_index)) {
        std::stringstream ss;
        ss << "Cannot update a Table indexed on `" << *repeated
           << "` from an expanded array.\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    t_data_table data_table(table_schema);
    data_table.init();
    data_table.add_column(
        "psp_pkey",
        m_index.empty() ? DTYPE_INT32 : table_schema.get_dtype(m_index),
        true
    );

    const auto size = loader.fill_table(data_table, m_index, m_offset, true);
    data_table.clone_column("psp_pkey", "psp_okey");
    process_op_column(data_table, t_op::OP_INSERT);
    calculate_offset(size);
    m_pool->send(get_gnode()->get_id(), port_id, data_table);
}


void
Table::update_cols(const std::string_view& data, std::uint32_t port_id) {
    update_json(data, json::JSON_FORMAT_COLUMNS, port_id);
}

std::shared_ptr<Table>
Table::from_cols(
    const std::string& index,
    std::string&& data,
    std::uint32_t limit,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    json::JsonLoader loader;
    loader.init(
        data, json::JSON_FORMAT_COLUMNS, index, nullptr, list_flatten
    );
    return from_json_loader(
        loader, index, std::move(data), limit, backing_store, list_flatten
    );
}

// rapidjson::StringBuffer buffer;
// buffer.Clear();
// rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
// document.Accept(writer);
// std::cout << buffer.GetString() << std::endl;

void
Table::update_rows(const std::string_view& data, std::uint32_t port_id) {
    update_json(data, json::JSON_FORMAT_ROWS, port_id);
}

std::shared_ptr<Table>
Table::from_rows(
    const std::string& index,
    std::string&& data,
    std::uint32_t limit,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    json::JsonLoader loader;
    loader.init(
        data, json::JSON_FORMAT_ROWS, index, nullptr, list_flatten
    );
    return from_json_loader(
        loader, index, std::move(data), limit, backing_store, list_flatten
    );
}

void
Table::update_ndjson(const std::string_view& data, std::uint32_t port_id) {
    update_json(data, json::JSON_FORMAT_NDJSON, port_id);
}

std::shared_ptr<Table>
Table::from_ndjson(
    const std::string& index,
    std::string&& data,
    std::uint32_t limit,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    json::JsonLoader loader;
    loader.init(
        data, json::JSON_FORMAT_NDJSON, index, nullptr, list_flatten
    );
    return from_json_loader(
        loader, index, std::move(data), limit, backing_store, list_flatten
    );
}

std::shared_ptr<Table>
Table::from_schema(
    const std::string& index,
    const t_schema& schema,
    std::uint32_t limit,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    auto pool = std::make_shared<t_pool>();
    pool->init();

    t_data_table data_table(schema);
    data_table.init();

    // TODO check for implicit index;
    if (index.empty()) {
        data_table.add_column("psp_pkey", DTYPE_INT32, true);
        data_table.add_column("psp_okey", DTYPE_INT32, true);
    } else {
        if (!schema.has_column(index)) {
            std::stringstream ss;
            ss << "Specified index `" << index
               << "` does not appear in the Table." << '\n';
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        data_table.clone_column(index, "psp_pkey");
        data_table.clone_column(index, "psp_okey");
    }

    auto tbl = std::make_shared<Table>(
        pool,
        schema.columns(),
        schema.types(),
        limit,
        index,
        backing_store,
        list_flatten
    );

    tbl->init(data_table, 0, t_op::OP_INSERT, 0);
    pool->_process();
    return tbl;
}

void
Table::update_arrow(const std::string_view& data, std::uint32_t port_id) {
    apachearrow::ArrowLoader arrow_loader;
    arrow_loader.initialize(
        reinterpret_cast<const std::uint8_t*>(data.data()),
        data.size(),
        m_list_flatten
    );

    if (const auto repeated = arrow_loader.repeated_index(m_index)) {
        std::stringstream ss;
        ss << "Cannot update a Table indexed on `" << *repeated
           << "` from an expanded list column.\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    t_data_table data_table{this->get_schema()};
    data_table.init();
    auto row_count = arrow_loader.row_count();
    data_table.extend(row_count);
    auto input_schema = this->get_schema();

    auto arrow_names = arrow_loader.names();
    if (std::find(arrow_names.begin(), arrow_names.end(), "__INDEX__")
        != arrow_names.end()) {
        if (m_index.empty()) {
            input_schema.add_column("__INDEX__", DTYPE_INT32);
        } else {
            input_schema.add_column(
                "__INDEX__", input_schema.get_dtype(m_index)
            );
        }
    }

    arrow_loader.fill_table(data_table, input_schema, m_index, m_offset, true);

    process_op_column(data_table, t_op::OP_INSERT);
    calculate_offset(row_count);
    m_pool->send(get_gnode()->get_id(), port_id, data_table);
}

std::shared_ptr<Table>
Table::from_arrow(
    const std::string& index,
    std::string&& data,
    std::uint32_t limit,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    apachearrow::ArrowLoader arrow_loader;

    // Parse the arrow and get its metadata
    arrow_loader.initialize(
        reinterpret_cast<const std::uint8_t*>(data.data()),
        data.size(),
        list_flatten
    );

    if (const auto repeated = arrow_loader.repeated_index(index)) {
        std::stringstream ss;
        ss << "Cannot create a Table indexed on `" << *repeated
           << "` from an expanded list column, as that index repeats across "
              "the rows of an expansion and would silently collide. Index on a "
              "column drawn from the list itself, or use the `stringify` list "
              "flatten mode.\n";
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    // Infer schema
    auto columns = arrow_loader.names();
    auto types = arrow_loader.types();

    t_schema input_schema{columns, types};

    auto implicit_index_it =
        std::find(columns.begin(), columns.end(), "__INDEX__");

    if (implicit_index_it != columns.end()) {
        auto idx = std::distance(columns.begin(), implicit_index_it);
        // position of the column is at the same index in both
        // vectors
        columns.erase(columns.begin() + idx);
        types.erase(types.begin() + idx);
    }

    t_schema output_schema{columns, types};
    auto data_table = std::make_unique<t_data_table>(output_schema);
    data_table->init();

    {
        auto _ = std::move(data);
        auto loader = std::move(arrow_loader);
        auto row_count = loader.row_count();
        data_table->extend(row_count);
        loader.fill_table(*data_table, input_schema, index, 0, false);
    }

    // Make Table
    auto pool = std::make_shared<t_pool>();
    pool->init();
    auto table = std::make_shared<Table>(
        pool, columns, types, limit, index, backing_store, list_flatten
    );

    table->init(*data_table, data_table->num_rows(), t_op::OP_INSERT, 0);
    data_table.reset();
    pool->_process();
    return table;
}

std::shared_ptr<Table>
Table::make_table(
    const std::vector<std::string>& column_names,
    const std::vector<t_dtype>& data_types,
    std::uint32_t limit,
    const std::string& index,
    const std::string_view& data,
    t_backing_store backing_store,
    apachearrow::t_list_flatten list_flatten
) {
    auto pool = std::make_shared<t_pool>();
    pool->init();
    t_schema schema(column_names, data_types);
    t_data_table data_table{schema};
    data_table.init();
    // data_table.extend(10);
    std::shared_ptr<t_column> pkey;
    if (schema.has_column("psp_pkey")) {
        pkey = data_table.get_column("psp_pkey");
    } else {
        pkey = data_table.add_column_sptr(
            "psp_pkey", perspective::DTYPE_UINT64, true
        );
    }
    for (std::uint64_t i = 0; i < data_table.size(); ++i) {
        pkey->set_nth<std::uint64_t>(i, i);
    }
    if (!schema.has_column("psp_okey")) {
        data_table.clone_column("psp_pkey", "psp_okey");
    }
    auto columns = data_table.get_schema().columns();
    auto dtypes = data_table.get_schema().types();
    auto table = std::make_shared<Table>(
        pool, columns, dtypes, limit, index, backing_store, list_flatten
    );
    table->init(data_table, data_table.num_rows(), t_op::OP_INSERT, 0);
    pool->_process();
    return table;
}

void
Table::validate_columns(const std::vector<std::string>& column_names) {
    if (!m_index.empty()) {
        // Check if index is valid after getting column names
        bool explicit_index =
            std::find(column_names.begin(), column_names.end(), m_index)
            != column_names.end();
        if (!explicit_index) {
            PSP_COMPLAIN_AND_ABORT(
                "Specified index `" + m_index + "` does not exist in dataset."
            );
        }
    }
}

void
Table::process_op_column(t_data_table& data_table, const t_op op) {
    auto* op_col = data_table.add_column("psp_op", DTYPE_UINT8, false);
    switch (op) {
        case OP_DELETE: {
            op_col->raw_fill<std::uint8_t>(OP_DELETE);
        } break;
        default: {
            op_col->raw_fill<std::uint8_t>(OP_INSERT);
            const auto size = data_table.size();
            if (m_offset + size >= m_limit) {
                const auto& psp_pkey_col = data_table.get_column("psp_pkey");
                const auto d_rows =
                    size - std::max<t_index>(0, m_limit - m_offset);
                data_table.extend(size + d_rows);
                auto* op_col =
                    data_table.add_column("psp_op", DTYPE_UINT8, false);
                auto old_key = std::max<t_index>(0, m_offset - m_limit);
                for (auto i = 0; i < d_rows; i++) {
                    psp_pkey_col->set_nth<std::uint32_t>(size + i, old_key);
                    op_col->set_nth<std::uint8_t>(size + i, OP_DELETE);
                    old_key += 1;
                }
            }
        }
    }
}

} // namespace perspective
