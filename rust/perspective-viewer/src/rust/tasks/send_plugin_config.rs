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
use crate::presentation::Presentation;
use crate::queries::filter_columns_for_active_plugin;
use crate::renderer::Renderer;
use crate::session::Session;

/// Apply a [`ColumnConfigFieldUpdate`] from a sidebar control to the
/// presentation state, then re-`restore` the active plugin with the
/// updated map and trigger a render.
pub fn send_plugin_config(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    column_name: &str,
    update: ColumnConfigFieldUpdate,
) {
    let name = column_name.to_string();
    // Apply the presentation write synchronously so callers (e.g.
    // the StyleTab's revision-bump re-render path) see the new state
    // immediately. Async plugin.restore + render still happen on
    // the spawned future.
    presentation.update_columns_config_field(name.clone(), update);

    clone!(session, renderer, presentation);
    ApiFuture::spawn(async move {
        let columns_configs = presentation.all_columns_configs();
        let filtered =
            filter_columns_for_active_plugin(&columns_configs, &renderer, &session).await;

        let plugin_config = renderer.get_active_plugin()?.save()?;
        renderer
            .get_active_plugin()?
            .restore(&plugin_config, Some(&filtered))?;

        renderer.update(session.get_view()).await?;
        presentation.column_style_changed.emit(columns_configs);
        Ok(())
    })
}
