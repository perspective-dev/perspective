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

#include <perspective/computed_function.h>
#include <perspective/gnode_state.h>
#include <perspective/column.h>
#include <cmath>

#include <utility>

namespace perspective::computed_function {

intern::intern(t_expression_vocab& expression_vocab, bool is_type_validator) :
    exprtk::igeneric_function<t_tscalar>("S"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {
    // The sentinel is a string scalar pointing to an empty string
    // that is stored in `expression_vocab`. Previously we were using
    // string scalars with nullptrs to type check, which caused nullptr
    // errors in strcmp().
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.set(m_expression_vocab.get_empty_string());
    sentinel.m_status = STATUS_INVALID;
    m_sentinel = sentinel;
}

intern::~intern() = default;

t_tscalar
intern::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;
    t_generic_type& gt = parameters[0];

    // intern('abc') - with a scalar string
    t_string_view temp_string(gt);
    std::string temp_str = std::string(temp_string.begin(), temp_string.end());

    // Intern the string into the vocabulary.
    rval.set(m_expression_vocab.intern(temp_str));
    return rval;
}

concat::concat(t_expression_vocab& expression_vocab, bool is_type_validator) :
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.set(m_expression_vocab.get_empty_string());
    sentinel.m_status = STATUS_INVALID;

    m_sentinel = sentinel;
}

concat::~concat() = default;

t_tscalar
concat::operator()(t_parameter_list parameters) {
    std::string result;
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;

    if (parameters.empty()) {
        return rval;
    }

    for (auto i = 0; i < parameters.size(); ++i) {
        t_generic_type& gt = parameters[i];

        if (gt.type == t_generic_type::e_scalar) {
            t_scalar_view temp(gt);
            t_tscalar temp_scalar = temp();

            // Invalid type
            if (temp_scalar.get_dtype() != DTYPE_STR
                || temp_scalar.m_status == STATUS_CLEAR) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }

            // current param is the right type and we are type checking,
            // so move on to the next param
            if (m_is_type_validator) {
                continue;
            }

            // no longer in type-checking - return if the param is invalid.
            if (!temp_scalar.is_valid()) {
                return rval;
            }

            // Read the string out from the scalar
            result += temp_scalar.to_string();
        } else {
            // An invalid call.
            rval.m_status = STATUS_CLEAR;
            return rval;
        }
    }

    // We know the params are valid - so return the sentinel string value.
    if (result.empty() || m_is_type_validator) {
        return m_sentinel;
    }

    rval.set(m_expression_vocab.intern(result));
    return rval;
}

upper::upper(t_expression_vocab& expression_vocab, bool is_type_validator) :
    exprtk::igeneric_function<t_tscalar>("T"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.set(m_expression_vocab.get_empty_string());
    sentinel.m_status = STATUS_INVALID;

    m_sentinel = sentinel;
}

upper::~upper() = default;

t_tscalar
upper::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;
    std::string temp_str;

    if (parameters.size() != 1) {
        return rval;
    }

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    t_tscalar temp_scalar = temp();

    if (temp_scalar.get_dtype() != DTYPE_STR
        || temp_scalar.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!temp_scalar.is_valid()) {
        return rval;
    }

    temp_str = temp_scalar.to_string();

    // don't try to intern an empty string as it will throw an error, but
    // by this point we know the params are valid - so return the sentinel
    // string value.
    if (temp_str.empty() || m_is_type_validator) {
        return m_sentinel;
    }

    boost::to_upper(temp_str);

    rval.set(m_expression_vocab.intern(temp_str));
    return rval;
}

lower::lower(t_expression_vocab& expression_vocab, bool is_type_validator) :
    exprtk::igeneric_function<t_tscalar>("T"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.set(m_expression_vocab.get_empty_string());
    sentinel.m_status = STATUS_INVALID;

    m_sentinel = sentinel;
}

lower::~lower() = default;

t_tscalar
lower::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;
    std::string temp_str;

    if (parameters.size() != 1) {
        return rval;
    }

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    t_tscalar temp_scalar = temp();

    if (temp_scalar.get_dtype() != DTYPE_STR
        || temp_scalar.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!temp_scalar.is_valid() || temp_scalar.is_none()) {
        return rval;
    }

    temp_str = temp_scalar.to_string();
    // don't try to intern an empty string as it will throw an error, but
    // by this point we know the params are valid - so return the sentinel
    // string value.
    if (temp_str.empty() || m_is_type_validator) {
        return m_sentinel;
    }

    boost::to_lower(temp_str);

    rval.set(m_expression_vocab.intern(temp_str));
    return rval;
}

length::length() : exprtk::igeneric_function<t_tscalar>("T") {}

length::~length() = default;

t_tscalar
length::operator()(t_parameter_list parameters) {
    std::string temp_str;
    t_tscalar rval;
    rval.clear();

    // return a float to be compatible with the most comparisons - even
    // though a uint would make most sense here, if this column returned a
    // uint comparisons to numeric literals and other numeric columns would
    // always be false, as comparisons are False across types.
    rval.m_type = DTYPE_FLOAT64;

    if (parameters.size() != 1) {
        return rval;
    }

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    t_tscalar temp_scalar = temp();

    if (temp_scalar.get_dtype() != DTYPE_STR
        || temp_scalar.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!temp_scalar.is_valid() || temp_scalar.is_none()) {
        return rval;
    }

    temp_str = temp_scalar.to_string();
    rval.set(static_cast<double>(temp_str.length()));
    return rval;
}

order::order(bool is_type_validator) :
    m_order_map({}),
    m_order_idx(0),
    m_is_type_validator(is_type_validator) {
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.m_type = DTYPE_FLOAT64;
    m_sentinel = sentinel;
}

order::~order() = default;

t_tscalar
order::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();

    // return a float to be compatible with the most comparisons - even
    // though a uint would make most sense here, if this column returned a
    // uint comparisons to numeric literals and other numeric columns would
    // always be false, as comparisons are False across types.
    rval.m_type = DTYPE_FLOAT64;

    if (parameters.size() <= 1) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // Validate that the input column is of string type
    const t_generic_type& input_scalar_gt = parameters[0];

    // if first input is not scalar, return
    if (input_scalar_gt.type != t_generic_type::e_scalar) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    t_scalar_view input_scalar_view(input_scalar_gt);
    t_tscalar input_scalar = input_scalar_view();

    // Invalid type
    if (input_scalar.get_dtype() != DTYPE_STR
        || input_scalar.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // generate the map if not generated
    if (m_order_map.empty()) {
        // Validate order parameters
        for (auto i = 1; i < parameters.size(); ++i) {
            // Because all strings are interned, there should be no string
            // literals passed to any functions.
            const t_generic_type& gt = parameters[i];

            // Make sure all params are scalars too
            if (gt.type != t_generic_type::e_scalar) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }

            t_scalar_view temp(gt);
            t_tscalar temp_scalar = temp();

            // Invalid type
            if (temp_scalar.get_dtype() != DTYPE_STR
                || temp_scalar.m_status == STATUS_CLEAR) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }

            // current param is the right type and we are type checking,
            // so move on to the next param
            if (m_is_type_validator) {
                continue;
            }

            // no longer in type-checking - return if the param is invalid.
            if (!temp_scalar.is_valid()) {
                return rval;
            }

            // params[0] is the column, params[1] onward are sort params
            if (i > 0) {
                // Read the string param and assign to the order map, and
                // then increment the internal counter.
                std::string value = temp_scalar.to_string();
                m_order_map[value] = m_order_idx;
                m_order_idx++;
            }
        }
    }

    // We know the params are valid - so return the sentinel float value.
    if (m_is_type_validator) {
        return m_sentinel;
    }

    // read from the map or add the param to the map
    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    t_tscalar col_value = temp();

    // Don't calculate order for invalid scalars.
    if (!col_value.is_valid()) {
        return rval;
    }

    std::string key = col_value.to_string();
    auto found = m_order_map.find(key);

    if (found != m_order_map.end()) {
        rval.set(found->second);
    } else {
        // if the value is not in the map, then put it at the end so that
        // natural sorting can be applied.
        rval.set(m_order_idx);
    }

    return rval;
}

void
order::clear_order_map() {
    m_order_map.clear();
    m_order_idx = 0;
}

match::match(t_regex_mapping& regex_mapping) :
    exprtk::igeneric_function<t_tscalar>("TS"),
    m_regex_mapping(regex_mapping) {}

match::~match() = default;

t_tscalar
match::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    // Parameters already validated
    t_scalar_view str_view(parameters[0]);
    t_string_view pattern_view(parameters[1]);

    t_tscalar str = str_view();
    std::string match_pattern =
        std::string(pattern_view.begin(), pattern_view.end());

    // Type-check: only operate on strings, and pattern must be > size 0
    if (str.get_dtype() != DTYPE_STR || str.m_status == STATUS_CLEAR
        || match_pattern.empty()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    RE2* compiled_pattern = m_regex_mapping.intern(match_pattern);

    if (compiled_pattern == nullptr) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!str.is_valid()) {
        return rval;
    }

    const std::string& match_string = str.to_string();

    // Get the pattern from the map and perform the match.
    rval.set(RE2::PartialMatch(match_string, *compiled_pattern));

    return rval;
}

match_all::match_all(t_regex_mapping& regex_mapping) :
    exprtk::igeneric_function<t_tscalar>("TS"),
    m_regex_mapping(regex_mapping) {}

match_all::~match_all() = default;

t_tscalar
match_all::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    // Parameters already validated
    t_scalar_view str_view(parameters[0]);
    t_string_view pattern_view(parameters[1]);

    t_tscalar str = str_view();
    std::string match_pattern =
        std::string(pattern_view.begin(), pattern_view.end());

    // Type-check: only operate on strings, and pattern must be > size 0
    if (str.get_dtype() != DTYPE_STR || str.m_status == STATUS_CLEAR
        || match_pattern.empty()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    RE2* compiled_pattern = m_regex_mapping.intern(match_pattern);

    if (compiled_pattern == nullptr) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!str.is_valid()) {
        return rval;
    }

    const std::string& match_string = str.to_string();

    // Get the pattern from the map and perform the match.
    rval.set(RE2::FullMatch(match_string, *compiled_pattern));

    return rval;
}

contains::contains() : exprtk::igeneric_function<t_tscalar>("TS") {}

contains::~contains() = default;

t_tscalar
contains::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    t_scalar_view str_view(parameters[0]);
    t_string_view needle_view(parameters[1]);

    t_tscalar str = str_view();
    std::string needle =
        std::string(needle_view.begin(), needle_view.end());

    if (str.get_dtype() != DTYPE_STR || str.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!str.is_valid()) {
        return rval;
    }

    rval.set(str.to_string().find(needle) != std::string::npos);
    return rval;
}

search::search(
    t_expression_vocab& expression_vocab,
    t_regex_mapping& regex_mapping,
    bool is_type_validator
) :
    exprtk::igeneric_function<t_tscalar>("TS"),
    m_expression_vocab(expression_vocab),
    m_regex_mapping(regex_mapping),
    m_is_type_validator(is_type_validator) {}

search::~search() = default;

t_tscalar
search::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;

    // Parameters already validated
    t_scalar_view str_view(parameters[0]);
    t_string_view pattern_view(parameters[1]);

    t_tscalar str = str_view();
    std::string match_pattern =
        std::string(pattern_view.begin(), pattern_view.end());

    // Type-check: only operate on strings, and pattern must be > size 0
    if (str.get_dtype() != DTYPE_STR || str.m_status == STATUS_CLEAR
        || match_pattern.empty()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    RE2* compiled_pattern = m_regex_mapping.intern(match_pattern);

    if (compiled_pattern == nullptr
        || compiled_pattern->NumberOfCapturingGroups() < 1) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!str.is_valid() || m_is_type_validator) {
        return rval;
    }

    re2::StringPiece result;
    const std::string& match_string = str.to_string();
    bool found = RE2::PartialMatch(match_string, *compiled_pattern, &result);

    // Return null if no match, or if the match is size 0 - don't allow
    // empty strings back out.
    if (!found || result.empty()) {
        return rval;
    }

    rval.set(m_expression_vocab.intern(result.ToString()));

    return rval;
}

indexof::indexof(t_regex_mapping& regex_mapping) :
    exprtk::igeneric_function<t_tscalar>("TSV"),
    m_regex_mapping(regex_mapping) {}

indexof::~indexof() = default;

t_tscalar
indexof::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    // Parameters already validated
    t_scalar_view str_view(parameters[0]);
    t_string_view pattern_view(parameters[1]);
    t_vector_view output_vector(parameters[2]);

    t_tscalar str = str_view();
    std::string match_pattern =
        std::string(pattern_view.begin(), pattern_view.end());

    // Type-check: only operate on strings, and pattern must be > size 0,
    // and output vector must be big enough to hold the output
    if (str.get_dtype() != DTYPE_STR || str.m_status == STATUS_CLEAR
        || match_pattern.empty() || output_vector.size() < 2) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    RE2* compiled_pattern = m_regex_mapping.intern(match_pattern);

    if (compiled_pattern == nullptr
        || compiled_pattern->NumberOfCapturingGroups() < 1) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!str.is_valid()) {
        return rval;
    }

    re2::StringPiece result;
    const std::string& match_string = str.to_string();
    bool found = RE2::PartialMatch(match_string, *compiled_pattern, &result);

    if (!found) {
        // no-op on the input vector
        rval.set(false);
        return rval;
    }

    // re2::StringPiece::data is a ptr into the string being matched,
    // so we can pointer math the start and end index of the match
    std::size_t start_idx = result.data() - match_string.data();
    std::size_t end_idx = start_idx + result.size() - 1;

    if (start_idx < 0 || end_idx < 0 || end_idx >= match_string.size()
        || (start_idx > end_idx)) {
        rval.set(false);
        return rval;
    }

    t_tscalar start_scalar;
    t_tscalar end_scalar;

    start_scalar.set(static_cast<double>(start_idx));
    end_scalar.set(static_cast<double>(end_idx));

    output_vector[0] = start_scalar;
    output_vector[1] = end_scalar;

    rval.set(true);
    return rval;
}

substring::substring(
    t_expression_vocab& expression_vocab, bool is_type_validator
) :
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {}

substring::~substring() = default;

t_tscalar
substring::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;
    auto num_params = parameters.size();

    // substring(string, start_idx) or substring(string, start_idx, length)
    if (num_params != 2 && num_params != 3) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    std::string search_string;

    // Must be able to check for negative indices from the user -
    // std::size_t is unsigned so a user passing in -1 is automatically
    // cast to 0, which is incorrect as we want to detect the -1 and return
    // null.
    std::int64_t start_idx;

    // npos == all chars until end of the string
    std::int64_t substring_length = std::string::npos;

    for (auto i = 0; i < num_params; ++i) {
        const t_generic_type& gt = parameters[i];

        if (gt.type == t_generic_type::e_scalar) {
            t_scalar_view temp_scalar_view(gt);
            t_tscalar temp_scalar = temp_scalar_view();

            // type check - first param must be string, 2nd and 3rd param
            // must be numeric, all must be valid
            t_dtype dtype = temp_scalar.get_dtype();

            if ((i == 0 && dtype != DTYPE_STR)
                || (i != 0 && !temp_scalar.is_numeric())
                || temp_scalar.m_status == STATUS_CLEAR) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }

            // Only check for types - bad indices will always return null
            // but be valid expressions.
            if (m_is_type_validator || !temp_scalar.is_valid()) {
                return rval;
            }

            // Passed type checking, assign values
            if (i == 0) {
                search_string = temp_scalar.to_string();
            } else if (i == 1) {
                start_idx = temp_scalar.to_double();
            } else if (i == 2) {
                substring_length = temp_scalar.to_double();
            }
        } else {
            // called with invalid params - exit
            rval.m_status = STATUS_CLEAR;
            return rval;
        }
    }

    // done type checking
    if (m_is_type_validator) {
        return rval;
    }

    std::size_t length = search_string.length();

    // Value check: strings cannot be 0 length, indices must be valid
    if (length == 0 || start_idx < 0
        || (num_params == 3 && substring_length < 0) || start_idx >= length
        || (substring_length != std::string::npos
            && start_idx + substring_length > length)) {
        return rval;
    }

    rval.set(m_expression_vocab.intern(
        search_string.substr(start_idx, substring_length)
    ));

    return rval;
}

replace::replace(
    t_expression_vocab& expression_vocab,
    t_regex_mapping& regex_mapping,
    bool is_type_validator
) :
    exprtk::igeneric_function<t_tscalar>("TS?"),
    m_expression_vocab(expression_vocab),
    m_regex_mapping(regex_mapping),
    m_is_type_validator(is_type_validator) {}

replace::~replace() = default;

t_tscalar
replace::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;

    // the string to be replaced
    t_scalar_view string_scalar_view(parameters[0]);
    t_tscalar string_scalar = string_scalar_view();

    // the replace pattern
    t_string_view pattern_view(parameters[1]);
    std::string match_pattern =
        std::string(pattern_view.begin(), pattern_view.end());

    // replacer can be a string literal, for the string '' as intern does
    // not pick up on empty strings but we need to be able to replace
    // with empty string. Thus, type-check replacer before continuing.
    const t_generic_type& gt(parameters[2]);
    t_tscalar replacer_scalar;

    if (gt.type == t_generic_type::e_scalar) {
        t_scalar_view replacer_view(gt);
        replacer_scalar = replacer_view();
    } else if (gt.type == t_generic_type::e_string) {
        t_string_view replacer_view(gt);
        std::string replacer_str =
            std::string(replacer_view.begin(), replacer_view.end());

        // only the empty string should be passed in as a string literal,
        // all other strings must be interned first.
        if (!replacer_str.empty()) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        // use the empty string from vocab
        replacer_scalar.set(m_expression_vocab.get_empty_string());
    } else {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (string_scalar.m_type != DTYPE_STR || replacer_scalar.m_type != DTYPE_STR
        || match_pattern.empty()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // typecheck the regex
    RE2* compiled_pattern = m_regex_mapping.intern(match_pattern);

    if (compiled_pattern == nullptr) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // done with type_checking
    if (m_is_type_validator) {
        return rval;
    }

    // make a copy of search_str, as replace() will mutate it and we
    // don't want to mutate the string in the vocab
    std::string search_string = string_scalar.to_string();

    if (search_string.empty()) {
        return rval;
    }

    // but we can take a reference to the replacer
    const std::string& replacer_string = replacer_scalar.to_string();
    re2::StringPiece replacer(replacer_string);

    bool replaced =
        RE2::Replace(&(search_string), *(compiled_pattern), replacer);

    if (!replaced) {
        // Return the original result if the replacement didn't happen
        return string_scalar;
    }

    // Or the string with the replacement set
    rval.set(m_expression_vocab.intern(search_string));

    return rval;
}

replace_all::replace_all(
    t_expression_vocab& expression_vocab,
    t_regex_mapping& regex_mapping,
    bool is_type_validator
) :
    exprtk::igeneric_function<t_tscalar>("TS?"),
    m_expression_vocab(expression_vocab),
    m_regex_mapping(regex_mapping),
    m_is_type_validator(is_type_validator) {}

replace_all::~replace_all() = default;

t_tscalar
replace_all::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;

    // the string to be replaced
    t_scalar_view string_scalar_view(parameters[0]);
    t_tscalar string_scalar = string_scalar_view();

    // the replace pattern
    t_string_view pattern_view(parameters[1]);
    std::string match_pattern =
        std::string(pattern_view.begin(), pattern_view.end());

    // replacer can be a string literal, for the string '' as intern does
    // not pick up on empty strings but we need to be able to replace
    // with empty string. Thus, type-check replacer before continuing.
    const t_generic_type& gt(parameters[2]);
    t_tscalar replacer_scalar;

    if (gt.type == t_generic_type::e_scalar) {
        t_scalar_view replacer_view(gt);
        replacer_scalar = replacer_view();
    } else if (gt.type == t_generic_type::e_string) {
        t_string_view replacer_view(gt);
        std::string replacer_str =
            std::string(replacer_view.begin(), replacer_view.end());

        // only the empty string should be passed in as a string literal,
        // all other strings must be interned first.
        if (!replacer_str.empty()) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        // use the empty string from vocab
        replacer_scalar.set(m_expression_vocab.get_empty_string());
    } else {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (string_scalar.m_type != DTYPE_STR || replacer_scalar.m_type != DTYPE_STR
        || match_pattern.empty()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // typecheck the regex
    RE2* compiled_pattern = m_regex_mapping.intern(match_pattern);

    if (compiled_pattern == nullptr) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // done with type_checking
    if (m_is_type_validator) {
        return rval;
    }

    // make a copy of search_str, as replace() will mutate it and we
    // don't want to mutate the string in the vocab
    std::string search_string = string_scalar.to_string();

    if (search_string.empty()) {
        return rval;
    }

    // but we can take a reference to the replacer
    const std::string& replacer_string = replacer_scalar.to_string();
    re2::StringPiece replacer(replacer_string);

    std::size_t replaced =
        RE2::GlobalReplace(&(search_string), *(compiled_pattern), replacer);

    if (replaced == 0) {
        // Return the original result if the replacement didn't happen
        return string_scalar;
    }

    // Or the string with the replacement set
    rval.set(m_expression_vocab.intern(search_string));

    return rval;
}

hour_of_day::hour_of_day() : exprtk::igeneric_function<t_tscalar>("T") {}

hour_of_day::~hour_of_day() = default;

t_tscalar
hour_of_day::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar rval;
    rval.clear();

    // return a float to be compatible with the most comparisons - even
    // though a uint would make most sense here, if this column returned a
    // uint comparisons to numeric literals and other numeric columns would
    // always be false, as comparisons are False across types.
    rval.m_type = DTYPE_FLOAT64;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    t_tscalar temp_scalar = temp();

    t_dtype dtype = temp_scalar.get_dtype();
    bool valid_dtype = dtype == DTYPE_DATE || dtype == DTYPE_TIME;

    if (!valid_dtype || temp_scalar.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!temp_scalar.is_valid()) {
        return rval;
    }

    val.set(temp_scalar);

    if (val.get_dtype() == DTYPE_TIME) {
        // Convert the int64 to a milliseconds duration timestamp
        std::chrono::milliseconds timestamp(val.to_int64());

        // Convert the timestamp to a `sys_time` (alias for `time_point`)
        date::sys_time<std::chrono::milliseconds> ts(timestamp);

        // Use localtime so that the hour of day is consistent with all
        // output datetimes, which are in local time
        std::time_t temp = std::chrono::system_clock::to_time_t(ts);
        std::tm* t = std::localtime(&temp);

        // Get the hour from the resulting `std::tm`
        rval.set(static_cast<double>(t->tm_hour));
    } else {
        // Hour of day for date column is always 0
        rval.set(0.0);
    }

    return rval;
}

const std::string days_of_week[7] = {
    "1 Sunday",
    "2 Monday",
    "3 Tuesday",
    "4 Wednesday",
    "5 Thursday",
    "6 Friday",
    "7 Saturday"
};

const std::string months_of_year[12] = {
    "01 January",
    "02 February",
    "03 March",
    "04 April",
    "05 May",
    "06 June",
    "07 July",
    "08 August",
    "09 September",
    "10 October",
    "11 November",
    "12 December"
};

day_of_week::day_of_week(
    t_expression_vocab& expression_vocab, bool is_type_validator
) :
    exprtk::igeneric_function<t_tscalar>("T"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.set(m_expression_vocab.get_empty_string());
    sentinel.m_status = STATUS_INVALID;

    m_sentinel = sentinel;
}

day_of_week::~day_of_week() = default;

t_tscalar
day_of_week::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    t_tscalar temp_scalar = temp();
    t_dtype dtype = temp_scalar.get_dtype();
    bool valid_dtype = dtype == DTYPE_DATE || dtype == DTYPE_TIME;

    if (!valid_dtype || temp_scalar.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!temp_scalar.is_valid()) {
        return rval;
    }

    val.set(temp_scalar);

    if (m_is_type_validator) {
        return m_sentinel;
    }

    std::string result;

    if (val.get_dtype() == DTYPE_TIME) {
        // Convert the int64 to a milliseconds duration timestamp
        std::chrono::milliseconds timestamp(val.to_int64());

        // Convert the timestamp to a `sys_time` (alias for `time_point`)
        date::sys_time<std::chrono::milliseconds> ts(timestamp);

        // Use localtime so that the hour of day is consistent with all
        // output datetimes, which are in local time
        std::time_t temp = std::chrono::system_clock::to_time_t(ts);
        std::tm* t = std::localtime(&temp);

        // Get the weekday from the resulting `std::tm`
        result = days_of_week[t->tm_wday];
    } else {
        // Retrieve the `t_date` struct from the scalar
        t_date date_val = val.get<t_date>();

        // Construct a `date::year_month_day` value
        date::year year{date_val.year()};

        // date::month is [1-12], whereas `t_date.month()` is [0-11]
        date::month month{static_cast<std::uint32_t>(date_val.month()) + 1};
        date::day day{static_cast<std::uint32_t>(date_val.day())};
        date::year_month_day ymd(year, month, day);

        // Construct a `date::year_month_weekday` from `date::sys_days`
        // since epoch
        auto weekday =
            date::year_month_weekday(ymd).weekday_indexed().weekday();

        result = days_of_week[(weekday - date::Sunday).count()];
    }

    rval.set(m_expression_vocab.intern(result));
    return rval;
}

month_of_year::month_of_year(
    t_expression_vocab& expression_vocab, bool is_type_validator
) :
    exprtk::igeneric_function<t_tscalar>("T"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.set(m_expression_vocab.get_empty_string());
    sentinel.m_status = STATUS_INVALID;

    m_sentinel = sentinel;
}

month_of_year::~month_of_year() = default;

t_tscalar
month_of_year::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    t_tscalar temp_scalar = temp();

    t_dtype dtype = temp_scalar.get_dtype();
    bool valid_dtype = dtype == DTYPE_DATE || dtype == DTYPE_TIME;

    if (!valid_dtype || temp_scalar.m_status == STATUS_CLEAR) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!temp_scalar.is_valid()) {
        return rval;
    }

    val.set(temp_scalar);

    if (m_is_type_validator) {
        return m_sentinel;
    }

    std::string result;

    if (val.get_dtype() == DTYPE_TIME) {
        // Convert the int64 to a milliseconds duration timestamp
        std::chrono::milliseconds timestamp(val.to_int64());

        // Convert the timestamp to a `sys_time` (alias for `time_point`)
        date::sys_time<std::chrono::milliseconds> ts(timestamp);

        // Use localtime so that the hour of day is consistent with all
        // output datetimes, which are in local time
        std::time_t temp = std::chrono::system_clock::to_time_t(ts);
        std::tm* t = std::localtime(&temp);

        // Get the month from the resulting `std::tm`
        auto month = t->tm_mon;

        // Get the month string and write into the output column
        result = months_of_year[month];
    } else {
        t_date date_val = val.get<t_date>();

        // `t_date.month()` is [0-11]
        std::int32_t month = date_val.month();
        result = months_of_year[month];
    }

    // Intern the string pointer so it does not fall out of reference and
    // cause a memory error.
    rval.set(m_expression_vocab.intern(result));
    return rval;
}

tsl::hopscotch_map<char, t_date_bucket_unit> bucket::UNIT_MAP = {
    {'s', t_date_bucket_unit::SECONDS},
    {'m', t_date_bucket_unit::MINUTES},
    {'h', t_date_bucket_unit::HOURS},
    {'D', t_date_bucket_unit::DAYS},
    {'W', t_date_bucket_unit::WEEKS},
    {'M', t_date_bucket_unit::MONTHS},
    {'Y', t_date_bucket_unit::YEARS}
};

bucket::bucket() : exprtk::igeneric_function<t_tscalar>("T?") {}

bucket::~bucket() = default;

t_tscalar
bucket::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar unit;
    t_tscalar rval;
    rval.clear();

    // Parameters are already validated in the constructor by Exprtk
    t_generic_type& gt_val = parameters[0];  // always a scalar
    t_generic_type& gt_unit = parameters[1]; // scalar or string

    // Convert value to scalar
    t_scalar_view temp_val(gt_val);
    val.set(temp_val());

    // Bucket by numeric value
    t_scalar_view temp_unit2(gt_unit);
    unit.set(temp_unit2());

    if (val.is_numeric()) {
        rval.m_type = DTYPE_FLOAT64;

        // type-check
        if (!unit.is_numeric() || val.m_status == STATUS_CLEAR
            || unit.m_status == STATUS_CLEAR) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        if (!val.is_valid() || !unit.is_valid()) {
            return rval;
        }

        rval.set(floor(val.to_double() / unit.to_double()) * unit.to_double());

        return rval;
    }

    // Must be a datetime - second parameter is a string
    const auto unit_str = std::string(unit.get<const char*>());
    char temp_unit = 0;
    const auto len = unit_str.size();

    unsigned long multiplicity;
    t_date_bucket_unit date_unit;
    if (len == 0) {
        // Does not type-check!
        rval.m_status = STATUS_CLEAR;
        return rval;
    }
    if (len == 1) {
        // No multiplicity explicity given, defaults to 1.
        multiplicity = 1;
        temp_unit = unit_str.at(0);
    } else {
        temp_unit = unit_str.at(len - 1);
        std::string mult = unit_str.substr(0, len - 1);
        if (!std::all_of(mult.begin(), mult.end(), ::isdigit)) {
            // multiplicity is not a non-negative integer
            rval.m_status = STATUS_CLEAR;
            return rval;
        }
        multiplicity = std::stoul(mult);
    }
    std::string allowed_units = "smhDWMY";
    if (allowed_units.find(temp_unit) == std::string::npos) {
        // std::cerr << "[bucket] unknown unit in bucket - the valid units "
        //              "are 's', 'm', 'h', 'D', 'W', 'M', and 'Y'."
        //           << '\n';
        rval.m_type = DTYPE_TIME;
        rval.m_status = STATUS_CLEAR;
        return rval;
    }
    date_unit = bucket::UNIT_MAP[temp_unit];

    // type-check multiplicity
    switch (date_unit) {
        case t_date_bucket_unit::SECONDS:
        case t_date_bucket_unit::MINUTES:
            if (multiplicity != 1 && multiplicity != 5 && multiplicity != 10
                && multiplicity != 15 && multiplicity != 20
                && multiplicity != 30) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }
            break;
        case t_date_bucket_unit::HOURS:
            if (multiplicity != 1 && multiplicity != 2 && multiplicity != 3
                && multiplicity != 4 && multiplicity != 6
                && multiplicity != 12) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }
            break;
        case t_date_bucket_unit::DAYS:
            // TODO: day multiplicity.
        case t_date_bucket_unit::WEEKS:
            // TODO: week multiplicity
            if (multiplicity != 1) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }
            break;
        case t_date_bucket_unit::MONTHS:
            if (multiplicity != 1 && multiplicity != 2 && multiplicity != 3
                && multiplicity != 4 && multiplicity != 6) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            }
            break;
        case t_date_bucket_unit::YEARS:
            break;
        default:
            PSP_COMPLAIN_AND_ABORT("[bucket] invalid date bucket unit!");
            break;
    }
    t_dtype val_dtype = val.get_dtype();
    // type-check
    if (val_dtype != DTYPE_DATE && val_dtype != DTYPE_TIME) {
        rval.m_status = STATUS_CLEAR;
    }

    // Depending on unit, datetime columns can result in a date column or a
    // datetime column.
    if (val_dtype == DTYPE_TIME) {
        switch (date_unit) {
            case t_date_bucket_unit::SECONDS:
            case t_date_bucket_unit::MINUTES:
            case t_date_bucket_unit::HOURS: {
                rval.m_type = DTYPE_TIME;
            } break;
            case t_date_bucket_unit::DAYS:
            case t_date_bucket_unit::WEEKS:
            case t_date_bucket_unit::MONTHS:
            case t_date_bucket_unit::YEARS: {
                rval.m_type = DTYPE_DATE;
            } break;
            default: {
                PSP_COMPLAIN_AND_ABORT("[bucket] invalid date bucket unit!");
            } break;
        }
    } else {
        // but date columns will always output date columns
        rval.m_type = DTYPE_DATE;
    }

    if (!val.is_valid()) {
        return rval;
    }

    switch (date_unit) {
        case t_date_bucket_unit::SECONDS: {
            _second_bucket(val, rval, multiplicity);
        } break;
        case t_date_bucket_unit::MINUTES: {
            _minute_bucket(val, rval, multiplicity);
        } break;
        case t_date_bucket_unit::HOURS: {
            _hour_bucket(val, rval, multiplicity);
        } break;
        case t_date_bucket_unit::DAYS: {
            _day_bucket(val, rval);
        } break;
        case t_date_bucket_unit::WEEKS: {
            _week_bucket(val, rval);
        } break;
        case t_date_bucket_unit::MONTHS: {
            _month_bucket(val, rval, multiplicity);
        } break;
        case t_date_bucket_unit::YEARS: {
            _year_bucket(val, rval, multiplicity);
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("[bucket] invalid date bucket unit!");
        } break;
    }

    return rval;
}

/// @brief Buckets a given time into a date at multiplicity*T resolution.
/// @tparam T The std::chrono::duration to bucket by.
/// @param val The input date.
/// @param multiplicity How many Ts to put in a bucket.
/// @return The bucketed time.
template <typename T>
t_time
bucket_time(t_tscalar& val, t_uindex multiplicity) {
    std::chrono::milliseconds millis(val.to_int64());
    auto raw = std::chrono::duration_cast<T>(millis).count();
    int64_t bucket =
        floor(static_cast<double>(raw) / multiplicity) * multiplicity;
    T refined(bucket);
    return t_time(
        std::chrono::duration_cast<std::chrono::milliseconds>(refined).count()
    );
}

void
_second_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity) {
    switch (val.get_dtype()) {
        case DTYPE_TIME: {
            rval.set(bucket_time<std::chrono::seconds>(val, multiplicity));
        } break;
        default: {
            // echo the original value back into the column.
            rval.set(val);
        }
    }
}

void
_minute_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity) {
    switch (val.get_dtype()) {
        case DTYPE_TIME: {
            rval.set(bucket_time<std::chrono::minutes>(val, multiplicity));
        } break;
        default: {
            rval.set(val);
        } break;
    }
}

void
_hour_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity) {
    switch (val.get_dtype()) {
        case DTYPE_TIME: {
            rval.set(bucket_time<std::chrono::hours>(val, multiplicity));
        } break;
        default: {
            rval.set(val);
        } break;
    }
}

void
_day_bucket(t_tscalar& val, t_tscalar& rval) {
    switch (val.get_dtype()) {
        case DTYPE_TIME: {
            // Convert the int64 to a milliseconds duration timestamp
            std::chrono::milliseconds ms_timestamp(val.to_int64());

            // Convert the timestamp to a `sys_time` (alias for
            // `time_point`)
            date::sys_time<std::chrono::milliseconds> ts(ms_timestamp);

            // Use localtime so that the day of week is consistent with all
            // output datetimes, which are in local time
            std::time_t temp = std::chrono::system_clock::to_time_t(ts);

            // Convert to a std::tm
            std::tm* t = std::localtime(&temp);

            // Get the year and create a new `t_date`
            auto year = static_cast<std::int32_t>(t->tm_year + 1900);

            // Month in `t_date` is [0-11]
            std::int32_t month = static_cast<std::uint32_t>(t->tm_mon);
            auto day = static_cast<std::uint32_t>(t->tm_mday);

            rval.set(t_date(year, month, day));
        } break;
        case DTYPE_DATE:
        default: {
            // echo the original value back into the column.
            rval.set(val);
        } break;
    }
}

void
_week_bucket(t_tscalar& val, t_tscalar& rval) {
    switch (val.get_dtype()) {
        case DTYPE_DATE: {
            // Retrieve the `t_date` struct from the scalar
            t_date date_val = val.get<t_date>();

            // Construct a `date::year_month_day` value
            date::year year{date_val.year()};

            // date::month is [1-12], whereas `t_date.month()` is [0-11]
            date::month month{static_cast<std::uint32_t>(date_val.month()) + 1};
            date::day day{static_cast<std::uint32_t>(date_val.day())};
            date::year_month_day ymd(year, month, day);

            // Convert to a `sys_days` representing no. of days since epoch
            date::sys_days days_since_epoch = ymd;

            // Subtract Sunday from the ymd to get the beginning of the last
            // day
            ymd = days_since_epoch
                - (date::weekday{days_since_epoch} - date::Monday);

            // Get the day of month and day of the week
            std::int32_t year_int = static_cast<std::int32_t>(ymd.year());

            // date::month is [1-12], whereas `t_date.month()` is [0-11]
            std::uint32_t month_int =
                static_cast<std::uint32_t>(ymd.month()) - 1;
            std::uint32_t day_int = static_cast<std::uint32_t>(ymd.day());

            // Return the new `t_date`
            t_date new_date = t_date(year_int, month_int, day_int);
            rval.set(new_date);
        } break;
        case DTYPE_TIME: {
            // Convert the int64 to a milliseconds duration timestamp
            std::chrono::milliseconds timestamp(val.to_int64());

            // Convert the timestamp to a `sys_time` (alias for
            // `time_point`)
            date::sys_time<std::chrono::milliseconds> ts(timestamp);

            // Convert the timestamp to local time
            std::time_t temp = std::chrono::system_clock::to_time_t(ts);
            std::tm* t = std::localtime(&temp);

            // Take the ymd from the `tm`, now in local time, and create a
            // date::year_month_day.
            date::year year{1900 + t->tm_year};

            // date::month is [1-12], whereas `std::tm::tm_mon` is [0-11]
            date::month month{static_cast<std::uint32_t>(t->tm_mon) + 1};
            date::day day{static_cast<std::uint32_t>(t->tm_mday)};
            date::year_month_day ymd(year, month, day);

            // Convert to a `sys_days` representing no. of days since epoch
            date::sys_days days_since_epoch = ymd;

            // Subtract Sunday from the ymd to get the beginning of the last
            // day
            ymd = days_since_epoch
                - (date::weekday{days_since_epoch} - date::Monday);

            // Get the day of month and day of the week
            std::int32_t year_int = static_cast<std::int32_t>(ymd.year());

            // date::month is [1-12], whereas `t_date.month()` is [0-11]
            std::uint32_t month_int =
                static_cast<std::uint32_t>(ymd.month()) - 1;
            std::uint32_t day_int = static_cast<std::uint32_t>(ymd.day());

            // Return the new `t_date`
            t_date new_date = t_date(year_int, month_int, day_int);
            rval.set(new_date);
        } break;
        default:
            break;
    }
}

void
_month_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity) {
    switch (val.get_dtype()) {
        case DTYPE_DATE: {
            t_date date_val = val.get<t_date>();
            auto in_month = date_val.month();
            int8_t out_month =
                floor(static_cast<double>(in_month) / multiplicity)
                * multiplicity;
            rval.set(t_date(date_val.year(), out_month, 1));
        } break;
        case DTYPE_TIME: {
            // Convert the int64 to a milliseconds duration
            // timestamp
            std::chrono::milliseconds ms_timestamp(val.to_int64());

            // Convert the timestamp to a `sys_time` (alias for
            // `time_point`)
            date::sys_time<std::chrono::milliseconds> ts(ms_timestamp);

            // Convert the timestamp to local time
            std::time_t temp = std::chrono::system_clock::to_time_t(ts);
            std::tm* t = std::localtime(&temp);

            // Use the `tm` to create the `t_date`
            auto year = static_cast<std::int32_t>(t->tm_year + 1900);
            std::int32_t month = static_cast<std::uint32_t>(t->tm_mon);
            if (multiplicity != 1) {
                month = floor(static_cast<double>(month) / multiplicity)
                    * multiplicity;
            }
            rval.set(t_date(year, month, 1));
        } break;
        default:
            break;
    }
}

void
_year_bucket(t_tscalar& val, t_tscalar& rval, t_uindex multiplicity) {
    switch (val.get_dtype()) {
        case DTYPE_DATE: {
            t_date date_val = val.get<t_date>();
            rval.set(t_date(
                floor(static_cast<double>(date_val.year()) / multiplicity)
                    * multiplicity,
                0,
                1
            ));
        } break;
        case DTYPE_TIME: {
            // Convert the int64 to a milliseconds duration timestamp
            std::chrono::milliseconds ms_timestamp(val.to_int64());

            // Convert the timestamp to a `sys_time` (alias for
            // `time_point`)
            date::sys_time<std::chrono::milliseconds> ts(ms_timestamp);

            // Convert the timestamp to local time
            std::time_t temp = std::chrono::system_clock::to_time_t(ts);
            std::tm* t = std::localtime(&temp);

            // Use the `tm` to create the `t_date`
            auto year = static_cast<std::int32_t>(t->tm_year + 1900);
            if (multiplicity != 1) {
                year = floor(static_cast<double>(year) / multiplicity)
                    * multiplicity;
            }
            rval.set(t_date(year, 0, 1));
        } break;
        default:
            break;
    }
}

t_tscalar
now() {
    t_tscalar rval;
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
                   std::chrono::system_clock::now().time_since_epoch()
    )
                   .count();
    rval.set(t_time(now));
    return rval;
}

t_tscalar
today() {
    t_tscalar rval;

    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    );

    // Convert the timestamp to a `sys_time` (alias for `time_point`)
    date::sys_time<std::chrono::milliseconds> ts(now);

    // Use localtime so that the day of week is consistent with all output
    // datetimes, which are in local time
    std::time_t temp = std::chrono::system_clock::to_time_t(ts);

    // Convert to a std::tm
    std::tm* t = std::localtime(&temp);

    // Get the year and create a new `t_date`
    auto year = static_cast<std::int32_t>(t->tm_year + 1900);

    // Month in `t_date` is [0-11]
    std::int32_t month = static_cast<std::uint32_t>(t->tm_mon);
    auto day = static_cast<std::uint32_t>(t->tm_mday);

    rval.set(t_date(year, month, day));
    return rval;
}

inrange_fn::inrange_fn() : exprtk::igeneric_function<t_tscalar>("TTT") {}

inrange_fn::~inrange_fn() = default;

t_tscalar
inrange_fn::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    t_scalar_view _low(parameters[0]);
    t_scalar_view _val(parameters[1]);
    t_scalar_view _high(parameters[2]);

    t_tscalar low = _low();
    t_tscalar val = _val();
    t_tscalar high = _high();

    // make sure we are comparing items of the same type, otherwise
    // comparisons will fail.
    t_dtype val_dtype = val.get_dtype();

    if (low.get_dtype() != val_dtype || val_dtype != high.get_dtype()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // no need to type check - just check validity
    if (!low.is_valid() || !val.is_valid() || !high.is_valid()) {
        return rval;
    }

    rval.set((low <= val) && (val <= high));
    return rval;
}

min_fn::min_fn() = default;

min_fn::~min_fn() = default;

t_tscalar
min_fn::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;

    std::vector<t_tscalar> inputs;
    inputs.resize(parameters.size());

    // type check through all parameters first before calculating
    for (auto i = 0; i < parameters.size(); ++i) {
        t_generic_type& gt = parameters[i];

        if (gt.type == t_generic_type::e_scalar) {
            t_scalar_view _temp(gt);
            t_tscalar temp = _temp();

            if (!temp.is_numeric()) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            } // correct type - we will check for STATUS_VALID later
            inputs[i] = temp;
            continue;

        } // An invalid call - needs to fail at the type check.
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // types are now valid - we can calculate the value
    for (auto i = 0; i < inputs.size(); ++i) {
        const t_tscalar& val = inputs[i];

        // correct type input but invalid - return
        if (!val.is_valid()) {
            return rval;
        }

        if (i == 0 || (val.to_double() < rval.to_double())) {
            rval.set(val.to_double());
        }
    }

    return rval;
}

max_fn::max_fn() = default;

max_fn::~max_fn() = default;

t_tscalar
max_fn::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;

    std::vector<t_tscalar> inputs;
    inputs.resize(parameters.size());

    // type check through all parameters first before calculating
    for (auto i = 0; i < parameters.size(); ++i) {
        t_generic_type& gt = parameters[i];

        if (gt.type == t_generic_type::e_scalar) {
            t_scalar_view _temp(gt);
            t_tscalar temp = _temp();

            if (!temp.is_numeric()) {
                rval.m_status = STATUS_CLEAR;
                return rval;
            } // correct type - we will check for STATUS_VALID later
            inputs[i] = temp;
            continue;

        } // An invalid call - needs to fail at the type check.
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // types are now valid - we can calculate the value
    for (auto i = 0; i < inputs.size(); ++i) {
        const t_tscalar& val = inputs[i];

        // correct type input but invalid - return
        if (!val.is_valid()) {
            return rval;
        }

        if (i == 0 || (val.to_double() > rval.to_double())) {
            rval.set(val.to_double());
        }
    }

    return rval;
}

coalesce::coalesce() = default;

coalesce::~coalesce() = default;

t_tscalar
coalesce::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();

    if (parameters.size() == 0) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    std::vector<t_tscalar> inputs;
    inputs.resize(parameters.size());

    // Pass 1: type-check all parameters and resolve the output dtype.
    // Loose matching: any combination of numeric types promotes to FLOAT64,
    // matching the precedent set by min_fn / max_fn. Non-numeric types
    // must share an exact dtype.
    bool all_numeric = true;
    t_dtype first_dtype = DTYPE_NONE;

    for (auto i = 0; i < parameters.size(); ++i) {
        t_generic_type& gt = parameters[i];
        if (gt.type != t_generic_type::e_scalar) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        t_scalar_view _temp(gt);
        t_tscalar temp = _temp();
        inputs[i] = temp;

        auto dt = static_cast<t_dtype>(temp.m_type);
        bool numeric = is_numeric_type(dt);

        if (i == 0) {
            first_dtype = dt;
            all_numeric = numeric;
        } else if (all_numeric && numeric) {
            // both numeric so far - stays in promotion path
        } else if (!all_numeric && dt == first_dtype) {
            // exact-match path for non-numeric types
        } else {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }
    }

    rval.m_type = all_numeric ? DTYPE_FLOAT64 : first_dtype;

    // Pass 2: return the first valid, non-none scalar. During the type-
    // validation pass all inputs are STATUS_INVALID sentinels, so this
    // loop falls through and returns rval with the resolved dtype and
    // STATUS_INVALID, which the validator accepts.
    for (auto i = 0; i < inputs.size(); ++i) {
        const t_tscalar& val = inputs[i];
        if (val.is_valid() && !val.is_none()) {
            if (all_numeric) {
                rval.set(val.to_double());
            } else {
                rval.set(val);
            }
            return rval;
        }
    }

    return rval;
}

diff3::diff3() : exprtk::igeneric_function<t_tscalar>("VVV") {}

diff3::~diff3() = default;

t_tscalar
diff3::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    t_vector_view v1(parameters[0]);
    t_vector_view v2(parameters[1]);
    t_vector_view out(parameters[2]);

    if (v1.size() < 3 || v2.size() < 3 || out.size() < 3) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    t_tscalar o1;
    o1.set(v1[0] - v2[0]);

    t_tscalar o2;
    o2.set(v1[1] - v2[1]);

    t_tscalar o3;
    o3.set(v1[2] - v2[2]);

    out[0] = o1;
    out[1] = o2;
    out[2] = o3;

    rval.set(true);
    return rval;
}

norm3::norm3() : exprtk::igeneric_function<t_tscalar>("V") {}

norm3::~norm3() = default;

t_tscalar
norm3::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;
    t_vector_view v1(parameters[0]);
    if (v1.size() < 3) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }
    double a = v1[0].to_double();
    double b = v1[1].to_double();
    double c = v1[2].to_double();
    rval.set(sqrt(pow(a, 2) + pow(b, 2) + pow(c, 2)));
    return rval;
}

cross_product3::cross_product3() :
    exprtk::igeneric_function<t_tscalar>("VVV") {}

cross_product3::~cross_product3() = default;

t_tscalar
cross_product3::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    // Parameters already validated
    t_vector_view v1(parameters[0]);
    t_vector_view v2(parameters[1]);
    t_vector_view out(parameters[2]);

    if (v1.size() < 3 || v2.size() < 3 || out.size() < 3) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    // a2 * b3 - a3 * b2
    t_tscalar o1;
    o1.set(v1[1] * v2[2] - v1[2] * v2[1]);

    // a3 * b1 - a1 * b3,
    t_tscalar o2;
    o2.set(v1[2] * v2[0] - v1[0] * v2[2]);

    // a1 * b2 - a2 * b1
    t_tscalar o3;
    o3.set(v1[0] * v2[1] - v1[1] * v2[0]);

    out[0] = o1;
    out[1] = o2;
    out[2] = o3;

    rval.set(true);
    return rval;
}

dot_product3::dot_product3() : exprtk::igeneric_function<t_tscalar>("VV") {}

dot_product3::~dot_product3() = default;

t_tscalar
dot_product3::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;

    // Parameters already validated
    t_vector_view v1(parameters[0]);
    t_vector_view v2(parameters[1]);

    if (v1.size() < 3 || v2.size() < 3) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    rval.set(v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]);
    return rval;
}

percent_of::percent_of() : exprtk::igeneric_function<t_tscalar>("TT") {}

percent_of::~percent_of() = default;

t_tscalar
percent_of::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();

    // Return a float so we can use it in conditionals
    rval.m_type = DTYPE_FLOAT64;

    t_generic_type& _x = parameters[0];
    t_generic_type& _y = parameters[1];

    t_scalar_view _x_view(_x);
    t_scalar_view _y_view(_y);

    t_tscalar x = _x_view();
    t_tscalar y = _y_view();

    if (!x.is_numeric() || !y.is_numeric()) {
        rval.m_status = STATUS_CLEAR;
    }

    if (!x.is_valid() || !y.is_valid()) {
        return rval;
    }

    if (y.to_double() == 0) {
        return rval;
    }

    rval.set((x.to_double() / y.to_double()) * 100);
    return rval;
}

is_null::is_null() : exprtk::igeneric_function<t_tscalar>("T") {}

is_null::~is_null() = default;

t_tscalar
is_null::operator()(t_parameter_list parameters) {
    t_tscalar val;

    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    val.set(temp());

    rval.set(val.is_none() || !val.is_valid());
    return rval;
}

is_not_null::is_not_null() : exprtk::igeneric_function<t_tscalar>("T") {}

is_not_null::~is_not_null() = default;

t_tscalar
is_not_null::operator()(t_parameter_list parameters) {
    t_tscalar val;

    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    val.set(temp());
    rval.set(!val.is_none() && val.is_valid());

    return rval;
}

to_string::to_string(
    t_expression_vocab& expression_vocab, bool is_type_validator
) :
    exprtk::igeneric_function<t_tscalar>("T"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator) {
    t_tscalar sentinel;
    sentinel.clear();
    sentinel.set(m_expression_vocab.get_empty_string());
    sentinel.m_status = STATUS_INVALID;
    m_sentinel = sentinel;
}

to_string::~to_string() = default;

t_tscalar
to_string::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_STR;
    std::string temp_str;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    if (temp().get_dtype() == DTYPE_NONE) {
        return rval;
    }

    val.set(temp());

    if (!val.is_valid()) {
        return rval;
    }

    temp_str = val.to_string();

    // don't try to intern an empty string as it will throw an error, but
    // by this point we know the params are valid - so return the sentinel
    // string value.
    if (temp_str.empty() || m_is_type_validator) {
        return m_sentinel;
    }

    rval.set(m_expression_vocab.intern(temp_str));
    return rval;
}

to_integer::to_integer() : exprtk::igeneric_function<t_tscalar>("T") {}

to_integer::~to_integer() = default;

t_tscalar
to_integer::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar rval;
    rval.clear();

    // Use 32-bit integers for WASM
#if defined PSP_ENABLE_WASM && !defined(PSP_ENABLE_PYTHON)
    rval.m_type = DTYPE_INT32;
#else
    rval.m_type = DTYPE_INT64;
#endif

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    if (temp().get_dtype() == DTYPE_NONE) {
        return rval;
    }

    val.set(temp());

    if (!val.is_valid()) {
        return rval;
    }

    double number = 0;

    // Parse numbers inside strings
    if (val.get_dtype() == DTYPE_STR) {
        std::stringstream ss(val.to_string());
        ss >> number;

        if (ss.fail()) {
            return rval;
        }
    } else {
        number = val.to_double();
    }

#if defined(PSP_ENABLE_WASM) && !defined(PSP_ENABLE_PYTHON)
    // check for overflow
    if (number > std::numeric_limits<std::int32_t>::max()
        || number < std::numeric_limits<std::int32_t>::min()) {
        return rval;
    }

    rval.set(static_cast<std::int32_t>(number));
#else
    rval.set(static_cast<std::int64_t>(number));
#endif

    return rval;
}

to_float::to_float() : exprtk::igeneric_function<t_tscalar>("T") {}

to_float::~to_float() = default;

t_tscalar
to_float::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_FLOAT64;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    if (temp().get_dtype() == DTYPE_NONE) {
        return rval;
    }

    val.set(temp());
    if (!val.is_valid()) {
        return rval;
    }

    double number = 0;

    // Parse numbers inside strings
    if (val.get_dtype() == DTYPE_STR) {
        std::stringstream ss(val.to_string());
        ss >> number;

        if (ss.fail()) {
            return rval;
        }
    } else {
        number = val.to_double();
    }

    // Don't allow NaN to leak
    if (std::isnan(number)) {
        return rval;
    }

    rval.set(number);
    return rval;
}

to_boolean::to_boolean() : exprtk::igeneric_function<t_tscalar>("T") {}

to_boolean::~to_boolean() = default;

t_tscalar
to_boolean::operator()(t_parameter_list parameters) {
    t_tscalar val;
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_BOOL;

    const t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    if (temp().get_dtype() == DTYPE_NONE) {
        return rval;
    }

    val.set(temp());

    // handles STATUS_VALID, so no need to check separately
    rval.set(val.as_bool());

    if (!val.is_valid()) {
        return rval;
    }

    return rval;
}

make_date::make_date() : exprtk::igeneric_function<t_tscalar>("TTT") {}

make_date::~make_date() = default;

t_tscalar
make_date::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_DATE;

    // 0 = year, 1 = month, 2 = day
    std::int32_t values[3]{0};

    for (auto i = 0; i < parameters.size(); ++i) {
        t_generic_type& gt = parameters[i];
        t_scalar_view temp(gt);
        t_tscalar temp_scalar;

        temp_scalar.set(temp());

        if (!temp_scalar.is_numeric()) {
            rval.m_status = STATUS_CLEAR;
            return rval;
        }

        if (!temp_scalar.is_valid()) {
            return rval;
        }

        std::int32_t value = temp_scalar.to_double();
        values[i] = value;
    }

    // Disallow negative values
    if (values[0] < 0 || values[1] <= 0 || values[1] > 12 || values[2] <= 0
        || values[2] > 31) {
        return rval;
    }

    // month is 0-11 in t_date
    rval.set(t_date(values[0], values[1] - 1, values[2]));
    return rval;
}

make_datetime::make_datetime() : exprtk::igeneric_function<t_tscalar>("T") {}

make_datetime::~make_datetime() = default;

t_tscalar
make_datetime::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.m_type = DTYPE_TIME;

    t_generic_type& gt = parameters[0];
    t_scalar_view temp(gt);
    if (temp().get_dtype() == DTYPE_NONE) {
        return rval;
    }

    t_tscalar temp_scalar;

    temp_scalar.set(temp());
    t_dtype dtype = temp_scalar.get_dtype();

    if (dtype != DTYPE_INT64 && dtype != DTYPE_FLOAT64) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!temp_scalar.is_valid()) {
        return rval;
    }

    std::int64_t timestamp = temp_scalar.to_double();
    rval.set(t_time(timestamp));
    return rval;
}

index::index(
    const t_gstate::t_mapping& pkey_map,
    std::shared_ptr<t_data_table> source_table,
    t_uindex& row_idx
) :
    exprtk::igeneric_function<t_tscalar>("Z"),
    m_pkey_map(pkey_map),
    m_source_table(std::move(std::move(source_table))),
    m_row_idx(row_idx) {}

index::~index() = default;

t_tscalar
index::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();

    auto col = m_source_table->get_const_column("psp_okey");
    auto res = col->get_scalar(m_row_idx);
    rval.set(res);

    return rval;
}

col::col(
    t_expression_vocab& expression_vocab,
    bool is_type_validator,
    std::shared_ptr<t_data_table> source_table,
    t_uindex& row_idx
) :
    exprtk::igeneric_function<t_tscalar>("T"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator),
    m_source_table(std::move(std::move(source_table))),
    m_row_idx(row_idx) {}
col::~col() = default;

t_tscalar
col::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();

    t_scalar_view _colname_view(parameters[0]);
    t_tscalar _colname = _colname_view();
    std::string temp_str = _colname.to_string();

    if (_colname.get_dtype() != DTYPE_STR) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!m_source_table->get_schema().has_column(temp_str)) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }
    auto col = m_source_table->get_const_column(temp_str);
    auto res = col->get_scalar(m_row_idx);
    rval.set(res);
    rval.m_type = col->get_dtype();

    return rval;
}

vlookup::vlookup(
    t_expression_vocab& expression_vocab,
    bool is_type_validator,
    std::shared_ptr<t_data_table> source_table,
    t_uindex& row_idx
) :
    exprtk::igeneric_function<t_tscalar>("TT"),
    m_expression_vocab(expression_vocab),
    m_is_type_validator(is_type_validator),
    m_source_table(std::move(std::move(source_table))),
    m_row_idx(row_idx) {}
vlookup::~vlookup() = default;

t_tscalar
vlookup::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();

    t_generic_type& column_gt = parameters[0];
    t_scalar_view column_gt_view(column_gt);
    t_tscalar column_name;

    column_name.set(column_gt_view());
    t_dtype column_name_dtype = column_name.get_dtype();

    t_generic_type& index_gt = parameters[1];
    t_scalar_view index_gt_view(index_gt);
    t_tscalar index;

    index.set(index_gt_view());

    auto pkey_col = m_source_table->get_const_column("psp_pkey");

    if (column_name_dtype != DTYPE_STR
        || index.get_dtype() != pkey_col->get_dtype()) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }

    if (!column_name.is_valid()) {
        return rval;
    }

    std::string col_name_str = column_name.to_string();
    if (!m_source_table->get_schema().has_column(col_name_str)) {
        rval.m_status = STATUS_CLEAR;
        return rval;
    }
    auto col = m_source_table->get_const_column(col_name_str);

    if (m_is_type_validator) {
        rval.m_status = STATUS_VALID;
        rval.m_type = col->get_dtype();
        return rval;
    }

    auto idx = index.to_uint64();
    if (idx < col->size()) {
        auto res = col->get_scalar(idx);
        rval.set(res);
    }
    rval.m_type = col->get_dtype();

    return rval;
}

// Set up random number generator
std::default_random_engine random::RANDOM_ENGINE = std::default_random_engine();
std::uniform_real_distribution<double> random::DISTRIBUTION =
    std::uniform_real_distribution<double>(0, 1);

random::random() : exprtk::igeneric_function<t_tscalar>("Z") {}

random::~random() = default;

t_tscalar
random::operator()(t_parameter_list parameters) {
    t_tscalar rval;
    rval.clear();
    rval.set(random::DISTRIBUTION(random::RANDOM_ENGINE));
    return rval;
}
} // namespace perspective::computed_function
  // end namespace perspective