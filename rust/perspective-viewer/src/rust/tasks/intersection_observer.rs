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

use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;

use crate::config::ViewerConfigUpdate;
use crate::js::*;
use crate::tasks::*;
use crate::presentation::Presentation;
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
    pub fn new(
        elem: &HtmlElement,
        presentation: &Presentation,
        session: &Session,
        renderer: &Renderer,
    ) -> Self {
        clone!(session, renderer, presentation);
        let _callback = Closure::new(move |xs: js_sys::Array| {
            // https://stackoverflow.com/questions/53862160/intersectionobserver-multiple-entries
            let intersect = xs
                .pop()
                .unchecked_into::<IntersectionObserverEntry>()
                .is_intersecting();

            clone!(session, renderer, presentation);
            let state = IntersectionObserverState {
                presentation,
                session,
                renderer,
            };

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
    presentation: Presentation,
}

impl HasPresentation for IntersectionObserverState {
    fn presentation(&self) -> &Presentation {
        &self.presentation
    }
}

impl HasRenderer for IntersectionObserverState {
    fn renderer(&self) -> &Renderer {
        &self.renderer
    }
}

impl HasSession for IntersectionObserverState {
    fn session(&self) -> &Session {
        &self.session
    }
}

impl IntersectionObserverState {
    async fn set_pause(self, intersect: bool) -> ApiResult<()> {
        if intersect {
            if self.session.set_pause(false) {
                self.restore_and_render(ViewerConfigUpdate::default(), async move { Ok(()) })
                    .await?;
            }
        } else {
            self.session.set_pause(true);
        };

        Ok(())
    }
}
