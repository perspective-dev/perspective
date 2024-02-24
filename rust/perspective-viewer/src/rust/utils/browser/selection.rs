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

use perspective::utils::global;
use wasm_bindgen::JsCast;

use crate::*;

/// Utilities for caret position.  DOM elements have different APIs for this
/// but `Deref` makes them fall through, so it is important that this method
/// be called on the correct struct type!
pub trait CaretPosition {
    fn set_caret_position(&self, offset: usize) -> ApiResult<()>;
    fn get_caret_position(&self) -> Option<u32>;
}

impl CaretPosition for web_sys::HtmlElement {
    fn set_caret_position(&self, offset: usize) -> ApiResult<()> {
        let range = global::document().create_range()?;
        let selection = global::window().get_selection()?.into_apierror()?;
        range.set_start(self, offset as u32)?;
        range.collapse_with_to_start(true);
        selection.remove_all_ranges()?;
        selection.add_range(&range)?;
        Ok(())
    }

    fn get_caret_position(&self) -> Option<u32> {
        maybe! {
            let root = self.get_root_node().unchecked_into::<web_sys::Document>();
            let selection = root.get_selection()?.into_apierror()?;
            if selection.range_count() > 0 {
                let range = selection.get_range_at(0)?;
                range.end_offset()
            } else {
                Err(JsValue::UNDEFINED)
            }
        }
        .ok()
    }
}

impl CaretPosition for web_sys::HtmlTextAreaElement {
    fn set_caret_position(&self, offset: usize) -> ApiResult<()> {
        self.focus().unwrap();
        self.set_selection_end(Some(offset as u32))?;
        self.set_selection_start(Some(offset as u32))?;
        Ok(())
    }

    fn get_caret_position(&self) -> Option<u32> {
        self.selection_end().ok()?
    }
}
