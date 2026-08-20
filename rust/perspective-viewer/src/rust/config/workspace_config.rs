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

use crate::config::{CssKind, PanelViewerConfig, ViewerConfigInitial};

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

/// The parse target of a workspace config in
/// [`PerspectiveViewerElement::restoreWorkspace`]. Mirrors
/// [`WorkspaceConfig`], but `panels` entries are [`ViewerConfigInitial`]s —
/// every entry creates a NEW panel, so `table` is required by type (a
/// stray per-panel `settings` key is ignored; it is element-level state,
/// carried by the top-level `active` field).
#[derive(serde::Deserialize, ts_rs::TS)]
pub struct WorkspaceConfigUpdate {
    #[serde(default)]
    #[ts(optional)]
    pub active: Option<String>,

    #[serde(default)]
    #[ts(optional)]
    pub layout: Option<crate::js::Layout>,

    pub panels: BTreeMap<String, ViewerConfigInitial>,

    /// The element-level global (master/detail cross-) filters to re-apply as
    /// a transient overlay on every DETAIL panel. Restored as one
    /// unattributed bucket: the next selection on any master replaces it.
    /// `Option` so an explicit `undefined` property deserializes as
    /// `None` like an absent key (also `masters` / `palette` below).
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub global_filters: Option<Vec<Filter>>,

    /// The master (filter-source) panels, by saved `panels` key. An id not in
    /// `panels` warns and is dropped.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub masters: Option<Vec<String>>,

    /// Named color-scale definitions to apply to the host (see
    /// [`WorkspaceConfig::palette`]), replacing any previously restored
    /// palette.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub palette: Option<BTreeMap<String, String>>,
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn palette_serializes_only_when_present() {
        let config = WorkspaceConfig {
            version: "x".to_owned(),
            active: None,
            layout: None,
            panels: BTreeMap::new(),
            global_filters: vec![],
            masters: vec![],
            palette: BTreeMap::new(),
        };

        assert_eq!(
            serde_json::to_value(&config).unwrap(),
            json!({ "version": "x", "layout": null, "panels": {} })
        );

        let mut palette = BTreeMap::new();
        palette.insert("--psp-user--color-hot".to_owned(), "#ff0000".to_owned());

        let config = WorkspaceConfig { palette, ..config };
        assert_eq!(
            serde_json::to_value(&config).unwrap(),
            json!({
                "version": "x",
                "layout": null,
                "panels": {},
                "palette": { "--psp-user--color-hot": "#ff0000" },
            })
        );
    }

    #[test]
    fn update_palette_defaults_empty_and_validates_by_prefix() {
        let update: WorkspaceConfigUpdate =
            serde_json::from_value(json!({ "panels": {} })).unwrap();
        assert!(update.palette.is_none());

        let update: WorkspaceConfigUpdate = serde_json::from_value(json!({
            "panels": {},
            "palette": {
                "--psp-user--gradient-1": "linear-gradient(#000, #fff)",
                "--psp-user--palette-warm": "linear-gradient(90deg, RGB(255,0,0), #ff0)",
                "--psp-user--color-hot": "#F00",
            },
        }))
        .unwrap();

        let valid = validate_palette(update.palette.unwrap()).unwrap();
        assert_eq!(
            valid.get("--psp-user--gradient-1").unwrap(),
            "linear-gradient(to right, #000000 0%, #ffffff 100%)"
        );
        assert_eq!(
            valid.get("--psp-user--palette-warm").unwrap(),
            "linear-gradient(to right, #ff0000, #ffff00)"
        );
        assert_eq!(valid.get("--psp-user--color-hot").unwrap(), "#ff0000");

        let bad = |name: &str, value: &str| {
            let mut map = BTreeMap::new();
            map.insert(name.to_owned(), value.to_owned());
            validate_palette(map).unwrap_err()
        };

        assert!(bad("--psp-user--other-1", "#ff0000").contains("--psp-user--other-1"));
        assert!(bad("--psp-charts--gradient", "#ff0000").contains("must start with"));
        assert!(
            bad(
                "--psp-user--palette-1",
                "linear-gradient(#000 0%, #fff 100%)"
            )
            .contains("--psp-user--palette-1")
        );
        assert!(bad("--psp-user--gradient-1", "#ff0000").contains("linear-gradient"));
        assert!(bad("--psp-user--color-1", "red").contains("red"));
    }
}
