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

use serde::{Deserialize, Serialize};
use strum::{Display, EnumIter};
use ts_rs::TS;

/// Render glyph for a numeric aggregate in the Y Bar plugin. Serialized as
/// a lowercase string to match the plugin's runtime lookup (which does a
/// case-insensitive `chart_type` match against the same literal set).
#[derive(
    Clone, Copy, Debug, Default, Deserialize, Display, EnumIter, Eq, PartialEq, Serialize, TS,
)]
pub enum ChartType {
    #[default]
    #[serde(rename = "bar")]
    Bar,

    #[serde(rename = "line")]
    Line,

    #[serde(rename = "scatter")]
    Scatter,

    #[serde(rename = "area")]
    Area,
}

impl ChartType {
    pub fn is_default(&self) -> bool {
        *self == Self::Bar
    }

    /// Glyphs for which `stack` is a meaningful option. Line/Scatter never
    /// stack; Bar/Area stack by default but can be opted out per column.
    pub fn supports_stack(&self) -> bool {
        matches!(self, Self::Bar | Self::Area)
    }
}

/// Per-column render-style config for numeric aggregates in series charts
/// (currently Y Bar). Flattened into `ColumnConfigValues`, so the JSON
/// shape at the viewer boundary is `{ "chart_type": "line", "stack": false }`.
///
/// Default `Bar` + `None` stack serializes as an empty object so plugins
/// that never touch these fields don't pay any JSON overhead.
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq, TS)]
pub struct NumberSeriesStyleConfig {
    #[serde(default)]
    #[serde(skip_serializing_if = "ChartType::is_default")]
    pub chart_type: ChartType,

    /// Stack override. `None` means "use the glyph default"
    /// (Bar/Area stack, Line/Scatter don't). `Some(false)` on a Bar/Area
    /// forces non-stacking.
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack: Option<bool>,
}

/// Defaults-only shape returned by `plugin.column_style_controls`. Presence
/// of `Some(...)` on `ColumnStyleOpts.number_series_style` is the signal
/// for the sidebar to render the chart-type picker.
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct NumberSeriesStyleDefaultConfig {
    pub chart_type: ChartType,
    #[serde(default)]
    pub stack: Option<bool>,
}
