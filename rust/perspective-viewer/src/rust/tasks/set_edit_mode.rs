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

use crate::config::*;
use crate::renderer::Renderer;
use crate::session::Session;

/// Set the active plugin's `edit_mode`, persisting it in the [`Renderer`]'s
/// plugin bucket and re-`restore`+rendering (the same merged-token path as
/// [`super::send_plugin_config`], so column styles/sizes survive).
///
/// Master/detail uses this to put a master into `SELECT_ROW_TREE` (the mode
/// in which the datagrid emits `perspective-global-filter` selections) and to
/// restore `READ_ONLY` on demotion. Plugins with no `edit_mode` schema field
/// (e.g. charts) schema-gate the key out in [`Renderer::update_plugin_config`],
/// making this a no-op for them.
pub fn set_edit_mode(session: &Session, renderer: &Renderer, mode: &str) {
    let view_config = session.get_view_config().clone();
    let mut map = serde_json::Map::new();
    map.insert(
        "edit_mode".to_owned(),
        serde_json::Value::String(mode.to_owned()),
    );

    let changed = renderer.update_plugin_config(&view_config, OptionalUpdate::Update(map));
    clone!(session, renderer);
    ApiFuture::spawn(async move {
        if changed {
            let plugin_config = renderer.get_plugin_config();
            let plugin_token = wasm_bindgen::JsValue::from_serde_ext(&plugin_config).unwrap();
            let view_config_snapshot = session.get_view_config().clone();
            let columns_configs = renderer
                .all_columns_configs_materialized(&view_config_snapshot, &session)
                .await;
            renderer
                .ensure_plugin_selected()?
                .restore(&plugin_token, Some(&columns_configs))?;
            renderer.update(session.get_view()).await?;
            renderer.plugin_config_changed.emit(plugin_config);
        }

        Ok(())
    })
}
