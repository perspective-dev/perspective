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

//! Async dispatch task for per-column numeric stats.
//!
//! `resolve_abs_max` is the cache-or-fetch core: hit the
//! [`Session`] stats cache first, fall back to `View::get_min_max`
//! for numeric columns on miss, write-through on success.
//!
//! `fetch_column_abs_max` is the fire-and-forget pre-warm wrapper used
//! by the StyleTab on column-settings panel open so the gradient
//! defaults are ready before the user can trigger any UI update.

use perspective_client::View;
use perspective_client::config::{ColumnType, Scalar};
use perspective_js::utils::ApiFuture;

use crate::session::{Session, SessionMetadata};

fn scalar_to_f64(s: &Scalar) -> Option<f64> {
    match s {
        Scalar::Float(x) => Some(*x),
        _ => None,
    }
}

/// Extract `abs_max = max(|min|, |max|)` from a `(Scalar, Scalar)`
/// `View::get_min_max` result. Returns `None` for non-numeric scalars.
pub fn min_max_to_abs_max(min: &Scalar, max: &Scalar) -> Option<f64> {
    let min = scalar_to_f64(min)?;
    let max = scalar_to_f64(max)?;
    Some(min.abs().max(max.abs()))
}

/// `true` if the column's view type is `Integer` or `Float`. Used to
/// skip the `View::get_min_max` round trip for non-numeric columns
/// (which would either error or return non-`Float` scalars).
pub fn is_numeric_column(metadata: &SessionMetadata, col_name: &str) -> bool {
    matches!(
        metadata.get_column_view_type(col_name),
        Some(ColumnType::Integer | ColumnType::Float)
    )
}

/// Resolve the cached `abs_max` for `col_name`; on miss, await
/// `View::get_min_max` for numeric columns, populate the cache, and
/// return the value. Non-numeric columns and missing views return
/// `None` without a fetch.
pub async fn resolve_abs_max(
    session: &Session,
    metadata: &SessionMetadata,
    view: Option<&View>,
    col_name: &str,
) -> Option<f64> {
    if let Some(stats) = session.get_column_stats(col_name)
        && let Some(v) = stats.abs_max
    {
        return Some(v);
    }
    if !is_numeric_column(metadata, col_name) {
        return None;
    }

    let view = view?;
    let (min, max) = view.get_min_max(col_name.to_string()).await.ok()?;
    let v = min_max_to_abs_max(&min, &max)?;
    session.set_column_abs_max(col_name.to_string(), v);
    Some(v)
}

/// Fire-and-forget pre-warm of the stats cache. Spawns
/// [`resolve_abs_max`] on the active session's view; the result is
/// discarded — the side effect of populating
/// [`Session::set_column_abs_max`] is the goal. Used by the
/// `StyleTab`'s `use_effect_with` to warm gradient defaults before
/// the user can trigger a `plugin.restore`.
pub fn fetch_column_abs_max(session: &Session, column_name: String) {
    let session = session.clone();
    ApiFuture::spawn(async move {
        let metadata = session.metadata().clone();
        let view = session.get_view();
        resolve_abs_max(&session, &metadata, view.as_ref(), &column_name).await;
        Ok::<_, perspective_js::utils::ApiError>(())
    });
}
