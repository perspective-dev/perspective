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
#include <perspective/first.h>

#ifdef PSP_PARALLEL_FOR
#include <thread>
#include <boost/thread/locks.hpp>
#include <boost/thread/shared_mutex.hpp>
#endif

#ifdef PSP_ENABLE_PYTHON
#include <Python.h>
#endif

namespace perspective {

#ifdef PSP_PARALLEL_FOR
// Use this when you want to acquire the reader lock without unlocking the GIL.
#define PSP_GIL_READ_LOCK(X)                                                   \
    auto _thread_state = PyEval_SaveThread();                                  \
    boost::shared_lock<boost::shared_mutex> _lock(*X);                         \
    PyEval_RestoreThread(_thread_state);

#define PSP_GIL_WRITE_LOCK(X)                                                  \
    auto _thread_state = PyEval_SaveThread();                                  \
    boost::unique_lock<boost::shared_mutex> _lock(*X);                         \
    PyEval_RestoreThread(_thread_state);

#define PSP_READ_LOCK(X) boost::shared_lock<boost::shared_mutex> _lock(*X);
#define PSP_WRITE_LOCK(X) boost::unique_lock<boost::shared_mutex> _lock(*X);
#else
#define PSP_GIL_READ_LOCK(X)
#define PSP_GIL_WRITE_LOCK(X)
#define PSP_READ_LOCK(X)
#define PSP_WRITE_LOCK(X)
#endif

#ifdef PSP_ENABLE_PYTHON
class PERSPECTIVE_EXPORT PerspectiveGILUnlock {
public:
    PerspectiveGILUnlock();
    ~PerspectiveGILUnlock();

private:
    PyThreadState* m_thread_state;
};

#define PSP_GIL_UNLOCK() PerspectiveGILUnlock _acquire;
#else
#define PSP_GIL_UNLOCK()
#endif

} // namespace perspective
