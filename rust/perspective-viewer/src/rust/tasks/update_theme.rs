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

//! Theme reset / set task. Replaces the inlined StatusBar callback that
//! reached into `Session::get_view()` for the post-update restyle.

use perspective_js::utils::*;

use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::workspace::Workspace;

/// Apply a theme change and restyle the affected panel's view.
///
/// `theme = None` resets to the first available theme; `theme = Some(name)`
/// sets the named theme. The `theme` is recorded on the active `renderer`
/// (per-panel state) and mirrored onto the host `theme` attribute (driving
/// the shared chrome). Components dispatch this task instead of reading
/// `Session::get_view()` themselves.
///
/// Every panel's plugin carries its own stamped `theme` attribute (effective
/// theme = its own, else the registry default — see `Renderer::stamp_theme`),
/// and the theme rules provide a COMPLETE var set for `perspective-viewer
/// [theme="X"]` descendants (no inheritance from the host attribute), so a
/// pick changes ONLY the picked panel's effective theme — the host flip
/// restyles nothing else. Restyle (an expensive full `restyle_all`, which
/// also redraws) is therefore scoped to panels whose captured CSS is
/// actually STALE (`Renderer::needs_restyle` — effective theme vs. the one
/// stamped at the plugin's last capture): the picked panel when the value
/// is genuinely new, and never a panel that has yet to first-paint.
pub fn update_theme(
    renderer: &Renderer,
    presentation: &Presentation,
    workspace: &Workspace,
    theme: Option<String>,
) {
    // Per-panel: record the theme on the (active) renderer so this panel keeps
    // it independent of which panel is active. `set_theme_name` below mirrors
    // the same value onto the host `theme` attribute (driving the chrome), and
    // MainPanel inlines this renderer's theme on its frame only when it
    // diverges from the host. Sync `RefCell` write, done before the spawn so
    // the re-render `set_theme_name` triggers observes the new value.
    renderer.set_theme(theme.clone());

    // Stamp-with-commit: flip the picked panel's plugin `theme` attribute
    // synchronously with the own-theme record (a named pick needs no
    // registry; a reset stamps sync only from a warm default cache — a
    // cold one would stamp attribute-removal). The `restyle_all` in the
    // spawned tail below still owns the expensive var re-read + redraw.
    if theme.is_some() || renderer.default_theme().is_some() {
        renderer.stamp_theme(None);
    }

    let presentation = presentation.clone();
    let workspace = workspace.clone();
    ApiFuture::spawn(async move {
        match theme {
            Some(name) => {
                presentation.set_theme_name(Some(&name)).await?;
            },
            None => {
                presentation.reset_theme().await?;
            },
        }

        // Re-seed every renderer's default cache from the (now-initialized)
        // registry before consulting `needs_restyle`, whose effective-theme
        // side reads it — a reset (`theme = None`) on a cold cache would
        // otherwise compare against `None` and restyle to attribute-removal.
        let default = presentation.get_default_theme_name().await;
        for panel in workspace
            .panel_ids()
            .into_iter()
            .filter_map(|id| workspace.panel(&id))
        {
            panel.renderer.set_default_theme(default.clone());

            // State-keyed (captured-theme vs. effective — see
            // `Renderer::needs_restyle`): only the picked panel's effective
            // theme changed in this task, so only it can read stale — and a
            // pick that lands on the value the plugin already captured (or
            // a panel that has yet to first-paint) restyles nothing.
            if panel.renderer.needs_restyle() {
                // `restyle_all` resolves the bound `View` itself, INSIDE the
                // draw lock (no-op when nothing is bound) — a handle captured
                // here would race an in-flight rebuild.
                panel.renderer.restyle_all().await?;
            }
        }

        Ok(())
    });
}
