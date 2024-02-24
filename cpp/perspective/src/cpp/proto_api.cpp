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

#include "perspective/server.h"
#include "perspective/proto_api.h"
#include <memory>

class ProtoApiServer::ProtoApiServerImpl {
public:
    std::unique_ptr<perspective::server::ProtoServer> m_server;
    ProtoApiServerImpl();
    ~ProtoApiServerImpl();
};

ProtoApiServer::ProtoApiServer() :
    m_impl(std::make_unique<ProtoApiServer::ProtoApiServerImpl>()) {}
ProtoApiServer::~ProtoApiServer() = default;

ProtoApiServer::ProtoApiServerImpl::ProtoApiServerImpl() :
    m_server(std::make_unique<perspective::server::ProtoServer>()) {}
ProtoApiServer::ProtoApiServerImpl::~ProtoApiServerImpl() = default;

std::vector<std::string>
ProtoApiServer::handle_message(const std::string& data) const {
    std::vector<std::string> results;
    for (const auto& msg : m_impl->m_server->handle_message(data).responses) {
        results.push_back(msg);
    }

    return results;
}

std::vector<std::string>
ProtoApiServer::poll() {
    std::vector<std::string> results;
    for (const auto& msg : m_impl->m_server->poll()) {
        results.push_back(msg);
    }

    return results;
}
