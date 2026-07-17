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
//! value-semantic snapshots, plus the raw window/host DOM listeners the root
//! owns (shift-key affordance, master/detail selection).

use std::collections::HashMap;

use perspective_client::config::{Filter, FilterTerm, Scalar};
use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{FocusEvent, KeyboardEvent};
use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::MasterSelection;
use super::msg::PerspectiveViewerMsg::{self, *};
use crate::js::JsPerspectiveViewerPlugin;
use crate::queries::*;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;

/// Window listeners that toggle the `.shift-active` class on the host element
/// while the Shift key is held, making Shift-modified affordances (e.g.
/// inactive column add, active column remove, status-bar reset) visually
/// discoverable. Stored so the closures outlive `create`.
pub(super) struct ShiftListeners {
    elem: web_sys::HtmlElement,
    keydown: Closure<dyn FnMut(KeyboardEvent)>,
    keyup: Closure<dyn FnMut(KeyboardEvent)>,
    blur: Closure<dyn FnMut(FocusEvent)>,
}

impl Drop for ShiftListeners {
    fn drop(&mut self) {
        let win = global::window();
        let _ = win
            .remove_event_listener_with_callback("keydown", self.keydown.as_ref().unchecked_ref());
        let _ =
            win.remove_event_listener_with_callback("keyup", self.keyup.as_ref().unchecked_ref());
        let _ = win.remove_event_listener_with_callback("blur", self.blur.as_ref().unchecked_ref());
        let _ = self.elem.class_list().remove_1("shift-active");
    }
}

pub(super) fn install_shift_listeners(elem: web_sys::HtmlElement) -> ShiftListeners {
    let keydown = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if event.key() == "Shift" {
                let _ = elem.class_list().add_1("shift-active");
            }
        }) as Box<dyn FnMut(KeyboardEvent)>)
    };

    let keyup = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if event.key() == "Shift" {
                let _ = elem.class_list().remove_1("shift-active");
            }
        }) as Box<dyn FnMut(KeyboardEvent)>)
    };

    let blur = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |_: FocusEvent| {
            let _ = elem.class_list().remove_1("shift-active");
        }) as Box<dyn FnMut(FocusEvent)>)
    };

    let win = global::window();
    let _ = win.add_event_listener_with_callback("keydown", keydown.as_ref().unchecked_ref());
    let _ = win.add_event_listener_with_callback("keyup", keyup.as_ref().unchecked_ref());
    let _ = win.add_event_listener_with_callback("blur", blur.as_ref().unchecked_ref());

    ShiftListeners {
        elem,
        keydown,
        keyup,
        blur,
    }
}

/// The `perspective-global-filter` host listener (master/detail): routes a
/// master panel's selection state to
/// [`PerspectiveViewerMsg::MasterContribution`] — `selected: true` REPLACES
/// the panel's contribution with the event's filters, `selected: false`
/// clears it. Kept alive on the root; attached once in `rendered`.
pub(super) fn global_filter_listener(
    ctx: &Context<PerspectiveViewer>,
) -> Closure<dyn FnMut(web_sys::Event)> {
    let cb = ctx
        .link()
        .callback(|(panel, selection)| PerspectiveViewerMsg::MasterContribution(panel, selection));

    Closure::wrap(Box::new(move |event: web_sys::Event| {
        // `PerspectiveSelectDetail` exposes `selected`/`insertFilters` as
        // prototype *getters*; struct deserialization reads each field by
        // named property access (not own-key enumeration), so the getters are
        // invoked — a map target would see none of them. Field names mirror
        // the detail EXACTLY — it mixes `insertFilters` (camel) with
        // `column_names` (snake), so no `rename_all`.
        #[derive(serde::Deserialize)]
        struct SelectDetail {
            // Only multi-panel selections (carrying a source `panel` id) route.
            panel: Option<String>,

            #[serde(default)]
            selected: bool,

            #[serde(default, rename = "insertFilters")]
            insert_filters: Vec<Filter>,

            #[serde(default)]
            row: HashMap<String, serde_json::Value>,

            #[serde(default)]
            column_names: Vec<serde_json::Value>,
        }

        let Some(ce) = event.dyn_ref::<web_sys::CustomEvent>() else {
            return;
        };

        let Ok(SelectDetail {
            panel: Some(panel),
            selected,
            insert_filters,
            row,
            column_names,
        }) = ce.detail().into_serde_ext()
        else {
            return;
        };

        let selection = selected.then(|| MasterSelection {
            cell_fallback: cell_fallback(&row, &column_names),
            filters: insert_filters,
        });

        cb.emit((panel, selection));
    }) as Box<dyn FnMut(web_sys::Event)>)
}

/// The `perspective-click` host listener: a click on a MASTER panel is a
/// selection too (chart bars, flat datagrids — plugins whose click carries
/// the clicked datum but which have no select mode), routed as an
/// always-`Some` [`PerspectiveViewerMsg::MasterContribution`]. Clicks have no
/// deselect arm — deselection arrives via the `perspective-global-filter`
/// listener or the bar's chip ×. Non-master panels' clicks are dropped by the
/// handler's `is_master` guard, and the datagrid suppresses clicks entirely
/// in its row-select mode so a select/deselect never races a click echo.
pub(super) fn master_click_listener(
    ctx: &Context<PerspectiveViewer>,
) -> Closure<dyn FnMut(web_sys::Event)> {
    let cb = ctx
        .link()
        .callback(|(panel, selection)| PerspectiveViewerMsg::MasterContribution(panel, selection));

    Closure::wrap(Box::new(move |event: web_sys::Event| {
        #[derive(serde::Deserialize)]
        struct ClickConfig {
            #[serde(default)]
            filter: Vec<Filter>,
        }

        #[derive(serde::Deserialize)]
        struct ClickDetail {
            // Only multi-panel clicks (carrying a source `panel` id) route.
            panel: Option<String>,

            #[serde(default)]
            config: Option<ClickConfig>,

            #[serde(default)]
            row: HashMap<String, serde_json::Value>,

            #[serde(default)]
            column_names: Vec<serde_json::Value>,
        }

        let Some(ce) = event.dyn_ref::<web_sys::CustomEvent>() else {
            return;
        };

        let Ok(ClickDetail {
            panel: Some(panel),
            config,
            row,
            column_names,
        }) = ce.detail().into_serde_ext()
        else {
            return;
        };

        let selection = MasterSelection {
            cell_fallback: cell_fallback(&row, &column_names),
            filters: config.map(|x| x.filter).unwrap_or_default(),
        };

        cb.emit((panel, Some(selection)));
    }) as Box<dyn FnMut(web_sys::Event)>)
}

/// Synthesize the clicked-cell `[column, "==", value]` fallback clause from a
/// select/click detail's `row` + `column_names` — the broadcast for masters
/// whose events carry no derivable filters (e.g. a FLAT datagrid, whose rows
/// have no group-by path). The first real (non-`__`-internal, string-named)
/// column with a scalar value in the row wins.
fn cell_fallback(
    row: &HashMap<String, serde_json::Value>,
    column_names: &[serde_json::Value],
) -> Option<Filter> {
    let column = column_names
        .iter()
        .filter_map(|x| x.as_str())
        .find(|x| !x.starts_with("__"))?;

    let term = match row.get(column)? {
        serde_json::Value::Bool(x) => Scalar::Bool(*x),
        serde_json::Value::Number(x) => Scalar::Float(x.as_f64()?),
        serde_json::Value::String(x) => Scalar::String(x.clone()),
        _ => return None,
    };

    Some(Filter::new(column, "==", FilterTerm::Scalar(term)))
}

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
        // Snapshot refresh on every RECONCILED commit (SKIP/REUSE/paused
        // included), not just `View` construction.
        let sub3 = session.commit_reconciled.add_notify_listener(&cb);
        let sub4 = session.view_config_changed.add_notify_listener(&cb);
        let sub5 = session.title_changed.add_notify_listener(&cb);

        // The `StatusIndicator` spinner count. LEVEL-triggered: the payload
        // is the ABSOLUTE in-flight config-run count (RAII-settled by
        // `ConfigRunToken`), which the handler ASSIGNS — replacing the
        // edge-counted `view_config_changed`+1/`view_created`−1 pair, whose
        // pairing the pipeline does not guarantee (stuck-spinner
        // regression — see `UPDATE_COUNT_REGRESSION_PLAN.md`).
        let sub6 = session
            .run_state_changed
            .add_listener(ctx.link().callback(UpdateInFlight));

        // Stats fetch resolution (populates session.column_stats) triggers
        // a fresh `SessionProps` so `column_stats` reaches downstream
        // components and the StyleTab re-queries the schema with the
        // new value.
        let sub7 = session.column_stats_changed.add_notify_listener(&cb);

        vec![sub1, sub2, sub3, sub4, sub5, sub6, sub7]
    };

    let renderer_props_sub = {
        let cb_plugin = ctx.link().callback({
            let renderer = renderer.clone();
            move |_: JsPerspectiveViewerPlugin| UpdateRenderer(Box::new(renderer.to_props(None)))
        });

        // Re-snapshot RendererProps when the plugin_config bucket
        // changes (in-tab edit via `send_plugin_config`, JSON paste via
        // `restore_and_render`, full clear via `reset_all` with
        // `all=true`). Without this, `RendererProps.plugin_config`
        // would stay frozen at its construct-time value and `PluginTab`
        // would render stale.
        let cb_plugin_config = ctx.link().callback({
            let renderer = renderer.clone();
            move |_: serde_json::Map<String, serde_json::Value>| {
                UpdateRenderer(Box::new(renderer.to_props(None)))
            }
        });

        let sub1 = renderer.plugin_changed.add_listener(cb_plugin);
        let sub2 = renderer
            .plugin_config_changed
            .add_listener(cb_plugin_config);

        vec![sub1, sub2]
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
        let cb_settings = ctx.link().callback(UpdateSettingsOpen);
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

    let dragdrop_props_sub = {
        let cb_clear = ctx.link().callback(|_: ()| UpdateDragDrop(Box::default()));
        let sub1 = ctx
            .props()
            .presentation
            .drop_received
            .add_notify_listener(&cb_clear);

        vec![sub1]
    };

    // The `Workspace`-owned global filter set → the root's render snapshot.
    let filters_sub = {
        let cb = ctx.link().callback(|_: ()| UpdateGlobalFilters);
        ctx.props()
            .workspace
            .filters_changed()
            .add_notify_listener(&cb)
    };

    let mut subscriptions = Vec::new();
    subscriptions.extend(presentation_props_sub);
    subscriptions.extend(dragdrop_props_sub);
    subscriptions.push(filters_sub);
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
            .callback(move |_: ()| UpdateSessionStats(s.get_table_stats(), s.has_table()));

        *session.on_stats_changed.borrow_mut() = Some(cb);
    }

    // Session: on_table_errored
    {
        let s = session.clone();
        let cb = ctx
            .link()
            .callback(move |_: ()| UpdateSession(Box::new(s.to_props())));

        *session.on_table_errored.borrow_mut() = Some(cb);
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
                let locator = get_current_column_locator(
                    &presentation.get_open_column_settings(),
                    &r,
                    &s.get_view_config(),
                    &s.metadata(),
                );

                msgs.push(OpenColumnSettings {
                    locator,
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
    *session.on_table_errored.borrow_mut() = None;
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
