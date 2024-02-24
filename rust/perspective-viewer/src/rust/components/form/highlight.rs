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

use yew::prelude::*;

use crate::exprtk::{Cursor, Token};

/// Highlight a token if the cursor overlaps an error.  This is not a
/// `Component` because of the the lifetimes associated with `Cursor<'a>` etc.
/// This makes the performance assumption that naively re-rendering is faster
/// than allocating this data on the heap (plus a few copies), since virtually
/// any update to the `CodeEditor` component will be an update to the parsed
/// text.
///
/// TODO Validate this assumption with actual data.
pub fn highlight<'a>(cursor: &mut Cursor<'a>, token: Token<'a>, position: u32) -> Html {
    cursor.txt = token.content();
    let is_auto = cursor.is_autocomplete(position);
    let is_break = matches!(token, Token::Break(_));
    let is_overlap = cursor.is_error();
    let result = match (is_auto, is_overlap, is_break) {
        (true, true, false) => html! {
            <span ref={cursor.noderef.clone()} class="error_highlight">{ token }</span>
        },
        (false, true, false) => html! { <span class="error_highlight">{ token }</span> },
        (true, false, false) => html! { <span ref={cursor.noderef.clone()}>{ token }</span> },
        _ => token.to_html(),
    };

    if is_auto && matches!(token, Token::Symbol(_)) {
        cursor.auto = Some(token.content().to_owned());
    }

    if matches!(token, Token::Break(_)) {
        cursor.increment_line();
    } else {
        cursor.increment_column(token.content().len() as u32);
    }

    result
}
