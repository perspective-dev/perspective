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

use super::{
    CssKind, CustomNumberFormatConfig, DatetimeFormatType, KeyValueOpts,
    NumberSeriesStyleDefaultConfig,
};

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

    pub fn leaf_fields(&self) -> Vec<&ControlSpec> {
        fn collect<'a>(fields: &'a [ControlSpec], out: &mut Vec<&'a ControlSpec>) {
            for spec in fields {
                match spec {
                    ControlSpec::Group { fields, .. } => collect(fields, out),
                    leaf => out.push(leaf),
                }
            }
        }

        let mut out = vec![];
        collect(&self.fields, &mut out);
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
    DatetimeFormat {
        /// Plugin-declared default `date_format`, shown by the editor in
        /// unedited fields and elided from serialized configs.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default: Option<DatetimeFormatType>,
    },
    StringFormat,
    NumberSeriesStyle {
        default: NumberSeriesStyleDefaultConfig,
    },
    Symbols {
        default: KeyValueOpts,
    },
    NumberFormat {
        /// Plugin-declared default format, keyed like `number_format`
        /// itself.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default: Option<CustomNumberFormatConfig>,
    },
    AggregateDepth,

    Group {
        key: String,
        #[serde(default)]
        fields: Vec<ControlSpec>,
    },
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
    pub fn canonicalize(self) -> Self {
        self.canonicalize_defaults().group_format_controls()
    }

    pub fn group_format_controls(mut self) -> Self {
        fn is_format(spec: &ControlSpec) -> bool {
            matches!(
                spec,
                ControlSpec::NumberFormat { .. }
                    | ControlSpec::DatetimeFormat { .. }
                    | ControlSpec::StringFormat
            )
        }

        fn walk(fields: &mut Vec<ControlSpec>) {
            for spec in fields.iter_mut() {
                if let ControlSpec::Group { key, fields } = spec
                    && key != "format"
                {
                    walk(fields);
                }
            }

            let first = fields.iter().position(is_format);
            if let Some(first) = first {
                let mut formats = vec![];
                let mut i = first;
                while i < fields.len() {
                    if is_format(&fields[i]) {
                        formats.push(fields.remove(i));
                    } else {
                        i += 1;
                    }
                }

                fields.insert(first, ControlSpec::Group {
                    key: "format".to_owned(),
                    fields: formats,
                });
            }
        }

        walk(&mut self.fields);
        self
    }

    /// Canonicalize every CSS-valued default at schema ingest, dropping
    /// (and logging) fields whose default fails its kind's reader.
    pub fn canonicalize_defaults(mut self) -> Self {
        fn canonicalize_specs(fields: &mut Vec<ControlSpec>) {
            fields.retain_mut(|spec| {
                let (kind, key, default) = match spec {
                    ControlSpec::Group { fields, .. } => {
                        canonicalize_specs(fields);
                        return !fields.is_empty();
                    },
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
        }

        canonicalize_specs(&mut self.fields);
        self
    }

    /// The CSS kind of the control owning `key`, if it is CSS-valued.
    pub fn css_kind_of(&self, key: &str) -> Option<CssKind> {
        self.leaf_fields().into_iter().find_map(|spec| match spec {
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
            ControlSpec::DatetimeFormat { .. } => vec!["date_format"],
            ControlSpec::StringFormat => vec!["format"],
            ControlSpec::NumberSeriesStyle { .. } => vec!["chart_type", "stack"],
            ControlSpec::Symbols { .. } => vec!["symbols"],
            ControlSpec::NumberFormat { .. } => vec!["number_format"],
            ControlSpec::AggregateDepth => vec!["aggregate_depth"],
            ControlSpec::Enum { key, .. }
            | ControlSpec::Bool { key, .. }
            | ControlSpec::Number { key, .. }
            | ControlSpec::String { key, .. }
            | ControlSpec::Color { key, .. }
            | ControlSpec::Palette { key, .. }
            | ControlSpec::GradientStops { key, .. } => vec![key.as_str()],
            ControlSpec::Group { fields, .. } => {
                fields.iter().flat_map(|f| f.serialized_keys()).collect()
            },
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn color(key: &str, default: &str) -> ControlSpec {
        ControlSpec::Color {
            key: key.to_owned(),
            default: default.to_owned(),
        }
    }

    fn flag(key: &str) -> ControlSpec {
        ControlSpec::Bool {
            key: key.to_owned(),
            default: false,
        }
    }

    fn group(key: &str, fields: Vec<ControlSpec>) -> ControlSpec {
        ControlSpec::Group {
            key: key.to_owned(),
            fields,
        }
    }

    #[test]
    fn group_deserializes_recursively() {
        let schema: ColumnConfigSchema = serde_json::from_value(json!({
            "fields": [{
                "kind": "Group",
                "key": "legend",
                "fields": [
                    { "kind": "Bool", "key": "legend_on", "default": false },
                    {
                        "kind": "Group",
                        "key": "inner",
                        "fields": [{ "kind": "Color", "key": "color", "default": "#ff0000" }]
                    }
                ]
            }]
        }))
        .unwrap();

        let keys = schema.active_keys();
        assert_eq!(
            keys,
            HashSet::from(["legend_on".to_owned(), "color".to_owned()])
        );

        let leaves = schema.leaf_fields();
        assert_eq!(leaves.len(), 2);
        assert!(
            leaves
                .iter()
                .all(|s| !matches!(s, ControlSpec::Group { .. }))
        );
    }

    #[test]
    fn grouped_schema_is_equivalent_to_flat() {
        let flat = ColumnConfigSchema {
            fields: vec![flag("stack"), color("color", "#0366d6")],
        };

        let grouped = ColumnConfigSchema {
            fields: vec![group("series", vec![
                flag("stack"),
                color("color", "#0366d6"),
            ])],
        };

        assert_eq!(flat.active_keys(), grouped.active_keys());
        assert_eq!(flat.css_kind_of("color"), grouped.css_kind_of("color"));
        assert_eq!(flat.css_kind_of("stack"), grouped.css_kind_of("stack"));
    }

    #[test]
    fn format_controls_group_and_merge() {
        let schema = ColumnConfigSchema {
            fields: vec![
                ControlSpec::NumberFormat { default: None },
                flag("flag"),
                ControlSpec::StringFormat,
            ],
        }
        .group_format_controls();

        assert_eq!(schema.fields.len(), 2);
        let ControlSpec::Group { key, fields } = &schema.fields[0] else {
            panic!("expected format group first");
        };

        assert_eq!(key, "format");
        assert!(matches!(fields[0], ControlSpec::NumberFormat { .. }));
        assert!(matches!(fields[1], ControlSpec::StringFormat));
        assert!(matches!(&schema.fields[1], ControlSpec::Bool { .. }));

        assert_eq!(
            schema.active_keys(),
            HashSet::from([
                "number_format".to_owned(),
                "format".to_owned(),
                "flag".to_owned()
            ])
        );
    }

    #[test]
    fn format_grouping_recurses_but_never_double_wraps() {
        let schema = ColumnConfigSchema {
            fields: vec![
                group("format", vec![ControlSpec::NumberFormat { default: None }]),
                group("styling", vec![flag("x"), ControlSpec::DatetimeFormat {
                    default: None,
                }]),
            ],
        }
        .group_format_controls();

        let ControlSpec::Group { key, fields } = &schema.fields[0] else {
            panic!("expected group");
        };

        assert_eq!(key, "format");
        assert!(matches!(fields[0], ControlSpec::NumberFormat { .. }));

        let ControlSpec::Group { fields, .. } = &schema.fields[1] else {
            panic!("expected group");
        };

        assert!(matches!(
            &fields[1],
            ControlSpec::Group { key, fields }
                if key == "format" && matches!(fields[0], ControlSpec::DatetimeFormat { .. })
        ));
    }

    #[test]
    fn format_controls_deserialize_without_default_payload() {
        let schema: ColumnConfigSchema = serde_json::from_value(json!({
            "fields": [{ "kind": "NumberFormat" }, { "kind": "DatetimeFormat" }]
        }))
        .unwrap();

        assert!(matches!(&schema.fields[0], ControlSpec::NumberFormat {
            default: None
        }));
        assert!(matches!(&schema.fields[1], ControlSpec::DatetimeFormat {
            default: None
        }));
    }

    #[test]
    fn number_format_default_payload_deserializes_flattened_families() {
        let schema: ColumnConfigSchema = serde_json::from_value(json!({
            "fields": [{
                "kind": "NumberFormat",
                "default": {
                    "notation": "compact",
                    "compactDisplay": "short",
                    "minimumFractionDigits": 0,
                    "maximumFractionDigits": 1
                }
            }]
        }))
        .unwrap();

        let ControlSpec::NumberFormat {
            default: Some(default),
        } = &schema.fields[0]
        else {
            panic!("expected NumberFormat with default");
        };

        assert_eq!(
            default._notation,
            Some(crate::config::Notation::Compact(
                crate::config::CompactDisplay::Short
            ))
        );
        assert_eq!(default._style, None);
        assert_eq!(default.minimum_fraction_digits, Some(0.));
        assert_eq!(default.maximum_fraction_digits, Some(1.));
        assert_eq!(
            schema.active_keys(),
            HashSet::from(["number_format".to_owned()])
        );
    }

    #[test]
    fn datetime_format_default_payload_deserializes_simple_arm() {
        let schema: ColumnConfigSchema = serde_json::from_value(json!({
            "fields": [{
                "kind": "DatetimeFormat",
                "default": { "dateStyle": "medium", "timeStyle": "disabled" }
            }]
        }))
        .unwrap();

        let ControlSpec::DatetimeFormat {
            default: Some(DatetimeFormatType::Simple(simple)),
        } = &schema.fields[0]
        else {
            panic!("expected DatetimeFormat with Simple default");
        };

        assert_eq!(
            simple.date_style,
            crate::config::SimpleDatetimeFormat::Medium
        );
        assert_eq!(
            simple.time_style,
            crate::config::SimpleDatetimeFormat::Disabled
        );
    }

    #[test]
    fn canonicalize_defaults_recurses_and_drops_empty_groups() {
        let schema = ColumnConfigSchema {
            fields: vec![
                group("ok", vec![color("good", "RGB(255,0,0)"), flag("flag")]),
                group("doomed", vec![color("bad", "not-a-color")]),
            ],
        }
        .canonicalize_defaults();

        assert_eq!(schema.fields.len(), 1);
        let ControlSpec::Group { key, fields } = &schema.fields[0] else {
            panic!("expected group");
        };

        assert_eq!(key, "ok");
        assert!(matches!(
            &fields[0],
            ControlSpec::Color { default, .. } if default == "#ff0000"
        ));
    }
}
