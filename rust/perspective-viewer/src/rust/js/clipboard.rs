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

use std::future::Future;

use perspective_js::utils::global;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use super::mimetype::*;
use crate::*;

#[wasm_bindgen(inline_js = "
export function clipboard_write(mimetype, data) {
    if (!globalThis.ClipboardItem || !globalThis.navigator?.clipboard?.write) {
        throw new Error(\"Clipboard API unavailable\");
    }

    return navigator.clipboard.write([new ClipboardItem({ [mimetype]: data })]);
}
")]
extern "C" {
    #[wasm_bindgen(catch)]
    fn clipboard_write(mimetype: &str, data: &js_sys::Promise) -> Result<js_sys::Promise, JsValue>;
}

pub async fn paste_from_clipboard() -> Option<String> {
    JsFuture::from(global::navigator().clipboard().read_text())
        .await
        .ok()
        .and_then(|x| x.as_string())
}

/// Starts writing `blob`'s eventual result to the clipboard as `mimetype`, so
/// it must be called synchronously from within a user gesture.
pub fn copy_to_clipboard(
    blob: impl Future<Output = ApiResult<web_sys::Blob>> + 'static,
    mimetype: MimeType,
) -> impl Future<Output = ApiResult<()>> + 'static {
    let blob = js_sys::Promise::from(ApiFuture::new(blob));
    let exported = JsFuture::from(blob.clone());
    let written = clipboard_write(&mimetype.to_string(), &blob).map(JsFuture::from);
    async move {
        let written = written?;
        exported.await?;
        written.await?;
        Ok(())
    }
}
