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
    let mut view_config = if let Some(rendered) = session.get_rendered_view_config() {
        (*rendered).clone()
    } else {
        session.get_view_config().clone()
    };

    // The rendered config may carry transient element-level global filters
    // (master/detail) appended at view-creation; the stored `config.filter` is
    // always the panel's own user filter, so use it here to keep `save`/
    // `getViewConfig` free of global filters.
    view_config.filter = session.get_view_config().filter.clone();
    let settings = presentation.is_settings_open();
    let plugin = renderer.metadata().name.clone();
    let plugin_config = renderer.get_plugin_config();
    // Per-panel theme: a panel's own theme takes precedence; a panel with none
    // records the registry DEFAULT (first registered theme) it actually renders
    // — every panel has a concrete theme and none inherits the active panel's.
    // `None` only when no themes are registered.
    let theme = match renderer.theme() {
        theme @ Some(_) => theme,
        None => presentation.get_selected_theme_name().await,
    };
    let title = session.get_title();
    let table = session.get_table().map(|x| x.get_name().to_owned());
    let columns_config = renderer.all_columns_configs();
    Ok(ViewerConfig {
        settings,
        panel: PanelViewerConfig {
            version,
            plugin,
            title,
            plugin_config,
            columns_config,
            table,
            view_config,
            theme,
        },
    })
}
