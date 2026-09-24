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
//! presentation columns config / theme, then delegate to a transactional
//! restore to switch back to the default plugin and redraw.

use perspective_client::clone;
use perspective_js::utils::{ApiFuture, ApiResult};

use super::pipeline::RunOrigin;
use super::transactional_restore::restore_in_place;
use crate::config::{
    ColumnConfigUpdate, OptionalUpdate, PluginConfigUpdate, PluginUpdate, ViewerConfigUpdate,
};
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::{OpKind, ResetOptions, Session, StepOutcome};

/// Reset the viewer's `ViewerConfig` to the default.
///
/// - `all = false`: clears the view config but preserves expressions and
///   per-column style maps.
/// - `all = true`: also clears expressions, per-column styles, and theme.
///
/// Returns the reset+redraw round-trip's future — the CALLER owns completion
/// (invariant I6: message handlers resolve their `Completion` only from run
/// futures like this one) and error, rather than this task spawning unowned
/// work.
///
/// Delegates plugin selection + draw to [`restore_in_place`], whose
/// two-pass restore guarantees the default plugin sees materialized
/// `columns_config` / `plugin_config` on its first draw — fixing a race
/// where the raw post-reset bucket would reach the plugin before
/// stats-dependent `include: true` defaults were resolved.
pub fn reset_all(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    all: bool,
) -> ApiFuture<()> {
    presentation.set_open_column_settings(None);
    let ticket = session.submit(OpKind::Restore { fields: None }, {
        clone!(session, renderer, presentation);
        move |_ctx| {
            Box::pin(async move {
                reset_all_step(&session, &renderer, &presentation, all).await?;
                Ok(StepOutcome::Done)
            })
        }
    });

    ApiFuture::new(ticket.settle())
}

/// The body of [`reset_all`], run as one op on the panel's queue.
async fn reset_all_step(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    all: bool,
) -> ApiResult<()> {
    {
        session
            .reset(ResetOptions {
                config: true,
                expressions: all,
                ..ResetOptions::default()
            })
            .await?;

        presentation.reset_available_themes(None).await;
        if all {
            // Put this panel back on the registry default CONCRETELY —
            // `reset_theme` only resets the host, which an explicitly-themed
            // panel would otherwise keep overriding.
            presentation.reset_theme().await?;
            renderer.commit_theme(presentation.get_default_theme_name().await);
        }

        // For `all = true`, route the bucket clears through the restore's
        // `update_*` paths as `SetDefault`. This guarantees the materialized
        // restore fires even when the user is already on the default plugin
        // (no plugin_swap signal), since `SetDefault` reports the bucket as
        // `changed` when it was non-empty. The per-plugin bucket model means
        // only the (post-swap) default plugin's bucket is cleared; other
        // plugins' buckets persist with their per-plugin state.
        let (columns_config, plugin_config) = if all {
            (
                ColumnConfigUpdate::SetDefault,
                PluginConfigUpdate::SetDefault,
            )
        } else {
            (OptionalUpdate::Missing, OptionalUpdate::Missing)
        };

        let update = ViewerConfigUpdate {
            plugin: PluginUpdate::SetDefault,
            plugin_config,
            columns_config,
            ..Default::default()
        };

        // `reset()` is a public element API — `Public` keeps its repaint
        // affordance even on an already-default config.
        restore_in_place(session, renderer, presentation, RunOrigin::Public, update).await?;
        renderer.reset_changed.emit(());
        Ok(())
    }
}
