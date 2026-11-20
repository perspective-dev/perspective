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

use crate::renderer::{RenderError, Renderer};
use crate::session::{Session, TableLoadState};
use crate::workspace::{PanelId, Workspace};

/// A status indicator state, ordered by severity.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub enum StatusState {
    #[default]
    Uninitialized,
    Normal,
    Updating,
    Pending,
    Loading,
    Errored,
}

/// The displayed parts of an error.
#[derive(Clone, Debug, PartialEq)]
pub struct StatusError {
    pub message: String,
    pub stack: String,
    pub kind: &'static str,
}

/// The status of one loaded `Client`, derived from the panels bound to it.
#[derive(Clone, Debug, PartialEq)]
pub struct ClientStatus {
    pub name: String,
    pub is_default: bool,
    pub state: StatusState,
    pub error: Option<StatusError>,
    pub can_reconnect: bool,
    pub panels: Vec<PanelId>,
}

/// The status of every panel and `Client` in a workspace.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct WorkspaceStatus {
    pub state: StatusState,
    pub error: Option<StatusError>,
    pub clients: Vec<ClientStatus>,
}

struct PanelStatus {
    state: StatusState,
    error: Option<StatusError>,
    can_reconnect: bool,
}

fn panel_status(session: &Session, renderer: &Renderer) -> PanelStatus {
    let errored = |message, stack, kind, can_reconnect| PanelStatus {
        state: StatusState::Errored,
        error: Some(StatusError {
            message,
            stack,
            kind,
        }),
        can_reconnect,
    };

    let has_table_cells = session.has_table_cells();
    let has_table = session.has_table();
    let state = if let Some(err) = session.error_state() {
        return errored(
            err.message(),
            err.stacktrace(),
            err.kind(),
            err.is_reconnect(),
        );
    } else if let Some(RenderError(err)) = renderer.failure() {
        return errored(err.message(), err.stacktrace(), err.kind(), true);
    } else if !has_table_cells && matches!(has_table, Some(TableLoadState::Loading)) {
        StatusState::Loading
    } else if matches!(has_table, Some(TableLoadState::Pending)) {
        StatusState::Pending
    } else if session.config_runs.count() > 0 {
        StatusState::Updating
    } else if has_table_cells {
        StatusState::Normal
    } else {
        StatusState::Uninitialized
    };

    PanelStatus {
        state,
        error: None,
        can_reconnect: false,
    }
}

/// Compute the [`WorkspaceStatus`] of `workspace` from its panels and
/// `Client`s.
pub fn workspace_status(workspace: &Workspace) -> WorkspaceStatus {
    let panels = workspace
        .panels()
        .into_iter()
        .map(|panel| {
            let status = panel_status(&panel.session, &panel.renderer);
            let client = panel.session.get_client().map(|x| x.get_name().to_owned());
            (panel.id, client, status)
        })
        .collect::<Vec<_>>();

    let default = workspace.default_client().map(|x| x.get_name().to_owned());

    let clients = workspace
        .clients()
        .into_iter()
        .map(|client| {
            let name = client.get_name().to_owned();
            let bound = panels
                .iter()
                .filter(|(_, client, _)| client.as_deref() == Some(name.as_str()))
                .collect::<Vec<_>>();

            let worst = bound.iter().max_by_key(|(.., status)| status.state);
            ClientStatus {
                is_default: default.as_deref() == Some(name.as_str()),
                state: worst.map_or(StatusState::Normal, |(.., status)| status.state),
                error: worst.and_then(|(.., status)| status.error.clone()),
                can_reconnect: bound.iter().any(|(.., status)| status.can_reconnect),
                panels: bound.iter().map(|(id, ..)| id.clone()).collect(),
                name,
            }
        })
        .collect::<Vec<_>>();

    // At zero panels the only error state is the element-level stage error
    // (see `Workspace::stage_error`), e.g. a rejected `restore()`.
    if workspace.is_empty_stage()
        && let Some(err) = workspace.stage_error()
    {
        return WorkspaceStatus {
            state: StatusState::Errored,
            error: Some(StatusError {
                message: err.message(),
                stack: err.stacktrace(),
                kind: err.kind(),
            }),
            clients,
        };
    }

    let worst = panels.iter().max_by_key(|(.., status)| status.state);
    let state = clients
        .iter()
        .map(|client| client.state)
        .chain(worst.map(|(.., status)| status.state))
        .max()
        .unwrap_or_default();

    WorkspaceStatus {
        state,
        error: worst.and_then(|(.., status)| status.error.clone()),
        clients,
    }
}
