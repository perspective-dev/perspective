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
use crate::session::{Disposal, Session};
use crate::tasks::*;
use crate::workspace::PanelId;
use crate::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "ViewerConfigUpdate")]
    pub type JsViewerConfigUpdate;

    #[wasm_bindgen(typescript_type = "WorkspaceConfigUpdate")]
    pub type JsWorkspaceConfigUpdate;
}

pub type SyncUpdatePanelsResult = (
    Vec<(PanelId, Session, Renderer, ViewerConfigUpdate)>,
    std::vec::Vec<perspective_js::utils::ApiFuture<()>>,
);

/// Synchronously apply a `WorkspaceConfigUpdate` to the element's models
/// field-wise, replacing the panel set only when `panels` is present, and
/// return the fresh panels to restore plus the eject tasks.
pub fn sync_update_panels(
    this: &PerspectiveViewerElement,
    update: JsWorkspaceConfigUpdate,
) -> ApiResult<SyncUpdatePanelsResult> {
    let WorkspaceConfigUpdate {
        active,
        layout,
        panels,
        global_filters,
        masters,
        palette,
    } = update.into_serde_ext()?;

    let palette = match palette {
        OptionalUpdate::Missing => None,
        OptionalUpdate::SetDefault => Some(Default::default()),
        OptionalUpdate::Update(palette) => {
            Some(validate_palette(palette).map_err(|e| ApiError::from(JsValue::from_str(&e)))?)
        },
    };

    let old_ids = this.workspace.panel_ids();
    let replace = panels.is_some();

    // Phase 1 — models only, NO renders and NO draws
    let mut id_map: HashMap<String, String> = Default::default();
    let mut contents = Vec::new();
    let mut eject_tasks = Vec::new();
    match panels {
        // `panels` entries are `ViewerConfigInitial`s — `table` required by
        // TYPE (a placed panel without a binding would be permanently blank),
        // and no per-panel `settings` exists (element-level; carried by the
        // top-level `active` field). An EMPTY `panels` map restores to the
        // zero-panel empty stage — the former table-less fallback panel was
        // exactly the blank-panel state this type exists to preclude.
        Some(panels) => {
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

                id_map.insert(saved_id, fresh.as_str().to_owned());
                contents.push((fresh, session, renderer, config));
            }

            if let Some(panel) = this.workspace.take_reserved() {
                eject_tasks.push(eject_panel(panel, Disposal::Reject));
            }

            for old in &old_ids {
                if let Some(panel) = this.workspace.remove_panel(old) {
                    eject_tasks.push(eject_panel(panel, Disposal::Reject));
                }
            }
        },
        None => {
            for id in &old_ids {
                id_map.insert(id.as_str().to_owned(), id.as_str().to_owned());
            }
        },
    }

    if let Some(palette) = palette {
        this.presentation.set_palette(palette)?;
    }

    // Phase 2 — stage the remapped layout tree on the Workspace
    let layout_staged = layout.is_some();
    if let Some(layout) = layout {
        this.workspace
            .set_pending_layout(layout.remap(&|name| id_map.get(name).cloned()));
        if !replace {
            this.workspace.layout_staged().emit(());
        }
    }

    // Phase 3 — the single visible commit
    let active_target = match &active {
        OptionalUpdate::Update(saved) => {
            let target = id_map.get(saved).cloned();
            if target.is_none() {
                tracing::warn!("`active` names unknown panel \"{saved}\"");
            }

            target
        },
        _ => None,
    };

    let commit_target = if replace {
        active_target
            .clone()
            .or_else(|| contents.first().map(|(id, ..)| id.as_str().to_owned()))
    } else if layout_staged || active_target.is_some() {
        active_target
            .clone()
            .or_else(|| this.workspace.active_id().map(|id| id.as_str().to_owned()))
    } else {
        None
    };

    if let Some(target) = commit_target
        && let Some(app) = this.root.borrow().as_ref()
    {
        app.send_message(PerspectiveViewerMsg::CommitWorkspaceRestore(target));
    }

    let settings = if replace {
        Some(active_target.is_some())
    } else {
        match active {
            OptionalUpdate::Update(_) => active_target.as_ref().map(|_| true),
            OptionalUpdate::SetDefault => Some(false),
            OptionalUpdate::Missing => None,
        }
    };

    if let Some(open) = settings
        && let Some(app) = this.root.borrow().as_ref()
    {
        // Silent (`announce: false`): each restored panel's own view-config
        // commit dispatch announces the config, settings field included.
        app.send_message(PerspectiveViewerMsg::ToggleSettingsInit(
            Some(SettingsUpdate::Update(open)),
            false,
            None,
        ));
    }

    let masters = match masters {
        OptionalUpdate::Missing => None,
        OptionalUpdate::SetDefault => Some(Vec::new()),
        OptionalUpdate::Update(masters) => Some(
            masters
                .into_iter()
                .filter_map(|saved| match id_map.get(&saved) {
                    Some(fresh) => Some(PanelId::from(fresh.as_str())),
                    None => {
                        tracing::warn!("`masters` names unknown panel \"{saved}\"");
                        None
                    },
                })
                .collect::<Vec<_>>(),
        ),
    };

    if let Some(masters) = masters {
        let before = this.workspace.masters();
        this.workspace.set_masters(masters);
        if !replace {
            let after = this.workspace.masters();
            for id in &old_ids {
                let is_master = after.contains(id);
                if before.contains(id) != is_master
                    && let Some(panel) = this.workspace.panel(id)
                {
                    let mode = if is_master {
                        "SELECT_ROW_TREE"
                    } else {
                        "READ_ONLY"
                    };

                    set_edit_mode(&panel.session, &panel.renderer, mode);
                    if !is_master {
                        this.workspace.clear_contribution(id);
                    }
                }
            }
        }
    }

    match global_filters {
        OptionalUpdate::Missing => {},
        OptionalUpdate::SetDefault => this.workspace.set_global_filters(Vec::new()),
        OptionalUpdate::Update(filters) => this.workspace.set_global_filters(filters),
    }

    Ok((contents, eject_tasks))
}
