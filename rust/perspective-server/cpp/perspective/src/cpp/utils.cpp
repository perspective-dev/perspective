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

#include <iomanip>
#include <perspective/first.h>
#include <boost/uuid/uuid_io.hpp>
// emscripten llvm-upstream fails to compile this module ..
#include <boost/uuid/uuid_generators.hpp>
#include <perspective/raw_types.h>
#include <perspective/base.h>
#include <perspective/utils.h>
#include <string>
#include <chrono>
#include <sstream>
#ifdef PSP_ENABLE_WASM
#include <atomic>
#include <cstdint>
#else
#include <filesystem>
#endif

#include <perspective/arrow_csv.h>
namespace perspective {

std::string
unique_path(const std::string& path_prefix) {
#ifdef PSP_ENABLE_WASM
    // `boost::uuids::random_generator()` seeds itself by opening `/dev/urandom`
    // directly, which aborts under emscripten's `NO_FILESYSTEM`. We don't need
    // cryptographic randomness for an OPFS key — a process-unique counter,
    // seeded from wall-clock time (via `clock_time_get`, no filesystem) so keys
    // differ across reloads, is sufficient.
    static std::atomic<std::uint64_t> s_counter{
        static_cast<std::uint64_t>(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()
            )
                .count()
        )
    };
    std::stringstream ss;
    ss << path_prefix << s_counter.fetch_add(1);
    return ss.str();
#else
    std::stringstream ss;
    ss << path_prefix << boost::uuids::random_generator()();
    return ss.str();
#endif
}

std::string
create_backing_store_dir(const std::string& prefix) {
#ifdef PSP_ENABLE_WASM
    // On WASM there is no OS filesystem (NO_FILESYSTEM): this is just a unique
    // logical path used as the OPFS key prefix for a table's column files. The
    // actual OPFS directory/file is created lazily by the JS bridge
    // (`perspective-server.poly.ts` `opfsOpenFile`) when the residency manager
    // first flushes a column. `/perspective` is the OPFS root namespace.
    return unique_path(std::string("/perspective/") + prefix);
#else
    namespace fs = std::filesystem;
    fs::path dir = fs::temp_directory_path() / unique_path(prefix);
    fs::create_directories(dir);
    return dir.string();
#endif
}

template <typename... Formats>
static bool
parse_date_time(
    std::tm& tm,
    std::chrono::system_clock::time_point& tp,
    std::string_view date_time_str,
    Formats... formats
) {
    std::istringstream ss;
    auto try_format = [&ss, &tm, &date_time_str, &tp](std::string_view format) {
        std::memset(&tm, 0, sizeof(tm));
        std::memset(&tp, 0, sizeof(tp));
        LOG_DEBUG("Testing Format: " << format);
        LOG_DEBUG("Date Time String: " << date_time_str);
        ss.clear();
        ss.str(date_time_str.data());
        ss >> std::get_time(&tm, format.data());
        LOG_DEBUG(
            "Parsed date: " << tm.tm_year + 1900 << "-" << tm.tm_mon + 1 << "-"
                            << tm.tm_mday << " " << tm.tm_hour << ":"
                            << tm.tm_min << ":" << tm.tm_sec
        );

        std::tm tm_cp = tm;
        // wtf... std::mktime normalizes the input struct just to get the time
        // out.
        tp = std::chrono::system_clock::from_time_t(std::mktime(&tm_cp));
        if (!ss.eof() && ss.peek() == '.') {
            ss.ignore();
            std::int32_t ms;
            const auto len = (date_time_str.size() - ss.tellg());
            ss >> ms;
            LOG_DEBUG("Parsed milliseconds: " << ms);
            if (len == 6) {
                LOG_DEBUG("Parsed microseconds: " << ms);
                tp += std::chrono::microseconds(ms);
            } else if (len == 3) {
                LOG_DEBUG("Parsed milliseconds: " << ms);
                tp += std::chrono::milliseconds(ms);
            }
        }

        if (!ss.eof() && ss.peek() == 'Z') {
            ss.ignore();
        }

        if (!ss.eof() && ss.peek() != EOF) {
            char c;
            ss >> c;
            LOG_DEBUG("Failed to parse datetime: expected EOF and got " << c);
            return false;
        }

        LOG_DEBUG("Failed: " << ss.fail());
        return !ss.fail();
    };

    return (... || try_format(formats));
}

bool
parse_all_date_time(
    std::tm& tm,
    std::chrono::system_clock::time_point& tp,
    std::string_view date_time_str
) {

    return parse_date_time(
        tm,
        tp,
        date_time_str,
        // "%m/%d/%Y, %H:%M:%S %p",
        "%Y-%m-%dT%H:%M:%S",
        "%m-%d-%Y %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%dT%H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%m-%d-%Y %H:%M",
        "%m/%d/%Y %H:%M",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M",
        "%m-%d-%Y %H",
        "%m/%d/%Y %H",
        "%Y-%m-%d %H",
        "%Y/%m/%d %H",
        "%m-%d-%Y",
        "%m/%d/%Y",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y %m %d"
    );
}

bool
parse_all_date_time(
    std::chrono::system_clock::time_point& tp, std::string_view date_time_str
) {
    std::tm tm;
    const auto result =
        apachearrow::parseAsArrowTimestamp(std::string(date_time_str));
    if (result.has_value()) {
        std::chrono::milliseconds dur(*result);
        tp = std::chrono::time_point<std::chrono::system_clock>(dur);
        return true;
    }

    return parse_all_date_time(tm, tp, date_time_str);
}

} // namespace perspective
