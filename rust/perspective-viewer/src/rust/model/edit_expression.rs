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

use super::structural::*;
use super::UpdateAndRender;
use crate::components::column_settings_sidebar::ColumnSettingsTab;
use crate::components::viewer::ColumnLocator;
use crate::config::{Expression, ViewConfigUpdate};
use crate::presentation::{OpenColumnSettings, Presentation};
use crate::renderer::Renderer;
use crate::session::Session;
use crate::*;

#[derive(PartialEq)]
pub struct ExpressionUpdater {
    presentation: Presentation,
    renderer: Renderer,
    session: Session,
}
derive_model!(Presentation, Renderer, Session for ExpressionUpdater);

pub trait EditExpression: HasPresentation + HasRenderer + HasSession + UpdateAndRender {
    fn get_expression_updater(&self) -> ExpressionUpdater {
        ExpressionUpdater {
            presentation: self.presentation().clone(),
            renderer: self.renderer().clone(),
            session: self.session().clone(),
        }
    }

    /// Spawns a future which will update the expression.
    fn update_expr(&self, old_name: String, new_expr: Expression<'static>) {
        let this = self.get_expression_updater();
        ApiFuture::spawn(async move {
            let update = this
                .session
                .create_replace_expression_update(&old_name, &new_expr)
                .await;
            this.presentation
                .set_open_column_settings(Some(OpenColumnSettings {
                    locator: Some(ColumnLocator::Expression(new_expr.name.to_string())),
                    tab: Some(ColumnSettingsTab::Attributes),
                }));
            this.update_and_render(update).await?;
            Ok(())
        });
    }

    /// Saves a new expression. Spawns a future.
    fn save_expr(&self, expr: Expression) {
        let task = {
            let mut serde_exprs = self.session().get_view_config().expressions.clone();
            serde_exprs.insert(&expr);
            self.presentation()
                .set_open_column_settings(Some(OpenColumnSettings {
                    locator: Some(ColumnLocator::Expression(expr.name.clone().into())),
                    tab: Some(ColumnSettingsTab::Attributes),
                }));
            self.update_and_render(ViewConfigUpdate {
                expressions: Some(serde_exprs),
                ..Default::default()
            })
        };

        ApiFuture::spawn(task);
    }

    fn delete_expr(&self, expr_name: &str) {
        let mut serde_exprs = self.session().get_view_config().expressions.clone();
        serde_exprs.remove(expr_name);
        let config = ViewConfigUpdate {
            expressions: Some(serde_exprs),
            ..ViewConfigUpdate::default()
        };

        let task = self.update_and_render(config);
        ApiFuture::spawn(task);
    }
}

impl<T: HasRenderer + HasSession + HasPresentation + UpdateAndRender> EditExpression for T {}
