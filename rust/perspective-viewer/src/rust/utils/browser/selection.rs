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
use wasm_bindgen::JsCast;

use crate::*;

/// Utilities for caret position.  DOM elements have different APIs for this
/// but `Deref` makes them fall through, so it is important that this method
/// be called on the correct struct type!
pub trait CaretPosition {
    /// Select the entired clip
    fn select_all(&self) -> ApiResult<()>;

    /// Set the caret to a specific offset.
    fn set_caret_position(&self, offset: usize) -> ApiResult<()>;

    /// Get the caret's offset (if it has focus)
    fn get_caret_position(&self) -> Option<u32>;
}

impl CaretPosition for web_sys::HtmlElement {
    fn select_all(&self) -> ApiResult<()> {
        let range = global::document().create_range()?;
        let selection = global::window().get_selection()?.into_apierror()?;
        range.set_start(self, 0_u32)?;
        range.set_end(self, 10000000_u32)?;
        selection.remove_all_ranges()?;
        selection.add_range(&range)?;
        Ok(())
    }

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
        (|| -> ApiResult<u32> {
            let root = self.get_root_node().unchecked_into::<web_sys::Document>();
            let selection = root.get_selection()?.into_apierror()?;
            if selection.range_count() > 0 {
                let range = selection.get_range_at(0)?;
                Ok(range.end_offset()?)
            } else {
                Err(wasm_bindgen::JsValue::UNDEFINED.into())
            }
        })()
        .ok()
    }
}

impl CaretPosition for web_sys::HtmlTextAreaElement {
    fn select_all(&self) -> ApiResult<()> {
        self.set_selection_start(Some(0_u32))?;
        self.set_selection_end(Some(1000000000_u32))?;
        Ok(())
    }

    fn set_caret_position(&self, offset: usize) -> ApiResult<()> {
        self.set_selection_end(Some(offset as u32))?;
        self.set_selection_start(Some(offset as u32))?;
        Ok(())
    }

    fn get_caret_position(&self) -> Option<u32> {
        self.selection_end().ok()?
    }
}
