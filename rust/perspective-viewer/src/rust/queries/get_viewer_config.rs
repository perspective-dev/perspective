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

use crate::config::*;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::*;

/// Compose the current [`ViewerConfig`] from across the engine handles.
///
/// The `view_config` field is read from the snapshot the currently-bound
/// `View` was constructed from, so it is consistent with what the active
/// plugin is rendering. Falls back to the live session config if no
/// `View` exists yet.
pub async fn get_viewer_config(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
) -> ApiResult<ViewerConfig> {
    let version = config::API_VERSION.to_string();
    let view_config = if let Some(rendered) = session.get_rendered_view_config() {
        (*rendered).clone()
    } else {
        session.get_view_config().clone()
    };
    let settings = presentation.is_settings_open();
    let plugin = renderer.metadata().name.clone();
    let plugin_config = renderer.get_plugin_config();
    let theme = presentation.get_selected_theme_name().await;
    let title = session.get_title();
    let table = session.get_table().map(|x| x.get_name().to_owned());
    let columns_config = renderer.all_columns_configs();
    Ok(ViewerConfig {
        version,
        plugin,
        title,
        plugin_config,
        columns_config,
        settings,
        table,
        view_config,
        theme,
    })
}
