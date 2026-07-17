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

use std::collections::BTreeMap;

use perspective_client::config::Filter;

use crate::config::{PanelViewerConfig, ViewerConfigUpdate};

/// The whole-element config format (`{version, active?, layout, panels}`) —
/// the multi-panel counterpart of the single-panel [`ViewerConfig`] — as
/// emitted by [`PerspectiveViewerElement::save`].
///
/// - `panels` entries are [`PanelViewerConfig`]s: per-panel state only, no
///   `settings` key (element-level state).
/// - `active` names the panel targeted by the *open* settings sidebar; it is
///   omitted when the sidebar is closed.
#[derive(serde::Serialize)]
pub struct WorkspaceConfig {
    pub version: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub active: Option<String>,

    pub layout: Option<crate::js::Layout>,

    /// `BTreeMap` (not `HashMap`) so `save()` serializes panels in a
    /// DETERMINISTIC (sorted) key order — a fresh `HashMap` per call
    /// iterates in a per-instance random order, which made consecutive
    /// `save()` outputs byte-unstable.
    pub panels: BTreeMap<String, PanelViewerConfig>,

    /// The element-level global (master/detail cross-) filters. A transient
    /// overlay on every detail panel's view — persisted here, never in a
    /// per-panel entry. Omitted when empty.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub global_filters: Vec<Filter>,

    /// The MASTER (filter-source) panels' ids, referencing `panels` keys.
    /// Roles are layout state (like the panel arrangement), so they persist;
    /// which master contributed which clause does not — restored
    /// `global_filters` are one unattributed bucket. Omitted when empty.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub masters: Vec<String>,
}

/// The parse target of a whole-element config in
/// [`PerspectiveViewerElement::restore`]. Mirrors [`WorkspaceConfig`],
/// but `panels` entries are full [`ViewerConfigUpdate`]s so a stray per-panel
/// `settings` can be detected (warned, then ignored — `create_panel` strips
/// it).
#[derive(serde::Deserialize)]
pub struct WorkspaceConfigUpdate {
    #[serde(default)]
    pub active: Option<String>,

    #[serde(default)]
    pub layout: Option<crate::js::Layout>,

    pub panels: BTreeMap<String, ViewerConfigUpdate>,

    /// The element-level global (master/detail cross-) filters to re-apply as
    /// a transient overlay on every DETAIL panel. Restored as one
    /// unattributed bucket: the next selection on any master replaces it.
    #[serde(default)]
    pub global_filters: Vec<Filter>,

    /// The master (filter-source) panels, by saved `panels` key. An id not in
    /// `panels` warns and is dropped.
    #[serde(default)]
    pub masters: Vec<String>,
}
