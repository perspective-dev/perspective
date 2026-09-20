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

use crate::config::{OptionalUpdate, PanelViewerConfig, ViewerConfigInitial};
use crate::utils::CssKind;

/// The workspace config format (`{version, active?, layout, panels}`) —
/// the multi-panel counterpart of the single-panel [`ViewerConfig`] — as
/// emitted by [`PerspectiveViewerElement::save`].
///
/// - `panels` entries are [`PanelViewerConfig`]s: per-panel state only, no
///   `settings` key (element-level state).
/// - `active` names the panel targeted by the *open* settings sidebar; it is
///   omitted when the sidebar is closed.
#[derive(serde::Serialize, ts_rs::TS)]
pub struct WorkspaceConfig {
    pub version: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
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
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub global_filters: Vec<Filter>,

    /// The MASTER (filter-source) panels' ids, referencing `panels` keys.
    /// Roles are layout state (like the panel arrangement), so they persist;
    /// which master contributed which clause does not — restored
    /// `global_filters` are one unattributed bucket. Omitted when empty.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub masters: Vec<String>,

    /// Named color-scale definitions shared by every panel: CSS custom
    /// property name (`--psp-user--<kind>-<name>`) → canonical CSS
    /// value.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub palette: BTreeMap<String, String>,
}

/// The [`PerspectiveViewerElement::restoreWorkspace`] argument: a field-wise
/// update of the element's workspace state, like [`ViewerConfigUpdate`] for a
/// panel, where an absent key is unchanged, `null` resets and a value
/// replaces.
#[derive(serde::Deserialize, ts_rs::TS)]
pub struct WorkspaceConfigUpdate {
    /// The panel to activate with the settings sidebar open, by `panels` key
    /// or existing panel id; `null` closes the sidebar.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub active: OptionalUpdate<String>,

    /// The layout tree to stage, naming `panels` keys or existing panel ids.
    #[serde(default)]
    #[ts(optional)]
    pub layout: Option<crate::js::Layout>,

    /// The complete replacement panel set, each [`ViewerConfigInitial`] entry
    /// creating a new panel (`{}` empties the element); absent keeps the
    /// existing panels.
    #[serde(default)]
    #[ts(optional)]
    pub panels: Option<BTreeMap<String, ViewerConfigInitial>>,

    /// The element-level cross-filter set applied to every detail panel as
    /// one unattributed bucket, replacing the current set; `null` clears it.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub global_filters: OptionalUpdate<Vec<Filter>>,

    /// The master (filter-source) panels by `panels` key or existing panel
    /// id, unknown ids dropped with a warning; `null` demotes every panel.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub masters: OptionalUpdate<Vec<String>>,

    /// Named color-scale definitions applied to the host (see
    /// [`WorkspaceConfig::palette`]), replacing the previous palette; `null`
    /// clears it.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub palette: OptionalUpdate<BTreeMap<String, String>>,
}

/// Validate a restored palette map: each key's `--psp-user--<kind>-`
/// prefix selects the reader that canonicalizes its value.
pub fn validate_palette(
    palette: BTreeMap<String, String>,
) -> Result<BTreeMap<String, String>, String> {
    palette
        .into_iter()
        .map(|(name, value)| {
            let kind = CssKind::of_var(&name).ok_or_else(|| {
                format!(
                    "`palette` key `{name}` must start with `--psp-user--gradient-`, \
                     `--psp-user--palette-` or `--psp-user--color-`"
                )
            })?;

            let canonical = kind
                .canonicalize(&value)
                .map_err(|error| format!("`palette[\"{name}\"]`: {error}"))?;

            Ok((name, canonical))
        })
        .collect()
}
