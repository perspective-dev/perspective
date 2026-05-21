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

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{KeyValueOpts, NumberSeriesStyleDefaultConfig};

/// The full schema for one column at one point in time. Plugins may return
/// different schemas for the same column based on the column's current
/// stored value (e.g. to hide dependent fields), so this is re-queried on
/// every field update.
///
/// Each entry is a [`ControlSpec`]. Primitive variants carry their own
/// `key` (JSON storage key) inline; the sidebar UI label is supplied by
/// CSS via `--psp-label--<key>--content`. Composite variants render a
/// self-contained Yew component that supplies its own labels and owns a
/// fixed key namespace via [`ControlSpec::serialized_keys`].
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ColumnConfigSchema {
    pub fields: Vec<ControlSpec>,
}

impl ColumnConfigSchema {
    /// Union of every JSON key any control in this schema knows how to
    /// read or write. Used to build the schema-filtered view of
    /// `columns_config` passed to `plugin.restore()` — keys not in this
    /// set are "ghost" state from a different plugin and stay invisible
    /// to the active one.
    pub fn active_keys(&self) -> HashSet<String> {
        let mut out = HashSet::new();
        for spec in &self.fields {
            for k in spec.serialized_keys() {
                out.insert(k.to_string());
            }
        }
        out
    }
}

/// Discriminated union of widget kinds the viewer can render. Composite
/// variants wrap an existing rich Yew component and carry only the
/// component's `*DefaultConfig`. Primitive variants render generic scalar
/// widgets and carry their own `key` inline; the visible label is
/// resolved at CSS time via `--psp-label--<key>--content`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind")]
pub enum ControlSpec {
    Enum {
        key: String,
        variants: Vec<EnumVariant>,
        default: String,
    },
    Bool {
        key: String,
        default: bool,
    },
    Number {
        key: String,
        default: f64,

        /// If `true`, always serialize this values even if it is the default.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        include: Option<bool>,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<f64>,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<f64>,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        step: Option<f64>,
    },
    String {
        key: String,
        default: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        placeholder: Option<String>,
    },
    Color {
        key: String,
        default: String,
    },
    /// Paired pos/neg color picker rendered as a single horizontal
    /// gradient/range bar. Used to expose the existing
    /// [`crate::components::form::color_range_selector::ColorRangeSelector`]
    /// widget at primitive granularity. Owns two top-level keys
    /// (`key_pos` + `key_neg`); the visible label is derived from
    /// `key_pos`.
    ColorRange {
        key_pos: String,
        key_neg: String,
        default_pos: String,
        default_neg: String,
        /// When `true`, the bar renders as a continuous gradient
        /// (e.g. for `gradient` color modes); when `false`, the bar
        /// renders as a hard pos/neg split. Currently only changes the
        /// visual; pos/neg semantics are unchanged.
        #[serde(default)]
        is_gradient: bool,
    },

    /// Residual format-only widget for datetime columns — owns
    /// `date_format` only. Pair with primitive `Enum` and `Color` fields
    /// for `datetime_color_mode` + `color` to fully decompose datetime
    /// styling.
    DatetimeFormat,
    /// Residual format-only widget for string columns — owns `format`
    /// only. Pair with primitive `Enum` and `Color` fields for
    /// `string_color_mode` + `color` to fully decompose string styling.
    StringFormat,
    NumberSeriesStyle {
        default: NumberSeriesStyleDefaultConfig,
    },
    Symbols {
        default: KeyValueOpts,
    },
    NumberFormat,
    AggregateDepth,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct EnumVariant {
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

impl ControlSpec {
    /// Top-level JSON keys this control owns when its value is serialized
    /// into a column's config map. For primitives this is just `[key]`;
    /// for composites it's the set of fields the wrapped sub-struct
    /// flattens. Used by [`ColumnConfigSchema::active_keys`] to filter the
    /// `columns_config` blob passed to `plugin.restore()`.
    pub fn serialized_keys(&self) -> Vec<&str> {
        match self {
            ControlSpec::DatetimeFormat => vec!["date_format"],
            ControlSpec::StringFormat => vec!["format"],
            ControlSpec::NumberSeriesStyle { .. } => vec!["chart_type", "stack"],
            ControlSpec::Symbols { .. } => vec!["symbols"],
            ControlSpec::NumberFormat => vec!["number_format"],
            ControlSpec::AggregateDepth => vec!["aggregate_depth"],
            ControlSpec::ColorRange {
                key_pos, key_neg, ..
            } => vec![key_pos.as_str(), key_neg.as_str()],
            ControlSpec::Enum { key, .. }
            | ControlSpec::Bool { key, .. }
            | ControlSpec::Number { key, .. }
            | ControlSpec::String { key, .. }
            | ControlSpec::Color { key, .. } => vec![key.as_str()],
        }
    }
}

/// One UI-emitted change to a single schema field. The emitting widget
/// declares which top-level keys the update is allowed to write
/// (`keys` — equivalent to the field's [`ControlSpec::serialized_keys`])
/// and a partial new sub-state (`value`).
///
/// Apply semantics: keys in `keys` are *cleared* from the column's config
/// map, then keys present in `value` are *inserted*. Defaults are
/// pre-stripped by the caller (typically via `skip_serializing_if`), so
/// "no value set for key K" means the schema default applies and K is
/// not serialized.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ColumnConfigFieldUpdate {
    pub keys: Vec<String>,
    pub value: serde_json::Map<String, Value>,
}

/// Filter a per-column config map to only the keys advertised by the
/// active plugin's schema. Foreign keys (left over from a previous plugin)
/// stay in the unfiltered presentation state but never reach `restore()`.
pub fn filter_to_schema(
    config: &serde_json::Map<String, Value>,
    active_keys: &HashSet<String>,
) -> serde_json::Map<String, Value> {
    config
        .iter()
        .filter(|(k, _)| active_keys.contains(k.as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect()
}
