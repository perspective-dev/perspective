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

        // Mirror a config-carried theme onto the host attribute (the shared
        // chrome). The restyle a theme change requires is owned by the
        // MUTATION SITES (`restorePanel`'s own-theme tail, the theme-picker
        // task), not here — this run's own draw below already stamps the new
        // effective theme before the plugin's first style read.
        match theme_name {
            OptionalUpdate::SetDefault => {
                let current_name = presentation.get_selected_theme_name().await;
                if current_name.is_some() {
                    presentation.set_theme_name(None).await?;
                }
            },
            OptionalUpdate::Update(x) => {
                // No pre-resolution gate: `set_theme_name` stamps the host
                // attribute SYNCHRONOUSLY before its registry await and
                // no-ops on literal equality itself. The old
                // `get_selected_theme_name().await` guard was precisely
                // the former-theme window on a cold registry — the host
                // held the old attribute until stylesheet parsing (and
                // everything queued behind it) resolved.
                presentation.set_theme_name(Some(&x)).await?;
            },
            _ => {},
        };

        // Resolve the target plugin here (pure — needed now for
        // `set_update_column_defaults`), but COMMIT it only inside the locked
        // run below, atomically with the view rebind it belongs to. No swap
        // intent may exist outside that run: an unrelated run that wins the
        // lock first (e.g. a `table_updated` redraw) must observe either the
        // fully-old or fully-new world, never a staged half of this one.
        let resolved_plugin = renderer.resolve_plugin_update(&plugin);
        if let Some((_, metadata)) = &resolved_plugin {
            session.set_update_column_defaults(&mut view_config, metadata);
        } else {
            // Same-plugin (or plugin-less) restore: `resolve_plugin_update`
            // returns `None`, but the plugin-advised `group_rollup_mode`
            // must STILL be enforced against the active plugin's metadata —
            // `restorePanel`'s table-change reset wipes the committed mode,
            // and nothing else on this path would restore it, leaving a
            // flat-only chart (Treemap / Sunburst) rendering rollup
            // subtotal rows. Rollup only; the full column-defaults pass is
            // reserved for plugin swaps, where `columns` genuinely needs
            // re-defaulting.
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

        // The config COMMIT: synchronous, validated, atomic (I1/I4). Under
        // I2/I3 committing before the lock is safe — whichever queued run
        // snapshots next picks it up, and this run's own snapshot (taken
        // inside the lock below) can only be this commit or fresher.
        session.commit_view_config(view_config)?;

        // Spinner accounting (RAII): held to the end of this restore —
        // INCLUDING the deferred-draw exit (no table yet → no
        // `bind_snapshot`), which under the old edge-counted scheme
        // stranded the `StatusIndicator` spinner permanently.
        let _run_token = session.begin_config_run();

        // Awaits theme-registry init, so the stamp below can never observe a
        // pre-init (empty) theme set on a cold first load. Seeds this
        // panel's renderer default-theme cache, which every locked draw
        // stamps the effective theme from.
        renderer.set_default_theme(presentation.get_default_theme_name().await);
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
