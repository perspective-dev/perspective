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

#![allow(non_snake_case)]

use std::collections::HashMap;

use wasm_bindgen::prelude::*;

use crate::components::viewer::PerspectiveViewerMsg;
use crate::config::*;
use crate::renderer::*;
use crate::session::Session;
use crate::tasks::*;
use crate::workspace::PanelId;
use crate::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Promise<ViewerConfig>")]
    pub type JsViewerConfigPromise;

    #[wasm_bindgen(typescript_type = "ViewerConfigUpdate")]
    pub type JsViewerConfigUpdate;
}

pub type SyncUpdatePanelsResult = (
    Vec<(PanelId, Session, Renderer, ViewerConfigUpdate)>,
    std::vec::Vec<perspective_js::utils::ApiFuture<()>>,
);

/// Update the panel state to match a `WorkspaceConfigUpdate`.
///
/// This method must be synchronous.
pub fn sync_update_panels(
    this: &PerspectiveViewerElement,
    update: JsViewerConfigUpdate,
) -> ApiResult<SyncUpdatePanelsResult> {
    let WorkspaceConfigUpdate {
        active,
        layout,
        panels,
        global_filters,
        masters,
    } = update.into_serde_ext()?;

    let old_ids = this.workspace.panel_ids();

    // Phase 1 — models only, NO renders and NO draws
    let mut id_map: HashMap<String, String> = Default::default();
    let mut fallback_fresh: Option<String> = None;
    let mut active_fresh: Option<String> = None;
    let mut contents = Vec::new();
    for (saved_id, config) in panels {
        if !matches!(config.settings, OptionalUpdate::Missing) {
            #[rustfmt::skip]
            tracing::warn!(
                "`settings` on panel \"{saved_id}\" is ignored in a whole-element config; use the top-level `active` field"
            );
        }

        let (fresh, session, renderer, config) = create_panel_model(
            &this.elem,
            &this.presentation,
            &this.workspace,
            None,
            config,
            None,
        );

        if active.as_deref() == Some(saved_id.as_str()) {
            active_fresh = Some(fresh.as_str().to_owned());
        }

        fallback_fresh.get_or_insert_with(|| fresh.as_str().to_owned());
        id_map.insert(saved_id, fresh.as_str().to_owned());
        contents.push((fresh, session, renderer, config));
    }

    if contents.is_empty() {
        let (fresh, session, renderer, config) = create_panel_model(
            &this.elem,
            &this.presentation,
            &this.workspace,
            None,
            ViewerConfigUpdate::default(),
            None,
        );

        fallback_fresh = Some(fresh.as_str().to_owned());
        contents.push((fresh, session, renderer, config));
    }

    // Phase 2 — remove + eject the pre-existing panels.
    let mut eject_tasks = Vec::new();
    for old in old_ids {
        if let Some(panel) = this.workspace.remove_panel(&old) {
            eject_tasks.push(eject_panel(panel));
        }
    }

    // Phase 3 — stage the remapped layout tree on the Workspace
    if let Some(layout) = layout {
        this.workspace
            .set_pending_layout(layout.remap(&|name| id_map.get(name).cloned()));
    }

    // Phase 4 — the single visible commit
    if let Some(saved) = &active
        && active_fresh.is_none()
    {
        tracing::warn!("`active` names unknown panel \"{saved}\"");
    }

    let sidebar_open = active_fresh.is_some();
    if let Some(target) = active_fresh.or(fallback_fresh)
        && let Some(app) = this.root.borrow().as_ref()
    {
        app.send_message(PerspectiveViewerMsg::CommitWorkspaceRestore(target));
    }

    if let Some(app) = this.root.borrow().as_ref() {
        app.send_message(PerspectiveViewerMsg::ToggleSettingsInit(
            Some(SettingsUpdate::Update(sidebar_open)),
            None,
        ));
    }

    let masters = masters
        .into_iter()
        .filter_map(|saved| match id_map.get(&saved) {
            Some(fresh) => Some(PanelId::from(fresh.as_str())),
            None => {
                tracing::warn!("`masters` names unknown panel \"{saved}\"");
                None
            },
        })
        .collect::<Vec<_>>();

    this.workspace.set_masters(masters);
    this.workspace.set_global_filters(global_filters);
    Ok((contents, eject_tasks))
}
