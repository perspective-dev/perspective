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

//! Associates a single, build-time CSS bundle with a `yew::Component` tree
//! rendered into a Custom Element's `ShadowRoot`.
//!
//! Each `src/css` file is inlined and minified by `lightningcss` (see
//! `build.rs` + the `_viewer_bundle.css` and per-popup `_column_dropdown.css`
//! / `_filter_dropdown.css` / `_function_dropdown.css` / `_dropdown_menu.css`
//! entrypoints) into one stylesheet per "surface". A `<StyleProvider>` at the
//! root of a shadow tree adopts its surface's stylesheet exactly once;
//! constructed `CSSStyleSheet`s are cheap and shared across every viewer
//! instance.
//!
//! # Example
//!
//! ```ignore
//! html! {
//!     <StyleProvider root={host} surface={StyleSurface::Viewer}>
//!         <h1>{ "I am styled!" }</h1>
//!     </StyleProvider>
//! }
//! ```

mod style_provider;

pub use style_provider::{StyleProvider, StyleSurface};

/// The viewer-surface bundle: every `src/css` file except the floating-popup
/// sheets. Adopted into the `<perspective-viewer>` ShadowRoot.
fn viewer_bundle() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/css/_viewer_bundle.css"))
}

/// Per-popup-surface bundles. Each floating popup root adopts exactly its own
/// self-contained sheet (mirroring the pre-bundle behavior where every popup
/// instance carried only its own CSS) so the four popup styles never collide —
/// in particular `column-dropdown.css`'s `!important` inverted rules stay
/// confined to the column-name completion dropdown.
fn column_dropdown_bundle() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/css/_column_dropdown.css"))
}
fn filter_dropdown_bundle() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/css/_filter_dropdown.css"))
}
fn function_dropdown_bundle() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/css/_function_dropdown.css"))
}
fn dropdown_menu_bundle() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/css/_dropdown_menu.css"))
}
fn context_menu_bundle() -> &'static str {
    include_str!(concat!(env!("OUT_DIR"), "/css/_context_menu.css"))
}

thread_local! {
    static VIEWER_SHEET: web_sys::CssStyleSheet = make_sheet(viewer_bundle());
    static COLUMN_DROPDOWN_SHEET: web_sys::CssStyleSheet = make_sheet(column_dropdown_bundle());
    static FILTER_DROPDOWN_SHEET: web_sys::CssStyleSheet = make_sheet(filter_dropdown_bundle());
    static FUNCTION_DROPDOWN_SHEET: web_sys::CssStyleSheet = make_sheet(function_dropdown_bundle());
    static DROPDOWN_MENU_SHEET: web_sys::CssStyleSheet = make_sheet(dropdown_menu_bundle());
    static CONTEXT_MENU_SHEET: web_sys::CssStyleSheet = make_sheet(context_menu_bundle());
}

fn make_sheet(css: &str) -> web_sys::CssStyleSheet {
    let sheet = web_sys::CssStyleSheet::new().unwrap();
    sheet.replace_sync(css).unwrap();
    sheet
}

/// The memoized, shared `CSSStyleSheet` for a given [`StyleSurface`].
pub(crate) fn surface_sheet(surface: StyleSurface) -> web_sys::CssStyleSheet {
    match surface {
        StyleSurface::Viewer => VIEWER_SHEET.with(|x| x.clone()),
        StyleSurface::ColumnDropdown => COLUMN_DROPDOWN_SHEET.with(|x| x.clone()),
        StyleSurface::FilterDropdown => FILTER_DROPDOWN_SHEET.with(|x| x.clone()),
        StyleSurface::FunctionDropdown => FUNCTION_DROPDOWN_SHEET.with(|x| x.clone()),
        StyleSurface::DropdownMenu => DROPDOWN_MENU_SHEET.with(|x| x.clone()),
        StyleSurface::ContextMenu => CONTEXT_MENU_SHEET.with(|x| x.clone()),
    }
}
