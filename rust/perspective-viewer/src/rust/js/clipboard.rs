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

use std::cell::RefCell;
use std::future::Future;
use std::rc::Rc;

use perspective::utils::global;
use perspective_client::clone;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use super::mimetype::*;
use crate::js::clipboard_item::*;
use crate::*;

/// Copy a `JsPerspectiveView` to the clipboard as a CSV.
pub fn copy_to_clipboard(
    view: impl Future<Output = Result<web_sys::Blob, ApiError>>,
    mimetype: MimeType,
) -> impl Future<Output = ApiResult<()>> {
    let js_ref: Rc<RefCell<Option<web_sys::Blob>>> = Rc::new(RefCell::new(None));
    poll(0, mimetype, js_ref.clone()).unwrap();
    async move {
        let js_val = view.await?;
        *js_ref.borrow_mut() = Some(js_val);
        Ok(())
    }
}

/// This method must be called from an event handler, subject to the browser's
/// restrictions on clipboard access.  See
/// [ws](https://www.w3.org/TR/clipboard-apis/#allow-read-clipboard).
fn poll(
    count: u32,
    mimetype: MimeType,
    js_ref: Rc<RefCell<Option<web_sys::Blob>>>,
) -> ApiResult<()> {
    if let Some(js_val) = js_ref.borrow().as_ref() {
        let options = js_sys::Object::new();
        js_sys::Reflect::set(&options, &mimetype.into(), js_val)?;
        let item = ClipboardItem::new(&options);
        let items = std::iter::once(item).collect::<js_sys::Array>();
        let _promise = global::clipboard().write(&items.into());
    } else {
        clone!(js_ref);
        if count == 200 {
            tracing::warn!("Clipboard handler surpassed 10s");
        }

        let f: js_sys::Function =
            Closure::once(Box::new(move || poll(count + 1, mimetype, js_ref)))
                .into_js_value()
                .unchecked_into();

        global::window().set_timeout_with_callback_and_timeout_and_arguments_0(&f, 50)?;
    }

    Ok(())
}
