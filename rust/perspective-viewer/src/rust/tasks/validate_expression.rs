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

//! Per-keystroke expression validation with stale-result rejection.
//!
//! The component owns a monotonically increasing `req_id` and increments
//! it on each keystroke. The dispatched task echoes the `req_id` back in
//! its result payload so the component can drop validations that
//! resolved out-of-order.

use perspective_client::ExprValidationError;
use perspective_js::utils::*;
use yew::prelude::*;

use crate::queries::validate_expr;
use crate::session::Session;

/// Result payload from a dispatched validation task.
#[derive(Debug, Clone)]
pub struct ExprValidation {
    /// Request id echoed from the dispatch site so the caller can drop
    /// stale results from races between rapid keystrokes.
    pub req_id: u64,
    /// `None` if the expression validated cleanly; otherwise the
    /// per-expression error returned by the engine.
    pub error: Option<ExprValidationError>,
}

/// Validate `expr` against the active table; dispatch the result back
/// through `cb` with the given `req_id`. Errors from the engine are
/// logged to the console and surfaced as `error: None` (i.e. the
/// expression is treated as valid, matching the prior in-line behavior
/// from `expression_editor.rs::SetExpr`).
pub fn validate_expression(
    session: &Session,
    cb: Callback<ExprValidation>,
    req_id: u64,
    expr: String,
) {
    let session = session.clone();
    ApiFuture::spawn(async move {
        let error = match validate_expr(&session, &expr).await {
            Ok(x) => x,
            Err(err) => {
                web_sys::console::error_1(&format!("{err:?}").into());
                None
            },
        };
        cb.emit(ExprValidation { req_id, error });
        Ok::<_, ApiError>(())
    });
}
