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
//! presentation columns config / theme, then delegate to `restore_and_render`
//! to switch back to the default plugin and redraw.

use perspective_client::clone;
use perspective_js::utils::ApiFuture;

use super::pipeline::RunOrigin;
use super::restore_and_render;
use crate::config::{
    ColumnConfigUpdate, OptionalUpdate, PluginConfigUpdate, PluginUpdate, ViewerConfigUpdate,
};
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::{ResetOptions, Session};

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
/// Delegates plugin selection + draw to [`restore_and_render`], whose
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
    clone!(session, renderer, presentation);
    ApiFuture::new(async move {
        session
            .reset(ResetOptions {
                config: true,
                expressions: all,
                ..ResetOptions::default()
            })
            .await?;

        presentation.reset_available_themes(None).await;
        if all {
            // Clear this panel's own per-panel theme so it reverts to inheriting
            // the (reset-to-default) host theme — `reset_theme` only resets the
            // host, which an explicitly-themed panel would otherwise override.
            renderer.set_theme(None);
            presentation.reset_theme().await?;
        }

        // For `all = true`, route the bucket clears through `restore_and_render`'s
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
        restore_and_render(
            &session,
            &renderer,
            &presentation,
            RunOrigin::Public,
            update,
            async { Ok(()) },
        )
        .await?;
        renderer.reset_changed.emit(());
        Ok(())
    })
}
