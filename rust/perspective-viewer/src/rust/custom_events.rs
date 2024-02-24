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

use std::cell::RefCell;
use std::ops::Deref;
use std::rc::Rc;

use perspective::json;
use perspective_client::clone;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;

use crate::config::*;
use crate::js::JsPerspectiveViewerPlugin;
use crate::model::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::Session;
use crate::utils::*;
use crate::*;

/// A collection of `Subscription` which should trigger an event on the
/// JavaScript Custom Element as a `CustomEvent`.  There are no public methods
/// on `CustomElements`, but when it is `drop()` the Custom Element will no
/// longer dispatch events such as `"perspective-config-change"`.
#[derive(Clone)]
pub struct CustomEvents(Rc<(CustomEventsDataRc, [Subscription; 5])>);

impl ImplicitClone for CustomEvents {}
impl PartialEq for CustomEvents {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}

#[derive(Clone)]
struct CustomEventsDataRc(Rc<CustomEventsData>);

impl Deref for CustomEventsDataRc {
    type Target = CustomEventsData;

    fn deref(&self) -> &CustomEventsData {
        &self.0
    }
}

struct CustomEventsData {
    elem: HtmlElement,
    session: Session,
    renderer: Renderer,
    presentation: Presentation,
    last_dispatched: RefCell<Option<ViewerConfig>>,
}

derive_model!(Renderer, Session, Presentation for CustomEventsData);

impl CustomEvents {
    pub fn new(
        elem: &HtmlElement,
        session: &Session,
        renderer: &Renderer,
        presentation: &Presentation,
    ) -> Self {
        let data = CustomEventsDataRc(Rc::new(CustomEventsData {
            elem: elem.clone(),
            session: session.clone(),
            renderer: renderer.clone(),
            presentation: presentation.clone(),
            last_dispatched: Default::default(),
        }));

        let theme_sub = presentation.theme_config_updated.add_listener({
            clone!(data);
            move |_| data.clone().dispatch_config_update()
        });

        let settings_sub = presentation.settings_open_changed.add_listener({
            clone!(data);
            move |open| {
                data.dispatch_settings_open_changed(open);
                data.clone().dispatch_config_update();
            }
        });

        let column_settings_sub = presentation.column_settings_open_changed.add_listener({
            clone!(data);
            move |(open, column_name)| {
                data.dispatch_column_settings_open_changed(open, column_name);
                // column_settings is ethereal; do not change the config
            }
        });

        let plugin_sub = renderer.plugin_changed.add_listener({
            clone!(data);
            move |plugin| {
                data.dispatch_plugin_changed(&plugin);
                data.clone().dispatch_config_update();
            }
        });

        let view_sub = session.view_created.add_listener({
            clone!(data);
            move |_| {
                data.clone().dispatch_config_update();
            }
        });

        Self(Rc::new((data, [
            theme_sub,
            settings_sub,
            column_settings_sub,
            plugin_sub,
            view_sub,
        ])))
    }

    pub fn dispatch_column_style_changed(&self, config: &JsValue) {
        let mut event_init = web_sys::CustomEventInit::new();
        event_init.detail(config);
        let event = web_sys::CustomEvent::new_with_event_init_dict(
            "perspective-column-style-change",
            &event_init,
        );
        self.0 .0.elem.dispatch_event(&event.unwrap()).unwrap();
        self.0 .0.clone().dispatch_config_update();
    }
}

impl CustomEventsDataRc {
    fn dispatch_settings_open_changed(&self, open: bool) {
        let mut event_init = web_sys::CustomEventInit::new();
        event_init.detail(&JsValue::from(open));
        let event = web_sys::CustomEvent::new_with_event_init_dict(
            "perspective-toggle-settings",
            &event_init,
        );

        self.elem
            .toggle_attribute_with_force("settings", open)
            .unwrap();
        self.elem.dispatch_event(&event.unwrap()).unwrap();
    }

    fn dispatch_column_settings_open_changed(&self, open: bool, column_name: Option<String>) {
        let mut event_init = web_sys::CustomEventInit::new();
        event_init.detail(&JsValue::from(
            json!( {"open": open, "column_name": column_name} ),
        ));
        let event = web_sys::CustomEvent::new_with_event_init_dict(
            "perspective-toggle-column-settings",
            &event_init,
        );

        self.elem.dispatch_event(&event.unwrap()).unwrap();
    }

    fn dispatch_plugin_changed(&self, plugin: &JsPerspectiveViewerPlugin) {
        let mut event_init = web_sys::CustomEventInit::new();
        event_init.detail(plugin);
        let event = web_sys::CustomEvent::new_with_event_init_dict(
            "perspective-plugin-update",
            &event_init,
        );

        self.elem.dispatch_event(&event.unwrap()).unwrap();
    }

    fn dispatch_config_update(self) {
        ApiFuture::spawn(async move {
            let viewer_config = self.get_viewer_config().await?;
            if viewer_config.view_config != Default::default()
                && Some(&viewer_config) != self.last_dispatched.borrow().as_ref()
            {
                let json_config = JsValue::from_serde_ext(&viewer_config)?;
                let mut event_init = web_sys::CustomEventInit::new();
                event_init.detail(&json_config);
                let event = web_sys::CustomEvent::new_with_event_init_dict(
                    "perspective-config-update",
                    &event_init,
                );

                *self.last_dispatched.borrow_mut() = Some(viewer_config);
                self.elem.dispatch_event(&event.unwrap()).unwrap();
            }

            Ok(())
        });
    }
}
