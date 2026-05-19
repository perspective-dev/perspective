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

//! Wire engine PubSub fanout to JavaScript `CustomEvent` dispatch on the host
//! element. [`wire_custom_events`] is the single subscription site; every
//! `perspective-*` `CustomEvent` originates from a PubSub fire on `Session`,
//! `Renderer`, or `Presentation`.

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

fn dispatch_column_settings_open_changed(
    elem: &HtmlElement,
    open: bool,
    column_name: Option<String>,
) {
    let event_init = web_sys::CustomEventInit::new();
    event_init.set_detail(&JsValue::from(
        json!({"open": open, "column_name": column_name}),
    ));
    let event = web_sys::CustomEvent::new_with_event_init_dict(
        "perspective-toggle-column-settings",
        &event_init,
    );

    elem.dispatch_event(&event.unwrap()).unwrap();
}

fn dispatch_plugin_changed(elem: &HtmlElement, plugin: &JsPerspectiveViewerPlugin) {
    let event_init = web_sys::CustomEventInit::new();
    event_init.set_detail(plugin);
    let event =
        web_sys::CustomEvent::new_with_event_init_dict("perspective-plugin-update", &event_init);

    elem.dispatch_event(&event.unwrap()).unwrap();
}

/// Per-element memoized config-change dispatcher. Reads/writes the dedup
/// cell on `presentation.last_dispatched_config` so each viewer instance
/// has its own cache — without this, a second viewer reloading the same
/// table the first viewer used would have its initial `config-update`
/// suppressed.
fn dispatch_config_update(
    elem: &HtmlElement,
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
) {
    clone!(session, renderer, presentation);
    let elem = elem.clone();
    perspective_js::utils::ApiFuture::spawn(async move {
        let viewer_config = get_viewer_config(&session, &renderer, &presentation).await?;
        if viewer_config.view_config != Default::default()
            && Some(&viewer_config) != presentation.last_dispatched_config.borrow().as_ref()
        {
            let json_config = JsValue::from_serde_ext(&viewer_config)?;
            let event_init = web_sys::CustomEventInit::new();
            event_init.set_detail(&json_config);
            let event = web_sys::CustomEvent::new_with_event_init_dict(
                "perspective-config-update",
                &event_init,
            );

            *presentation.last_dispatched_config.borrow_mut() = Some(viewer_config);
            elem.dispatch_event(&event.unwrap()).unwrap();
        }

        Ok(())
    });
}

/// Wire PubSub channels on `session`, `renderer`, and `presentation` to the
/// `perspective-*` `CustomEvent` set on `elem`. The returned
/// `Vec<Subscription>` must be kept alive for the lifetime of the element;
/// dropping it detaches all listeners.
pub fn wire_custom_events(
    elem: &HtmlElement,
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
) -> Vec<Subscription> {
    let theme_sub = presentation.theme_config_updated.add_listener({
        clone!(elem, session, renderer, presentation);
        move |_| dispatch_config_update(&elem, &session, &renderer, &presentation)
    });

    let settings_sub = presentation.settings_open_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |open: bool| {
            dispatch_event(&elem, "toggle-settings", open).unwrap();
            dispatch_config_update(&elem, &session, &renderer, &presentation);
        }
    });

    let before_settings_sub = presentation.settings_before_open_changed.add_listener({
        clone!(elem);
        move |open: bool| {
            dispatch_event(&elem, "toggle-settings-before", open).unwrap();
        }
    });

    let column_settings_sub = presentation.column_settings_open_changed.add_listener({
        clone!(elem);
        move |(open, column_name)| {
            dispatch_column_settings_open_changed(&elem, open, column_name);
            // column_settings is ethereal; do not change the config
        }
    });

    let plugin_sub = renderer.plugin_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |plugin| {
            dispatch_plugin_changed(&elem, &plugin);
            dispatch_config_update(&elem, &session, &renderer, &presentation);
        }
    });

    let view_sub = session.view_created.add_listener({
        clone!(elem, session, renderer, presentation);
        move |_| dispatch_config_update(&elem, &session, &renderer, &presentation)
    });

    let title_sub = session.title_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |_| dispatch_config_update(&elem, &session, &renderer, &presentation)
    });

    let unload_sub = session.table_unloaded.add_listener({
        clone!(elem);
        move |x: bool| {
            if !x {
                dispatch_event(&elem, "table-delete-before", JsValue::UNDEFINED).unwrap();
            } else {
                dispatch_event(&elem, "table-delete", JsValue::UNDEFINED).unwrap()
            }
        }
    });

    let select_sub = renderer.selection_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |window: Option<ViewWindow>| {
            let detail = JsValue::from_serde_ext(&window).unwrap();
            dispatch_event(&elem, "select", &detail).unwrap();
            dispatch_config_update(&elem, &session, &renderer, &presentation);
        }
    });

    let column_style_sub = renderer.column_style_changed.add_listener({
        clone!(elem, session, renderer, presentation);
        move |cfg: ColumnConfigMap| {
            let detail = JsValue::from_serde_ext(&cfg).unwrap();
            dispatch_event(&elem, "column-style-change", &detail).unwrap();
            dispatch_config_update(&elem, &session, &renderer, &presentation);
        }
    });

    let status_click_sub = session.status_indicator_clicked.add_listener({
        clone!(elem);
        move |_| dispatch_event(&elem, "status-indicator-click", JsValue::UNDEFINED).unwrap()
    });

    let statusbar_ptr_sub = presentation.statusbar_pointer_event.add_listener({
        clone!(elem);
        move |event: PointerEvent| {
            dispatch_event(&elem, &format!("statusbar-{}", event.type_()), &event).unwrap();
        }
    });

    vec![
        theme_sub,
        before_settings_sub,
        settings_sub,
        column_settings_sub,
        plugin_sub,
        view_sub,
        title_sub,
        unload_sub,
        select_sub,
        column_style_sub,
        status_click_sub,
        statusbar_ptr_sub,
    ]
}
