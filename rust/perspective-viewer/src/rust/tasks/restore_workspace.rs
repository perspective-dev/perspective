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

use futures::future::join_all;
use web_sys::HtmlElement;
use yew::Callback;

use crate::components::viewer::PerspectiveViewerMsg;
use crate::config::*;
use crate::presentation::Presentation;
use crate::session::MissingTable;
use crate::tasks::*;
use crate::workspace::{PanelId, Workspace};
use crate::*;

/// The capabilities workspace save and restore need, constructible from both
/// the custom element and the root component.
#[derive(Clone)]
pub struct WorkspaceHost {
    pub elem: HtmlElement,
    pub presentation: Presentation,
    pub workspace: Workspace,
    pub dispatch: Callback<PerspectiveViewerMsg>,
}

impl PartialEq for WorkspaceHost {
    fn eq(&self, other: &Self) -> bool {
        self.elem == other.elem
    }
}

impl WorkspaceHost {
    /// The `<regular-layout>` element this host's panels are arranged in.
    pub fn layout_element(&self) -> Option<crate::js::RegularLayout> {
        use wasm_bindgen::JsCast;
        self.elem
            .shadow_root()?
            .query_selector(crate::js::RegularLayout::TAG_NAME)
            .ok()
            .flatten()
            .map(|el| el.unchecked_into())
    }
}

/// Re-stamp the global-filter overlay on every panel not in `fresh` and
/// re-render those whose overlay changed.
async fn rerender_retained_overlays(workspace: &Workspace, fresh: &[PanelId]) -> ApiResult<()> {
    let retained = workspace
        .panels()
        .into_iter()
        .filter(|panel| !fresh.contains(&panel.id))
        .collect::<Vec<_>>();

    join_all(
        retained
            .iter()
            .map(|panel| broadcast_overlay(workspace, panel)),
    )
    .await
    .into_iter()
    .collect::<ApiResult<Vec<_>>>()?;

    Ok(())
}

/// Apply a [`WorkspaceConfigUpdate`] to `host`, the body of
/// `restoreWorkspace()`.
pub(crate) async fn restore_workspace(
    host: &WorkspaceHost,
    update: WorkspaceConfigUpdate,
    missing: MissingTable,
    errors: RestoreErrors,
) -> ApiResult<()> {
    let (contents, eject_tasks, derived_tables) = sync_update_panels(host, update)?;

    // The outgoing panels' ejects must settle BEFORE the derived
    // pass: a stale derivation is undeletable (and so cannot be
    // redefined or pruned) while an ejecting panel still holds a
    // `View` on it. Their errors are surfaced LAST, after the
    // replacement set is in place.
    let ejected = join_all(eject_tasks)
        .await
        .into_iter()
        .collect::<ApiResult<Vec<_>>>();

    if let Some(derived_tables) = derived_tables.clone() {
        apply_derived_tables(&host.workspace, derived_tables).await?;
    }

    let fresh = contents
        .iter()
        .map(|(id, ..)| id.clone())
        .collect::<Vec<_>>();
    let results = join_all(contents.into_iter().map(|(id, session, renderer, config)| {
        let presentation = host.presentation.clone();
        let workspace = host.workspace.clone();
        let notify = host
            .dispatch
            .reform(|()| PerspectiveViewerMsg::LayoutChanged);
        async move {
            let result = restore_panel(
                &session,
                &renderer,
                &presentation,
                &workspace,
                RestoreMode::Fresh,
                config,
                errors,
                missing,
                None,
            )
            .await;

            if discard_rejected(&workspace, &id, &session, &result).await? {
                notify.emit(());
            }

            result?;
            if workspace.is_master(&id) {
                set_edit_mode(&session, &renderer, "SELECT_ROW_TREE");
            }

            Ok(())
        }
    }))
    .await;

    results.into_iter().collect::<ApiResult<Vec<_>>>()?;
    rerender_retained_overlays(&host.workspace, &fresh).await?;
    if let Some(derived_tables) = derived_tables {
        let keep = derived_tables.keys().cloned().collect();
        prune_derived(&host.workspace, &keep).await?;
    }

    ejected?;
    Ok(())
}
