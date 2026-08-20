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

use super::{CssKind, KeyValueOpts, NumberSeriesStyleDefaultConfig};

/// The full schema for one column at one point in time. Plugins may return
/// different schemas for the same column based on the column's current
/// stored value (e.g. to hide dependent fields), so this is re-queried on
/// every field update.
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
    Palette {
        key: String,
        default: String,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<usize>,
    },
    GradientStops {
        key: String,
        default: String,

        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        discrete: bool,
    },
    DatetimeFormat,
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

/// One stop of a [`ControlSpec::GradientStops`] value in its in-memory
/// form: a `#rrggbb` color at `offset` ∈ `[0, 1]`.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct GradientStopSpec {
    pub color: String,
    pub offset: f64,
}

/// The [`ControlSpec::GradientStops`] canonical stop order: offsets
/// clamped to `[0, 1]` and rounded to 3 decimals, stops sorted stably
/// by offset.
pub fn canonicalize_gradient_stops(mut stops: Vec<GradientStopSpec>) -> Vec<GradientStopSpec> {
    for stop in &mut stops {
        stop.offset = (stop.offset.clamp(0.0, 1.0) * 1000.0).round() / 1000.0;
    }

    stops.sort_by(|a, b| {
        a.offset
            .partial_cmp(&b.offset)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    stops
}

/// Fit `stops` to a `discrete` field's fixed pair: an over-length value
/// keeps only its two end colors, pinned to `0`/`1`.
pub fn discrete_pair(stops: Vec<GradientStopSpec>) -> Vec<GradientStopSpec> {
    let stops = canonicalize_gradient_stops(stops);
    match (stops.first(), stops.last()) {
        (Some(first), Some(last)) if stops.len() > 2 => vec![
            GradientStopSpec {
                color: first.color.clone(),
                offset: 0.0,
            },
            GradientStopSpec {
                color: last.color.clone(),
                offset: 1.0,
            },
        ],
        _ => stops,
    }
}

impl ColumnConfigSchema {
    /// Canonicalize every CSS-valued default at schema ingest, dropping
    /// (and logging) fields whose default fails its kind's reader.
    pub fn canonicalize_defaults(mut self) -> Self {
        self.fields.retain_mut(|spec| {
            let (kind, key, default) = match spec {
                ControlSpec::Color { key, default } => (CssKind::Color, key, default),
                ControlSpec::Palette { key, default, .. } => (CssKind::Palette, key, default),
                ControlSpec::GradientStops { key, default, .. } => {
                    (CssKind::Gradient, key, default)
                },
                _ => return true,
            };

            match kind.canonicalize(default) {
                Ok(canonical) => {
                    *default = canonical;
                    true
                },
                Err(error) => {
                    tracing::error!("Dropping `{key}` — invalid schema default: {error}");
                    false
                },
            }
        });

        self
    }

    /// The CSS kind of the control owning `key`, if it is CSS-valued.
    pub fn css_kind_of(&self, key: &str) -> Option<CssKind> {
        self.fields.iter().find_map(|spec| match spec {
            ControlSpec::Color { key: k, .. } if k == key => Some(CssKind::Color),
            ControlSpec::Palette { key: k, .. } if k == key => Some(CssKind::Palette),
            ControlSpec::GradientStops { key: k, .. } if k == key => Some(CssKind::Gradient),
            _ => None,
        })
    }
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
            ControlSpec::Enum { key, .. }
            | ControlSpec::Bool { key, .. }
            | ControlSpec::Number { key, .. }
            | ControlSpec::String { key, .. }
            | ControlSpec::Color { key, .. }
            | ControlSpec::Palette { key, .. }
            | ControlSpec::GradientStops { key, .. } => vec![key.as_str()],
        }
    }
}

/// One UI-emitted change to a single schema field. The emitting widget
/// declares which top-level keys the update is allowed to write
/// (`keys` — equivalent to the field's [`ControlSpec::serialized_keys`])
/// and a partial new sub-state (`value`).
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
