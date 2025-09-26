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

//! The Rust language bindings for [Perspective](https://perspective-dev.github.io),
//! a high performance data-visualization and analytics component for the web
//! browser.
//!
//! # Examples
//!
//! A simple example which loads an [Apache Arrow](https://arrow.apache.org/) and
//! computes a "Group By" operation, returning a new Arrow.
//!
//! ```rust
//! use perspective::LocalClient;
//! use perspective::client::config::ViewConfigUpdate;
//! use perspective::client::{TableInitOptions, UpdateData, ViewWindow};
//! use perspective::server::Server;
//!
//! # let arow_vec_data: Vec<u8> = vec![];
//! let data = UpdateData::Arrow(arrow_vec_data);
//! let options = TableInitOptions::default();
//! let table = client.table(data.into(), options).await?;
//! let mut view_config = ViewConfigUpdate::default();
//! view_config.group_by = ["CounterParty", "Security"]
//!     .iter()
//!     .map(|x| Some(x.to_string()))
//!     .collect();
//!
//! let view = table.view(Some(view_config)).await?;
//! let arrow = view.to_arrow(ViewWindow::default()).await?;
//! ```
//!
//! # See also
//!
//! - [`perspective-js`](https://docs.rs/perspective-js/latest/) for the
//!   JavaScript API.
//! - [`perspective-python`](https://docs.rs/perspective-python/latest/) for the
//!   Python API.
//! - [`perspective-server`](https://docs.rs/perspective-server/latest/) for
//!   Data Binding details.
//! - [`perspective-client`](https://docs.rs/perspective-client/latest/) for the
//!   Rust Client API
//! - [`perspective-viewer`](https://docs.rs/perspective-viewer/latest/) for the
//!   WebAssembly `<perspective-viewer>` Custom Element API.

#[cfg(feature = "axum-ws")]
pub mod axum;
pub mod virtual_server;

pub use perspective_client::proto;
pub use {perspective_client as client, perspective_server as server};
