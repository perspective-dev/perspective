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

use perspective_client::config::ViewConfigUpdate;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::*;

use crate::js::*;
use crate::model::*;
use crate::renderer::*;
use crate::session::Session;
use crate::utils::*;
use crate::*;

pub struct IntersectionObserverHandle {
    elem: HtmlElement,
    observer: IntersectionObserver,
    _callback: Closure<dyn FnMut(js_sys::Array)>,
}

impl IntersectionObserverHandle {
    pub fn new(elem: &HtmlElement, session: &Session, renderer: &Renderer) -> Self {
        clone!(session, renderer);
        let _callback = Closure::new(move |xs: js_sys::Array| {
            let intersect = xs
                .get(0)
                .unchecked_into::<IntersectionObserverEntry>()
                .is_intersecting();

            clone!(session, renderer);
            let state = IntersectionObserverState { session, renderer };
            ApiFuture::spawn(state.set_pause(intersect));
        });

        let func = _callback.as_ref().unchecked_ref::<js_sys::Function>();
        let observer = IntersectionObserver::new(func);
        observer.observe(elem);
        Self {
            elem: elem.clone(),
            _callback,
            observer,
        }
    }
}

impl Drop for IntersectionObserverHandle {
    fn drop(&mut self) {
        self.observer.unobserve(&self.elem);
    }
}

struct IntersectionObserverState {
    session: Session,
    renderer: Renderer,
}

impl IntersectionObserverState {
    async fn set_pause(self, intersect: bool) -> ApiResult<()> {
        if intersect {
            if self.session.set_pause(false) {
                self.update_and_render(ViewConfigUpdate::default()).await?;
            }
        } else {
            self.session.set_pause(true);
        };

        Ok(())
    }
}

derive_model!(Renderer, Session for IntersectionObserverState);
