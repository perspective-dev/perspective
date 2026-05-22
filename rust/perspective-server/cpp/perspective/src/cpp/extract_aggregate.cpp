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
#include <perspective/extract_aggregate.h>

namespace perspective {

t_tscalar
extract_aggregate(
    const t_aggspec& aggspec,
    const t_column* aggcol,
    t_uindex ridx,
    t_index pridx
) {

    switch (aggspec.agg()) {
        case AGGTYPE_PCT_SUM_PARENT: {
            t_tscalar cv = aggcol->get_scalar(ridx);

            if (pridx == INVALID_INDEX) {
                return mktscalar<double>(100.0);
            }

            double pv = aggcol->get_scalar(pridx).to_double();
            t_tscalar ret;
            if (pv == 0) {
                ret.set(t_none());
            } else {
                ret.set(100.0 * (cv.to_double() / pv));
            }
            return ret;
        } break;
        case AGGTYPE_PCT_SUM_GRAND_TOTAL: {
            t_tscalar cv = aggcol->get_scalar(ridx);
            double pv = aggcol->get_scalar(ROOT_AGGIDX).to_double();
            t_tscalar ret;
            if (pv == 0) {
                ret.set(t_none());
            } else {
                ret.set(100.0 * (cv.to_double() / pv));
            }
            return ret;
        } break;
        case AGGTYPE_SUM:
        case AGGTYPE_SUM_ABS:
        case AGGTYPE_ABS_SUM:
        case AGGTYPE_GMV:
        case AGGTYPE_SUM_NOT_NULL:
        case AGGTYPE_MUL:
        case AGGTYPE_COUNT:
        case AGGTYPE_ANY:
        case AGGTYPE_DOMINANT:
        case AGGTYPE_Q1:
        case AGGTYPE_Q3:
        case AGGTYPE_MEDIAN:
        case AGGTYPE_FIRST:
        case AGGTYPE_AND:
        case AGGTYPE_OR:
        case AGGTYPE_LAST_BY_INDEX:
        case AGGTYPE_LAST_VALUE:
        case AGGTYPE_LAST_MINUS_FIRST:
        case AGGTYPE_MAX:
        case AGGTYPE_MAX_BY:
        case AGGTYPE_MIN_BY:
        case AGGTYPE_MIN:
        case AGGTYPE_HIGH_WATER_MARK:
        case AGGTYPE_LOW_WATER_MARK:
        case AGGTYPE_HIGH_MINUS_LOW:
        case AGGTYPE_SCALED_DIV:
        case AGGTYPE_SCALED_ADD:
        case AGGTYPE_SCALED_MUL:
        case AGGTYPE_UDF_COMBINER:
        case AGGTYPE_UDF_REDUCER:
        case AGGTYPE_JOIN:
        case AGGTYPE_IDENTITY:
        case AGGTYPE_DISTINCT_COUNT:
        case AGGTYPE_DISTINCT_LEAF:
        case AGGTYPE_VARIANCE:
        case AGGTYPE_STANDARD_DEVIATION: {
            t_tscalar rval = aggcol->get_scalar(ridx);
            return rval;
        } break;
        case AGGTYPE_UNIQUE: {
            t_tscalar rval = aggcol->get_scalar(ridx);
            if (!rval.is_valid()) {
                t_tscalar rv;
                rv.set(t_none());
                return rv;
            }
            return rval;
        } break;
        case AGGTYPE_MEAN_BY_COUNT:
        case AGGTYPE_WEIGHTED_MEAN:
        case AGGTYPE_MEAN: {
            const auto* pair = aggcol->get_nth<std::pair<double, double>>(ridx);
            t_tscalar rval;
            double second = pair->second;
            if (second != 0) {
                double mean = pair->first / second;
                rval.set(mean);
            } else {
                rval.set(t_none());
            }
            return rval;
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unexpected agg type");
        }
    }

    return mknone();
}

} // end namespace perspective
