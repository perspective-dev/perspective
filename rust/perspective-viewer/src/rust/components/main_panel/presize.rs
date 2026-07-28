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

//! The `MainPanelMsg::BeforeResize` handler: pre-size every panel's plugin to
//! its *target* cell box before the `<regular-layout>` commit, so content is
//! ready ahead of the geometry change (no post-commit shear/clip).

use std::collections::HashMap;

use futures::future::join_all;
use perspective_client::utils::PerspectiveResultExt;
use perspective_js::utils::JsValueSerdeExt;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::MainPanel;
use crate::ApiFuture;
use crate::js::{PresizeDetail, RegularLayout};
use crate::renderer::Renderer;
use crate::tasks::PanelResizeObserverHandle;
use crate::workspace::PanelId;

fn set_tab_presize(tab: &web_sys::HtmlElement, dx: f64, dy: f64) {
    if dx.abs() > crate::renderer::SUBPIXEL_EPSILON || dy.abs() > crate::renderer::SUBPIXEL_EPSILON
    {
        let _ = tab
            .style()
            .set_property("transform", &format!("translate({dx}px, {dy}px)"));
    }
}

/// Remove the inline presize translate applied by [`set_tab_presize`] (a no-op
/// when none was set). Cleared in the SAME synchronous run as the plugin clear
/// and `resumeResize`, so the tab and its plugin land at the committed grid
/// position together with no intermediate paint.
fn clear_tab_presize(tab: &web_sys::HtmlElement) {
    let _ = tab.style().remove_property("transform");
}

#[derive(serde::Deserialize)]
struct PresizePath {
    #[serde(with = "serde_wasm_bindgen::preserve")]
    view_window: JsValue,
}

/// The current screen origin of a frame's grid TRACK (its margin box — the
/// coordinate space `real_coordinates` reports), measured live from the frame.
/// `target_track − current_track` is the presize translate delta: the plugin's
/// offset *within* its track is constant across a layout transition, so the
/// track delta is exactly the plugin delta (see `Renderer::presize_with_box`).
fn frame_track_origin(frame: &web_sys::Element) -> Option<(f64, f64)> {
    let style = web_sys::window()?.get_computed_style(frame).ok()??;
    let px = |prop: &str| {
        style
            .get_property_value(prop)
            .ok()
            .and_then(|v| v.trim().trim_end_matches("px").parse::<f64>().ok())
            .unwrap_or(0.0)
    };
    let rect = frame.get_bounding_client_rect();
    Some((
        rect.left() - px("margin-left"),
        rect.top() - px("margin-top"),
    ))
}

impl MainPanel {
    pub(super) fn on_before_resize(&mut self, ctx: &Context<Self>, event: web_sys::Event) -> bool {
        let Some(el) = self.layout_ref.cast::<web_sys::HtmlElement>() else {
            return false;
        };

        let layout: RegularLayout = el.unchecked_into();
        let detail = event
            .unchecked_ref::<web_sys::CustomEvent>()
            .detail()
            .unchecked_into::<PresizeDetail>();

        let paths: HashMap<String, PresizePath> = detail
            .calculate_presize_paths()
            .into_serde_ext()
            .unwrap_or_default();

        // Bind a drag ResizeObserver on the panel being dragged: it's
        // the one present in the layout but EXCLUDED from the presize
        // paths. A STAGED panel is absent from the layout for a different
        // reason than the dragged panel — never bind the per-drag observer
        // to its staging wrapper.
        for id in &ctx.props().panel_ids {
            let name = id.as_str();
            if !paths.contains_key(name)
                && !self.panel_resize_observers.contains_key(name)
                && !ctx.props().workspace.is_staged(id)
                && let Some(panel) = ctx.props().workspace.panel(id)
                && let Some(plugin) = panel.renderer.active_plugin()
            {
                let plugin_el = plugin.unchecked_ref::<web_sys::HtmlElement>();
                self.panel_resize_observers.insert(
                    name.to_owned(),
                    PanelResizeObserverHandle::new(plugin_el, &panel.renderer),
                );
            }
        }

        let workspace = ctx.props().workspace.clone();
        let viewer = ctx.props().presentation.viewer_elem().clone();
        let effect = workspace.effects().guard();
        ApiFuture::spawn(async move {
            let _effect = effect;
            let mut targets: Vec<(Renderer, f64, f64, f64, f64)> = Vec::new();
            let mut tab_targets: Vec<(web_sys::HtmlElement, f64, f64)> = Vec::new();
            let mut last_chrome: Option<(f64, f64)> = None;
            for (name, path) in &paths {
                let cell: web_sys::DomRect =
                    layout.real_coordinates(&path.view_window).unchecked_into();

                // Only presize panels with a drawn plugin. Critically,
                // `insertPanel`/`removePanel` *also* fire `before-resize`
                // (they `restore()` through the presize queue), and a
                // just-inserted panel has no plugin yet — presizing it
                // would stall on the draw lock and `resumeResize` would
                // never fire, freezing the layout mid-mutation. (Mirrors
                // the old workspace's `if (!plugin_box) continue`.)
                if let Some(panel) = workspace.panel(&PanelId::from(name.as_str()))
                    && panel.renderer.is_plugin_activated().unwrap_or(false)
                    && let Some(plugin) = panel.renderer.active_plugin()
                {
                    let plugin_el = plugin.unchecked_ref::<web_sys::Element>();
                    let frame = layout
                        .unchecked_ref::<web_sys::Element>()
                        .query_selector(&format!("regular-layout-frame[name=\"{name}\"]"))
                        .ok()
                        .flatten();
                    let chrome = frame
                        .as_ref()
                        .and_then(|frame| crate::tasks::plugin_chrome(frame, plugin_el));
                    last_chrome = chrome.or(last_chrome);
                    let (cw, ch) = last_chrome.unwrap_or(crate::tasks::CHROME_FALLBACK);
                    let width = (cell.width() - cw).max(0.0);
                    let height = (cell.height() - ch).max(0.0);
                    let (dx, dy) = frame
                        .as_ref()
                        .and_then(frame_track_origin)
                        .map(|(x, y)| (cell.left() - x, cell.top() - y))
                        .unwrap_or((0.0, 0.0));
                    targets.push((panel.renderer, dx, dy, width, height));

                    if let Some(tab) = viewer
                        .query_selector(&format!("perspective-viewer-tab[slot=\"tab-{name}\"]"))
                        .ok()
                        .flatten()
                    {
                        tab_targets.push((tab.unchecked_into::<web_sys::HtmlElement>(), dx, dy));
                    }
                }
            }

            let renderers = targets.iter().map(|(r, ..)| r.clone()).collect::<Vec<_>>();
            let tabs = tab_targets
                .iter()
                .map(|(t, ..)| t.clone())
                .collect::<Vec<_>>();
            for (tab, dx, dy) in &tab_targets {
                set_tab_presize(tab, *dx, *dy);
            }

            let presents = crate::tasks::staged_presents_with_deadline(
                workspace.effects().guard(),
                async move {
                    join_all(
                        targets
                            .iter()
                            .map(|(r, dx, dy, w, h)| r.presize_with_box(*dx, *dy, *w, *h)),
                    )
                    .await
                    .into_iter()
                    .filter_map(|r| r.ok().flatten())
                    .collect()
                },
                {
                    let renderers = renderers.clone();
                    let tabs = tabs.clone();
                    move || {
                        for renderer in &renderers {
                            let _ = renderer.clear_presize();
                        }

                        for tab in &tabs {
                            clear_tab_presize(tab);
                        }
                    }
                },
            )
            .await;

            for renderer in &renderers {
                renderer.clear_presize().unwrap_or_log();
            }

            for tab in &tabs {
                clear_tab_presize(tab);
            }

            presents.reveal();
            layout.resume_resize();
            Ok(())
        });

        false
    }
}
