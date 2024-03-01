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
#include "perspective/data_table.h"
#include "perspective/raw_types.h"
#include "perspective/schema.h"
#include "rapidjson/document.h"
#include <memory>
#include <optional>
#include <perspective/table.h>
#include <rapidjson/writer.h>
#include <sstream>
#include <string>
#include <string_view>
#include <utility>

// Give each Table a unique ID so that operations on it map back correctly
static perspective::t_uindex GLOBAL_TABLE_ID = 0;

namespace perspective {
Table::Table(
    std::shared_ptr<t_pool> pool,
    std::vector<std::string> column_names,
    std::vector<t_dtype> data_types,
    std::uint32_t limit,
    std::string index
) :
    m_init(false),
    m_id(GLOBAL_TABLE_ID++),
    m_pool(std::move(pool)),
    m_column_names(std::move(column_names)),
    m_data_types(std::move(data_types)),
    m_offset(0),
    m_limit(limit),
    m_index(std::move(index)),
    m_gnode_set(false) {
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

        t_dtype expression_dtype = t_computed_expression_parser::get_dtype(
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
    auto gnode = std::make_shared<t_gnode>(in_schema, out_schema);
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
    t_gnode* gnode = m_pool->get_gnode(id);
    gnode->reset();
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
    m_offset = (m_offset + row_count) % m_limit;
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
    arrow_loader.fill_table(
        data_table, get_schema(), m_index, m_offset, m_limit, true
    );
    calculate_offset(row_count);
    m_pool->send(get_gnode()->get_id(), port_id, data_table);
}

std::shared_ptr<Table>
Table::from_csv(
    const std::string& index, const std::string_view& data, std::uint32_t limit
) {
    auto pool = std::make_shared<t_pool>();
    pool->init();
    auto map =
        std::unordered_map<std::string, std::shared_ptr<arrow::DataType>>();

    apachearrow::ArrowLoader arrow_loader;
    arrow_loader.init_csv(data.data(), false, map);

    std::vector<std::string> column_names;
    std::vector<t_dtype> data_types;

    column_names = arrow_loader.names();
    data_types = arrow_loader.types();
    t_schema input_schema(column_names, data_types);
    auto implicit_index_it =
        std::find(column_names.begin(), column_names.end(), "__INDEX__");

    if (implicit_index_it != column_names.end()) {
        auto idx = std::distance(column_names.begin(), implicit_index_it);
        // position of the column is at the same index in both vectors
        column_names.erase(column_names.begin() + idx);
        data_types.erase(data_types.begin() + idx);
    }

    t_schema output_schema(column_names, data_types);
    std::uint32_t row_count = 0;
    row_count = arrow_loader.row_count();

    t_data_table data_table(output_schema);
    data_table.init();
    data_table.extend(row_count);
    arrow_loader.fill_table(data_table, input_schema, index, 0, limit, false);
    auto tbl =
        std::make_shared<Table>(pool, column_names, data_types, limit, index);

    tbl->init(data_table, row_count, t_op::OP_INSERT, 0);
    pool->_process();
    return tbl;
}

t_dtype
rapidjson_type_to_dtype(const rapidjson::Value& value) {
    switch (value.GetType()) {
        case rapidjson::Type::kStringType: {
            const auto& str = value.GetString();
            if (str[0] == '\0') {
                return t_dtype::DTYPE_STR;
            }

            auto datetime = apachearrow::parseAsArrowTimestamp(str);
            if (datetime != std::nullopt) {
                return t_dtype::DTYPE_TIME;
            }

            char* endptr;
            strtol(str, &endptr, 10);
            if (*endptr == '\0') {
                return t_dtype::DTYPE_INT32;
            }

            strtof(str, &endptr);
            if (*endptr == '\0') {
                return t_dtype::DTYPE_FLOAT64;
            }

            return t_dtype::DTYPE_STR;
        }
        case rapidjson::Type::kNumberType: {
            if (value.IsInt64()) {
                if (value.GetInt64()
                    > std::numeric_limits<std::int32_t>::max()) {
                    return t_dtype::DTYPE_FLOAT64;
                }
                return t_dtype::DTYPE_INT32;
            }
            if (value.IsInt()) {
                return t_dtype::DTYPE_INT32;
            }

            return t_dtype::DTYPE_FLOAT64;
        }
        case rapidjson::Type::kTrueType:
        case rapidjson::Type::kFalseType:
            return t_dtype::DTYPE_BOOL;
        case rapidjson::kNullType:
        case rapidjson::kObjectType:
        case rapidjson::kArrayType:
            PSP_COMPLAIN_AND_ABORT("Unknown JSON type");
            return t_dtype::DTYPE_NONE;
    }
}

void
Table::clear() {
    reset_gnode(m_gnode->get_id());
}

template <t_dtype A, t_dtype B>
struct promote {
    constexpr static t_dtype dtype = DTYPE_NONE;
};

#define PROMOTE_IMPL(A, B, C)                                                  \
    template <>                                                                \
    struct promote<A, B> {                                                     \
        constexpr static t_dtype dtype = C;                                    \
    };

PROMOTE_IMPL(DTYPE_INT32, DTYPE_INT64, DTYPE_INT64)
// PROMOTE_IMPL(std::int32_t, std::float_t, DTYPE_FLOAT32)
// PROMOTE_IMPL(std::int32_t, std::double_t, DTYPE_FLOAT64)

std::optional<t_dtype>
fill_column_json(
    const std::shared_ptr<t_column>& col,
    const t_uindex i,
    const rapidjson::Value& value
) {
    // LOG_DEBUG("Filling column"
    //     << " at index " << i << " with dtype "
    //     << dtype_to_str(col->get_dtype()));
    if (value.IsNull()) {
        col->unset(i);
        return std::nullopt;
    }

    switch (col->get_dtype()) {
        case t_dtype::DTYPE_STR: {
            if (!value.IsString()) {
                std::stringstream ss;
                ss << "Expected string, found " << value.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
            // auto str = std::string_view(value.GetString());
            // if (str.find_first_not_of("0123456789.") == std::string::npos) {
            //     if (str.find('.') != std::string::npos) {
            //         return {DTYPE_FLOAT64};
            //     }
            //     return {DTYPE_INT32};
            // }
            col->set_nth(i, value.GetString());
            return std::nullopt;
        }
        case t_dtype::DTYPE_INT32: {
            if (value.IsInt()) {
                // std::cout << "WIP " << value.GetInt() << std::endl;
                col->set_nth<std::int32_t>(i, value.GetInt());
                // if (value.IsInt()) [[likely]] {
                //     col->set_nth<std::int32_t>(i, value.GetInt());
                // } else if (value.IsInt64()) {
                //     if (value.GetInt64() >
                //     std::numeric_limits<std::int32_t>::max())
                //         [[unlikely]] {
                //         LOG_DEBUG("Promoting column "
                //             << " from " << dtype_to_str(col->get_dtype()) <<
                //             " to "
                //             << dtype_to_str(DTYPE_FLOAT64));
                //         return {DTYPE_FLOAT64};
                //     }
                // return {DTYPE_INT32};
                return std::nullopt;
            }

            if (value.IsInt64()) {
                // std::cout << "WIP " << value.GetInt() << std::endl;
                if (value.GetInt64() > std::numeric_limits<std::int32_t>::max())
                    [[likely]] {
                    LOG_DEBUG("Promoting due to int32 overflow");
                    return {DTYPE_FLOAT64};
                }
                return {DTYPE_INT64};
            }

            if (value.IsDouble()) {
                return {DTYPE_FLOAT64};
            }

            if (value.IsString()) {
                const auto& str = value.GetString();
                if (str[0] == '\0') {
                    return {t_dtype::DTYPE_STR};
                }

                char* endptr;
                std::int32_t result = strtol(str, &endptr, 10);
                if (*endptr == '\0') {
                    col->set_nth(i, result);
                    return std::nullopt;
                }

                strtof(str, &endptr);
                if (*endptr == '\0') {
                    return {t_dtype::DTYPE_FLOAT64};
                }

                return {t_dtype::DTYPE_STR};
            }

            std::stringstream ss;
            ss << "Expected int, found " << value.GetType();
            PSP_COMPLAIN_AND_ABORT(ss.str());
            return std::nullopt;
        }
        case t_dtype::DTYPE_INT64: {
            if (value.IsInt64()) [[likely]] {
                col->set_nth<std::int64_t>(i, value.GetInt());
            } else if (value.IsDouble()) {
                return {DTYPE_FLOAT64};
            } else if (value.IsString()) {
                col->set_nth(i, std::atoll(value.GetString()));
            } else {
                std::stringstream ss;
                ss << "Expected int64, found " << value.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
            return std::nullopt;
        }
        case t_dtype::DTYPE_FLOAT64: {
            if (value.IsDouble()) [[likely]] {
                col->set_nth<double>(i, value.GetDouble());
            } else if (value.IsInt64()) {
                col->set_nth<double>(i, static_cast<double>(value.GetInt64()));
            } else if (value.IsInt()) {
                col->set_nth<double>(i, value.GetInt());
            } else if (value.IsString()) {
                col->set_nth(i, std::atof(value.GetString()));
            } else {
                std::stringstream ss;
                ss << "Expected double, found " << value.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
            return std::nullopt;
        }
        case t_dtype::DTYPE_BOOL: {
            if (value.IsBool()) [[likely]] {
                col->set_nth<bool>(i, value.GetBool());
            } else {
                std::stringstream ss;
                ss << "Expected bool, found " << value.GetType();
                PSP_COMPLAIN_AND_ABORT(ss.str());
            }
            return std::nullopt;
        }
        case t_dtype::DTYPE_TIME: {
            std::uint64_t tt = 0;

            // rapidjson::StringBuffer buffer;

            // buffer.Clear();

            // rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
            // value.Accept(writer);

            // std::cout << buffer.GetString() << std::endl;

            if (value.IsString()) {
                tt = *apachearrow::parseAsArrowTimestamp(value.GetString());
            } else if (value.IsDouble()) {
                tt = static_cast<int64_t>(value.GetDouble());
            } else if (value.IsInt()) {
                tt = static_cast<int64_t>(value.GetInt());
            }
            // // } else if (value.Is == 0) {
            // //     tt = time_t(static_cast<int64_t>(item.as<double>()) /
            // 1000);
            // // } else if
            // (item.typeOf().as<std::string>().compare("object") == 0) {
            // //     tt = time_t(
            // //
            // static_cast<int64_t>(item.call<t_val>("getTime").as<double>())
            // //         / 1000);
            // } else {
            //     return false;

            else {
                PSP_COMPLAIN_AND_ABORT("Can't parse date");
            }

            col->set_nth(i, tt);
            return std::nullopt;
        }
        case t_dtype::DTYPE_DATE: {
            time_t tt;

            // rapidjson::StringBuffer buffer;

            // buffer.Clear();

            // rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
            // value.Accept(writer);

            // std::cout << buffer.GetString() << std::endl;

            if (value.IsString()) {
                tt = time_t(
                    *apachearrow::parseAsArrowTimestamp(value.GetString())
                    / 1000
                );
                // // } else if (value.Is == 0) {
                // //     tt = time_t(static_cast<int64_t>(item.as<double>()) /
                // 1000);
                // // } else if
                // (item.typeOf().as<std::string>().compare("object") == 0) {
                // //     tt = time_t(
                // //
                // static_cast<int64_t>(item.call<t_val>("getTime").as<double>())
                // //         / 1000);
                // } else {
                //     return false;
            } else {
                PSP_COMPLAIN_AND_ABORT("Can't parse date");
            }

            tm local_tm = *localtime(&tt);
            auto date = t_date(
                local_tm.tm_year + 1900, local_tm.tm_mon, local_tm.tm_mday
            );
            col->set_nth(i, date);
            return std::nullopt;
        }
        default:
            PSP_COMPLAIN_AND_ABORT("JSON field not yet implemented");
            return std::nullopt;
    }
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
    data_table.add_column("psp_okey", schema.get_dtype(m_index), true);

    const auto& psp_pkey_col = data_table.get_column("psp_pkey");
    const auto& psp_okey_col = data_table.get_column("psp_okey");

    // 3.) Fill table
    t_uindex ii = 0;
    auto col = data_table.get_column(m_index);
    for (const auto& cell : document.GetArray()) {
        auto promote = fill_column_json(col, ii, cell);
        if (promote) {
            std::cout << dtype_to_str(*promote) << " : "
                      << dtype_to_str(schema.get_dtype(m_index)) << std::endl;
            PSP_COMPLAIN_AND_ABORT("Can't promote remove");
        }

        // if (!is_implicit && m_index == col_name) {
        fill_column_json(psp_pkey_col, ii, cell);
        fill_column_json(psp_okey_col, ii, cell);
        // }

        ii++;
    }

    // calculate_offset(nrows);
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
        auto promote = fill_column_json(col, ii, cell);
        if (promote) {
            PSP_COMPLAIN_AND_ABORT("Can't promote remove");
        }

        // if (!is_implicit && m_index == col_name) {
        fill_column_json(psp_pkey_col, ii, cell);
        fill_column_json(psp_okey_col, ii, cell);
        // }

        ii++;
    }

    // calculate_offset(nrows);
    process_op_column(data_table, OP_DELETE);
    m_pool->send(get_gnode()->get_id(), 0, data_table);
}

void
Table::update_cols(const std::string_view& data, std::uint32_t port_id) {
    // 1.) Infer schema
    rapidjson::Document document;
    document.Parse(data.data());
    if (!document.IsObject()) {
        // TODO Legacy error message
        PSP_COMPLAIN_AND_ABORT(
            "Cannot determine data types without column names!\n"
        )
    }

    t_uindex nrows = 0;
    for (const auto& it : document.GetObject()) {
        if (!it.value.IsArray()) {
            PSP_COMPLAIN_AND_ABORT("Malformed column")
        }

        if (it.value.Empty()) {
            PSP_COMPLAIN_AND_ABORT("Can't create table from empty columns")
        }

        nrows = it.value.Size();
        break;
    }

    bool is_implicit = m_index.empty();
    t_schema schema = get_schema();

    // 2.) Create table
    t_data_table data_table(schema);
    data_table.init();
    data_table.extend(nrows);

    LOG_DEBUG("Updating table with schema " << schema);
    LOG_DEBUG("Implicit index? " << is_implicit);
    if (is_implicit) {
        data_table.add_column("psp_pkey", DTYPE_INT32, true);
        data_table.add_column("psp_okey", DTYPE_INT32, true);
    } else {
        data_table.add_column("psp_pkey", schema.get_dtype(m_index), true);
        data_table.add_column("psp_okey", schema.get_dtype(m_index), true);
    }

    const auto& psp_pkey_col = data_table.get_column("psp_pkey");
    const auto& psp_okey_col = data_table.get_column("psp_okey");

    // 3.) Fill table
    for (const auto& col : document.GetObject()) {
        t_uindex ii = 0;
        const auto& col_name = col.name.GetString();
        for (const auto& cell : col.value.GetArray()) {
            auto col = data_table.get_column(col_name);
            auto promote = fill_column_json(col, ii, cell);
            if (promote) {
                PSP_COMPLAIN_AND_ABORT("Can't promote column on update");
            }

            if (!is_implicit && m_index == col_name) {
                fill_column_json(psp_pkey_col, ii, cell);
                fill_column_json(psp_okey_col, ii, cell);
            }

            ii++;
        }
    }

    if (is_implicit) {
        for (std::uint32_t ii = 0; ii < nrows; ii++) {
            psp_pkey_col->set_nth<std::uint32_t>(ii, (m_offset + ii) % m_limit);
            psp_okey_col->set_nth<std::uint32_t>(ii, (m_offset + ii) % m_limit);
        }
    }

    calculate_offset(nrows);
    m_pool->send(get_gnode()->get_id(), port_id, data_table);
}

std::shared_ptr<Table>
Table::from_cols(
    const std::string& index, const std::string_view& data, std::uint32_t limit
) {
    auto pool = std::make_shared<t_pool>();
    pool->init();

    // 1.) Infer schema
    rapidjson::Document document;
    document.Parse(data.data());

    std::vector<std::string> column_names;
    std::vector<t_dtype> data_types;
    bool is_implicit = true;
    t_uindex nrows = 0;

    // https://github.com/Tencent/rapidjson/issues/1994
    for (const auto& it : document.GetObject()) {
        if (!it.value.IsArray()) {
            PSP_COMPLAIN_AND_ABORT("Malformed column")
        }

        if (it.value.Empty()) {
            PSP_COMPLAIN_AND_ABORT("Can't create table from empty columns")
        }

        if (it.name.GetString() == index) {
            is_implicit = false;
        }

        nrows = it.value.Size();

        data_types.push_back(rapidjson_type_to_dtype(it.value[0]));
        column_names.emplace_back(it.name.GetString());
    }

    t_schema schema(column_names, data_types);

    // 2.) Create table
    t_data_table data_table(schema);
    data_table.init();
    data_table.extend(nrows);

    if (is_implicit) {
        // TODO should this be t_uindex?
        data_table.add_column("psp_pkey", DTYPE_INT32, true);
        data_table.add_column("psp_okey", DTYPE_INT32, true);
    } else {
        data_table.add_column("psp_pkey", schema.get_dtype(index), true);
        data_table.add_column("psp_okey", schema.get_dtype(index), true);
    }

    const auto& psp_pkey_col = data_table.get_column("psp_pkey");
    const auto& psp_okey_col = data_table.get_column("psp_okey");

    // 3.) Fill table
    for (const auto& col : document.GetObject()) {
        t_uindex ii = 0;
        const auto& col_name = col.name.GetString();
        LOG_DEBUG(
            "Filling column "
            << col_name << " dtype "
            << dtype_to_str(data_table.get_column(col_name)->get_dtype())
        );
        for (const auto& cell : col.value.GetArray()) {
            auto col = data_table.get_column(col_name);
            auto promote = fill_column_json(col, ii, cell);
            LOG_DEBUG("PROMOTE_RESPONSE: " << promote.value_or(DTYPE_NONE));
            if (promote) {
                LOG_DEBUG(
                    "Promoting column " << col_name << " from "
                                        << dtype_to_str(col->get_dtype())
                                        << " to " << dtype_to_str(*promote)
                );
                data_table.promote_column(col_name, *promote, ii, true);
                col = data_table.get_column(col_name);
                fill_column_json(col, ii, cell);
            }

            if (!is_implicit && index == col_name) {
                fill_column_json(psp_pkey_col, ii, cell);
                fill_column_json(psp_okey_col, ii, cell);
            }

            ii++;
        }
    }

    if (is_implicit) {
        for (t_uindex ii = 0; ii < nrows; ii++) {
            psp_pkey_col->set_nth<std::int32_t>(ii, ii);
            psp_okey_col->set_nth<std::int32_t>(ii, ii);
        }
    }

    auto tbl = std::make_shared<Table>(
        pool, schema.columns(), schema.types(), limit, index
    );

    tbl->init(data_table, nrows, t_op::OP_INSERT, 0);
    pool->_process();
    return tbl;
}

// rapidjson::StringBuffer buffer;
// buffer.Clear();
// rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
// document.Accept(writer);
// std::cout << buffer.GetString() << std::endl;

void
Table::update_rows(const std::string_view& data, std::uint32_t port_id) {
    // 1.) Infer schema
    rapidjson::Document document;
    document.Parse(data.data());
    if (document.Size() == 0) {
        PSP_COMPLAIN_AND_ABORT("Can't create table from empty rows")
    }

    if (!document[0].IsObject()) {
        // TODO Legacy error message
        PSP_COMPLAIN_AND_ABORT(
            "Cannot determine data types without column names!\n"
        )
    }

    bool is_implicit = m_index.empty();
    t_schema schema = get_schema();

    // 2.) Create table
    t_uindex size = document.Size();
    t_data_table data_table(schema);
    data_table.init();
    data_table.extend(size);

    if (is_implicit) {
        data_table.add_column("psp_pkey", DTYPE_INT32, true);
        data_table.add_column("psp_okey", DTYPE_INT32, true);
    } else {
        data_table.add_column("psp_pkey", schema.get_dtype(m_index), true);
        data_table.add_column("psp_okey", schema.get_dtype(m_index), true);
    }

    t_uindex ii = 0;

    const auto& psp_pkey_col = data_table.get_column("psp_pkey");
    const auto& psp_okey_col = data_table.get_column("psp_okey");

    // 3.) Fill table
    for (const auto& row : document.GetArray()) {
        for (const auto& it : row.GetObject()) {
            auto col = data_table.get_column(it.name.GetString());
            auto out = fill_column_json(col, ii, it.value);
            if (out) {
                PSP_COMPLAIN_AND_ABORT("Can't promote column on update");
            }
            if (!is_implicit && m_index == it.name.GetString()) {
                fill_column_json(psp_pkey_col, ii, it.value);
                fill_column_json(psp_okey_col, ii, it.value);
            }
        }

        if (is_implicit) {
            psp_pkey_col->set_nth<std::uint32_t>(ii, (ii + m_offset) % m_limit);
            psp_okey_col->set_nth<std::uint32_t>(ii, (ii + m_offset) % m_limit);
        }

        ii++;
    }

    calculate_offset(size);
    data_table.pprint();
    m_pool->send(get_gnode()->get_id(), port_id, data_table);
}

std::shared_ptr<Table>
Table::from_rows(
    const std::string& index, const std::string_view& data, std::uint32_t limit
) {
    auto pool = std::make_shared<t_pool>();
    pool->init();

    // 1.) Infer schema
    rapidjson::Document document;
    document.Parse(data.data());
    if (document.Size() == 0) {
        PSP_COMPLAIN_AND_ABORT("Can't create table from empty rows")
    }

    if (!document[0].IsObject()) {
        LOG_DEBUG("Received non-object " << document[0].GetType());
        // TODO Legacy error message
        PSP_COMPLAIN_AND_ABORT(
            "Cannot determine data types without column names!\n"
        )
    }
    const rapidjson::Value& first_row = document[0];
    std::vector<std::string> column_names;
    std::vector<t_dtype> data_types;
    bool is_implicit = true;

    // https://github.com/Tencent/rapidjson/issues/1994
    for (const auto& it : first_row.GetObject()) {
        if (it.name.GetString() == index) {
            is_implicit = false;
        }

        data_types.push_back(rapidjson_type_to_dtype(it.value));
        column_names.emplace_back(it.name.GetString());
    }

    t_schema schema(column_names, data_types);

    // 2.) Create table
    t_data_table data_table(schema);
    data_table.init();
    data_table.extend(document.Size());

    if (is_implicit) {
        data_table.add_column("psp_pkey", DTYPE_INT32, true);
        data_table.add_column("psp_okey", DTYPE_INT32, true);
    } else {
        data_table.add_column("psp_pkey", schema.get_dtype(index), true);
        data_table.add_column("psp_okey", schema.get_dtype(index), true);
    }

    std::int32_t ii = 0;

    const auto& psp_pkey_col = data_table.get_column("psp_pkey");
    const auto& psp_okey_col = data_table.get_column("psp_okey");

    // rapidjson::StringBuffer buffer;
    // buffer.Clear();
    // rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    // document.Accept(writer);
    // std::cout << buffer.GetString() << std::endl;

    // 3.) Fill table
    for (const auto& row : document.GetArray()) {
        for (const auto& it : row.GetObject()) {
            auto col = data_table.get_column(it.name.GetString());
            const auto* col_name = it.name.GetString();
            const auto& cell = it.value;
            auto promote = fill_column_json(col, ii, cell);
            LOG_DEBUG("PROMOTE_RESPONSE: " << promote.value_or(DTYPE_NONE));
            if (promote) {
                LOG_DEBUG(
                    "Promoting column " << col_name << " from "
                                        << dtype_to_str(col->get_dtype())
                                        << " to " << dtype_to_str(*promote)
                );
                data_table.promote_column(col_name, *promote, ii, true);
                col = data_table.get_column(col_name);
                fill_column_json(col, ii, cell);
            }

            if (!is_implicit && index == it.name.GetString()) {
                fill_column_json(psp_pkey_col, ii, it.value);
                fill_column_json(psp_okey_col, ii, it.value);
            }
        }
        if (is_implicit) {
            psp_pkey_col->set_nth<std::int32_t>(ii, ii);
            psp_okey_col->set_nth<std::int32_t>(ii, ii);
        }

        ii++;
    }

    auto tbl = std::make_shared<Table>(
        pool, schema.columns(), schema.types(), limit, index
    );

    tbl->init(data_table, document.Size(), t_op::OP_INSERT, 0);
    pool->_process();
    return tbl;
}

std::shared_ptr<Table>
Table::from_schema(
    const std::string& index, const t_schema& schema, std::uint32_t limit
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
               << "` does not appear in the Table." << std::endl;
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }

        data_table.clone_column(index, "psp_pkey");
        data_table.clone_column(index, "psp_okey");
    }

    auto tbl = std::make_shared<Table>(
        pool, schema.columns(), schema.types(), limit, index
    );

    tbl->init(data_table, 0, t_op::OP_INSERT, 0);
    pool->_process();
    return tbl;
}

void
Table::update_arrow(const std::string_view& data, std::uint32_t port_id) {
    apachearrow::ArrowLoader arrow_loader;
    arrow_loader.initialize(
        reinterpret_cast<const std::uint8_t*>(data.data()), data.size()
    );

    t_data_table data_table{this->get_schema()};
    data_table.init();
    auto row_count = arrow_loader.row_count();
    data_table.extend(row_count);
    // TODO: Was this limit on purpose? Why not use table->get_limit()?
    arrow_loader.fill_table(
        data_table, this->get_schema(), m_index, m_offset, m_limit, true
    );

    calculate_offset(row_count);
    m_pool->send(get_gnode()->get_id(), port_id, data_table);
}

std::shared_ptr<Table>
Table::from_arrow(
    const std::string& index, const std::string_view& data, std::uint32_t limit
) {
    apachearrow::ArrowLoader arrow_loader;

    // Parse the arrow and get its metadata
    arrow_loader.initialize(
        reinterpret_cast<const std::uint8_t*>(data.data()), data.size()
    );

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
        columns.erase(columns.begin() + idx);
    }

    t_schema output_schema{columns, types};
    t_data_table data_table{output_schema};
    data_table.init();

    auto row_count = arrow_loader.row_count();
    data_table.extend(row_count);
    arrow_loader.fill_table(data_table, input_schema, index, 0, limit, false);

    // Make Table
    auto pool = std::make_shared<t_pool>();
    pool->init();
    auto table = std::make_shared<Table>(pool, columns, types, limit, index);
    table->init(data_table, data_table.num_rows(), t_op::OP_INSERT, 0);
    pool->_process();
    return table;
}

std::shared_ptr<Table>
Table::make_table(
    const std::vector<std::string>& column_names,
    const std::vector<t_dtype>& data_types,
    std::uint32_t limit,
    const std::string& index,
    const std::string_view& data
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
    auto table = std::make_shared<Table>(pool, columns, dtypes, limit, index);
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
        }
    }
}

} // namespace perspective
