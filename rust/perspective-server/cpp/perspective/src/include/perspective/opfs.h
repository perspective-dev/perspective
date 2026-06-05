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

// ┌─────────────────────────────────────────────────────────────────────────┐
// │ Custom OPFS bridge (WASM, path 3)                                         │
// │                                                                           │
// │ On WASM, a `BACKING_STORE_DISK` column's bytes live in a resident `malloc`│
// │ buffer (`m_base`). The residency manager flushes that buffer to / reloads │
// │ it from the browser's OPFS through these three imports, implemented in JS │
// │ by `perspective-server.poly.ts` using `FileSystemSyncAccessHandle`.       │
// │                                                                           │
// │ The OPFS *open* (`createSyncAccessHandle`) is async, so these imports are │
// │ JSPI-**suspending**: they may ONLY be called from a `WebAssembly.promising`│
// │ export — i.e. the residency safepoint / pre-request restore entry points, │
// │ never from the synchronous `psp_handle_request`. This keeps the engine's  │
// │ request path synchronous while avoiding SharedArrayBuffer/COOP-COEP.      │
// │                                                                           │
// │ `name` is the column's OPFS file key (`m_fname`); `data`/`len` is the      │
// │ resident buffer. Return value is bytes transferred, or negative on error. │
// └─────────────────────────────────────────────────────────────────────────┘

#if defined(PSP_ENABLE_WASM) && defined(PSP_WASM_OPFS_PERSIST)

extern "C" {
int psp_opfs_store(const char* name, const void* data, int len);
int psp_opfs_load(const char* name, void* data, int len);
void psp_opfs_remove(const char* name);
}

#define PSP_HAS_OPFS_BRIDGE 1

#endif
