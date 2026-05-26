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
use crate::session::Session;

/// Apply a [`ColumnConfigFieldUpdate`] from a column-style sidebar
/// control to the active plugin's per-column config bucket on
/// [`Renderer`], then re-`restore` the active plugin with the
/// updated maps and trigger a render.
///
/// Plugin-level (non-column) field updates go through
/// [`super::send_plugin_config`] instead.
pub fn send_column_config(
    session: &Session,
    renderer: &Renderer,
    column_name: &str,
    update: ColumnConfigFieldUpdate,
) {
    // Apply the renderer write synchronously so the StyleTab's
    // revision-bump re-render path sees the new state immediately.
    let view_config = session.get_view_config().clone();
    renderer.update_columns_config_field(&view_config, session, column_name.to_string(), update);

    clone!(session, renderer);
    ApiFuture::spawn(async move {
        let view_config_snapshot = session.get_view_config().clone();
        let columns_configs = renderer
            .all_columns_configs_materialized(&view_config_snapshot, &session)
            .await;
        let plugin_token =
            wasm_bindgen::JsValue::from_serde_ext(&renderer.get_plugin_config()).unwrap();
        renderer
            .get_active_plugin()?
            .restore(&plugin_token, Some(&columns_configs))?;

        renderer.update(session.get_view()).await?;
        renderer.column_style_changed.emit(columns_configs);
        Ok(())
    })
}
