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

#include "perspective/exports.h"
#include "perspective/server.h"
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <string>
#include <tsl/hopscotch_map.h>
#include <arrow/util/thread_pool.h>

#if HEAP_INSTRUMENTS
#include <emscripten/heap.h>

#define UNINSTRUMENTED_MALLOC(x) emscripten_builtin_malloc(x)
#define UNINSTRUMENTED_FREE(x) emscripten_builtin_free(x)
#else
#define UNINSTRUMENTED_MALLOC(x) malloc(x)
#define UNINSTRUMENTED_FREE(x) free(x)
#endif

using namespace perspective::server;

#pragma pack(push, 1)
struct EncodedApiResp {
    void* data;
    std::uint32_t size;
    std::uint32_t client_id;
};

struct EncodedApiEntries {
    std::uint32_t size;
    EncodedApiResp* entries;
};
#pragma pack(pop)

void
encode_api_response(
    const ProtoServerResp<std::string>& msg, EncodedApiResp* encoded
) {
    auto* data = static_cast<char*>(UNINSTRUMENTED_MALLOC(msg.data.size()));
    std::copy(msg.data.begin(), msg.data.end(), data);

    encoded->data = data;
    encoded->size = msg.data.size();
    encoded->client_id = msg.client_id;
}

EncodedApiEntries*
encode_api_responses(const std::vector<ProtoServerResp<std::string>>& msgs) {
    auto* encoded = static_cast<EncodedApiEntries*>(
        UNINSTRUMENTED_MALLOC(sizeof(EncodedApiEntries))
    );
    encoded->entries = static_cast<EncodedApiResp*>(
        UNINSTRUMENTED_MALLOC(sizeof(EncodedApiResp) * msgs.size())
    );

    encoded->size = msgs.size();
    auto* encoded_mem = encoded->entries;
    for (int i = 0; i < msgs.size(); i++) {
        encode_api_response(msgs[i], &encoded_mem[i]);
    }

    return encoded;
}

extern "C" {

PERSPECTIVE_EXPORT
ProtoServer*
psp_new_server(bool realtime_mode) {
    return new ProtoServer(realtime_mode);
}

PERSPECTIVE_EXPORT
EncodedApiEntries*
psp_handle_request(
    ProtoServer* server,
    std::uint32_t client_id,
    char* msg_ptr,
    std::size_t msg_len
) {
    std::string msg(msg_ptr, msg_len);
    auto msgs = server->handle_request(client_id, msg);
    return encode_api_responses(msgs);
}

PERSPECTIVE_EXPORT
EncodedApiEntries*
psp_poll(ProtoServer* server) {
    auto responses = server->poll();
    return encode_api_responses(responses);
}

PERSPECTIVE_EXPORT
std::size_t
psp_residency_prepare(ProtoServer* server) {
    return server->residency_prepare();
}

PERSPECTIVE_EXPORT
const char*
psp_residency_victim_fname(ProtoServer* server, std::size_t i) {
    return server->residency_victim_fname(i);
}

PERSPECTIVE_EXPORT
void
psp_residency_commit(ProtoServer* server) {
    server->residency_commit();
}

PERSPECTIVE_EXPORT
std::uint32_t
psp_new_session(ProtoServer* server) {
    return server->new_session();
}

PERSPECTIVE_EXPORT
void
psp_close_session(ProtoServer* server, std::uint32_t client_id) {
    server->close_session(client_id);
}

PERSPECTIVE_EXPORT
std::size_t
psp_alloc(std::size_t size) {
    // We use this to allocate stack traces for instrumentation with heap
    // profiling builds.
    auto* mem = (char*)UNINSTRUMENTED_MALLOC(size);
    return (size_t)mem;
}

PERSPECTIVE_EXPORT
void
psp_free(void* ptr) {
    UNINSTRUMENTED_FREE(ptr);
}

PERSPECTIVE_EXPORT
void
psp_delete_server(void* proto_server) {
    auto* server = (ProtoServer*)proto_server;
    delete server;
}

PERSPECTIVE_EXPORT
bool
psp_is_memory64() {
#if UINTPTR_MAX == 0xffffffff
    return false;
#elif UINTPTR_MAX == 0xffffffffffffffff
    return true;
#endif
}

PERSPECTIVE_EXPORT
std::int32_t
psp_num_cpus() {
    return arrow::GetCpuThreadPoolCapacity();
}

PERSPECTIVE_EXPORT
void
psp_set_num_cpus(std::int32_t num_cpus) {
    PSP_CHECK_ARROW_STATUS(arrow::SetCpuThreadPoolCapacity(num_cpus));

}

} // end extern "C"
