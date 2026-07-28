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

use std::cell::Cell;
use std::rc::Rc;

use perspective_js::utils::global;
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

/// The `auto-pause` driver: pauses every panel's [`Session`] (deleting its
/// `ViewSubscription`, which stops `table_updated` at the source) whenever
/// the host element cannot be seen, and resumes with a re-render when it
/// can again. "Cannot be seen" is the conjunction of TWO independent
/// signals, either of which alone would miss real cases:
///
///   - An `IntersectionObserver` on the host element (scrolled out of the
///     viewport, `display: none`, disconnected). This CANNOT observe
///     browser-tab backgrounding — intersection entries are only generated
///     during the document's rendering steps, which are suspended while hidden,
///     and the element's viewport intersection doesn't change on a tab switch
///     anyway.
///   - A `document` `visibilitychange` listener (tab backgrounded, window
///     minimized/occluded). Without it, a fast-updating table kept dispatching
///     update-redraws whose draws hang on the suspended rAF — the
///     background-tab reactivation stall.
pub struct AutoPauseHandle {
    elem: HtmlElement,
    observer: IntersectionObserver,
    _callback: Closure<dyn FnMut(js_sys::Array)>,
    _visibility: Closure<dyn Fn(JsValue)>,
}

impl AutoPauseHandle {
    pub fn new(elem: &HtmlElement, presentation: &Presentation, workspace: &Workspace) -> Self {
        let state = Rc::new(AutoPauseState {
            intersecting: Cell::new(true),
            doc_visible: Cell::new(!global::document().hidden()),
            presentation: presentation.clone(),
            workspace: workspace.clone(),
        });

        let _callback = Closure::new({
            clone!(state);
            move |xs: js_sys::Array| {
                let intersect = xs
                    .pop()
                    .unchecked_into::<IntersectionObserverEntry>()
                    .is_intersecting();

                state.intersecting.set(intersect);
                state.apply();
            }
        });

        let func = _callback.as_ref().unchecked_ref::<js_sys::Function>();
        let observer = IntersectionObserver::new(func);
        observer.observe(elem);

        let _visibility = Closure::new({
            clone!(state);
            move |_: JsValue| {
                state.doc_visible.set(!global::document().hidden());
                state.apply();
            }
        });

        global::document()
            .add_event_listener_with_callback(
                "visibilitychange",
                _visibility.as_ref().unchecked_ref(),
            )
            .unwrap();

        Self {
            elem: elem.clone(),
            observer,
            _callback,
            _visibility,
        }
    }
}

impl Drop for AutoPauseHandle {
    fn drop(&mut self) {
        self.observer.unobserve(&self.elem);
        let _ = global::document().remove_event_listener_with_callback(
            "visibilitychange",
            self._visibility.as_ref().unchecked_ref(),
        );
    }
}

struct AutoPauseState {
    intersecting: Cell<bool>,
    doc_visible: Cell<bool>,
    presentation: Presentation,
    workspace: Workspace,
}

impl AutoPauseState {
    fn apply(self: &Rc<Self>) {
        let visible = self.intersecting.get() && self.doc_visible.get();
        clone!(self.workspace, self.presentation);
        ApiFuture::spawn(async move {
            let panels = workspace.panels();
            futures::future::join_all(panels.iter().map(|panel| {
                let presentation = presentation.clone();
                async move {
                    set_panel_paused(&panel.session, &panel.renderer, &presentation, visible).await
                }
            }))
            .await
            .into_iter()
            .collect::<ApiResult<Vec<_>>>()?;

            Ok(())
        });
    }
}

/// Apply one panel's pause/resume transition. Shared by the
/// [`AutoPauseState`] fan-out and `setAutoPause(false)`'s force-resume.
pub(crate) async fn set_panel_paused(
    session: &Session,
    renderer: &Renderer,
    presentation: &Presentation,
    visible: bool,
) -> ApiResult<()> {
    if visible {
        if session.set_pause(false) {
            let result = super::restore_and_render(
                session,
                renderer,
                presentation,
                super::RunOrigin::Internal,
                ViewerConfigUpdate::default(),
                async move { Ok(()) },
            )
            .await;

            if let Err(e) = result.ignore_view_delete() {
                session.set_run_error(e.clone()).await?;
                return Err(e);
            }
        }
    } else {
        session.set_pause(true);
    };

    Ok(())
}
