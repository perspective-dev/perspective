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

//! Cross-engine reset orchestration: reset session config, optionally clear
//! presentation columns config / theme, reset the renderer plugin state, and
//! redraw.

use futures::channel::oneshot;
use perspective_client::clone;
use perspective_js::utils::ApiFuture;

use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::{ResetOptions, Session};

/// Reset the viewer's `ViewerConfig` to the default.
///
/// - `all = false`: clears the view config but preserves expressions and
///   per-column style maps.
/// - `all = true`: also clears expressions, per-column styles, and theme.
///
/// Optionally signals `sender` once the reset+redraw round-trip completes,
/// then emits `renderer.reset_changed`.
pub fn reset_all(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    all: bool,
    sender: Option<oneshot::Sender<()>>,
) {
    presentation.set_open_column_settings(None);
    clone!(session, renderer, presentation);
    ApiFuture::spawn(async move {
        session
            .reset(ResetOptions {
                config: true,
                expressions: all,
                ..ResetOptions::default()
            })
            .await?;
        let columns_config = if all {
            renderer.reset_columns_configs();
            renderer.reset_plugin_config();
            // Mirror the per-plugin bucket clear on the event bus so
            // `PluginTab` re-pulls (its props are interior-mutable
            // handles whose identity doesn't change on the reset).
            renderer
                .plugin_config_changed
                .emit(renderer.get_plugin_config());
            None
        } else {
            Some(renderer.all_columns_configs())
        };

        renderer.reset(columns_config.as_ref()).await?;
        presentation.reset_available_themes(None).await;
        if all {
            presentation.reset_theme().await?;
        }

        let result = renderer.draw(session.validate().await?.create_view()).await;
        if let Some(sender) = sender {
            sender.send(()).unwrap();
        }

        renderer.reset_changed.emit(());
        result
    })
}
