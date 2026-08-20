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

use std::collections::BTreeMap;

use crate::config::{CssKind, CssLiteralUse, NamedValue, assign_palette_names};
use crate::presentation::Presentation;
use crate::workspace::{PanelId, Workspace};

/// Every CSS literal in use across the workspace, as `(panel id, use)`,
/// in a deterministic order.
pub fn styles_in_use(workspace: &Workspace) -> Vec<(PanelId, CssLiteralUse)> {
    let mut ids = workspace.panel_ids();
    ids.sort_by(|a, b| a.as_str().cmp(b.as_str()));
    let mut out = vec![];
    for id in ids {
        let Some(panel) = workspace.panel(&id) else {
            continue;
        };

        let uses = {
            let view_config = panel.session.get_view_config();
            panel
                .renderer
                .css_literals_in_use(&view_config, &panel.session)
        };

        out.extend(uses.into_iter().map(|x| (id.clone(), x)));
    }

    out
}

/// The workspace palette set: the restored palette ∪ every literal in
/// use, named stably (see [`crate::config::assign_palette_names`]).
pub fn palette_set(workspace: &Workspace, presentation: &Presentation) -> BTreeMap<String, String> {
    let host: Vec<NamedValue> = CssKind::ALL
        .into_iter()
        .flat_map(|kind| presentation.host_named_values(kind))
        .collect();

    let in_use: Vec<(CssKind, String)> = styles_in_use(workspace)
        .into_iter()
        .map(|(_, x)| (x.kind, x.literal))
        .collect();

    assign_palette_names(&presentation.palette(), &host, &in_use, &|name| {
        presentation.resolve_css_var(name).is_some()
    })
}

/// The named values of `kind` a picker offers: the palette set's
/// entries, then any theme/page-authored host entries not already in
/// the set by name.
pub fn named_values(
    workspace: &Workspace,
    presentation: &Presentation,
    kind: CssKind,
) -> Vec<NamedValue> {
    let mut out: Vec<NamedValue> = palette_set(workspace, presentation)
        .into_iter()
        .filter(|(name, _)| name.starts_with(kind.var_prefix()))
        .map(|(name, value)| NamedValue { name, value })
        .collect();

    for entry in presentation.host_named_values(kind) {
        if !out.iter().any(|x| x.name == entry.name) {
            out.push(entry);
        }
    }

    out
}
