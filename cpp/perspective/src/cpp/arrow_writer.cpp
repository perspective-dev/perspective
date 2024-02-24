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

#include <perspective/arrow_writer.h>

namespace perspective::apachearrow {
using namespace perspective;

// TODO: unsure about efficacy of these functions when get<T> exists
template <>
double
get_scalar<double>(t_tscalar& t) {
    return t.to_double();
}
template <>
float
get_scalar<float>(t_tscalar& t) {
    return static_cast<float>(t.to_double());
}
template <>
std::uint8_t
get_scalar<std::uint8_t>(t_tscalar& t) {
    return static_cast<std::uint8_t>(t.to_int64());
}
template <>
std::int8_t
get_scalar<std::int8_t>(t_tscalar& t) {
    return static_cast<std::int8_t>(t.to_int64());
}
template <>
std::int16_t
get_scalar<std::int16_t>(t_tscalar& t) {
    return static_cast<std::int16_t>(t.to_int64());
}
template <>
std::uint16_t
get_scalar<std::uint16_t>(t_tscalar& t) {
    return static_cast<std::uint16_t>(t.to_int64());
}
template <>
std::int32_t
get_scalar<std::int32_t>(t_tscalar& t) {
    return static_cast<std::int32_t>(t.to_int64());
}
template <>
std::uint32_t
get_scalar<std::uint32_t>(t_tscalar& t) {
    return static_cast<std::uint32_t>(t.to_int64());
}
template <>
std::int64_t
get_scalar<std::int64_t>(t_tscalar& t) {
    return static_cast<std::int64_t>(t.to_int64());
}
template <>
std::uint64_t
get_scalar<std::uint64_t>(t_tscalar& t) {
    return static_cast<std::uint64_t>(t.to_int64());
}
template <>
bool
get_scalar<bool>(t_tscalar& t) {
    return t.get<bool>();
}

// std::int32_t
// get_idx(std::int32_t cidx, std::int32_t ridx, std::int32_t stride,
//     t_get_data_extents extents) {
//     return (ridx - extents.m_srow) * stride + (cidx - extents.m_scol);
// }

} // namespace perspective::apachearrow