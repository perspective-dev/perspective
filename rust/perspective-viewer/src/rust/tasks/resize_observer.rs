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
use perspective_client::clone;
use perspective_js::utils::{ApiFuture, ApiResult};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::*;

use super::update_theme::seed_default_themes;
use crate::components::viewer::{PerspectiveViewer, PerspectiveViewerMsg};
use crate::js::{ResizeObserver, ResizeObserverEntry};
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::root::Root;
use crate::session::TableLoadState;
use crate::workspace::Workspace;

struct SizeObserver {
    elem: HtmlElement,
    observer: ResizeObserver,
    _callback: Closure<dyn FnMut(js_sys::Array)>,
}

impl SizeObserver {
    fn new(elem: &HtmlElement, mut on_change: impl FnMut() + 'static) -> Self {
        let mut width = elem.offset_width();
        let mut height = elem.offset_height();
        let target = elem.clone();
        let _callback = Closure::new(move |entries: js_sys::Array| {
            let is_visible = target
                .offset_parent()
                .map(|x| !x.is_null())
                .unwrap_or(false);
            for y in entries.iter() {
                let entry: ResizeObserverEntry = y.unchecked_into();
                let content = entry.content_rect();
                let content_width = content.width().floor() as i32;
                let content_height = content.height().floor() as i32;
                let resized = width != content_width || height != content_height;
                if resized && is_visible {
                    on_change();
                }

                width = content_width;
                height = content_height;
            }
        });

        let observer = ResizeObserver::new(_callback.as_ref().unchecked_ref::<js_sys::Function>());
        observer.observe(elem);
        Self {
            elem: elem.clone(),
            observer,
            _callback,
        }
    }
}

impl Drop for SizeObserver {
    fn drop(&mut self) {
        self.observer.unobserve(&self.elem);
    }
}

/// The host element's `ResizeObserver`: fans a host box change out to every
/// panel — a resize for drawn panels, a deferred first render for loaded
/// panels whose first draw was discarded while invisible.
pub struct ResizeObserverHandle(#[allow(dead_code)] SizeObserver);

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

        clone!(workspace, presentation);
        Self(SizeObserver::new(elem, move || {
            clone!(workspace, presentation, on_resize);
            ApiFuture::spawn_throttled(async move {
                let mut plans = Vec::new();
                for panel in workspace.panels() {
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

                // For first mounts below: "stamp before restyle" — the
                // plugin captures its `--psp-*` CSS at first draw.
                if plans.iter().any(|(_, needs_render)| *needs_render) {
                    presentation.reset_attached();
                    seed_default_themes(&presentation, &workspace).await;
                }

                join_all(plans.into_iter().map(|(panel, needs_render)| async move {
                    // A concurrent run (e.g. the `load()` that made
                    // `needs_render` true) is harmless: this run queues
                    // behind it, reconciles `Unchanged` with no state delta
                    // and dispatches nothing — never a duplicate draw.
                    if needs_render {
                        super::just_render(&panel.session, &panel.renderer)?.await?;
                    } else {
                        panel.renderer.resize().await?;
                    }

                    ApiResult::<()>::Ok(())
                }))
                .await
                .into_iter()
                .collect::<ApiResult<Vec<_>>>()?;

                on_resize.emit(());
                Ok(())
            });
        }))
    }
}

/// A per-panel [`ResizeObserver`] bound to a single panel's slotted plugin
/// element, resizing only that panel's [`Renderer`] when its box changes.
pub struct PanelResizeObserverHandle(#[allow(dead_code)] SizeObserver);

impl PanelResizeObserverHandle {
    pub fn new(elem: &HtmlElement, renderer: &Renderer) -> Self {
        clone!(renderer);
        Self(SizeObserver::new(elem, move || {
            clone!(renderer);
            ApiFuture::spawn_throttled(async move {
                if renderer.is_plugin_activated()? {
                    renderer.resize().await?;
                }

                Ok(())
            });
        }))
    }
}
