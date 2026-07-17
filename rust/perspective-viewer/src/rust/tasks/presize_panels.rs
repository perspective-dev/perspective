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

//! Presize/resize sweeps over the [`Workspace`]'s visible panels, plus the DOM
//! geometry measurements they (and `MainPanel`'s `before-resize` presize)
//! depend on. These implement the presize-everywhere architecture: every
//! geometry change renders each plugin at its *target* box before the layout
//! commits, so content never lags its container.

use futures::channel::oneshot::channel;
use futures::future::join_all;
use perspective_js::utils::*;
use wasm_bindgen::JsCast;

use crate::workspace::Workspace;

/// Resize every *visible* panel's plugin to its current cell box, concurrently.
/// Used after a layout change that does NOT emit `regular-layout-before-resize`
/// — settings-panel toggle (the outer SplitPanel) and maximize/minimize — so
/// the per-panel `ResizeObserver` (now scoped to drags) isn't needed to catch
/// them. Hidden panels (e.g. an unselected stacked tab → null `offset_parent`)
/// are skipped; they resize when revealed. `resize()` debounces per renderer.
pub async fn resize_visible_panels(workspace: &Workspace) {
    let panels = workspace
        .panel_ids()
        .into_iter()
        .filter_map(|id| {
            let panel = workspace.panel(&id)?;
            let plugin = panel.renderer.active_plugin()?;
            let el = plugin.unchecked_ref::<web_sys::HtmlElement>();
            // `offset_parent` is `None` for a `display:none` cell.
            el.offset_parent().map(|_| panel)
        })
        .collect::<Vec<_>>();

    join_all(panels.iter().map(|p| p.renderer.resize())).await;
}

/// The `(width, height)` factors each plugin's cell grows by when the settings
/// pane collapses. The plugin area (`#main_panel_container`) grows to the full
/// `#layout_area` width (the side settings pane is gone) AND to the full
/// `#main_column` height — because the status bar switches to
/// `position:absolute` when settings closes (see `status-bar.css`) and no
/// longer consumes column height. Each factor defaults to `1.0` if it can't be
/// measured.
fn settings_close_grow_ratios(elem: &web_sys::HtmlElement) -> (f64, f64) {
    let measure = |sel: &str| -> Option<web_sys::DomRect> {
        elem.shadow_root()?
            .query_selector(sel)
            .ok()?
            .map(|e| e.get_bounding_client_rect())
    };

    fn ratio(full: Option<f64>, current: Option<f64>) -> f64 {
        match (full, current) {
            (Some(f), Some(c)) if c > 0.0 && f > c => f / c,
            _ => 1.0,
        }
    }

    let mpc = measure("#main_panel_container");
    let width = ratio(
        measure("#layout_area").map(|r| r.width()),
        mpc.as_ref().map(|r| r.width()),
    );
    let height = ratio(
        measure("#main_column").map(|r| r.height()),
        mpc.as_ref().map(|r| r.height()),
    );
    (width, height)
}

/// Pre-size each visible plugin to its GROWN post-close cell *before* the
/// settings pane collapses, so the pane collapses into an already-correct
/// plugin — one clean resize instead of grow-then-resize. The cell grows in
/// BOTH width (the side settings pane is gone) and height (the status bar goes
/// floating).
pub async fn presize_visible_panels_grown(workspace: &Workspace, elem: &web_sys::HtmlElement) {
    let (width_ratio, height_ratio) = settings_close_grow_ratios(elem);
    presize_visible_panels_scaled(workspace, elem, width_ratio, height_ratio).await
}

/// Pre-size each visible plugin to its SHRUNK post-open cell *before* the
/// settings pane mounts (P2), using the open-state geometry deltas cached at
/// the last close (`(layout_area.w − mpc.w, main_column.h − mpc.h)` — the pane
/// and divider width and the docked status-bar height, both stable across a
/// close/open cycle since the pane width persists in the override).
pub async fn presize_visible_panels_open(
    workspace: &Workspace,
    elem: &web_sys::HtmlElement,
    delta_w: f64,
    delta_h: f64,
) {
    let Some(mpc) = shadow_rect(elem, "#main_panel_container") else {
        return;
    };

    let (mpc_w0, mpc_h0) = (mpc.width(), mpc.height());
    if mpc_w0 <= 0.0 || mpc_h0 <= 0.0 {
        return;
    }

    let width_ratio = (mpc_w0 - delta_w) / mpc_w0;
    let height_ratio = (mpc_h0 - delta_h) / mpc_h0;
    presize_visible_panels_scaled(workspace, elem, width_ratio, height_ratio).await
}

/// Pre-size each visible plugin for a proposed settings-pane width (P1, the
/// deferred divider's pump). The grid distributes width proportionally, so the
/// target cells scale by the container's width ratio, derived arithmetically:
/// `mpc₁ = mpc₀ + (pane₀ − pane₁)`. Height is unaffected by the divider.
pub async fn presize_visible_panels_pane_width(
    workspace: &Workspace,
    elem: &web_sys::HtmlElement,
    pane_width: f64,
) {
    let Some(mpc) = shadow_rect(elem, "#main_panel_container") else {
        return;
    };

    let Some(pane) = shadow_rect(elem, "#app_panel > .split-panel-child") else {
        return;
    };

    let mpc_w0 = mpc.width();
    if mpc_w0 <= 0.0 {
        return;
    }

    let width_ratio = (mpc_w0 + (pane.width() - pane_width)) / mpc_w0;
    presize_visible_panels_scaled(workspace, elem, width_ratio, 1.0).await
}

/// Shared presize core: render every visible plugin at its current cell box
/// scaled by `(width_ratio, height_ratio)` (track space), before the container
/// change those ratios anticipate.
async fn presize_visible_panels_scaled(
    workspace: &Workspace,
    elem: &web_sys::HtmlElement,
    width_ratio: f64,
    height_ratio: f64,
) {
    if !width_ratio.is_finite()
        || !height_ratio.is_finite()
        || width_ratio <= 0.0
        || height_ratio <= 0.0
    {
        return;
    }

    let mut last_chrome: Option<(f64, f64)> = None;
    let targets = workspace
        .panel_ids()
        .into_iter()
        .filter_map(|id| {
            let panel = workspace.panel(&id)?;
            let plugin = panel.renderer.active_plugin()?;
            let el = plugin.unchecked_ref::<web_sys::Element>();
            el.unchecked_ref::<web_sys::HtmlElement>().offset_parent()?; // skip hidden
            let plugin_box = el.get_bounding_client_rect();
            let chrome = elem
                .shadow_root()
                .and_then(|r| {
                    r.query_selector(&format!("regular-layout-frame[name=\"{}\"]", id.as_str()))
                        .ok()
                        .flatten()
                })
                .and_then(|frame| plugin_chrome(&frame, el));

            last_chrome = chrome.or(last_chrome);
            let (cw, ch) = last_chrome.unwrap_or((8.0, 33.0));
            let w = ((plugin_box.width() + cw) * width_ratio - cw).max(0.0);
            let h = ((plugin_box.height() + ch) * height_ratio - ch).max(0.0);
            Some((panel, w, h))
        })
        .collect::<Vec<_>>();

    let (done, on_done) = channel::<()>();
    ApiFuture::spawn(async move {
        join_all(
            targets
                .iter()
                .map(|(p, w, h)| p.renderer.resize_with_dimensions(*w, *h)),
        )
        .await;

        let _ = done.send(());
        Ok(())
    });

    let deadline = crate::utils::set_timeout(500);
    let _ = futures::future::select(Box::pin(on_done), Box::pin(deadline)).await;
}

/// Measure a shadow-DOM descendant's border-box rect.
fn shadow_rect(elem: &web_sys::HtmlElement, sel: &str) -> Option<web_sys::DomRect> {
    Some(
        elem.shadow_root()?
            .query_selector(sel)
            .ok()??
            .get_bounding_client_rect(),
    )
}

/// The open-state geometry deltas cached for the next settings *open* (P2):
/// `(layout_area.w − mpc.w, main_column.h − mpc.h)`. Only meaningful while the
/// settings pane is open (i.e. measured at close time).
pub fn measure_settings_open_deltas(elem: &web_sys::HtmlElement) -> Option<(f64, f64)> {
    let mpc = shadow_rect(elem, "#main_panel_container")?;
    let layout_area = shadow_rect(elem, "#layout_area")?;
    let main_column = shadow_rect(elem, "#main_column")?;
    Some((
        (layout_area.width() - mpc.width()).max(0.0),
        (main_column.height() - mpc.height()).max(0.0),
    ))
}

/// The frame chrome a plugin's grid cell has that the plugin itself doesn't
/// occupy, as `(width, height)` px: margin + border + titlebar. Measured live
/// from a `regular-layout-frame` and its plugin — robust to theme/CSS changes —
/// rather than hardcoded constants. `real_coordinates` reports the grid TRACK,
/// which equals the frame's *margin box* (`getBoundingClientRect` + margins);
/// the plugin fills the frame's container below its titlebar, so `track −
/// plugin` is exactly the chrome. Returns `None` if it can't be measured.
pub fn plugin_chrome(frame: &web_sys::Element, plugin: &web_sys::Element) -> Option<(f64, f64)> {
    let style = web_sys::window()?.get_computed_style(frame).ok()??;
    let px = |prop: &str| {
        style
            .get_property_value(prop)
            .ok()
            .and_then(|v| v.trim().trim_end_matches("px").parse::<f64>().ok())
            .unwrap_or(0.0)
    };
    let frame_box = frame.get_bounding_client_rect();
    let plugin_box = plugin.get_bounding_client_rect();
    let width = frame_box.width() + px("margin-left") + px("margin-right") - plugin_box.width();
    let height = frame_box.height() + px("margin-top") + px("margin-bottom") - plugin_box.height();
    Some((width.max(0.0), height.max(0.0)))
}

/// The current screen origin of a frame's grid TRACK (its margin box — the
/// coordinate space `real_coordinates` reports), measured live from the frame.
/// `target_track − current_track` is the presize translate delta: the plugin's
/// offset *within* its track is constant across a layout transition, so the
/// track delta is exactly the plugin delta (see `Renderer::presize_with_box`).
pub fn frame_track_origin(frame: &web_sys::Element) -> Option<(f64, f64)> {
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
