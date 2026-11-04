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

namespace perspective {

enum t_list_flatten {
    LIST_FLATTEN_ZIP = 0,
    LIST_FLATTEN_CARTESIAN = 1,
    LIST_FLATTEN_STRINGIFY = 2,
    LIST_FLATTEN_STRINGIFY_FORMATTED = 3
};

enum t_struct_flatten {
    STRUCT_FLATTEN_PIVOT = 0,
    STRUCT_FLATTEN_STRINGIFY = 1,
    STRUCT_FLATTEN_STRINGIFY_FORMATTED = 2
};

enum t_map_flatten {
    MAP_FLATTEN_PIVOT = 0,
    MAP_FLATTEN_STRINGIFY = 1,
    MAP_FLATTEN_STRINGIFY_FORMATTED = 2
};

inline bool
stringifies(t_list_flatten mode) {
    return mode >= LIST_FLATTEN_STRINGIFY;
}

inline bool
stringifies(t_struct_flatten mode) {
    return mode != STRUCT_FLATTEN_PIVOT;
}

inline bool
stringifies(t_map_flatten mode) {
    return mode != MAP_FLATTEN_PIVOT;
}

struct t_flatten_mode {
    t_list_flatten list{LIST_FLATTEN_ZIP};
    t_struct_flatten structs{STRUCT_FLATTEN_PIVOT};

    /**
     * Arrow `MAP` columns only; JSON objects follow `structs`.
     */
    t_map_flatten maps{MAP_FLATTEN_PIVOT};
};

} // namespace perspective
