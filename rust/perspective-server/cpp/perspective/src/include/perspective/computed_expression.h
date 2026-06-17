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
#include <perspective/exports.h>
#include <perspective/raw_types.h>
#include <perspective/column.h>
#include <perspective/data_table.h>
#include <perspective/rlookup.h>
#include <perspective/computed_function.h>
#include <perspective/gnode_state.h>
#include <date/date.h>
#include <tsl/hopscotch_set.h>

// a header that includes exprtk and overload definitions for `t_tscalar` so
// it can be used inside exprtk.
#include <perspective/exprtk.h>

namespace perspective {

/**
 * @brief A thin container for an error message and position (start and end
 * row/column) from Exprtk.
 */
struct PERSPECTIVE_EXPORT t_expression_error {
    std::string m_error_message;
    t_index m_line;
    t_index m_column;
};

class PERSPECTIVE_EXPORT t_computed_expression;

// Per-expression compiled-expression cache (compile-once / rebind-per-call).
// Defined in computed_expression.cpp and held by `t_computed_expression` via a
// `mutable unique_ptr` so the compiled exprtk AST and the storage its variable
// and function nodes point at stay heap-pinned across calls.
struct t_computed_expression_cache;

class PERSPECTIVE_EXPORT t_computed_expression_parser {
public:
    t_computed_expression_parser();

    /**
     * @brief Given expression strings, validate the expression's dtype and
     * return a shared pointer to a new `t_computed_expression`. This method
     * will abort() if an input column is invalid or the expression cannot be
     * parsed.
     *
     * @param expression_alias an alias for the expression, which will become
     * the name of the new expression column on the table.
     * @param expression_string the expression, as the user typed it.
     * @param parsed_expression_string the expression after having been
     * parsed through the Perspective engine to replace column names, add
     * intern(), etc.
     * @param column_ids A map of column IDs to column names, which is used to
     * properly access column names from the symbol table.
     * @param schema
     * @return std::shared_ptr<t_computed_expression>
     */
    std::shared_ptr<t_computed_expression> precompute(
        const std::string& expression_alias,
        const std::string& expression_string,
        const std::string& parsed_expression_string,
        const std::vector<std::pair<std::string, std::string>>& column_ids,
        const std::shared_ptr<t_data_table>& source_table,
        const t_gstate::t_mapping& pkey_map,
        const std::shared_ptr<t_schema>& schema,
        t_expression_vocab& vocab,
        t_regex_mapping& regex_mapping
    ) const;

    /**
     * @brief Returns the dtype of the given expression, or `DTYPE_NONE`
     * if the expression is invalid. Unlike `precompute`, this method
     * implements additional checks for column validity and is guaranteed
     * to return a value, even if the expression cannot be parsed. If the
     * expression has an error in it, this function will return `DTYPE_NONE`
     * and the `error_string` will have an error message set.
     *
     * @param expression_alias an alias for the expression, which will become
     * the name of the new expression column on the table.
     * @param expression_string the expression, as the user typed it.
     * @param parsed_expression_string the expression after having been
     * parsed through the Perspective engine to replace column names, add
     * intern(), etc.
     * @param column_ids A map of column IDs to column names, which is used to
     * properly access column names from the symbol table.
     * @param schema
     * @param error_string
     * @return t_dtype
     */
    t_dtype get_dtype(
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
    ) const;

    std::shared_ptr<exprtk::parser<t_tscalar>> m_parser;

    // Static computed functions have no state
    static computed_function::bucket BUCKET_FN;
    static computed_function::hour_of_day HOUR_OF_DAY_FN;
    static computed_function::percent_of PERCENT_OF_FN;
    static computed_function::inrange_fn INRANGE_FN;
    static computed_function::min_fn MIN_FN;
    static computed_function::max_fn MAX_FN;
    static computed_function::coalesce COALESCE_FN;
    static computed_function::contains CONTAINS_FN;
    static computed_function::diff3 diff3;
    static computed_function::norm3 norm3;
    static computed_function::cross_product3 cross_product3;
    static computed_function::dot_product3 dot_product3;
    static computed_function::length LENGTH_FN;
    static computed_function::is_null IS_NULL_FN;
    static computed_function::is_not_null IS_NOT_NULL_FN;
    static computed_function::to_integer TO_INTEGER_FN;
    static computed_function::to_float TO_FLOAT_FN;
    static computed_function::to_boolean TO_BOOLEAN_FN;
    static computed_function::make_date MAKE_DATE_FN;
    static computed_function::make_datetime MAKE_DATETIME_FN;
    static computed_function::random RANDOM_FN;

    // constants for True and False as DTYPE_BOOL scalars
    static t_tscalar TRUE_SCALAR;
    static t_tscalar FALSE_SCALAR;
};

/**
 * @brief Contains the metadata for a single expression and the methods which
 * will compute the expression's output.
 */
class PERSPECTIVE_EXPORT t_computed_expression {
public:
    PSP_NON_COPYABLE(t_computed_expression);

    t_computed_expression(
        std::string expression_alias,
        std::string expression_string,
        std::string parsed_expression_string,
        const std::vector<std::pair<std::string, std::string>>& column_ids,
        t_dtype dtype
    );

    // Out-of-line: `m_cache` is a unique_ptr to an incomplete type, so the
    // destructor must be defined where that type is complete (the .cpp).
    ~t_computed_expression();

    void compute(
        const std::shared_ptr<t_data_table>& source_table,
        const t_gstate::t_mapping& pkey_map,
        const std::shared_ptr<t_data_table>& destination_table,
        t_expression_vocab& vocab,
        t_regex_mapping& regex_mapping
    ) const;

    const std::string& get_expression_alias() const;
    const std::string& get_expression_string() const;
    const std::string& get_parsed_expression_string() const;
    const std::vector<std::pair<std::string, std::string>>&
    get_column_ids() const;
    t_dtype get_dtype() const;

private:
    std::string m_expression_alias;
    std::string m_expression_string;
    std::string m_parsed_expression_string;
    t_computed_expression_parser m_computed_expression_parser;
    std::vector<std::pair<std::string, std::string>> m_column_ids;
    t_dtype m_dtype;

    // Lazily-built compiled-expression cache (see compute()). `mutable` because
    // compute() is const; `unique_ptr` keeps the cache heap-pinned so exprtk's
    // bound variable (T*) and function (ifunction*) pointers stay valid across
    // calls. Invalidated + rebuilt if an input column's dtype is promoted.
    mutable std::unique_ptr<t_computed_expression_cache> m_cache;
};

/**
 * @brief a `t_schema`-like container for validated expression results that
 * offers fast lookups.
 */
struct PERSPECTIVE_EXPORT t_validated_expression_map {
    t_validated_expression_map();

    void add_expression(
        const std::string& expression_alias, const std::string& type_string
    );
    void
    add_error(const std::string& expression_alias, t_expression_error& error);

    std::map<std::string, std::string> get_expression_schema() const;
    std::map<std::string, t_expression_error> get_expression_errors() const;

    std::map<std::string, std::string> m_expression_schema;
    std::map<std::string, t_expression_error> m_expression_errors;
};

/**
 * @brief Store instances of each computed function for use in
 * t_computed_expression::compute, t_computed_expression::precompute,
 * and t_computed_expression::get_dtype. When a new computed function
 * definition is added, it needs to be added here as well.
 */
struct PERSPECTIVE_EXPORT t_computed_function_store {
    PSP_NON_COPYABLE(t_computed_function_store);

    t_computed_function_store(
        t_expression_vocab& vocab,
        t_regex_mapping& regex_mapping,
        bool is_type_validator,
        const std::shared_ptr<t_data_table>& source_table,
        const t_gstate::t_mapping& pkey_map,
        t_uindex& row_idx
    );

    void register_computed_functions(exprtk::symbol_table<t_tscalar>& sym_table
    );

    /**
     * @brief Clear any intermediate state that may be used by functions, such
     * as mappings that must be cleared per-invocation.
     */
    void clear_computed_function_state();

    // Member functions are instances that must be initialized per-method call,
    // as they have references to a `t_expression_vocab`.
    computed_function::day_of_week m_day_of_week_fn;
    computed_function::month_of_year m_month_of_year_fn;
    computed_function::intern m_intern_fn;
    computed_function::concat m_concat_fn;
    computed_function::order m_order_fn;
    computed_function::upper m_upper_fn;
    computed_function::lower m_lower_fn;
    computed_function::to_string m_to_string_fn;
    computed_function::match m_match_fn;
    computed_function::match_all m_match_all_fn;
    computed_function::search m_search_fn;
    computed_function::indexof m_indexof_fn;
    computed_function::substring m_substring_fn;
    computed_function::replace m_replace_fn;
    computed_function::replace_all m_replace_all_fn;
    computed_function::index m_index_fn;
    computed_function::col m_col_fn;
    computed_function::vlookup m_vlookup_fn;
};

} // end namespace perspective