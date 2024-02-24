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
#include <perspective/time.h>
#include <perspective/utils.h>

namespace perspective {

t_tdelta::t_tdelta() : v(0) {}

t_tdelta::t_tdelta(std::int64_t v) : v(v) {}

t_tdelta&
t_tdelta::operator*=(std::int64_t multiplier) {
    v *= multiplier;
    return *this;
}

t_time::t_time() : m_storage(0) {}

t_time::t_time(std::int64_t raw_val) : m_storage(raw_val) {}

t_time::t_time(int year, int month, int day, int hour, int min, int sec) :
    m_storage(static_cast<std::int64_t>(
        to_gmtime(year, month, day, hour, min, sec) * 1000
    )) {}

std::int64_t
t_time::raw_value() const {
    return m_storage;
}

bool
operator<(const t_time& a, const t_time& b) {
    return a.m_storage < b.m_storage;
}

bool
operator<=(const t_time& a, const t_time& b) {
    return a.m_storage <= b.m_storage;
}

bool
operator>(const t_time& a, const t_time& b) {
    return a.m_storage > b.m_storage;
}

bool
operator>=(const t_time& a, const t_time& b) {
    return a.m_storage >= b.m_storage;
}

bool
operator==(const t_time& a, const t_time& b) {
    return a.m_storage == b.m_storage;
}

bool
operator!=(const t_time& a, const t_time& b) {
    return a.m_storage != b.m_storage;
}

bool
t_time::as_tm(struct tm& out) const {
    return gmtime(out, as_seconds(), 0) == 1;
}

std::tm
t_time::get_tm() const {
    std::tm rval;
    gmtime(rval, microseconds(), 0);
    return rval;
}

std::int32_t
isleap(long int year) {
    return (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) ? 1 : 0;
}

std::int32_t
t_time::gmtime(struct tm& out, std::int64_t secs, std::int32_t offset) const {
    std::int64_t days;
    std::int64_t rem;
    std::int64_t y;
    const unsigned short int* ip;

    days = secs / SECS_PER_DAY;
    rem = secs % SECS_PER_DAY;
    rem += offset;
    while (rem < 0) {
        rem += SECS_PER_DAY;
        --days;
    }
    while (rem >= SECS_PER_DAY) {
        rem -= SECS_PER_DAY;
        ++days;
    }
    out.tm_hour = rem / SECS_PER_HOUR;
    rem %= SECS_PER_HOUR;
    out.tm_min = rem / 60;
    out.tm_sec = rem % 60;
    /* January 1, 1970 was a Thursday.  */
    out.tm_wday = (4 + days) % 7;
    if (out.tm_wday < 0) {
        out.tm_wday += 7;
    }
    y = 1970;

#define DIV(a, b) ((a) / (b) - ((a) % (b) < 0))
#define LEAPS_THRU_END_OF(y) (DIV(y, 4) - DIV(y, 100) + DIV(y, 400))

    while (days < 0 || days >= (isleap(y) != 0 ? 366 : 365)) {
        /* Guess a corrected year, assuming 365 days per
         * year.  */
        long int yg =
            y + days / 365 - static_cast<std::int64_t>(days % 365 < 0);

        /* Adjust DAYS and Y to match the guessed year.
         */
        days -=
            ((yg - y) * 365 + LEAPS_THRU_END_OF(yg - 1)
             - LEAPS_THRU_END_OF(y - 1));
        y = yg;
    }
    out.tm_year = y - 1900;
    if (out.tm_year != y - 1900) {
        /* The year cannot be represented due to
         * overflow.  */
        return 0;
    }
    out.tm_yday = days;
    ip = __mon_yday[isleap(y)];
    for (y = 11; days < (long int)ip[y]; --y) {}
    days -= ip[y];
    out.tm_mon = y;
    out.tm_mday = days + 1;
    return 1;
}

std::int32_t
t_time::year(const struct tm& t) const {
    return t.tm_year + 1900;
}
std::int32_t
t_time::month(const struct tm& t) const {
    return t.tm_mon + 1;
}
std::int32_t
t_time::day(const struct tm& t) const {
    return t.tm_mday;
}
std::int32_t
t_time::hours(const struct tm& t) const {
    return t.tm_hour;
}
std::int32_t
t_time::minutes(const struct tm& t) const {
    return t.tm_min;
}
std::int32_t
t_time::seconds(const struct tm& t) const {
    return t.tm_sec;
}
std::int32_t
t_time::microseconds() const // component
{
    std::int32_t micros = m_storage % 1000000;
    return micros + ((micros >> 31) & 1000000);
}

std::int64_t
t_time::as_seconds() const {
    if (m_storage < 0 && ((m_storage % 1000000) != 0)) {
        return m_storage / 1000000 - 1;
    }
    return m_storage / 1000000;
}

std::string
t_time::str(const struct tm& t) const {
    std::stringstream ss;

    double s = seconds(t) + microseconds() / 1000000.0;

    ss << year(t) << "-" << str_(month(t)) << "-" << str_(day(t)) << " "
       << str_(hours(t)) << ":" << str_(minutes(t)) << ":" << std::setfill('0')
       << std::setw(6) << std::fixed << std::setprecision(3) << s;

    return ss.str();
}

std::int32_t
days_before_year(std::int32_t year) {
    std::int32_t y = year - 1;
    if (y >= 0) {
        return y * 365 + y / 4 - y / 100 + y / 400;
    }
    return -366;
}

std::int32_t
days_before_month(std::int32_t year, std::int32_t month) {
    if (month < 1 || month > 12) {
        return 0;
    }
    return __mon_yday[isleap(year)][month - 1];
}

std::int32_t
ymd_to_ord(std::int32_t year, std::int32_t month, std::int32_t day) {
    return days_before_year(year) + days_before_month(year, month) + day;
}

std::int64_t
to_gmtime(
    std::int32_t year,
    std::int32_t month,
    std::int32_t day,
    std::int32_t hour,
    std::int32_t min,
    std::int32_t sec
) {
    static std::int32_t EPOCH_ORD = ymd_to_ord(1970, 1, 1);
    std::int64_t days = ymd_to_ord(year, month, day) - EPOCH_ORD;
    std::int64_t res = ((days * 24 + hour) * 60 + min) * 60 + sec;
    return static_cast<std::int64_t>(res);
}

t_time&
t_time::operator+=(const t_tdelta& d) {
    m_storage += d.v;
    return *this;
}

t_time&
t_time::operator-=(const t_tdelta& d) {
    m_storage -= d.v;
    return *this;
}

t_tdelta
operator-(const t_time& a, const t_time& b) {
    return {a.m_storage - b.m_storage};
}

} // end namespace perspective

namespace std {
std::ostream&
operator<<(std::ostream& s, const perspective::t_tdelta& td) {
    s << "t_tdelta(" << td.v << ")";
    return s;
}

std::ostream&
operator<<(std::ostream& os, const perspective::t_time& t) {
    struct tm tstruct;
    bool rcode = t.as_tm(tstruct);
    if (rcode) {
        os << "t_time<" << t.str(tstruct) << ">" << std::endl;
    } else {
        os << "t_time<" << t.raw_value() << ">" << std::endl;
    }

    return os;
}
} // namespace std
