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
#include <perspective/raw_types.h>
#include <perspective/base.h>
#include <perspective/utils.h>
#include <perspective/exports.h>
#include <boost/functional/hash.hpp>
#include <ctime>
#include <sstream>
#include <string>
#include <algorithm>

namespace perspective {
static const std::int32_t CUMULATIVE_DAYS[2][13] = {
    {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365
    } /* Normal years.  */,
    {0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366} /* Leap
                                                                    years.
                                                                    */
};

// In terms of (non-tm based) inputs/outputs, t_date
// represents an instant in time as:
// A year() since year 0AD.
// A month() in the range [1..12].
// A day() of the month in the range [1..31].
class PERSPECTIVE_EXPORT t_date {
public:
    static const std::int32_t YEAR_MASK = 0xFFFF0000;
    static const std::int32_t MONTH_MASK = 0x0000FF00;
    static const std::int32_t DAY_MASK = 0x000000FF;

    static const std::int32_t YEAR_SHIFT = 16;
    static const std::int32_t MONTH_SHIFT = 8;
    static const std::int32_t DAY_SHIFT = 0;

public:
    typedef std::uint32_t t_rawtype;

    t_date();

    /**
     * @brief Construct a new t_date from year, month, and day as integers.
     *
     * @param year an integer representing the year
     * @param month an integer from 0 - 11 representing the month
     * @param day an integer representing the day
     */
    t_date(std::int16_t year, std::int8_t month, std::int8_t day);

    void
    set_year_month_day(std::int16_t year, std::int8_t month, std::int8_t day);

    void set_year(std::int16_t year);
    void set_month(std::int8_t month);
    void set_day(std::int8_t day);

    explicit t_date(std::uint32_t raw_val);

    std::uint32_t raw_value() const;

    // Index such that
    // a.consecutive_day_idx()-b.consecutive_day_idx() is
    // number of days a is after b.
    //(Start point is unspecified, may not be stable and
    // only works for dates after 1900AD.)
    std::int32_t consecutive_day_idx() const;

    /**
     * @brief Milliseconds since the Unix epoch at *UTC* midnight of this
     * calendar date. This is the serialization convention for `date` values
     * (matching Arrow's `date32` day arithmetic) — a `t_date` is a timezone-
     * agnostic calendar day, so the host timezone must never be consulted.
     *
     * @return std::int64_t
     */
    std::int64_t as_epoch_ms() const;

    /**
     * @brief Inverse of `as_epoch_ms`: the UTC calendar date containing
     * epoch `ms`.
     *
     * @return t_date
     */
    static t_date from_epoch_ms(std::int64_t ms);

    friend bool operator<(const t_date& a, const t_date& b);
    friend bool operator<=(const t_date& a, const t_date& b);
    friend bool operator>(const t_date& a, const t_date& b);
    friend bool operator>=(const t_date& a, const t_date& b);
    friend bool operator==(const t_date& a, const t_date& b);
    friend bool operator!=(const t_date& a, const t_date& b);

    /**
     * @brief Returns the year stored in the `t_date`.
     *
     * @return std::int32_t
     */
    std::int32_t year() const;

    /**
     * @brief Returns the month stored in the `t_date` as an integer from
     * 0 - 11.
     *
     * @return std::int32_t
     */
    std::int32_t month() const;

    /**
     * @brief Returns the day stored in the `t_date`.
     *
     * @return std::int32_t
     */
    std::int32_t day() const;

    std::string str() const;
    friend inline size_t hash_value(const t_date& d);

    void set_psp_date(t_uindex dt);

private:
    t_rawtype m_storage;
};

t_date from_consecutive_day_idx(std::int32_t idx);

inline size_t
hash_value(const t_date& d) {
    boost::hash<std::uint32_t> hasher;
    return hasher(d.m_storage);
}
} // end namespace perspective

namespace std {
std::ostream& operator<<(std::ostream& os, const perspective::t_date& t);
}
