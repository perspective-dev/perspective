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

use perspective_client::config::{ColumnType, WindowFrame, WindowSort, WindowSortDir, WindowSpec};

use crate::session::SessionMetadataRc;

/// The declared capabilities of one window aggregate, for a `source` column
/// type. Which controls an aggregate needs is the data model's to state - the
/// editor cannot infer it from a name it has never seen.
pub(super) fn op_spec(
    metadata: &SessionMetadataRc,
    source: &str,
    op: &str,
) -> Option<perspective_client::proto::WindowAggregateArgs> {
    let ty = metadata.get_column_table_type(source)?;
    metadata.get_window_aggregate(ty, op)
}

/// The editor's frame-type labels, as the `frames` a declaration lists.
pub(super) fn frame_label(frame: &str) -> &'static str {
    match frame {
        "rows" => "Rows",
        "range" => "Range",
        _ => "Cumulative",
    }
}

pub(super) fn frame_name(label: &str) -> &'static str {
    match label {
        "Rows" => "rows",
        "Range" => "range",
        _ => "cumulative",
    }
}

pub(super) fn is_orderable_for_range(ty: ColumnType) -> bool {
    matches!(
        ty,
        ColumnType::Integer | ColumnType::Float | ColumnType::Date | ColumnType::Datetime
    )
}

/// Input mirror of a draft [`WindowSpec`]. Free-text fields hold raw
/// strings so invalid intermediate input is representable; the NUMBER
/// fields are typed with default `1` and can never hold an invalid value -
/// like the Style tab's `NumberField`, a non-numeric or out-of-domain
/// input resets to the default at the keystroke. `validate` produces the
/// spec (or the error shown inline), applying the same rules as `View`
/// construction so a saveable draft cannot be rejected by the engine.
#[derive(Clone, PartialEq)]
pub(super) struct WindowDraft {
    pub(super) op: String,
    pub(super) source: String,
    pub(super) order_by: String,
    pub(super) order_desc: bool,
    pub(super) partition_by: Vec<String>,
    pub(super) frame_type: String,
    pub(super) frame_rows: u32,
    pub(super) frame_range: f64,
    pub(super) offset: u32,
    pub(super) alpha: f64,
}

impl Default for WindowDraft {
    fn default() -> Self {
        Self {
            op: String::default(),
            source: String::default(),
            order_by: String::default(),
            order_desc: false,
            partition_by: vec![],
            frame_type: String::default(),
            frame_rows: 1,
            frame_range: 1.0,
            offset: 1,
            alpha: 1.0,
        }
    }
}

impl WindowDraft {
    pub(super) fn from_spec(spec: &WindowSpec) -> Self {
        let (frame_type, frame_rows, frame_range) = match spec.frame {
            Some(WindowFrame::Rows(n)) => ("Rows", n, 1.0),
            Some(WindowFrame::Range(x)) => ("Range", 1, x),
            Some(WindowFrame::Cumulative) | None => ("Cumulative", 1, 1.0),
        };

        Self {
            op: spec.aggregate.clone(),
            source: spec.column.clone(),
            order_by: spec
                .order_by
                .as_ref()
                .map(|x| x.0.clone())
                .unwrap_or_default(),
            order_desc: spec
                .order_by
                .as_ref()
                .map(|x| x.1 == WindowSortDir::Desc)
                .unwrap_or_default(),
            partition_by: spec.partition_by.clone(),
            frame_type: frame_type.to_string(),
            frame_rows,
            frame_range,
            offset: spec.offset.unwrap_or(1),
            alpha: spec.alpha.unwrap_or(1.0),
        }
    }

    pub(super) fn new_default() -> Self {
        Self {
            op: "sum".to_string(),
            frame_type: "Cumulative".to_string(),
            ..Self::default()
        }
    }

    pub(super) fn validate(&self, metadata: &SessionMetadataRc) -> Result<WindowSpec, String> {
        let op = self.op.clone();

        // Every slot takes true `Table` columns ONLY - expression aliases
        // and other window columns would create dependency cycles (and
        // force delete-blocking). The slots reject non-table drops with the
        // invalid-X overlay, so these are backstops for API-authored specs
        // opened in the editor.
        let table_column = |col: &String| {
            metadata
                .get_table_columns()
                .into_iter()
                .flatten()
                .any(|x| x == col)
        };

        if self.source.is_empty() {
            return Err("Missing Column".to_string());
        }

        if !table_column(&self.source) {
            // TODO I should not be
            return Err(format!(
                "\"{}\" must be a table column to source a window",
                self.source
            ));
        }

        let source_ty = metadata
            .get_column_table_type(&self.source)
            .ok_or_else(|| format!("Unknown source column \"{}\"", self.source))?;

        // Backstop for API-authored specs opened in the editor - the op
        // menu only offers the feature-declared set, so this is
        // unreachable from the UI. The declaration also supplies the
        // controls this op takes, below.
        let declared = metadata
            .get_window_aggregate(source_ty, &op)
            .ok_or_else(|| {
                format!("\"{op}\" is not a supported window aggregate for this column")
            })?;

        // An EMPTY order slot is valid when the backend has a natural row
        // order to fall back on (primary key order in the engine, `rowid`
        // for SQL virtual servers); UNORDERED stores (`Features`) require
        // an explicit order column.
        let order_ty = if self.order_by.is_empty() {
            if metadata
                .get_features()
                .map(|x| x.unordered)
                .unwrap_or_default()
            {
                return Err("Missing Order By".to_string());
            }

            None
        } else {
            if !table_column(&self.order_by) {
                // TODO I should not be
                return Err(format!(
                    "\"{}\" must be a table column to order by",
                    self.order_by
                ));
            }

            Some(
                metadata
                    .get_column_table_type(&self.order_by)
                    .ok_or_else(|| format!("Unknown order by column \"{}\"", self.order_by))?,
            )
        };

        for col in self.partition_by.iter() {
            // TODO I should not be
            if !table_column(col) {
                return Err(format!(
                    "\"{}\" must be a table column to partition by",
                    col
                ));
            }
        }

        // The numeric fields are typed and input-clamped to their domains,
        // so no parse or range errors are reachable here.
        let frame = if declared.frames.is_empty() {
            None
        } else {
            let chosen = frame_name(&self.frame_type);
            if !declared.frames.iter().any(|x| x == chosen) {
                return Err(format!("\"{op}\" does not support a {chosen} frame"));
            }

            match self.frame_type.as_str() {
                "Rows" => Some(WindowFrame::Rows(self.frame_rows)),
                "Range" => {
                    // The natural-order fallback has no units, so `range`
                    // frames require an explicit order column.
                    let Some(order_ty) = order_ty else {
                        return Err("Range frames require an order by column".to_string());
                    };

                    if !is_orderable_for_range(order_ty) {
                        return Err("Range frames require a numeric, date or datetime order by \
                                    column"
                            .to_string());
                    }

                    Some(WindowFrame::Range(self.frame_range))
                },
                _ => None,
            }
        };

        // Emit `None` at the engine default so a spec saved without an
        // explicit `offset` round-trips unchanged (the name-stripped
        // change-detection baseline compares specs structurally).
        let offset = (declared.offset && self.offset != 1).then_some(self.offset);
        let alpha = declared.alpha.then_some(self.alpha);

        let mut partition_by = self.partition_by.clone();
        partition_by.retain(|col| !col.is_empty());

        Ok(WindowSpec {
            column: self.source.clone(),
            aggregate: op,
            partition_by,
            order_by: (!self.order_by.is_empty()).then(|| {
                WindowSort(
                    self.order_by.clone(),
                    if self.order_desc {
                        WindowSortDir::Desc
                    } else {
                        WindowSortDir::Asc
                    },
                )
            }),
            frame,
            offset,
            alpha,
        })
    }
}
