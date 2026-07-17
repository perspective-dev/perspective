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

use futures::future::join_all;
use perspective_js::utils::{ApiFuture, ApiResult};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::prelude::*;

use crate::components::viewer::{PerspectiveViewer, PerspectiveViewerMsg};
use crate::js::*;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::root::Root;
use crate::session::TableLoadState;
use crate::utils::*;
use crate::workspace::Workspace;

pub struct ResizeObserverHandle {
    elem: HtmlElement,
    observer: ResizeObserver,
    _callback: Closure<dyn FnMut(js_sys::Array)>,
}

impl ResizeObserverHandle {
    pub fn new(
        elem: &HtmlElement,
        workspace: &Workspace,
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
            workspace: workspace.clone(),
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
    workspace: Workspace,
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
                    let mut plans = Vec::new();
                    for id in state.workspace.panel_ids() {
                        let Some(panel) = state.workspace.panel(&id) else {
                            continue;
                        };

                        // Skip only a plugin that HAS DRAWN but is currently
                        // hidden (an unselected stacked tab → null
                        // `offset_parent`); it renders when revealed.
                        // `is_plugin_activated` is an explicit has-drawn flag,
                        // so an eagerly-MOUNTED but never-drawn plugin (its
                        // deferred first render was discarded by the
                        // `is_visible` gate) falls through to the
                        // `needs_render` branch below, which owes it a draw.
                        if panel.renderer.is_plugin_activated()?
                            && let Some(plugin) = panel.renderer.active_plugin()
                            && plugin
                                .unchecked_ref::<HtmlElement>()
                                .offset_parent()
                                .is_none()
                        {
                            continue;
                        }

                        let needs_render = !panel.renderer.is_plugin_activated()?
                            && matches!(panel.session.has_table(), Some(TableLoadState::Loaded));

                        plans.push((panel, needs_render));
                    }

                    let default_theme = if plans.iter().any(|(_, needs_render)| *needs_render) {
                        state.presentation.reset_attached();
                        // For first mounts below: "stamp before restyle" — the
                        // plugin captures its `--psp-*` CSS at first draw.
                        state.presentation.get_default_theme_name().await
                    } else {
                        None
                    };

                    join_all(plans.into_iter().map(|(panel, needs_render)| {
                        let default_theme = default_theme.clone();
                        async move {
                            // REQUIRED gate (perf, safe under I3): when a run
                            // already holds this renderer's lock — e.g. the
                            // `load()` that made `needs_render` true is still
                            // drawing — it will render this panel; a second
                            // full run here would be a duplicate
                            // `plugin.draw` per panel at creation time.
                            if needs_render && !panel.renderer.is_locked() {
                                // Seed the default-theme cache; the locked
                                // run's own draw stamps the effective theme
                                // from it ("stamp before draw", `draw_view`).
                                panel.renderer.set_default_theme(default_theme.clone());
                                super::just_render(&panel.session, &panel.renderer)?.await?;
                            } else if !needs_render {
                                panel.renderer.resize().await?;
                            }

                            ApiResult::<()>::Ok(())
                        }
                    }))
                    .await
                    .into_iter()
                    .collect::<ApiResult<Vec<_>>>()?;

                    on_resize.emit(());
                    Ok(())
                });
            }

            self.width = content_width;
            self.height = content_height;
        }
    }
}

/// A per-panel [`ResizeObserver`] bound to a single panel's slotted plugin
/// element, resizing only that panel's [`Renderer`] when its box changes.
pub struct PanelResizeObserverHandle {
    elem: HtmlElement,
    observer: ResizeObserver,
    _callback: Closure<dyn FnMut(js_sys::Array)>,
}

impl PanelResizeObserverHandle {
    pub fn new(elem: &HtmlElement, renderer: &Renderer) -> Self {
        let mut state = PanelResizeObserverState {
            elem: elem.clone(),
            renderer: renderer.clone(),
            width: elem.offset_width(),
            height: elem.offset_height(),
        };

        let _callback = Closure::new(move |xs: js_sys::Array| state.on_resize(&xs));
        let observer = ResizeObserver::new(_callback.as_ref().unchecked_ref::<js_sys::Function>());
        observer.observe(elem);
        Self {
            elem: elem.clone(),
            observer,
            _callback,
        }
    }
}

impl Drop for PanelResizeObserverHandle {
    fn drop(&mut self) {
        self.observer.unobserve(&self.elem);
    }
}

#[derive(Clone)]
struct PanelResizeObserverState {
    elem: HtmlElement,
    renderer: Renderer,
    width: i32,
    height: i32,
}

impl PanelResizeObserverState {
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
                let renderer = self.renderer.clone();
                ApiFuture::spawn_throttled(async move {
                    if renderer.is_plugin_activated()? {
                        renderer.resize().await?;
                    }

                    Ok(())
                });
            }

            self.width = content_width;
            self.height = content_height;
        }
    }
}
