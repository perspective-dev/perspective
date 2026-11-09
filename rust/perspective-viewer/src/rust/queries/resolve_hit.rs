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

use perspective_client::TableIndex;
use perspective_client::config::{Filter, Scalar, ViewConfig, ViewConfigUpdate};
use perspective_js::utils::*;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use crate::config::{PerspectiveHit, PerspectiveHitKind, PerspectiveHitRef};

/// The frame's coordinates and column identities, read once per resolution.
#[derive(Deserialize)]
struct FrameMeta {
    start_row: u32,
    start_col: u32,
    paths: Vec<String>,
    column_paths: Vec<Vec<Scalar>>,
}

/// A plugin's viewport read, the source of every hit resolved against it.
pub struct ViewFrame {
    meta: FrameMeta,
    data: JsValue,
}

impl ViewFrame {
    pub fn new(frame: &JsValue) -> ApiResult<Self> {
        let meta: FrameMeta = frame.into_serde_ext()?;
        let data = js_sys::Reflect::get(frame, &"data".into())?;
        if !data.is_object() {
            return Err(ApiError::new("`frame.data` must be an object"));
        }

        Ok(Self { meta, data })
    }

    fn cell(&self, key: &str, i: u32) -> ApiResult<JsValue> {
        let column = js_sys::Reflect::get(&self.data, &key.into())?;
        if column.is_undefined() || column.is_null() {
            return Ok(JsValue::UNDEFINED);
        }

        Ok(js_sys::Reflect::get_u32(&column, i)?)
    }

    fn scalars(&self, key: &str, i: u32) -> ApiResult<Option<Vec<Scalar>>> {
        let value = self.cell(key, i)?;
        if value.is_undefined() || value.is_null() {
            Ok(None)
        } else {
            Ok(Some(value.into_serde_ext()?))
        }
    }

    fn scalar(&self, key: &str, i: u32) -> ApiResult<Option<Scalar>> {
        let value = self.cell(key, i)?;
        if value.is_undefined() {
            Ok(None)
        } else {
            Ok(Some(value.into_serde_ext()?))
        }
    }

    fn row_offset(&self, y: u32) -> ApiResult<u32> {
        y.checked_sub(self.meta.start_row)
            .ok_or_else(|| ApiError::new(format!("Row {y} is outside the frame")))
    }

    fn col_offset(&self, x: u32) -> ApiResult<usize> {
        let i = x
            .checked_sub(self.meta.start_col)
            .ok_or_else(|| ApiError::new(format!("Column {x} is outside the frame")))?
            as usize;

        if i >= self.meta.paths.len() {
            return Err(ApiError::new(format!("Column {x} is outside the frame")));
        }

        Ok(i)
    }
}

fn key_filter(column: &str, value: &Scalar) -> Filter {
    match value {
        Scalar::Null => Filter::scalar(column, "is null", Scalar::Null),
        value => Filter::scalar(column, "==", value.clone()),
    }
}

/// Resolve `hit_ref` against `frame` and the panel's rendered `config`,
/// deriving the row's and column's identities and a filter selecting them,
/// by the table's `index` columns when the view is not grouped.
pub fn resolve_hit(
    config: &ViewConfig,
    index: Option<&TableIndex>,
    frame: &ViewFrame,
    hit_ref: &PerspectiveHitRef,
) -> ApiResult<PerspectiveHit> {
    let kind = match (hit_ref.y, hit_ref.x) {
        (Some(_), Some(_)) => PerspectiveHitKind::Cell,
        (Some(_), None) => PerspectiveHitKind::Row,
        (None, Some(_)) => PerspectiveHitKind::Column,
        (None, None) => return Err(ApiError::new("A hit ref needs `y` or `x`")),
    };

    let mut filter = config.filter.clone();
    let mut id = None;
    let mut row_path = vec![];
    if let Some(y) = hit_ref.y {
        let i = frame.row_offset(y)?;
        id = frame.scalars("__ID__", i)?;
        row_path = frame.scalars("__ROW_PATH__", i)?.unwrap_or_default();
        for (level, value) in config.group_by.iter().zip(row_path.iter()) {
            filter.push(key_filter(level, value));
        }

        if let (true, Some(index), Some(id)) = (config.group_by.is_empty(), index, &id)
            && index.columns().len() == id.len()
        {
            for (column, value) in index.columns().iter().zip(id.iter()) {
                filter.push(key_filter(column, value));
            }
        }
    }

    let mut column_path = vec![];
    let mut column_names = vec![];
    let mut value = None;
    if let Some(x) = hit_ref.x {
        let i = frame.col_offset(x)?;
        let levels = &frame.meta.column_paths;
        let n_split = config.split_by.len().min(levels.len().saturating_sub(1));
        for (level, split) in levels.iter().zip(config.split_by.iter()).take(n_split) {
            match level.get(i) {
                Some(Scalar::Null) | None => break,
                Some(v) => {
                    column_path.push(v.clone());
                    filter.push(Filter::scalar(split, "==", v.clone()));
                },
            }
        }

        if let Some(Some(name)) = levels.last().map(|names| names.get(i)) {
            match name {
                Scalar::Null => {},
                name => column_names.push(name.to_string()),
            }
        }

        if let Some(y) = hit_ref.y {
            value = frame.scalar(&frame.meta.paths[i], frame.row_offset(y)?)?;
        }
    }

    Ok(PerspectiveHit {
        kind,
        y: hit_ref.y,
        x: hit_ref.x,
        id,
        row_path,
        column_path,
        column_names,
        value,
        config: ViewConfigUpdate {
            filter: Some(filter),
            expressions: (!config.expressions.0.is_empty()).then(|| config.expressions.clone()),
            ..Default::default()
        },
    })
}
