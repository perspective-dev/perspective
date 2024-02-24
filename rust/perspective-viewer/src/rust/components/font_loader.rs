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

use std::cell::{Cell, Ref, RefCell};
use std::future::Future;
use std::iter::{repeat_with, Iterator};
use std::rc::Rc;

use futures::future::{join_all, select_all};
use perspective::utils::{global, *};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use yew::prelude::*;

use crate::utils::*;

const FONT_DOWNLOAD_TIMEOUT_MS: i32 = 1000;

/// This test string is injected into the DOM with the target `font-family`
/// applied. It is important for this string to contain the correct unicode
/// range, as otherwise the browser may download the latin-only variant of the
/// font which will later be invalidated.
const FONT_TEST_SAMPLE: &str = "ABCDΔ";

/// `state` is private to force construction of props with the `::new()` static
/// method, which initializes the async `load_fonts_task()` method.
#[derive(Clone, Properties)]
pub struct FontLoaderProps {
    state: Rc<FontLoaderState>,
}

impl PartialEq for FontLoaderProps {
    fn eq(&self, _rhs: &Self) -> bool {
        false
    }
}

/// The `FontLoader` component ensures that fonts are loaded before they are
/// visible.
pub struct FontLoader {}

impl Component for FontLoader {
    type Message = ();
    type Properties = FontLoaderProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {}
    }

    fn update(&mut self, _ctx: &Context<Self>, _msg: ()) -> bool {
        false
    }

    fn view(&self, ctx: &Context<Self>) -> yew::virtual_dom::VNode {
        if matches!(ctx.props().get_status(), FontLoaderStatus::Finished) {
            html! {}
        } else {
            let inner = ctx
                .props()
                .get_fonts()
                .iter()
                .map(font_test_html)
                .collect::<Html>();

            html! { <><style>{ ":host{opacity:0!important;}" }</style>{ inner }</> }
        }
    }
}

/// The possible font loading state, which proceeds from top to bottom once per
/// `<perspective-viewer>` element.
#[derive(Clone, Copy)]
pub enum FontLoaderStatus {
    Uninitialized,
    Loading,
    Finished,
}

type PromiseSet = Vec<ApiFuture<JsValue>>;

pub struct FontLoaderState {
    status: Cell<FontLoaderStatus>,
    elem: web_sys::HtmlElement,
    on_update: Callback<()>,
    fonts: RefCell<Vec<(String, String)>>,
}

impl FontLoaderProps {
    pub fn new(elem: &web_sys::HtmlElement, on_update: Callback<()>) -> Self {
        let inner = FontLoaderState {
            status: Cell::new(FontLoaderStatus::Uninitialized),
            elem: elem.clone(),
            on_update,
            fonts: RefCell::new(vec![]),
        };

        let state = yew::props!(Self {
            state: Rc::new(inner)
        });

        ApiFuture::spawn(state.clone().load_fonts_task_safe());
        state
    }

    pub fn get_status(&self) -> FontLoaderStatus {
        self.state.status.get()
    }

    fn get_fonts(&self) -> Ref<Vec<(String, String)>> {
        self.state.fonts.borrow()
    }

    /// We only want errors in this task to warn, since they are not necessarily
    /// error conditions and mainly of interest to developers.
    async fn load_fonts_task_safe(self) -> ApiResult<JsValue> {
        if let Err(msg) = self.load_fonts_task().await {
            web_sys::console::warn_1(&msg.into());
        };

        Ok(JsValue::UNDEFINED)
    }

    /// Awaits loading of a required set of font/weight pairs, given an element
    /// with a CSS variable of the format:
    /// ```css
    /// perspective-viewer {
    ///     --preload-fonts: "Roboto Mono:200;Open Sans:300,400";
    /// }
    /// ```
    async fn load_fonts_task(self) -> ApiResult<JsValue> {
        await_dom_loaded().await?;
        let txt = global::window()
            .get_computed_style(&self.state.elem)?
            .unwrap()
            .get_property_value("--preload-fonts")?;

        let mut block_promises: PromiseSet = vec![];
        let preload_fonts = parse_fonts(&txt);
        *self.state.fonts.borrow_mut() = preload_fonts.clone();
        self.state.status.set(FontLoaderStatus::Loading);
        self.state.on_update.emit(());

        for (family, weight) in preload_fonts.iter() {
            let task = timeout_font_task(family, weight);
            let mut block_fonts: PromiseSet = vec![ApiFuture::new(task)];

            for entry in font_iter(global::document().fonts().values()) {
                let font_face = js_sys::Reflect::get(&entry, js_intern::js_intern!("value"))?
                    .dyn_into::<web_sys::FontFace>()?;

                // Safari always has to be "different".
                if family == &font_face.family().replace('"', "")
                    && (weight == &font_face.weight()
                        || (font_face.weight() == "normal" && weight == "400"))
                {
                    block_fonts.push(ApiFuture::new(async move {
                        Ok(JsFuture::from(font_face.loaded()?).await?)
                    }));
                }
            }

            let fut = async { select_all(block_fonts.into_iter()).await.0 };
            block_promises.push(ApiFuture::new(fut))
        }

        if block_promises.len() != preload_fonts.len() {
            web_sys::console::warn_1(&format!("Missing preload fonts {:?}", &preload_fonts).into());
        }

        let res = join_all(block_promises)
            .await
            .into_iter()
            .collect::<ApiResult<Vec<JsValue>>>()
            .map(|_| JsValue::UNDEFINED);

        self.state.status.set(FontLoaderStatus::Finished);
        self.state.on_update.emit(());
        res
    }
}

// An async task which times out.  Can be used to timeout an optional async task
// by combinging with `Promise::any`.
fn timeout_font_task(family: &str, weight: &str) -> impl Future<Output = ApiResult<JsValue>> {
    let timeout_msg = format!("Timeout awaiting font \"{}:{}\"", family, weight);
    async {
        set_timeout(FONT_DOWNLOAD_TIMEOUT_MS).await?;
        Err(timeout_msg.into())
    }
}

/// Generates a `<span>` for a specific font family and weight with `opacity:0`,
/// since not all of the fonts may be shown and when e.g. the settings panel is
/// closed, and this will defer font loading.
fn font_test_html((family, weight): &(String, String)) -> Html {
    let style = format!(
        "opacity:0;font-family:\"{}\";font-weight:{}",
        family, weight
    );

    html! { <span {style}>{ FONT_TEST_SAMPLE }</span> }
}

fn parse_font(txt: &str) -> Option<Vec<(String, String)>> {
    match *txt.trim().split(':').collect::<Vec<_>>().as_slice() {
        [family, weights] => Some(
            weights
                .split(',')
                .map(|weight| (family.to_owned(), weight.to_owned()))
                .collect::<Vec<_>>(),
        ),
        _ => None,
    }
}

/// Parse a `--preload-fonts` value into (Family, Weight) tuples.
fn parse_fonts(txt: &str) -> Vec<(String, String)> {
    let trim = txt.trim();
    let trim = if trim.len() > 2 {
        &trim[1..trim.len() - 1]
    } else {
        trim
    };

    trim.split(';')
        .filter_map(parse_font)
        .flatten()
        .collect::<Vec<_>>()
}

/// wasm_bindgen doesn't fully implement `FontFaceIterator`, but this is
/// basically how it would be implemented if it was.
fn font_iter(
    iter: web_sys::FontFaceSetIterator,
) -> impl Iterator<Item = web_sys::FontFaceSetIteratorResult> {
    repeat_with(move || iter.next())
        .filter_map(|x| x.ok())
        .take_while(|entry| {
            !js_sys::Reflect::get(entry, js_intern::js_intern!("done"))
                .unwrap()
                .as_bool()
                .unwrap()
        })
}
