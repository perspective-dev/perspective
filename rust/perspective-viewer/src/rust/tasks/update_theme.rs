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

//! Theme reset / set task.

use futures::future::join_all;
use perspective_js::utils::*;

use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::workspace::Workspace;

/// Give `renderer` the concrete registry default IF it has none yet — the
/// cold-boot case, where the panel was created before the registry first
/// parsed and `active_theme_name_sync` had nothing to resolve. Only ever
/// FILLS IN, never overwrites, so it cannot repaint a themed panel.
pub(crate) async fn seed_panel_theme(presentation: &Presentation, renderer: &Renderer) {
    if renderer.theme().is_none() {
        renderer.set_theme(presentation.get_default_theme_name().await);
    }
}

/// [`seed_panel_theme`] for every panel.
pub(crate) async fn seed_default_themes(presentation: &Presentation, workspace: &Workspace) {
    for panel in workspace.panels() {
        seed_panel_theme(presentation, &panel.renderer).await;
    }
}

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
    // A NAMED theme needs no registry, so it stamps SYNCHRONOUSLY — no await
    // separates the caller's config commit from the attribute the document
    // cascade styles. Only "reset to default" has to await the registry, and
    // it records the resolved NAME, never an empty theme.
    if let Some(name) = &theme {
        renderer.set_theme_stamped(Some(name.clone()));
    }

    let presentation = presentation.clone();
    let workspace = workspace.clone();
    let renderer = renderer.clone();
    ApiFuture::spawn(async move {
        match theme {
            Some(name) => {
                presentation.set_theme_name(Some(&name)).await?;
            },
            None => {
                presentation.reset_theme().await?;
                renderer.set_theme_stamped(presentation.get_default_theme_name().await);
            },
        }

        let panels = workspace.panels();
        join_all(panels.iter().map(|panel| async move {
            if panel.renderer.needs_restyle() {
                panel.renderer.restyle_all().await?;
            }

            ApiResult::<()>::Ok(())
        }))
        .await
        .into_iter()
        .collect::<ApiResult<Vec<_>>>()?;

        Ok(())
    });
}
