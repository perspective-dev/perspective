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

//! Apply a full [`ViewerConfigUpdate`] (settings, theme, title, plugin,
//! plugin_config, columns_config, view_config) and re-draw.

use futures::Future;
use perspective_client::clone;

use crate::config::{OptionalUpdate, ViewerConfigUpdate};
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::*;

/// Apply a full [`ViewerConfigUpdate`] (theme, title, plugin selection,
/// plugin config, columns config, view config) to the engines and re-draw.
/// Returns an [`ApiFuture<()>`] which resolves when the draw completes.
pub fn restore_and_render(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    ViewerConfigUpdate {
        plugin,
        plugin_config,
        columns_config,
        settings,
        theme: theme_name,
        title,
        mut view_config,
        ..
    }: ViewerConfigUpdate,
    task: impl Future<Output = Result<(), ApiError>> + 'static,
) -> ApiFuture<()> {
    clone!(session, renderer, presentation);
    ApiFuture::new(async move {
        if let OptionalUpdate::Update(x) = settings {
            presentation.set_settings_attribute(x);
            presentation.set_settings_before_open(x);
        }

        if let OptionalUpdate::Update(title) = title {
            session.set_title(Some(title));
        } else if matches!(title, OptionalUpdate::SetDefault) {
            session.set_title(None);
        }

        let needs_restyle = match theme_name {
            OptionalUpdate::SetDefault => {
                let current_name = presentation.get_selected_theme_name().await;
                if current_name.is_some() {
                    presentation.set_theme_name(None).await?;
                    true
                } else {
                    false
                }
            },
            OptionalUpdate::Update(x) => {
                let current_name = presentation.get_selected_theme_name().await;
                if current_name.is_some() && current_name.as_ref().unwrap() != &x {
                    presentation.set_theme_name(Some(&x)).await?;
                    true
                } else {
                    false
                }
            },
            _ => false,
        };

        if let Some(metadata) = renderer.get_next_plugin_metadata(&plugin) {
            session.set_update_column_defaults(&mut view_config, &metadata);
        }

        session.update_view_config(view_config)?;
        let draw_task = renderer.draw(async {
            task.await?;
            let plugin_swapped = renderer.apply_pending_plugin()?;
            let plugin = renderer.get_active_plugin()?;

            // The previous call which acquired the lock errored, so skip this render
            if let Some(error) = session.get_error() {
                return Err(error);
            }

            // Validate + create the view BEFORE applying
            // columns_config / plugin_config updates, so the
            // strip-on-write and materialize passes see fresh
            // `expression_schema` and `view_schema`, and the
            // materialize warm step can call `View::get_min_max`
            // against a view that knows about any new expression
            // columns. Previously this happened after the strip,
            // which silently dropped any `columns_config` entry
            // keyed by a new expression column.
            let view = session.validate().await?.create_view().await?;

            // Apply incoming updates into the now-active plugin's
            // bucket on `Renderer`. Per-plugin storage means no
            // schema filter is needed before restore — foreign keys
            // cannot appear in the bucket by construction. The
            // renderer methods also strip schema-default entries so
            // restored maps containing default values produce an
            // empty bucket (correct: bucket-empty ⇒ reads-default).
            let view_config_snapshot = session.get_view_config().clone();
            let plugin_config_changed =
                renderer.update_plugin_config(&view_config_snapshot, plugin_config);
            let columns_config_changed =
                renderer.update_columns_configs(&view_config_snapshot, &session, columns_config);
            let changed = plugin_config_changed || columns_config_changed;

            // Force a materialized restore when the plugin just
            // swapped — `commit_plugin_idx` already restored from the
            // raw bucket, but the materialized restore is needed for
            // schema-revealed `include: true` defaults to reach the
            // plugin before its first draw.
            if changed || plugin_swapped {
                let plugin_config_snapshot = renderer.get_plugin_config();
                let plugin_update =
                    wasm_bindgen::JsValue::from_serde_ext(&plugin_config_snapshot).unwrap();
                let columns_config = renderer
                    .all_columns_configs_materialized(&view_config_snapshot, &session)
                    .await;
                plugin.restore(&plugin_update, Some(&columns_config))?;
                if plugin_config_changed {
                    renderer.plugin_config_changed.emit(plugin_config_snapshot);
                }
            }

            if !presentation.is_visible() {
                Ok(None)
            } else {
                Ok(view)
            }
        });

        draw_task.await?;

        // TODO this should be part of the API for `draw()` above, such that
        // the plugin need not render twice when a theme is provided.
        if needs_restyle
            && presentation.is_visible()
            && let Some(view) = session.get_view()
        {
            renderer.restyle_all(&view).await?;
        }

        Ok(())
    })
}
