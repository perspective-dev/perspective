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

use super::{ColumnLocator, ColumnSettingsTarget};

#[derive(Clone, PartialEq, Properties)]
pub struct AddExpressionButtonProps {
    // Fires when this button is clicked.
    pub on_open_expr_panel: Callback<ColumnSettingsTarget>,

    /// The column this butotn will open configuration for.
    pub selected_column: Option<ColumnLocator>,
}

/// `onmouseover` is triggered incorrectly on the `DragTarget` of a
/// drag/drop action after `DropEvent` has fired on the `DropTarget`,
/// causing brief hover effects where the mouse _was_ before the action
/// initiated. Various methods of correcting this were attempted, settling
/// on a manual `dragdrop-hover` class toggle, using the `.button()` property
/// to determine the mis-fired event.  This was determined experimentally -
/// according to my read of the spec, this is a bug in Chrome.
///
/// As a result there are 3 hover states `MouseEnter(true)`,
/// `MouseEnter(false)`, and `MouseLeave`;  `MouseEnter(false)` can be
/// replaced, but it causes an extra render of the DOM un-necessarily.
#[function_component]
pub fn AddExpressionButton(p: &AddExpressionButtonProps) -> Html {
    let is_mouseover = yew::use_state_eq(|| false);
    let onmouseover = yew::use_callback(is_mouseover.setter(), |event: MouseEvent, mo| {
        mo.set(event.button() == 0);
    });

    let onmouseout = yew::use_callback(is_mouseover.setter(), |_event, mo| {
        mo.set(false);
    });

    let onmousedown = p
        .on_open_expr_panel
        .reform(|_| ColumnSettingsTarget::NewExpression);

    let class = if *is_mouseover || matches!(p.selected_column, Some(ColumnLocator::NewExpression))
    {
        classes!("dragdrop-hover")
    } else {
        classes!()
    };

    html! {
        <div id="add-expression" data-index="-1" {class} {onmouseover} {onmouseout} {onmousedown}>
            <span class="icon" />
            <span id="add-expression-button" />
        </div>
    }
}
