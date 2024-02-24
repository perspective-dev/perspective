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

#include <perspective/emscripten.h>
#include <perspective/emscripten_api_utils.h>
#include <perspective/proto_api.h>
#include <string>
#include <tsl/hopscotch_map.h>

using namespace emscripten;
using namespace perspective;

namespace perspective::binding {
/**
 * @brief Takes a container of values and returns a matching typed array.
 *
 * Works with std::vector and std::string, but should also work with
 * any container that supports operator[].
 *
 * @tparam F
 * @tparam operator[]
 * @param vec
 * @return emscripten::val
 */
template <
    typename F,
    typename Underlying = std::remove_reference_t<decltype(std::declval<F>()[0]
    )> // Type of the underlying value in the
       // container based on operator[]
    >
static emscripten::val
to_typed_array(const F& vec) {
    static_assert(
        js_array_type<Underlying>::name,
        "Unsupported type for vecToTypedArray. Please add a specialization for "
        "this type."
    );

    auto view = emscripten::typed_memory_view(vec.size(), vec.data());
    emscripten::val res =
        emscripten::val::global(js_array_type<Underlying>::name)
            .new_(vec.size());
    res.call<void>("set", view);
    return res;
}

emscripten::val
handle_message(ProtoApiServer& server, const std::string& msg) {
    auto js_responses = t_val::array();
    for (const auto& msg : server.handle_message(msg)) {
        js_responses.call<void>("push", t_val(to_typed_array(msg)));
    }

    return js_responses;
}

emscripten::val
poll(ProtoApiServer& server) {
    auto output = server.poll();
    auto arr = t_val::array();
    for (const auto& msg : output) {
        arr.call<void>("push", t_val(to_typed_array(msg)));
    }

    return arr;
}

void
em_init() {}

EMSCRIPTEN_BINDINGS(perspective) {
    function("init", &em_init);

    class_<ProtoApiServer>("ProtoServer")
        .constructor()
        .smart_ptr<std::shared_ptr<ProtoApiServer>>("shared_ptr<ProtoServer>")
        .function("handle_message", &handle_message)
        .function("poll", &poll);
}
} // namespace perspective::binding
