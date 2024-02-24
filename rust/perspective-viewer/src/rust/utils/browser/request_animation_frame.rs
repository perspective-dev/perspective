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

use ::futures::channel::oneshot::*;
use perspective::utils::{global, *};
use wasm_bindgen::prelude::*;

/// An `async` version of `queueMicrotask()`, curiously absent from [`web_sys`].
pub async fn await_queue_microtask() -> ApiResult<()> {
    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_name = Window)]
        type QMWindow;

        #[wasm_bindgen(catch, method, structural, js_class = "Window", js_name = queueMicrotask)]
        fn queue_microtask(this: &QMWindow, callback: &::js_sys::Function) -> Result<i32, JsValue>;
    }

    let (sender, receiver) = channel::<()>();
    let jsfun = Closure::once_into_js(move || sender.send(()).unwrap());
    js_sys::global()
        .dyn_into::<QMWindow>()
        .unwrap()
        .queue_microtask(jsfun.unchecked_ref())?;

    Ok(receiver.await?)
}

/// An `async` version of `requestAnimationFrame()`, which resolves on the next
/// animation frame.
pub async fn request_animation_frame() {
    let (sender, receiver) = channel::<()>();
    let jsfun = Closure::once_into_js(move || sender.send(()).unwrap());
    global::window()
        .request_animation_frame(jsfun.unchecked_ref())
        .unwrap();

    receiver.await.unwrap()
}

/// An `async` which awaits the browser's `load` event, which is automatically
/// bypassed if `document.readyState` indicates this has already occurred.
pub async fn await_dom_loaded() -> ApiResult<()> {
    let state = global::document().ready_state();
    if state == "complete" || state == "loaded" {
        Ok(())
    } else {
        let (sender, receiver) = channel::<()>();
        let jsfun = Closure::once_into_js(move || sender.send(()).unwrap());
        global::window().add_event_listener_with_callback("load", jsfun.unchecked_ref())?;
        Ok(receiver.await?)
    }
}

/// An `async` version of `set_timeout`, which resolves in `timeout`
/// milliseconds
pub async fn set_timeout(timeout: i32) -> ApiResult<()> {
    let (sender, receiver) = channel::<()>();
    let jsfun = Closure::once_into_js(move || {
        let _ = sender.send(());
    });

    global::window()
        .set_timeout_with_callback_and_timeout_and_arguments_0(jsfun.unchecked_ref(), timeout)?;

    Ok(receiver.await?)
}
