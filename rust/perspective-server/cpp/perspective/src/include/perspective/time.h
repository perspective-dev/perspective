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
#include <perspective/raw_types.h>
#include <perspective/exports.h>
#include <boost/functional/hash.hpp>
#include <chrono>
#include <iostream>
#include <sstream>
#include <iomanip>
#ifndef WIN32
#include <sys/time.h>
#endif
SUPPRESS_WARNINGS_VC(4244)

namespace perspective {

const int SECS_PER_HOUR = 60 * 60;
const int SECS_PER_DAY = SECS_PER_HOUR * 24;
static unsigned short const int __mon_yday[2][13] = {
    /* Normal years.  */
    {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365},
    /* Leap years.  */
    {0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366}
};
class t_time;

// A simple difference in ms between two t_times can be
// added/subtracted from another, that DOES NOT do things
// like account for short months, etc.
struct t_tdelta {
    std::int64_t v;
    t_tdelta();
    t_tdelta(std::int64_t v);

    // Gets, say, a time difference twice as long as the
    // current value.
    t_tdelta& operator*=(std::int64_t multiplier);
    friend std::ostream& operator<<(std::ostream& s, const t_tdelta& td);
    friend class t_time;
};

std::int32_t isleap(long int year);
std::int32_t days_before_year(std::int32_t year);
std::int32_t days_before_month(std::int32_t year, std::int32_t month);
std::int32_t
ymd_to_ord(std::int32_t year, std::int32_t month, std::int32_t day);
std::int64_t to_gmtime(
    std::int32_t year,
    std::int32_t month,
    std::int32_t day,
    std::int32_t hour,
    std::int32_t min,
    std::int32_t sec
);

std::tm gmtime_from_epoch_ms(std::int64_t ms);

// Interal details: m_storage stores "microseconds since the
// epoch-defined-in-the-class".
// In terms of (non-tm based) inputs/outputs, t_time
// represents an instant in time as:
// A year() since year 0AD.
// A month() in the range [1..12].
// A day() of the month in the range [1..31].
// An hours() of the day in the range [0..23].
// A minutes() in the range [0..59].
// In principle, a seconds() in the range [0..60]. (Accurate
// leap seconds are non implemented currently.)
// A microseconds() in the range [0..999].
class PERSPECTIVE_EXPORT t_time {
public:
    typedef std::int64_t t_rawtype;

    t_time();
    explicit t_time(std::int64_t raw_val);

    t_time(
        std::int32_t year,
        std::int32_t month,
        std::int32_t day,
        std::int32_t hour,
        std::int32_t min,
        std::int32_t sec
    );

    std::int64_t raw_value() const;

    friend bool operator<(const t_time& a, const t_time& b);
    friend bool operator<=(const t_time& a, const t_time& b);
    friend bool operator>(const t_time& a, const t_time& b);
    friend bool operator>=(const t_time& a, const t_time& b);
    friend bool operator==(const t_time& a, const t_time& b);
    friend bool operator!=(const t_time& a, const t_time& b);
    friend std::ostream& operator<<(std::ostream& os, const t_time& t);

    bool as_tm(struct tm& out) const;

    /**
     * @brief Return the instance as an std::tm object.
     *
     * @return std::tm
     */
    std::tm get_tm() const;

    static std::int32_t
    gmtime(struct tm& out, std::int64_t secs, std::int32_t offset);

    std::int32_t year(const struct tm& t) const;
    std::int32_t month(const struct tm& t) const;
    std::int32_t day(const struct tm& t) const;
    std::int32_t hours(const struct tm& t) const;
    std::int32_t minutes(const struct tm& t) const;
    std::int32_t seconds(const struct tm& t) const;
    std::int32_t microseconds() const;
    std::int64_t as_seconds() const;

    friend inline size_t hash_value(const t_time& d);

    std::string str(const struct tm& t) const;

    t_time& operator+=(const t_tdelta& d);

    t_time& operator-=(const t_tdelta& d);

    friend t_tdelta operator-(const t_time& a, const t_time& b);

private:
    t_rawtype m_storage;
};

t_tdelta operator-(const t_time& a, const t_time& b);

inline size_t
hash_value(const t_time& t) {
    boost::hash<std::int64_t> hasher;
    return hasher(t.m_storage);
}

} // end namespace perspective

namespace std {
std::ostream& operator<<(std::ostream& s, const perspective::t_tdelta& td);

std::ostream& operator<<(std::ostream& os, const perspective::t_time& t);
} // namespace std
