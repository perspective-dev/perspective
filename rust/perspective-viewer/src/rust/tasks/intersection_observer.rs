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
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::Session;
use crate::utils::*;
use crate::workspace::Workspace;
use crate::*;

pub struct IntersectionObserverHandle {
    elem: HtmlElement,
    observer: IntersectionObserver,
    _callback: Closure<dyn FnMut(js_sys::Array)>,
}

impl IntersectionObserverHandle {
    pub fn new(elem: &HtmlElement, presentation: &Presentation, workspace: &Workspace) -> Self {
        clone!(workspace, presentation);
        let _callback = Closure::new(move |xs: js_sys::Array| {
            // https://stackoverflow.com/questions/53862160/intersectionobserver-multiple-entries
            let intersect = xs
                .pop()
                .unchecked_into::<IntersectionObserverEntry>()
                .is_intersecting();

            // All panels share the host's visibility, so this single host
            // observer fans the pause/resume out to every panel's `Session`
            // (each its own) — not just the seed.
            clone!(workspace, presentation);
            ApiFuture::spawn(async move {
                for id in workspace.panel_ids() {
                    if let Some(panel) = workspace.panel(&id) {
                        let state = IntersectionObserverState {
                            presentation: presentation.clone(),
                            session: panel.session,
                            renderer: panel.renderer,
                        };

                        state.set_pause(intersect).await?;
                    }
                }

                Ok(())
            });
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

impl IntersectionObserverState {
    async fn set_pause(self, intersect: bool) -> ApiResult<()> {
        if intersect {
            if self.session.set_pause(false) {
                let result = super::restore_and_render(
                    &self.session,
                    &self.renderer,
                    &self.presentation,
                    // Host-initiated resume: a paused-era commit renders
                    // (rebuild / first-paint promotion); a clean resume
                    // dispatches nothing.
                    super::RunOrigin::Internal,
                    ViewerConfigUpdate::default(),
                    async move { Ok(()) },
                )
                .await;

                // An unpause resume can carry a panel's deferred FIRST
                // paint (`draw_view` propagates first-draw failures), and
                // nothing user-awaited observes this task — surface it as
                // a panel error or it vanishes entirely.
                if let Err(e) = &result {
                    self.session.set_error(false, e.clone()).await?;
                }

                result?;
            }
        } else {
            self.session.set_pause(true);
        };

        Ok(())
    }
}
