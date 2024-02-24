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

#if !defined(__linux__) && !defined(__APPLE__) && !defined(WIN32)
// default to linux
#define __linux__
#endif

#pragma once

#ifdef WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif // NOMINMAX
#endif // WIN32

#ifdef PSP_VERIFY
#define PSP_STORAGE_VERIFY
#define PSP_COLUMN_VERIFY
#define PSP_TABLE_VERIFY
#define PSP_GNODE_VERIFY
#define PSP_TABLE_TRACE
// #define PSP_DEBUG_HELPER
// #define PSP_MPROTECT
// #define PSP_DBG_MALLOC
#endif

// Remove once we are c++11 everywhere
#define NPY_NO_DEPRECATED_API NPY_1_7_API_VERSION
#define _GLIBCXX_USE_NANOSLEEP 1
#include <string>
#include <iostream>

#ifndef PSP_DEBUG_HELPER
#define PSP_MALLOC malloc
#define PSP_FREE free
#endif

#ifdef PSP_DBG_MALLOC
#define PSP_MALLOC psp_dbg_malloc
#define PSP_FREE psp_dbg_free
#endif

#ifdef PSP_MPROTECT
#define PSP_MALLOC psp_page_aligned_malloc
#define PSP_FREE psp_page_aligned_free
#endif

#ifdef PSP_ENABLE_PYTHON
// #include <pybind11/pybind11.h>
// #include <pybind11/numpy.h>
// namespace py = pybind11;

// Define object serialization type
#define PSP_OBJECT_TYPE std::uint64_t

#else
// TODO javascript
#define PSP_OBJECT_TYPE std::uint64_t
#endif
