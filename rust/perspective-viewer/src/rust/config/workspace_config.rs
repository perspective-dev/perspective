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

use perspective_client::config::{Filter, ViewConfig};

use crate::config::{OptionalUpdate, PanelViewerConfig, UnknownKeys, ViewerConfigInitial};
use crate::utils::CssKind;

/// A derived `Table`'s definition: the `Table` its source `View` reads, and
/// the config of that `View`; generic over the `table` slot, which is a name
/// in the workspace `derived_tables` map and a recursive [`TableRef`] when
/// inlined in a single-panel config.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize, ts_rs::TS)]
pub struct DerivedTableConfig<T: ts_rs::TS = String> {
    /// The `Table` this derivation reads, which may itself be another
    /// derived `Table`.
    pub table: T,

    #[serde(flatten)]
    pub view_config: ViewConfig,

    #[serde(flatten, skip_serializing)]
    #[ts(skip)]
    pub unknown: UnknownKeys,
}

/// What may occupy a `table` position in a single-panel config: a hosted
/// `Table`'s name, or an inline derived-table definition recursing through
/// its own `table` field until a concrete name.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(untagged)]
pub enum TableRef {
    Name(String),
    Derived(Box<DerivedTableConfig<TableRef>>),
}

/// Hand-written because the derived decl's recursion sits in a generic alias
/// instantiation (`DerivedTableConfig<TableRef>`), which TypeScript expands
/// eagerly and rejects as circular; recursion is legal only deferred through
/// an object-literal node.
impl ts_rs::TS for TableRef {
    type OptionInnerType = Self;
    type WithoutGenerics = Self;

    fn docs() -> Option<String> {
        Some(
            "/**\n * What may occupy a `table` position in a single-panel config: a hosted\n * \
             `Table`'s name, or an inline derived-table definition recursing through\n * its own \
             `table` field until a concrete name.\n */\n"
                .to_owned(),
        )
    }

    fn name() -> String {
        "TableRef".to_owned()
    }

    fn decl() -> String {
        format!(
            "type TableRef = string | (Omit<{}, \"table\"> & {{ table: TableRef }});",
            <DerivedTableConfig as ts_rs::TS>::ident()
        )
    }

    fn decl_concrete() -> String {
        <Self as ts_rs::TS>::decl()
    }

    fn inline() -> String {
        format!(
            "string | (Omit<{}, \"table\"> & {{ table: TableRef }})",
            <DerivedTableConfig as ts_rs::TS>::ident()
        )
    }

    fn inline_flattened() -> String {
        panic!("`TableRef` cannot be flattened")
    }

    fn visit_dependencies(visitor: &mut impl ts_rs::TypeVisitor)
    where
        Self: 'static,
    {
        visitor.visit::<DerivedTableConfig>();
    }

    fn output_path() -> Option<std::path::PathBuf> {
        Some(std::path::PathBuf::from("TableRef.ts"))
    }
}

impl Default for TableRef {
    fn default() -> Self {
        Self::Name(String::default())
    }
}

impl From<String> for TableRef {
    fn from(value: String) -> Self {
        Self::Name(value)
    }
}

impl TableRef {
    /// The concrete `Table` name, or an error for an inline definition which
    /// a restore boundary has not resolved.
    pub fn name(&self) -> Result<&str, perspective_js::utils::ApiError> {
        match self {
            Self::Name(name) => Ok(name),
            Self::Derived(_) => Err(perspective_js::utils::ApiError::new(
                "Unresolved inline derived table",
            )),
        }
    }
}

impl<'de> serde::Deserialize<'de> for TableRef {
    /// Hand-written (not `untagged`) so a malformed inline definition
    /// reports its own error instead of "data did not match any variant".
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct TableRefVisitor;
        impl<'de> serde::de::Visitor<'de> for TableRefVisitor {
            type Value = TableRef;

            fn expecting(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                fmt.write_str("a table name or an inline derived table definition")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(TableRef::Name(value.to_owned()))
            }

            fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::MapAccess<'de>,
            {
                let config = <DerivedTableConfig<TableRef> as serde::Deserialize>::deserialize(
                    serde::de::value::MapAccessDeserializer::new(map),
                )?;

                Ok(TableRef::Derived(Box::new(config)))
            }
        }

        deserializer.deserialize_any(TableRefVisitor)
    }
}

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
    pub panels: BTreeMap<String, PanelViewerConfig<String, String>>,

    /// Named derived `Table`s, each a `View` of its `table` promoted to a
    /// `Table`. A `BTreeMap` for the same determinism reason as `panels`.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub derived_tables: BTreeMap<String, DerivedTableConfig>,

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
    /// The `@perspective-dev/viewer` version a saved workspace was written
    /// by, named in the error when such a workspace is rejected.
    #[serde(default)]
    #[ts(optional)]
    pub version: Option<String>,

    /// The panel to activate with the settings sidebar open, by `panels` key
    /// or existing panel id; `null` closes the sidebar.
    #[serde(default)]
    #[ts(as = "Option<_>")]
    #[ts(optional)]
    pub active: OptionalUpdate<String>,

    /// The layout tree to stage, naming every `panels` key (or, without
    /// `panels`, every existing panel id) exactly once.
    #[serde(default)]
    #[ts(optional)]
    pub layout: Option<crate::js::Layout>,

    /// The complete replacement panel set, each [`ViewerConfigInitial`] entry
    /// creating a new panel (`{}` empties the element); absent keeps the
    /// existing panels.
    #[serde(default)]
    #[ts(optional)]
    pub panels: Option<BTreeMap<String, ViewerConfigInitial>>,

    /// The complete replacement set of derived `Table`s, in any order (they
    /// are built parent-first); absent keeps the current ones, `{}` deletes
    /// them all.
    #[serde(default)]
    #[ts(optional)]
    pub derived_tables: Option<BTreeMap<String, DerivedTableConfig>>,

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

    #[serde(flatten)]
    #[ts(skip)]
    pub unknown: UnknownKeys,
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
