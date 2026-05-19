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
    let view_config = session.get_view_config().clone();
    let changed = renderer.update_plugin_config_field(&view_config, update);
    clone!(session, renderer);
    ApiFuture::spawn(async move {
        if changed {
            let plugin_config = renderer.get_plugin_config();
            let plugin_token = wasm_bindgen::JsValue::from_serde_ext(&plugin_config).unwrap();
            let view_config_snapshot = session.get_view_config().clone();
            let columns_configs =
                renderer.all_columns_configs_materialized(&view_config_snapshot, &session);
            renderer
                .get_active_plugin()?
                .restore(&plugin_token, Some(&columns_configs))?;
            renderer.update(session.get_view()).await?;
            renderer.plugin_config_changed.emit(plugin_config);
        }

        Ok(())
    })
}
