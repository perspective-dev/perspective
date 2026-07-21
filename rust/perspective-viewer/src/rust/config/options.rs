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

//! Argument dictionaries for the public `PerspectiveViewerElement` methods.
//! Each derives `ts_rs::TS` so its TypeScript type is generated (and
//! re-exported from the crate's `typescript_custom_section`) alongside the
//! config types, rather than hand-maintained.

use serde::Deserialize;
use ts_rs::TS;

use crate::config::ExportMethod;

/// Selects the target panel of a panel-scoped `<perspective-viewer>` method;
/// the active panel when `panel` is omitted.
#[derive(Deserialize, Default, TS)]
pub struct PanelOptions {
    #[ts(optional)]
    pub panel: Option<String>,
}

/// The `eject` argument: the loaded client to remove by name; the active
/// panel's client when omitted.
#[derive(Deserialize, Default, TS)]
pub struct ClientOptions {
    #[ts(optional)]
    pub client: Option<String>,
}

/// The `download` / `export` / `copy` argument: the `ExportMethod` and target
/// panel.
#[derive(Deserialize, Default, TS)]
pub struct ExportOptions {
    #[ts(as = "Option<ExportMethod>")]
    #[ts(optional)]
    pub method: Option<String>,

    #[ts(optional)]
    pub panel: Option<String>,
}

/// The `getTable` argument: whether to `wait` for a `Table`, and the target
/// panel.
#[derive(Deserialize, Default, TS)]
pub struct GetTableOptions {
    #[ts(optional)]
    pub wait: Option<bool>,

    #[ts(optional)]
    pub panel: Option<String>,
}

/// The `getClient` argument: whether to `wait` for a `Client`, and the target
/// panel.
#[derive(Deserialize, Default, TS)]
pub struct GetClientOptions {
    #[ts(optional)]
    pub wait: Option<bool>,

    #[ts(optional)]
    pub panel: Option<String>,
}
