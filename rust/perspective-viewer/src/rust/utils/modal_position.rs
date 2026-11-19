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

use perspective_js::utils::global;
use web_sys::*;

/// The gap a size-limited modal keeps from the viewport's edge, in pixels.
const VIEWPORT_PADDING: f64 = 8.0;

/// Which edge of its anchor a modal opens from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModalSide {
    /// Under the anchor and aligned to its left edge, as a menu opens from
    /// its invoker or the cursor.
    Below,

    /// Right of the anchor and aligned to its top edge, as a flyout opens
    /// from its row.
    Beside,
}

/// A rectangle in viewport coordinates.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bounds {
    pub top: f64,
    pub left: f64,
    pub bottom: f64,
    pub right: f64,
}

impl From<&DomRect> for Bounds {
    fn from(rect: &DomRect) -> Self {
        Self {
            top: rect.top(),
            left: rect.left(),
            bottom: rect.bottom(),
            right: rect.right(),
        }
    }
}

/// Where a modal goes, and the size limits it needs to stay in the viewport.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ModalPlacement {
    pub top: f64,
    pub left: f64,
    pub max_height: Option<f64>,
    pub max_width: Option<f64>,
    pub flipped_vertical: bool,
}

struct Axis {
    offset: f64,
    limit: Option<f64>,
    flipped: bool,
}

fn place_axis(start: f64, end: f64, size: f64, extent: f64) -> Axis {
    let start = start.clamp(0.0, extent);
    let end = end.clamp(0.0, extent);
    if start + size <= extent {
        Axis {
            offset: start,
            limit: None,
            flipped: false,
        }
    } else if end - size >= 0.0 {
        Axis {
            offset: end - size,
            limit: None,
            flipped: true,
        }
    } else if extent - start >= end {
        Axis {
            offset: start,
            limit: Some((extent - start - VIEWPORT_PADDING).max(0.0)),
            flipped: false,
        }
    } else {
        let limit = (end - VIEWPORT_PADDING).max(0.0);
        Axis {
            offset: end - limit,
            limit: Some(limit),
            flipped: true,
        }
    }
}

/// Place a modal of natural size `(width, height)` against `anchor` inside a
/// `(width, height)` viewport, limiting a dimension only when it fits on
/// neither side of the anchor.
pub fn place(
    anchor: &Bounds,
    size: (f64, f64),
    viewport: (f64, f64),
    side: ModalSide,
) -> ModalPlacement {
    let (horizontal, vertical) = match side {
        ModalSide::Below => (
            place_axis(anchor.left, anchor.right, size.0, viewport.0),
            place_axis(anchor.bottom - 1.0, anchor.top + 1.0, size.1, viewport.1),
        ),
        ModalSide::Beside => (
            place_axis(anchor.right, anchor.left, size.0, viewport.0),
            place_axis(anchor.top - 1.0, anchor.bottom + 1.0, size.1, viewport.1),
        ),
    };

    ModalPlacement {
        top: vertical.offset,
        left: horizontal.offset,
        max_height: vertical.limit,
        max_width: horizontal.limit,
        flipped_vertical: vertical.flipped,
    }
}

fn viewport_size() -> (f64, f64) {
    let root = global::document().document_element().unwrap();
    (root.client_width() as f64, root.client_height() as f64)
}

fn natural_size(elem: &HtmlElement) -> (f64, f64) {
    let rect = elem.get_bounding_client_rect();
    (rect.width(), rect.height())
}

fn chrome_size(elem: &HtmlElement) -> (f64, f64) {
    let Ok(Some(style)) = global::window().get_computed_style(elem) else {
        return (0.0, 0.0);
    };

    if style.get_property_value("box-sizing").as_deref() == Ok("border-box") {
        return (0.0, 0.0);
    }

    let px = |name: &str| {
        style
            .get_property_value(name)
            .ok()
            .and_then(|value| value.trim_end_matches("px").parse::<f64>().ok())
            .unwrap_or_default()
    };

    (
        px("padding-left")
            + px("padding-right")
            + px("border-left-width")
            + px("border-right-width"),
        px("padding-top")
            + px("padding-bottom")
            + px("border-top-width")
            + px("border-bottom-width"),
    )
}

fn set_limit(style: &CssStyleDeclaration, dimension: &str, overflow: &str, limit: Option<f64>) {
    match limit {
        Some(limit) => {
            let _ = style.set_property(dimension, &format!("{}px", limit.max(0.0)));
            let _ = style.set_property(overflow, "auto");
        },
        None => {
            let _ = style.remove_property(dimension);
            let _ = style.remove_property(overflow);
        },
    }
}

/// Measure the natural size of the `position: fixed` element `elem`, place it
/// against `anchor`, and write its offsets and any size limits inline.
pub fn apply_placement(elem: &HtmlElement, anchor: &Bounds, side: ModalSide) -> ModalPlacement {
    let style = elem.style();
    let scroll = (elem.scroll_top(), elem.scroll_left());
    set_limit(&style, "max-height", "overflow-y", None);
    set_limit(&style, "max-width", "overflow-x", None);
    let _ = style.set_property("top", "0px");
    let _ = style.set_property("left", "0px");
    let viewport = viewport_size();
    let size = natural_size(elem);
    let chrome = chrome_size(elem);
    let mut placement = place(anchor, size, viewport, side);
    let max_height = placement.max_height.map(|limit| limit - chrome.1);
    if max_height.is_some() {
        set_limit(&style, "max-height", "overflow-y", max_height);
        let width = natural_size(elem).0;
        placement = place(anchor, (width, size.1), viewport, side);
    }

    let max_width = placement.max_width.map(|limit| limit - chrome.0);
    set_limit(&style, "max-height", "overflow-y", max_height);
    set_limit(&style, "max-width", "overflow-x", max_width);
    let _ = style.set_property("top", &format!("{}px", placement.top));
    let _ = style.set_property("left", &format!("{}px", placement.left));
    elem.set_scroll_top(scroll.0);
    elem.set_scroll_left(scroll.1);
    placement
}
