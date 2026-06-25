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

#include <perspective/computed_expression.h>

#include <utility>

namespace perspective {

computed_function::bucket t_computed_expression_parser::BUCKET_FN =
    computed_function::bucket();

computed_function::hour_of_day t_computed_expression_parser::HOUR_OF_DAY_FN =
    computed_function::hour_of_day();

computed_function::percent_of t_computed_expression_parser::PERCENT_OF_FN =
    computed_function::percent_of();

computed_function::inrange_fn t_computed_expression_parser::INRANGE_FN =
    computed_function::inrange_fn();

computed_function::min_fn t_computed_expression_parser::MIN_FN =
    computed_function::min_fn();

computed_function::max_fn t_computed_expression_parser::MAX_FN =
    computed_function::max_fn();

computed_function::coalesce t_computed_expression_parser::COALESCE_FN =
    computed_function::coalesce();

computed_function::contains t_computed_expression_parser::CONTAINS_FN =
    computed_function::contains();

computed_function::diff3 t_computed_expression_parser::diff3 =
    computed_function::diff3();

computed_function::norm3 t_computed_expression_parser::norm3 =
    computed_function::norm3();

computed_function::cross_product3 t_computed_expression_parser::cross_product3 =
    computed_function::cross_product3();

computed_function::dot_product3 t_computed_expression_parser::dot_product3 =
    computed_function::dot_product3();

computed_function::length t_computed_expression_parser::LENGTH_FN =
    computed_function::length();

computed_function::is_null t_computed_expression_parser::IS_NULL_FN =
    computed_function::is_null();

computed_function::is_not_null t_computed_expression_parser::IS_NOT_NULL_FN =
    computed_function::is_not_null();

computed_function::to_integer t_computed_expression_parser::TO_INTEGER_FN =
    computed_function::to_integer();

computed_function::to_float t_computed_expression_parser::TO_FLOAT_FN =
    computed_function::to_float();

computed_function::to_boolean t_computed_expression_parser::TO_BOOLEAN_FN =
    computed_function::to_boolean();

computed_function::make_date t_computed_expression_parser::MAKE_DATE_FN =
    computed_function::make_date();

computed_function::make_datetime
    t_computed_expression_parser::MAKE_DATETIME_FN =
        computed_function::make_datetime();

computed_function::random t_computed_expression_parser::RANDOM_FN =
    computed_function::random();

t_tscalar t_computed_expression_parser::TRUE_SCALAR = mktscalar(true);

t_tscalar t_computed_expression_parser::FALSE_SCALAR = mktscalar(false);

/******************************************************************************
 *
 * t_computed_expression
 */

t_computed_expression::t_computed_expression(
    std::string expression_alias,
    std::string expression_string,
    std::string parsed_expression_string,
    const std::vector<std::pair<std::string, std::string>>& column_ids,
    t_dtype dtype
) :
    m_expression_alias(std::move(expression_alias)),
    m_expression_string(std::move(expression_string)),
    m_parsed_expression_string(std::move(parsed_expression_string)),
    m_column_ids(column_ids),
    m_dtype(dtype) {}

struct t_computed_expression_cache {
    t_computed_expression_cache() = default;
    t_computed_expression_cache(const t_computed_expression_cache&) = delete;
    t_computed_expression_cache& operator=(const t_computed_expression_cache&) =
        delete;
    t_computed_expression_cache(t_computed_expression_cache&&) = delete;
    t_computed_expression_cache& operator=(t_computed_expression_cache&&) =
        delete;

    std::shared_ptr<t_data_table> m_current_source_table;
    t_uindex m_row_idx{0};
    std::vector<std::pair<std::string, t_tscalar>> m_values;
    std::vector<std::shared_ptr<t_column>> m_columns;
    std::vector<t_dtype> m_input_dtypes;
    exprtk::symbol_table<t_tscalar> m_sym_table;
    exprtk::expression<t_tscalar> m_expr;
    std::unique_ptr<t_computed_function_store> m_function_store;
};

t_computed_expression::~t_computed_expression() = default;

void
t_computed_expression::compute(
    const std::shared_ptr<t_data_table>& source_table,
    const t_gstate::t_mapping& pkey_map,
    const std::shared_ptr<t_data_table>& destination_table,
    t_expression_vocab& vocab,
    t_regex_mapping& regex_mapping
) const {
    auto num_input_columns = m_column_ids.size();

    bool needs_build = !m_cache;
    if (!needs_build) {
        for (t_uindex cidx = 0; cidx < num_input_columns; ++cidx) {
            const std::string& column_name = m_column_ids[cidx].second;
            if (source_table->get_column(column_name)->get_dtype()
                != m_cache->m_input_dtypes[cidx]) {
                needs_build = true;
                break;
            }
        }
    }

    if (needs_build) {
        m_cache = std::make_unique<t_computed_expression_cache>();
        auto& cache = *m_cache;

        cache.m_current_source_table = source_table;
        cache.m_sym_table.add_constants(); // pi, infinity, etc.

        // is_type_validator = false: we are computing values, not type-checking.
        cache.m_function_store = std::make_unique<t_computed_function_store>(
            vocab,
            regex_mapping,
            false,
            cache.m_current_source_table,
            pkey_map,
            cache.m_row_idx
        );
        cache.m_function_store->register_computed_functions(cache.m_sym_table);

        // Size exactly once; the symbol table binds a T* into each
        // m_values[cidx].second, so this storage must never be reallocated.
        cache.m_values.resize(num_input_columns);
        cache.m_columns.resize(num_input_columns);
        cache.m_input_dtypes.resize(num_input_columns);

        for (t_uindex cidx = 0; cidx < num_input_columns; ++cidx) {
            const std::string& column_id = m_column_ids[cidx].first;
            const std::string& column_name = m_column_ids[cidx].second;
            t_dtype dtype = source_table->get_column(column_name)->get_dtype();

            cache.m_input_dtypes[cidx] = dtype;

            t_tscalar rval;
            rval.clear();
            rval.m_type = dtype;

            cache.m_values[cidx] =
                std::pair<std::string, t_tscalar>(column_id, rval);
            cache.m_sym_table.add_variable(
                column_id, cache.m_values[cidx].second
            );
        }

        cache.m_expr.register_symbol_table(cache.m_sym_table);

        // Load-bearing for compile-once: exprtk constant-folds an all-literal
        // function call (e.g. intern('x'), concat('a','b')) to a literal node at
        // compile time ONLY when the function reports no side effects. Our
        // functions inherit the igeneric_function/ifunction default
        // has_side_effects() == true and never call disable_has_side_effects(),
        // so such calls are not folded and re-evaluate on every value(). If a
        // future exprtk bump flips that default, the first call's result would
        // be frozen into the cached AST -- revisit this cache if so.
        if (!m_computed_expression_parser.m_parser->compile(
                m_parsed_expression_string, cache.m_expr
            )) {
            std::stringstream ss;
            ss << "[t_computed_expression::compute] Failed to parse "
                  "expression: `"
               << m_parsed_expression_string << "`, failed with error: "
               << m_computed_expression_parser.m_parser->error() << '\n';

            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    auto& cache = *m_cache;

    // Re-point the per-call inputs the compiled function objects read through
    // (the source table differs across the master/flattened/delta/prev/current
    // tables within a single update), and re-fetch this call's source columns.
    cache.m_current_source_table = source_table;
    for (t_uindex cidx = 0; cidx < num_input_columns; ++cidx) {
        cache.m_columns[cidx] =
            source_table->get_column(m_column_ids[cidx].second);
    }

    // create or get output column using m_expression_alias
    auto output_column =
        destination_table->add_column_sptr(m_expression_alias, m_dtype, true);
    auto num_rows = source_table->size();
    output_column->reserve(num_rows);

    for (t_uindex ridx = 0; ridx < num_rows; ++ridx) {
        for (t_uindex cidx = 0; cidx < num_input_columns; ++cidx) {
            cache.m_values[cidx].second.set(
                cache.m_columns[cidx]->get_scalar(ridx)
            );
        }
        cache.m_row_idx = ridx;

        t_tscalar value = cache.m_expr.value();

        if (!value.is_valid() || value.is_none()) {
            output_column->clear(ridx);
            continue;
        }

        output_column->set_scalar(ridx, value);
    }

    // order()'s accumulator must still be reset at the end of every call.
    cache.m_function_store->clear_computed_function_state();
};

const std::string&
t_computed_expression::get_expression_alias() const {
    return m_expression_alias;
}

const std::string&
t_computed_expression::get_expression_string() const {
    return m_expression_string;
}

const std::string&
t_computed_expression::get_parsed_expression_string() const {
    return m_parsed_expression_string;
}

const std::vector<std::pair<std::string, std::string>>&
t_computed_expression::get_column_ids() const {
    return m_column_ids;
}

t_dtype
t_computed_expression::get_dtype() const {
    return m_dtype;
}

/******************************************************************************
 *
 * t_computed_expression_parser
 */

t_computed_expression_parser::t_computed_expression_parser() {
    // Change ExprTk's default compilation options to only check for correctness
    // of brackets and sequences. ExprTk defaults will replace "true" and
    // "false" with 1 and 0, which we don't want. Using the tokens "true" and
    // "false" will raise a syntax error, which is the correct behavior.

    m_parser = std::make_shared<exprtk::parser<t_tscalar>>(
        exprtk::parser<t_tscalar>::settings_t::e_joiner
        + exprtk::parser<t_tscalar>::settings_t::e_numeric_check
        + exprtk::parser<t_tscalar>::settings_t::e_bracket_check
        + exprtk::parser<t_tscalar>::settings_t::e_sequence_check
        // exprtk::parser<t_tscalar>::settings_t::e_commutative_check;
        // exprtk::parser<t_tscalar>::settings_t::e_strength_reduction;
    );

    m_parser->settings()
        .disable_control_structure(
            exprtk::parser<t_tscalar>::settings_store::e_ctrl_repeat_loop
        )
        .disable_base_function(
            exprtk::parser<t_tscalar>::settings_store::e_bf_inrange
        )
        .disable_base_function(
            exprtk::parser<t_tscalar>::settings_store::e_bf_min
        )
        .disable_base_function(
            exprtk::parser<t_tscalar>::settings_store::e_bf_max
        );
}

std::shared_ptr<t_computed_expression>
t_computed_expression_parser::precompute(
    const std::string& expression_alias,
    const std::string& expression_string,
    const std::string& parsed_expression_string,
    const std::vector<std::pair<std::string, std::string>>& column_ids,
    const std::shared_ptr<t_data_table>& source_table,
    const t_gstate::t_mapping& pkey_map,
    const std::shared_ptr<t_schema>& schema,
    t_expression_vocab& vocab,
    t_regex_mapping& regex_mapping
) const {
    exprtk::symbol_table<t_tscalar> sym_table;
    sym_table.add_constants();

    t_uindex row_idx = 0;

    // Create a function store, with is_type_validator set to true as we are
    // just getting the output types.
    t_computed_function_store function_store(
        vocab, regex_mapping, true, source_table, pkey_map, row_idx
    );
    function_store.register_computed_functions(sym_table);

    std::vector<t_tscalar> values;

    auto num_input_columns = column_ids.size();
    values.resize(num_input_columns);

    // Add a new scalar of the input column type to the symtable, which
    // will use the scalar to validate the output type of the expression.
    for (t_uindex cidx = 0; cidx < num_input_columns; ++cidx) {
        const std::string& column_id = column_ids[cidx].first;
        const std::string& column_name = column_ids[cidx].second;

        t_tscalar rval;
        rval.clear();
        rval.m_type = schema->get_dtype(column_name);

        // If we are accessing string columns, the scalar CANNOT have a
        // nullptr as a string - use the empty string that we interned
        // in the gnode's expression vocab in t_gnode::init() at idx 0
        if (rval.m_type == DTYPE_STR) {
            rval.set(vocab.get_empty_string());
            rval.m_status = STATUS_INVALID;
        }

        values[cidx] = rval;

        sym_table.add_variable(column_id, values[cidx]);
    }

    exprtk::expression<t_tscalar> expr_definition;
    expr_definition.register_symbol_table(sym_table);

    if (!m_parser->compile(parsed_expression_string, expr_definition)) {
        std::stringstream ss;
        ss << "[t_computed_expression_parser::precompute] Failed to parse "
              "expression: `"
           << parsed_expression_string
           << "`, failed with error: " << m_parser->error() << '\n';
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    t_tscalar v = expr_definition.value();
    function_store.clear_computed_function_state();

    return std::make_shared<t_computed_expression>(
        expression_alias,
        expression_string,
        parsed_expression_string,
        column_ids,
        v.get_dtype()
    );
}

t_dtype
t_computed_expression_parser::get_dtype(
    const std::string& expression_alias,
    const std::string& expression_string,
    const std::string& parsed_expression_string,
    const std::vector<std::pair<std::string, std::string>>& column_ids,
    const std::shared_ptr<t_data_table>& source_table,
    const t_gstate::t_mapping& pkey_map,
    const t_schema& schema,
    t_expression_error& error,
    t_expression_vocab& vocab,
    t_regex_mapping& regex_mapping
) const {
    exprtk::symbol_table<t_tscalar> sym_table;
    sym_table.add_constants();

    std::vector<t_tscalar> values;

    t_uindex row_idx = 0;

    // Create a function store, with is_type_validator set to true as we are
    // just validating the output types.
    t_computed_function_store function_store(
        vocab, regex_mapping, true, source_table, pkey_map, row_idx
    );
    function_store.register_computed_functions(sym_table);

    auto num_input_columns = column_ids.size();
    values.resize(num_input_columns);

    // Add a new scalar of the input column type to the symtable, which
    // will use the scalar to validate the output type of the expression.
    for (t_uindex cidx = 0; cidx < num_input_columns; ++cidx) {
        const std::string& column_id = column_ids[cidx].first;
        const std::string& column_name = column_ids[cidx].second;

        if (!schema.has_column(column_name)) {
            error.m_error_message =
                ("Value Error - Input column \"" + column_name
                 + "\" does not exist.");
            error.m_line = 0;
            error.m_column = 0;
            return DTYPE_NONE;
        }

        t_tscalar rval;

        // clear() is important as it sets the status to valid and the
        // underlying union value to 0, which prevents any reading of
        // uninitialized values out of the union.
        rval.clear();
        rval.m_type = schema.get_dtype(column_name);

        // If we are accessing string columns, the scalar CANNOT have a
        // nullptr as a string - use the empty string that we interned
        // in the gnode's expression vocab in t_gnode::init() at idx 0
        if (rval.m_type == DTYPE_STR) {
            rval.set(vocab.get_empty_string());
            rval.m_status = STATUS_INVALID;
        }

        values[cidx] = rval;

        sym_table.add_variable(column_id, values[cidx]);
    }

    exprtk::expression<t_tscalar> expr_definition;
    expr_definition.register_symbol_table(sym_table);

    if (!m_parser->compile(parsed_expression_string, expr_definition)) {
        // Error count should always be above 0 if there is a compile error -
        // We simply take the first error and return it.
        if (m_parser->error_count() > 0) {
            auto parser_error = m_parser->get_error(0);

            // Given an error object and an expression, `update_error` maps the
            // error to a line and column number inside the expression.
            exprtk::parser_error::update_error(
                parser_error, parsed_expression_string
            );

            // Take the error message and strip the ExprTk error code
            std::string error_message(parser_error.diagnostic);

            // strip the Exprtk error codes such as "ERR001 -"
            error.m_error_message =
                error_message.substr(error_message.find("- ") + 2);

            error.m_line = parser_error.line_no;
            error.m_column = parser_error.column_no;
        } else {
            // If for whatever reason the error count is at 0, output a generic
            // parser error so that we report back a valid error object.
            error.m_error_message = "Parser Error";
            error.m_line = 0;
            error.m_column = 0;
        }

        return DTYPE_NONE;
    }

    t_tscalar v = expr_definition.value();
    t_dtype dtype = v.get_dtype();

    function_store.clear_computed_function_state();

    if (v.m_status == STATUS_CLEAR || dtype == DTYPE_NONE) {
        error.m_error_message =
            "Type Error - inputs do not resolve to a valid expression.";
        error.m_line = 0;
        error.m_column = 0;
        return DTYPE_NONE;
    }

    return dtype;
}

t_validated_expression_map::t_validated_expression_map() = default;

void
t_validated_expression_map::add_expression(
    const std::string& expression_alias, const std::string& type_string
) {
    // If the expression is in the error map, it should be removed as it is now
    // valid. This can happen when validating multiple expressions with the same
    // alias where the first instance is invalid, and the next occurence is
    // valid, and so on. This maintains the property that an expression will
    // exist in the schema OR the error map.
    auto error_iter = m_expression_errors.find(expression_alias);

    if (error_iter != m_expression_errors.end()) {
        m_expression_errors.erase(error_iter);
    }

    m_expression_schema[expression_alias] = type_string;
}

void
t_validated_expression_map::add_error(
    const std::string& expression_alias, t_expression_error& error
) {
    // If the expression is in the schema, it should be removed as it is now
    // invalid. This can happen when validating multiple expressions with the
    // same alias where the first instance is valid, and the next occurence is
    // invalid, and so on. This maintains the property that an expression will
    // exist in the schema OR the error map.
    auto schema_iter = m_expression_schema.find(expression_alias);

    if (schema_iter != m_expression_schema.end()) {
        m_expression_schema.erase(schema_iter);
    }

    m_expression_errors[expression_alias] = error;
}

std::map<std::string, std::string>
t_validated_expression_map::get_expression_schema() const {
    return m_expression_schema;
}

std::map<std::string, t_expression_error>
t_validated_expression_map::get_expression_errors() const {
    return m_expression_errors;
}

t_computed_function_store::t_computed_function_store(
    t_expression_vocab& vocab,
    t_regex_mapping& regex_mapping,
    bool is_type_validator,
    const std::shared_ptr<t_data_table>& source_table,
    const t_gstate::t_mapping& pkey_map,
    t_uindex& row_idx
) :
    m_day_of_week_fn(computed_function::day_of_week(vocab, is_type_validator)),
    m_month_of_year_fn(
        computed_function::month_of_year(vocab, is_type_validator)
    ),
    m_intern_fn(computed_function::intern(vocab, is_type_validator)),
    m_concat_fn(computed_function::concat(vocab, is_type_validator)),
    m_order_fn(computed_function::order(is_type_validator)),
    m_upper_fn(computed_function::upper(vocab, is_type_validator)),
    m_lower_fn(computed_function::lower(vocab, is_type_validator)),
    m_to_string_fn(computed_function::to_string(vocab, is_type_validator)),
    m_match_fn(computed_function::match(regex_mapping)),
    m_match_all_fn(computed_function::match_all(regex_mapping)),
    m_search_fn(
        computed_function::search(vocab, regex_mapping, is_type_validator)
    ),
    m_indexof_fn(computed_function::indexof(regex_mapping)),
    m_substring_fn(computed_function::substring(vocab, is_type_validator)),
    m_replace_fn(
        computed_function::replace(vocab, regex_mapping, is_type_validator)
    ),
    m_replace_all_fn(
        computed_function::replace_all(vocab, regex_mapping, is_type_validator)
    ),
    m_index_fn(computed_function::index(pkey_map, source_table, row_idx)),
    m_col_fn(
        computed_function::col(vocab, is_type_validator, source_table, row_idx)
    ),
    m_vlookup_fn(computed_function::vlookup(
        vocab, is_type_validator, source_table, row_idx
    )) {}

void
t_computed_function_store::register_computed_functions(
    exprtk::symbol_table<t_tscalar>& sym_table
) {
    // General/numeric functions
    sym_table.add_function("bucket", t_computed_expression_parser::BUCKET_FN);
    sym_table.add_reserved_function(
        "inrange", t_computed_expression_parser::INRANGE_FN
    );
    sym_table.add_reserved_function(
        "min", t_computed_expression_parser::MIN_FN
    );
    sym_table.add_reserved_function(
        "max", t_computed_expression_parser::MAX_FN
    );
    sym_table.add_function(
        "coalesce", t_computed_expression_parser::COALESCE_FN
    );
    sym_table.add_function(
        "contains", t_computed_expression_parser::CONTAINS_FN
    );
    sym_table.add_reserved_function(
        "diff3", t_computed_expression_parser::diff3
    );
    sym_table.add_reserved_function(
        "norm3", t_computed_expression_parser::norm3
    );
    sym_table.add_reserved_function(
        "cross_product3", t_computed_expression_parser::cross_product3
    );
    sym_table.add_reserved_function(
        "dot_product3", t_computed_expression_parser::dot_product3
    );
    sym_table.add_function(
        "percent_of", t_computed_expression_parser::PERCENT_OF_FN
    );
    sym_table.add_function("is_null", t_computed_expression_parser::IS_NULL_FN);
    sym_table.add_function(
        "is_not_null", t_computed_expression_parser::IS_NOT_NULL_FN
    );
    sym_table.add_function("random", t_computed_expression_parser::RANDOM_FN);

    // Date/datetime functions
    sym_table.add_function(
        "hour_of_day", t_computed_expression_parser::HOUR_OF_DAY_FN
    );
    sym_table.add_function("day_of_week", m_day_of_week_fn);
    sym_table.add_function("month_of_year", m_month_of_year_fn);
    sym_table.add_function("today", computed_function::today);
    sym_table.add_function("now", computed_function::now);

    // String functions
    sym_table.add_function("intern", m_intern_fn);
    sym_table.add_function("concat", m_concat_fn);
    sym_table.add_function("order", m_order_fn);
    sym_table.add_function("upper", m_upper_fn);
    sym_table.add_function("lower", m_lower_fn);
    sym_table.add_function("length", t_computed_expression_parser::LENGTH_FN);

    // Type conversion functions
    sym_table.add_function(
        "integer", t_computed_expression_parser::TO_INTEGER_FN
    );
    sym_table.add_function("float", t_computed_expression_parser::TO_FLOAT_FN);
    sym_table.add_function(
        "boolean", t_computed_expression_parser::TO_BOOLEAN_FN
    );
    sym_table.add_function("date", t_computed_expression_parser::MAKE_DATE_FN);
    sym_table.add_function(
        "datetime", t_computed_expression_parser::MAKE_DATETIME_FN
    );
    sym_table.add_function("string", m_to_string_fn);

    // Regex functions
    sym_table.add_function("match", m_match_fn);
    sym_table.add_function("match_all", m_match_all_fn);
    sym_table.add_function("search", m_search_fn);
    sym_table.add_function("indexof", m_indexof_fn);
    sym_table.add_function("substring", m_substring_fn);
    sym_table.add_function("replace", m_replace_fn);
    sym_table.add_function("replace_all", m_replace_all_fn);
    sym_table.add_function("index", m_index_fn);
    sym_table.add_function("col", m_col_fn);
    sym_table.add_function("vlookup", m_vlookup_fn);

    // And scalar constants
    sym_table.add_constant("True", t_computed_expression_parser::TRUE_SCALAR);
    sym_table.add_constant("False", t_computed_expression_parser::FALSE_SCALAR);
}

void
t_computed_function_store::clear_computed_function_state() {
    m_order_fn.clear_order_map();
}

} // end namespace perspective