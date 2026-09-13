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

//! Page-global Local Font Access state shared by every `Font`
//! control on the page: the `local-fonts` permission, the enumerated
//! family list once granted, and a measured web-safe fallback list
//! otherwise.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use perspective_js::utils::global;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use yew::Callback;

use super::{PubSub, Subscription};

/// CSS generic families always offered first, in this order.
pub const GENERIC_FONT_FAMILIES: [&str; 5] =
    ["inherit", "monospace", "sans-serif", "serif", "system-ui"];

const FALLBACK_FONT_FAMILIES: [&str; 28] = [
    "Arial",
    "Arial Black",
    "Calibri",
    "Cambria",
    "Comic Sans MS",
    "Consolas",
    "Courier New",
    "DejaVu Sans",
    "DejaVu Serif",
    "Georgia",
    "Helvetica",
    "Helvetica Neue",
    "Impact",
    "Liberation Sans",
    "Liberation Serif",
    "Lucida Console",
    "Menlo",
    "Monaco",
    "Noto Sans",
    "Noto Serif",
    "Roboto",
    "SF Mono",
    "Segoe UI",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Ubuntu",
    "Verdana",
];

const FONT_TEST_SAMPLE: &str = "mmmmmmmmmmlli ABCDΔ 0123";
const FONT_TEST_BASELINES: [&str; 3] = ["monospace", "sans-serif", "serif"];

/// The `local-fonts` permission as last observed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LocalFontsAccess {
    /// No `window.queryLocalFonts` (non-Chromium, or insecure context).
    Unsupported,
    Prompt,
    Granted,
    Denied,
}

#[derive(Default)]
struct LocalFontsState {
    access: Cell<Option<LocalFontsAccess>>,
    probing: Cell<bool>,
    families: RefCell<Option<Rc<Vec<String>>>>,
    fallback: RefCell<Option<Rc<Vec<String>>>>,
    on_status_change: RefCell<Option<Closure<dyn Fn()>>>,
    changed: PubSub<()>,
}

thread_local! {
    static STATE: LocalFontsState = LocalFontsState::default();
}

/// The permission state, or `None` before [`probe_local_fonts_access`]
/// has resolved.
pub fn local_fonts_access() -> Option<LocalFontsAccess> {
    STATE.with(|s| s.access.get())
}

/// Subscribe to any change in access state or family list.
pub fn on_local_fonts_changed(cb: Callback<()>) -> Subscription {
    STATE.with(|s| s.changed.add_notify_listener(&cb))
}

/// The options a `Font` control offers for `current`: the generic
/// keywords, then the enumerated families when granted (and non-empty) or
/// the measured fallback otherwise, then `current` itself if absent.
pub fn font_family_options(current: &str) -> Vec<String> {
    let installed = STATE.with(|s| {
        let enumerated = match s.access.get() {
            Some(LocalFontsAccess::Granted) => s.families.borrow().clone(),
            _ => None,
        };

        match enumerated {
            Some(families) if !families.is_empty() => families,
            _ => fallback_families(s),
        }
    });

    compose_font_family_options(current, &installed)
}

fn compose_font_family_options(current: &str, installed: &[String]) -> Vec<String> {
    let mut out: Vec<String> = GENERIC_FONT_FAMILIES
        .iter()
        .map(|x| (*x).to_owned())
        .collect();

    out.extend(installed.iter().cloned());
    if !out.iter().any(|x| x == current) {
        out.push(current.to_owned());
    }

    out
}

/// Resolve the permission state once, without ever showing a prompt.
pub fn probe_local_fonts_access() {
    let already = STATE.with(|s| s.access.get().is_some() || s.probing.replace(true));
    if already {
        return;
    }

    if query_local_fonts_fn().is_none() {
        set_access(LocalFontsAccess::Unsupported);
        return;
    }

    wasm_bindgen_futures::spawn_local(async move {
        match query_permission_status().await {
            Some(status) => {
                install_status_listener(&status);
                let access = access_of_status(&status);
                set_access(access);
                if access == LocalFontsAccess::Granted {
                    load_families().await;
                }
            },
            None => match call_query_local_fonts() {
                Some(promise) => match families_from(promise).await {
                    Some(families) => set_granted(families),
                    None => set_access(LocalFontsAccess::Prompt),
                },
                None => set_access(LocalFontsAccess::Unsupported),
            },
        }
    });
}

/// Ask the browser for local fonts, synchronously from a user-gesture handler
/// so `queryLocalFonts()` may prompt.
pub fn request_local_fonts_access() {
    let Some(promise) = call_query_local_fonts() else {
        set_access(LocalFontsAccess::Unsupported);
        return;
    };

    wasm_bindgen_futures::spawn_local(async move {
        match families_from(promise).await {
            Some(families) => set_granted(families),
            None => {
                let access = match query_permission_status().await {
                    Some(status) => access_of_status(&status),
                    None => LocalFontsAccess::Prompt,
                };

                set_access(access);
            },
        }
    });
}

fn set_access(access: LocalFontsAccess) {
    STATE.with(|s| {
        s.probing.set(false);
        let prev = s.access.replace(Some(access));
        if access != LocalFontsAccess::Granted {
            s.families.borrow_mut().take();
        }

        if prev != Some(access) {
            s.changed.emit(());
        }
    });
}

fn set_granted(families: Vec<String>) {
    STATE.with(|s| {
        s.probing.set(false);
        s.access.set(Some(LocalFontsAccess::Granted));
        *s.families.borrow_mut() = Some(Rc::new(families));
        s.changed.emit(());
    });
}

async fn load_families() {
    if let Some(promise) = call_query_local_fonts()
        && let Some(families) = families_from(promise).await
    {
        set_granted(families);
    }
}

fn query_local_fonts_fn() -> Option<js_sys::Function> {
    js_sys::Reflect::get(&global::window(), &JsValue::from_str("queryLocalFonts"))
        .ok()?
        .dyn_into::<js_sys::Function>()
        .ok()
}

fn call_query_local_fonts() -> Option<js_sys::Promise> {
    query_local_fonts_fn()?
        .call0(&global::window())
        .ok()?
        .dyn_into::<js_sys::Promise>()
        .ok()
}

/// The enumerated families, or `None` when the call yielded none, which
/// Chromium resolves in place of rejecting a dismissed or blocked prompt.
async fn families_from(promise: js_sys::Promise) -> Option<Vec<String>> {
    let fonts = JsFuture::from(promise).await.ok()?;
    let family_key = JsValue::from_str("family");
    let mut families: Vec<String> = js_sys::Array::from(&fonts)
        .iter()
        .filter_map(|font| js_sys::Reflect::get(&font, &family_key).ok()?.as_string())
        .collect();

    families.sort_unstable();
    families.dedup();
    (!families.is_empty()).then_some(families)
}

async fn query_permission_status() -> Option<JsValue> {
    let navigator: JsValue = global::window().navigator().into();
    let permissions = js_sys::Reflect::get(&navigator, &JsValue::from_str("permissions")).ok()?;
    let query = js_sys::Reflect::get(&permissions, &JsValue::from_str("query"))
        .ok()?
        .dyn_into::<js_sys::Function>()
        .ok()?;

    let descriptor = js_sys::Object::new();
    js_sys::Reflect::set(
        &descriptor,
        &JsValue::from_str("name"),
        &JsValue::from_str("local-fonts"),
    )
    .ok()?;

    let promise = query
        .call1(&permissions, &descriptor)
        .ok()?
        .dyn_into::<js_sys::Promise>()
        .ok()?;

    let status = JsFuture::from(promise).await.ok()?;
    (!status.is_undefined() && !status.is_null()).then_some(status)
}

fn access_of_status(status: &JsValue) -> LocalFontsAccess {
    let state = js_sys::Reflect::get(status, &JsValue::from_str("state"))
        .ok()
        .and_then(|x| x.as_string());

    match state.as_deref() {
        Some("granted") => LocalFontsAccess::Granted,
        Some("denied") => LocalFontsAccess::Denied,
        _ => LocalFontsAccess::Prompt,
    }
}

fn install_status_listener(status: &JsValue) {
    let target = status.clone();
    let closure = Closure::<dyn Fn()>::new(move || {
        let access = access_of_status(&target);
        set_access(access);
        if access == LocalFontsAccess::Granted {
            wasm_bindgen_futures::spawn_local(load_families());
        }
    });

    let _ = js_sys::Reflect::set(
        status,
        &JsValue::from_str("onchange"),
        closure.as_ref().unchecked_ref(),
    );

    STATE.with(|s| *s.on_status_change.borrow_mut() = Some(closure));
}

fn fallback_families(state: &LocalFontsState) -> Rc<Vec<String>> {
    state
        .fallback
        .borrow_mut()
        .get_or_insert_with(|| Rc::new(detect_fallback_families()))
        .clone()
}

/// The subset of [`FALLBACK_FONT_FAMILIES`] the browser can render,
/// detected by comparing rendered widths against the generic baselines.
fn detect_fallback_families() -> Vec<String> {
    let Some(ctx) = canvas_context() else {
        return vec![];
    };

    let baselines: Vec<f64> = FONT_TEST_BASELINES
        .iter()
        .map(|x| measure_width(&ctx, x))
        .collect();

    FALLBACK_FONT_FAMILIES
        .iter()
        .filter(|family| {
            FONT_TEST_BASELINES
                .iter()
                .zip(&baselines)
                .any(|(baseline, width)| {
                    measure_width(&ctx, &format!("\"{family}\", {baseline}")) != *width
                })
        })
        .map(|x| (*x).to_owned())
        .collect()
}

fn canvas_context() -> Option<web_sys::CanvasRenderingContext2d> {
    global::document()
        .create_element("canvas")
        .ok()?
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .ok()?
        .get_context("2d")
        .ok()??
        .dyn_into::<web_sys::CanvasRenderingContext2d>()
        .ok()
}

fn measure_width(ctx: &web_sys::CanvasRenderingContext2d, family: &str) -> f64 {
    ctx.set_font(&format!("72px {family}"));
    ctx.measure_text(FONT_TEST_SAMPLE)
        .map(|x| x.width())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn owned(xs: &[&str]) -> Vec<String> {
        xs.iter().map(|x| (*x).to_owned()).collect()
    }

    #[test]
    fn generic_families_lead_and_current_appends_when_missing() {
        let options = compose_font_family_options("Zapf Chancery", &owned(&["Arial", "Menlo"]));
        assert_eq!(
            options,
            owned(&[
                "inherit",
                "monospace",
                "sans-serif",
                "serif",
                "system-ui",
                "Arial",
                "Menlo",
                "Zapf Chancery"
            ])
        );
    }

    #[test]
    fn current_is_not_duplicated() {
        let options = compose_font_family_options("Arial", &owned(&["Arial"]));
        assert_eq!(options.iter().filter(|x| *x == "Arial").count(), 1);

        let options = compose_font_family_options("inherit", &[]);
        assert_eq!(options, owned(&GENERIC_FONT_FAMILIES));
    }
}
