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

use super::ColumnSettingsTarget;

#[derive(PartialEq, Clone, Properties)]
pub struct ExprEditButtonProps {
    /// Column name.
    pub name: String,

    /// Is this an expression column?
    pub is_expression: bool,

    /// Is this a window column?
    #[prop_or_default]
    pub is_window: bool,

    /// Fires when the config/expresison button is clicked.
    pub on_open_expr_panel: Callback<ColumnSettingsTarget>,

    /// Is the expression/config panel open?
    pub is_editing: bool,

    /// Is the expression/config panel enabled? If not, show an invisible
    /// square in the same dimensions (so the layout does not jump around).
    pub is_disabled: bool,
}

/// A button that goes into a column-list for a custom expression
/// when pressed, it opens up the expression editor side-panel.
#[function_component]
pub fn ExprEditButton(p: &ExprEditButtonProps) -> Html {
    let onmousedown = yew::use_callback(p.clone(), |_, p| {
        p.on_open_expr_panel
            .emit(ColumnSettingsTarget::Column(p.name.clone()))
    });

    let class = if p.is_disabled {
        "expression-edit-button disabled"
    } else if p.is_editing {
        "expression-edit-button is-editing"
    } else {
        "expression-edit-button"
    };

    html! { <span {onmousedown} {class}><span class="icon" /></span> }
}
