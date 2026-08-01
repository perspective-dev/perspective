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

//! Window columns are ordered, partitioned rolling computations over the rows
//! of a [`crate::Table`], declared per-[`crate::View`] like expression
//! columns - the analogue of SQL window functions. Each [`WindowSpec`]
//! produces a new output column, named by its key in the `windows` map
//! (`{"name": {...spec}}`, symmetric with `expressions`), which may be
//! used anywhere a `Table` column can: `columns`, `filter`, `sort`,
//! `group_by`, etc. Window columns update incrementally as the `Table`
//! updates, including rows _outside_ an update batch whose window frames
//! were affected by it.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::proto;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum WindowAggregate {
    Sum,
    Avg,
    Count,
    Min,
    Max,
    Stddev,
    Var,
    First,
    Last,
    Lag,
    Lead,
    Diff,
    Rate,
    Ema,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowFrame {
    Rows(u32),
    Range(f64),
    Cumulative,
}

/// A window's order direction. A dedicated two-variant enum rather than
/// [`crate::config::SortDir`] - the column-sort extras (`col asc`, `abs`,
/// `none`) are meaningless inside a window frame and unrepresentable here.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum WindowSortDir {
    #[default]
    Asc,
    Desc,
}

impl std::fmt::Display for WindowSortDir {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        })
    }
}

/// The `Table` column which orders each partition, with its direction -
/// serialized as a two-element array (`["ts", "desc"]`), symmetric with the
/// `ViewConfig`'s `sort` field.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
pub struct WindowSort(pub String, pub WindowSortDir);

/// The window columns of a `ViewConfig`, keyed by output column alias -
/// symmetric with `expressions` (`{"name": {...spec}}`). An alias must not
/// collide with a `Table` column, expression alias, or another window's
/// key.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct Windows(#[ts(as = "HashMap<String, RawWindowSpec>")] pub HashMap<String, WindowSpec>);

impl std::ops::Deref for Windows {
    type Target = HashMap<String, WindowSpec>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for Windows {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

/// A declaration of a single window column, named by its key in
/// [`Windows`]. See the [module docs](self) for the computation model.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(try_from = "RawWindowSpec", into = "RawWindowSpec")]
pub struct WindowSpec {
    pub column: String,
    pub aggregate: WindowAggregate,
    pub partition_by: Vec<String>,
    pub order_by: Option<WindowSort>,
    pub frame: Option<WindowFrame>,
    pub offset: Option<u32>,
    pub alpha: Option<f64>,
}

/// The serialized form of [`WindowSpec`].
#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(rename = "WindowSpec")]
struct RawWindowSpec {
    /// The input column - either a real `Table` column or an expression
    /// alias from the same `ViewConfig`.
    column: String,

    aggregate: WindowAggregate,

    /// Columns whose distinct value tuples partition the rows; empty
    /// partitions the whole `Table` as one group.
    #[serde(default)]
    #[serde(skip_serializing_if = "Vec::is_empty")]
    partition_by: Vec<String>,

    /// The `Table` column which orders each partition, and the direction.
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    order_by: Option<WindowSort>,

    /// A frame of the `rows` preceding each row, plus the row itself.
    /// Mutually exclusive with `range` and `cumulative`.
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    rows: Option<u32>,

    /// A frame of the rows whose `order_by` value lies within `range` of
    /// each row's, requiring a numeric or temporal `order_by`. Mutually
    /// exclusive with `rows` and `cumulative`.
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    range: Option<f64>,

    /// `true` frames all rows from the partition start through each row.
    /// Default can be omitted.
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    cumulative: Option<bool>,

    /// Row offset for `lag`/`lead` (default 1).
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,

    /// Smoothing factor in `(0, 1]` for `ema`.
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    alpha: Option<f64>,
}

impl From<WindowSpec> for RawWindowSpec {
    fn from(value: WindowSpec) -> Self {
        let (rows, range, cumulative) = match value.frame {
            Some(WindowFrame::Rows(n)) => (Some(n), None, None),
            Some(WindowFrame::Range(x)) => (None, Some(x), None),
            Some(WindowFrame::Cumulative) => (None, None, Some(true)),
            None => (None, None, None),
        };

        RawWindowSpec {
            column: value.column,
            aggregate: value.aggregate,
            partition_by: value.partition_by,
            order_by: value.order_by,
            rows,
            range,
            cumulative,
            offset: value.offset,
            alpha: value.alpha,
        }
    }
}

impl TryFrom<RawWindowSpec> for WindowSpec {
    type Error = String;

    fn try_from(value: RawWindowSpec) -> Result<Self, Self::Error> {
        let frame = match (value.rows, value.range, value.cumulative) {
            (None, None, None) => None,
            (Some(n), None, None) => Some(WindowFrame::Rows(n)),
            (None, Some(x), None) => Some(WindowFrame::Range(x)),
            (None, None, Some(true)) => Some(WindowFrame::Cumulative),
            (None, None, Some(false)) => {
                return Err("`cumulative` must be `true` when present".to_string());
            },
            _ => {
                return Err("`rows`, `range` and `cumulative` are mutually exclusive".to_string());
            },
        };

        Ok(WindowSpec {
            column: value.column,
            aggregate: value.aggregate,
            partition_by: value.partition_by,
            order_by: value.order_by,
            frame,
            offset: value.offset,
            alpha: value.alpha,
        })
    }
}

impl From<WindowAggregate> for proto::WindowAggregate {
    fn from(value: WindowAggregate) -> Self {
        match value {
            WindowAggregate::Sum => Self::Sum,
            WindowAggregate::Avg => Self::Avg,
            WindowAggregate::Count => Self::Count,
            WindowAggregate::Min => Self::Min,
            WindowAggregate::Max => Self::Max,
            WindowAggregate::Stddev => Self::Stddev,
            WindowAggregate::Var => Self::Var,
            WindowAggregate::First => Self::First,
            WindowAggregate::Last => Self::Last,
            WindowAggregate::Lag => Self::Lag,
            WindowAggregate::Lead => Self::Lead,
            WindowAggregate::Diff => Self::Diff,
            WindowAggregate::Rate => Self::Rate,
            WindowAggregate::Ema => Self::Ema,
        }
    }
}

impl From<proto::WindowAggregate> for WindowAggregate {
    fn from(value: proto::WindowAggregate) -> Self {
        match value {
            proto::WindowAggregate::Sum => Self::Sum,
            proto::WindowAggregate::Avg => Self::Avg,
            proto::WindowAggregate::Count => Self::Count,
            proto::WindowAggregate::Min => Self::Min,
            proto::WindowAggregate::Max => Self::Max,
            proto::WindowAggregate::Stddev => Self::Stddev,
            proto::WindowAggregate::Var => Self::Var,
            proto::WindowAggregate::First => Self::First,
            proto::WindowAggregate::Last => Self::Last,
            proto::WindowAggregate::Lag => Self::Lag,
            proto::WindowAggregate::Lead => Self::Lead,
            proto::WindowAggregate::Diff => Self::Diff,
            proto::WindowAggregate::Rate => Self::Rate,
            proto::WindowAggregate::Ema => Self::Ema,
        }
    }
}

impl From<WindowFrame> for proto::window_spec::Frame {
    fn from(value: WindowFrame) -> Self {
        match value {
            WindowFrame::Rows(n) => Self::Rows(n),
            WindowFrame::Range(x) => Self::Range(x),
            WindowFrame::Cumulative => Self::Cumulative(0),
        }
    }
}

impl From<proto::window_spec::Frame> for WindowFrame {
    fn from(value: proto::window_spec::Frame) -> Self {
        match value {
            proto::window_spec::Frame::Rows(n) => Self::Rows(n),
            proto::window_spec::Frame::Range(x) => Self::Range(x),
            proto::window_spec::Frame::Cumulative(_) => Self::Cumulative,
        }
    }
}

impl From<WindowSort> for proto::window_spec::Order {
    fn from(value: WindowSort) -> Self {
        proto::window_spec::Order {
            column: value.0,
            desc: value.1 == WindowSortDir::Desc,
        }
    }
}

impl From<proto::window_spec::Order> for WindowSort {
    fn from(value: proto::window_spec::Order) -> Self {
        WindowSort(
            value.column,
            if value.desc {
                WindowSortDir::Desc
            } else {
                WindowSortDir::Asc
            },
        )
    }
}

impl From<WindowSpec> for proto::WindowSpec {
    fn from(value: WindowSpec) -> Self {
        proto::WindowSpec {
            source: value.column,
            op: proto::WindowAggregate::from(value.aggregate) as i32,
            partition_by: value.partition_by,
            order_by: value.order_by.map(|x| x.into()),
            frame: value.frame.map(|x| x.into()),
            offset: value.offset,
            alpha: value.alpha,
        }
    }
}

impl From<proto::WindowSpec> for WindowSpec {
    fn from(value: proto::WindowSpec) -> Self {
        WindowSpec {
            column: value.source,
            aggregate: proto::WindowAggregate::try_from(value.op)
                .unwrap_or(proto::WindowAggregate::Sum)
                .into(),
            partition_by: value.partition_by,
            order_by: value.order_by.map(WindowSort::from),
            frame: value.frame.map(|x| x.into()),
            offset: value.offset,
            alpha: value.alpha,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(frame: Option<WindowFrame>) -> WindowSpec {
        WindowSpec {
            column: "price".to_string(),
            aggregate: WindowAggregate::Sum,
            partition_by: vec![],
            order_by: None,
            frame,
            offset: None,
            alpha: None,
        }
    }

    #[test]
    fn test_frame_roundtrips_flattened() {
        for (frame, json) in [
            (None, r#"{"column":"price","aggregate":"sum"}"#),
            (
                Some(WindowFrame::Rows(19)),
                r#"{"column":"price","aggregate":"sum","rows":19}"#,
            ),
            (
                Some(WindowFrame::Range(5000.0)),
                r#"{"column":"price","aggregate":"sum","range":5000.0}"#,
            ),
            (
                Some(WindowFrame::Cumulative),
                r#"{"column":"price","aggregate":"sum","cumulative":true}"#,
            ),
        ] {
            assert_eq!(serde_json::to_string(&spec(frame)).unwrap(), json);
            assert_eq!(
                serde_json::from_str::<WindowSpec>(json).unwrap(),
                spec(frame)
            );
        }
    }

    #[test]
    fn test_frame_rejects_invalid_combinations() {
        for json in [
            r#"{"column":"price","aggregate":"sum","rows":19,"range":1.0}"#,
            r#"{"column":"price","aggregate":"sum","rows":19,"cumulative":true}"#,
            r#"{"column":"price","aggregate":"sum","cumulative":false}"#,
            r#"{"column":"price","aggregate":"sum","frame":"cumulative"}"#,
            r#"{"column":"price","aggregate":"sum","rowz":19}"#,
        ] {
            assert!(serde_json::from_str::<WindowSpec>(json).is_err(), "{json}");
        }
    }
}
