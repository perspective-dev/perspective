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
//! plugin_config, columns_config, view_config) and re-draw, on the snapshot
//! pipeline (see `tasks/pipeline.rs` / `SESSION_CONFIG_COHERENCE_PLAN.md`).

use futures::Future;
use perspective_client::clone;

use super::pipeline::{RunOrigin, RunSpec, locked_run};
use super::update_theme::seed_panel_theme;
use crate::config::{OptionalUpdate, ViewerConfigUpdate};
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::*;

/// Apply a full [`ViewerConfigUpdate`] (theme, title, plugin selection,
/// plugin config, columns config, view config) to the engines and re-draw.
/// Returns an [`ApiFuture<()>`] which resolves when the draw completes.
///
/// `origin` says who initiated the restore ([`RunOrigin`]): a `Public`
/// element-API call keeps the no-op-restore refresh affordance (an
/// `Unchanged` reconcile still repaints via `update`); an `Internal`
/// restore that reconciles `Unchanged` and changes no plugin state
/// dispatches nothing.
///
/// This function owns the PRE-LOCK prologue only (element-level settings /
/// title / host-theme mirror, plugin resolution, the synchronous config
/// commit and spinner token); the run itself is
/// [`locked_run`] with the caller's `task` awaited inside the lock. The
/// `update`'s `table` field is NOT applied here — table binding is the
/// `task`'s job (see `restore_panel` / `table_lifecycle`).
pub fn restore_and_render(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    origin: RunOrigin,
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

        match theme_name {
            OptionalUpdate::SetDefault => {
                let current_name = presentation.get_selected_theme_name().await;
                if current_name.is_some() {
                    presentation.set_theme_name(None).await?;
                }
            },
            OptionalUpdate::Update(x) => {
                presentation.set_theme_name(Some(&x)).await?;
            },
            _ => {},
        };

        let resolved_plugin = renderer.resolve_plugin_update(&plugin);
        if let Some((_, metadata)) = &resolved_plugin {
            session.set_update_column_defaults(&mut view_config, metadata);
        } else {
            let metadata = if renderer.active_plugin().is_none() {
                renderer
                    .resolve_plugin_update(&OptionalUpdate::SetDefault)
                    .map(|(_, metadata)| metadata)
                    .unwrap_or_else(|| renderer.metadata())
            } else {
                renderer.metadata()
            };

            session.set_update_rollup_defaults(&mut view_config, &metadata);
        }

        let plugin_idx = resolved_plugin.map(|(idx, _)| idx);
        session.commit_view_config(view_config)?;
        let _run_token = session.begin_config_run();
        seed_panel_theme(&presentation, &renderer).await;
        locked_run(&session, &renderer, RunSpec {
            origin,
            plugin_idx,
            plugin_config,
            columns_config,
            task: Some(Box::pin(task)),
            presentation: Some(presentation.clone()),
        })
        .await?;

        Ok(())
    })
}
