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

use perspective_js::utils::ApiFuture;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::prelude::*;

use crate::components::viewer::{PerspectiveViewer, PerspectiveViewerMsg};
use crate::js::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::root::Root;
use crate::session::{Session, TableLoadState};
use crate::utils::*;

pub struct ResizeObserverHandle {
    elem: HtmlElement,
    observer: ResizeObserver,
    _callback: Closure<dyn FnMut(js_sys::Array)>,
}

impl ResizeObserverHandle {
    pub fn new(
        elem: &HtmlElement,
        renderer: &Renderer,
        session: &Session,
        presentation: &Presentation,
        root: &Root<PerspectiveViewer>,
    ) -> Self {
        let on_resize = root
            .borrow()
            .as_ref()
            .unwrap()
            .callback(|()| PerspectiveViewerMsg::Resize);

        let mut state = ResizeObserverState {
            elem: elem.clone(),
            renderer: renderer.clone(),
            session: session.clone(),
            presentation: presentation.clone(),
            width: elem.offset_width(),
            height: elem.offset_height(),
            on_resize,
        };

        let _callback = Closure::new(move |xs: js_sys::Array| state.on_resize(&xs));
        let observer = ResizeObserver::new(_callback.as_ref().unchecked_ref::<js_sys::Function>());
        observer.observe(elem);
        Self {
            elem: elem.clone(),
            _callback,
            observer,
        }
    }
}

impl Drop for ResizeObserverHandle {
    fn drop(&mut self) {
        self.observer.unobserve(&self.elem);
    }
}

#[derive(Clone)]
struct ResizeObserverState {
    elem: HtmlElement,
    renderer: Renderer,
    session: Session,
    presentation: Presentation,
    width: i32,
    height: i32,
    on_resize: Callback<()>,
}

impl ResizeObserverState {
    fn on_resize(&mut self, entries: &js_sys::Array) {
        let is_visible = self
            .elem
            .offset_parent()
            .map(|x| !x.is_null())
            .unwrap_or(false);

        for y in entries.iter() {
            let entry: ResizeObserverEntry = y.unchecked_into();
            let content = entry.content_rect();
            let content_width = content.width().floor() as i32;
            let content_height = content.height().floor() as i32;
            let resized = self.width != content_width || self.height != content_height;
            if resized && is_visible {
                let state = self.clone();
                clone!(self.on_resize);
                ApiFuture::spawn_throttled(async move {
                    let needs_render = state
                        .renderer
                        .clone()
                        .with_lock(async {
                            Ok(!state.renderer.is_plugin_activated()?
                                && matches!(
                                    state.session.has_table(),
                                    Some(TableLoadState::Loaded)
                                ))
                        })
                        .await?;

                    if needs_render {
                        state.presentation.reset_attached();
                        super::update_and_render(
                            &state.session,
                            &state.renderer,
                            Default::default(),
                        )?
                        .await?;
                    } else {
                        state.renderer.resize().await?;
                    }

                    on_resize.emit(());
                    Ok(())
                });
            }

            self.width = content_width;
            self.height = content_height;
        }
    }
}
