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

#![doc = include_str!("../docs/lib.md")]
#![warn(unstable_features)]

mod client;
pub(crate) mod py_async;
mod py_err;
mod server;

pub use client::client_sync::{Client, Table, View};
pub use client::proxy_session::ProxySession;
pub use perspective_client::ViewWindow;
pub use perspective_client::config::ViewConfigUpdate;
use py_err::PyPerspectiveError;
use pyo3::prelude::*;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, fmt};

/// Create a tracing filter which mimics the default behavior of reading from
/// env, customized to exclude timestamp.
/// [`tracing` filter docs](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/layer/index.html#per-layer-filtering)
fn init_tracing() {
    let fmt_layer = fmt::layer().without_time().with_target(true);
    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();

    tracing_subscriber::registry()
        .with(filter_layer)
        .with(fmt_layer)
        .init();
}

/// Returns the number of threads the internal threadpool will use.
#[pyfunction]
fn num_cpus() -> i32 {
    perspective_server::num_cpus()
}

/// Set the number of threads the internal threadpool will use. Can also be set
/// with `NUM_OMP_THREADS` environment variable.
#[pyfunction]
fn set_num_cpus(num_cpus: i32) {
    perspective_server::set_num_cpus(num_cpus)
}

/// Perspective Python main module.
#[pymodule]
fn perspective(py: Python, m: &Bound<PyModule>) -> PyResult<()> {
    init_tracing();
    m.add_class::<client::client_sync::Client>()?;
    m.add_class::<server::Server>()?;
    m.add_class::<server::AsyncServer>()?;
    m.add_class::<server::PySession>()?;
    m.add_class::<server::PyAsyncSession>()?;
    m.add_class::<client::client_sync::Table>()?;
    m.add_class::<client::client_sync::View>()?;
    m.add_class::<client::client_async::AsyncClient>()?;
    m.add_class::<client::client_async::AsyncTable>()?;
    m.add_class::<client::client_async::AsyncView>()?;
    m.add_class::<client::proxy_session::ProxySession>()?;
    m.add_class::<server::virtual_server_sync::PyVirtualServer>()?;
    m.add("PerspectiveError", py.get_type::<PyPerspectiveError>())?;
    m.add_function(wrap_pyfunction!(num_cpus, m)?)?;
    m.add_function(wrap_pyfunction!(set_num_cpus, m)?)?;
    Ok(())
}
