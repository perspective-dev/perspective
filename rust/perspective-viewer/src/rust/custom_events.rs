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

//! Wire engine PubSub fanout to JavaScript `CustomEvent` dispatch. Split into
//! [`wire_element_events`] (element-level, `Presentation`-driven, wired once)
//! and [`wire_panel_events`] (one panel's `Session`/`Renderer`, wired per
//! panel and owned by the `Panel`). Every `perspective-*` `CustomEvent`
//! originates from a PubSub fire; per-panel events dispatch on the originating
//! panel's plugin so `event.target` identifies the panel.

use perspective_client::{ViewWindow, clone};
use perspective_js::json;
use perspective_js::utils::{ApiResult, JsValueSerdeExt};
use wasm_bindgen::prelude::*;
use web_sys::*;

use crate::js::JsPerspectiveViewerPlugin;
use crate::presentation::Presentation;
use crate::queries::get_viewer_config;
use crate::renderer::{ColumnConfigMap, Renderer};
use crate::session::Session;
use crate::utils::{AddListener, Subscription};
use crate::workspace::Workspace;

/// Dispatch a JS `CustomEvent` named `perspective-{name}` on `elem`.
fn dispatch_event<T: Into<JsValue>>(elem: &HtmlElement, name: &str, event: T) -> ApiResult<()> {
    let event_init = web_sys::CustomEventInit::new();
    event_init.set_detail(&event.into());
    let event = web_sys::CustomEvent::new_with_event_init_dict(
        format!("perspective-{}", name).as_str(),
        &event_init,
    )?;

    elem.dispatch_event(&event)?;
    Ok(())
}

/// The event target for a panel's events: the panel's own plugin element (so
/// `event.target`/`composedPath()` carries its `slot=<panel-id>`, identifying
/// the originating panel), falling back to the host when no plugin is drawn.
/// Events dispatched here bubble to the host, so element-level listeners still
/// fire.
fn panel_target(elem: &HtmlElement, renderer: &Renderer) -> EventTarget {
    renderer
        .active_plugin()
        .filter(|plugin| elem.contains(Some(plugin.unchecked_ref::<web_sys::Node>())))
        .map(|plugin| plugin.unchecked_into::<EventTarget>())
        .unwrap_or_else(|| elem.clone().unchecked_into())
}

/// Dispatch a `perspective-{name}` `CustomEvent` for a single panel — on the
/// panel's plugin (see [`panel_target`]), bubbling + composed so it reaches the
/// host. The originating panel is identifiable from `event.target`; `detail`
/// shapes are otherwise unchanged from the single-panel case.
fn dispatch_panel_event(
    elem: &HtmlElement,
    renderer: &Renderer,
    name: &str,
    detail: &JsValue,
) -> ApiResult<()> {
    let event_init = web_sys::CustomEventInit::new();
    event_init.set_detail(detail);
    event_init.set_bubbles(true);
    event_init.set_composed(true);
    let event = web_sys::CustomEvent::new_with_event_init_dict(
        format!("perspective-{}", name).as_str(),
        &event_init,
    )?;

    panel_target(elem, renderer).dispatch_event(&event)?;
    Ok(())
}

/// Annotate an object `detail` with its originating panel id (`detail.panel`),
/// for the events whose detail is a plain JSON object (`select`,
/// `column-style-change`). Additive — existing single-panel listeners reading
/// the prior fields are unaffected; skipped when `detail` isn't an object (e.g.
/// a null selection) or the panel has no slot.
fn annotate_panel(detail: &JsValue, renderer: &Renderer) {
    if detail.is_object()
        && let Some(id) = renderer.slot_name()
    {
        let _ = js_sys::Reflect::set(detail, &JsValue::from_str("panel"), &JsValue::from_str(&id));
    }
}

fn dispatch_column_settings_open_changed(
    workspace: &Workspace,
    elem: &HtmlElement,
    open: bool,
    column_name: Option<String>,
) {
    let event_init = web_sys::CustomEventInit::new();
    event_init.set_detail(&JsValue::from(
        json!({"open": open, "column_name": column_name}),
    ));
    // Bubble so the event still reaches the host (and any public listeners) even
    // though it's dispatched on a panel's plugin below it.
    event_init.set_bubbles(true);
    let event = web_sys::CustomEvent::new_with_event_init_dict(
        "perspective-toggle-column-settings",
        &event_init,
    )
    .unwrap();

    // Dispatch on the ACTIVE panel's plugin, not the shared host. The merged
    // viewer hosts every panel's plugin under one element, and each datagrid
    // listens for this event on itself — so dispatching on the host (which the
    // event bubbles to) would highlight EVERY datagrid. The column settings
    // apply to the active panel, so scope the highlight to its plugin; fall back
    // to the host if none is drawn.
    let target: web_sys::EventTarget = workspace
        .panel(&workspace.active_id())
        .and_then(|panel| panel.renderer.active_plugin())
        .map(|plugin| plugin.unchecked_into())
        .unwrap_or_else(|| elem.clone().unchecked_into());

    target.dispatch_event(&event).unwrap();
}

fn dispatch_plugin_changed(
    elem: &HtmlElement,
    renderer: &Renderer,
    plugin: &JsPerspectiveViewerPlugin,
) {
    // Detail is the plugin element itself (identity is via `event.target`, the
    // panel's plugin — see `panel_target`).
    let _ = dispatch_panel_event(elem, renderer, "plugin-update", plugin.as_ref());
}

/// Per-panel memoized config-change dispatcher. The dedup cell now lives on the
/// `Session` (per panel) rather than the `Presentation` (per element), so N
/// panels don't cross-suppress each other's `config-update`s. The event is
/// dispatched on the panel's plugin (bubbling to the host), so `event.target`
/// identifies the panel; `detail` remains the bare [`ViewerConfig`] — NOT
/// wrapped — so `viewer.restore(e.detail)` round-trips unchanged.
fn dispatch_config_update(
    elem: &HtmlElement,
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
) {
    clone!(session, renderer, presentation);
    let elem = elem.clone();
    let tracker = session.clone();
    tracker.track_dispatch(async move {
        let viewer_config = get_viewer_config(&session, &renderer, &presentation).await?;
        if viewer_config.view_config != Default::default()
            && Some(&viewer_config) != session.last_dispatched_config.borrow().as_ref()
        {
            let json_config = JsValue::from_serde_ext(&viewer_config)?;
            let event_init = web_sys::CustomEventInit::new();
            event_init.set_detail(&json_config);
            event_init.set_bubbles(true);
            event_init.set_composed(true);
            let event = web_sys::CustomEvent::new_with_event_init_dict(
                "perspective-config-update",
                &event_init,
            )?;

            *session.last_dispatched_config.borrow_mut() = Some(viewer_config);
            panel_target(&elem, &renderer).dispatch_event(&event)?;
        }

        Ok(())
    });
}

/// Wire the ELEMENT-level PubSub channels (`Presentation`-driven, not tied to
/// any one panel) to the `perspective-*` `CustomEvent` set on `elem`. Wired
/// ONCE for the element's lifetime. The config-update-bearing events
/// (theme/settings) emit for the **active** panel, resolved from `workspace`
/// at fire time. The returned `Vec<Subscription>` must outlive the element.
pub fn wire_element_events(
    elem: &HtmlElement,
    presentation: &Presentation,
    workspace: &Workspace,
) -> Vec<Subscription> {
    let theme_sub = presentation.theme_config_updated.add_listener({
        clone!(elem, presentation, workspace);
        move |_| {
            let panel = workspace.active_panel();
            dispatch_config_update(&elem, &panel.session, &panel.renderer, &presentation);
        }
    });

    let settings_sub = presentation.settings_open_changed.add_listener({
        clone!(elem, presentation, workspace);
        move |open: bool| {
            dispatch_event(&elem, "toggle-settings", open).unwrap();
            let panel = workspace.active_panel();
            dispatch_config_update(&elem, &panel.session, &panel.renderer, &presentation);
        }
    });

    let before_settings_sub = presentation.settings_before_open_changed.add_listener({
        clone!(elem);
        move |open: bool| {
            dispatch_event(&elem, "toggle-settings-before", open).unwrap();
        }
    });

    let column_settings_sub = presentation.column_settings_open_changed.add_listener({
        clone!(elem, workspace);
        move |(open, column_name)| {
            dispatch_column_settings_open_changed(&workspace, &elem, open, column_name);
            // column_settings is ethereal; do not change the config
        }
    });

    let statusbar_ptr_sub = presentation.statusbar_pointer_event.add_listener({
        clone!(elem);
        move |event: PointerEvent| {
            dispatch_event(&elem, &format!("statusbar-{}", event.type_()), &event).unwrap();
        }
    });

    // The element-level global (cross-) filter set changed — masters'
    // selections, chip × / "Clear", role toggles, restore. `detail` is the
    // flattened `Vec<Filter>`; deliberately NOT `perspective-config-update`
    // (these filters are invisible to every panel's config by design).
    let global_filters_sub = workspace.filters_changed().add_listener({
        clone!(elem, workspace);
        move |_: ()| {
            let filters =
                JsValue::from_serde_ext(&workspace.global_filters()).expect("serializable filters");
            dispatch_event(&elem, "global-filter-update", filters).unwrap();
        }
    });

    vec![
        theme_sub,
        before_settings_sub,
        settings_sub,
        column_settings_sub,
        statusbar_ptr_sub,
        global_filters_sub,
    ]
}

/// Wire ONE panel's `session`/`renderer` PubSub channels to the
/// `perspective-*` `CustomEvent` set, dispatched on that panel's plugin (so
/// `event.target` identifies the panel — see [`dispatch_panel_event`]). Called
/// per panel at creation; the returned subscriptions are owned by the `Panel`
/// and drop when it is removed, so every panel (seed, `addPanel`, restored)
/// fires its own events and non-active panels are no longer silent.
///
/// Needs no `Workspace`: each handler acts on its own `session`/`renderer`, and
/// the panel id for annotation is read from `renderer.slot_name()` at fire
/// time.
pub fn wire_panel_events(
    elem: &HtmlElement,
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
) -> Vec<Subscription> {
    let plugin_sub = renderer.plugin_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |plugin| {
            dispatch_plugin_changed(&elem, &renderer, &plugin);
            dispatch_config_update(&elem, &session, &renderer, &presentation);
        }
    });

    // `commit_reconciled` (NOT `view_created`): the config-update event must
    // fire for every reconciled commit — including SKIP/REUSE/paused binds
    // that construct no `View` — or `flush()` has nothing to join (the
    // paused-`load()` case). The dispatcher dedups, so REBUILD's pairing
    // with `view_created` can't double-fire it.
    let view_sub = session.commit_reconciled.add_listener({
        clone!(elem, session, renderer, presentation);
        move |_| dispatch_config_update(&elem, &session, &renderer, &presentation)
    });

    let title_sub = session.title_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |_| dispatch_config_update(&elem, &session, &renderer, &presentation)
    });

    let unload_sub = session.table_unloaded.add_listener({
        clone!(elem, renderer);
        move |x: bool| {
            let name = if !x {
                "table-delete-before"
            } else {
                "table-delete"
            };
            let _ = dispatch_panel_event(&elem, &renderer, name, &JsValue::UNDEFINED);
        }
    });

    let select_sub = renderer.selection_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |window: Option<ViewWindow>| {
            let detail = JsValue::from_serde_ext(&window).unwrap();
            annotate_panel(&detail, &renderer);
            let _ = dispatch_panel_event(&elem, &renderer, "select", &detail);
            dispatch_config_update(&elem, &session, &renderer, &presentation);
        }
    });

    let column_style_sub = renderer.column_style_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |cfg: ColumnConfigMap| {
            let detail = JsValue::from_serde_ext(&cfg).unwrap();
            annotate_panel(&detail, &renderer);
            let _ = dispatch_panel_event(&elem, &renderer, "column-style-change", &detail);
            dispatch_config_update(&elem, &session, &renderer, &presentation);
        }
    });

    let status_click_sub = session.status_indicator_clicked.add_listener({
        clone!(elem, renderer);
        move |_| {
            let _ = dispatch_panel_event(
                &elem,
                &renderer,
                "status-indicator-click",
                &JsValue::UNDEFINED,
            );
        }
    });

    vec![
        plugin_sub,
        view_sub,
        title_sub,
        unload_sub,
        select_sub,
        column_style_sub,
        status_click_sub,
    ]
}
