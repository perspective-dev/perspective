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
#include <perspective/aggregate.h>

#include <utility>

namespace perspective {

t_aggregate::t_aggregate(
    const t_dtree& tree,
    t_aggtype aggtype,
    std::vector<std::shared_ptr<const t_column>> icolumns,
    std::shared_ptr<t_column> ocolumn
) :
    m_tree(tree),
    m_aggtype(aggtype),
    m_icolumns(std::move(icolumns)),
    m_ocolumn(std::move(ocolumn)) {}

void
t_aggregate::init() {
    switch (m_aggtype) {
        case AGGTYPE_SUM:
        case AGGTYPE_PCT_SUM_PARENT:
        case AGGTYPE_PCT_SUM_GRAND_TOTAL: {
            switch (m_icolumns[0]->get_dtype()) {
                case DTYPE_INT64: {
                    build_aggregate<t_aggimpl_sum<
                        std::int64_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT32: {
                    build_aggregate<t_aggimpl_sum<
                        std::int32_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT16: {
                    build_aggregate<t_aggimpl_sum<
                        std::int16_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT8: {
                    build_aggregate<
                        t_aggimpl_sum<std::int8_t, std::int64_t, std::int64_t>>(
                    );
                } break;
                case DTYPE_UINT64: {
                    build_aggregate<t_aggimpl_sum<
                        std::uint64_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT32: {
                    build_aggregate<t_aggimpl_sum<
                        std::uint32_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT16: {
                    build_aggregate<t_aggimpl_sum<
                        std::uint16_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT8: {
                    build_aggregate<t_aggimpl_sum<
                        std::uint8_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_FLOAT64: {
                    build_aggregate<t_aggimpl_sum<double, double, double>>();
                } break;
                case DTYPE_FLOAT32: {
                    build_aggregate<t_aggimpl_sum<float, double, double>>();
                } break;
                case DTYPE_BOOL: {
                    build_aggregate<t_aggimpl_sum<
                        std::uint8_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unexpected dtype");
                }
            }
        } break;
        case AGGTYPE_MUL: {
            switch (m_icolumns[0]->get_dtype()) {
                case DTYPE_INT64: {
                    build_aggregate<t_aggimpl_mul<
                        std::int64_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT32: {
                    build_aggregate<t_aggimpl_mul<
                        std::int32_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT16: {
                    build_aggregate<t_aggimpl_mul<
                        std::int16_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT8: {
                    build_aggregate<
                        t_aggimpl_mul<std::int8_t, std::int64_t, std::int64_t>>(
                    );
                } break;
                case DTYPE_UINT64: {
                    build_aggregate<t_aggimpl_mul<
                        std::uint64_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT32: {
                    build_aggregate<t_aggimpl_mul<
                        std::uint32_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT16: {
                    build_aggregate<t_aggimpl_mul<
                        std::uint16_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT8: {
                    build_aggregate<t_aggimpl_mul<
                        std::uint8_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_FLOAT64: {
                    build_aggregate<t_aggimpl_mul<double, double, double>>();
                } break;
                case DTYPE_FLOAT32: {
                    build_aggregate<t_aggimpl_mul<float, double, double>>();
                } break;
                case DTYPE_BOOL: {
                    build_aggregate<t_aggimpl_mul<
                        std::uint8_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unexpected dtype");
                }
            }
        } break;
        case AGGTYPE_COUNT: {
            switch (m_icolumns[0]->get_dtype()) {
                case DTYPE_STR: {
                    build_aggregate<t_aggimpl_count<
                        std::uint64_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_TIME:
                case DTYPE_INT64: {
                    build_aggregate<t_aggimpl_count<
                        std::int64_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_INT32: {
                    build_aggregate<t_aggimpl_count<
                        std::int32_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_INT16: {
                    build_aggregate<t_aggimpl_count<
                        std::int16_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_INT8: {
                    build_aggregate<t_aggimpl_count<
                        std::int8_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT64: {
                    build_aggregate<t_aggimpl_count<
                        std::uint64_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_DATE:
                case DTYPE_UINT32: {
                    build_aggregate<t_aggimpl_count<
                        std::uint32_t,
                        std::uint32_t,
                        std::uint32_t>>();
                } break;
                case DTYPE_UINT16: {
                    build_aggregate<t_aggimpl_count<
                        std::uint16_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_UINT8: {
                    build_aggregate<t_aggimpl_count<
                        std::uint8_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_FLOAT64: {
                    build_aggregate<
                        t_aggimpl_count<double, std::uint64_t, std::uint64_t>>(
                    );
                } break;
                case DTYPE_FLOAT32: {
                    build_aggregate<
                        t_aggimpl_count<float, std::uint64_t, std::uint64_t>>();
                } break;
                case DTYPE_BOOL: {
                    build_aggregate<t_aggimpl_count<
                        std::uint8_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unexpected dtype");
                }
            }
        } break;
        case AGGTYPE_MEAN: {
            switch (m_icolumns[0]->get_dtype()) {
                case DTYPE_INT64: {
                    build_aggregate<t_aggimpl_mean<
                        std::int64_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_INT32: {
                    build_aggregate<t_aggimpl_mean<
                        std::int32_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_INT16: {
                    build_aggregate<t_aggimpl_mean<
                        std::int16_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_INT8: {
                    build_aggregate<t_aggimpl_mean<
                        std::int8_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_UINT64: {
                    build_aggregate<t_aggimpl_mean<
                        std::uint64_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_UINT32: {
                    build_aggregate<t_aggimpl_mean<
                        std::uint32_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_UINT16: {
                    build_aggregate<t_aggimpl_mean<
                        std::uint16_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_UINT8: {
                    build_aggregate<t_aggimpl_mean<
                        std::uint8_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_FLOAT64: {
                    build_aggregate<t_aggimpl_mean<
                        double,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_FLOAT32: {
                    build_aggregate<t_aggimpl_mean<
                        float,
                        std::pair<double, double>,
                        double>>();
                } break;
                case DTYPE_BOOL: {
                    build_aggregate<t_aggimpl_mean<
                        std::uint8_t,
                        std::pair<double, double>,
                        double>>();
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unexpected dtype");
                }
            }
        } break;
        case AGGTYPE_HIGH_WATER_MARK: {
            switch (m_icolumns[0]->get_dtype()) {
                case DTYPE_TIME:
                case DTYPE_INT64: {
                    build_aggregate<t_aggimpl_hwm<
                        std::int64_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT32: {
                    build_aggregate<t_aggimpl_hwm<
                        std::int32_t,
                        std::int32_t,
                        std::int32_t>>();
                } break;
                case DTYPE_INT16: {
                    build_aggregate<t_aggimpl_hwm<
                        std::int16_t,
                        std::int16_t,
                        std::int16_t>>();
                } break;
                case DTYPE_INT8: {
                    build_aggregate<
                        t_aggimpl_hwm<std::int8_t, std::int8_t, std::int8_t>>();
                } break;
                case DTYPE_UINT64: {
                    build_aggregate<t_aggimpl_hwm<
                        std::uint64_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_DATE:
                case DTYPE_UINT32: {
                    build_aggregate<t_aggimpl_hwm<
                        std::uint32_t,
                        std::uint32_t,
                        std::uint32_t>>();
                } break;
                case DTYPE_UINT16: {
                    build_aggregate<t_aggimpl_hwm<
                        std::uint16_t,
                        std::uint16_t,
                        std::uint16_t>>();
                } break;
                case DTYPE_UINT8: {
                    build_aggregate<t_aggimpl_hwm<
                        std::uint8_t,
                        std::uint8_t,
                        std::uint8_t>>();
                } break;
                case DTYPE_FLOAT64: {
                    build_aggregate<t_aggimpl_hwm<double, double, double>>();
                } break;
                case DTYPE_FLOAT32: {
                    build_aggregate<t_aggimpl_hwm<float, float, float>>();
                } break;
                case DTYPE_BOOL: {
                    build_aggregate<t_aggimpl_hwm<
                        std::uint8_t,
                        std::uint8_t,
                        std::uint8_t>>();
                } break;
                case DTYPE_STR: {
                    build_aggregate<
                        t_aggimpl_hwm<const char*, const char*, const char*>>();
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unexpected dtype");
                }
            }
        } break;
        case AGGTYPE_LOW_WATER_MARK: {
            switch (m_icolumns[0]->get_dtype()) {
                case DTYPE_TIME:
                case DTYPE_INT64: {
                    build_aggregate<t_aggimpl_lwm<
                        std::int64_t,
                        std::int64_t,
                        std::int64_t>>();
                } break;
                case DTYPE_INT32: {
                    build_aggregate<t_aggimpl_lwm<
                        std::int32_t,
                        std::int32_t,
                        std::int32_t>>();
                } break;
                case DTYPE_INT16: {
                    build_aggregate<t_aggimpl_lwm<
                        std::int16_t,
                        std::int16_t,
                        std::int16_t>>();
                } break;
                case DTYPE_INT8: {
                    build_aggregate<
                        t_aggimpl_lwm<std::int8_t, std::int8_t, std::int8_t>>();
                } break;
                case DTYPE_UINT64: {
                    build_aggregate<t_aggimpl_lwm<
                        std::uint64_t,
                        std::uint64_t,
                        std::uint64_t>>();
                } break;
                case DTYPE_DATE:
                case DTYPE_UINT32: {
                    build_aggregate<t_aggimpl_lwm<
                        std::uint32_t,
                        std::uint32_t,
                        std::uint32_t>>();
                } break;
                case DTYPE_UINT16: {
                    build_aggregate<t_aggimpl_lwm<
                        std::uint16_t,
                        std::uint16_t,
                        std::uint16_t>>();
                } break;
                case DTYPE_UINT8: {
                    build_aggregate<t_aggimpl_lwm<
                        std::uint8_t,
                        std::uint8_t,
                        std::uint8_t>>();
                } break;
                case DTYPE_FLOAT64: {
                    build_aggregate<t_aggimpl_lwm<double, double, double>>();
                } break;
                case DTYPE_FLOAT32: {
                    build_aggregate<t_aggimpl_lwm<float, float, float>>();
                } break;
                case DTYPE_BOOL: {
                    build_aggregate<t_aggimpl_lwm<
                        std::uint8_t,
                        std::uint8_t,
                        std::uint8_t>>();
                } break;
                case DTYPE_STR: {
                    build_aggregate<
                        t_aggimpl_lwm<const char*, const char*, const char*>>();
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unexpected dtype");
                }
            }
        } break;
        default: {
            // Other aggregates will be filled in later
        }
    }
}
} // end namespace perspective
