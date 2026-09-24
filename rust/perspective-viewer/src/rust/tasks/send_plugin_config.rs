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

use perspective_client::clone;
use perspective_js::utils::*;

use crate::config::ColumnConfigFieldUpdate;
use crate::renderer::Renderer;
use crate::session::{EditDelta, OpKind, Session, StepOutcome};

/// Apply a [`ColumnConfigFieldUpdate`] from the Plugin-settings tab to
/// the active plugin's bucket on [`Renderer`], then re-`restore` the
/// plugin with the merged token and trigger a render.
///
/// Per-plugin buckets mean no schema filter is needed before restore —
/// keys from a different plugin physically cannot appear in this
/// plugin's bucket. Schema-default stripping is handled inside
/// [`Renderer::update_plugin_config_field`].
///
/// Column-style updates go through [`super::send_column_config`].
pub fn send_plugin_config(session: &Session, renderer: &Renderer, update: ColumnConfigFieldUpdate) {
    let kind = OpKind::Edit {
        delta: EditDelta::PluginField(update.clone()),
        fields: None,
    };

    let ticket = session.submit(kind, {
        clone!(session, renderer);
        move |_ctx| {
            Box::pin(async move {
                let view_config = session.committed_view_config().clone();
                let changed = renderer.update_plugin_config_field(&view_config, update);
                Ok(StepOutcome::Render(Box::pin(async move {
                    if changed {
                        deliver_plugin_config(&session, &renderer).await?;
                    }

                    Ok(())
                })))
            })
        }
    });

    ApiFuture::spawn(ticket.settle());
}

/// Re-`restore` the active plugin with its committed buckets, repaint, and
/// announce the plugin-level change.
pub(super) async fn deliver_plugin_config(session: &Session, renderer: &Renderer) -> ApiResult<()> {
    let plugin_config = renderer.committed_plugin_config();
    let plugin_token = wasm_bindgen::JsValue::from_serde_ext(&plugin_config).unwrap();
    let view_config_snapshot = session.committed_view_config().clone();
    let columns_configs = renderer
        .all_columns_configs_materialized(&view_config_snapshot, session)
        .await;

    renderer
        .ensure_plugin_selected()?
        .restore(&plugin_token, Some(&columns_configs))?;

    clone!(session);
    renderer
        .update_lazy(async move { Ok(session.get_view_with_dimensions()) })
        .await?;

    renderer.plugin_config_changed.emit(plugin_config);
    Ok(())
}
