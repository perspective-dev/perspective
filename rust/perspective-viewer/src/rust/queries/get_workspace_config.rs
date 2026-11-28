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

use std::collections::{BTreeMap, BTreeSet};

use super::*;
use crate::config::*;
use crate::tasks::WorkspaceHost;
use crate::utils::*;
use crate::*;

/// Compose the current [`WorkspaceConfig`] of `host`, the body of
/// `saveWorkspace()`.
pub async fn get_workspace_config(
    host: &WorkspaceHost,
    full_palette: bool,
) -> ApiResult<WorkspaceConfig> {
    host.workspace.effects().settle().await;
    let mut panels: BTreeMap<String, PanelViewerConfig<String, String>> = Default::default();
    for id in &host.workspace.panel_ids() {
        let panel = host.workspace.panel(id).into_apierror()?;
        let config = panel
            .renderer
            .clone()
            .with_lock(async {
                get_viewer_config(&panel.session, &panel.renderer, &host.presentation).await
            })
            .await?;

        panels.insert(id.as_str().to_owned(), config.panel);
    }

    let mut palette = palette_set(&host.workspace, &host.presentation);
    let mut referenced = BTreeSet::new();
    for (id, item) in styles_in_use(&host.workspace) {
        let Some(name) = palette_name_for(&palette, item.kind, &item.literal) else {
            continue;
        };

        if let Some(entry) = panels
            .get_mut(id.as_str())
            .and_then(|panel| panel.columns_config.get_mut(&item.column))
        {
            entry.insert(item.key, serde_json::Value::String(format_var_ref(&name)));
            referenced.insert(name);
        }
    }

    if !full_palette {
        palette.retain(|name, _| referenced.contains(name));
    }

    let active = host
        .presentation
        .is_settings_open()
        .then(|| host.workspace.active_id())
        .flatten()
        .map(|id| id.as_str().to_owned());

    let layout = match host.workspace.pending_layout() {
        Some(layout) => Some(layout),
        None => host
            .layout_element()
            .map(|l| l.save().into_serde_ext::<crate::js::Layout>())
            .transpose()?,
    };

    Ok(WorkspaceConfig {
        version: API_VERSION.to_string(),
        active,
        layout,
        panels,
        derived_tables: host.workspace.derived_configs(),
        global_filters: host.workspace.global_filters(),
        masters: host
            .workspace
            .masters()
            .iter()
            .map(|id| id.as_str().to_owned())
            .collect(),
        palette,
        unknown: UnknownKeys,
    })
}
