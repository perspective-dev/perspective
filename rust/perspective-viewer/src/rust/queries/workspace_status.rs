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

use perspective_client::Connection;
use perspective_js::utils::ApiError;

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

impl StatusState {
    /// The CSS class the status icon wears in this state.
    pub fn class_name(self) -> &'static str {
        match self {
            Self::Errored => "errored",
            Self::Normal => "connected",
            Self::Updating => "updating",
            Self::Loading => "loading",
            Self::Pending => "pending",
            Self::Uninitialized => "uninitialized",
        }
    }
}

/// The displayed parts of an error.
#[derive(Clone, Debug, PartialEq)]
pub struct StatusError {
    pub message: String,
    pub stack: String,
    pub kind: &'static str,
}

/// The status of one loaded `Client`: its connection, and the panels bound
/// to it.
#[derive(Clone, Debug, PartialEq)]
pub struct ClientStatus {
    pub name: String,
    pub is_default: bool,

    /// Whether the connection is up and the viewer has recovered from any
    /// loss of it.
    pub is_open: bool,

    /// The connection's error while it is not open, else the worst bound
    /// panel's.
    pub error: Option<StatusError>,
    pub can_reconnect: bool,
    pub panel_state: StatusState,
    pub panels: Vec<PanelId>,
}

impl ClientStatus {
    /// The state of this `Client`'s section: errored while not open, else the
    /// worst of its panels.
    pub fn state(&self) -> StatusState {
        if self.is_open {
            self.panel_state
        } else {
            StatusState::Errored
        }
    }
}

fn status_error(error: &ApiError) -> StatusError {
    StatusError {
        message: error.message(),
        stack: error.stacktrace(),
        kind: error.kind(),
    }
}

/// The status of every panel and `Client` in a workspace.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct WorkspaceStatus {
    pub state: StatusState,
    pub error: Option<StatusError>,
    pub clients: Vec<ClientStatus>,

    /// The panels whose own state is [`StatusState::Errored`], with their
    /// errors.
    pub errored: Vec<(PanelId, StatusError)>,
}

struct PanelStatus {
    state: StatusState,
    error: Option<StatusError>,
}

fn panel_status(session: &Session, renderer: &Renderer) -> PanelStatus {
    let errored = |message, stack, kind| PanelStatus {
        state: StatusState::Errored,
        error: Some(StatusError {
            message,
            stack,
            kind,
        }),
    };

    let has_table_cells = session.has_table_cells();
    let has_table = session.has_table();
    let state = if let Some(err) = session.error_state() {
        return errored(err.message(), err.stacktrace(), err.kind());
    } else if let Some(RenderError(err)) = renderer.failure() {
        return errored(err.message(), err.stacktrace(), err.kind());
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

    PanelStatus { state, error: None }
}

/// The [`StatusState`] of one panel's `Session` and `Renderer`.
pub fn panel_state(session: &Session, renderer: &Renderer) -> StatusState {
    panel_status(session, renderer).state
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
            let panel_state = worst.map_or(StatusState::Normal, |(.., status)| status.state);
            let (lost, can_reconnect) = match client.connection() {
                Connection::Lost { error, reconnect } => (Some(error), reconnect.is_some()),
                Connection::Open => match workspace.client_loss(&name) {
                    Some(error) => (Some(error), true),
                    None => (
                        None,
                        panel_state == StatusState::Errored
                            || workspace.client_failure(&name).is_some(),
                    ),
                },
            };

            ClientStatus {
                is_default: default.as_deref() == Some(name.as_str()),
                is_open: lost.is_none(),
                can_reconnect,
                error: workspace
                    .client_failure(&name)
                    .map(|error| status_error(&error))
                    .or_else(|| match lost {
                        Some(error) => Some(status_error(&ApiError::from(error))),
                        None => worst.and_then(|(.., status)| status.error.clone()),
                    }),
                panel_state,
                panels: bound.iter().map(|(id, ..)| id.clone()).collect(),
                name,
            }
        })
        .collect::<Vec<_>>();

    if workspace.is_empty_stage()
        && let Some(err) = workspace.stage_error()
    {
        return WorkspaceStatus {
            state: StatusState::Errored,
            error: Some(status_error(&err)),
            clients,
            errored: vec![],
        };
    }

    let worst = panels.iter().max_by_key(|(.., status)| status.state);
    let lost = clients.iter().find(|client| !client.is_open);
    let state = clients
        .iter()
        .map(|client| client.state())
        .chain(worst.map(|(.., status)| status.state))
        .max()
        .unwrap_or_default();

    let error = worst
        .and_then(|(.., status)| status.error.clone())
        .or_else(|| lost.and_then(|client| client.error.clone()));

    let errored = panels
        .iter()
        .filter_map(|(id, _, status)| Some((id.clone(), status.error.clone()?)))
        .collect();

    WorkspaceStatus {
        state,
        error,
        clients,
        errored,
    }
}
