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

#include <memory>
#include <iostream>
#include <string>

#include "rust/cxx.h"
#include "perspective/proto_api.h"
#include "server.h"
#include "perspective-python/src/ffi.rs.h"

std::unique_ptr<ProtoApiServer>
new_proto_server() {
    return std::make_unique<ProtoApiServer>();
}

rust::Box<ResponseBatch>
handle_message(
    const ProtoApiServer& self, const rust::Vec<std::uint8_t>& message) {

    std::string message_str(message.begin(), message.end());
    std::vector<std::string> responses = self.handle_message(message_str);
    rust::Box<ResponseBatch> batch = create_response_batch();

    for (const auto& response : responses) {
        rust::Vec<std::uint8_t> result;
        result.reserve(response.size());
        for (std::uint8_t c : response) {
            result.push_back(c);
        }

        batch->push_response(result);
    }

    return batch;
}

rust::Box<ResponseBatch>
poll(ProtoApiServer& self) {
    std::vector<std::string> responses = self.poll();
    rust::Box<ResponseBatch> batch = create_response_batch();
    for (const auto& response : responses) {
        rust::Vec<std::uint8_t> result;
        result.reserve(response.size());
        for (std::uint8_t c : response) {
            result.push_back(c);
        }

        batch->push_response(result);
    }

    return batch;
}