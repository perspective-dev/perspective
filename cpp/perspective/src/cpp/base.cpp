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
#include <perspective/base.h>
#include <cstdint>
#include <limits>
#include <perspective/exception.h>

namespace perspective {

void
psp_abort(const std::string& message) {
    throw PerspectiveException(message.c_str());
}

bool
is_numeric_type(t_dtype dtype) {
    switch (dtype) {
        case DTYPE_UINT8:
        case DTYPE_UINT16:
        case DTYPE_UINT32:
        case DTYPE_UINT64:
        case DTYPE_INT8:
        case DTYPE_INT16:
        case DTYPE_INT32:
        case DTYPE_INT64:
        case DTYPE_FLOAT32:
        case DTYPE_FLOAT64: {
            return true;
        } break;
        default: {
            return false;
        }
    }
}

bool
is_linear_order_type(t_dtype dtype) {
    switch (dtype) {
        case DTYPE_UINT8:
        case DTYPE_UINT16:
        case DTYPE_UINT32:
        case DTYPE_UINT64:
        case DTYPE_INT8:
        case DTYPE_INT16:
        case DTYPE_INT32:
        case DTYPE_INT64:
        case DTYPE_FLOAT32:
        case DTYPE_FLOAT64:
        case DTYPE_DATE:
        case DTYPE_TIME:
        case DTYPE_BOOL: {
            return true;
        } break;
        default: {
            return false;
        }
    }
}

bool
is_floating_point(t_dtype dtype) {
    return (dtype == DTYPE_FLOAT32 || dtype == DTYPE_FLOAT64);
}

bool
is_deterministic_sized(t_dtype dtype) {
    switch (dtype) {
        case DTYPE_OBJECT:
        case DTYPE_INT64:
        case DTYPE_UINT64:
        case DTYPE_INT32:
        case DTYPE_UINT32:
        case DTYPE_INT16:
        case DTYPE_UINT16:
        case DTYPE_BOOL:
        case DTYPE_INT8:
        case DTYPE_UINT8:
        case DTYPE_FLOAT64:
        case DTYPE_FLOAT32:
        case DTYPE_STR:
        case DTYPE_TIME:
        case DTYPE_DATE:
        case DTYPE_F64PAIR: {
            return true;
        }
        default: {
            return false;
        }
    }

    PSP_COMPLAIN_AND_ABORT("Reached unreachable");
    return false;
}

t_uindex
get_dtype_size(t_dtype dtype) {
    switch (dtype) {
        case DTYPE_OBJECT: {
            return sizeof(void*);
        }
        case DTYPE_INT64:
        case DTYPE_UINT64: {
            return sizeof(std::int64_t);
        }
        case DTYPE_INT32:
        case DTYPE_UINT32: {
            return sizeof(std::int32_t);
        }
        case DTYPE_INT16:
        case DTYPE_UINT16: {
            return 2;
        }
        case DTYPE_BOOL:
        case DTYPE_INT8:
        case DTYPE_UINT8:
        case DTYPE_NONE: {
            return 1;
        }
        case DTYPE_FLOAT64: {
            return sizeof(double);
        }
        case DTYPE_FLOAT32: {
            return sizeof(float);
        }
        case DTYPE_STR: {
            return sizeof(t_uindex);
        }
        case DTYPE_TIME: {
            return sizeof(std::int64_t);
        }
        case DTYPE_DATE: {
            return sizeof(std::uint32_t);
        }
        case DTYPE_F64PAIR: {
            return sizeof(std::pair<double, double>);
        }
        default: {
            PSP_COMPLAIN_AND_ABORT("Unknown dtype");
        }
    }

    PSP_COMPLAIN_AND_ABORT("Reached unreachable");
    return sizeof(DTYPE_INT64);
}

bool
is_vlen_dtype(t_dtype dtype) {
    return dtype == DTYPE_STR || dtype == DTYPE_USER_VLEN;
}

std::string
get_dtype_descr(t_dtype dtype) {
    switch (dtype) {
        case DTYPE_NONE: {
            return "none";
        } break;
        case DTYPE_INT64: {
            return "int64";
        } break;
        case DTYPE_INT32: {
            return "int32";
        } break;
        case DTYPE_INT16: {
            return "int16";
        } break;
        case DTYPE_INT8: {
            return "int8";
        } break;
        case DTYPE_UINT64: {
            return "uint64";
        } break;
        case DTYPE_UINT32: {
            return "uint32";
        } break;
        case DTYPE_UINT16: {
            return "uint16";
        } break;
        case DTYPE_UINT8: {
            return "uint8";
        } break;
        case DTYPE_BOOL: {
            return "bool";
        } break;
        case DTYPE_FLOAT64: {
            return "float64";
        } break;
        case DTYPE_FLOAT32: {
            return "float32";
        } break;
        case DTYPE_STR: {
            return "str";
        } break;
        case DTYPE_TIME: {
            return "datetime";
        } break;
        case DTYPE_DATE: {
            return "date";
        } break;
        case DTYPE_ENUM: {
            return "e";
        } break;
        case DTYPE_OID: {
            return "oid";
        } break;
        case DTYPE_USER_FIXED: {
            return "ufix";
        } break;
        case DTYPE_LAST: {
            return "last";
        } break;
        case DTYPE_USER_VLEN: {
            return "uvlen";
        } break;
        case DTYPE_F64PAIR: {
            return "f64pair";
        } break;
        case DTYPE_OBJECT: {
            return "object";
        }
        default: {
            PSP_COMPLAIN_AND_ABORT("Encountered unknown dtype");
        }
    }
    return {"dummy"};
}

std::string
dtype_to_str(t_dtype dtype) {
    std::stringstream ss;
    switch (dtype) {
        case DTYPE_FLOAT32:
        case DTYPE_FLOAT64: {
            ss << "float";
        } break;
        case DTYPE_UINT8:
        case DTYPE_UINT16:
        case DTYPE_UINT32:
        case DTYPE_UINT64:
        case DTYPE_INT8:
        case DTYPE_INT16:
        case DTYPE_INT32:
        case DTYPE_INT64: {
            ss << "integer";
        } break;
        case DTYPE_BOOL: {
            ss << "boolean";
        } break;
        case DTYPE_DATE: {
            ss << "date";
        } break;
        case DTYPE_TIME: {
            ss << "datetime";
        } break;
        case DTYPE_STR: {
            ss << "string";
        } break;
        case DTYPE_OBJECT: {
            ss << "object";
        } break;
        case DTYPE_NONE: {
            ss << "none";
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Cannot convert unknown dtype to string!");
        }
    }

    return ss.str();
}

t_dtype
str_to_dtype(const std::string& typestring) {
    // returns most commonly used types in the JS/python public APIs.
    if (typestring == "integer") {
        return DTYPE_INT32;
    }
    if (typestring == "float") {
        return DTYPE_FLOAT64;
    }
    if (typestring == "boolean") {
        return DTYPE_BOOL;
    }
    if (typestring == "date") {
        return DTYPE_DATE;
    }
    if (typestring == "datetime") {
        return DTYPE_TIME;
    }
    if (typestring == "string") {
        return DTYPE_STR;
    }

    PSP_COMPLAIN_AND_ABORT(
        "Could not convert unknown type string `" + typestring + "` to dtype."
    );
    return DTYPE_NONE;
}

std::string
filter_op_to_str(t_filter_op op) {
    switch (op) {
        case FILTER_OP_LT: {
            return "<";
        } break;
        case FILTER_OP_LTEQ: {
            return "<=";
        } break;
        case FILTER_OP_GT: {
            return ">";
        } break;
        case FILTER_OP_GTEQ: {
            return ">=";
        } break;
        case FILTER_OP_EQ: {
            return "==";
        } break;
        case FILTER_OP_NE: {
            return "!=";
        } break;
        case FILTER_OP_BEGINS_WITH: {
            return "startswith";
        } break;
        case FILTER_OP_ENDS_WITH: {
            return "endswith";
        } break;
        case FILTER_OP_CONTAINS: {
            return "contains";
        } break;
        case FILTER_OP_OR: {
            return "or";
        } break;
        case FILTER_OP_IN: {
            return "in";
        } break;
        case FILTER_OP_NOT_IN: {
            return "not in";
        } break;
        case FILTER_OP_AND: {
            return "and";
        } break;
        case FILTER_OP_IS_NULL: {
            return "is null";
        } break;
        case FILTER_OP_IS_NOT_NULL: {
            return "is not null";
        } break;
    }
    PSP_COMPLAIN_AND_ABORT("Reached end of function");
    return "";
}

t_filter_op
str_to_filter_op(const std::string& str) {
    if (str == "<") {
        return t_filter_op::FILTER_OP_LT;
    }
    if (str == "<=") {
        return t_filter_op::FILTER_OP_LTEQ;
    }
    if (str == ">") {
        return t_filter_op::FILTER_OP_GT;
    }
    if (str == ">=") {
        return t_filter_op::FILTER_OP_GTEQ;
    }
    if (str == "==") {
        return t_filter_op::FILTER_OP_EQ;
    }
    if (str == "!=") {
        return t_filter_op::FILTER_OP_NE;
    }
    if (str == "begins with" || str == "startswith") {
        return t_filter_op::FILTER_OP_BEGINS_WITH;
    }
    if (str == "ends with" || str == "endswith") {
        return t_filter_op::FILTER_OP_ENDS_WITH;
    }
    if (str == "in") {
        return t_filter_op::FILTER_OP_IN;
    }
    if (str == "contains") {
        return t_filter_op::FILTER_OP_CONTAINS;
    }
    if (str == "not in") {
        return t_filter_op::FILTER_OP_NOT_IN;
    }
    if (str == "&" || str == "and") {
        return t_filter_op::FILTER_OP_AND;
    }
    if (str == "|" || str == "or") {
        return t_filter_op::FILTER_OP_OR;
    }
    if (str == "is null" || str == "is None") {
        return t_filter_op::FILTER_OP_IS_NULL;
    }
    if (str == "is not null" || str == "is not None") {
        return t_filter_op::FILTER_OP_IS_NOT_NULL;
    }

    std::stringstream ss;
    ss << "Unknown filter operator string: `" << str << std::endl;
    PSP_COMPLAIN_AND_ABORT(ss.str());
    return t_filter_op::FILTER_OP_AND;
}

t_sorttype
str_to_sorttype(const std::string& str) {
    if (str == "none") {
        return SORTTYPE_NONE;
    }
    if (str == "asc" || str == "col asc") {
        return SORTTYPE_ASCENDING;
    }
    if (str == "desc" || str == "col desc") {
        return SORTTYPE_DESCENDING;
    }
    if (str == "asc abs" || str == "col asc abs") {
        return SORTTYPE_ASCENDING_ABS;
    }
    if (str == "desc abs" || str == "col desc abs") {
        return SORTTYPE_DESCENDING_ABS;
    }

    std::stringstream ss;
    ss << "Unknown sort type string: `" << str << std::endl;
    PSP_COMPLAIN_AND_ABORT(ss.str());
    return SORTTYPE_DESCENDING;
}

std::string
sorttype_to_str(t_sorttype type) {
    switch (type) {
        case SORTTYPE_NONE: {
            return "none";
        } break;
        case SORTTYPE_ASCENDING: {
            return "asc";
        } break;
        case SORTTYPE_DESCENDING: {
            return "desc";
        } break;
        case SORTTYPE_ASCENDING_ABS: {
            return "asc abs";
        } break;
        case SORTTYPE_DESCENDING_ABS: {
            return "desc abs";
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unknown sort type");
        }
    }
}

t_aggtype
str_to_aggtype(const std::string& str) {
    if (str == "distinct count" || str == "distinctcount" || str == "distinct"
        || str == "distinct_count") {
        return t_aggtype::AGGTYPE_DISTINCT_COUNT;
    }
    if (str == "sum") {
        return t_aggtype::AGGTYPE_SUM;
    }
    if (str == "mul") {
        return t_aggtype::AGGTYPE_MUL;
    }
    if (str == "avg" || str == "mean") {
        return t_aggtype::AGGTYPE_MEAN;
    }
    if (str == "count") {
        return t_aggtype::AGGTYPE_COUNT;
    }
    if (str == "weighted mean" || str == "weighted_mean") {
        return t_aggtype::AGGTYPE_WEIGHTED_MEAN;
    }
    if (str == "unique") {
        return t_aggtype::AGGTYPE_UNIQUE;
    }
    if (str == "any") {
        return t_aggtype::AGGTYPE_ANY;
    }
    if (str == "median") {
        return t_aggtype::AGGTYPE_MEDIAN;
    }
    if (str == "join") {
        return t_aggtype::AGGTYPE_JOIN;
    }
    if (str == "div") {
        return t_aggtype::AGGTYPE_SCALED_DIV;
    }
    if (str == "add") {
        return t_aggtype::AGGTYPE_SCALED_ADD;
    }
    if (str == "dominant") {
        return t_aggtype::AGGTYPE_DOMINANT;
    }
    if (str == "first by index" || str == "first") {
        return t_aggtype::AGGTYPE_FIRST;
    }
    if (str == "last by index") {
        return t_aggtype::AGGTYPE_LAST_BY_INDEX;
    }
    if (str == "last minus first") {
        return t_aggtype::AGGTYPE_LAST_MINUS_FIRST;
    }
    if (str == "py_agg") {
        return t_aggtype::AGGTYPE_PY_AGG;
    }
    if (str == "and") {
        return t_aggtype::AGGTYPE_AND;
    }
    if (str == "or") {
        return t_aggtype::AGGTYPE_OR;
    }
    if (str == "last" || str == "last_value") {
        return t_aggtype::AGGTYPE_LAST_VALUE;
    }
    if (str == "max") {
        return t_aggtype::AGGTYPE_MAX;
    }
    if (str == "min") {
        return t_aggtype::AGGTYPE_MIN;
    }
    if (str == "high" || str == "high_water_mark") {
        return t_aggtype::AGGTYPE_HIGH_WATER_MARK;
    }
    if (str == "low" || str == "low_water_mark") {
        return t_aggtype::AGGTYPE_LOW_WATER_MARK;
    }
    if (str == "high minus low") {
        return t_aggtype::AGGTYPE_HIGH_MINUS_LOW;
    }
    if (str == "sum abs" || str == "sum_abs") {
        return t_aggtype::AGGTYPE_SUM_ABS;
    }
    if (str == "abs sum" || str == "abs_sum") {
        return t_aggtype::AGGTYPE_ABS_SUM;
    }
    if (str == "sum not null" || str == "sum_not_null") {
        return t_aggtype::AGGTYPE_SUM_NOT_NULL;
    }
    if (str == "mean by count" || str == "mean_by_count") {
        return t_aggtype::AGGTYPE_MEAN_BY_COUNT;
    }
    if (str == "identity") {
        return t_aggtype::AGGTYPE_IDENTITY;
    }
    if (str == "distinct leaf" || str == "distinct_leaf") {
        return t_aggtype::AGGTYPE_DISTINCT_LEAF;
    }
    if (str == "pct sum parent" || str == "pct_sum_parent") {
        return t_aggtype::AGGTYPE_PCT_SUM_PARENT;
    }
    if (str == "pct sum grand total" || str == "pct_sum_grand_total") {
        return t_aggtype::AGGTYPE_PCT_SUM_GRAND_TOTAL;
    }
    if (str.find("udf_combiner_") != std::string::npos) {
        return t_aggtype::AGGTYPE_UDF_COMBINER;
    }
    if (str.find("udf_reducer_") != std::string::npos) {
        return t_aggtype::AGGTYPE_UDF_REDUCER;
    }
    if (str == "var" || str == "variance") {
        return t_aggtype::AGGTYPE_VARIANCE;
    }
    if (str == "stddev" || str == "standard deviation") {
        return t_aggtype::AGGTYPE_STANDARD_DEVIATION;
    }

    std::stringstream ss;
    ss << "Encountered unknown aggregate operation: '" << str << "'"
       << "\n";
    PSP_COMPLAIN_AND_ABORT(ss.str());
    // use any as default
    return t_aggtype::AGGTYPE_ANY;
}

t_aggtype
_get_default_aggregate(t_dtype dtype) {
    t_aggtype agg_op;
    switch (dtype) {
        case DTYPE_FLOAT64:
        case DTYPE_FLOAT32:
        case DTYPE_UINT8:
        case DTYPE_UINT16:
        case DTYPE_UINT32:
        case DTYPE_UINT64:
        case DTYPE_INT8:
        case DTYPE_INT16:
        case DTYPE_INT32:
        case DTYPE_INT64: {
            agg_op = t_aggtype::AGGTYPE_SUM;
        } break;
        default: {
            agg_op = t_aggtype::AGGTYPE_COUNT;
        }
    }
    return agg_op;
}

std::string
_get_default_aggregate_string(t_dtype dtype) {
    std::string agg_op_str;
    switch (dtype) {
        case DTYPE_FLOAT64:
        case DTYPE_FLOAT32:
        case DTYPE_UINT8:
        case DTYPE_UINT16:
        case DTYPE_UINT32:
        case DTYPE_UINT64:
        case DTYPE_INT8:
        case DTYPE_INT16:
        case DTYPE_INT32:
        case DTYPE_INT64: {
            agg_op_str = "sum";
        } break;
        default: {
            agg_op_str = "count";
        }
    }
    return agg_op_str;
}

std::string
get_status_descr(t_status status) {
    switch (status) {
        case STATUS_INVALID: {
            return "i";
        }
        case STATUS_VALID: {
            return "v";
        }
        case STATUS_CLEAR: {
            return "c";
        }
        default: {
            PSP_COMPLAIN_AND_ABORT("Unexpected status found");
        }
    }
    return "";
}

void
check_init(bool init, const char* file, std::int32_t line) {
    PSP_VERBOSE_ASSERT(init, "touching uninited object");
}

bool
is_neq_transition(t_value_transition t) {
    return t > VALUE_TRANSITION_EQ_TT;
}

std::string
value_transition_to_str(t_value_transition t) {
    switch (t) {
        case VALUE_TRANSITION_EQ_FF:
            return "VALUE_TRANSITION_EQ_FF";
        case VALUE_TRANSITION_EQ_TT:
            return "VALUE_TRANSITION_EQ_TT";
        case VALUE_TRANSITION_NEQ_FT:
            return "VALUE_TRANSITION_NEQ_FT";
        case VALUE_TRANSITION_NEQ_TF:
            return "VALUE_TRANSITION_NEQ_TF";
        case VALUE_TRANSITION_NEQ_TT:
            return "VALUE_TRANSITION_NEQ_TT";
        case VALUE_TRANSITION_NEQ_TDF:
            return "VALUE_TRANSITION_NEQ_TDF";
        case VALUE_TRANSITION_NEQ_TDT:
            return "VALUE_TRANSITION_NEQ_TDT";
        case VALUE_TRANSITION_NVEQ_FT:
            return "VALUE_TRANSITION_NVEQ_FT";
        default:
            break;
    }

    PSP_COMPLAIN_AND_ABORT("Unexpected value transition.");
    return "";
}

t_uindex
root_pidx() {
    return std::numeric_limits<t_uindex>::max();
}

bool
is_internal_colname(const std::string& c) {
    return c == std::string("psp_");
}

template <typename T>
t_dtype
type_to_dtype() {
    return DTYPE_NONE;
}

template <>
t_dtype
type_to_dtype<std::int64_t>() {
    return DTYPE_INT64;
}

template <>
t_dtype
type_to_dtype<std::int32_t>() {
    return DTYPE_INT32;
}

template <>
t_dtype
type_to_dtype<std::int16_t>() {
    return DTYPE_INT16;
}

template <>
t_dtype
type_to_dtype<std::int8_t>() {
    return DTYPE_INT8;
}

template <>
t_dtype
type_to_dtype<std::uint64_t>() {
    return DTYPE_UINT64;
}

template <>
t_dtype
type_to_dtype<std::uint32_t>() {
    return DTYPE_UINT32;
}

template <>
t_dtype
type_to_dtype<std::uint16_t>() {
    return DTYPE_UINT16;
}

template <>
t_dtype
type_to_dtype<std::uint8_t>() {
    return DTYPE_UINT8;
}

template <>
t_dtype
type_to_dtype<double>() {
    return DTYPE_FLOAT64;
}

template <>
t_dtype
type_to_dtype<float>() {
    return DTYPE_FLOAT32;
}

template <>
t_dtype
type_to_dtype<bool>() {
    return DTYPE_BOOL;
}

template <>
t_dtype
type_to_dtype<t_time>() {
    return DTYPE_TIME;
}

template <>
t_dtype
type_to_dtype<t_date>() {
    return DTYPE_DATE;
}

template <>
t_dtype
type_to_dtype<std::string>() {
    return DTYPE_STR;
}

template <>
t_dtype
type_to_dtype<void*>() {
    return DTYPE_OBJECT;
}

} // end namespace perspective

namespace std {

void
string_to_lower(string& str) {
    transform(str.begin(), str.end(), str.begin(), ::tolower);
}

} // namespace std
