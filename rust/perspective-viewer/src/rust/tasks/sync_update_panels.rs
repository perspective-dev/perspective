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
        palette,
    } = update.into_serde_ext()?;

    let palette = validate_palette(palette.unwrap_or_default())
        .map_err(|e| ApiError::from(JsValue::from_str(&e)))?;
    let old_ids = this.workspace.panel_ids();

    // Phase 1 — models only, NO renders and NO draws
    let mut id_map: HashMap<String, String> = Default::default();
    let mut fallback_fresh: Option<String> = None;
    let mut active_fresh: Option<String> = None;
    let mut contents = Vec::new();
    // `panels` entries are `ViewerConfigInitial`s — `table` required by
    // TYPE (a placed panel without a binding would be permanently blank),
    // and no per-panel `settings` exists (element-level; carried by the
    // top-level `active` field). An EMPTY `panels` map restores to the
    // zero-panel empty stage — the former table-less fallback panel was
    // exactly the blank-panel state this type exists to preclude.
    for (saved_id, config) in panels {
        let (fresh, session, renderer, config) = create_panel_model(
            &this.elem,
            &this.presentation,
            &this.workspace,
            None,
            config.into(),
            None,
            Placement::Placed,
        );

        if active.as_deref() == Some(saved_id.as_str()) {
            active_fresh = Some(fresh.as_str().to_owned());
        }

        fallback_fresh.get_or_insert_with(|| fresh.as_str().to_owned());
        id_map.insert(saved_id, fresh.as_str().to_owned());
        contents.push((fresh, session, renderer, config));
    }

    let mut eject_tasks = Vec::new();
    if let Some(panel) = this.workspace.take_reserved() {
        eject_tasks.push(eject_panel(panel));
    }

    for old in old_ids {
        if let Some(panel) = this.workspace.remove_panel(&old) {
            eject_tasks.push(eject_panel(panel));
        }
    }

    this.presentation.set_palette(palette)?;

    // Phase 2 — stage the remapped layout tree on the Workspace
    if let Some(layout) = layout {
        this.workspace
            .set_pending_layout(layout.remap(&|name| id_map.get(name).cloned()));
    }

    // Phase 3 — the single visible commit
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
        // Silent (`announce: false`): each restored panel's own view-config
        // commit dispatch announces the config, settings field included.
        app.send_message(PerspectiveViewerMsg::ToggleSettingsInit(
            Some(SettingsUpdate::Update(sidebar_open)),
            false,
            None,
        ));
    }

    let masters = masters
        .unwrap_or_default()
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
    this.workspace
        .set_global_filters(global_filters.unwrap_or_default());
    Ok((contents, eject_tasks))
}
