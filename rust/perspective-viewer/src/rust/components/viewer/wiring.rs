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

//! Engine → root wiring: the PubSub subscriptions and direct callbacks that
//! reflect [`Session`]/[`Renderer`]/[`Presentation`] state into the root's
//! value-semantic snapshots.

use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::PerspectiveViewerMsg::{self, *};
use crate::js::JsPerspectiveViewerPlugin;
use crate::queries::*;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;

/// Subscribe to *every* panel's `title_changed` so a title change on any panel
/// (not just the active one — e.g. a non-active panel restored via
/// `restorePanel`) re-renders the tab titles. Recreated when the panel set
/// changes.
pub(super) fn subscribe_panel_titles(ctx: &Context<PerspectiveViewer>) -> Vec<Subscription> {
    let cb = ctx.link().callback(|_| PerspectiveViewerMsg::TitlesChanged);
    ctx.props()
        .workspace
        .panel_ids()
        .iter()
        .filter_map(|id| ctx.props().workspace.panel(id))
        .flat_map(|p| {
            // Re-collect titles on a title change *or* a table (un)load — the
            // latter so the untitled table-name fallback appears once a table
            // binds to the panel.
            [
                p.session.title_changed.add_notify_listener(&cb),
                p.session.table_loaded.add_notify_listener(&cb),
            ]
        })
        .collect()
}

/// One status subscription set per panel, feeding the root's
/// [`crate::queries::WorkspaceStatus`] snapshot.
pub(super) fn subscribe_panel_status(ctx: &Context<PerspectiveViewer>) -> Vec<Subscription> {
    let cb = ctx.link().callback(|_| UpdateWorkspaceStatus);
    ctx.props()
        .workspace
        .panels()
        .into_iter()
        .flat_map(|p| {
            [
                p.session.table_loaded.add_notify_listener(&cb),
                p.session.table_unloaded.add_notify_listener(&cb),
                p.session.table_errored.add_notify_listener(&cb),
                p.session.commit_reconciled.add_notify_listener(&cb),
                p.session.stats_changed.add_notify_listener(&cb),
                p.session.config_runs.changed().add_notify_listener(&cb),
                p.renderer.failure_changed.add_notify_listener(&cb),
            ]
        })
        .collect()
}

/// Per-active-panel subscriptions: reflect the *active* panel's
/// session/renderer PubSub events into the root's snapshots. Dropped +
/// recreated against the new active panel on `SetActivePanel` (pair with
/// [`clear_active_callbacks`] for the direct-callback half).
pub(super) fn create_active_subscriptions(
    ctx: &Context<PerspectiveViewer>,
    session: &Session,
    renderer: &Renderer,
) -> Vec<Subscription> {
    let session_props_sub = {
        let s = session.clone();
        let cb = ctx
            .link()
            .callback(move |_: ()| UpdateSession(Box::new(s.to_props())));

        let sub1 = session.table_loaded.add_notify_listener(&cb);
        let sub2 = session.table_unloaded.add_notify_listener(&cb);
        let sub3 = session.commit_reconciled.add_notify_listener(&cb);
        let sub4 = session.view_config_changed.add_notify_listener(&cb);
        let sub5 = session.title_changed.add_notify_listener(&cb);
        let sub6 = session.table_errored.add_notify_listener(&cb);
        let sub7 = session.column_stats_changed.add_notify_listener(&cb);
        vec![sub1, sub2, sub3, sub4, sub5, sub6, sub7]
    };

    let renderer_props_sub = {
        let cb_plugin = ctx.link().callback({
            let renderer = renderer.clone();
            move |_: JsPerspectiveViewerPlugin| UpdateRenderer(Box::new(renderer.to_props(None)))
        });

        let cb_plugin_config = ctx.link().callback({
            let renderer = renderer.clone();
            move |_: serde_json::Map<String, serde_json::Value>| {
                UpdateRenderer(Box::new(renderer.to_props(None)))
            }
        });

        let cb_columns_config = ctx.link().callback({
            let renderer = renderer.clone();
            move |_: ColumnConfigMap| UpdateRenderer(Box::new(renderer.to_props(None)))
        });

        let sub1 = renderer.plugin_changed.add_listener(cb_plugin);
        let sub2 = renderer
            .plugin_config_changed
            .add_listener(cb_plugin_config);

        let sub3 = renderer
            .columns_config_changed
            .add_listener(cb_columns_config);

        let cb_config_defaults = ctx.link().callback({
            let renderer = renderer.clone();
            move |()| UpdateRenderer(Box::new(renderer.to_props(None)))
        });

        let sub4 = renderer
            .config_defaults_changed
            .add_listener(cb_config_defaults);

        let cb_failure = ctx.link().callback({
            let renderer = renderer.clone();
            move |()| UpdateRenderer(Box::new(renderer.to_props(None)))
        });

        let sub5 = renderer.failure_changed.add_listener(cb_failure);
        vec![sub1, sub2, sub3, sub4, sub5]
    };

    let mut subscriptions = Vec::new();
    subscriptions.extend(session_props_sub);
    subscriptions.extend(renderer_props_sub);
    subscriptions
}

/// Element-level (shared, not per-panel) subscriptions: presentation +
/// drag/drop. Created once at construction.
pub(super) fn create_shared_subscriptions(ctx: &Context<PerspectiveViewer>) -> Vec<Subscription> {
    let presentation_props_sub = {
        let presentation = ctx.props().presentation.clone();
        let cb_settings = ctx
            .link()
            .callback(|(open, _): (bool, bool)| UpdateSettingsOpen(open));
        let cb_theme = {
            let pres = presentation.clone();
            ctx.link()
                .callback(move |(themes, _): (PtrEqRc<Vec<String>>, _)| {
                    UpdatePresentation(Box::new(pres.to_props(themes)))
                })
        };

        let cb_column_settings = {
            let pres = presentation.clone();
            ctx.link().callback(move |_: (bool, Option<String>)| {
                UpdateColumnSettings(Box::new(pres.get_open_column_settings()))
            })
        };

        let sub1 = presentation.settings_open_changed.add_listener(cb_settings);
        let sub2 = presentation.theme_config_updated.add_listener(cb_theme);
        let sub3 = presentation
            .column_settings_open_changed
            .add_listener(cb_column_settings);

        vec![sub1, sub2, sub3]
    };

    // The `Workspace`-owned global filter set → the root's render snapshot.
    let filters_sub = {
        let cb = ctx.link().callback(|_: ()| UpdateGlobalFilters);
        ctx.props()
            .workspace
            .filters_changed()
            .add_notify_listener(&cb)
    };

    // Panel-phase transitions (`Workspace::insert_panel` at
    // `PanelPhase::Staging` / `Workspace::promote`) → a root re-render for
    // the stage-level chrome (`only-child` class, binding resync).
    // `MainPanel` inserts/reveals promoted panels via its OWN
    // `staged_changed` subscription (`MainPanelMsg::StagedChanged`) — see
    // `WorkspaceData::staged_changed`.
    let staged_sub = {
        let cb = ctx.link().callback(|_: ()| LayoutChanged);
        ctx.props()
            .workspace
            .staged_changed()
            .add_notify_listener(&cb)
    };

    // Client registration, binding changes and the `Workspace`-owned stage
    // error (shown at zero panels) all feed the aggregate status.
    let status_subs = {
        let cb = ctx.link().callback(|_: ()| UpdateWorkspaceStatus);
        let workspace = &ctx.props().workspace;
        [
            workspace.client_registered().add_notify_listener(&cb),
            workspace.client_state_changed().add_notify_listener(&cb),
            workspace.bindings_changed().add_notify_listener(&cb),
            workspace.stage_error_changed().add_notify_listener(&cb),
        ]
    };

    let mut subscriptions = Vec::new();
    subscriptions.extend(presentation_props_sub);
    subscriptions.push(filters_sub);
    subscriptions.push(staged_sub);
    subscriptions.extend(status_subs);
    subscriptions
}

/// Inject the *active* panel's session/renderer direct callbacks into its
/// engine handles. Cleared via [`clear_active_callbacks`] before re-targeting
/// on `SetActivePanel`.
pub(super) fn inject_active_callbacks(
    ctx: &Context<PerspectiveViewer>,
    session: &Session,
    renderer: &Renderer,
) {
    // Session: on_stats_changed
    {
        let s = session.clone();
        let cb = ctx
            .link()
            .callback(move |_: ()| UpdateSessionStats(s.has_table_cells(), s.has_table()));

        *session.on_stats_changed.borrow_mut() = Some(cb);
    }

    // Renderer: on_render_limits_changed (combines UpdateRenderer + column
    // locator recheck that were previously two separate PubSub subscriptions).
    {
        let presentation = ctx.props().presentation.clone();
        let r = renderer.clone();
        let s = session.clone();
        let cb = ctx.link().batch_callback(move |limits: RenderLimits| {
            let mut msgs = vec![UpdateRenderer(Box::new(r.to_props(Some(limits))))];
            if !limits.is_update {
                let ocs = presentation.get_open_column_settings();
                let still_open =
                    get_current_column_locator(&ocs, &r, &s.get_view_config(), &s.metadata())
                        .is_some();

                msgs.push(OpenColumnSettings {
                    target: ocs.target.filter(|_| still_open),
                    sender: None,
                    toggle: false,
                });
            }

            msgs
        });

        *renderer.on_render_limits_changed.borrow_mut() = Some(cb);
    }
}

/// Clear the active panel's session/renderer direct callbacks so a
/// no-longer-active panel stops driving the root's snapshots.
pub(super) fn clear_active_callbacks(session: &Session, renderer: &Renderer) {
    *session.on_stats_changed.borrow_mut() = None;
    *renderer.on_render_limits_changed.borrow_mut() = None;
}

/// Inject element-level (shared) presentation callbacks. Created once at
/// construction.
pub(super) fn inject_shared_callbacks(ctx: &Context<PerspectiveViewer>) {
    // Presentation: on_is_workspace_changed
    {
        let cb = ctx.link().callback(UpdateIsWorkspace);
        *ctx.props()
            .presentation
            .on_is_workspace_changed
            .borrow_mut() = Some(cb);
    }

    // Drag/drop: on_dragstart (post-merge: lives on Presentation)
    {
        let presentation = ctx.props().presentation.clone();
        let cb = ctx.link().callback(move |_: DragEffect| {
            UpdateDragDrop(Box::new(presentation.drag_drop_props()))
        });

        *ctx.props().presentation.on_dragstart.borrow_mut() = Some(cb);
    }

    // Drag/drop: on_dragend
    {
        let cb = ctx.link().callback(|_: ()| UpdateDragDrop(Box::default()));
        *ctx.props().presentation.on_dragend.borrow_mut() = Some(cb);
    }
}
