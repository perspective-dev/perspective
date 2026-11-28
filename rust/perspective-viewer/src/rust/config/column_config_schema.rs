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
use serde_json::{Map, Value};

use super::{ChartType, CustomNumberFormatConfig, DatetimeFormat, NumberSeriesStyleDefaultConfig};
use crate::utils::{CssKind, GradientStopSpec, canonicalize_gradient_stops};

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

/// A per-column statistic a [`ControlSpec::Number`] may take its default from.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberStat {
    /// The largest absolute value in the column.
    AbsMax,
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

    /// A CSS `font-family` picked from the generic keywords plus the families
    /// the host can enumerate, with optional size, bold and italic inputs
    /// each bound to its own key.
    Font {
        key: String,
        default: String,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        size: Option<FontSize>,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        bold: Option<FontToggle>,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        italic: Option<FontToggle>,
    },
    /// A 3×3 anchor picker whose value is one of the nine [`Alignment`]
    /// tokens.
    Alignment {
        key: String,

        /// The cell shown as the unmodified value and elided from serialized
        /// configs, or `None` when an unset key stands for something no cell
        /// can show.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default: Option<Alignment>,

        /// Only the four corner cells are selectable.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        corners: bool,
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

        /// The column statistic the HOST substitutes for `default`, once it has
        /// fetched it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default_stat: Option<NumberStat>,
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
        default: Option<DatetimeFormat>,
    },
    NumberSeriesStyle {
        default: NumberSeriesStyleDefaultConfig,
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

/// One cell of a 3×3 anchor grid: a corner `top-left`/`top-right`/
/// `bottom-left`/`bottom-right`, an edge `top`/`left`/`right`/`bottom`, or
/// `center`.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Alignment {
    TopLeft,
    Top,
    TopRight,
    Left,
    Center,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
}

impl Alignment {
    /// Every cell in row-major order.
    pub const ALL: [Alignment; 9] = [
        Alignment::TopLeft,
        Alignment::Top,
        Alignment::TopRight,
        Alignment::Left,
        Alignment::Center,
        Alignment::Right,
        Alignment::BottomLeft,
        Alignment::Bottom,
        Alignment::BottomRight,
    ];
    pub const CORNERS: [Alignment; 4] = [
        Alignment::TopLeft,
        Alignment::TopRight,
        Alignment::BottomLeft,
        Alignment::BottomRight,
    ];

    pub fn is_corner(self) -> bool {
        Self::CORNERS.contains(&self)
    }

    /// The serialized token.
    pub fn as_str(self) -> &'static str {
        match self {
            Alignment::TopLeft => "top-left",
            Alignment::Top => "top",
            Alignment::TopRight => "top-right",
            Alignment::Left => "left",
            Alignment::Center => "center",
            Alignment::Right => "right",
            Alignment::BottomLeft => "bottom-left",
            Alignment::Bottom => "bottom",
            Alignment::BottomRight => "bottom-right",
        }
    }

    pub fn parse(src: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|x| x.as_str() == src)
    }

    /// `Top Left`-style text for accessible names.
    pub fn humanized(self) -> String {
        self.as_str()
            .split('-')
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// One boolean style toggle of a [`ControlSpec::Font`] control: the
/// config key it writes and the value that counts as "not set".
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FontToggle {
    pub key: String,
    #[serde(default)]
    pub default: bool,
}

/// The size input of a [`ControlSpec::Font`] control: a number (CSS px)
/// under its own key, elided from serialized configs at `default`.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct FontSize {
    pub key: String,
    pub default: f64,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct EnumVariant {
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
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

    /// Replace the `default` of every [`ControlSpec::Number`] that declares a
    /// `default_stat` with that statistic, where the host has it.
    pub fn resolve_stat_defaults(mut self, abs_max: Option<f64>) -> Self {
        fn walk(fields: &mut [ControlSpec], abs_max: Option<f64>) {
            for spec in fields {
                match spec {
                    ControlSpec::Group { fields, .. } => walk(fields, abs_max),
                    ControlSpec::Number {
                        default,
                        default_stat: Some(NumberStat::AbsMax),
                        ..
                    } => {
                        if let Some(abs_max) = abs_max {
                            *default = abs_max;
                        }
                    },
                    _ => {},
                }
            }
        }

        walk(&mut self.fields, abs_max);
        self
    }

    pub fn group_format_controls(mut self) -> Self {
        fn is_format(spec: &ControlSpec) -> bool {
            matches!(
                spec,
                ControlSpec::NumberFormat { .. } | ControlSpec::DatetimeFormat { .. }
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
                    ControlSpec::Alignment {
                        key,
                        default: Some(default),
                        corners: true,
                    } if !default.is_corner() => {
                        tracing::error!(
                            "Dropping `{key}` — default `{}` is not a corner",
                            default.as_str()
                        );

                        return false;
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

    /// The variants of the [`ControlSpec::Enum`] owning `key`, if any.
    pub fn enum_variants_of(&self, key: &str) -> Option<&[EnumVariant]> {
        self.leaf_fields().into_iter().find_map(|spec| match spec {
            ControlSpec::Enum {
                key: k, variants, ..
            } if k == key => Some(variants.as_slice()),
            _ => None,
        })
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
            ControlSpec::Font {
                key,
                size,
                bold,
                italic,
                ..
            } => [
                Some(key.as_str()),
                size.as_ref().map(|s| s.key.as_str()),
                bold.as_ref().map(|t| t.key.as_str()),
                italic.as_ref().map(|t| t.key.as_str()),
            ]
            .into_iter()
            .flatten()
            .collect(),
            ControlSpec::NumberSeriesStyle { .. } => vec!["chart_type", "stack"],
            ControlSpec::NumberFormat { .. } => vec!["number_format"],
            ControlSpec::AggregateDepth => vec!["aggregate_depth"],
            ControlSpec::Enum { key, .. }
            | ControlSpec::Alignment { key, .. }
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

/// Default overrides resolved for one schema: the value each overridden key
/// resolves to across the override layers alone, keyed by serialized key.
pub type OverrideValues = Map<String, Value>;

impl ColumnConfigSchema {
    /// Substitute the values `layers` resolve to into this schema's defaults,
    /// returning the override-only value of every key applied and the rejected
    /// `(key, error)` pairs.
    pub fn apply_defaults(
        &mut self,
        layers: &[&Map<String, Value>],
        is_float: bool,
    ) -> (OverrideValues, Vec<(String, String)>) {
        let (resolved, mut errors) = resolve_layers(layers);
        let mut applied = OverrideValues::new();
        fn walk(
            fields: &mut [ControlSpec],
            resolved: &OverrideValues,
            is_float: bool,
            applied: &mut OverrideValues,
            errors: &mut Vec<(String, String)>,
        ) {
            for spec in fields {
                if let ControlSpec::Group { fields, .. } = spec {
                    walk(fields, resolved, is_float, applied, errors);
                    continue;
                }

                let keys: Vec<String> = spec
                    .serialized_keys()
                    .into_iter()
                    .map(str::to_owned)
                    .collect();

                for key in keys {
                    let Some(value) = resolved.get(&key) else {
                        continue;
                    };

                    match spec.apply_default(&key, value, is_float) {
                        Ok(Some(delivered)) => {
                            applied.insert(key, delivered);
                        },
                        Ok(None) => {},
                        Err(error) => errors.push((key, error)),
                    }
                }
            }
        }

        walk(
            &mut self.fields,
            &resolved,
            is_float,
            &mut applied,
            &mut errors,
        );

        (applied, errors)
    }
}

/// The value each key resolves to across `layers`, lowest first: the highest
/// layer's value for plain keys, and the layered fold for `date_format` and
/// `number_format`.
fn resolve_layers(layers: &[&Map<String, Value>]) -> (OverrideValues, Vec<(String, String)>) {
    let mut resolved = OverrideValues::new();
    let mut errors = vec![];
    let mut date_format: Option<DatetimeFormat> = None;
    let mut number_format: Option<CustomNumberFormatConfig> = None;
    for layer in layers {
        for (key, value) in layer.iter() {
            match key.as_str() {
                "date_format" => match serde_json::from_value::<DatetimeFormat>(value.clone())
                    .map_err(|e| e.to_string())
                    .and_then(|f| f.validate().map(|_| f))
                {
                    Ok(format) => {
                        date_format = Some(date_format.unwrap_or_default().overlay(&format));
                    },
                    Err(error) => errors.push((key.clone(), error)),
                },
                "number_format" => {
                    match serde_json::from_value::<CustomNumberFormatConfig>(value.clone()) {
                        Ok(format) => {
                            number_format =
                                Some(number_format.unwrap_or_default().overlay(&format));
                        },
                        Err(error) => errors.push((key.clone(), error.to_string())),
                    }
                },
                _ => {
                    resolved.insert(key.clone(), value.clone());
                },
            }
        }
    }

    if let Some(format) = date_format.and_then(|f| serde_json::to_value(f).ok()) {
        resolved.insert("date_format".to_owned(), format);
    }

    if let Some(format) = number_format.and_then(|f| serde_json::to_value(f).ok()) {
        resolved.insert("number_format".to_owned(), format);
    }

    (resolved, errors)
}

fn expect_str(value: &Value) -> Result<&str, String> {
    value
        .as_str()
        .ok_or_else(|| format!("expected a string, got `{value}`"))
}

fn expect_bool(value: &Value) -> Result<bool, String> {
    value
        .as_bool()
        .ok_or_else(|| format!("expected a boolean, got `{value}`"))
}

fn expect_number(value: &Value, min: Option<f64>, max: Option<f64>) -> Result<f64, String> {
    let num = value
        .as_f64()
        .ok_or_else(|| format!("expected a number, got `{value}`"))?;

    if min.is_some_and(|min| num < min) || max.is_some_and(|max| num > max) {
        return Err(format!(
            "{num} is outside {}..={}",
            min.map(|x| x.to_string()).unwrap_or_default(),
            max.map(|x| x.to_string()).unwrap_or_default()
        ));
    }

    Ok(num)
}

impl ControlSpec {
    /// Substitute the resolved default override `value` for `key` into this
    /// control, returning the value to deliver for it, or `None` when it does
    /// not own `key`.
    pub fn apply_default(
        &mut self,
        key: &str,
        value: &Value,
        is_float: bool,
    ) -> Result<Option<Value>, String> {
        match self {
            ControlSpec::Enum {
                key: k,
                variants,
                default,
            } if k == key => {
                let value = expect_str(value)?;
                if !variants.iter().any(|v| v.value == value) {
                    let expected = variants
                        .iter()
                        .map(|v| format!("`{}`", v.value))
                        .collect::<Vec<_>>()
                        .join(", ");

                    return Err(format!("`{value}` is not one of {expected}"));
                }

                *default = value.to_owned();
            },
            ControlSpec::Font {
                key: k, default, ..
            } if k == key => {
                *default = expect_str(value)?.to_owned();
            },
            ControlSpec::Font {
                size: Some(size), ..
            } if size.key == key => {
                size.default = expect_number(value, size.min, size.max)?;
            },
            ControlSpec::Font { bold, italic, .. }
                if [&*bold, &*italic]
                    .into_iter()
                    .flatten()
                    .any(|toggle| toggle.key == key) =>
            {
                let value = expect_bool(value)?;
                for toggle in [bold, italic].into_iter().flatten() {
                    if toggle.key == key {
                        toggle.default = value;
                    }
                }
            },
            ControlSpec::Alignment {
                key: k,
                default,
                corners,
            } if k == key => {
                let src = expect_str(value)?;
                let alignment =
                    Alignment::parse(src).ok_or_else(|| format!("`{src}` is not an alignment"))?;

                if *corners && !alignment.is_corner() {
                    return Err(format!("`{src}` is not a corner"));
                }

                *default = Some(alignment);
            },
            ControlSpec::Bool { key: k, default } if k == key => {
                *default = expect_bool(value)?;
            },
            ControlSpec::Number {
                key: k,
                default,
                min,
                max,
                default_stat,
                ..
            } if k == key => {
                *default = expect_number(value, *min, *max)?;
                *default_stat = None;
            },
            ControlSpec::String {
                key: k, default, ..
            } if k == key => {
                *default = expect_str(value)?.to_owned();
            },
            ControlSpec::Color { key: k, default } if k == key => {
                *default = CssKind::Color.canonicalize(expect_str(value)?)?;
                return Ok(Some(Value::String(default.clone())));
            },
            ControlSpec::Palette {
                key: k, default, ..
            } if k == key => {
                *default = CssKind::Palette.canonicalize(expect_str(value)?)?;
                return Ok(Some(Value::String(default.clone())));
            },
            ControlSpec::GradientStops {
                key: k, default, ..
            } if k == key => {
                *default = CssKind::Gradient.canonicalize(expect_str(value)?)?;
                return Ok(Some(Value::String(default.clone())));
            },
            ControlSpec::DatetimeFormat { default } if key == "date_format" => {
                let format: DatetimeFormat =
                    serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;

                *default = Some(default.clone().unwrap_or_default().overlay(&format));
            },
            ControlSpec::NumberFormat { default } if key == "number_format" => {
                let format: CustomNumberFormatConfig =
                    serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;

                let resolved = default.clone().unwrap_or_default().overlay(&format);
                resolved.validate(is_float)?;
                *default = Some(resolved);
            },
            ControlSpec::NumberSeriesStyle { default } if key == "chart_type" => {
                default.chart_type = serde_json::from_value::<ChartType>(value.clone())
                    .map_err(|e| e.to_string())?;
            },
            ControlSpec::NumberSeriesStyle { default } if key == "stack" => {
                default.stack = Some(expect_bool(value)?);
            },
            ControlSpec::AggregateDepth if key == "aggregate_depth" => {
                return Err("`aggregate_depth` has no overridable default".to_owned());
            },
            _ => return Ok(None),
        }

        Ok(Some(value.clone()))
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
