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
#include <perspective/scalar.h>
#include <perspective/column.h>
#include <perspective/data_table.h>
#include <perspective/exprtk.h>
#include <perspective/expression_vocab.h>
#include <perspective/regex.h>
#include <random>
#include <type_traits>
#include <date/date.h>
#include <tsl/hopscotch_set.h>
#include <perspective/raw_types.h>

namespace perspective {

namespace computed_function {

    typedef typename exprtk::igeneric_function<t_tscalar>::parameter_list_t
        t_parameter_list;
    typedef typename exprtk::igeneric_function<t_tscalar>::generic_type
        t_generic_type;
    typedef typename t_generic_type::scalar_view t_scalar_view;
    typedef typename t_generic_type::vector_view t_vector_view;
    typedef typename t_generic_type::string_view t_string_view;

// A regex function that caches its parsed regex objects.
#define REGEX_FUNCTION_HEADER(NAME)                                            \
    struct NAME final : public exprtk::igeneric_function<t_tscalar> {          \
        NAME(t_regex_mapping& regex_mapping);                                  \
        ~NAME();                                                               \
        t_tscalar operator()(t_parameter_list parameters) override;            \
        t_regex_mapping& m_regex_mapping;                                      \
    };

// A regex function that returns a string stored in the expression vocab.
#define REGEX_STRING_FUNCTION_HEADER(NAME)                                     \
    struct NAME final : public exprtk::igeneric_function<t_tscalar> {          \
        NAME(                                                                  \
            t_expression_vocab& expression_vocab,                              \
            t_regex_mapping& regex_mapping,                                    \
            bool is_type_validator                                             \
        );                                                                     \
        ~NAME();                                                               \
        t_tscalar operator()(t_parameter_list parameters) override;            \
        t_expression_vocab& m_expression_vocab;                                \
        t_regex_mapping& m_regex_mapping;                                      \
        bool m_is_type_validator;                                              \
    };

// A function that returns a new string that is not part of the original
// input column. To prevent the new strings from going out of scope and causing
// memory errors, store the strings in the expression_vocab of the gnode
// that is the parent of the view. String functions MUST NOT BE STATIC;
// because Exprtk is the caller of the function (using operator()), the only
// place we can provide a reference to the vocab is through the constructor.
// As string functions are constructed per-invocation of compute/precompute/
// get_dtype, and because the gnode is guaranteed to be valid for all of
// those invocations, we can store a reference to the vocab.
#define STRING_FUNCTION_HEADER(NAME)                                           \
    struct NAME final : public exprtk::igeneric_function<t_tscalar> {          \
        NAME(t_expression_vocab& expression_vocab, bool is_type_validator);    \
        ~NAME();                                                               \
        t_tscalar operator()(t_parameter_list parameters) override;            \
        t_expression_vocab& m_expression_vocab;                                \
        t_tscalar m_sentinel;                                                  \
        bool m_is_type_validator;                                              \
    };

    // TODO PSP_NON_COPYABLE all functions

    // Place string literals into `expression_vocab` so they do not go out
    // of scope and remain valid for the lifetime of the table.
    STRING_FUNCTION_HEADER(intern)

    // Concat any number of columns and string literals together.
    STRING_FUNCTION_HEADER(concat)

    // Uppercase a string, storing intermediates in `expression_vocab`
    STRING_FUNCTION_HEADER(upper)

    // Lowercase a string
    STRING_FUNCTION_HEADER(lower)

    /**
     * @brief Given a string column and 1...n string parameters, generate a
     * numeric column that will act as a custom sort order for the string
     * column:
     *
     * category = ['A', 'B', 'C', 'D']
     * order("Category", 'B', 'C', 'A') => [2, 0, 1, 3]
     *
     * This allows string sort order to be overridden from the default
     * alphabetical sort, which is useful for categories or string timestamps.
     * Strings in the column not provided to `order()` will by default appear at
     * the end.
     */
    struct order final : public exprtk::igeneric_function<t_tscalar> {
        order(bool is_type_validator);
        ~order();

        t_tscalar operator()(t_parameter_list parameters) override;
        void clear_order_map();

        tsl::hopscotch_map<std::string, double> m_order_map;
        double m_order_idx;
        bool m_is_type_validator;
        t_tscalar m_sentinel;
    };

    /**
     * @brief Given a string column and a non-regex string literal, check
     * whether each row in the string column contains the string literal.
     */
    struct contains final : public exprtk::igeneric_function<t_tscalar> {
        contains();
        ~contains();
        t_tscalar operator()(t_parameter_list parameters) override;
    };

    /**
     * @brief match(string, pattern) => True if the string or a substring
     * partially matches pattern, and False otherwise.
     */
    REGEX_FUNCTION_HEADER(match)

    /**
     * @brief match_all(string, pattern) => True if the string fully matches
     * pattern, and False otherwise.
     */
    REGEX_FUNCTION_HEADER(match_all)

    /**
     * @brief search(string, pattern) => Returns the substring in the first
     * capturing group that matches pattern. If the regex does not have any
     * capturing groups, fails type checking and returns null.
     */
    REGEX_STRING_FUNCTION_HEADER(search)

    /**
     * @brief indexof(string, pattern) => the start index of the first match,
     * partial or full, inside string for pattern, or null if the string
     * does not match the pattern at all.
     */
    REGEX_FUNCTION_HEADER(indexof)

    /**
     * @brief substr(string, start_idx, end_idx) => the substring of string
     * at start_idx (inclusive) and end_idx (exclusive). If end_idx is not
     * provided, defaults to string.length(). Equivalent to the string slice
     * operator (str[bidx:eidx]) in Python. If bidx > eidx, returns null.
     */
    STRING_FUNCTION_HEADER(substring)

    /**
     * @brief replace(string, replace_str, pattern) => Replaces the first match
     * of pattern inside string with replace_str, or returns the original
     * string if no replacements were made.
     */
    REGEX_STRING_FUNCTION_HEADER(replace)

    /**
     * @brief replace_all(string, replace_str, pattern) => Replaces all matches
     * of pattern inside string with replace_str, or returns the original
     * string if no replacements were made.
     */
    REGEX_STRING_FUNCTION_HEADER(replace_all)

#define FUNCTION_HEADER(NAME)                                                  \
    struct NAME final : public exprtk::igeneric_function<t_tscalar> {          \
        NAME();                                                                \
        ~NAME();                                                               \
        t_tscalar operator()(t_parameter_list parameters) override;            \
    };

    // Length of the string
    FUNCTION_HEADER(length)

    // NOTE: `index`/`col`/`vlookup` hold `m_source_table` and `m_row_idx` by
    // reference, not by value, so a single compiled expression can be re-pointed
    // at a different source table / row on each call without recompiling (see
    // `t_computed_expression::compute`). The referents must outlive the function
    // object: the compile-once cache owns stable slots, and the throwaway
    // precompute/get_dtype stores bind to their local args for their own scope.
    struct index final : public exprtk::igeneric_function<t_tscalar> {
        index(
            const t_pkey_mapping& pkey_map,
            const std::shared_ptr<t_data_table>& source_table,
            t_uindex& row_idx
        );
        ~index();
        t_tscalar operator()(t_parameter_list parameters) override;

    private:
        const t_pkey_mapping& m_pkey_map;
        const std::shared_ptr<t_data_table>& m_source_table;
        t_uindex& m_row_idx;
    };

    struct col final : public exprtk::igeneric_function<t_tscalar> {
        col(t_expression_vocab& expression_vocab,
            bool is_type_validator,
            const std::shared_ptr<t_data_table>& source_table,
            t_uindex& row_idx);
        ~col();
        t_tscalar operator()(t_parameter_list parameters) override;

    private:
        t_expression_vocab& m_expression_vocab;
        bool m_is_type_validator;
        const std::shared_ptr<t_data_table>& m_source_table;
        t_uindex& m_row_idx;
    };

    struct vlookup final : public exprtk::igeneric_function<t_tscalar> {
        vlookup(
            t_expression_vocab& expression_vocab,
            bool is_type_validator,
            const std::shared_ptr<t_data_table>& source_table,
            t_uindex& row_idx
        );
        ~vlookup();
        t_tscalar operator()(t_parameter_list parameters) override;

    private:
        t_expression_vocab& m_expression_vocab;
        bool m_is_type_validator;
        const std::shared_ptr<t_data_table>& m_source_table;
        t_uindex& m_row_idx;
    };

    /**
     * @brief Return the hour of the day the date/datetime belongs to.
     */
    FUNCTION_HEADER(hour_of_day)

    // Day of Week/Month of Year write strings directly, and use custom strings
    // so they are sorted by day/month and *not* alphabetically

    extern const std::string days_of_week[7];
    extern const std::string months_of_year[12];

    // Return the day of the week the date/datetime belongs to
    STRING_FUNCTION_HEADER(day_of_week)

    // Return the month of the year the date/datetime belongs to
    STRING_FUNCTION_HEADER(month_of_year)

    enum t_date_bucket_unit {
        SECONDS,
        MINUTES,
        HOURS,
        DAYS,
        WEEKS,
        MONTHS,
        YEARS
    };

    /**
     * @brief Bucket the input by the unit:
     *
     * - If the input is a date or a datetime, the unit is one of the following:
     *   [s]econds, [m]inutes, [h]ours, [D]ays, [W]eeks, [M]onths, [Y]ears.
     *
     * - If the input is a number, the unit is also a number.
     *
     * Any other inputs are invalid.
     */
    struct bucket final : public exprtk::igeneric_function<t_tscalar> {
        bucket();
        ~bucket();

        t_tscalar operator()(t_parameter_list parameters) final;

        // faster unit lookups, since we are calling this lookup in a tight
        // loop.
        static tsl::hopscotch_map<char, t_date_bucket_unit> UNIT_MAP;
    };

    void _second_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity);
    void _minute_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity);
    void _hour_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity);
    void _day_bucket(t_tscalar& val, t_tscalar& rval);
    void _week_bucket(t_tscalar& val, t_tscalar& rval);
    void _month_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity);
    void _year_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity);

    /**
     * @brief Returns the current datetime. Will be recalculated on view
     * creation and table update.
     *
     * @return t_tscalar
     */
    t_tscalar now();

    /**
     * @brief Returns the current date. Will be recalculated on view creation
     * and table update.
     *
     * @return t_tscalar
     */
    t_tscalar today();

    /**
     * @brief inrange(range_low, value, range_high) returns whether value
     * is inside of the range (inclusive of range_low and range_high).
     */
    FUNCTION_HEADER(inrange_fn)

    /**
     * @brief Get the minimum of all the inputs.
     */
    FUNCTION_HEADER(min_fn)

    /**
     * @brief Get the maximum of all the inputs.
     */
    FUNCTION_HEADER(max_fn)

    /**
     * @brief Return the first non-null argument. Variadic; all numeric
     * inputs are promoted to FLOAT64. Non-numeric inputs must share an
     * exact dtype.
     */
    FUNCTION_HEADER(coalesce)

    /**
     * @brief Get the cross product of two vec3s
     */
    FUNCTION_HEADER(diff3)

    /**
     * @brief Get the cross product of two vec3s
     */
    FUNCTION_HEADER(norm3)

    /**
     * @brief Get the cross product of two vec3s
     */
    FUNCTION_HEADER(cross_product3)

    /**
     * @brief Get the dot product of two vec3s
     */
    FUNCTION_HEADER(dot_product3)

    /**
     * @brief Get a as percent of b.
     *
     */
    FUNCTION_HEADER(percent_of)

    /**
     * @brief Whether the input is null.
     *
     */
    FUNCTION_HEADER(is_null)

    /**
     * @brief Whether the input is not null.
     *
     */
    FUNCTION_HEADER(is_not_null)

    /**
     * @brief Convert a column or scalar of any type to a string.
     *
     */
    STRING_FUNCTION_HEADER(to_string)

    /**
     * @brief Convert a column or scalar to an integer, or null if the value is
     * not parsable as an integer. In the WASM runtime, the integer is 32-bit
     * and will return none if the result under/over flows.
     */
    FUNCTION_HEADER(to_integer)

    /**
     * @brief Convert a column or scalar to a float, or null if the value is not
     * parsable as an float.
     */
    FUNCTION_HEADER(to_float)

    /**
     * @brief Given a Year, Month (1-12), and Day, create a new date value.
     * Because we also extensively use `date.h` which exports its symbols under
     * `date`, this function is given a name that does not conflict (even though
     * it is registered using "date").
     */
    FUNCTION_HEADER(make_date)

    /**
     * @brief Convert a column or scalar to a boolean, which returns True if the
     * value is truthy or False otherwise.
     *
     * boolean(1)
     * boolean(null)
     */
    FUNCTION_HEADER(to_boolean)

    /**
     * @brief Given a POSIX timestamp of milliseconds since epoch, create a
     * new datetime value.
     */
    FUNCTION_HEADER(make_datetime)

    /**
     * @brief Return a random float between 0.0 and 1.0, inclusive.
     */
    struct random : public exprtk::igeneric_function<t_tscalar> {
        random();
        ~random();

        t_tscalar operator()(t_parameter_list parameters);

        // faster unit lookups, since we are calling this lookup in a tight
        // loop.
        static std::default_random_engine RANDOM_ENGINE;
        static std::uniform_real_distribution<double> DISTRIBUTION;
    };

} // end namespace computed_function
} // end namespace perspective