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

//! Expression-editor side effects: update / save / delete an expression in
//! the active session, then re-render and reopen the column-settings drawer
//! on the affected column.

use perspective_client::clone;
use perspective_client::config::{Expression, ViewConfigUpdate};

use super::update_and_render;
use crate::presentation::{ColumnLocator, ColumnSettingsTab, OpenColumnSettings, Presentation};
use crate::renderer::Renderer;
use crate::session::Session;
use crate::*;

/// Replace the expression at `old_name` with `new_expr` and re-render.  After
/// the render completes, opens the column-settings drawer on the renamed
/// expression.
pub fn update_expr(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    old_name: String,
    new_expr: Expression<'static>,
) {
    clone!(session, renderer, presentation);
    ApiFuture::spawn(async move {
        let update = session
            .to_props()
            .create_replace_expression_update(&old_name, &new_expr);

        update_and_render(&session, &renderer, update)?.await?;
        presentation.set_open_column_settings(Some(OpenColumnSettings {
            locator: Some(ColumnLocator::Expression(new_expr.name.to_string())),
            tab: Some(ColumnSettingsTab::Attributes),
        }));

        Ok(())
    });
}

/// Insert `expr` into the session's expressions and re-render.  After the
/// render completes, opens the column-settings drawer on the new expression.
pub fn save_expr(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    expr: Expression,
) -> ApiResult<()> {
    let presentation = presentation.clone();
    let expr_name: String = expr.name.clone().into();
    let task = {
        let mut serde_exprs = session.get_view_config().expressions.clone();
        serde_exprs.insert(&expr);
        update_and_render(session, renderer, ViewConfigUpdate {
            expressions: Some(serde_exprs),
            ..Default::default()
        })
    }?;

    ApiFuture::spawn(async move {
        task.await?;
        presentation.set_open_column_settings(Some(OpenColumnSettings {
            locator: Some(ColumnLocator::Expression(expr_name)),
            tab: Some(ColumnSettingsTab::Attributes),
        }));

        Ok(())
    });

    Ok(())
}

/// Remove the expression named `expr_name` from the session and re-render.
pub fn delete_expr(session: &Session, renderer: &Renderer, expr_name: &str) -> ApiResult<()> {
    let mut serde_exprs = session.get_view_config().expressions.clone();
    serde_exprs.remove(expr_name);
    let config = ViewConfigUpdate {
        expressions: Some(serde_exprs),
        ..ViewConfigUpdate::default()
    };

    let task = update_and_render(session, renderer, config)?;
    ApiFuture::spawn(task);
    Ok(())
}
